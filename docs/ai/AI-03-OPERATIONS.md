# AI-03 — Operations, Deployment & Runbook Manual

**Milestone:** AI-03  
**Bounded Context:** AI / Knowledge Management  
**Target Audience:** DevOps Engineers, Site Reliability Engineers, Platform Administrators  
**Status:** **OPERATIONAL**

---

## 1. System Dependencies & Prerequisites

1. **Database:** PostgreSQL 16+ with extensions `uuid-ossp` and `pg_trgm`. (Note: `pgvector` is **not** required for AI-03).
2. **Object Storage:** S3-compatible storage service (Cloudflare R2, MinIO, or AWS S3).
3. **Application Runtime:** Node.js 20+ LTS, NestJS 10.
4. **Network Access:** TCP port 5432/5433 (PostgreSQL), HTTPS/443 (S3 endpoint).

---

## 2. Environment Configuration Reference

The following environment variables govern the Knowledge Management subsystem:

| Variable                       |  Type   |     Default     | Description                                             |
| :----------------------------- | :-----: | :-------------: | :------------------------------------------------------ |
| `AI_ENABLED`                   | Boolean |     `false`     | Master feature flag for Kynergy Intelligence subsystem. |
| `AI_MAX_DOCUMENT_SIZE_BYTES`   | Number  |   `10485760`    | Maximum file size limit in bytes (Default: 10 MB).      |
| `STORAGE_PROVIDER`             | String  |     `local`     | Storage driver (`local` or `s3`).                       |
| `STORAGE_S3_BUCKET`            | String  | `kinergy-media` | Target bucket name.                                     |
| `STORAGE_S3_ENDPOINT`          | String  |        —        | Custom S3 endpoint URL (e.g. Cloudflare R2 / MinIO).    |
| `STORAGE_S3_REGION`            | String  |     `auto`      | Storage region.                                         |
| `STORAGE_S3_ACCESS_KEY_ID`     | String  |        —        | S3 Access Key ID.                                       |
| `STORAGE_S3_SECRET_ACCESS_KEY` | String  |        —        | S3 Secret Access Key.                                   |

---

## 3. Database Migration Runbook

The schema changes for AI-03 are strictly additive and located in:
`prisma/migrations/20261119000000_add_knowledge_management_and_ingestion_tables`

### Applying Migrations in Staging / Production

```bash
# Verify pending status
pnpm exec prisma migrate status

# Apply additive migration safely without downtime
pnpm exec prisma migrate deploy
```

> [!IMPORTANT]
> Never run `prisma migrate reset` in staging or production. The migration is idempotent and backward-compatible with all existing tables.

---

## 4. Background Watchdog Worker Operations

The `IngestionRecoveryWorker` runs automatically inside `apps/api`:

- **Poll Interval:** 15 seconds (`pollIntervalMs: 15_000`).
- **Stale Active Threshold:** 5 minutes (`staleThresholdMs: 300_000`).
- **Batch Size:** 10 jobs per iteration (`batchSize: 10`).

### Tuning for High-Volume Deployments

If document ingestion volume increases:

- Adjust polling interval via worker configuration options.
- The partial unique constraint `unique_active_ingestion_per_version` guarantees that multiple API server replicas can poll concurrently without conflicting job execution.

---

## 5. Incident Runbooks

### Runbook A: Backing Storage Disruption (S3 503 / ETIMEDOUT)

- **Symptom:** Logs show `Job 'xxx' transient failure (STORAGE_TIMEOUT)`.
- **System Behavior:** `IngestionOrchestratorService` classifies error as transient, computes exponential backoff with jitter, and sets `nextRetryAt`. The source document remains safe.
- **Resolution:**
  1. Verify S3 credentials and endpoint availability.
  2. Once storage restores, `IngestionRecoveryWorker` automatically resumes retries.
  3. Users can also trigger immediate retry via `POST /api/v1/ai/knowledge/documents/:id/ingestion/retry`.

### Runbook B: Stalled Job Recovery After API Container Crash

- **Symptom:** Worker container restarted unexpectedly during document processing.
- **System Behavior:** Jobs remain in `VALIDATING`, `PROCESSING`, or `INDEXING`.
- **Resolution:**
  1. No manual database surgery needed.
  2. When the API container boots, `IngestionRecoveryWorker` detects jobs whose `startedAt` is older than 5 minutes.
  3. The watchdog marks the job `WORKER_CRASH_RECOVERED` and schedules an automatic retry.

### Runbook C: Compensating Storage Cleanup Alert

- **Symptom:** Log warning: `Database persistence failed after storing object '...'. Triggering compensating storage deletion.`
- **System Behavior:** Object storage upload succeeded, but database commit failed. The orchestrator immediately calls `storagePort.delete(...)` to prevent orphan storage growth.
- **Verification:** Inspect storage bucket prefix to verify no unindexed objects remain.

---

## 6. Operational Boundary Confirmation

> [!NOTE]
> In Milestone AI-03, jobs that complete processing reach `READY` status via the outbound port contract `IDocumentIndexingPort`. Full RAG vector search, text chunking, and embedding storage in `pgvector` will be activated in **Milestone AI-04**.
