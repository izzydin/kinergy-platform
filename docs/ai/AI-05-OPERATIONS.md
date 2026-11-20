# AI-05: Embedding & Vector Indexing Operations Runbook

- **Document Identifier:** `AI-05-OPERATIONS`
- **Milestone:** AI-05.8 — Final Acceptance & Governance
- **Role:** Principal ML Infrastructure Engineer, DevOps Architect, and Site Reliability Engineer
- **Date:** 2026-11-20
- **Status:** **OPERATIONAL RUNBOOK**

---

## 1. Subsystem Architecture & Component Topology

The AI-05 subsystem comprises three core runtime layers:

```
┌────────────────────────────────────────────────────────┐
│                   NestJS API Gateway                   │
│                                                        │
│  [EmbeddingProfileRegistry] ──► [PipelineService]      │
│  [OrchestratorService]     ──► [LifecycleService]      │
│  [CompletenessValidator]   ──► [RecoveryWorker]        │
└───────────────┬────────────────────────┬───────────────┘
                │                        │
       HTTP REST│127.0.0.1:11434         │Prisma / pgvector (Port 5433)
                ▼                        ▼
┌────────────────────────┐      ┌────────────────────────┐
│     Ollama Runtime     │      │ PostgreSQL 16 pgvector │
│                        │      │                        │
│ Model: bge-m3:latest   │      │ Extension: vector 0.8.7│
│ Dimension: 1024        │      │ Index: HNSW (m=16)     │
│ VRAM/RAM: ~2.1 GB      │      │ Database: kinergy_dev  │
└────────────────────────┘      └────────────────────────┘
```

---

## 2. Service Management & Health Verification

### 2.1 Starting & Verifying Ollama Daemon

In local and development environments, Ollama runs as a background service:

```powershell
# Verify Ollama service status
Get-Process -Name ollama -ErrorAction SilentlyContinue

# Start Ollama service if stopped
$env:OLLAMA_HOST = "127.0.0.1:11434"
$env:OLLAMA_NUM_PARALLEL = "1"
Start-Process ollama -ArgumentList "serve" -WindowStyle Hidden

# Verify BGE-M3 model availability
curl -s http://127.0.0.1:11434/api/tags | ConvertFrom-Json | Select-Object -ExpandProperty models | Where-Object name -like "bge-m3*"
```

_Expected Output:_

```json
{
  "name": "bge-m3:latest",
  "digest": "7907646426070047a77226ac3e684fbbe8410524f7b4a74d02837e43f2146bab",
  "size": 2243887640
}
```

### 2.2 Verifying PostgreSQL pgvector Extension

```powershell
docker exec kinergy-demo-postgres psql -U kinergy_user -d kinergy_dev -c "
SELECT extname, extversion FROM pg_extension WHERE extname = 'vector';
SELECT count(*) AS total_vectors FROM document_embeddings;
SELECT count(*) AS active_generations FROM index_generations WHERE status = 'ACTIVE';
"
```

---

## 3. Standard Operating Procedures (SOPs)

### SOP-01: Zero-Downtime Model Upgrade / Re-Indexing

When transitioning to a new embedding model, new tokenizer, or changed dimensionality:

```
[Phase 1: Register New Profile]
      │
      ▼
[Phase 2: Create Index Generation in 'BUILDING' State]
      │
      ▼
[Phase 3: Dispatch Asynchronous Backfill Jobs]
      │  (Previous 'ACTIVE' generation continues serving search queries)
      ▼
[Phase 4: Run Completeness Validator Gate]
      │  (Reconciles chunk counts vs vector counts)
      ▼
[Phase 5: Atomic Activation & Retirement]
      │  (New generation becomes 'ACTIVE'; Old becomes 'RETIRED')
      ▼
[Phase 6: Grace Period & Vector Cleanup]
```

#### Detailed Execution Steps:

1. **Register the New Profile:** Define and register the new immutable `EmbeddingProfile` in `EmbeddingProfileRegistry`.
2. **Initialize New Generation:**
   ```typescript
   const newGen = await lifecycleService.createGeneration({
     tenantId: 'tenant-123',
     embeddingProfileId: 'prof_bge-m3-v2_1024_dense',
     description: 'Upgrade to BGE-M3 v2',
   }); // Status: BUILDING
   ```
3. **Queue Re-Indexing Jobs:**
   ```typescript
   await reindexingService.scheduleReindexing({
     tenantId: 'tenant-123',
     targetGenerationId: newGen.id,
     concurrencyLimit: 2,
   });
   ```
4. **Validate Before Activation:**
   ```typescript
   const validation = await completenessValidator.validateGeneration(newGen.id);
   if (!validation.isComplete) {
     throw new Error(`Cannot activate: ${validation.missingChunksCount} chunks missing`);
   }
   ```
5. **Atomic Swap:**
   ```typescript
   await lifecycleService.activateGeneration(newGen.id);
   // Atomically sets newGen -> ACTIVE and demotes old active -> RETIRED within a single transaction.
   ```
6. **Grace Period Cleanup:** After a 7-day retention grace period, trigger vector cleanup for retired generations:
   ```typescript
   await vectorCleanupService.cleanupRetiredGenerationVectors(oldGen.id);
   ```

---

### SOP-02: PostgreSQL HNSW Index Maintenance & Rebuilding

When massive bulk writes occur, HNSW graphs can experience index bloat or degradation.

#### Online Concurrent Re-indexing:

```sql
-- Rebuild HNSW vector index concurrently without locking table reads or writes
REINDEX INDEX CONCURRENTLY document_embeddings_hnsw_cosine_idx;
```

#### Checking Index Size and Bloat:

```sql
SELECT
    relname AS object_name,
    pg_size_pretty(pg_relation_size(c.oid)) AS object_size,
    reltuples AS estimated_rows
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE relname IN ('document_embeddings', 'document_embeddings_hnsw_cosine_idx')
  AND n.nspname = 'public';
```

---

### SOP-03: Stalled Job Recovery & Orphan Healing

If worker nodes terminate unexpectedly during embedding generation:

1. **Trigger Manual Recovery Sweep:**
   ```powershell
   # Invoke the recovery endpoint or worker sweep
   curl -X POST http://127.0.0.1:3000/api/v1/ai/indexing/recover-stalled
   ```
2. **Behavior:**
   - Detects jobs in `PROCESSING` status with `heartbeat_at < NOW() - INTERVAL '5 minutes'`.
   - Increments `attempt_count`. If `attempt_count < 3`, reschedules back to `QUEUED`.
   - If `attempt_count >= 3`, moves job to `FAILED` and records stack trace.
   - Cleans up orphan vector rows belonging to uncommitted chunk transactions.

---

## 4. Monitoring, Telemetry & Alerts

### 4.1 Key Prometheus Metrics

| Metric Name                              | Type      | Warning Threshold | Critical Threshold | Remediation                                     |
| :--------------------------------------- | :-------- | :---------------- | :----------------- | :---------------------------------------------- |
| `ai_ollama_inference_duration_seconds`   | Histogram | p95 > 500 ms      | p95 > 2.0 s        | Check Ollama CPU saturation or VRAM exhaustion. |
| `ai_embedding_circuit_breaker_state`     | Gauge     | `1` (Half-Open)   | `2` (Open)         | Ollama service down. Investigate daemon logs.   |
| `ai_vector_indexing_queue_depth`         | Gauge     | > 500 jobs        | > 2,000 jobs       | Scale background indexing worker pods.          |
| `ai_index_generation_completeness_ratio` | Gauge     | < 0.95 (post-job) | < 0.90             | Re-run `vector-indexing-recovery.worker`.       |
| `pg_hnsw_query_latency_milliseconds`     | Histogram | p95 > 25 ms       | p95 > 100 ms       | Execute `REINDEX INDEX CONCURRENTLY`.           |

---

## 5. Incident Response & Troubleshooting Runbook

### Incident 1: Ollama Service Unreachable / Circuit Breaker Tripped

- **Symptom:** API logs show `OllamaCircuitBreakerOpenException` or `ConnectionRefusedError: 127.0.0.1:11434`.
- **Immediate Mitigation:**
  1. Check Ollama process: `Get-Process ollama`
  2. If process is dead, inspect logs: `cat ~/.ollama/logs/server.log`
  3. Restart Ollama: `Start-Process ollama -ArgumentList "serve"`
  4. Once healthy, circuit breaker resets automatically after 30-second reset timeout.

### Incident 2: Incomplete Generation Activation Prevented

- **Symptom:** Administrator or automated workflow receives `IncompleteIndexGenerationException: Cannot activate generation gen-xyz`.
- **Root Cause:** Some chunks failed embedding generation or were quarantined as poison pills.
- **Remediation:**
  1. Inspect failed chunks:
     ```sql
     SELECT chunk_id, last_error, attempt_count
     FROM vector_indexing_jobs
     WHERE index_generation_id = 'gen-xyz' AND status = 'FAILED';
     ```
  2. Resolve underlying issue (e.g., text length or invalid encoding).
  3. Re-queue failed chunks:
     ```typescript
     await orchestratorService.retryFailedJobs('gen-xyz');
     ```

### Incident 3: pgvector Out-Of-Memory During HNSW Build

- **Symptom:** PostgreSQL error `out of memory for HNSW index build` during initial index creation or `REINDEX`.
- **Immediate Fix:**
  Increase maintenance memory in PostgreSQL:
  ```sql
  SET maintenance_work_mem = '1GB';
  REINDEX INDEX CONCURRENTLY document_embeddings_hnsw_cosine_idx;
  ```

---

## 6. Operational Sign-Off

The operations runbook for AI-05 is complete, covering daemon lifecycles, zero-downtime re-indexing SOPs, database maintenance, telemetry, and disaster recovery.

**Runbook Status:** **READY FOR PRODUCTION OPERATIONS**
