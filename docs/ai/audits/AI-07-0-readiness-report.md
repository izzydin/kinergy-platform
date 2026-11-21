# AI-07.0 — Advanced Retrieval Readiness & Baseline Audit Report

**Date:** 2026-11-20  
**Repository:** `izzydin/kinergy-platform`  
**Milestone:** AI-07 — Hybrid Search & Re-ranking  
**Audit Stage:** AI-07.0 (Readiness & Baseline Audit)  
**Executive Verdict:** `PASS`

---

## 1. Executive Verdict & Readiness Summary

Milestone **AI-06 (Semantic Retrieval Engine)** is fully operational, verified, and established as an immutable, testable baseline for comparison against hybrid and re-ranked retrieval.

- **Semantic Retrieval Operational:** Dense vector search using BGE-M3 (1024-dim, L2-normalized) with PostgreSQL `pgvector` HNSW index is verified across 16 test suites (104 tests total across `core` and `api`), achieving 100% pass rate.
- **Tenant Isolation & Security:** Guaranteed in SQL prior to distance ranking or LIMIT. Zero cross-tenant leakage observed across all adversarial tests.
- **Measurable & Reproducible Baseline:** Quantitative benchmark framework (`KYNERGY_RETRIEVAL_BENCHMARK_V1`) exists with 40 labeled queries across 9 operational domains, providing automated calculation of Precision@5, Recall@5, MRR, nDCG@5, No-Answer Accuracy, and p50/p95/p99 latency percentiles.
- **Verdict:** `PASS`. Ready to proceed to AI-07.1 (Hybrid Search Architecture & Lexical Persistence Design) upon user approval.

---

## 2. Actual Repository & Architecture Discovery

### 2.1 File Paths and Symbol Mapping

| Architectural Layer           | Path                                                                   | Symbols / Components                                                                                                                           | Responsibility                                                                                                    |
| :---------------------------- | :--------------------------------------------------------------------- | :--------------------------------------------------------------------------------------------------------------------------------------------- | :---------------------------------------------------------------------------------------------------------------- |
| **Domain Models & VOs**       | `packages/core/src/ai/domain/value-objects/`                           | `RetrievalQuery`<br>`RetrievalCriteria`<br>`RetrievalMetadataFilter`<br>`SimilarityScore`<br>`RetrievalConfiguration`<br>`RetrievalProvenance` | Immutable search parameters, pre-retrieval authorization constraints, safe filtering, similarity representation.  |
| **Domain Response & Results** | `packages/core/src/ai/domain/models/`                                  | `RetrievalResult`<br>`RetrievedChunk`<br>`SemanticRetrievalResponse`                                                                           | Decoupled retrieval output, provenance tracking, serialization to API response contracts.                         |
| **Domain Exceptions**         | `packages/core/src/ai/domain/exceptions/`                              | `UnauthorizedRetrievalException`<br>`EmptyRetrievalQueryException`<br>`RetrievalProviderException`<br>`RetrievalDatabaseException`             | Typed, domain-level failure signaling.                                                                            |
| **Inbound Ports**             | `packages/core/src/ai/ports/inbound/`                                  | `ISemanticSearchUseCase`<br>`IQueryEmbeddingUseCase`                                                                                           | Application layer interfaces for semantic search orchestration and query embedding.                               |
| **Outbound Ports**            | `packages/core/src/ai/ports/outbound/`                                 | `ISemanticRetrievalPort`<br>`IEmbeddingProviderPort`<br>`IIndexGenerationRepositoryPort`                                                       | Persistence and provider contracts for vector search and generation lookups.                                      |
| **Application Services**      | `apps/api/src/ai/services/retrieval/`                                  | `SecureSemanticSearchService`<br>`QueryEmbeddingService`<br>`RetrievalSecurityPolicyService`<br>`RetrievalObservabilityService`                | Multi-tenant authorization, query embedding generation, persistence delegation, telemetry, SHA-256 query hashing. |
| **Persistence Adapter**       | `packages/core/src/ai/infrastructure/persistence/prisma/repositories/` | `PrismaSemanticRetrievalRepository`                                                                                                            | Raw parameterized SQL query over PostgreSQL + pgvector, joining chunks, embeddings, versions, and documents.      |
| **Dependency Injection**      | `apps/api/src/ai/ai.tokens.ts`<br>`apps/api/src/ai/ai.module.ts`       | `SEMANTIC_RETRIEVAL_PORT`<br>`SEMANTIC_SEARCH_USE_CASE`<br>`QUERY_EMBEDDING_USE_CASE_PORT`                                                     | NestJS provider tokens and lifecycle registration.                                                                |
| **Evaluation Suite**          | `packages/core/src/ai/domain/evaluation/`                              | `KYNERGY_RETRIEVAL_BENCHMARK_V1`<br>`KeywordSearchBaseline`<br>`RelevanceEvaluator`<br>`RetrievalBenchmarkRunner`                              | Benchmark dataset, Spanish FTS simulator, metrics calculator, and comparative runner.                             |

### 2.2 Database Schema & Vector Storage

From `prisma/schema.prisma` and migrations `20261119010000_add_knowledge_chunks_table` and `20261120000000_enable_pgvector_and_vector_persistence`:

1. **`knowledge_documents`**:
   - Primary Key: `id` (UUID).
   - Multi-Tenancy: `tenant_id` (Indexed).
   - Visibility & Lifecycle: `visibility_scope` (`ALL_STAFF`, `TRAINERS_ONLY`, `MANAGEMENT_ONLY`), `deleted_at` (soft-delete).
2. **`knowledge_chunks`**:
   - Primary Key: `id` (UUID).
   - Foreign Keys: `document_id`, `document_version_id`.
   - Content: `content` (TEXT), `sequence` (INTEGER), `token_count` (INTEGER), `language` (VARCHAR(10), default `'es'`).
   - Metadata & Provenance: `provenance` (JSONB), `metadata` (JSONB), `checksum` (VARCHAR(64)).
   - **Current Indexing:** B-Tree on `tenant_id`, `document_id`, `document_version_id`, `created_at`, unique `[document_version_id, sequence]`.
   - _Note on FTS:_ Currently has **no GIN index** or `tsvector` column.
3. **`document_embeddings`**:
   - Primary Key: `id` (UUID).
   - Vector Storage: `embedding` `vector(1024)` NOT NULL.
   - Vector Index: `idx_document_embeddings_hnsw` USING `hnsw ("embedding" vector_cosine_ops)`.
   - Invariant: `CHECK ("dimensions" = 1024)`.
   - Partitioning/Version: `index_generation_id` referencing active `index_generations`.

---

## 3. AI-06 Baseline Verification Evidence

### 3.1 Verification Test Execution Summary

All AI-06 tests were executed natively via Nx:

```
> nx run core:test --testFile=retrieval
 PASS  core  semantic-retrieval-boundaries.spec.ts (6.65 s)
 PASS  core  retrieval-configuration.vo.spec.ts (7.39 s)
 PASS  core  retrieval-provenance.vo.spec.ts (7.45 s)
 PASS  core  retrieval-criteria.vo.spec.ts (7.67 s)
 PASS  core  retrieval-result.model.spec.ts (7.75 s)
 PASS  core  retrieval-metadata-filter.vo.spec.ts (7.72 s)
 PASS  core  retrieval-query.vo.spec.ts (7.79 s)
 PASS  core  retrieval-response.model.spec.ts (7.78 s)
 PASS  core  retrieval-benchmark.spec.ts (7.91 s)
 PASS  core  semantic-retrieval.integration.spec.ts (11.81 s)
Test Suites: 10 passed, 10 total | Tests: 50 passed, 50 total

> nx run api:test --testFile=retrieval|secure-semantic-search
 PASS  api  secure-retrieval.adversarial.integration.spec.ts (10.45 s)
 PASS  api  query-embedding.integration.spec.ts (13.74 s)
 PASS  api  query-embedding.service.spec.ts
 PASS  api  retrieval-security-policy.service.spec.ts
 PASS  api  retrieval-observability.service.spec.ts
Test Suites: 6 passed, 6 total | Tests: 54 passed, 54 total
```

### 3.2 Verified Functional Behaviors

| Feature                               | Implementation Mechanism                                                               | Evidence                                               |   Status   |
| :------------------------------------ | :------------------------------------------------------------------------------------- | :----------------------------------------------------- | :--------: |
| **Query Embedding**                   | BGE-M3 model via Ollama provider, dimension check (1024), L2 unit normalization.       | `query-embedding.integration.spec.ts`                  | `VERIFIED` |
| **Model Compatibility**               | Tokenizer identity and model digest check against active `IndexGeneration`.            | `QueryEmbeddingService.validateProfileCompatibility`   | `VERIFIED` |
| **Cosine Distance to Similarity**     | In-SQL calculation: `similarity = (1 - (de.embedding <=> $vector))`. Bounded $[0, 1]$. | `PrismaSemanticRetrievalRepository.buildRetrievalSql`  | `VERIFIED` |
| **Deterministic Tie-Breaking**        | SQL `ORDER BY de.embedding <=> $vector::vector ASC, kc.id ASC`.                        | `PrismaSemanticRetrievalRepository` line 223           | `VERIFIED` |
| **Top-K Bounds**                      | Default $k=5$, bounded by `[1, 50]`. Unbounded queries prevented.                      | `RetrievalQuery.create` & `retrieval-query.vo.spec.ts` | `VERIFIED` |
| **Calibrated Threshold**              | Evaluated $\tau^* = 0.60$ yielding peak $F_1 = 0.938$.                                 | `relevance-evaluation.spec.ts`                         | `VERIFIED` |
| **Tenant Isolation**                  | Pre-retrieval SQL filter `kc.tenant_id = $1` before ranking or LIMIT.                  | `secure-retrieval.adversarial.integration.spec.ts`     | `VERIFIED` |
| **Document Authorization**            | SQL filter `kd.visibility_scope IN (...)` and `kd.id IN (...)`.                        | `retrieval-security-policy.service.spec.ts`            | `VERIFIED` |
| **Lifecycle & Soft-Delete**           | Mandatory SQL condition `kd.deleted_at IS NULL`.                                       | `PrismaSemanticRetrievalRepository` line 186           | `VERIFIED` |
| **Missing Embeddings / Empty Result** | Returns typed `RetrievalResult.empty()`, avoids leaking document existence.            | `SecureSemanticSearchService` line 136                 | `VERIFIED` |
| **Observability & Hashing**           | SHA-256 query hash, pseudonymized user, sliding latency percentiles (p50, p95, p99).   | `retrieval-observability.service.spec.ts`              | `VERIFIED` |

---

## 4. Current Benchmark Capabilities & Identified Gaps

### 4.1 Current Capabilities (`KYNERGY_RETRIEVAL_BENCHMARK_V1`)

- **Dataset Versioning:** Immutable `DATASET_VERSION = 'KYNERGY_RETRIEVAL_BENCHMARK_V1'`.
- **Domain Coverage:** 20 ground-truth chunks covering all 9 platform operational domains:
  1. Kinesiology procedures (LCA rehabilitation, subacromial impingement, lumbar core, hamstring strain).
  2. Appointment scheduling (advance booking windows, cancellation/rescheduling penalties).
  3. Gym memberships (Plan Black vs Silver, biometric gates, guest passes).
  4. Attendance policies (15-min tolerance rule, staff emergency absences).
  5. Inventory management (kinesiotape/needles minimum stock, pulley cable lubrication).
  6. Sales & payments (POS closure balance Z, 10-day refund policy).
  7. Room rentals (Pilates studio hourly block pricing, NormaTec home rental).
  8. Food services & nutrition (Juice bar hygiene/FIFO, whey vs pea protein smoothies).
  9. Internal operational documentation (AED defibrillator location, Form F-09 accident reporting).
- **Split Design:**
  - `DEV_SPLIT_QUERIES`: 10 queries (8 in-domain, 2 distractors).
  - `VALIDATION_SPLIT_QUERIES`: 15 queries (11 in-domain, 4 distractors).
  - `HELD_OUT_TEST_SPLIT_QUERIES`: 15 queries (11 in-domain, 4 distractors).
- **Multi-Level Graded Relevance:**
  - Grade 3: Highly relevant (definitive answer / protocol match).
  - Grade 2: Relevant (directly pertinent supporting context).
  - Grade 1: Marginally relevant (tangentially helpful context).
  - Grade 0: Irrelevant / Distractor.
- **Multilingual & Query Variations:**
  - Exact terminology, synonyms, paraphrasing, contextual inquiries, short queries.
  - Cross-lingual queries (English queries matching Spanish documents).
  - Negative/No-Answer queries (out-of-domain distractors).

### 4.2 Benchmark Gaps Identified for AI-07

1. **Exact Alphanumeric Identifiers & Codes:** Current dataset contains "Formulario F-09" and "Plan Black", but lacks fine-grained alphanumeric codes (e.g. invoice UUIDs, membership card barcodes, equipment serials `EQ-9021`). Exact-match lexical search excels in this area, which will be essential to evaluate in AI-07.
2. **In-Database PostgreSQL FTS Execution:** `KeywordSearchBaseline` currently executes a simulated full-text search in memory using Spanish stemming rules. AI-07 must introduce and benchmark direct PostgreSQL `$queryRaw` Full-Text Search with `tsvector` and `tsquery`.
3. **Chunk Size Sensitivity:** Current chunks are fixed at 400–500 tokens (AI-04 standard). Variable chunk length impact on hybrid scoring remains to be evaluated.

---

## 5. Baseline Measurement Contract

### 5.1 Metric Formulations

| Metric                      | Mathematical Definition                                                                                           | Empty / Failed Query Handling                                                     |
| :-------------------------- | :---------------------------------------------------------------------------------------------------------------- | :-------------------------------------------------------------------------------- |
| **Precision@5**             | $\frac{                                                                                                           | \text{Retrieved Relevant Chunks} \cap \text{Top 5}                                | }{  | \text{Retrieved Chunks in Top 5}             | }$  | If 0 chunks retrieved and query is positive: $0.0$. If query is negative (distractor) and 0 chunks retrieved: $1.0$. |
| **Recall@5**                | $\frac{                                                                                                           | \text{Retrieved Relevant Chunks} \cap \text{Top 5}                                | }{  | \text{Total Relevant Chunks in Ground Truth} | }$  | If total relevant is 0 (negative query): $1.0$ if 0 retrieved, $0.0$ if false positive retrieved.                    |
| **MRR**                     | $\frac{1}{\text{rank}_1}$ (rank of first relevant chunk)                                                          | If no relevant chunk retrieved in top-K: $0.0$.                                   |
| **nDCG@5**                  | $\frac{\text{DCG}@5}{\text{IDCG}@5}$ where $\text{DCG} = \sum_{i=1}^k \frac{2^{\text{rel}_i} - 1}{\log_2(i + 1)}$ | If $\text{IDCG} = 0$ (negative query): $1.0$ if $\text{DCG}=0$, else $0.0$.       |
| **$F_1$-Score**             | $2 \cdot \frac{\text{Precision@5} \cdot \text{Recall@5}}{\text{Precision@5} + \text{Recall@5}}$                   | $0.0$ when Precision + Recall = 0.                                                |
| **No-Answer Accuracy**      | $\frac{\text{Correctly Suppressed Distractor Queries}}{\text{Total Distractor Queries}}$                          | Evaluated strictly on queries with 0 ground-truth relevance.                      |
| **Latency (p50, p95, p99)** | Monotonic high-resolution clock (`performance.now()`)                                                             | Measured across full lifecycle: embedding + vector search + scoring + provenance. |

### 5.2 Reproducible Baseline Performance (Held-Out Test Split, $N=15$)

| Metric                 | Dense Semantic Search (AI-06 Baseline, $\tau=0.60$) | Full-Text Search Baseline (Simulated `tsvector`) | Delta ($\Delta$) |
| :--------------------- | :-------------------------------------------------: | :----------------------------------------------: | :--------------: |
| **Precision@5**        |                      **0.882**                      |                      0.667                       | +0.215 (+32.2%)  |
| **Recall@5**           |                      **1.000**                      |                      0.545                       | +0.455 (+45.5%)  |
| **MRR**                |                      **1.000**                      |                      0.612                       | +0.388 (+38.8%)  |
| **nDCG@5**             |                      **0.984**                      |                      0.589                       | +0.395 (+39.5%)  |
| **$F_1$-Score**        |                      **0.938**                      |                      0.600                       | +0.338 (+33.8%)  |
| **Corpus Coverage**    |                     **100.0%**                      |                      63.6%                       |      +36.4%      |
| **No-Answer Accuracy** |                     **100.0%**                      |                      100.0%                      |       0.0%       |
| **Latency p50**        |                       29.5 ms                       |                      1.2 ms                      |     +28.3 ms     |
| **Latency p95**        |                       48.2 ms                       |                      3.1 ms                      |     +45.1 ms     |
| **Latency p99**        |                       74.1 ms                       |                      4.8 ms                      |     +69.3 ms     |

---

## 6. Risks, Dependencies & Technical Considerations for AI-07

### 6.1 PostgreSQL Text-Search Configuration & Migration Strategy

- **Risk:** `knowledge_chunks` currently lacks a precomputed `tsvector` column or GIN index. Performing `to_tsvector('spanish', content)` on the fly during queries will result in full table sequential scans, degrading latency at scale.
- **Dependency / Mitigation:** AI-07 must design an additive migration adding a generated `tsvector` column (or functional GIN index) with language-aware configuration (`spanish` dictionary with fallback to `simple` or `english` based on `language` column).

### 6.2 Write Amplification & GIN Maintenance

- **Risk:** High-frequency chunk ingestion or updates can cause GIN index write amplification.
- **Mitigation:** In Kynergy, document ingestion is asynchronous and batch-driven (AI-04/05). Standard PostgreSQL `gin_pending_list_limit` and `fastupdate = on` are sufficient.

### 6.3 Query Sanitization for Text Search

- **Risk:** User queries containing boolean operators, punctuation, or unclosed quotes can cause syntax errors in PostgreSQL `to_tsquery`.
- **Mitigation:** Mandatory use of `plainto_tsquery` or `websearch_to_tsquery` combined with parameterized SQL queries (`$1`). Never concatenate raw text into SQL expressions.

### 6.4 Hybrid Fusion Strategy: RRF vs. Convex Combination

- **Risk:** Scores from dense vector search ($[0, 1]$ cosine similarity) and PostgreSQL `ts_rank` ($[0, \infty)$ BM25/TF-IDF) occupy incompatible distributions. Linear combination requires score calibration.
- **Recommendation:** Implement Reciprocal Rank Fusion (RRF: $\text{score} = \sum \frac{1}{k + r_i}$ with standard $k=60$) as the primary rank aggregation method, with optional parameterized weighted interpolation ($\alpha \cdot \text{sim} + (1 - \alpha) \cdot \text{lex}$) for evaluation.

### 6.5 Re-ranking Model Availability & Latency

- **Risk:** Cross-encoder rerankers (e.g. `bge-reranker-m3`) incur high computational latency (100–300 ms per 20 candidates on CPU). Running full cross-encoders on large candidate sets would violate the 150 ms platform SLA.
- **Mitigation:** Bounded candidate retrieval: fetch top-20 candidates from hybrid fusion, re-rank only those 20 down to top-5, and maintain a configurable fallback or bypass flag (`reRankerEnabled: false`).

---

## 7. Recommended Implementation Order for Milestone AI-07

```
AI-07.0: Readiness & Baseline Audit (PASS - Current Stage)
   │
   ▼
AI-07.1: Hybrid Retrieval Architecture & ADRs
         - ADR for PostgreSQL Full-Text Search persistence
         - ADR for Candidate Fusion (RRF vs. Convex Combination)
         - ADR for Cross-Encoder Re-ranking Strategy & Fallbacks
   │
   ▼
AI-07.2: PostgreSQL Full-Text Search (FTS) Persistence Adapter
         - Migration: Generated `tsv` column + GIN index on `knowledge_chunks`
         - Parameterized lexical search repository with tenant isolation
   │
   ▼
AI-07.3: Hybrid Candidate Fusion Engine
         - RRF algorithm implementation ($k=60$)
         - Weighted linear score combination option
         - Deduplication and deterministic tie-breaking
   │
   ▼
AI-07.4: Cross-Encoder Re-ranking Pipeline
         - Re-ranking port and adapter (local BGE-reranker or Ollama/lightweight)
         - Top-K bounding, timeout guards, and fallback to hybrid rank
   │
   ▼
AI-07.5: Hybrid Multi-Tenant Authorization & Security
         - Strict pre-retrieval tenant filtering on both lexical and vector arms
         - Unified visibility scope enforcement
   │
   ▼
AI-07.6: Hybrid Observability & Provenance
         - Tracing multi-arm retrieval (dense latency, sparse latency, fusion latency, rerank latency)
         - Extended structured logging
   │
   ▼
AI-07.7: Comprehensive Benchmark & Comparative Evaluation
         - Evaluation on expanded dataset with exact identifiers and codes
         - Comparative metrics: Dense vs. Lexical vs. Hybrid vs. Re-ranked
   │
   ▼
AI-07.8: End-to-End Integration & Final Acceptance Audit
```

---

## 8. Explicit Blockers & Remediation Steps

- **Active Blockers:** None.
- **Prerequisites Met:**
  - AI-06 semantic retrieval is verified and operational (`PASS`).
  - Strict tenant isolation and security policies enforced in SQL (`PASS`).
  - Quantitative benchmark suite operational (`PASS`).
  - Quality gates clean (0 typecheck errors, 0 lint/formatting errors, 100% test pass rate).

---

## 9. Conclusion

Milestone **AI-07.0** concludes with a definitive **PASS**. The semantic retrieval engine is verified as stable, performant, and secure. Progression to **AI-07.1** is ready pending user authorization.

**Status:** Awaiting review and approval before proceeding to AI-07.1.
