# ADR-AI-006: RAG Security, Pre-Retrieval Authorization & Data Protection

## 1. ADR Identifier

ADR-AI-006

## 2. Title

Mandatory Pre-Retrieval SQL Authorization, Dual-Barrier Access Enforcement, and Clinical Data Exclusion

## 3. Status

Proposed

## 4. Date

2026-11-19

## 5. Context

Retrieval-Augmented Generation systems present critical security and privacy vulnerabilities if access control is implemented naively. In healthcare and wellness platforms, exposing confidential operational policies, pricing models, or clinical records to unauthorized staff violates regulatory and commercial requirements. Naive RAG designs frequently retrieve top-$K$ vectors across the entire database and rely on post-retrieval filtering in application memory or prompt instructions to the LLM ("Only answer if user is permitted"). This enables prompt injection attacks, side-channel inference, and inadvertent data leakage. Furthermore, clinical SOAP notes in `treatment_sessions` contain Protected Health Information (PHI).

## 6. Problem Statement

How should security, multi-tenancy, and document authorization be enforced across the RAG lifecycle so that unauthorized documents are mathematically excluded from retrieval candidates, prompt injection cannot bypass permission boundaries, and clinical PHI is completely safeguarded?

## 7. Decision Drivers

- **Zero Inferential Data Leaks**: Prevent users from probing document existence via similarity scores or side-channel timing.
- **Defense in Depth**: Enforce access control at multiple distinct architectural boundaries rather than relying on a single gate.
- **Model Non-Authority**: Never rely on the generative model to evaluate or enforce authorization rules.
- **Regulatory Privacy Compliance**: Comply strictly with healthcare privacy standards by excluding patient consultation notes.
- **Monorepo RBAC Alignment**: Reuse Kinergy's verified `AuthenticationGuard` and `PermissionsGuard` infrastructure.

## 8. Decision

We mandate **Pre-Retrieval SQL Authorization Filtering**, establish a **Dual-Barrier Access Control Model**, enforce **Untrusted Data Boundaries** against prompt injection, and **completely exclude clinical notes from the initial knowledge scope**:

1. **Reuse of Existing Authentication & RBAC**:
   - Authentication is handled exclusively by Kinergy's `AuthenticationGuard` validating Bearer JWTs.
   - Ambient principal context (`tenantId`, `userId`, `permissions`) is resolved via `AuthenticatedUserContext` powered by Node.js `AsyncLocalStorage`. Zero secondary JWT systems.
2. **Three-Tiered Authorization Structure**:
   - Layer 1: Feature Gate — `@RequirePermissions('ai.knowledge.read')` on the HTTP controller.
   - Layer 2: Document Visibility Scopes — `ALL_STAFF` (`ai.knowledge.read`), `CLINICAL_STAFF` (`ai.clinical.read`), `MANAGEMENT` (`ai.management.read`).
   - Layer 3: Conversation Isolation — Conversations are strictly scoped to `(tenant_id, owner_user_id)`.
3. **Mandatory Pre-Retrieval SQL Filtering (Barrier 1)**:
   - Candidate selection in the vector database **mandates** SQL WHERE predicates before calculating or sorting vector distances:
     ```sql
     WHERE c.tenant_id = :authenticatedTenantId
       AND c.visibility_scope = ANY(:userAllowedScopes::varchar[])
       AND d.status = 'INDEXED'
     ```
   - Chunks outside the user's permitted scopes are never scanned, ranked, or loaded into application memory.
4. **Secondary In-Memory Validation Boundary (Barrier 2)**:
   - In `AssembleGroundedContextUseCase`, before retrieved chunks are formatted into the prompt string, an independent assertion confirms that every chunk's `visibilityScope` is present in the requesting user's active permissions. If an anomaly is detected, context assembly aborts and emits a critical security alert.
5. **Why Authorization Must Never Rely on the LLM**:
   - Generative models are non-deterministic and susceptible to adversarial prompt injection (jailbreaking). System prompt instructions such as _"Do not disclose management information to junior staff"_ can be bypassed via roleplay, indirect injection, or obfuscated delimiters. Authorization is an infrastructure constraint, not a prompt instruction.
6. **Total Exclusion of Clinical SOAP Notes & PHI**:
   - Patient clinical records, evaluation records, and SOAP notes (`notesSubjective`, `notesObjective`, `notesAssessment`, `notesPlan`) in `treatment_sessions` are **100% excluded** from the initial RAG knowledge base. Ingestion is restricted to non-patient operational guidelines, gym SOPs, and equipment manuals.
7. **Prompt Injection & Untrusted Data Sandboxing**:
   - Retrieved chunks are treated as untrusted input data and wrapped strictly inside `<context>...</context>` XML tags.
   - The system prompt commands the model to use context exclusively for factual grounding and to reject any instruction embedded inside context chunks.

## 9. Alternatives Considered

- **Alternative 1: Post-Retrieval Application Memory Filtering**: Retrieve top-20 vectors globally, then filter out unauthorized chunks in Node.js. _Rejected_: Critical security flaw; unauthorized documents alter candidate ranking, and timing/similarity metadata can be probed to infer the existence and content of confidential files.
- **Alternative 2: Prompt-Based Authorization**: Passing user role into the system prompt and asking the LLM to decide what to reveal. _Rejected_: Completely insecure; trivial to bypass via direct prompt injection.
- **Alternative 3: Including Anonymized Clinical SOAP Notes in Phase 1**: Ingesting clinical notes with regex-masked names. _Rejected_: Regex de-identification frequently misses clinical narrative identifiers; creates severe HIPAA/GDPR regulatory breach liabilities without audited privacy infrastructure.

## 10. Positive Consequences

- **Mathematically Provable Tenant & Scope Isolation**: Cross-tenant or cross-role data leaks are impossible at the database query execution level.
- **Resilience Against Prompt Injection**: Attackers cannot access documents they lack permission to view, even if they completely jailbreak the LLM.
- **Zero Regulatory Exposure**: Total exclusion of PHI eliminates clinical patient privacy breach liabilities during initial rollout.
- **Zero Session Caching Stagnation**: User permissions are evaluated dynamically from active JWT claims on every turn; role revocations take effect immediately.

## 11. Negative Consequences

- Pre-retrieval filtering restricts HNSW index traversal to a subset of vectors; requires composite index on `(tenant_id, visibility_scope)` to ensure sub-15ms performance.
- Staff cannot query patient consultation histories using AI in Phase 1.

## 12. Security Implications

- Closes the top two OWASP Top 10 for LLM vulnerabilities: LLM01 (Prompt Injection) and LLM02 (Sensitive Information Disclosure).
- Failed authorization attempts log `AI_GUARDRAIL_BLOCKED` security audit events with principal identity and correlation ID.

## 13. Operational Implications

- Administrators modifying a document's visibility scope trigger a fast transactional update to all linked chunks (`UPDATE knowledge_chunks SET visibility_scope = :newScope WHERE document_id = :id`).
- Archiving a document revokes its accessibility across all active sessions instantly.

## 14. Dependencies

- Platform `AuthenticationGuard` and `AuthenticatedUserContext`.
- PostgreSQL composite index `idx_knowledge_chunks_tenant_scope`.
- Domain value object `VisibilityScope`.

## 15. Implementation Implications

- Register permission codes in `permissions.ts`: `ai.knowledge.read`, `ai.clinical.read`, `ai.management.read`, `ai.knowledge.manage`.
- Implement `PgVectorKnowledgeStoreAdapter` with mandatory WHERE parameters.
- Implement secondary validation in `AssembleGroundedContextUseCase`.

## 16. Validation Requirements

- Automated security integration test asserting that an authenticated user without `ai.clinical.read` cannot retrieve `CLINICAL_STAFF` chunks under any query embedding.
- Automated multi-tenant test verifying that Tenant A cannot retrieve Tenant B chunks even with identical vector queries.

## 17. Conditions for Reconsideration

- If a future clinical milestone approves patient consultation search after independent legal review, client-side cryptographic anonymization, and signed Business Associate Agreements (BAAs).

## 18. Related ADRs

- ADR-AI-001: Dedicated AI bounded context
- ADR-AI-003: PostgreSQL and pgvector persistence
- ADR-AI-005: Document processing architecture
- ADR-AI-007: Evaluation and observability
