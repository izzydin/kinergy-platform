# AI-05.5 — Consistency, Idempotency, and Recovery Architecture

**Milestone:** AI-05.5 — Indexing Orchestration & Consistency  
**Role:** Principal Distributed Systems Architect, Principal Database Engineer, and Senior RAG Architect  
**Status:** COMPLETE & VERIFIED  
**Date:** 2026-11-20

---

## 1. Idempotency & Cryptographic Fingerprinting

In distributed environments, network partitions, worker crashes, or message redelivery can cause identical indexing requests to arrive multiple times. The system enforces strict idempotency at both application and database layers.

### Deterministic Fingerprint Protocol

Every `DocumentChunk` and target `EmbeddingProfile` deterministically produce a 64-character lowercase hexadecimal SHA-256 digest:

$$\text{CanonicalPayload} = \text{chunkId}=\dots \mid \text{sequence}=\dots \mid \text{versionId}=\dots \mid \text{profileId}=\dots \mid \text{contentSha256}=\text{sha256}(\text{content})$$

$$\text{ProcessingFingerprint} = \text{SHA-256}(\text{CanonicalPayload})$$

### Pre-Generation Idempotency Skip

Before invoking the embedding provider, `VectorIndexingOrchestratorService` inspects existing database rows in `document_embeddings` for the target version and generation.

- If a chunk already has an embedding in the target generation with an identical `content_fingerprint`, model inference is completely skipped for that chunk.
- If all chunks for a version match, the orchestrator completes the job immediately with zero Ollama calls and zero database writes.

### Database Conflict-Aware Upserts

If two workers execute concurrently or a batch is retried, PostgreSQL enforces the unique composite constraint:

```sql
ALTER TABLE "document_embeddings"
ADD CONSTRAINT "unique_chunk_generation_embedding"
UNIQUE ("chunk_id", "index_generation_id");
```

Persistence queries execute conflict-aware upserts:

```sql
INSERT INTO "document_embeddings" (
  "id", "chunk_id", "document_id", "document_version_id",
  "index_generation_id", "profile_id", "dimensions",
  "embedding", "content_fingerprint", "created_at"
) VALUES ($1, $2, $3, $4, $5, $6, $7, $8::vector, $9, $10)
ON CONFLICT ("chunk_id", "index_generation_id") DO UPDATE SET
  "embedding" = EXCLUDED."embedding",
  "content_fingerprint" = EXCLUDED."content_fingerprint",
  "dimensions" = EXCLUDED."dimensions",
  "profile_id" = EXCLUDED."profile_id";
```

Duplicate delivery never creates duplicate vector rows or alters existing identities.

---

## 2. Lock-Free Concurrency & Atomic Job Claims

To eliminate deadlocks and scale across multi-instance API deployments without centralized in-memory locks (e.g. Redis), job scheduling leverages database-level conditional atomic updates:

```typescript
const updateResult = await this.prisma.vectorIndexingJob.updateMany({
  where: {
    id: cleanId,
    status: 'PENDING',
  },
  data: {
    status: 'RUNNING',
    startedAt: new Date(),
    attemptCount: { increment: 1 },
  },
});
```

- If `updateResult.count === 1`: The worker successfully acquired the execution lease.
- If `updateResult.count === 0`: Another worker already claimed the job or the job is no longer pending. The calling worker immediately skips execution without side effects.

---

## 3. Transactional Persistence Boundaries

```
[Worker Process]
      │
      ├──> 1. Fetch chunks & check existing DB fingerprints
      │
      ├──> 2. CALL OLLAMA /api/embed (Non-transactional HTTP, ~300ms)
      │
      └──> 3. BEGIN PostgreSQL Transaction (Sub-50ms)
                 │
                 ├──> INSERT / UPDATE document_embeddings
                 ├──> UPDATE index_generations (increment counts)
                 └──> UPDATE vector_indexing_jobs (progress & terminal state)
                 │
           COMMIT TRANSACTION
```

### Atomicity Guarantees

- If the model call fails or times out: No database transaction was opened, zero dirty rows exist.
- If PostgreSQL fails during Step 3: The transaction rolls back cleanly. Neither the embeddings, generation counts, nor job progress are partially committed.
- If the worker crashes immediately after COMMIT: On restart, the pre-generation idempotency check reads the already-committed vectors and marks the job complete without redundant inference.

---

## 4. Generation Completeness Specification

An `IndexGeneration` cannot be activated unless it satisfies the formal completeness specification enforced by `IndexGenerationCompletenessValidatorService`.

### Formal Verification Invariants

1. **Status Eligibility:** Status must be `BUILDING` or `VALIDATING`. `FAILED`, `CANCELLED`, or `RETIRED` generations cannot be audited or activated.
2. **Positive Chunk Target:** `targetChunkCount > 0` and `indexedChunkCount > 0`.
3. **Chunk Accounting Integrity:** Accounted chunks (`indexedChunkCount + failedChunkCount`) must equal or exceed `targetChunkCount`. Missing chunks strictly fail validation.
4. **Zero Unresolved Failures:** `failedChunkCount === 0`. If any chunk suffered a permanent failure, the generation cannot activate.
5. **Exact Row Reconciliation:** The actual persisted row count in `document_embeddings` must exactly equal `indexedChunkCount`:
   $$\text{COUNT}(*)_{\text{document\_embeddings}} \equiv \text{generation.indexedChunkCount}$$
6. **Vector Dimension and Profile Invariance:** Every persisted row in the generation must match the profile's dimensions (1,024) and contain a valid 64-character SHA-256 fingerprint:
   ```sql
   SELECT COUNT(*)::int AS invalid_count
   FROM document_embeddings
   WHERE index_generation_id = $1
     AND (dimensions != 1024 OR length(content_fingerprint) != 64 OR profile_id != $2);
   ```
7. **No Outstanding Jobs:** No indexing job bound to this generation may remain in `PENDING` or `RUNNING` status, and zero jobs may be in `FAILED` status.

---

## 5. Failure Scenarios & Recovery Matrix

| Failure Mode                             | Point of Failure                      | System State                                 | Automated Recovery Action                                                                                                             |
| :--------------------------------------- | :------------------------------------ | :------------------------------------------- | :------------------------------------------------------------------------------------------------------------------------------------ |
| **Ollama Offline / Unreachable**         | During embedding generation           | Job `PENDING`/`RUNNING`, 0 vectors persisted | Pipeline transient retry backoff -> Job records `MODEL_UNAVAILABLE` -> Ingestion retry worker reschedules                             |
| **PostgreSQL Offline / Disconnected**    | During transaction commit             | Embeddings generated in memory, unpersisted  | Transaction rolls back -> Job fails with `PERSISTENCE_ERROR` -> Retry worker picks up on recovery                                     |
| **Worker Process Crash (Mid-Inference)** | While Ollama is computing             | Job left in `RUNNING` status                 | `VectorIndexingRecoveryWorker` detects lease expiration (`startedAt <= now - 5m`) -> Resets to `PENDING` -> Next worker resumes       |
| **Worker Process Crash (Post-Commit)**   | After DB commit, before API response  | Vectors persisted, job `COMPLETED`           | Retry request runs idempotency filter -> Detects matching fingerprints -> Returns success immediately                                 |
| **Concurrent Indexing Delivery**         | Multiple workers receive same version | Race to claim job                            | Atomic conditional update allows exactly 1 worker to claim; second worker receives `null` and skips                                   |
| **Poisoned Chunk (Context Overflow)**    | Within a multi-chunk batch            | Whole batch rejected by Ollama               | Pipeline falls back to single-item processing: valid chunks are rescued and persisted; poisoned chunk recorded with permanent failure |
| **Max Retry Exhaustion**                 | After 3 failed attempts               | Job in `RUNNING` status                      | `VectorIndexingRecoveryWorker` detects `attemptCount >= maxAttempts` -> Transitions job to `FAILED` with `TIMEOUT` error              |
