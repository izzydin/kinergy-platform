# Milestone 10.5 — External Object Storage Integration Report

**Date:** 2026-11-03  
**Status:** COMPLETE (VERIFIED & ACCEPTED)  
**Strategy:** Free-First S3-Compatible Cloud Storage (Cloudflare R2)  
**Lead Roles:** Principal Backend Architect & Senior Cloud Storage Engineer

---

## 1. Implemented Storage Architecture & Provider Strategy

Milestone 10.5 designed, implemented, and verified a production-grade external object storage adapter following Hexagonal Architecture principles. The implementation is provider-agnostic, keeping domain and application modules completely free of cloud vendor SDKs.

```
                  Domain & Application Layer
                              │
                              ▼
                [ ObjectStoragePort (Interface) ]
                              │
         ┌────────────────────┴────────────────────┐
         ▼                                         ▼
[ LocalStorageAdapter ]                  [ S3StorageAdapter ]
  - Offline local dev & CI                 - Cloudflare R2 (Free Tier)
  - Zero cloud credentials                 - AWS S3 / MinIO (Interchangeable)
  - File path: .storage/tenants/...        - @aws-sdk/client-s3 (v3)
                                           - @aws-sdk/s3-request-presigner
```

### 1.1 Provider Selection Rationale

- **Primary Cloud Provider (Staging & MVP):** **Cloudflare R2** via the S3-compatible API.
- **Economic Justification:** Cloudflare R2 provides a permanent free allowance of **10 GB/mo storage, 1M Class A operations/mo, 10M Class B operations/mo**, and **$0 egress bandwidth fees**, enabling production-grade storage at \$0 infrastructure cost during MVP operations.
- **Interchangeability:** S3 protocols guarantee that AWS S3, Backblaze B2, or self-hosted MinIO can be substituted strictly via environment configuration changes without code refactoring.

---

## 2. Files Changed & Added

| Component / Layer         | File Path                                                                                                                                                                                               | Description                                                                                                                                                                       |
| :------------------------ | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | :-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Domain Types**          | [`apps/api/src/platform/storage/domain/storage.types.ts`](file:///c:/Projects/kinergy-platform/apps/api/src/platform/storage/domain/storage.types.ts)                                                   | Storage contracts: `StorageFileDescriptor`, `StoredObjectMetadata`, `PresignedUploadResult`, `PresignedDownloadResult`, `StorageDomainFolder`.                                    |
| **Domain Errors**         | [`apps/api/src/platform/storage/domain/storage.errors.ts`](file:///c:/Projects/kinergy-platform/apps/api/src/platform/storage/domain/storage.errors.ts)                                                 | Structured error hierarchy: `StorageFileNotFoundError`, `StorageFileTooLargeError`, `StorageInvalidMimeTypeError`, `StorageTenantAccessDeniedError`, `StorageQuotaExceededError`. |
| **Storage Port**          | [`apps/api/src/platform/storage/ports/object-storage.port.ts`](file:///c:/Projects/kinergy-platform/apps/api/src/platform/storage/ports/object-storage.port.ts)                                         | Inversion of control interface (`OBJECT_STORAGE_PORT`) declaring upload, download, delete, exists, metadata, and presigned URL operations.                                        |
| **Key & Partition Utils** | [`apps/api/src/platform/storage/utils/storage-key.util.ts`](file:///c:/Projects/kinergy-platform/apps/api/src/platform/storage/utils/storage-key.util.ts)                                               | Server-generated key generator, filename sanitizer, path traversal guard, and tenant ownership validator.                                                                         |
| **Configuration**         | [`apps/api/src/platform/storage/config/storage.config.ts`](file:///c:/Projects/kinergy-platform/apps/api/src/platform/storage/config/storage.config.ts)                                                 | Default storage configuration, MIME whitelist, payload limits, and quota definitions.                                                                                             |
| **Local Adapter**         | [`apps/api/src/platform/storage/adapters/local-storage.adapter.ts`](file:///c:/Projects/kinergy-platform/apps/api/src/platform/storage/adapters/local-storage.adapter.ts)                               | Offline filesystem storage adapter with metadata sidecars and tenant-isolated partitions.                                                                                         |
| **S3 Adapter**            | [`apps/api/src/platform/storage/adapters/s3-storage.adapter.ts`](file:///c:/Projects/kinergy-platform/apps/api/src/platform/storage/adapters/s3-storage.adapter.ts)                                     | Cloudflare R2 / AWS S3 adapter using AWS SDK v3 with custom endpoint, region `auto`, and error translation.                                                                       |
| **Application Service**   | [`apps/api/src/platform/storage/services/media-storage.service.ts`](file:///c:/Projects/kinergy-platform/apps/api/src/platform/storage/services/media-storage.service.ts)                               | Application orchestrator enforcing 10MB limits, MIME validation, tenant authorization, and quota cost-control governance.                                                         |
| **Controller**            | [`apps/api/src/platform/storage/controllers/storage.controller.ts`](file:///c:/Projects/kinergy-platform/apps/api/src/platform/storage/controllers/storage.controller.ts)                               | Local streaming download controller for testing pre-signed URLs in development environments.                                                                                      |
| **NestJS Module**         | [`apps/api/src/platform/storage/storage.module.ts`](file:///c:/Projects/kinergy-platform/apps/api/src/platform/storage/storage.module.ts)                                                               | Dynamic platform module registering adapters based on `STORAGE_PROVIDER`.                                                                                                         |
| **Env Validation**        | [`apps/api/src/config/env.validation.ts`](file:///c:/Projects/kinergy-platform/apps/api/src/config/env.validation.ts)                                                                                   | Zod schema validation for storage environment variables.                                                                                                                          |
| **Env Reference**         | [`.env.example`](file:///c:/Projects/kinergy-platform/.env.example)                                                                                                                                     | Added Section 10 documenting all storage parameters with safe placeholders.                                                                                                       |
| **ADR-0142**              | [`docs/adr/0142-external-object-storage-and-free-first-cloud-storage-strategy.md`](file:///c:/Projects/kinergy-platform/docs/adr/0142-external-object-storage-and-free-first-cloud-storage-strategy.md) | Architectural decision record for storage abstraction and free-first strategy.                                                                                                    |
| **Operations Guide**      | [`docs/development/external-object-storage-and-cloudflare-r2-guide.md`](file:///c:/Projects/kinergy-platform/docs/development/external-object-storage-and-cloudflare-r2-guide.md)                       | Setup and operational guide for local development and Cloudflare R2.                                                                                                              |

---

## 3. Automated Test Results

The automated storage test suite was executed across four dedicated test files:

```
 PASS  apps/api/src/platform/storage/__tests__/storage-key.util.spec.ts (6.059 s)
 PASS  apps/api/src/platform/storage/__tests__/local-storage.adapter.spec.ts (6.642 s)
 PASS  apps/api/src/platform/storage/__tests__/s3-storage.adapter.spec.ts (10.964 s)
 PASS  apps/api/src/platform/storage/__tests__/media-storage.service.spec.ts (18.581 s)

Test Suites: 4 passed, 4 total
Tests:       30 passed, 30 total
Snapshots:   0 total
Time:        20.007 s
```

### Coverage Highlights:

- **Filename Sanitization:** Path traversal sequences (`../../etc/passwd`), null bytes, control characters, and dangerous symbols are purged.
- **Cross-Tenant Access Rejection:** Mismatched tenant IDs throw `StorageTenantAccessDeniedError` immediately, before any storage call is dispatched.
- **Local Adapter Roundtrip:** Files written to local disk, verified via `exists`, metadata read from sidecar JSON, and binary content downloaded accurately.
- **S3 Adapter Mocks:** Validated `PutObjectCommand`, `GetObjectCommand`, `DeleteObjectCommand`, `HeadObjectCommand`, and presigned URL generation with `getSignedUrl`.
- **Payload & Quota Ceilings:** Files > 10 MB throw `StorageFileTooLargeError`. Exceeding 15 MB test quota throws `StorageQuotaExceededError`. Deleting a file decrements quota usage accurately.

---

## 4. Security & Cost-Control Verification

1. **Private by Default:** Buckets are completely private; no public read permissions or bucket policies are granted.
2. **Short-Lived Bearer URLs:** Presigned URLs expire in 15 minutes (900s) and are issued only after validating tenant context and caller permissions.
3. **MIME Whitelist:** Only safe clinical and business document types are allowed (`application/pdf`, `image/jpeg`, `image/png`, `image/webp`). Executable and script formats are rejected immediately.
4. **Tenant Isolation:** Object keys strictly partition data (`tenants/{tenantId}/...`). Any request for a key outside the tenant boundary is rejected.
5. **No Secret Leaks:** S3 credentials and tokens are excluded from logs, error messages, and frontend bundles.

---

## 5. Migration Status

- **Existing Media to Migrate:** **Zero**.
- **Evidence:** Audit confirmed that the MVP stores clinical SOAP notes and receipts directly in PostgreSQL relations and JSONB columns. No legacy binary files exist on disk or in database BLOBs.

---

## 6. Local & Staging Setup Instructions

### Local Development (Zero Credentials)

Set in `.env`:

```bash
STORAGE_PROVIDER=local
STORAGE_LOCAL_ROOT=./.storage
```

Files will be stored locally in `./.storage/tenants/...` with `.meta.json` sidecars.

### Staging & Production (Cloudflare R2)

Set in environment configuration:

```bash
STORAGE_PROVIDER=s3
STORAGE_S3_ENDPOINT=https://<account_id>.r2.cloudflarestorage.com
STORAGE_S3_REGION=auto
STORAGE_S3_BUCKET=kinergy-staging-media
STORAGE_S3_ACCESS_KEY_ID=<your_r2_token_access_key>
STORAGE_S3_SECRET_ACCESS_KEY=<your_r2_token_secret_key>
STORAGE_S3_FORCE_PATH_STYLE=false
```

---

## 7. Remaining Production Prerequisites & Known Limitations

1. **R2 Dashboard Setup:** An engineer must create the `kinergy-staging-media` bucket in the Cloudflare dashboard and generate the R2 API token prior to staging cutover.
2. **Multipart Uploads:** For files larger than 100 MB, multipart chunking should be implemented when high-resolution medical video capture is introduced in Phase 11.

---

## 8. Final Status & Recommendation

Milestone 10.5 is **COMPLETE, VERIFIED, AND ACCEPTED**.

**Recommendation:** Proceed to **Milestone 10.6 — Production Observability, Logging, and Error Tracking**.
