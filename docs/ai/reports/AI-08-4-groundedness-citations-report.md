# AI-08.4 — Citation Validation, Claim-Level Attribution & Groundedness Report

> **Milestone:** AI-08 — RAG Orchestration & Grounded Answer Generation  
> **Subtask:** AI-08.4 — Citation Validation & Groundedness Verification  
> **Status:** APPROVED & COMPLETE (`PASS`)  
> **Date:** 2026-11-21  
> **Author:** Antigravity Agentic Assistant / Kynergy Platform Architecture Team

---

## 1. Executive Summary & Objective

In medical and rehabilitation knowledge management, an ungrounded or partially fabricated answer poses serious operational and clinical risks. In standard Large Language Model (LLM) pipelines, models often output valid JSON and cite convincing identifiers that do not correspond to authorized evidence retrieved for that specific request. Furthermore, models may generate disclaimers ("No information was found") while simultaneously claiming `grounded: true` or attaching unverified documents.

The objective of **AI-08.4** was to design and implement an authoritative, application-level citation and groundedness validation layer:

1. **Authoritative Citation Resolution:** The LLM is restricted to outputting candidate chunk IDs. Source metadata (document ID, document title, page number, heading path, and similarity score) is resolved strictly from stored, authorized domain evidence (`RAGEvidenceChunk`). Any model hallucination or tampering with titles, pages, or scores is impossible.
2. **Strict Request Boundary Enforcement:** Validates citations exclusively against `includedChunks` (the evidence chunks that fit within the context token budget). Fabricated chunk IDs, foreign chunk IDs from other tenants, or chunks excluded by context builder limits (`excludedChunks`) are flagged, logged, and stripped.
3. **Claim-Level Attribution:** Extracts factual sentences with inline bracket citations (e.g., `[chk-1]`, `[chk-1, chk-2]`) and constructs explicit `ClaimAttribution` value objects to map each claim to its verified evidence chunk.
4. **Groundedness Consistency Enforcement:** Decouples schema validity from groundedness. Enforces strict invariants:
   - If the model claims `grounded: true` but produces 0 verified citations, it is overridden to `grounded: false` with `abstentionReason = 'UNVERIFIED_EVIDENCE'`.
   - If the model cites exclusively fabricated/foreign chunk IDs, `isGrounded` is forced to `false` with `abstentionReason = 'FABRICATED_CITATIONS'`.
   - Explicit abstention phrasing in Spanish or English ("no se encontró", "i couldn't find") forces `isGrounded: false` with `abstentionReason = 'INSUFFICIENT_EVIDENCE'`.
   - When abstaining (`isGrounded === false`), citations are guaranteed empty (`sources: []`) to prevent user confusion.
   - Response length ceiling ($\le 4000$ characters) is enforced.
5. **Conflicting Evidence Preservation:** When two authorized documents provide conflicting policies or clinical guidelines, both citations are verified and preserved without arbitrarily picking one.

---

## 2. Domain Models & Architecture Boundaries

### 2.1 Contracts Implemented in `@kinergy-platform/core`

```
packages/core/src/ai/
├── domain/
│   ├── models/
│   │   ├── claim-attribution.model.ts          (Represents a statement mapped to verified evidence)
│   │   ├── citation-validation-result.model.ts (Complete validation audit and adjusted answer)
│   │   ├── rag-answer.model.ts                 (Enforces empty sources on ungrounded answers)
│   │   ├── rag-evidence-chunk.model.ts         (Authoritative context evidence)
│   │   └── structured-generation-result.model.ts
│   └── value-objects/
│       └── rag-source-citation.vo.ts           (Immutable citation resolved from domain evidence)
└── ports/
    └── inbound/
        └── citation-validator.port.ts          (ICitationValidatorPort contract)
```

#### Key Inbound Port Definition

```typescript
export const CITATION_VALIDATOR_PORT = Symbol('ICitationValidatorPort');

export interface ValidateCitationsCommand {
  readonly query: string;
  readonly constructedContext: RAGConstructedContext;
  readonly generationResult: StructuredGenerationResult;
  readonly requestId?: string;
  readonly correlationId?: string;
}

export interface ICitationValidatorPort {
  validateResponse(command: ValidateCitationsCommand): CitationValidationResult;
}
```

---

## 3. Implementation Details: `CitationValidatorService`

Located at `apps/api/src/ai/services/rag/citation-validator.service.ts`:

### 3.1 Verification Steps Execution

```
LLM StructuredGenerationResult
              │
              ▼
   [1. Request Evidence Map]
   includedMap: Map<chunkId, RAGEvidenceChunk>
   excludedMap: Map<chunkId, RAGEvidenceChunk>
              │
              ▼
   [2. Candidate Citation Validation]
   - chunkId in includedMap  --> Authoritative RAGSourceCitation created
   - chunkId in excludedMap  --> Inconsistency logged (retrieved but budget-excluded)
   - chunkId not in maps     --> Inconsistency logged (fabricated or foreign ID)
              │
              ▼
   [3. Claim-Level Attribution Parser]
   - Regex matches sentences ending with [chk-X] or [chk-X, chk-Y]
   - Generates ClaimAttribution array with isVerified, title, pageNumber
              │
              ▼
   [4. Groundedness Consistency Evaluation]
   - includedMap.size === 0               --> isGrounded = false ('INSUFFICIENT_EVIDENCE')
   - cited 100% fabricated IDs            --> isGrounded = false ('FABRICATED_CITATIONS')
   - isGrounded=true & verifiedCount === 0 --> isGrounded = false ('UNVERIFIED_EVIDENCE')
   - Abstention regex match detected      --> isGrounded = false ('INSUFFICIENT_EVIDENCE')
   - If isGrounded === false              --> sources = []
   - Length ceiling > 4000 chars          --> truncated to 4000 + inconsistency logged
              │
              ▼
   CitationValidationResult
```

### 3.2 Authoritative Resolution Guarantee

The application layer strictly bypasses any model metadata hallucinations:

```typescript
// Authoritative resolution: ignore any model-suggested title/page/score
const evidence = includedMap.get(chunkId)!;
if (!verifiedSourcesMap.has(chunkId)) {
  verifiedSourcesMap.set(chunkId, RAGSourceCitation.fromEvidenceChunk(evidence));
}
```

If a malicious or hallucinated prompt tries to claim:

```json
{ "answer": "...", "citedChunkIds": ["chk-1"], "page": 999, "documentTitle": "Fake Doc" }
```

The validator ignores the hallucinated properties and extracts `documentTitle`, `pageNumber`, and `relevanceScore` exclusively from the database-backed `RAGEvidenceChunk`.

---

## 4. RAG Orchestrator Integration

In `apps/api/src/ai/services/rag/rag-orchestrator.service.ts`, `ICitationValidatorPort` is injected and applied immediately after generation:

```typescript
// 5. Invoke Grounded Generation via ILLMProviderPort
const generationResult = await this.groundedGenerator.generateGroundedAnswer({
  query,
  constructedContext,
  conversationHistory: command.conversationHistory,
  signal: command.signal,
});

// 6. Authoritative Citation Validation & Groundedness Verification
const validation = this.citationValidator.validateResponse({
  query,
  constructedContext,
  generationResult,
  requestId: command.requestId,
  correlationId: command.correlationId,
});

const totalDurationMs = Math.round(performance.now() - startTime);

// 7. Enforce final grounded response contract
return RAGAnswer.create({
  answer: validation.adjustedAnswer,
  isGrounded: validation.isGrounded,
  sources: validation.verifiedCitations,
  modelIdentifier: generationResult.modelIdentifier,
  promptVersion: generationResult.promptVersion,
  abstentionReason: validation.abstentionReason ?? undefined,
  totalDurationMs,
  tokensUsed: {
    prompt: generationResult.promptTokens,
    completion: generationResult.completionTokens,
    total: generationResult.totalTokens,
  },
  claims: validation.claims,
});
```

---

## 5. Verification & Test Execution Results

A test suite of 12 targeted unit tests was created in `apps/api/src/ai/services/rag/__tests__/citation-validator.service.spec.ts`.

### 5.1 Test Execution Matrix

| Test Case | Scenario / Condition Tested                            | Expected Invariant                                                                     | Result   |
| :-------- | :----------------------------------------------------- | :------------------------------------------------------------------------------------- | :------- |
| **TC-01** | Legitimate citations present in `includedChunks`       | Resolves authoritative document metadata, page, score                                  | **PASS** |
| **TC-02** | LLM cites non-existent / fabricated chunk ID           | Flagged in `unverifiedChunkIds`, stripped, `abstentionReason = 'FABRICATED_CITATIONS'` | **PASS** |
| **TC-03** | LLM cites chunk in `excludedChunks` (budget-truncated) | Flagged as unused retrieved chunk, stripped from citations                             | **PASS** |
| **TC-04** | LLM cites chunk from another tenant/request            | Flagged as foreign citation, stripped from citations                                   | **PASS** |
| **TC-05** | Model claims `grounded: true` but evidence pool is 0   | Overridden to `grounded: false`, `abstentionReason = 'INSUFFICIENT_EVIDENCE'`          | **PASS** |
| **TC-06** | Model claims `grounded: true` with 0 citations         | Overridden to `grounded: false`, `abstentionReason = 'UNVERIFIED_EVIDENCE'`            | **PASS** |
| **TC-07** | Spanish abstention phrasing ("no se encontró...")      | Overridden to `grounded: false`, sources emptied                                       | **PASS** |
| **TC-08** | English abstention phrasing ("i couldn't find...")     | Overridden to `grounded: false`, sources emptied                                       | **PASS** |
| **TC-09** | Missing page or heading in stored metadata             | Resolves gracefully without runtime errors                                             | **PASS** |
| **TC-10** | Answer length exceeds 4,000 characters                 | Truncated to 4,000 characters, inconsistency logged                                    | **PASS** |
| **TC-11** | Claim-level attribution parsing (`[chk-1]`)            | Factual sentences mapped to `ClaimAttribution` objects                                 | **PASS** |
| **TC-12** | Conflicting sources preservation                       | Both contradictory citations preserved without bias                                    | **PASS** |

### 5.2 Cumulative Test Suite Status

```
PASS  apps/api/src/ai/services/rag/__tests__/citation-validator.service.spec.ts  (12 tests)
PASS  apps/api/src/ai/services/rag/__tests__/rag-orchestrator.service.spec.ts     (11 tests)
PASS  apps/api/src/ai/services/rag/__tests__/grounded-generation.service.spec.ts (14 tests)
PASS  apps/api/src/ai/services/rag/__tests__/rag-context-builder.service.spec.ts (12 tests)
PASS  packages/core/src/ai/domain/__tests__/rag-contracts.spec.ts                (10 tests)

Total RAG Suite Tests: 59 passed, 59 total (100% PASS)
TypeScript Monorepo Compilation (`tsc --noEmit`): 0 errors
Prettier Code Style Check: 100% clean
```

---

## 6. Limitations & Operational Notes

1. **Inline Citation Format Dependency:** The claim-level attribution parser extracts bracket syntax `[chk-uuid]`. The versioned prompt (`kinergy-rag-v1.0.0`) explicitly instructs the LLM to format claims with inline brackets. If the LLM omits bracket tags in free text, document-level attribution is still captured via `citedChunkIds`.
2. **Context Window Token Truncation:** When evidence chunks are omitted by `RAGContextBuilderService` due to token budget limits, they are recorded in `excludedChunks`. If an LLM hallucination happens to match one of these excluded chunks, it is strictly rejected to prevent citing uninspected context.

---

## 7. Sign-off & Milestone Closure

All requirements of **AI-08.4** have been implemented, tested, verified, and documented according to the execution contract.
The RAG pipeline now features authoritative source attribution, claim-level tracing, and tamper-proof groundedness validation.
