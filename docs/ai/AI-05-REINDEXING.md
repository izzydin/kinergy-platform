# AI-05.6 — Re-indexing & Rollback Architecture

## 1. Executive Summary

In a multitenant clinical and biomedical knowledge retrieval system, model upgrades (e.g., migrating from an older embedding checkpoint to BGE-M3 or changing pooling/normalization settings) require recalculating vectors for all tenant chunks. Downtime or intermittent retrieval degradation during re-indexing is unacceptable.

The **Index Re-indexing Engine** (`IndexReindexingService`) provides zero-downtime, fully transactional index replacement:

1. **Parallel Shadow Generation:** Embeddings for the new profile are generated into a new, isolated `IndexGeneration` (in `BUILDING` state).
2. **Uninterrupted Live Queries:** All tenant search queries continue pointing exclusively to the existing `ACTIVE` generation.
3. **Outside-Transaction Generation:** High-latency Ollama embedding API calls occur in bounded batches strictly outside database transactions.
4. **Complete Verification:** Completeness and integrity are verified by `IndexGenerationCompletenessValidatorService` before activation.
5. **Atomic Promotion:** The database state swap (`ACTIVE` $\rightarrow$ `RETIRED`, `BUILDING` $\rightarrow$ `ACTIVE`) is executed in a single atomic SQL transaction.
6. **Instant Zero-Recomputation Rollback:** If an operational regression is detected with the new model, the system can instantly roll back to any previously `RETIRED` generation (`ACTIVE` $\rightarrow$ `RETIRED`, `RETIRED` $\rightarrow$ `ACTIVE`) because its vectors remain intact.

---

## 2. Re-indexing Architecture & Workflow

```
[ Active Generation (Gen #1, ACTIVE) ] <----- Search Traffic (Zero Downtime)
                  │
                  ▼
[ Provision Candidate Generation (Gen #2, BUILDING) ]
                  │
                  ▼
[ Discover Active Documents & Chunks (tenantId) ]
                  │
                  ▼
[ Batch Embedding Generation outside DB Tx (BGE-M3) ]
                  │
                  ▼
[ Bulk Persist Vectors (idx_gen_id = Gen #2) ]
                  │
                  ▼
[ Completeness & Profile Integrity Validation ]
        │
   Pass?├── No ──> Fail Generation (Gen #2 -> FAILED), Active remains Gen #1
        │
        └── Yes ─> [ Atomic Transaction ]
                     ├── Gen #1: ACTIVE  -> RETIRED
                     └── Gen #2: BUILDING -> ACTIVE
```

### 2.1 Re-indexing Steps

1. **Generation Provisioning:**
   - Evaluates active generation for the tenant.
   - Calculates `nextGenerationNumber = (currentActive?.generationNumber ?? 0) + 1`.
   - Reconstitutes or creates a new `IndexGeneration` aggregate with status `BUILDING`.
   - Persists the new generation and claims a generation-level `VectorIndexingJob`.

2. **Chunk Discovery & Batching:**
   - Traverses tenant documents (excluding soft-deleted documents).
   - Resolves chunks for each document's `currentVersionId`.
   - Groups chunks into bounded batches respecting `embeddingBatchSize` (default: 16).

3. **Embedding Generation Pipeline:**
   - Calls `EmbeddingGenerationPipelineService.generateEmbeddings()`.
   - Provider calls to Ollama occur asynchronously with circuit breaker and bounded concurrency.
   - Vectors are bulk-inserted with `indexGenerationId = Gen #2`.

4. **Completeness Validation:**
   - `IndexGenerationCompletenessValidatorService.assertComplete(generationId)` verifies:
     - Total indexed chunks equals target chunks.
     - Zero failed or pending indexing jobs.
     - Row count in `document_embeddings` matches generation metadata.
     - Vector dimensions match the profile specification (e.g., 1024 for BGE-M3 dense).
     - Content fingerprints and SHA-256 integrity match.

5. **Atomic Promotion:**
   - In an atomic transaction (`Prisma.$transaction`):
     ```sql
     UPDATE index_generations SET status = 'RETIRED' WHERE tenant_id = $1 AND status = 'ACTIVE';
     UPDATE index_generations SET status = 'ACTIVE', activated_at = NOW() WHERE id = $2;
     ```
   - Searches immediately resolve to the new generation.

---

## 3. Instant Rollback Protocol

When a promoted model or configuration exhibits clinical regression or latency degradation:

1. `IndexReindexingService.rollbackToGeneration(tenantId, targetGenerationId)` is invoked.
2. The target generation must be in `RETIRED` status and belong to the specified `tenantId`.
3. Validation ensures that the vectors for the target generation have not been pruned by physical cleanup.
4. An atomic status swap is executed:
   - The currently `ACTIVE` generation is marked `RETIRED`.
   - The target `RETIRED` generation is marked `ACTIVE` (via `IndexGeneration.rollback()`).
5. **Zero Recomputation:** Vector calculation is not repeated; queries immediately resume matching vectors from the target generation.

---

## 4. Chunking Version Changes

When AI-04 parser or chunking configuration is upgraded (e.g., `v1` $\rightarrow$ `v2`):

1. Source documents are re-chunked under a new immutable `DocumentVersion`.
2. The chunking configuration version (`ChunkProvenance.configurationVersion`) is stamped on all chunks.
3. The Re-indexing engine treats new document versions as new chunk inputs, mapping them into the candidate generation without modifying historical document versions or previous chunk rows.
