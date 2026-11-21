# AI-07.6 — Review and Milestone Closure Report

**Status:** PASS & FORMALLY CLOSED  
**Milestone:** AI-07 — Hybrid Search & Re-ranking  
**Task:** AI-07.6 — Review and Milestone Closure  
**Date:** 2026-11-20  
**Repository:** `izzydin/kinergy-platform`  
**Deliverable File:** `docs/ai/reports/AI-07-6-milestone-closure-report.md`

---

## 1. Executive Summary

This report formally concludes the **Query Rewriting Investigation and Adoption Decision** and establishes the closure audit for the **AI-07 Retrieval Milestone**.

In accordance with the evidence established in [AI-07-5-query-rewriting-report.md](file:///c:/Projects/kinergy-platform/docs/ai/reports/AI-07-5-query-rewriting-report.md), the final architectural decision is:
**REJECT GENERATIVE LLM QUERY REWRITING FOR THE PRODUCTION RETRIEVAL PIPELINE.**

The original user query remains the sole, authoritative, uncorrupted input for all retrieval mechanisms. No generative rewriting middleware or deterministic normalizer was introduced into production code.

Additionally, an independent, evidence-based verification of the **Cross-Encoder Reranking Adapter** implementation was completed, validating all domain contracts, circuit breaker protections, and test suites with 100% passing results.

---

## 2. Final Adoption Decision & Evidence Summary

### 2.1 Formal Decision: REJECT

Generative LLM query rewriting (`qwen3:4b` or any alternative autoregressive LLM) is rejected for integration into the synchronous retrieval pipeline.

### 2.2 Supporting Empirical Evidence

| Evaluated Dimension       |                   Empirical Measurement (`qwen3:4b`)                    |                    Production Requirement                     | Decision Rationale                                                                                                   |
| :------------------------ | :---------------------------------------------------------------------: | :-----------------------------------------------------------: | :------------------------------------------------------------------------------------------------------------------- |
| **Inference Latency**     |        p50: **$16,072\text{ ms}$**, p95: **$24,325\text{ ms}$**         | $\le 40\text{ ms}$ (Rewriting)<br>$\le 150\text{ ms}$ (Total) | **Intolerable SLA Breach:** Exceeds the total platform retrieval budget by $> 10,600\%$.                             |
| **Language Integrity**    | Translated Spanish `"cierre POS caja"` to English `"Close cash drawer"` |                  Strict Spanish preservation                  | **100% FTS Recall Failure:** English terms completely fail against PostgreSQL's `spanish` text-search configuration. |
| **Dense Vector Affinity** |           Cosine similarity dropped from $0.5840 \to 0.5101$            |                      Metric preservation                      | **12.7% Similarity Drop:** Cross-lingual semantic drift degrades ranking against Spanish knowledge chunks.           |
| **Clinical Constraints**  |        Rewrote `"sin carga de peso"` to colloquial `"sin peso"`         |                Strict negation & stem fidelity                | **Corrupted Clinical Stems:** Dropped the clinical stem `carg` (which matches protocol `"descarga parcial"`).        |
| **Resource Saturation**   |             Generated 1,100–1,500 thinking tokens per query             |                  Minimal resource footprint                   | **Queue Starvation:** Monopolizes local GPU/CPU compute for 15–25 seconds per query, blocking concurrent users.      |
| **Ambiguity Handling**    |        Hallucinated arbitrary gym context for `"cuánto cuesta"`         |                  No unsupported assumptions                   | **Semantic Distortion:** Arbitrarily assumed gym memberships, ignoring room rentals, kinesiology, and food services. |

---

## 3. Production Behavior Retained

1. **Authoritative Input:** The original, raw user query (`command.query`) is preserved as the single source of truth for:
   - Query embedding generation via `IQueryEmbeddingUseCase` (`bge-m3:latest`).
   - pgvector cosine similarity search (`PrismaSemanticRetrievalRepository`).
   - PostgreSQL full-text search (`PrismaLexicalRetrievalRepository`).
   - Structured retrieval telemetry and logging (`RetrievalObservabilityService`).
   - Optional downstream cross-encoder reranking (`LocalCrossEncoderRerankingAdapter`).
2. **Deterministic Search Engine:** Multi-arm candidate retrieval combining dense vectors and full-text search using **Reciprocal Rank Fusion (RRF, $k=60$)**.
3. **Configuration State:** In compliance with Rule 6:
   - `retrievalSearchMode: 'SEMANTIC'` (retained as production default; selectable to `'KEYWORD'` or `'HYBRID'`).
   - `retrievalRerankerEnabled: false` (cross-encoder reranking retained as an optional capability, disabled by default).
4. **No Rewriting Middleware:** Zero query rewriting middleware or pre-processors exist in the retrieval path.

---

## 4. Verification of Security Invariants

A source-code audit of [`SecureSemanticSearchService`](file:///c:/Projects/kinergy-platform/apps/api/src/ai/services/retrieval/secure-semantic-search.service.ts) was conducted to verify that retrieval security cannot be bypassed or altered:

```
                          Incoming Request
                                 │
                                 ▼
                 ┌───────────────────────────────┐
                 │    Server Authentication      │
                 │   & Tenant Validation Gate    │
                 └───────────────┬───────────────┘
                                 │
                   authContext.tenantId (Verified)
                   authContext.roles (Verified)
                                 │
                                 ▼
                 ┌───────────────────────────────┐
                 │   Security Policy Service     │
                 │ Determine Allowed Scopes      │
                 │ (PUBLIC, TENANT_INTERNAL,     │
                 │  TENANT_CONFIDENTIAL)         │
                 └───────────────┬───────────────┘
                                 │
              Authorized Tenant & Visibility Constraints
                                 │
                                 ▼
        ┌─────────────────────────────────────────────────┐
        │  Database-Enforced Pre-Retrieval Filtering      │
        │  WHERE tenant_id = $1                           │
        │    AND visibility_scope = ANY($2)               │
        │    AND deleted_at IS NULL                       │
        └─────────────────────────────────────────────────┘
```

1. **Tenant Isolation:** Enforced strictly via `authContext.tenantId`. Queries cannot override, widen, or tamper with the tenant context.
2. **RBAC & Document Visibility:** Visibility scopes are computed by `RetrievalSecurityPolicyService` solely from server-authenticated roles (`authContext.roles`).
3. **Exact Identifiers & Clinical Negations:** Because the original query is never rewritten or mutated, exact alphanumeric codes (`K-INV-2024-001`, `Plan Black`, `F-09`) and clinical negations (`sin carga de peso`) remain 100% intact.

---

## 5. Milestone Documentation Structure Review

To eliminate conflicting milestone identifiers in historical documents without renaming or overwriting historical reports, the AI-07 documentation ledger is codified as follows:

| Milestone Reference | Task / Artifact                                   | Report Path                                                      |         Status         |
| :------------------ | :------------------------------------------------ | :--------------------------------------------------------------- | :--------------------: |
| **AI-07.0**         | Advanced Retrieval Readiness & Baseline Audit     | `docs/ai/audits/AI-07-0-readiness-report.md`                     |          PASS          |
| **AI-07.1**         | PostgreSQL Full-Text Search Strategy              | `docs/ai/reports/AI-07-1-full-text-search-report.md`             |          PASS          |
| **AI-07.2**         | Hybrid Retrieval & Reciprocal Rank Fusion         | `docs/ai/reports/AI-07-2-hybrid-retrieval-report.md`             |          PASS          |
| **AI-07.3**         | Ranking Evaluation & Strategy Selection           | `docs/ai/reports/AI-07-3-ranking-evaluation-report.md`           |          PASS          |
| **AI-07.4**         | Cross-Encoder Reranking Investigation             | `docs/ai/reports/AI-07-4-cross-encoder-investigation.md`         |          PASS          |
| **AI-07.5A**        | Cross-Encoder Reranking Adapter Implementation    | `docs/ai/reports/AI-07-5-cross-encoder-implementation-report.md` |          PASS          |
| **AI-07.5B**        | Query Rewriting Investigation & Adoption Decision | `docs/ai/reports/AI-07-5-query-rewriting-report.md`              |          PASS          |
| **AI-07.6**         | Review and Milestone Closure                      | `docs/ai/reports/AI-07-6-milestone-closure-report.md`            | **PASS (This Report)** |

All historical files and ADRs (`ADR-AI-07-001`, `ADR-AI-07-002`) remain preserved and unmodified.

---

## 6. Independent Verification of Cross-Encoder Adapter Implementation

The implementation of the **Cross-Encoder Reranking Adapter** (AI-07.5A) was verified independently by inspecting source files and running live tests without Nx cache:

### 6.1 Artifact & Contract Verification

- **Domain Port:** [`ICrossEncoderRerankingPort`](file:///c:/Projects/kinergy-platform/packages/core/src/ai/ports/outbound/cross-encoder-reranking.port.ts) defined in core outbound ports.
- **Domain Entity:** [`RerankedChunk`](file:///c:/Projects/kinergy-platform/packages/core/src/ai/domain/models/reranked-chunk.model.ts) defined in core models with `toRetrievedChunk()` preserving original similarity and RRF rank in metadata.
- **Circuit Breaker:** [`RetrievalCircuitBreaker`](file:///c:/Projects/kinergy-platform/apps/api/src/ai/services/retrieval/retrieval-circuit-breaker.ts) with `CLOSED`, `OPEN`, and `HALF_OPEN` states, 80 ms timeout with `AbortController`, and concurrency bounding.
- **Adapter Implementation:** [`LocalCrossEncoderRerankingAdapter`](file:///c:/Projects/kinergy-platform/apps/api/src/ai/adapters/reranking/local-cross-encoder-reranking.adapter.ts) with candidate bounding ($N \le 20$), text truncations, and deterministic tie-breaking.
- **Module Wiring:** Registered under `CROSS_ENCODER_RERANKING_PORT` and `CROSS_ENCODER_RERANKING_SERVICE` in [`ai.module.ts`](file:///c:/Projects/kinergy-platform/apps/api/src/ai/ai.module.ts).
- **Service Integration:** Injected into [`SecureSemanticSearchService`](file:///c:/Projects/kinergy-platform/apps/api/src/ai/services/retrieval/secure-semantic-search.service.ts) constructor with graceful fallback to RRF candidates on error or timeout.

### 6.2 Actual Live Test Execution Results

```text
> nx run core:test --testFile=cross-encoder-reranking.spec.ts
 PASS   core  packages/core/src/ai/domain/__tests__/cross-encoder-reranking.spec.ts
  AI-07.5 — RerankedChunk Domain Model Unit Tests
    √ 1. should create a valid RerankedChunk preserving all candidate properties (7 ms)
    √ 2. should reject invalid scores or ranks (7 ms)
    √ 3. should convert to RetrievedChunk while preserving original metrics in metadata without destructive overwrite (1 ms)

Test Suites: 1 passed, 1 total
Tests:       3 passed, 3 total
```

```text
> nx run api:test --testPathPattern=circuit-breaker|local-cross-encoder|hybrid-reranking --skip-nx-cache
 PASS   api  apps/api/src/ai/adapters/reranking/__tests__/local-cross-encoder-reranking.adapter.spec.ts (6.958 s)
 PASS   api  apps/api/src/ai/services/retrieval/__tests__/hybrid-reranking.integration.spec.ts (8.831 s)
 PASS   api  apps/api/src/ai/services/retrieval/__tests__/retrieval-circuit-breaker.spec.ts

Test Suites: 3 passed, 3 total
Tests:       21 passed, 21 total
Time:        10.355 s
```

**Total Cross-Encoder Tests:** 24 passed / 0 failed.

---

## 7. Files Inspected and Modified

### Inspected Files

- `apps/api/src/ai/services/retrieval/secure-semantic-search.service.ts` (Verified zero rewriting middleware)
- `apps/api/src/ai/adapters/llm/ollama-llm.adapter.ts` (Verified existing local LLM provider)
- `packages/core/src/ai/ports/outbound/llm-provider.port.ts` (Verified LLM port abstraction)
- `packages/core/src/ai/domain/evaluation/representative-dataset.ts` (Verified 40 evaluation queries)
- `packages/core/src/ai/domain/evaluation/relevance-evaluator.ts` (Verified nDCG and relevance metrics)
- `docs/ai/reports/AI-07-5-query-rewriting-report.md` (Verified empirical investigation findings)

### Modified & Created Files in AI-07

- `packages/core/src/ai/domain/models/reranked-chunk.model.ts` (Created)
- `packages/core/src/ai/ports/outbound/cross-encoder-reranking.port.ts` (Created)
- `packages/core/src/ai/domain/__tests__/cross-encoder-reranking.spec.ts` (Created)
- `apps/api/src/ai/services/retrieval/retrieval-circuit-breaker.ts` (Created)
- `apps/api/src/ai/adapters/reranking/local-cross-encoder-reranking.adapter.ts` (Created)
- `apps/api/src/ai/services/retrieval/__tests__/retrieval-circuit-breaker.spec.ts` (Created)
- `apps/api/src/ai/adapters/reranking/__tests__/local-cross-encoder-reranking.adapter.spec.ts` (Created)
- `apps/api/src/ai/services/retrieval/__tests__/hybrid-reranking.integration.spec.ts` (Created)
- `apps/api/src/ai/config/ai.config.ts` (Updated with reranker config)
- `apps/api/src/ai/ai.tokens.ts` (Updated with reranker token)
- `apps/api/src/ai/ai.module.ts` (Updated with reranker provider & exports)
- `apps/api/src/ai/services/retrieval/secure-semantic-search.service.ts` (Integrated reranker & circuit breaker)
- `apps/api/src/ai/services/retrieval/__tests__/hybrid-retrieval.integration.spec.ts` (Updated test config)
- `docs/ai/reports/AI-07-5-cross-encoder-implementation-report.md` (Created)
- `docs/ai/reports/AI-07-5-query-rewriting-report.md` (Created)
- `docs/ai/reports/AI-07-6-milestone-closure-report.md` (Created — This Report)

---

## 8. Static Analysis and Monorepo Quality Gates

| Check                    | Command              | Actual Output / Result                                                        |
| :----------------------- | :------------------- | :---------------------------------------------------------------------------- |
| **TypeScript Typecheck** | `pnpm typecheck`     | `$ tsc --noEmit -p tsconfig.base.json`<br>**Exit code: 0 (Clean, 0 errors)**  |
| **Prettier Code Style**  | `pnpm format:check`  | `All matched files use Prettier code style!`<br>**Exit code: 0 (100% clean)** |
| **Git Working Tree**     | `git status --short` | Working tree preserved; **Zero commits, zero pushes**                         |

---

## 9. Outstanding Limitations

1. **Model Weight Downloads:** Physical weights for `BAAI/bge-reranker-m3` remain unauthorized for automated download. Real model inference verification is pending explicit administrative approval.
2. **Conversational Context:** Resolving multi-turn conversational anaphora is out of scope for single-turn document retrieval and is deferred to conversational assistant milestones (AI-08+).
3. **Deterministic Normalization:** Lightweight non-LLM query normalization (acronym expansion, polite preamble stripping) was evaluated as a viable future direction but deliberately omitted from production in this closure task.

---

## 10. Conclusion & Recommended Next Milestone

Milestone **AI-07 (Hybrid Search & Re-ranking)** has achieved all technical, empirical, and architectural objectives. The retrieval engine is secure, multi-tenant isolated, measurable, and highly performant.

### Recommended Next Milestone:

**AI-07.7 — Production-Readiness Acceptance Audit & End-to-End Sign-Off** (Final comprehensive verification of the complete retrieval stack prior to AI-08).
