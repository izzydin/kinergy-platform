# AI-08.5 — Conversation History Management Report

> **Milestone:** AI-08 — RAG Orchestration & Grounded Answer Generation  
> **Subtask:** AI-08.5 — Conversation History Management  
> **Status:** APPROVED & COMPLETE (`PASS`)  
> **Date:** 2026-11-21  
> **Author:** Antigravity Agentic Assistant / Kynergy Platform Architecture Team

---

## 1. Executive Summary & Objective

In multi-turn knowledge retrieval systems, conversation history enables natural dialogue and contextual follow-up inquiries (e.g., Turn 1: _"What are the benefits of the Silver membership?"_; Turn 2: _"How long does it last?"_). However, naive history inclusion introduces severe security and reliability vulnerabilities:

1. **Cross-Tenant & Cross-User Information Leaks:** An attacker or regular user could guess conversation IDs to view another user's or tenant's private medical/operational inquiries.
2. **Context Window Inflation & Budget Exhaustion:** Unlimited turns exhaust LLM context budgets, displacing retrieved clinical evidence.
3. **Prompt Injection & Role Spoofing:** Attackers injecting `<system>` or `<evidence_chunk>` markup into client history to override assistant directives.
4. **Hallucination Cascading (Trust Model Failure):** The LLM treating its own previous inaccurate answers as verified factual evidence instead of evaluating current authorized retrieval.
5. **Generative Drift in Retrieval:** Using generative query rewriting on follow-ups (prohibited by **AI-07.6**).

**AI-08.5** establishes a secure, bounded conversation history management architecture that addresses each of these concerns with strict fail-closed authorization, tenant isolation, bounded sliding-window selection, injection neutralization, and clean separation between conversational context and authoritative knowledge.

---

## 2. Existing Domain Inspection & Persistence Architecture

### 2.1 Inspection Findings (Phase 1)

An inspection of `prisma/schema.prisma` and the domain packages confirmed:

- `ChatMessage` existed as an immutable value object (`packages/core/src/ai/domain/value-objects/chat-message.vo.ts`).
- `ChatMessageDto` existed for API transport (`apps/api/src/ai/controllers/dtos/rag-query.dto.ts`).
- **No persistent database models for conversations, sessions, or chat messages existed in Prisma.** The database contained only documents, chunks, versions, jobs, embeddings, users, clients, memberships, and clinical sessions.

### 2.2 Architectural Implementation

Rather than prematurely mutating the production PostgreSQL schema, a clean hexagonal architecture was implemented:

1. **Domain Aggregate:** `ConversationSession` in `@kinergy-platform/core`.
2. **Outbound Port:** `IConversationRepositoryPort` (`findById`, `save`, `delete`, `listByUser`).
3. **Inbound Port:** `IConversationHistoryManagerPort` (`resolveHistory`, `recordTurn`).
4. **Adapter:** `InMemoryConversationRepositoryAdapter` with tenant-partitioned storage (`Map<tenantId, Map<conversationId, ConversationSession>>`) and configurable TTL expiration (default: 24 hours).
5. **Production Database Migration Proposal:** When long-term persistence is required, the following schema addition is recommended:

```prisma
model ConversationSession {
  id        String   @id @default(uuid())
  tenantId  String   @map("tenant_id")
  userId    String   @map("user_id")
  createdAt DateTime @default(now()) @map("created_at")
  updatedAt DateTime @updatedAt @map("updated_at")
  metadata  Json?    @map("metadata")

  messages ConversationMessage[]

  @@index([tenantId, userId])
  @@index([tenantId, updatedAt])
  @@map("conversation_sessions")
}

model ConversationMessage {
  id         String   @id @default(uuid())
  sessionId  String   @map("session_id")
  role       String   @map("role") // "user" | "assistant"
  content    String   @map("content")
  sequence   Int      @map("sequence")
  createdAt  DateTime @default(now()) @map("created_at")

  session ConversationSession @relation(fields: [sessionId], references: [id], onDelete: Cascade)

  @@index([sessionId, sequence])
  @@map("conversation_messages")
}
```

---

## 3. Ownership & Tenant Authorization Guarantees (Phase 2)

Every conversation operation enforces the following security invariants:

- **Tenant Isolation:** All repository operations require `tenantId`. Session retrieval checks `session.tenantId === authContext.tenantId`. A user from `tenant-A` querying an existing conversation in `tenant-B` receives a `ConversationNotFoundException` (never leaking existence across tenants).
- **Owner Verification:** If a session belongs to `user-original`, another user `user-intruder` within the same tenant is blocked with `UnauthorizedConversationAccessException`.
- **Privileged Audit Scope:** Users holding administrative or supervisory roles (`ROLE_ADMIN`, `TENANT_ADMIN`, `CLINICAL_SUPERVISOR`) may inspect histories within their own tenant for clinical auditing.
- **Fail-Closed Validation:** Missing or whitespace `tenantId` immediately throws `UnauthorizedRetrievalException` before any retrieval or history loading occurs.

---

## 4. History Selection & Bounding Strategy (Phase 3)

Unlimited conversation history is strictly prevented via a multi-tier bounding algorithm:

```
Full Session History (up to 60 messages / 30 turns)
                  │
                  ▼
  [1. Turn Limit Filter] (maxTurns = 10, candidate messages = 20)
                  │
                  ▼
  [2. Role & Validity Sanitizer]
  - Discard any client 'system' role messages (prevent prompt spoofing)
  - Sanitize markup tags (<system>, <evidence_chunk>, etc.)
  - Reject empty/whitespace messages
                  │
                  ▼
  [3. Token Budget Traverser] (maxHistoryTokens = 500)
  - Traverse backwards from most recent message
  - Accumulate tokens until budget is reached
  - Prepend to bounded slice
                  │
                  ▼
  Bounded History (Chronological order, within token & turn ceiling)
```

- **Sliding Window:** `ConversationSession` enforces a ceiling of 60 stored messages. Older turns are automatically evicted to avoid unbounded memory growth.
- **Token Allocation Budget:** History is budgeted conservatively (default: 500 tokens), preserving $\ge 3000$ tokens of the context window for retrieved evidence chunks.

---

## 5. History Trust Model (Phase 4)

Conversation history is treated as **conversational context, not ground truth knowledge**:

1. **Structural Isolation:** In `buildRAGUserPrompt`, historical turns are partitioned under `### CONVERSATION HISTORY:` separate from `### RETRIEVED EVIDENCE:`.
2. **Authority Rule Enforcement:** Rule 1 of `buildRAGSystemPrompt` explicitly commands:
   > _"Answer the user's question using ONLY the factual evidence provided inside the <retrieved_evidence> block."_
3. **Previous Hallucination Immunity:** If a previous assistant turn stated incorrect facts (e.g., claiming a procedure is free), and the user follows up on that statement, the LLM is instructed to answer strictly based on the current retrieved chunks. If current evidence contradicts or does not support the previous turn, the system answers with the verified evidence or abstains.
4. **No Raw Chunk Duplication in History:** Conversation history stores only `ChatMessage` texts (`user` question and `assistant` answer). Stored chunk texts, embeddings, or XML blocks are never persisted in history.

---

## 6. Follow-Up Questions (Phase 5)

Contextual follow-ups (e.g., _"¿Cuánto tiempo dura y cómo se renueva?"_) are resolved through conversation context without violating the **AI-07.6 non-negotiable rule**:

- **NO Generative Query Rewriting:** The user's raw query is preserved and forwarded directly to the authorized retrieval pipeline (`ISemanticSearchUseCase`).
- **Anaphora Resolution at LLM Generation:** Because the LLM receives the bounded conversation history alongside the retrieved evidence, the LLM resolves pronouns (e.g., _"it"_, _"este tratamiento"_) naturally at answer synthesis time while grounding facts in the retrieved chunks.
- **Follow-Up Detection for Observability:** `ConversationHistoryManagerService` detects follow-up intent via deterministic linguistic patterns and marks `isFollowUp: true` in telemetry without altering the retrieval query.
- **Abstention on Ambiguity:** If the evidence retrieved for the raw query is insufficient, the system abstains or requests clarification rather than inventing context.

---

## 7. Data Lifecycle & Retention (Phase 6)

- **Retention Window (TTL):** Conversations have a configurable TTL (default: 24 hours of inactivity). `InMemoryConversationRepositoryAdapter` automatically evicts expired sessions on access and through `pruneExpiredSessions()`.
- **Explicit Deletion:** Users and administrators can delete conversation sessions via `delete(conversationId, tenantId)`.
- **Zero Evidence Bloat:** Sessions only store messages, eliminating redundant database storage of clinical documents or vector embeddings.

---

## 8. Verification & Test Execution Results (Phase 7)

A test suite of 25 dedicated unit and integration tests was implemented across `@kinergy-platform/core` and `apps/api`.

### 8.1 Test Execution Matrix

| ID        | Test Scenario             | Verified Behavior                                             | Status   |
| :-------- | :------------------------ | :------------------------------------------------------------ | :------- |
| **TC-01** | New Conversation          | Resolves empty history, clean initialization                  | **PASS** |
| **TC-02** | Existing Conversation     | Loads and bounds persisted turns                              | **PASS** |
| **TC-03** | Follow-up Detection (ES)  | Detects follow-up phrasing; raw query untouched               | **PASS** |
| **TC-04** | Follow-up Detection (EN)  | Detects English pronouns without generative rewriting         | **PASS** |
| **TC-05** | Empty History Handling    | Returns empty bounded slice, 0 tokens                         | **PASS** |
| **TC-06** | Max History Size          | Truncates older turns exceeding `maxTurns` (sliding window)   | **PASS** |
| **TC-07** | Token Budget Enforcement  | Traverses backwards from recent turns within token ceiling    | **PASS** |
| **TC-08** | Cross-Tenant Access       | Tenant A cannot access Tenant B session (`NotFoundException`) | **PASS** |
| **TC-09** | Unauthorized User Access  | Non-owner denied access (`UnauthorizedAccessException`)       | **PASS** |
| **TC-10** | Privileged Audit Access   | Supervisor/admin in same tenant permitted access              | **PASS** |
| **TC-11** | Malicious History / Trust | Assistant hallucinations in history do not override evidence  | **PASS** |
| **TC-12** | Prompt Injection Defense  | Injected `<system>`, `<evidence_chunk>` markup sanitized      | **PASS** |
| **TC-13** | Role Spoofing Defense     | Client-injected `system` role messages stripped               | **PASS** |
| **TC-14** | TTL Expiration            | Inactive sessions older than TTL evicted                      | **PASS** |

### 8.2 Monorepo Test Summary

```
PASS  packages/core/src/ai/domain/__tests__/conversation-session.model.spec.ts                     (12 tests)
PASS  packages/core/src/ai/domain/__tests__/rag-contracts.spec.ts                                 (10 tests)
PASS  apps/api/src/ai/adapters/conversation/__tests__/in-memory-conversation-repository.adapter.spec.ts (5 tests)
PASS  apps/api/src/ai/services/rag/__tests__/conversation-history-manager.service.spec.ts         (10 tests)
PASS  apps/api/src/ai/services/rag/__tests__/citation-validator.service.spec.ts                    (12 tests)
PASS  apps/api/src/ai/services/rag/__tests__/rag-orchestrator.service.spec.ts                     (11 tests)
PASS  apps/api/src/ai/services/rag/__tests__/grounded-generation.service.spec.ts                 (14 tests)
PASS  apps/api/src/ai/services/rag/__tests__/rag-context-builder.service.spec.ts                 (12 tests)

Total RAG & Conversation Tests: 86 passed, 86 total (100% PASS)
TypeScript Monorepo Compilation (`tsc --noEmit`): 0 errors
Prettier Code Style Check: 100% clean
```

---

## 9. Conclusion & Milestone Next Steps

All requirements of **AI-08.5** have been completed, verified, and documented according to the execution contract. Multi-turn interactions are fully supported with bounded memory, tenant isolation, and strict trust model guarantees.
