# AI-04 — Operations, Deployment & Runbook Manual

**Milestone:** AI-04 (AI-04.0 through AI-04.7)  
**Bounded Context:** AI / Document Extraction, Normalization & Chunking  
**Target Audience:** DevOps Engineers, Site Reliability Engineers, Platform Administrators  
**Date:** November 19, 2026  
**Status:** **OPERATIONAL**

---

## 1. System Dependencies & Architectural Scope

The AI-04 subsystem operationalizes document processing in Kynergy Platform. It takes uploaded binary documents, validates and extracts structured semantic blocks, normalizes Unicode and layout, detects document languages, and partitions the content into token-bounded, structure-preserving chunks with complete provenance tracking.

### Runtime Prerequisites

1. **Database:** PostgreSQL 16+ with extensions `uuid-ossp` and `pg_trgm`.  
   _(Note: `pgvector` is **not** required for AI-04; vector persistence is strictly isolated to AI-05)._
2. **Object Storage:** S3-compatible storage service (Cloudflare R2, MinIO, or AWS S3) or local development storage.
3. **Application Runtime:** Node.js 20+ LTS, NestJS 10.
4. **Network Access:** TCP port 5432/5433 (PostgreSQL), HTTPS/443 (Object storage).

---

## 2. Environment Configuration Reference

The following environment variables govern extraction, normalization, and chunking parameters:

| Variable                     |  Type   |      Default       | Description                                |
| :--------------------------- | :-----: | :----------------: | :----------------------------------------- |
| `AI_ENABLED`                 | Boolean |      `false`       | Master feature flag for AI subsystem.      |
| `AI_MAX_DOCUMENT_SIZE_BYTES` | Number  | `10485760` (10 MB) | Maximum permitted file upload size.        |
| `AI_CHUNK_TARGET_TOKENS`     | Number  |       `450`        | Nominal target token count per chunk.      |
| `AI_CHUNK_MIN_TOKENS`        | Number  |       `400`        | Minimum token count before chunk closure.  |
| `AI_CHUNK_MAX_TOKENS`        | Number  |       `500`        | Strict upper token ceiling per chunk.      |
| `AI_CHUNK_OVERLAP_TOKENS`    | Number  |        `60`        | Token overlap carried over between chunks. |
| `AI_EXTRACTION_TIMEOUT_MS`   | Number  |   `30000` (30s)    | Hard timeout per document extraction task. |
| `AI_EXTRACTION_MAX_PAGES`    | Number  |       `500`        | Maximum allowable pages in a single PDF.   |
| `AI_TOKENIZER_MODEL`         | String  |   `cl100k_base`    | BPE tokenizer model identity.              |
| `STORAGE_PROVIDER`           | String  |      `local`       | Storage driver (`local` or `s3`).          |
| `STORAGE_S3_BUCKET`          | String  |  `kinergy-media`   | Target bucket name.                        |

---

## 3. Database Migration Runbook

The schema additions for AI-04 introduce the `knowledge_chunks` table and are strictly additive:
`prisma/migrations/20261119010000_add_knowledge_chunks_table`

### Applying Migrations in Staging & Production

```bash
# 1. Verify pending status against target database
pnpm exec prisma migrate status

# 2. Deploy additive migration safely (Zero Downtime)
pnpm exec prisma migrate deploy
```

> [!IMPORTANT]
> The `knowledge_chunks` table includes foreign key constraints to `knowledge_documents` and `document_versions` with `ON DELETE CASCADE`. Indexes are configured on `(tenant_id, document_version_id, sequence)` and `(checksum)` to guarantee sub-millisecond retrieval. Never execute `prisma migrate reset` in production.

---

## 4. Background Ingestion Worker & Recovery Operations

Document ingestion and chunking are orchestrated asynchronously by the `IngestionRecoveryWorker` and `IngestionOrchestratorService`.

### Worker Behavior & Lifecycle

- **Polling Interval:** 15 seconds (`pollIntervalMs: 15_000`).
- **Stale Active Threshold:** 5 minutes (`staleThresholdMs: 300_000`).
- **Batch Processing Size:** 10 jobs per iteration.
- **Concurrency Control:** Atomic row-level locking via PostgreSQL `SELECT ... FOR UPDATE SKIP LOCKED` inside Prisma transactions ensures multiple API replicas can run concurrently without race conditions.

### Ingestion Progression States

```
UPLOADED -> VALIDATING -> PROCESSING -> INDEXING -> READY
    |            |             |            |
    +------------+-------------+------------+-----> FAILED (With Error Code)
```

---

## 5. Incident Runbooks & Troubleshooting

### Incident A: Scanned or Image-Only Document Upload

- **Error Code:** `OCR_REQUIRED`
- **Symptom:** Document ingestion fails with message: `"PDF contains no extractable text. OCR is required."`
- **Root Cause:** User uploaded a scanned PDF consisting purely of bitmap images without an embedded text layer.
- **Resolution:**
  1. Inform the user that the uploaded PDF is image-based.
  2. Advise the user to process the PDF through an OCR scanner or upload the source text/Word document.
  3. _(Future enhancement: AI-05+ will introduce automated asynchronous OCR pipelines)._

### Incident B: Extraction Timeout on Pathological File

- **Error Code:** `EXTRACTION_TIMEOUT`
- **Symptom:** Ingestion job transitions to `FAILED` with `"Extraction timed out after 30000ms"`.
- **Root Cause:** A deeply nested or malformed document triggered excessive parsing time.
- **Resolution:**
  1. Inspect the document size, page count, and structure.
  2. If the document is legitimately large (e.g. 400 pages), temporarily adjust `AI_EXTRACTION_TIMEOUT_MS=60000`.
  3. Re-trigger ingestion via REST endpoint:
     ```http
     POST /api/v1/ai/knowledge/documents/:documentId/ingestion/retry
     ```

### Incident C: Password-Protected or Corrupt Document

- **Error Code:** `DOCUMENT_ENCRYPTED` or `CORRUPT_DOCUMENT`
- **Symptom:** Ingestion immediately halts with `UNPROCESSABLE_ENTITY`.
- **Resolution:**
  1. The system intentionally refuses encrypted files to prevent credential harvesting or bypass of safety filters.
  2. Request an unencrypted, valid file copy from the document owner.

### Incident D: Storage or Database Transient Outage During Chunking

- **Error Code:** `STORAGE_TIMEOUT` / `PROCESSING_TIMEOUT`
- **Symptom:** Ingestion job fails with transient classification.
- **Resolution:**
  1. The `IngestionRetryPolicy` automatically schedules retries using exponential backoff with jitter:
     $$T_{\text{delay}} = \text{base} \times 2^{\text{attempt}-1} \times (1 + \text{jitter})$$
  2. The `IngestionRecoveryWorker` picks up the job when `nextRetryAt` elapsed and resumes processing from the immutable raw source buffer.

---

## 6. Disaster Recovery & Safe Reprocessing Procedures

### Reprocessing a Document Version

Because document versions and their raw storage files are immutable, reprocessing is deterministic and idempotent:

```bash
# Reprocess an existing document version via API
curl -X POST https://api.kinergy.com/api/v1/ai/knowledge/documents/{documentId}/ingestion/retry \
  -H "Authorization: Bearer <ADMIN_JWT>" \
  -H "Content-Type: application/json"
```

1. Existing `KnowledgeChunk` rows for that `documentVersionId` are atomically deleted.
2. The orchestrator re-executes parsing, normalization, and chunking against the raw buffer.
3. The newly generated chunks and updated processing fingerprint are persisted atomically.
4. The document version transitions back to `READY`.

---

## 7. Monitoring & Operational Health Checks

### AI Subsystem Health Endpoint

- **URL:** `GET /api/ai/health`
- **Response Format:**
  ```json
  {
    "status": "healthy",
    "timestamp": "2026-11-19T19:42:00.000Z",
    "services": {
      "storage": { "status": "up" },
      "database": { "status": "up" },
      "pipeline": {
        "status": "up",
        "tokenizer": "cl100k_base",
        "supportedFormats": ["pdf", "docx", "md", "txt"]
      }
    }
  }
  ```

### Key Metrics to Monitor

1. `ai_document_ingestion_duration_seconds` (Histogram by format: PDF, DOCX, MD, TXT).
2. `ai_document_chunk_count_total` (Counter of chunks created).
3. `ai_document_ingestion_failures_total` (Counter segmented by `error_code`).
4. `ai_stale_jobs_recovered_total` (Counter of watchdog interventions).

---

## 8. Operational Boundaries for AI-05 (Embedding & Search)

> [!WARNING]
> Milestone AI-04 strictly delivers text chunks and structural provenance.
>
> - **DO NOT** execute `CREATE EXTENSION vector` in PostgreSQL.
> - **DO NOT** add embedding columns to `knowledge_chunks`.
> - All vector embedding generation, embedding model selection, vector indexing (HNSW/IVFFlat), and hybrid retrieval are scheduled exclusively for **Milestone AI-05**.
