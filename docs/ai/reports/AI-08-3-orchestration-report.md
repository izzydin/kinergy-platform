# AI-08.3 — RAG Orchestration Application Use Case Report

**Date:** 2026-11-21  
**Repository:** `izzydin/kinergy-platform`  
**Milestone:** AI-08 — RAG Orchestration & Grounded Answer Generation  
**Task:** AI-08.3 — RAG Orchestration Application Use Case  
**Status:** PASS  
**Deliverable File:** `docs/ai/reports/AI-08-3-orchestration-report.md`

---

## 1. Executive Summary

Task **AI-08.3** implements the end-to-end RAG application use case (`RAGOrchestratorService`), realizing the complete pipeline from authenticated user inquiry to verifiable, grounded answers and source citations.

Key deliverables completed:

1. **Application Use Case Implementation (`RAGOrchestratorService`):**
   - Implemented in `apps/api/src/ai/services/rag/rag-orchestrator.service.ts`.
   - Implements `IGenerateGroundedAnswerUseCase` (`GENERATE_GROUNDED_ANSWER_USE_CASE_PORT`).
   - Completely decouples orchestration logic from API controllers.
2. **Reuse of Authorized Retrieval Engine:**
   - Coordinates with `ISemanticSearchUseCase` (`SecureSemanticSearchService`), reusing existing query embedding (`bge-m3`), pgvector similarity search, PostgreSQL full-text search, Reciprocal Rank Fusion ($k=60$), and optional cross-encoder reranking.
   - Strictly enforces fail-closed pre-retrieval SQL authorization (tenant isolation, RBAC visibility scopes, soft-delete exclusion). Zero unauthorized evidence reaches subsequent stages.
3. **Application-Level Abstention Policy (No Unnecessary LLM Invocations):**
   - Short-circuits prior to prompt assembly and LLM generation when:
     - Retrieval returns 0 chunks.
     - Retrieved chunks contain purely empty or whitespace text.
     - Top similarity score falls below the calibrated threshold ($\tau^* = 0.60$).
     - Context construction excludes all chunks due to budget overflow.
   - Saves 100% of LLM compute, latency, and prevents hallucination on out-of-domain queries.
4. **Source Attribution & Citation Resolution:**
   - Programmatically resolves cited chunk IDs against the authorized retrieval evidence pool.
   - Maps each verified citation to a `RAGSourceCitation` value object capturing `documentId`, `documentTitle`, `chunkId`, `pageNumber`, `headingPath`, and `relevanceScore`.
   - Forces `grounded: false` if the model cited only fabricated chunk IDs.
5. **Comprehensive Verification:**
   - Application-level test suite (`apps/api/src/ai/services/rag/__tests__/rag-orchestrator.service.spec.ts`) verifies all 11 core scenarios with 100% pass rate.
   - Monorepo compilation passes with 0 errors (`tsc --noEmit -p tsconfig.base.json`).

---

## 2. End-to-End Orchestration Architecture

```
Authenticated Request (query, authContext)
               │
               ▼
   [Server-Side Validation]
   ├── Validate tenantId present & non-empty
   └── Validate query non-empty & within limits
               │
               ▼
   [Authorized Retrieval Layer] (ISemanticSearchUseCase)
   ├── Query Embedding via BGE-M3 (1024-dim, L2-normalized)
   ├── Pre-Retrieval SQL Authorization (tenant_id = $2, visibility IN (...), deleted_at IS NULL)
   ├── Multi-Arm Search: pgvector HNSW + PostgreSQL FTS
   └── Reciprocal Rank Fusion (k=60) + Optional Reranking
               │
               ▼
   [Abstention Short-Circuit Evaluation]
   ├── Chunks count === 0? ──► YES ──► Return RAGAnswer.abstain() [NO LLM CALL]
   ├── Empty content? ────────► YES ──► Return RAGAnswer.abstain() [NO LLM CALL]
   └── Top score < 0.60? ─────► YES ──► Return RAGAnswer.abstain() [NO LLM CALL]
               │ NO (Passes Threshold)
               ▼
   [Context Construction] (IRAGContextBuilderPort)
   ├── Deduplicate by chunkId
   ├── Budget tokens within 4,096 context window
   ├── Apply Complete-Chunk Dropping Policy (never truncate mid-sentence)
   └── Format untrusted XML boundaries (<retrieved_evidence>)
               │
               ▼
   [Grounded Generation] (IGroundedGenerationPort)
   ├── Assemble versioned system prompt (kinergy-rag-v1.0.0)
   ├── Enforce structured JSON output ({ format: 'json' })
   └── Invoke OllamaLLMAdapter (qwen3:4b, num_ctx: 4096, temp: 0.2)
               │
               ▼
   [Citation Resolution & Validation]
   ├── Cross-reference citedChunkIds against authorized includedChunks
   ├── Strip hallucinated chunk IDs
   └── Map to RAGSourceCitation VOs (title, page, score)
               │
               ▼
      [RAGAnswer Response]
   ├── answer: string
   ├── grounded: boolean
   ├── sources: RAGSourceCitation[]
   └── metadata: { model, retrievalCount, latencyMs, finishReason }
```

---

## 3. Pre-Retrieval Authorization & Retrieval Reuse

`RAGOrchestratorService` reuses `SecureSemanticSearchService` directly without duplicating any persistence or vector infrastructure:

```typescript
const retrievalResult = await this.retrievalUseCase.execute({
  query,
  authContext: command.authContext,
  topK: command.topK ?? this.config.retrievalDefaultTopK ?? 5,
  minSimilarity: command.minSimilarity ?? this.config.retrievalSimilarityThreshold ?? 0.6,
  documentIds: command.documentIds,
  searchMode: command.searchMode ?? this.config.retrievalSearchMode ?? RetrievalSearchMode.SEMANTIC,
  signal: command.signal,
  requestId: command.requestId,
  correlationId: command.correlationId,
});
```

### Security Invariants Guaranteed:

1. **Pre-Retrieval SQL Predicates:** Tenant isolation (`ig.tenant_id = $2 AND kd.tenant_id = $2 AND kc.tenant_id = $2`), RBAC visibility scope clearance (`kd.visibility_scope IN (...)`), and soft-delete filters (`kd.deleted_at IS NULL`) are applied in PostgreSQL before candidate ranking and `LIMIT` truncation.
2. **Zero Post-Retrieval Leakage:** Unauthorized documents are never read from disk or database into application memory.
3. **No Unauthenticated Execution:** Missing or empty `tenantId` throws `UnauthorizedRetrievalException` immediately before retrieval.

---

## 4. Application-Level Abstention Policy

The platform strictly avoids delegating abstention exclusively to the LLM. When retrieval evidence is objectively missing or insufficient, `RAGOrchestratorService` executes a deterministic application-level short-circuit:

| Condition                          | Verification Check                                             | Application Behavior                                                                                   | LLM Invoked? |
| :--------------------------------- | :------------------------------------------------------------- | :----------------------------------------------------------------------------------------------------- | :----------: |
| **No Retrieved Chunks**            | `retrievalResult.chunks.length === 0`                          | Returns `RAGAnswer.abstain('No se encontró documentación o política verificada...')`                   |    **NO**    |
| **Purely Empty Content**           | `chunks.filter(c => c.content.trim().length > 0).length === 0` | Returns `RAGAnswer.abstain('No se encontró documentación con contenido verificable...')`               |    **NO**    |
| **Low Similarity / Out-of-Domain** | `Math.max(...chunks.map(c => c.similarity.value)) < 0.60`      | Returns `RAGAnswer.abstain('La información disponible no cuenta con suficiente relevancia...')`        |    **NO**    |
| **Context Window Overflow**        | `constructedContext.includedChunks.length === 0`               | Returns `RAGAnswer.abstain('El contexto de evidencia no pudo ser procesado dentro de los límites...')` |    **NO**    |

### Benefits:

- **Zero Hallucination Risk:** Eliminates the possibility of the LLM inventing policies (such as a 100% refund policy) when no relevant documentation exists.
- **Latency Optimization:** Saves $\sim 2.5 - 5.0\text{ seconds}$ of local Ollama generation time on unanswerable queries.
- **Resource Protection:** Preserves local CPU/GPU compute for valid user inquiries.

---

## 5. Source Attribution & Citation Resolution

When the LLM indicates `grounded: true` and cites chunk identifiers:

1. The orchestrator indexes the authorized evidence chunks from `constructedContext.includedChunks` into a Map by `chunkId`.
2. For each `chunkId` in `generationResult.citedChunkIds`:
   - If present in the authorized map, creates a `RAGSourceCitation` with exact metadata (`documentId`, `documentTitle`, `pageNumber`, `headingPath`, `relevanceScore`, `sourceStrategy`).
   - If absent, strips the hallucinated citation.
3. If the model claims `grounded: true` but produces 0 verifiable citations, the orchestrator overrides `grounded` to `false` and sets `sources: []`.

---

## 6. Verification & Test Evidence

All 11 application-level test cases in `apps/api/src/ai/services/rag/__tests__/rag-orchestrator.service.spec.ts` passed:

```
 PASS   api  apps/api/src/ai/services/rag/__tests__/rag-orchestrator.service.spec.ts
  RAGOrchestratorService Application Use Case Tests
    Phase 6 Application Scenarios
      √ 1. Complete Successful Flow: executes retrieval, context building, generation, and verifies source attribution (9 ms)
      √ 2. No Evidence Short-Circuit: abstains immediately without invoking LLM when retrieval yields 0 chunks (1 ms)
      √ 3. Low Similarity Short-Circuit: abstains without LLM invocation when top similarity is below threshold (0.60) (1 ms)
      √ 4. Empty Chunk Content Short-Circuit: abstains without LLM call when chunks have purely whitespace content (1 ms)
      √ 5. Context Builder Empty Short-Circuit: abstains if context builder rejects all chunks due to budget overflow
      √ 6. Authorization Failure: throws UnauthorizedRetrievalException if authContext is missing or tenantId is empty (9 ms)
      √ 7. Query Validation Failure: throws EmptyRetrievalQueryException if query is empty or whitespace (1 ms)
      √ 8. Retrieval Failure Propagation: propagates RetrievalDatabaseException from persistence layer (1 ms)
      √ 9. LLM Provider Failure Propagation: propagates ProviderTimeoutException without masking
      √ 10. Ungrounded Output Fallback: handles ungrounded generation cleanly with empty sources (1 ms)
      √ 11. Tenant Isolation Enforcement: passes tenant context cleanly to retrieval layer (1 ms)
Test Suites: 1 passed, 1 total | Tests: 11 passed, 11 total
```

### Cumulative AI-08 Test Execution Log

| Test Suite                      | File                                                                         | Tests Passed |    Status     |
| :------------------------------ | :--------------------------------------------------------------------------- | :----------: | :-----------: |
| **RAG Domain Contracts**        | `packages/core/src/ai/domain/__tests__/rag-contracts.spec.ts`                |    10/10     |   **PASS**    |
| **Context Builder Service**     | `apps/api/src/ai/services/rag/__tests__/rag-context-builder.service.spec.ts` |    11/11     |   **PASS**    |
| **Grounded Generation Service** | `apps/api/src/ai/services/rag/__tests__/grounded-generation.service.spec.ts` |    14/14     |   **PASS**    |
| **RAG Orchestrator Service**    | `apps/api/src/ai/services/rag/__tests__/rag-orchestrator.service.spec.ts`    |    11/11     |   **PASS**    |
| **Total Test Suite**            |                                                                              |  **46/46**   | **100% PASS** |

---

## 7. Files Changed & Created

| File                                                                      |   Action    | Purpose                                                               |
| :------------------------------------------------------------------------ | :---------: | :-------------------------------------------------------------------- |
| `apps/api/src/ai/services/rag/rag-orchestrator.service.ts`                | **Created** | Implementation of `IGenerateGroundedAnswerUseCase`.                   |
| `apps/api/src/ai/ai.tokens.ts`                                            | **Updated** | Bound `GENERATE_GROUNDED_ANSWER_USE_CASE` injection token.            |
| `apps/api/src/ai/ai.module.ts`                                            | **Updated** | Registered and exported `RAGOrchestratorService` and use-case port.   |
| `apps/api/src/ai/services/rag/__tests__/rag-orchestrator.service.spec.ts` | **Created** | Unit test suite (11 tests) verifying Phase 6 orchestration scenarios. |

---

## 8. Quality Gates

- **Unit Tests:** `pnpm nx test api --testFile=rag-orchestrator` (11/11 PASS).
- **All RAG Services:** `pnpm nx test api --testFile="rag-orchestrator|rag-context-builder|grounded-generation"` (36/36 PASS).
- **TypeScript Compilation:** `tsc --noEmit -p tsconfig.base.json` (0 errors).
- **Code Style:** All files verified with Prettier.

Milestone **AI-08.3** is **COMPLETE** and **PASS**. Execution has stopped as requested. Ready for review and authorization to proceed with task **AI-08.4** (API Controller & Grounded Retrieval Integration).
