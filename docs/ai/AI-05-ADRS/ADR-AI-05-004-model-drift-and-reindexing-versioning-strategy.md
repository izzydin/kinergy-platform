# ADR-AI-05-004: Model Drift & Re-indexing Versioning Strategy

## Status

Accepted

## Context

Local AI models (such as BGE-M3 served via Ollama) can experience drift across Ollama version updates, quantization changes (e.g. FP16 vs Q4_K_M), or runtime parameters. Furthermore, document chunking configurations (e.g., chunk size 512 tokens vs 800 tokens) or parser improvements may necessitate re-indexing existing document versions.

A robust enterprise platform must detect drift and provide an automated, observable re-indexing protocol without service disruption.

## Decision

1. **Model Drift Detection**:
   - Provider health check (`checkHealth`) verifies the live model digest against the active `EmbeddingProfile.modelDigest`.
   - If the runtime model digest changes, the system prevents adding new embeddings to existing generations and alerts operators that a new `EmbeddingProfile` is required.
2. **Dimension & Normalization Guards**:
   - Every returned vector is validated before persistence: rejecting `NaN`, `Infinity`, dimension mismatches, and unnormalized vectors (when `NormalizationPolicy.UNIT_L2` is active).
3. **Re-indexing Protocol**:
   - Re-indexing is orchestrated via `VectorIndexingJob` targeting a new `IndexGeneration`.
   - Granular scopes:
     - `DOCUMENT`: Re-indexes chunks of a single document into the active generation.
     - `DOCUMENT_VERSION`: Re-indexes a specific version.
     - `REINDEX_ALL`: Initiates a new generation for all active document versions under a new `EmbeddingProfile`.
   - Bounded batching (16 to 32 chunks per batch) prevents memory exhaustion and Ollama thread saturation.
   - Retries with exponential backoff on transient timeouts.
4. **Pruning & Archival**:
   - When Generation $N+1$ is promoted, Generation $N$ transitions to `RETIRED`.
   - Retired generations are retained for a configurable retention window (default: 7 days) before background vacuuming and vector deletion.

## Consequences

### Positive

- Safe model upgrades and drift protection.
- Resilient recovery from partial failures during batch re-indexing.
- Predictable compute and memory utilization during heavy indexing workloads.

### Negative / Trade-offs

- Requires background job workers and periodic garbage collection for retired vector embeddings.
