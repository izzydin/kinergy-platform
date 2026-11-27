# AI-10 — Security Gap Report: Kynergy Intelligence

**System Name:** Kynergy Intelligence Platform  
**Milestone:** AI-10.0 — Security, Isolation, and Hardening (SEC.09 Final Deliverable)  
**Document ID:** `AI-10-SECURITY-GAP-REPORT`  
**Assessment Date:** November 27, 2026  
**Roles:** Chief Information Security Architect, Principal Application Security Engineer, and Lead Security Auditor

---

## 1. Classification of Security Gaps

To provide clear, actionable risk governance, all findings identified across the security assessment are categorized by control maturity:

1. **Confirmed Vulnerabilities:** Directly verifiable implementation flaws where existing code violates security policy or enables unauthorized access.
2. **Partially Implemented Controls:** Controls that exist and function in primary flows but suffer from edge-case degradation, architectural omissions, or missing fallbacks.
3. **Missing Controls:** Architectural requirements or defense-in-depth mechanisms that have not yet been implemented in code.
4. **Architectural Gaps:** Structural design choices (e.g., database schema, process concurrency) that create long-term scalability, resilience, or isolation risks.
5. **Security Test Coverage Gaps:** Scenarios lacking automated regression or adversarial verification tests.

---

## 2. Confirmed Vulnerabilities

These findings represent verifiable software defects verified through code inspection and testing:

### Gap V-01 (KY-SEC-001): Hardcoded Cryptographic Fallback Secret

- **Component:** `apps/api/src/ai/services/preview-token.service.ts` ([lines 44–48](file:///c:/Projects/kinergy-platform/apps/api/src/ai/services/preview-token.service.ts#L44-L48))
- **Status:** **CONFIRMED VULNERABILITY** | **CVSS v3.1: 6.5 (Medium)** | **Priority: P1**
- **Description:** `PreviewTokenService` falls back to a hardcoded string (`'kinergy-secure-document-preview-secret-salt-2026'`) if both `AI_PREVIEW_TOKEN_SECRET` and `JWT_SECRET` are missing. If an unconfigured deployment boots, an attacker can sign valid HMAC tokens and inspect document previews across all tenants.
- **Root Cause:** Incomplete environment variable enforcement during service bootstrap.

### Gap V-02 (KY-SEC-002): Same-Tenant BOLA / IDOR on Conversation Title & Archive

- **Component:** `apps/api/src/ai/conversation/ai-conversation.controller.ts` ([lines 603–647](file:///c:/Projects/kinergy-platform/apps/api/src/ai/conversation/ai-conversation.controller.ts#L603-L647))
- **Status:** **CONFIRMED VULNERABILITY** | **CVSS v3.1: 5.4 (Medium)** | **Priority: P1**
- **Description:** Endpoints `PATCH /ai/conversations/:id/title` and `DELETE /ai/conversations/:id` assert tenant membership (`conv.tenantId === actor.tenantId`) but do not verify that the requesting user owns the conversation (`conv.userId === actor.userId`). Authenticated users can modify or archive other users' conversations within the same tenant.
- **Root Cause:** Authorization check omitted user-level identity assertion.

### Gap V-03 (KY-SEC-003): Missing Tenant Scoping in Low-Level Vector Similarity Search

- **Component:** `packages/core/src/ai/infrastructure/persistence/prisma/repositories/prisma-vector-store.repository.ts` ([lines 210–220](file:///c:/Projects/kinergy-platform/packages/core/src/ai/infrastructure/persistence/prisma/repositories/prisma-vector-store.repository.ts#L210-L220))
- **Status:** **CONFIRMED VULNERABILITY** | **CVSS v3.1: 4.8 (Medium)** | **Priority: P1**
- **Description:** Raw SQL query in `IVectorStorePort.similaritySearch` filters exclusively on `index_generation_id = $2` without accepting or verifying `tenant_id`. Direct callers can query vector embeddings across tenant boundaries if an index generation ID is known.
- **Root Cause:** Interface method signature omitted `tenantId` parameter.

---

## 3. Partially Implemented Controls

These controls function in standard happy-path scenarios but degrade under specific operational conditions:

### Gap P-01 (KY-SEC-004): Asynchronous Worker Identity Degradation

- **Component:** `apps/api/src/ai/services/generation/ai-turn-generation.worker.ts` ([lines 180–195](file:///c:/Projects/kinergy-platform/apps/api/src/ai/services/generation/ai-turn-generation.worker.ts#L180-L195))
- **Status:** **PARTIALLY IMPLEMENTED** | **CVSS v3.1: 4.3 (Medium)** | **Priority: P2**
- **Description:** When an interrupted generation turn is recovered by the BullMQ worker, `actorContext.roles` is defaulted to an empty array (`[]`). Because the retrieval engine fails closed, the recovered job retrieves zero documents and generates an ungrounded or empty response.
- **Impact:** Service degradation / availability loss for clinicians during worker restart.

### Gap P-02 (KY-SEC-005): Public Citation Stream Role Clearance

- **Component:** `apps/api/src/ai/conversation/ai-conversation.controller.ts` ([lines 976–1016](file:///c:/Projects/kinergy-platform/apps/api/src/ai/conversation/ai-conversation.controller.ts#L976-L1016))
- **Status:** **PARTIALLY IMPLEMENTED** | **CVSS v3.1: 4.3 (Medium)** | **Priority: P2**
- **Description:** `GET /ai/conversations/:id/stream` is decorated with `@Public()` to support browser EventSource connections. If the browser client omits the `Authorization: Bearer <token>` header, the endpoint defaults `userRoles = []`, failing closed on clinical citations.
- **Impact:** Citations fail to stream to clinicians connecting over native EventSource.

### Gap P-03 (KY-SEC-008): Insecure LocalStorage Conversation Caching

- **Component:** `apps/web/src/modules/intelligence/assistant/services/assistant-storage.service.ts` ([lines 12–16](file:///c:/Projects/kinergy-platform/apps/web/src/modules/intelligence/assistant/services/assistant-storage.service.ts#L12-L16))
- **Status:** **PARTIALLY IMPLEMENTED** | **CVSS v3.1: 3.8 (Low)** | **Priority: P2**
- **Description:** Assistant conversation state and drafts are stored in unencrypted browser `localStorage`. On shared clinical workstations, this state persists indefinitely after logout unless the browser cache is manually cleared.
- **Impact:** Exposure of ePHI to subsequent workstation users.

---

## 4. Missing Controls

Architectural security controls that have not yet been implemented in code:

### Gap M-01 (KY-SEC-006): Automated Physical Storage Hard-Purge Worker

- **Component:** Document Storage and Ingestion Pipeline
- **Status:** **MISSING CONTROL** | **CVSS v3.1: 4.3 (Medium)** | **Priority: P2**
- **Description:** `VectorCleanupService` safely deletes vector embeddings when a document is soft-deleted, but physical binary files in storage (`.storage/` or S3) and raw text in `knowledge_chunks` are never purged.
- **Required Control:** A scheduled BullMQ worker executing a hard-purge sweep on records soft-deleted >30 days ago to satisfy GDPR Art. 17 and HIPAA data minimization.

### Gap M-02 (KY-SEC-007): External Hyperlink Confirmation Modal

- **Component:** `apps/web/src/modules/intelligence/assistant/components/markdown-renderer.tsx`
- **Status:** **MISSING CONTROL** | **CVSS v3.1: 4.3 (Medium)** | **Priority: P2**
- **Description:** While `isSafeUrl()` blocks `javascript:` schemes, any `https://` external URL generated by the model or extracted from documents is rendered as an active link without an intermediary warning modal or domain allowlist.
- **Required Control:** React confirmation modal warning users when opening external links.

### Gap M-03 (KY-SEC-011): Automated System Prompt Output Scrubber

- **Component:** `apps/api/src/ai/services/rag/grounded-generation.service.ts`
- **Status:** **MISSING CONTROL** | **CVSS v3.1: 3.3 (Low)** | **Priority: P3**
- **Description:** Grounded generation relies entirely on prompt-level instructions to prevent system prompt leakage. It lacks an automated post-generation output filter to scan answers for internal prompt canary strings.
- **Required Control:** String/regex scrubber stripping canary phrases before streaming to client.

### Gap M-04 (KY-SEC-012): Explicit S3 Server-Side Encryption Parameter

- **Component:** `apps/platform/src/storage/adapters/s3-storage.adapter.ts`
- **Status:** **MISSING CONTROL** | **CVSS v3.1: 3.1 (Low)** | **Priority: P3**
- **Description:** `S3StorageAdapter.saveFile()` does not explicitly specify `ServerSideEncryption: 'AES256'` in `PutObjectCommandInput`, relying on cloud-side bucket defaults.
- **Required Control:** Explicit encryption parameter in S3 SDK upload call.

---

## 5. Architectural Gaps

Structural and database design gaps requiring planned evolution:

### Gap A-01 (KY-SEC-009): Global Unpartitioned HNSW Index on Multi-Tenant Database

- **Component:** `prisma/migrations/20261120000000_enable_pgvector_and_vector_persistence/migration.sql`
- **Status:** **ARCHITECTURAL GAP** | **CVSS v3.1: 3.7 (Low)** | **Priority: P3**
- **Description:** The HNSW vector index is created globally across all tenants. In pgvector HNSW, graph navigation happens prior to SQL `WHERE` clause evaluation. For smaller tenants in a large multi-tenant database, this leads to graph truncation (recall starvation) where all nearest neighbors are filtered out.
- **Recommended Evolution:** Partition the `document_embeddings` table by `tenant_id` using PostgreSQL native table partitioning or partial indexes.

### Gap A-02 (KY-SEC-010): In-Process CPU-Bound Document Parsing

- **Component:** `apps/api/src/ai/adapters/parsers/pdf-parser.adapter.ts`
- **Status:** **ARCHITECTURAL GAP** | **CVSS v3.1: 3.7 (Low)** | **Priority: P3**
- **Description:** Parsing large PDF files (up to 500 pages) executes synchronously within the Node.js API process event loop, introducing event loop lag for concurrent API requests.
- **Recommended Evolution:** Offload document parsing to Node.js `worker_threads` or dedicated BullMQ background worker processes.

### Gap A-03 (KY-SEC-013): Lack of Native `tenant_id` Column on `document_embeddings`

- **Component:** `prisma/schema.prisma` ([lines 1077–1101](file:///c:/Projects/kinergy-platform/prisma/schema.prisma#L1077-L1101))
- **Status:** **ARCHITECTURAL GAP** | **CVSS v3.1: 3.1 (Low)** | **Priority: P3**
- **Description:** `DocumentEmbedding` does not include a direct `tenant_id` column, relying on joins through `knowledge_chunks` and `knowledge_documents` to enforce tenant boundaries.
- **Recommended Evolution:** Add native `tenant_id` column to enable database-level row-level security (RLS) and faster scoped queries.

### Gap A-04 (KY-SEC-014): Unescaped Markdown Section Delimiters in Retrieved Evidence

- **Component:** `apps/api/src/ai/services/rag/rag-context-builder.service.ts`
- **Status:** **ARCHITECTURAL GAP** | **CVSS v3.1: 2.6 (Low)** | **Priority: P3**
- **Description:** Document text containing markdown headers (e.g., `### USER INQUIRY:`) is not escaped or indented within `<evidence_chunk>` XML blocks.
- **Recommended Evolution:** Indent evidence chunk text or escape leading `#` characters.

---

## 6. Security Test Coverage Gaps

While the platform boasts 304 passing automated tests across retrieval, parsing, and conversation lifecycles, specific adversarial scenarios currently lack automated test coverage:

| Coverage Gap | Target Domain              | Missing Test Scenario                                                                              | Recommended Test File                    |
| :----------- | :------------------------- | :------------------------------------------------------------------------------------------------- | :--------------------------------------- |
| **TG-01**    | BOLA Verification          | Automated test asserting User A cannot patch title or delete conversation of User B (same tenant). | `ai-conversation-security.spec.ts`       |
| **TG-02**    | Secret Enforcement         | Asserting `PreviewTokenService` initialization throws if secret is undefined or <32 characters.    | `preview-token.service.spec.ts`          |
| **TG-03**    | Low-Level Vector Isolation | Asserting `IVectorStorePort.similaritySearch` rejects cross-tenant index generations.              | `vector-persistence.integration.spec.ts` |
| **TG-04**    | Worker Interruption Auth   | Asserting rehydrated BullMQ turn jobs retain valid clinician roles.                                | `generation-resilience.spec.ts`          |
| **TG-05**    | Shared Terminal Logout     | Asserting web client `authService.logout()` explicitly purges assistant conversation cache.        | `assistant-storage.service.spec.ts`      |
| **TG-06**    | Hard-Purge Verification    | Asserting physical file deletion after 30-day retention TTL.                                       | `vector-cleanup.service.spec.ts`         |
