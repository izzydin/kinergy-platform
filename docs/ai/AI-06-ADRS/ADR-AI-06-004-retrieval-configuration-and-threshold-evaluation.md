# ADR-AI-06-004: Retrieval Configuration & Threshold Evaluation Strategy

## Status

Accepted

## Context

In semantic vector retrieval, setting arbitrary or hardcoded similarity cutoffs across different domains causes severe failure modes:

1. Setting too high a cutoff (e.g. 0.90) results in false negatives where valid semantic matches with slight vocabulary differences are dropped.
2. Setting too low a cutoff (e.g. 0.30) returns irrelevant noise or hallucinated context.
3. Hardcoding top-K prevents UI clients from adapting to different context window limits or summarization needs.

Furthermore, cosine similarity scores must remain mathematically rigorous and consistent across PostgreSQL, the core domain, and presentation DTOs.

## Decision

1. **System Defaults & Safe Bounds:**
   - `defaultTopK = 5` (balanced default for LLM context prompts).
   - `maxTopK = 50` (enforces query performance and prevents vector search exhaustion).
   - `similarityMetric = 'cosine'` (using pgvector `<=>`).
   - `embeddingModel = 'bge-m3'` (strictly 1,024 dimensions).
   - `defaultMinSimilarity = 0.0` (returns top-K closest vectors by default, leaving relevance filtering to explicit caller parameters).
2. **Normalized Similarity Score VO:**
   - Encapsulate scores in `SimilarityScore` value object.
   - Restrict values to $[0.0, 1.0]$ with 6 decimal places of precision.
   - Formula:
     $$\text{similarity} = \max(0.0, \min(1.0, 1.0 - \text{distance}))$$
3. **Threshold Evaluation Strategy:**
   - If caller supplies `minSimilarity` ($0.0 < \tau \le 1.0$), evaluate the threshold in SQL before `LIMIT`.
   - Support optional post-retrieval filtering via `RetrievalResult.filterByMinSimilarity(score)` for dynamic caller adjustment.
4. **Environment-Aware Configuration:**
   - Configuration is validated at application startup using `RetrievalConfiguration`.
   - Dimension changes from 1,024 are rejected at initialization.

## Consequences

### Positive

- **Mathematical Consistency:** Precision rounding and range clamping prevent IEEE 754 floating-point inaccuracies.
- **Configurability:** Supports both strict thresholding (precision-oriented tasks) and unconstrained top-K (discovery-oriented tasks).
- **Safety:** Hard upper limit ($K \le 50$) prevents denial-of-service or database query buffer bloat.

### Negative / Trade-offs

- Users must be educated that cosine similarity is model-dependent: a score of 0.75 in BGE-M3 reflects strong semantic similarity, whereas in smaller models it might reflect weak similarity.
