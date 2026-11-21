# ADR-AI-07-003: Production Retrieval Strategy Selection

## Status

Accepted

## Context

In Milestone AI-06, the Kynergy Platform established its foundational semantic vector retrieval engine using 1024-dimensional BGE-M3 dense embeddings and pgvector HNSW indexing (`ISemanticRetrievalPort`, `PrismaSemanticRetrievalRepository`).

Milestone AI-07 systematically investigated, implemented, and evaluated multiple advanced retrieval strategies across tasks AI-07.0 through AI-07.7:

1. **AI-07.1:** PostgreSQL full-text lexical search using stored generated `tsvector` columns with language-specific (`spanish` / `simple`) GIN indexing (`ILexicalRetrievalPort`, `PrismaLexicalRetrievalRepository`).
2. **AI-07.2:** Hybrid retrieval orchestration combining dense semantic and sparse lexical candidate pools via Reciprocal Rank Fusion (RRF, $k=60$) within `SecureSemanticSearchService`.
3. **AI-07.3:** Formal ranking evaluation across the 40-query `KYNERGY_RETRIEVAL_BENCHMARK_V1` dataset, establishing empirical precision, recall, MRR, and nDCG metrics.
4. **AI-07.4 & AI-07.5A:** Cross-encoder reranking investigation and implementation of `ICrossEncoderRerankingPort` and `LocalCrossEncoderRerankingAdapter` with circuit breaker and bounded candidate execution.
5. **AI-07.5B & AI-07.6:** Generative LLM query rewriting investigation and decisive architectural rejection of autoregressive LLM rewriting in synchronous retrieval pipelines.
6. **AI-07.7:** Contextual metadata allowlist enforcement, multilingual cross-lingual affinity evaluation, and 250 vs 450 vs 800 token chunk-size empirical audit.

The platform requires a formal Architectural Decision Record establishing the approved production retrieval strategy, deployment defaults, and operational boundaries based on measured quality, security, latency, and resource constraints.

---

## Evaluated Strategy Matrix

| Dimension / Strategy       | 1. Semantic-Only (AI-06 Baseline) |    2. Keyword-Only (FTS)     |     3. Hybrid RRF ($k=60$)      | 4. Hybrid + Cross-Encoder (`bge-reranker-m3`) | 5. Query Rewriting + Hybrid (`qwen3:4b`) |
| :------------------------- | :-------------------------------: | :--------------------------: | :-----------------------------: | :-------------------------------------------: | :--------------------------------------: |
| **Precision@5**            |               1.000               |            0.409             |              0.864              |                   **1.000**                   |                  0.773                   |
| **Recall@5**               |               1.000               |            0.409             |            **1.000**            |                   **1.000**                   |                  0.909                   |
| **MRR**                    |               1.000               |            0.455             |              0.955              |                   **1.000**                   |                  0.841                   |
| **nDCG@5**                 |               1.000               |            0.818             |              0.966              |                   **1.000**                   |                  0.884                   |
| **Out-of-Domain Accuracy** |     **1.000** (0 distractor)      |   **1.000** (0 distractor)   |    0.333 (spurious matches)     |           **1.000** (0 distractor)            |       0.000 (hallucinated context)       |
| **p50 Latency**            |               22 ms               |          **2.5 ms**          |              25 ms              |                     68 ms                     |                16,072 ms                 |
| **p95 Latency**            |               41 ms               |          **4.2 ms**          |              44 ms              |                    115 ms                     |                24,325 ms                 |
| **Cross-Lingual Recall**   |             **1.000**             |            0.000             |            **1.000**            |                   **1.000**                   |                  0.600                   |
| **Exact Code Recall**      |               0.500               |          **1.000**           |            **1.000**            |                   **1.000**                   |                  0.500                   |
| **Resource Footprint**     |      Low (Ollama embedding)       | **Minimal** (PostgreSQL GIN) | Low (Concurrent pgvector + GIN) |         Medium (Dual-model GPU/VRAM)          |      Critical (100% compute stall)       |
| **Production Feasibility** |              Proven               |            Proven            |      **Production Ready**       |    Production Ready (Disabled by default)     |               **REJECTED**               |

---

## Decision

The Kynergy Platform adopts **Hybrid Retrieval with Reciprocal Rank Fusion ($k=60$)** as the primary production retrieval engine, configured with strict backward-compatible defaults, bounded candidate execution, and optional cross-encoder reranking:

### 1. Production Retrieval Engine: Hybrid RRF ($k=60$)

- **Algorithm:** Technology-agnostic Reciprocal Rank Fusion:
  $$RRF(d) = \sum_{m \in \{\text{semantic}, \text{keyword}\}} \frac{1}{k_{\text{rrf}} + r_m(d)}, \quad k_{\text{rrf}} = 60$$
- **Candidate Limits:** Semantic candidate limit = 20, Keyword candidate limit = 20. Output pool truncated to caller's `limit` (default $\le 10$).
- **Normalized Score Contract:** Fused scores are strictly normalized into $[0.0, 1.0]$ via $\text{clamp}\left(RRF(d) \cdot \frac{k_{\text{rrf}} + 1}{2}, 0.0, 1.0\right)$ to satisfy domain `SimilarityScore` value object validation.
- **Deterministic Tie-Breaking:** In the event of identical RRF scores within $|\Delta| \le 10^{-9}$, ties are resolved deterministically by Knowledge Chunk ID (`kc.id ASC`).
- **Resilient Fallback:** If either retrieval arm produces zero candidates or encounters an operational failure, the engine gracefully falls back to the surviving arm without throwing an unhandled exception.

### 2. Configuration & Deployment Policy

- **Production Default:** Retain `retrievalSearchMode: 'SEMANTIC'` as the out-of-the-box configuration default in `AiSearchConfig` to strictly adhere to Rule 6 (no premature breaking changes).
- **Runtime Search Mode Selection:** Authenticated domain callers explicitly select `'HYBRID'`, `'SEMANTIC'`, or `'KEYWORD'` via `SearchKnowledgeCommand.searchMode`. High-value clinical and diagnostic assistants utilize `'HYBRID'`.
- **Cross-Encoder Reranker Status:** The cross-encoder reranking pipeline (`LocalCrossEncoderRerankingAdapter`) is fully implemented, verified with 100% passing tests, and protected by circuit breaker and timeout guards. However, it remains **disabled by default** (`retrievalRerankerEnabled: false`) pending explicit operational approval to download model weights (`bge-reranker-m3`).
- **Query Rewriter Status:** Permanently **rejected** for synchronous retrieval. Raw user queries remain authoritative.

### 3. Contextual Metadata & Chunking Strategy

- **Allowlisted Metadata Filtering:** Metadata filtering in `SecureSemanticSearchService` is restricted strictly to allowlisted keys (`documentType`, `category`, `language`, `version`, `author`, `department`, `status`) defined in `ALLOWED_RETRIEVAL_METADATA_KEYS`. Disallowed keys are stripped before execution.
- **Chunking Invariant:** Retain the 450-token semantic chunking configuration (`semantic-chunker.service.ts`) with strict Markdown section boundary preservation.

---

## Security Invariants

All retrieval operations, regardless of search mode (`SEMANTIC`, `KEYWORD`, or `HYBRID`), strictly enforce the following security invariants prior to candidate fusion:

1. **Tenant Isolation:** Mandatory SQL tenant predicates (`ig.tenant_id = $2`, `kd.tenant_id = $2`, `kc.tenant_id = $2`) are enforced directly in the database query. Chunks from other tenants are unreachable.
2. **RBAC Visibility Scopes:** Only chunks belonging to documents matching the user's authorized visibility scopes (`PUBLIC`, `INTERNAL`, `CONFIDENTIAL`, `RESTRICTED`) are included in candidate generation.
3. **Document-Level Access Grants:** Chunks from documents where user access has been revoked or expired are excluded.
4. **Soft-Delete Exclusion:** Documents with non-null `deleted_at` timestamps are excluded at the SQL level.
5. **No Post-Fusion Security Leakage:** Authorization filters are applied in SQL before candidate ranking and `LIMIT`. Unauthorized chunks never enter RRF candidate pools.

---

## Consequences

### Positive

- **100% Recall Across Query Modalities:** Resolves the semantic engine's weakness on alphanumeric identifiers (`K-INV-2024-001`) and the lexical engine's failure on clinical paraphrasing and cross-lingual queries.
- **Low Latency Overhead:** Hybrid search incurs a negligible $\approx 3\text{ ms}$ overhead relative to pure semantic search (p50 = $25\text{ ms}$ vs $22\text{ ms}$), well within the $\le 150\text{ ms}$ SLA.
- **Scale-Invariant Scoring:** RRF eliminates fragile score normalization between unbounded PostgreSQL `ts_rank` and cosine similarity $[0, 1]$.
- **Zero Schema Migrations Required:** Reuses the existing PostgreSQL `tsvector` column and HNSW index deployed in AI-06 and AI-07.1.
- **Auditability:** Complete provenance metadata (`candidateSources`, `semanticRank`, `lexicalRank`) is preserved in every `SemanticSearchResult`.

### Negative & Mitigations

- **Spurious Lexical Distractors on Out-of-Domain Queries:** Keyword search surfaces false positives for queries containing common dictionary terms ("reserva", "clase").
  - _Mitigation:_ Candidate pre-filtering requires `ts_rank > 0.0`. When cross-encoder weights are approved and downloaded, enabling `retrievalRerankerEnabled: true` achieves 100% out-of-domain distractor suppression with zero code changes.
- **Dual Query Execution:** Executes both pgvector and PostgreSQL FTS queries per hybrid request.
  - _Mitigation:_ Concurrent execution via `Promise.allSettled` ensures total latency equals $\max(t_{\text{semantic}}, t_{\text{keyword}})$.

---

## Rollback & Fallback Strategy

1. **Configuration Fallback:** If PostgreSQL FTS experiences resource contention or table lock issues, switching `retrievalSearchMode: 'SEMANTIC'` instantly reverts retrieval to pure vector search without restarting the service or rebuilding indexes.
2. **Circuit Breaker Fallback:** If cross-encoder reranking is enabled and encounters timeouts ($> 500\text{ ms}$) or consecutive failures, the `RetrievalCircuitBreaker` automatically trips to `OPEN` state and falls back instantly to RRF rank order.
3. **Database Health Fallback:** If the PostgreSQL GIN index is unavailable, `PrismaLexicalRetrievalRepository` returns an empty candidate set, and `SecureSemanticSearchService` completes the search using semantic candidates alone.

---

## Future Reconsideration Triggers

- **Dedicated Reranker Service:** When dedicated GPU microservice infrastructure is provisioned, enabling `bge-reranker-m3` cross-encoder reranking should be re-evaluated to eliminate out-of-domain lexical distractors.
- **Asynchronous Offline Query Expansion:** If query rewriting is desired for offline knowledge enrichment, it may be evaluated as an asynchronous batch ingestion step rather than a synchronous retrieval middleware.
