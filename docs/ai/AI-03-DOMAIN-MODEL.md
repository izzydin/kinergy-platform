# Kynergy Intelligence Knowledge Document Domain Model (Milestone AI-03.1)

- **Document Identifier:** `AI-03-DOMAIN-MODEL`
- **Date:** 2026-11-19
- **Repository:** `izzydin/kinergy-platform`
- **Role:** Principal Domain-Driven Design Architect, Senior TypeScript Domain Engineer
- **Milestone:** AI-03 — Knowledge Management & Document Lifecycle
- **Sub-Task:** AI-03.1 — Knowledge Document Domain Model Specification & Implementation
- **Status:** IMPLEMENTED & VERIFIED (100% PURE DOMAIN)

---

## 1. Executive Summary & Design Vision

Milestone **AI-03.1** establishes the pure TypeScript Domain Model for **Knowledge Management and Ingestion Lifecycle** within the **Kynergy Intelligence** bounded context (`@kinergy-platform/core`).

In strict conformance with Domain-Driven Design (DDD), Clean Architecture, and Kinergy Platform engineering principles:

1. **Zero Infrastructure Coupling:** The domain model has **zero dependencies** on NestJS, Prisma ORM, PostgreSQL, Ollama, AWS S3 SDK, or HTTP transport libraries.
2. **Strict Browser Boundary Purity:** All models and value objects are isomorphic and browser-safe, verified by `browser-boundary.spec.ts` (5/5 passing).
3. **Decoupled Aggregates:** To prevent artificial lifecycle locks, `KnowledgeDocument` (conceptual document container and version lineage) and `IngestionJob` (asynchronous background processing pipeline) are engineered as **independent Aggregate Roots**.
4. **Immutable Version Lineage:** Physical file revisions are encapsulated as immutable `DocumentVersion` entities. A subsequent version never mutates or overwrites historical file records.
5. **Pre-Retrieval Tenancy & Access Invariants:** Tenant isolation (`tenantId`) and uploader provenance (`uploadedBy`) are validated upon instantiation and enforced at aggregate boundaries.

---

## 2. Aggregate Architecture & Boundary Evaluation

```mermaid
classDiagram
    class KnowledgeDocument {
        <<Aggregate Root>>
        -DocumentId _id
        -string _title
        -string _description
        -string _tenantId
        -string _uploadedBy
        -VisibilityScope _visibilityScope
        -string _currentVersionId
        -number _version
        -Date _createdAt
        -Date _updatedAt
        -Date _deletedAt
        -DocumentVersion[] _versions
        +create(props) KnowledgeDocument
        +reconstitute(props) KnowledgeDocument
        +addVersion(props) DocumentVersion
        +updateMetadata(title, desc) void
        +changeVisibilityScope(scope) void
        +softDelete(deletedBy) void
        +restore() void
        +getVersion(number) DocumentVersion
        +getCurrentVersion() DocumentVersion
        +assertTenantOwnership(tenantId) void
    }

    class DocumentVersion {
        <<Immutable Entity>>
        +string id
        +string documentId
        +number versionNumber
        +string originalFileName
        +string mimeType
        +number fileSize
        +string checksum
        +string storageKey
        +string language
        +string uploadedBy
        +Date createdAt
        +create(props) DocumentVersion
    }

    class IngestionJob {
        <<Aggregate Root>>
        -string _id
        -string _documentId
        -string _documentVersionId
        -string _tenantId
        -IngestionStatus _status
        -number _attemptCount
        -number _maxAttempts
        -string _lastErrorCode
        -string _lastErrorMessage
        -number _version
        -Date _createdAt
        -Date _startedAt
        -Date _completedAt
        -Date _nextRetryAt
        -Date _cancelledAt
        -string _cancellationReason
        +create(props) IngestionJob
        +reconstitute(props) IngestionJob
        +startValidation() void
        +startProcessing() void
        +startIndexing() void
        +markReady() void
        +fail(code, message) void
        +cancel(reason) void
        +retry(retryAt) void
        +isTerminal() boolean
        +canRetry() boolean
        +assertTenantOwnership(tenantId) void
    }

    KnowledgeDocument "1" *-- "many" DocumentVersion : owns immutable
    IngestionJob ..> DocumentVersion : processes asynchronously
```

### Architectural Evaluation: Why IngestionJob is a Separate Aggregate

| Design Dimension         | Tightly Coupled Model (Single Aggregate)                                                                                                   | Decoupled Model (Approved Architecture)                                                                                                         |
| :----------------------- | :----------------------------------------------------------------------------------------------------------------------------------------- | :---------------------------------------------------------------------------------------------------------------------------------------------- |
| **Concurrency & Locks**  | Background workers updating ingestion progress lock the entire `KnowledgeDocument`. Simultaneous staff metadata edits cause OCC conflicts. | Background worker updates `IngestionJob` independently. Staff can update titles or upload subsequent versions without lock contention.          |
| **Failure Semantics**    | If ingestion fails, the document aggregate state becomes ambiguous (is the file deleted, active, or in error?).                            | The source `DocumentVersion` remains securely stored, retrievable, and immutable. Only the `IngestionJob` reflects the failure.                 |
| **Retry & Auditability** | Retrying overwrites or pollutes the main document entity with transient retry counts and timestamps.                                       | Retries are controlled transitions on `IngestionJob`. If an unrecoverable crash occurs, a fresh job can reference the identical source version. |
| **Transaction Bounds**   | A single database transaction must encompass document metadata, version history, text chunks, and job state.                               | Scoped transactions: document creation commits cleanly; worker jobs commit independently across pipeline stages.                                |

---

## 3. Value Objects Specification

### 3.1 `DocumentId`

- **Location:** [`packages/core/src/ai/domain/value-objects/document-id.vo.ts`](file:///c:/Projects/kinergy-platform/packages/core/src/ai/domain/value-objects/document-id.vo.ts)
- **Format:** RFC 4122 v4 UUID string.
- **Invariants:**
  - Non-empty, trimmed string. Empty values throw `DocumentValidationException`.
  - Isomorphic generation: uses `globalThis.crypto.randomUUID()` when available; falls back to deterministic timestamp-entropy string in legacy test contexts.
  - Value object equality via `.equals()`.

### 3.2 `DocumentChecksum`

- **Location:** [`packages/core/src/ai/domain/value-objects/document-checksum.vo.ts`](file:///c:/Projects/kinergy-platform/packages/core/src/ai/domain/value-objects/document-checksum.vo.ts)
- **Format:** Exactly 64-character lowercase hexadecimal string (`/^[a-f0-9]{64}$/`).
- **Invariants:**
  - Automatically normalizes uppercase hexadecimal strings to lowercase.
  - Rejects strings with length $\neq 64$ or invalid characters with `DocumentValidationException`.
  - Guarantees binary deduplication and tamper detection.

---

## 4. Aggregate Invariants & Domain Rules

### 4.1 KnowledgeDocument Aggregate Rules

1. **Strict Version Numbering:** Initial version is strictly $1$. Subsequent versions increment monotonically ($1 \rightarrow 2 \rightarrow 3$). Arbitrary version jumps are impossible.
2. **Duplicate Checksum Rejection:** A document cannot contain two versions with the identical SHA-256 checksum. Re-uploading an unchanged file throws `DuplicateDocumentVersionException`.
3. **Current Version Pointer:** Adding a version automatically updates `currentVersionId` to the latest version and increments the OCC `version` counter.
4. **Soft Deletion Immutability:** Once `softDelete(deletedBy)` is invoked, `deletedAt` is recorded. Any attempt to add versions, update metadata, or delete again throws `DocumentAlreadyDeletedException`.
5. **Tenant Isolation:** Every operation asserts matching tenant partition (`assertTenantOwnership(tenantId)`). Cross-tenant queries throw `UnauthorizedDocumentAccessException`.

### 4.2 DocumentVersion Entity Rules

1. **Object Immutability:** Built with `Object.freeze(this)`. No setters or mutator methods exist.
2. **MIME Verification:** Rejects unsupported MIME types with `DocumentValidationException`. Supported formats:
   - PDF: `application/pdf`
   - DOCX: `application/vnd.openxmlformats-officedocument.wordprocessingml.document`
   - Markdown: `text/markdown`, `text/x-markdown`
   - Text: `text/plain`
3. **Non-Zero Sizing:** File size must be a strictly positive integer ($>0$ bytes).

### 4.3 IngestionJob Aggregate Rules

1. **Initial State:** Instantiated strictly in `UPLOADED` state with `attemptCount = 1`.
2. **Explicit Step-by-Step Progression:** Transitioning to `READY` requires walking through each verified phase: `UPLOADED` $\rightarrow$ `VALIDATING` $\rightarrow$ `PROCESSING` $\rightarrow$ `INDEXING` $\rightarrow$ `READY`. Jumping to `READY` throws `InvalidStateTransitionException`.
3. **Controlled Retry:** Retrying is only allowed from `FAILED` state. Incrementing `attemptCount` is capped by `maxAttempts` (default 3). Exceeding the ceiling throws `InvalidIngestionRetryException`.
4. **Cancellation Immutability:** A `CANCELLED` job can never silently resume, fail, or be retried.
5. **Completed Immutability:** A `READY` job cannot be cancelled, failed, or retried.

---

## 5. Domain Event Catalog

| Event Name                           | Aggregate           | Meaning & Trigger                                        |
| :----------------------------------- | :------------------ | :------------------------------------------------------- |
| `KnowledgeDocumentCreatedEvent`      | `KnowledgeDocument` | Initial logical document created.                        |
| `DocumentVersionAddedEvent`          | `KnowledgeDocument` | New immutable file revision added.                       |
| `KnowledgeDocumentUpdatedEvent`      | `KnowledgeDocument` | Human-readable title or description modified.            |
| `KnowledgeDocumentDeletedEvent`      | `KnowledgeDocument` | Document soft-deleted.                                   |
| `KnowledgeDocumentRestoredEvent`     | `KnowledgeDocument` | Document restored from soft-deletion.                    |
| `IngestionJobCreatedEvent`           | `IngestionJob`      | Ingestion job queued in `UPLOADED` status.               |
| `IngestionJobValidationStartedEvent` | `IngestionJob`      | Worker initiated checksum/MIME verification.             |
| `IngestionJobProcessingStartedEvent` | `IngestionJob`      | Worker initiated text parsing and chunking.              |
| `IngestionJobIndexingStartedEvent`   | `IngestionJob`      | Worker initiated dense vector embedding generation.      |
| `IngestionJobCompletedEvent`         | `IngestionJob`      | All indexing confirmed; document is `READY`.             |
| `IngestionJobFailedEvent`            | `IngestionJob`      | Ingestion failed; logs error code & message.             |
| `IngestionJobCancelledEvent`         | `IngestionJob`      | User or admin cancelled active ingestion.                |
| `IngestionJobRetriedEvent`           | `IngestionJob`      | Controlled retry initiated (`attemptCount` incremented). |

---

## 6. Verification & Automated Test Evidence

Automated testing across `packages/core/src/ai/domain/__tests__/`:

- `document-value-objects.spec.ts`: **10 tests passed (100%)**
- `document-version.entity.spec.ts`: **6 tests passed (100%)**
- `knowledge-document.aggregate.spec.ts`: **13 tests passed (100%)**
- `ingestion-job.aggregate.spec.ts`: **15 tests passed (100%)**
- `document-ingestion-decoupling.spec.ts`: **3 tests passed (100%)**
- **Total Domain Tests:** **47/47 passed (100%)**
- **Monorepo Typecheck:** `tsc --noEmit -p tsconfig.base.json`: **0 errors**
- **Monorepo Linting:** `eslint packages/core/src/ai`: **0 warnings, 0 errors**
- **Browser Boundary:** `browser-boundary.spec.ts`: **5/5 passed (100%)**
