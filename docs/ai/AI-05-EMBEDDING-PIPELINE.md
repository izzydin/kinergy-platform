# AI-05.4 — Embedding Generation Pipeline Report

**Milestone:** AI-05.4 — Embedding Generation Pipeline  
**Role:** Principal RAG Engineer and Senior Distributed Systems Architect  
**Status:** COMPLETE  
**Date:** 2026-11-20

---

## 1. Executive Summary

Milestone **AI-05.4** delivers the bounded, resilient, retryable embedding generation pipeline orchestrating the transformation of immutable `DocumentChunk` records (from AI-04) into validated, high-dimensional `DocumentEmbedding` entities using the verified Ollama BGE-M3 runtime (from AI-05.3) and pgvector-ready domain contracts (from AI-05.1 & AI-05.2).

In accordance with Clean and Hexagonal Architecture rules:

- **Separation of Concerns:** The pipeline is strictly responsible for chunk validation, bounded batch generation, deterministic fingerprinting, transient retry, and partial failure isolation. It does not perform database persistence, preserving strict decoupling between generation and storage.
- **Hardware Concurrency & Memory Safety:** Operates with bounded batch sizes (default `16`), respecting local hardware constraints (8GB GPU VRAM, 16GB system RAM) to avoid Ollama OOM or process swapping.
- **Fault Tolerance:** Implements an automated fallback mechanism: if an entire batch fails after transient retries (e.g., due to one poisoned chunk exceeding context length), the pipeline falls back to individual chunk processing. Valid chunks are preserved and successfully embedded, while only failing chunks are recorded with granular error classifications.

---

## 2. Input Source Validation & Provenance

The pipeline requires pre-chunked, immutable `DocumentChunk` domain entities. Chunks are never reconstructed from raw disk files or unparsed buffers.

Before processing, each chunk undergoes strict integrity validation:

1. **Document Identity Alignment:** Every chunk's `documentId` must strictly match the generation job's `documentId`.
2. **Version Immutability:** Every chunk's `documentVersionId` must strictly match the target `documentVersionId`.
3. **Payload Non-Emptiness:** Chunk content must not be null, empty, or whitespace-only.
4. **Sequence Monotonicity:** Sequences must be valid non-negative integers (`>= 0`).
5. **Provenance Checksum:** Provenance metadata must contain a verified 64-character lowercase hexadecimal SHA-256 checksum.

Any integrity discrepancy throws a strict `EmbeddingValidationException` before invoking downstream providers.

---

## 3. Deterministic Processing Fingerprint

To provide cryptographic provenance and idempotency across index regenerations, each generated `DocumentEmbedding` is bound to a deterministic SHA-256 fingerprint:

$$\text{ContentHash} = \text{SHA-256}(\text{chunk.content})$$

$$\text{CanonicalPayload} = \text{chunkId}=\dots \mid \text{sequence}=\dots \mid \text{versionId}=\dots \mid \text{profileId}=\dots \mid \text{contentSha256}=\text{ContentHash}$$

$$\text{ProcessingFingerprint} = \text{SHA-256}(\text{CanonicalPayload})$$

### Guarantees

- **Bitwise Determinism:** Identical chunk content, sequence, document version, and embedding profile always yield the identical 64-character hexadecimal digest.
- **Tamper Evident:** Any alteration in chunk sequence, text content, version ID, or underlying embedding profile creates an entirely distinct fingerprint.

---

## 4. Bounded Batching & Resource Safety

Ollama BGE-M3 supports native batch inference via `/api/embed`. However, unbounded batching can saturate GPU VRAM or trigger HTTP timeouts.

- **Batch Size:** Configured via `options.batchSize` or `config.embeddingBatchSize` (default: `16`).
- **Sequential Execution:** Batches are processed sequentially to guarantee stable VRAM allocation on the local 8GB GPU.
- **Chunk Slicing:** A 35-chunk document is cleanly partitioned into batches of `[16, 16, 3]`.

---

## 5. Partial Failure Isolation & Fallback Strategy

Real-world document ingestion often encounters edge cases (e.g., occasional chunks with non-printable characters or unusual token densities).

```
                 [Batch of N Chunks]
                         │
                         ▼
             [Ollama /api/embed Call]
                   │           │
            (Success)        (Error)
                   │           │
                   │           ▼
                   │     [Retry Loop]
                   │     (Exponential Backoff + Jitter)
                   │           │
                   │    (All retries exhausted)
                   │           │
                   ▼           ▼
            [Embeddings]  [Fallback: Process Chunks Individually]
                               │
                ┌──────────────┴──────────────┐
                ▼                             ▼
        [Valid Chunks (M)]           [Poisoned Chunks (N - M)]
        -> Success Embeddings        -> Recorded in failedChunks[]
```

1. **Transient Retry:** Transient errors (timeouts, 503 unavailable, 429 rate limit) are retried up to `maxRetries` (default: `3`) with exponential backoff and randomized jitter:
   $$\text{Backoff} = \min\left(2000, 2^{\text{attempt}} \times 150 + \text{rand}(0, 50)\right)\,\text{ms}$$
2. **Short-Circuit on Non-Retryable Errors:** Semantic validation errors (dimension mismatch, invalid profile) break out of the batch retry immediately.
3. **Partial Failure Isolation:** When a batch fails, individual chunk processing rescues the remaining valid chunks in that batch, ensuring zero data loss for healthy chunks.
4. **Failure Tracking:** Failed chunks are tagged with:
   - `chunkId`, `sequence`
   - `errorCode` (e.g. `DIMENSION_MISMATCH`, `TIMEOUT`, `MODEL_UNAVAILABLE`, `RESOURCE_EXHAUSTED`)
   - `errorMessage`
   - `retryAttempts`
   - `permanent` flag (`true` for validation/context overflow; `false` for transient network issues).

---

## 6. Cooperative Cancellation & Observability

### Cooperative Cancellation

The pipeline monitors cancellation at every batch boundary and individual chunk execution:

- Native `AbortSignal` checking (`signal.aborted`).
- Cooperative polling hook `isCancelled: () => Promise<boolean>`.
- Immediately raises `GenerationCancelledException` without leaving orphaned tasks.

### Observability Metrics

Every pipeline execution yields an `EmbeddingPipelineResult`:

- `documentId`, `documentVersionId`, `generationId`, `profileId`
- `totalChunksRequested`: Total chunks submitted
- `successfulEmbeddings`: Array of validated `DocumentEmbedding` entities
- `failedChunks`: Array of structured failed chunk descriptors
- `batchCount`: Number of batches processed
- `totalDurationMs`: Total end-to-end processing time in milliseconds
- `totalTokensProcessed`: Sum of tokens across successful chunks
- `retryCount`: Count of transient retries performed
- Continuous progress reporting via `onProgress` callback reporting `percentComplete`.

---

## 7. Verification & Test Matrix

The pipeline was verified with unit tests and system tests.

| Test Case      | Scenario / Invariant                                                                 | Result |
| :------------- | :----------------------------------------------------------------------------------- | :----- |
| **TC-PIPE-01** | Single chunk embedding generation with 1024-d unit vector                            | PASS   |
| **TC-PIPE-02** | Multi-chunk generation in single batch                                               | PASS   |
| **TC-PIPE-03** | Multi-batch processing across batch boundaries (5 chunks, batch size 2 -> 3 batches) | PASS   |
| **TC-PIPE-04** | Empty chunk set handling (0 chunks requested -> graceful 0 result)                   | PASS   |
| **TC-PIPE-05** | Transient timeout retry recovery with backoff                                        | PASS   |
| **TC-PIPE-06** | Partial batch failure isolation fallback (1 bad chunk, 2 valid rescued)              | PASS   |
| **TC-PIPE-07** | Cooperative cancellation via `AbortSignal`                                           | PASS   |
| **TC-PIPE-08** | Cooperative cancellation via `isCancelled` hook                                      | PASS   |
| **TC-PIPE-09** | Validation: mismatched `documentId` rejection                                        | PASS   |
| **TC-PIPE-10** | Validation: mismatched `documentVersionId` rejection                                 | PASS   |
| **TC-PIPE-11** | Validation: empty/whitespace chunk content rejection                                 | PASS   |
| **TC-PIPE-12** | Validation: negative sequence rejection                                              | PASS   |
| **TC-PIPE-13** | Validation: missing provenance checksum rejection                                    | PASS   |
| **TC-PIPE-14** | Deterministic fingerprinting: bitwise invariance for identical chunk & profile       | PASS   |
| **TC-PIPE-15** | Deterministic fingerprinting: distinct hashes on content change                      | PASS   |
| **TC-PIPE-16** | Deterministic fingerprinting: distinct hashes on sequence change                     | PASS   |
| **TC-PIPE-17** | Deterministic fingerprinting: distinct hashes on profile change                      | PASS   |

---

## 8. Summary of Components Delivered

1. **Pipeline Service:** `apps/api/src/ai/services/embedding-generation-pipeline.service.ts`
2. **Token Registration:** `EMBEDDING_GENERATION_PIPELINE_SERVICE` in `apps/api/src/ai/ai.tokens.ts`
3. **Module Registration:** Registered and exported in `apps/api/src/ai/ai.module.ts`
4. **Unit Test Suite:** `apps/api/src/ai/services/__tests__/embedding-generation-pipeline.service.spec.ts` (17/17 tests passing)
5. **Documentation:** `docs/ai/AI-05-EMBEDDING-PIPELINE.md`
