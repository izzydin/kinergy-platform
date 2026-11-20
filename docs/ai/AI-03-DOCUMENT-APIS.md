# AI-03.4 — Knowledge Document Management REST API Architecture

## 1. Executive Summary & Routing Specification

Milestone **AI-03.4** implements the REST API layer for Kinergy's Knowledge Document Lifecycle and Management subsystem within the AI bounded context. The API exposes secure, tenant-scoped endpoints conforming to NestJS best practices, Clean Architecture, and Domain-Driven Design invariants.

### Route Prefix & Compatibility

- **Canonical Route**: `/api/v1/ai/knowledge/documents`
- **Backward-Compatible Alias**: `/api/v1/ai/documents`
- **Controller Class**: [AiDocumentController](file:///c:/Projects/kinergy-platform/apps/api/src/ai/controllers/ai-document.controller.ts)

---

## 2. API Endpoint Matrix

| Method   | Endpoint Path                                                    | Summary                                      | Auth & Scope      | Response Model                  | Status Codes               |
| :------- | :--------------------------------------------------------------- | :------------------------------------------- | :---------------- | :------------------------------ | :------------------------- |
| `POST`   | `/api/v1/ai/knowledge/documents`                                 | Upload document with initial version         | Tenant Member     | `UploadDocumentResponseDto`     | `201`, `400`, `401`, `409` |
| `GET`    | `/api/v1/ai/knowledge/documents`                                 | List documents with pagination & filters     | Tenant Member     | `PaginatedDocumentsResponseDto` | `200`, `401`, `403`        |
| `GET`    | `/api/v1/ai/knowledge/documents/:id`                             | Get document metadata & versions             | Tenant Member     | `DocumentDetailResponseDto`     | `200`, `401`, `404`        |
| `PATCH`  | `/api/v1/ai/knowledge/documents/:id`                             | Update mutable metadata (title, scope, etc.) | Document / Tenant | `DocumentDetailResponseDto`     | `200`, `400`, `404`        |
| `DELETE` | `/api/v1/ai/knowledge/documents/:id`                             | Soft-delete knowledge document               | Document / Tenant | `void` (No Content)             | `204`, `401`, `404`        |
| `GET`    | `/api/v1/ai/knowledge/documents/:id/versions`                    | List all historical versions for document    | Tenant Member     | `DocumentVersionResponseDto[]`  | `200`, `401`, `404`        |
| `GET`    | `/api/v1/ai/knowledge/documents/:id/versions/:versionId`         | Get single version metadata                  | Tenant Member     | `DocumentVersionResponseDto`    | `200`, `401`, `404`        |
| `POST`   | `/api/v1/ai/knowledge/documents/:id/versions`                    | Upload subsequent version                    | Tenant Member     | `UploadDocumentResponseDto`     | `201`, `400`, `404`, `409` |
| `GET`    | `/api/v1/ai/knowledge/documents/:id/content`                     | Stream authorized file content               | Tenant Member     | Binary Stream / Buffer          | `200`, `401`, `404`        |
| `GET`    | `/api/v1/ai/knowledge/documents/:id/versions/:versionId/content` | Stream specific version file content         | Tenant Member     | Binary Stream / Buffer          | `200`, `401`, `404`        |
| `GET`    | `/api/v1/ai/knowledge/documents/:id/ingestion`                   | Ingestion job history for document           | Tenant Member     | `IngestionJobResponseDto[]`     | `200`, `401`, `404`        |
| `POST`   | `/api/v1/ai/knowledge/documents/:id/ingestion/retry`             | Retry failed ingestion for current version   | Tenant Member     | `IngestionJobResponseDto`       | `200`, `400`, `404`        |
| `POST`   | `/api/v1/ai/knowledge/documents/:id/ingestion/cancel`            | Cancel active ingestion for current version  | Tenant Member     | `IngestionJobResponseDto`       | `200`, `404`, `409`        |

---

## 3. Querying, Filtering, & Server-Side Pagination

Document listing (`GET /api/v1/ai/knowledge/documents`) provides tenant-bounded, deterministic pagination using `ListDocumentsQueryDto`:

### 3.1. Query Parameters

| Parameter         | Type     | Validation / Constraints                    | Default     | Description                             |
| :---------------- | :------- | :------------------------------------------ | :---------- | :-------------------------------------- |
| `page`            | `number` | Minimum: `1`                                | `1`         | 1-indexed page number                   |
| `limit`           | `number` | Min: `1`, Max: `100`                        | `20`        | Bounded items per page                  |
| `search`          | `string` | Trimmed, case-insensitive                   | `undefined` | Substring search against document title |
| `visibilityScope` | `enum`   | `ALL_STAFF`, `CLINICAL_STAFF`, `MANAGEMENT` | `undefined` | Filter by pre-retrieval access scope    |
| `mimeType`        | `string` | Canonical MIME string                       | `undefined` | Filter by document content MIME         |
| `uploadedBy`      | `string` | UUID / User ID                              | `undefined` | Filter by uploader identity             |
| `createdFrom`     | `string` | ISO-8601 Date String                        | `undefined` | Lower timestamp bound                   |
| `createdTo`       | `string` | ISO-8601 Date String                        | `undefined` | Upper timestamp bound                   |
| `orderBy`         | `enum`   | `createdAt`, `updatedAt`, `title`           | `createdAt` | Primary sorting field                   |
| `orderDirection`  | `enum`   | `asc`, `desc`                               | `desc`      | Sort direction                          |

### 3.2. Pagination Invariants

- **Stable Secondary Sort**: Queries enforce deterministic ordering: `[{ [orderBy]: orderDirection }, { id: 'asc' }]`. Equal timestamps produce deterministic ordering without page drift.
- **Unbounded Query Prevention**: Unbounded queries are blocked; requests with `limit > 100` are clamped to `100`.
- **Soft Deletion Masking**: `deletedAt IS NULL` is enforced on all standard listing queries.
- **Response Format**: Conforms to standard `PaginatedDocumentsResponseDto`:
  ```json
  {
    "items": [...],
    "page": 1,
    "limit": 20,
    "total": 45,
    "totalPages": 3,
    "hasNextPage": true,
    "hasPreviousPage": false,
    "data": [...]
  }
  ```

---

## 4. Metadata Update Constraints & Immutability Rules

The `PATCH /api/v1/ai/knowledge/documents/:id` endpoint strictly allows updating:

- `title`: Must be non-empty string ($\le 200$ chars). Empty strings trigger `400 BadRequestException`.
- `description`: Optional text ($\le 1,000$ chars).
- `visibilityScope`: Must be valid `VisibilityScope` enum member.

### Strictly Prohibited Modifications:

- Checksum (`checksum`): **Immutable**.
- Storage key (`storageKey`): **Immutable**.
- File size (`fileSize`): **Immutable**.
- Version number (`versionNumber`): **Sequential & Immutable**.
- Uploading identity (`uploadedBy`): **Audit-locked**.
- Tenant identity (`tenantId`): **System-locked**.
- Ingestion status (`status`): Cannot be modified through PATCH. State transitions require explicit domain actions (`retry`, `cancel`, or background worker transitions).

> [!NOTE]
> Replacing or modifying physical file content requires uploading a subsequent version (`POST /:id/versions`). Earlier versions are never mutated.

---

## 5. Deletion & Retention Policy

1. **Soft Deletion Mechanism**:
   - `DELETE /api/v1/ai/knowledge/documents/:id` marks the aggregate as deleted (`doc.softDelete(userId)`), updating `deletedAt` and bumping OCC aggregate `version`.
   - Returns `204 No Content`.
2. **Subsequent Access Handling**:
   - Soft-deleted documents are omitted from standard listings and return `404 NotFoundException` on subsequent retrieval or download attempts.
3. **Physical File Retention**:
   - Physical objects in local storage or S3 buckets are **not** destroyed during soft deletion, preserving compliance and disaster-recovery capabilities.
4. **Idempotency & Repeated Deletes**:
   - Calling delete on an already soft-deleted document returns `404 NotFoundException`.

---

## 6. Secure Content Streaming & Download

Endpoints:

- `GET /api/v1/ai/knowledge/documents/:id/content` (downloads current version by default)
- `GET /api/v1/ai/knowledge/documents/:id/versions/:versionId/content` (downloads specific version)

### Security Headers:

All content delivery endpoints strictly assert tenant ownership through database lookup before touching `ObjectStoragePort` and emit:

- `Content-Type: <version.mimeType>`
- `Content-Length: <version.fileSize>`
- `X-Content-Type-Options: nosniff` (Defends against MIME-confusion and browser sniffing attacks)
- `Content-Disposition: inline; filename="<encodedOriginalFileName>"`
- `ETag: "<version.checksum>"`

---

## 7. Anti-ID Enumeration & Tenant Isolation

- **Opaque Storage Keys**: Internal keys (`tenants/{tenantId}/knowledge_base/...`) and physical disk paths are **never exposed** in DTOs.
- **Cross-Tenant Guardrail**: When an authenticated user in `tenant_clinic_beta` queries a document belonging to `tenant_clinic_alpha`, the repository query returns `null`, translating to `404 NotFoundException`. This prevents malicious users from inferring the existence or volume of documents in other tenants.

---

## 8. Domain Exception to HTTP Status Mapping

| Domain Exception                            | HTTP Status Code   | Description                                      |
| :------------------------------------------ | :----------------- | :----------------------------------------------- |
| `DuplicateDocumentVersionException`         | `409 Conflict`     | Identical SHA-256 version exists in document     |
| `IngestionJobCancellationConflictException` | `409 Conflict`     | Job already cancelled or completed (READY)       |
| `DocumentNotFoundException`                 | `404 Not Found`    | Document does not exist in requesting tenant     |
| `DocumentAlreadyDeletedException`           | `404 Not Found`    | Target document has been soft-deleted            |
| `UnauthorizedDocumentAccessException`       | `403 Forbidden`    | Access to resource prohibited across tenant      |
| `DocumentValidationException`               | `400 Bad Request`  | Missing file, malformed format, oversized upload |
| `InvalidStateTransitionException`           | `400 Bad Request`  | Prohibited lifecycle transition attempted        |
| `InvalidIngestionRetryException`            | `400 Bad Request`  | Retrying non-failed job                          |
| Unauthenticated / Missing Token             | `401 Unauthorized` | Missing or invalid bearer JWT token              |
