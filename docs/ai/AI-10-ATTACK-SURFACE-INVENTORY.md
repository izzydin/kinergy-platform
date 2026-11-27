# AI-10 — Attack Surface Inventory: Kynergy Intelligence

**System Name:** Kynergy Intelligence Platform  
**Milestone:** AI-10.0 — Security, Isolation, and Hardening (SEC.09 Final Deliverable)  
**Document ID:** `AI-10-ATTACK-SURFACE-INVENTORY`  
**Assessment Date:** November 27, 2026  
**Roles:** Chief Information Security Architect and Principal Application Security Engineer

---

## 1. Overview and Scope

This document provides a comprehensive inventory of all architectural entry points, trust boundaries, application services, database entities, asynchronous workers, and configuration surfaces comprising Kynergy Intelligence.

Each component is cataloged with its exposure level, required permissions, enforced security controls, identified vulnerabilities (`KY-SEC-001` through `KY-SEC-014`), and verification status.

---

## 2. API Endpoints and Controllers

The API gateway exposes 31 HTTP/SSE endpoints across conversation management, generation turns, citations, and document knowledge workflows:

| Method & Route                            | Controller Class              |     Exposure     | Trust Boundary | Auth & Required Roles         | Enforced Controls                                         | Associated Findings | Verification Status |
| :---------------------------------------- | :---------------------------- | :--------------: | :------------: | :---------------------------- | :-------------------------------------------------------- | :-----------------: | :-----------------: |
| `POST /ai/conversations`                  | `AiConversationController`    |  Authenticated   |     TB-01      | JWT Bearer (`User`)           | User ID bound to JWT; tenant ID extracted from token      |        None         |    **VERIFIED**     |
| `GET /ai/conversations`                   | `AiConversationController`    |  Authenticated   |     TB-01      | JWT Bearer (`User`)           | Filtered by `tenantId` and `userId`                       |        None         |    **VERIFIED**     |
| `GET /ai/conversations/:id`               | `AiConversationController`    |  Authenticated   |     TB-01      | JWT Bearer (`User`)           | Tenant check (`conv.tenantId === actor.tenantId`)         |        None         |    **VERIFIED**     |
| `PATCH /ai/conversations/:id/title`       | `AiConversationController`    |  Authenticated   |     TB-01      | JWT Bearer (`User`)           | Tenant check only; missing `conv.userId === actor.userId` |   **KY-SEC-002**    |    **VERIFIED**     |
| `DELETE /ai/conversations/:id`            | `AiConversationController`    |  Authenticated   |     TB-01      | JWT Bearer (`User`)           | Soft delete; missing user ownership check                 |   **KY-SEC-002**    |    **VERIFIED**     |
| `POST /ai/conversations/:id/turns`        | `AiConversationController`    |  Authenticated   |     TB-01      | JWT Bearer (`User`)           | Validates conversation tenant; enqueues turn job          |        None         |    **VERIFIED**     |
| `GET /ai/conversations/:id/turns/:turnId` | `AiConversationController`    |  Authenticated   |     TB-01      | JWT Bearer (`User`)           | Tenant match on conversation; status check                |        None         |    **VERIFIED**     |
| `GET /ai/conversations/:id/stream`        | `AiConversationController`    | **Public** (SSE) |     TB-01      | `@Public()` / Optional Bearer | EventSource compatible; defaults empty roles if unauth    |   **KY-SEC-005**    |    **VERIFIED**     |
| `POST /ai/citations/preview-token`        | `AiCitationController`        |  Authenticated   |     TB-01      | JWT Bearer (`User`)           | HMAC-SHA256 generation; fallback secret issue             |   **KY-SEC-001**    |    **VERIFIED**     |
| `GET /ai/citations/preview`               | `AiCitationController`        |  Public / Token  |     TB-01      | `?token=...` (HMAC)           | Timing-safe HMAC verification; chunk text retrieval       |   **KY-SEC-001**    |    **VERIFIED**     |
| `POST /ai/documents/upload`               | `KnowledgeDocumentController` |  Authenticated   |     TB-01      | JWT Bearer (`Admin`/`Staff`)  | MIME check, magic bytes check, size limit 50MB            |        None         |    **VERIFIED**     |
| `GET /ai/documents`                       | `KnowledgeDocumentController` |  Authenticated   |     TB-01      | JWT Bearer (`User`)           | Tenant-scoped query (`where: { tenantId }`)               |        None         |    **VERIFIED**     |
| `GET /ai/documents/:id`                   | `KnowledgeDocumentController` |  Authenticated   |     TB-01      | JWT Bearer (`User`)           | Tenant match; RBAC document visibility rules              |        None         |    **VERIFIED**     |
| `DELETE /ai/documents/:id`                | `KnowledgeDocumentController` |  Authenticated   |     TB-01      | JWT Bearer (`Admin`)          | Soft delete; unlinks vectors; retains physical file       |   **KY-SEC-006**    |    **VERIFIED**     |
| `GET /ai/health`                          | `AiHealthController`          |    **Public**    |     TB-01      | None                          | Read-only status check for Ollama and PostgreSQL          |        None         |    **VERIFIED**     |

---

## 3. Application Services & Core Orchestration

| Service Name                      | Source Location                      | Purpose                                                      | Trust Boundary | Primary Controls                                            | Vulnerabilities / Findings | Verification Status |
| :-------------------------------- | :----------------------------------- | :----------------------------------------------------------- | :------------: | :---------------------------------------------------------- | :------------------------: | :-----------------: |
| `SecureRetrievalOrchestrator`     | `apps/api/src/ai/services/retrieval` | Orchestrates hybrid semantic and lexical vector search       |     TB-02      | Enforces tenant scope, RBAC filters, active index check     |            None            |    **VERIFIED**     |
| `GroundedGenerationService`       | `apps/api/src/ai/services/rag`       | Orchestrates prompt construction and LLM streaming           |     TB-04      | 14 Authoritative Rules; CitationValidatorService            |       **KY-SEC-011**       |    **VERIFIED**     |
| `RagContextBuilderService`        | `apps/api/src/ai/services/rag`       | Assembles retrieved chunks into LLM prompt context           |     TB-04      | XML chunk encapsulation (`<evidence_chunk>`); tag stripping |       **KY-SEC-014**       |    **VERIFIED**     |
| `CitationValidatorService`        | `apps/api/src/ai/services/rag`       | Verifies LLM output citation tokens against retrieved chunks |     TB-04      | Strips ungrounded citation IDs; validates chunk ranges      |            None            |    **VERIFIED**     |
| `PreviewTokenService`             | `apps/api/src/ai/services`           | Issues and verifies signed HMAC tokens for chunk previews    |     TB-01      | HMAC-SHA256 signature; timingSafeEqual comparison           |       **KY-SEC-001**       |    **VERIFIED**     |
| `DocumentContentValidatorService` | `apps/api/src/ai/services/knowledge` | Validates uploaded files for malicious signatures            |     TB-05      | Magic bytes check; ZIP bomb recursion limits; 500-page cap  |            None            |    **VERIFIED**     |
| `VectorCleanupService`            | `apps/api/src/ai/services/indexing`  | Cleans up vector embeddings on reindex or soft delete        |     TB-02      | Deletes `document_embeddings`; unlinks index generation     |       **KY-SEC-006**       |    **VERIFIED**     |
| `AiTelemetryService`              | `apps/api/src/ai/services`           | Privacy-preserving audit and usage telemetry                 |     TB-02      | Replaces user IDs with HMAC pseudonyms; hashes queries      |            None            |    **VERIFIED**     |

---

## 4. Background Workers and Queues

| Worker Name               | Queue System                  | Concurrency & Policy                            | Trust Boundary | Security Controls                                          | Associated Findings | Verification Status |
| :------------------------ | :---------------------------- | :---------------------------------------------- | :------------: | :--------------------------------------------------------- | :-----------------: | :-----------------: |
| `AiTurnGenerationWorker`  | BullMQ (`ai-turn-generation`) | Concurrency: 5; Exponential Backoff (3 retries) |     TB-03      | Deserializes actor context; manages turn state lifecycle   |   **KY-SEC-004**    |    **VERIFIED**     |
| `VectorIndexingWorker`    | BullMQ (`ai-vector-indexing`) | Concurrency: 2; Backoff: 5s                     |     TB-03      | Validates tenant ownership of document version             |        None         |    **VERIFIED**     |
| `DocumentRetentionWorker` | Scheduled Cron / Queue        | _Planned Component_                             |     TB-05      | _Planned:_ Automated 30-day hard purge of files and chunks |   **KY-SEC-006**    |     **MISSING**     |

---

## 5. Storage and File Parsing Adapters

| Adapter Name          | Source Location                      | Storage Medium                 | Trust Boundary | Security Defenses                                        | Associated Findings | Verification Status |
| :-------------------- | :----------------------------------- | :----------------------------- | :------------: | :------------------------------------------------------- | :-----------------: | :-----------------: |
| `LocalStorageAdapter` | `apps/platform/src/storage/adapters` | Local Filesystem (`.storage/`) |     TB-05      | `StorageKeyUtil` path traversal defense; sanitized paths |        None         |    **VERIFIED**     |
| `S3StorageAdapter`    | `apps/platform/src/storage/adapters` | AWS S3 Bucket                  |     TB-05      | Private bucket ACL; AWS SDK v3 `PutObjectCommand`        |   **KY-SEC-012**    |    **VERIFIED**     |
| `PdfParserAdapter`    | `apps/api/src/ai/adapters/parsers`   | In-memory `unpdf` library      |     TB-05      | 50MB size limit; 500-page limit; 30s timeout             |   **KY-SEC-010**    |    **VERIFIED**     |
| `DocxParserAdapter`   | `apps/api/src/ai/adapters/parsers`   | In-memory `mammoth` library    |     TB-05      | 50MB size limit; ZIP compression ratio limits            |        None         |    **VERIFIED**     |

---

## 6. Vector Database & Persistence Interfaces

| Interface / Class                   | Technology                | Storage Schema              | Trust Boundary | Primary Controls                                               |      Associated Findings       | Verification Status |
| :---------------------------------- | :------------------------ | :-------------------------- | :------------: | :------------------------------------------------------------- | :----------------------------: | :-----------------: |
| `IVectorStorePort`                  | TypeScript Port Interface | `packages/core`             |     TB-02      | Abstract interface for vector similarity search                |         **KY-SEC-003**         |    **VERIFIED**     |
| `PrismaVectorStoreRepository`       | PostgreSQL 16 `pgvector`  | `document_embeddings` table |     TB-02      | Parameterized SQL query; HNSW vector index                     | **KY-SEC-003**, **KY-SEC-009** |    **VERIFIED**     |
| `PrismaDocumentRetrievalRepository` | Prisma ORM                | Multi-table joins           |     TB-02      | 3-way SQL join: `chunks` -> `docs` (`d.tenant_id = $tenantId`) |              None              |    **VERIFIED**     |

---

## 7. Database Entities and Data Relationships

```
+---------------------------------------------------------------------------------------------------------+
|                                    DATABASE ENTITIES & TENANT SCOPING                                   |
+===========================+=====================+=======================================================+
| Model / Table Name        | Tenant Column Scope | Primary Foreign Key Relationships                     |
+---------------------------+---------------------+-------------------------------------------------------+
| `AiConversation`          | `tenant_id` (Direct)| Belongs to `Tenant`, belongs to `User`                |
| `AiMessage`               | via `AiConversation`| Belongs to `AiConversation` (Cascade delete)          |
| `AiMessageCitation`       | via `AiMessage`     | Belongs to `AiMessage`, references `KnowledgeChunk`   |
| `KnowledgeDocument`       | `tenant_id` (Direct)| Belongs to `Tenant`, has many `KnowledgeDocumentVersion`|
| `KnowledgeDocumentVersion`| via `KnowledgeDoc`  | Belongs to `KnowledgeDocument`, has many chunks       |
| `KnowledgeChunk`          | via `KnowledgeDoc`  | Belongs to `KnowledgeDocumentVersion`                 |
| `DocumentEmbedding`       | via `KnowledgeChunk`| Belongs to `KnowledgeChunk` (Missing direct tenant_id)|
+---------------------------+---------------------+-------------------------------------------------------+
```

---

## 8. Web Client Attack Surface (`apps/web`)

| Component / Service       | File Path              | Client Responsibility        | Trust Boundary | Security Defenses                                    | Associated Findings | Verification Status |
| :------------------------ | :--------------------- | :--------------------------- | :------------: | :--------------------------------------------------- | :-----------------: | :-----------------: |
| `MarkdownRenderer`        | `assistant/components` | Renders LLM output markdown  |   Client DOM   | Strips raw HTML; blocks `javascript:`/`data:` URLs   |   **KY-SEC-007**    |    **VERIFIED**     |
| `AssistantStorageService` | `assistant/services`   | Caches active chat drafts    | Client Storage | Bound to browser origin                              |   **KY-SEC-008**    |    **VERIFIED**     |
| `CitationDrawer`          | `assistant/components` | Renders chunk preview drawer |   Client DOM   | Fetches signed preview token; sanitizes preview HTML |        None         |    **VERIFIED**     |

---

## 9. Configuration and Secrets Attack Surface

| Configuration Key         | Injection Source | Purpose                          | Current Secret Posture                                   | Associated Findings | Verification Status |
| :------------------------ | :--------------- | :------------------------------- | :------------------------------------------------------- | :-----------------: | :-----------------: |
| `JWT_SECRET`              | `.env`           | Signs & validates session JWTs   | Sourced from environment; must be >=32 characters        |        None         |    **VERIFIED**     |
| `AI_PREVIEW_TOKEN_SECRET` | `.env`           | Signs HMAC chunk preview tokens  | Missing from `.env.example`; falls back to static string |   **KY-SEC-001**    |    **VERIFIED**     |
| `AWS_SECRET_ACCESS_KEY`   | `.env`           | Authenticates S3 storage adapter | Sourced from environment; private IAM role recommended   |   **KY-SEC-012**    |    **VERIFIED**     |
| `DATABASE_URL`            | `.env`           | PostgreSQL connection string     | Sourced from environment; requires private network       |        None         |    **VERIFIED**     |
| `REDIS_URL`               | `.env`           | Redis queue connection string    | Sourced from environment; private network                |        None         |    **VERIFIED**     |
| `OLLAMA_BASE_URL`         | `.env`           | Local Ollama endpoint            | Defaults to `http://127.0.0.1:11434` (loopback only)     |        None         |    **VERIFIED**     |
