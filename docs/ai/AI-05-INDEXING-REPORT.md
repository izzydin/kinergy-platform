# AI-05 — Indexing Report: Orchestration, Lifecycle & Recovery

**Milestone:** AI-05 — Embedding Generation & Vector Indexing  
**Author:** Principal Distributed Systems Architect, Database Lifecycle Engineer  
**Date:** 2026-11-20  
**Status:** **VERIFIED & ACCEPTED**

---

## 1. Executive Summary

This report evaluates the durable vector indexing orchestration pipeline, job lease handling, idempotent execution, completeness verification, and background crash recovery mechanisms implemented in `AI-05.5`.

The orchestration subsystem coordinates work across `VectorIndexingOrchestratorService`, `VectorIndexingJob`, `IndexGeneration`, and the background reconciliation worker `VectorIndexingRecoveryWorker`.

---

## 2. Index Generation Lifecycle State Machine

```
              ┌─────────┐
              │  DRAFT  │
              └────┬────┘
                   │ startBuilding()
                   ▼
             ┌───────────┐
   ┌─────────┤ BUILDING  ├────────┐
   │         └─────┬─────┘        │
   │ fail()        │              │ cancel()
   ▼               ▼              ▼
┌────────┐   ┌────────────┐  ┌───────────┐
│ FAILED │   │ VALIDATING │  │ CANCELLED │
└────────┘   └─────┬──────┘  └───────────┘
                   │ activate() / promote()
                   ▼
              ┌──────────┐
              │  ACTIVE  │
              └────┬─────┘
                   │ retire()
                   ▼
              ┌──────────┐
              │ RETIRED  │ (Available for zero-recomputation rollback)
              └────┬─────┘
                   │ rollback()
                   ▼
              ┌──────────┐
              │  ACTIVE  │
              └──────────┘
```

### 2.1 State Transition Invariants

- `ACTIVE` Single-Instance Invariant: Exactly one generation per tenant can have `ACTIVE` status at any time, enforced by PostgreSQL partial unique index `unique_active_index_generation_per_tenant`.
- Activation Precondition: No generation can transition to `ACTIVE` unless it has passed completeness validation with zero discrepancies (`IndexGenerationCompletenessValidatorService.assertComplete()`).
- Rollback Capability: Generations in `RETIRED` status retain valid vector references and can be atomically reactivated without recalculating vectors.

---

## 3. Durable Job State Machine & Lease Concurrency

Vector indexing work is tracked via durable database rows in `vector_indexing_jobs`:

| Status          | Definition                                           | Transition Triggers          |
| :-------------- | :--------------------------------------------------- | :--------------------------- |
| **`PENDING`**   | Job created, awaiting worker claim                   | Worker claims job via lease  |
| **`RUNNING`**   | Worker actively processing batches                   | Success, failure, or timeout |
| **`COMPLETED`** | All target chunks successfully embedded              | Verified by validator        |
| **`FAILED`**    | Job exceeded max retry attempts ($3/3$)              | Permanent error / DLQ        |
| **`CANCELLED`** | Job cancelled due to document deletion or user abort | Worker halts processing      |

### 3.1 Lease-Based Distributed Locking

To prevent concurrent workers from claiming the same job or generating duplicate vectors:

- When a worker claims a job, it executes an atomic conditional update:
  ```sql
  UPDATE vector_indexing_jobs
  SET status = 'RUNNING', started_at = NOW(), attempt_count = attempt_count + 1
  WHERE id = $jobId AND (status = 'PENDING' OR (status = 'RUNNING' AND started_at < $staleThreshold));
  ```
- If the worker loses the race, the claim returns `null` and the worker gracefully skips execution.

---

## 4. Crash Recovery & Stale Lease Reconciliation

The `VectorIndexingRecoveryWorker` runs on a scheduled interval (default: 60s) to reconcile orphaned or deadlocked jobs:

1. **Stale Lease Detection:** Scans for jobs with status `RUNNING` whose `started_at` timestamp is older than `staleThresholdMs` (default: 5 minutes).
2. **Attempt Evaluation:**
   - If `attempt_count < max_attempts` (default: 3): Resets job status to `PENDING` with a warning log, allowing idle workers to pick up processing from the last saved `current_batch_number`.
   - If `attempt_count >= max_attempts`: Transitions job status to `FAILED`, sets `last_error_code = 'JOB_EXHAUSTED'`, and transitions the associated `IndexGeneration` to `FAILED`.

---

## 5. Completeness & Integrity Validation

Before any generation is promoted to `ACTIVE`, the `IndexGenerationCompletenessValidatorService` executes a multi-point audit:

1. **Target Chunk Count:** Accounted chunks ($indexed + failed$) must equal $targetChunkCount$.
2. **Zero In-Flight Jobs:** No active jobs in `PENDING` or `RUNNING` status for this generation.
3. **Physical Row Match:** `SELECT COUNT(*) FROM document_embeddings WHERE index_generation_id = $id` must exactly match `indexed_chunk_count`.
4. **Vector Dimension Audit:** All persisted vectors must have length 1024.
5. **Fingerprint Integrity:** Content fingerprints must be valid 64-character hex strings matching chunk contents.

If any discrepancy is identified, promotion is blocked and an `IndexGenerationCompletenessException` is raised.
