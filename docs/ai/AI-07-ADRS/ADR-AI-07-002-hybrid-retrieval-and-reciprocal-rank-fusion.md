# ADR-AI-07-002: Hybrid Retrieval Orchestration & Reciprocal Rank Fusion (RRF)

## Status

Accepted

## Context

In Milestone AI-06, Kynergy Platform established a semantic vector retrieval engine using 1024-dimensional BGE-M3 dense embeddings and pgvector HNSW indexing. In AI-07.1, an independent lexical full-text search engine was implemented using PostgreSQL's stored generated `tsvector` column and GIN indexing (`ILexicalRetrievalPort`, `PrismaLexicalRetrievalRepository`).

Empirical benchmarks demonstrate distinct complementary strengths between both engines:

1. **Semantic Vector Search:** Excels at synonyms, cross-lingual queries (e.g. English query against Spanish corpus), and conceptual paraphrasing (100% recall on complex clinical queries), but incurs higher computational latency (~20–28 ms) and occasionally suffers precision degradation on strict entity identifiers or exact codes.
2. **Lexical Full-Text Search:** Delivers ultra-low latency (~1.0–1.4 ms) and high precision on exact codes, domain acronyms, and terminology ("Plan Black", "LCA", "crioterapia"), but fails on paraphrasing (0% recall on unseen vocabulary) and cross-lingual translation.

To combine both candidate lists into a unified, high-precision ranking without introducing raw score distortion (comparing unbounded PostgreSQL `ts_rank` with bounded cosine similarity $[0, 1]$), a hybrid retrieval orchestration and rank-fusion strategy is required.

## Decision

1. **Domain-Layer Reciprocal Rank Fusion Engine (`ReciprocalRankFusion`):**
   - Implement pure, technology-independent RRF formulation:
     $$RRF(d) = \sum_{m \in M} \frac{1}{k_{\text{rrf}} + r_m(d)}$$
     where $k_{\text{rrf}} = 60$ (configurable, default), $r_m(d)$ is the 1-based rank of candidate chunk $d$ in retrieval arm $m \in \{\text{semantic}, \text{keyword}\}$, and missing candidates contribute 0.
   - **Normalized Score Contract:** Theoretical maximum score for 2 retrieval arms is $\frac{2}{k_{\text{rrf}} + 1}$. To strictly satisfy domain `SimilarityScore` invariants in $[0.0, 1.0]$ without disrupting relative rank order, normalize fused scores as:
     $$\text{normalizedScore} = \text{clamp}\left(RRF(d) \cdot \frac{k_{\text{rrf}} + 1}{2}, 0.0, 1.0\right)$$
   - **Deduplication Identity:** Deduplicate candidate chunks using the authoritative knowledge chunk identity (`chunk.chunkId.value`, corresponding to `kc.id` in PostgreSQL).
   - **Deterministic Tie-Breaking:** In cases where fused RRF scores are equal within floating-point tolerance ($|\Delta| \le 10^{-9}$), break ties lexicographically on `chunk.chunkId.value ASC`.
   - **Provenance & Telemetry Preservation:** Preserve origin ranks (`semanticRank`, `lexicalRank`), candidate sources (`['semantic']`, `['keyword']`, or `['semantic', 'keyword']`), and strategy tag (`'HYBRID'`).

2. **Application-Layer Orchestration (`SecureSemanticSearchService`):**
   - Orchestrate retrieval via selectable search modes (`SEMANTIC`, `KEYWORD`, `HYBRID`) through `command.searchMode`, defaulting to `SEMANTIC` for backward compatibility until Milestone AI-07.7.
   - **Symmetric Authorization & Fail-Closed Security:** Both semantic and keyword candidate generation pipelines apply tenant isolation (`ig.tenant_id = $2`, `kd.tenant_id = $2`, `kc.tenant_id = $2`), RBAC visibility scope clearance (`kd.visibility_scope IN (...)`), document-level access grants, and soft-delete exclusion (`kd.deleted_at IS NULL`) in SQL before ranking and candidate `LIMIT`. Unauthorized chunks never reach the fusion stage.
   - **Concurrent Fan-Out (`Promise.allSettled`):** In `HYBRID` mode, trigger semantic vector search and lexical search in parallel. Candidate limits default to `retrievalSemanticCandidateLimit: 20` and `retrievalKeywordCandidateLimit: 20`.
   - **Resilient Fallback:** If one retrieval arm fails or produces zero candidates (e.g., no active vector index generation for a tenant, or zero keyword matches), gracefully fall back to the surviving candidate set without throwing unless both arms fail.

3. **Pre-Fusion Candidate Filtering:**
   - Pre-filter semantic candidates with the calibrated similarity threshold (0.60) to prevent irrelevant vector distractors from entering the RRF pool.
   - Pre-filter keyword candidates to positive textual matches (`ts_rank > 0.0`).

## Consequences

- **Positive:**
  - **Superior Hybrid Recall:** Achieves 100% recall across exact terminology, conceptual synonyms, and multilingual queries on the Kynergy evaluation benchmark.
  - **Scale Invariance:** RRF eliminates the fragile need to normalize or linearly calibrate wildly different scoring functions (`ts_rank` vs cosine similarity).
  - **Deterministic & Auditable:** RRF ranking order is 100% deterministic, with explicit telemetry indicating which retrieval arm surfaced each result.
  - **Backward Compatibility:** Existing default retrieval mode remains `SEMANTIC`. No production callers are affected.
- **Negative / Trade-offs:**
  - **Parallel Fan-out Latency:** Hybrid search incurs the maximum latency of the two arms ($\sim 20$ ms due to dense query embedding and pgvector search).
  - **Lexical Distractor Spurious Matches:** Out-of-domain queries with common dictionary words (e.g. "clase", "reserva") may pass the lexical arm and appear in hybrid results, motivating the Cross-Encoder re-ranker planned for AI-07.4.
