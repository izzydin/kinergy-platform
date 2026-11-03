# External Object Storage & Cloudflare R2 Integration Guide

**Target Environment:** Staging & Production (with Free-First Cloudflare R2 Strategy)  
**Local Driver:** Offline Local Filesystem Adapter  
**Standard:** Hexagonal Architecture (`ObjectStoragePort`)

---

## 1. Storage Architecture Overview

Kynergy decouples business and application modules from cloud vendor SDKs through the `ObjectStoragePort` abstraction:

```
               [ Application Services (Kinesiology / Sales / Identity) ]
                                          │
                                          ▼
                                [ ObjectStoragePort ]
                                          │
                   ┌──────────────────────┴──────────────────────┐
                   ▼                                             ▼
         [ LocalStorageAdapter ]                       [ S3StorageAdapter ]
           - Offline dev & CI test suites                - Cloudflare R2 (Free Tier)
           - Root: ./.storage                            - AWS S3 / MinIO (Interchangeable)
           - No credentials required                     - Presigned HMAC URLs (15-min TTL)
```

---

## 2. Cloudflare R2 Free-Tier Economics & Limits

Cloudflare R2 provides an ongoing free allowance without expiring promotional credits:

| Dimension                                       | Free Allowance (Per Month) | Paid Rate Beyond Allowance    |
| :---------------------------------------------- | :------------------------- | :---------------------------- |
| **Storage Capacity**                            | **10 GB-month**            | \$0.015 / GB-month            |
| **Class A Operations** (Writes, Lists, Uploads) | **1,000,000 requests**     | \$4.50 / million              |
| **Class B Operations** (Reads, Downloads, Head) | **10,000,000 requests**    | \$0.36 / million              |
| **Egress Bandwidth (Data Transfer Out)**        | **100% FREE (UNLIMITED)**  | **\$0.00** (Zero egress fees) |

### Cost-Control Safeguards

To guarantee that the platform stays within the $0 allowance during MVP and staging:

1. **Application-Level File Ceilings:** Every file upload is rejected if it exceeds `10 MB` (`StorageFileTooLargeError`).
2. **Per-Tenant Storage Quota:** Storage usage is tracked per tenant with an enforced ceiling of `5 GB` (`STORAGE_TENANT_QUOTA_BYTES`), preventing any single tenant from exhausting the free 10 GB bucket tier.
3. **MIME Type Whitelist:** Executables, scripts, and media streams are blocked; only `application/pdf`, `image/jpeg`, `image/png`, and `image/webp` are permitted.

---

## 3. Step-by-Step Cloudflare R2 Setup Guide

### Step 1: Create a Cloudflare Account & Enable R2

1. Log in to the [Cloudflare Dashboard](https://dash.cloudflare.com/).
2. In the left navigation, select **R2 Storage**.
3. If not already active, enable R2 on your account (requires credit card for identity verification, but usage below free limits incurs **\$0.00** charges).

### Step 2: Create a Private Bucket

1. Click **Create Bucket**.
2. **Bucket Name:** Enter `kinergy-staging-media` (or `kinergy-prod-media`).
3. **Location:** Select **Automatic** (or specific region closest to your users).
4. **Public Access:** Leave **Disabled** (Default: Private). Objects must only be accessed via authenticated backend pre-signed URLs.
5. Click **Create Bucket**.

### Step 3: Generate R2 API Tokens

1. On the R2 Overview page, click **Manage R2 API Tokens** (top-right).
2. Click **Create API Token**.
3. **Token Name:** Enter `kinergy-api-staging-token`.
4. **Permissions:** Select **Object Read & Write**.
5. **Specify Bucket(s):** Choose **Apply to specific buckets only** and select `kinergy-staging-media`.
6. Click **Create API Token**.
7. Copy the following values immediately:
   - **Access Key ID**
   - **Secret Access Key**
   - **Endpoint URL:** `https://<account_id>.r2.cloudflarestorage.com`

---

## 4. Environment Configuration

### Local Development (`.env`)

```bash
STORAGE_PROVIDER=local
STORAGE_LOCAL_ROOT=./.storage
```

Local development and automated tests run completely offline without needing any cloud credentials.

### Staging & Production (`.env`)

```bash
STORAGE_PROVIDER=s3
STORAGE_S3_ENDPOINT=https://<your_account_id>.r2.cloudflarestorage.com
STORAGE_S3_REGION=auto
STORAGE_S3_BUCKET=kinergy-staging-media
STORAGE_S3_ACCESS_KEY_ID=<your_r2_access_key_id>
STORAGE_S3_SECRET_ACCESS_KEY=<your_r2_secret_access_key>
STORAGE_S3_FORCE_PATH_STYLE=false
STORAGE_MAX_FILE_SIZE_BYTES=10485760
STORAGE_SIGNED_URL_EXPIRATION_SECONDS=900
STORAGE_TENANT_QUOTA_BYTES=5368709120
```

---

## 5. Security & Multi-Tenant Partitioning

All object keys are strictly server-generated and partitioned by tenant:

```
tenants/{tenantId}/{domainFolder}/{year}/{month}/{uniqueUUID}-{sanitizedFilename}
```

- **Cross-Tenant Attack Defense:** Any attempt by Tenant B to read, delete, or generate a pre-signed URL for a Tenant A key throws an immediate `StorageTenantAccessDeniedError` before dispatching any request to R2 or S3.
- **Short-Lived Bearer URLs:** Pre-signed URLs expire after 15 minutes (900 seconds) and must never be stored permanently in the database.
- **Path Traversal Defense:** Sanitizer strips path traversal markers (`../`, `..\\`), control characters, and leading dots.
