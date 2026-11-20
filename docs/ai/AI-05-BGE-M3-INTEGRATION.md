# AI-05: BAAI/BGE-M3 Embedding Provider Integration

## 1. Provider Overview & Runtime Environment

The embedding provider integration for Milestone **AI-05.3** reuses and extends the approved `OllamaEmbeddingAdapter` in `apps/api/src/ai/adapters/embedding/ollama-embedding.adapter.ts`, integrating directly with the local Ollama daemon.

### Verified Runtime Specifications

- **Inference Server**: Ollama `0.5.13` (running on `http://127.0.0.1:11434`)
- **Model Name**: `bge-m3` (`bge-m3:latest`)
- **Model Architecture**: BERT / XLM-RoBERTa (`family: bert`)
- **Parameter Count**: 566.70M parameters
- **Quantization**: FP16 (`quantization_level: F16`)
- **Weights File Size**: 1,157,672,605 bytes (~1.08 GB)
- **Immutable SHA-256 Digest**: `7907646426070047a77226ac3e684fbbe8410524f7b4a74d02837e43f2146bab`
- **Output Dimensionality**: Strictly **1,024 dimensions**
- **Native Context Window**: 8,192 tokens

---

## 2. API Endpoints & Embedding Semantics

### Primary Endpoint: Native `/api/embed`

Ollama v0.4+ and v0.5+ provide the native `/api/embed` endpoint, which replaced the legacy `/api/embeddings`:

```http
POST /api/embed
Content-Type: application/json

{
  "model": "bge-m3:latest",
  "input": ["Evaluación kinesiológica", "Rehabilitación muscular"]
}
```

#### Key Characteristics & Empirical Findings:

1. **Dense Embeddings Only**: The integration produces dense vectors $\mathbf{v} \in \mathbb{R}^{1024}$. (Sparse lexical and multi-vector ColBERT features are explicitly not claimed or used in this milestone).
2. **Native Unit Normalization**: Unlike the legacy `/api/embeddings` (which outputted unnormalized vectors with $\|\mathbf{v}\|_2 \approx 25.91$), `/api/embed` returns vectors that are mathematically unit-normalized:
   $$\|\mathbf{v}\|_2 = \sqrt{\sum_{i=1}^{1024} v_i^2} = 1.000000 \pm 0.00001$$
3. **Pooling Strategy**: Output vectors are pooled using `CLS` token representation.
4. **Input Prefix / Instruction**: BGE-M3 does **not** require any query or passage prefix (such as `"query: "` or `"passage: "`) for general semantic retrieval. Texts are passed directly.
5. **Bitwise Determinism**: Identical text inputs passed repeatedly to `/api/embed` return identical float representations across all 1,024 coordinates.

---

## 3. Input & Vector Validation Strategy

### Input Validation

- **Blank / Empty Rejection**: Empty or whitespace-only inputs are rejected with `EmbeddingProviderUnavailableException` prior to any HTTP dispatch.
- **Context Length Bound**: Inputs exceeding `MAX_INPUT_CHARS = 32768` (~8,192 tokens) are rejected with `InputTooLargeException` rather than suffering silent runtime truncation.
- **Unicode Purity**: Rejects unsupported null bytes (`\u0000`) with `InvalidEmbeddingRequestException`.
- **Batch Boundary**: Batches exceeding 500 items are rejected with `InvalidEmbeddingRequestException`. Batches are automatically partitioned into bounded slices of $\le 32$ items.

### Vector Validation

- **Dimensionality**: Strictly 1,024 elements. An array with $\ne 1024$ throws `EmbeddingDimensionMismatchException`.
- **Finite Coordinates**: Every float is checked for `Number.isFinite(v) && !Number.isNaN(v)`. `NaN`, `+Infinity`, and `-Infinity` are rejected immediately.
- **Non-Empty Response**: Empty or malformed responses throw `EmbeddingProviderUnavailableException`.

---

## 4. Structured Error Taxonomy & Retry Rules

The adapter maps low-level network or Ollama errors into stable domain exceptions:

| Condition / Status              | Mapped Exception                        | Retryable?    | Description                          |
| :------------------------------ | :-------------------------------------- | :------------ | :----------------------------------- |
| **ECONNREFUSED / Offline**      | `EmbeddingProviderUnavailableException` | Yes (Backoff) | Ollama daemon not reachable.         |
| **Request Timeout**             | `ProviderTimeoutException`              | Yes (1-2x)    | Exceeded `timeoutMs` (default: 30s). |
| **AbortSignal Event**           | `GenerationCancelledException`          | No            | Aborted by client or parent job.     |
| **HTTP 404**                    | `ModelNotFoundException`                | No            | Target model not pulled into Ollama. |
| **HTTP 400 (Context Exceeded)** | `InputTooLargeException`                | No            | Chunk exceeds model context window.  |
| **HTTP 429 / 507**              | `ResourceExhaustedException`            | Yes (Backoff) | Ollama GPU VRAM or queue exhausted.  |
| **HTTP 500 / 503**              | `EmbeddingProviderUnavailableException` | Yes (Backoff) | Internal Ollama engine crash.        |
| **Vector Length $\ne 1024$**    | `EmbeddingDimensionMismatchException`   | No            | Structural model incompatibility.    |
