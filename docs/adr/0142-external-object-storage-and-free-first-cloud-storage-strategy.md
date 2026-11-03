# ADR-0142: External Object Storage Architecture and Free-First Cloud Storage Strategy

**Status:** ACCEPTED  
**Date:** 2026-11-03  
**Deciders:** Principal Backend Architect, Senior Cloud Storage Engineer, Platform Lead

---

## 1. Context and Problem Statement

The Kynergy platform requires support for binary file storage for clinical attachments (imaging, diagnostic scans, kinesiology PDFs), client consent documents, generated financial receipts, and automated disaster recovery database archives.

Historically, binary media was not yet integrated into the MVP codebase (clinical notes and receipts were modeled purely as relational entities and JSONB). In staging and production environments, storing binary media directly inside container filesystems or PostgreSQL BLOBs violates container statelessness and leads to database bloat. Furthermore, commercial cloud storage must be introduced without incurring unexpected billable infrastructure costs or dependencies on expiring free trials.

---

## 2. Decision Drivers

1. **Clean & Hexagonal Architecture:** Domain and application layers must depend on an abstract `ObjectStoragePort` and remain 100% free of cloud SDK dependencies (`@aws-sdk/*`).
2. **Free-First Cloud Storage (Zero Egress Costs):** Support Cloudflare R2 as the primary staging and MVP production provider, leveraging its generous free tier (10 GB/mo storage, 1M Class A operations/mo, 10M Class B operations/mo, and $0 internet egress bandwidth fees).
3. **Local & CI Offline Independence:** Provide a native `LocalStorageAdapter` for local development and headless CI pipelines, requiring zero cloud credentials or network connectivity.
4. **Interchangeable S3 Compatibility:** The adapter must implement standard S3 protocols, allowing seamless migration to AWS S3, MinIO, or Backblaze B2 solely through environment configuration without code refactoring.
5. **Multi-Tenant Security & Isolation:** All objects must be private by default. Pre-signed URLs must be short-lived (15-minute TTL) temporary bearer credentials issued only after verifying tenant ownership and caller permissions.
6. **Cost Control Safeguards:** Enforce strict application-level file size ceilings (10 MB max) and cumulative per-tenant storage quotas (5 GB default).

---

## 3. Decision: Hexagonal S3 & Local Storage Ports

We adopt a dual-adapter Hexagonal Architecture pattern:

1. **Port Interface (`ObjectStoragePort`):** Defined in the platform layer, declaring high-level storage verbs (`upload`, `download`, `delete`, `exists`, `getMetadata`, `createPresignedUploadUrl`, `createPresignedDownloadUrl`).
2. **Local Storage Adapter (`LocalStorageAdapter`):** Implements `ObjectStoragePort` on the local filesystem with `.meta.json` sidecar files. Default for `NODE_ENV=development` and CI test runners.
3. **S3-Compatible Adapter (`S3StorageAdapter`):** Implements `ObjectStoragePort` using AWS SDK v3 (`@aws-sdk/client-s3` and `@aws-sdk/s3-request-presigner`). Configured via endpoint URL, bucket, and S3 credentials to target Cloudflare R2, AWS S3, or self-hosted MinIO.
4. **Key Partitioning Pattern:** All object keys strictly enforce tenant isolation:
   `tenants/{tenantId}/{domainFolder}/{year}/{month}/{uuid}-{sanitizedFilename}`
   Direct path traversal attempts (`../`) and mismatched tenant IDs are rejected with `StorageTenantAccessDeniedError` before invoking storage drivers.

---

## 4. Consequences

### Positive

- **Zero Lock-In:** Cloudflare R2 uses the industry-standard S3 protocol. The application can switch to AWS S3, MinIO, or Google Cloud Storage (S3 API) by updating environment variables.
- **$0 Infrastructure Cost:** Cloudflare R2's free tier provides 10 GB storage and 11M operations per month with zero egress charges.
- **Offline CI Stability:** Tests run completely offline with mock/local adapters, preventing external network dependencies and flakiness.
- **Strict Privacy:** No public buckets. Pre-signed URLs expire in 15 minutes and are never persisted to the database as static URLs.

### Negative / Trade-offs

- Cloudflare R2 does not support bucket-level lifecycle policies directly via S3 API; lifecycle rules must be configured in the Cloudflare dashboard.
- Direct multipart uploads for files > 100 MB require chunked pre-signed parts (deferred until multi-gigabyte video or imaging workflows are introduced).

---

## 5. Environment Variables Contract

| Variable                                | Description                           | Default                 | Staging / Prod Target                           |
| :-------------------------------------- | :------------------------------------ | :---------------------- | :---------------------------------------------- |
| `STORAGE_PROVIDER`                      | Active storage adapter driver         | `local`                 | `s3`                                            |
| `STORAGE_LOCAL_ROOT`                    | Filesystem directory for local driver | `./.storage`            | N/A                                             |
| `STORAGE_S3_ENDPOINT`                   | S3-compatible service endpoint        | _(empty)_               | `https://<account_id>.r2.cloudflarestorage.com` |
| `STORAGE_S3_REGION`                     | Bucket region                         | `auto`                  | `auto` (R2) or `us-east-1` (AWS)                |
| `STORAGE_S3_BUCKET`                     | Target private bucket name            | `kinergy-staging-media` | Environment bucket name                         |
| `STORAGE_S3_ACCESS_KEY_ID`              | API Token Access Key                  | _(empty)_               | Secret credential                               |
| `STORAGE_S3_SECRET_ACCESS_KEY`          | API Token Secret Key                  | _(empty)_               | Secret credential                               |
| `STORAGE_MAX_FILE_SIZE_BYTES`           | Maximum single object size            | `10485760` (10 MB)      | `10485760`                                      |
| `STORAGE_SIGNED_URL_EXPIRATION_SECONDS` | Pre-signed URL TTL                    | `900` (15 min)          | `900`                                           |
| `STORAGE_TENANT_QUOTA_BYTES`            | Cost-control quota per tenant         | `5368709120` (5 GB)     | Tier-based quota                                |
