# AI-05: PostgreSQL pgvector Migration Guide

## 1. Executive Summary

This guide documents the database migration and infrastructure provisioning for PostgreSQL `pgvector` in the Kynergy Platform (`@kynergy/platform`), completed as part of Milestone **AI-05.2**.

### Key Facts

- **PostgreSQL Version**: 16.16 (Debian Bookworm)
- **Image**: `pgvector/pgvector:pg16` (`sha256:484e838076e047bb...`)
- **pgvector Extension Version**: `0.8.7`
- **Prisma Version**: `6.19.3`
- **Migration Name**: `20261120000000_enable_pgvector_and_vector_persistence`
- **Migration Strategy**: Additive SQL with zero destructive modifications to existing tables.

---

## 2. Extension Enablement Strategy

The `vector` extension is enabled via the additive Prisma migration:

```sql
CREATE EXTENSION IF NOT EXISTS vector;
```

### Preconditions Verified:

1. **Binary Availability**: The container image includes `vector.control` and `vector.so` compiled for PostgreSQL 16 on x86_64 / aarch64.
2. **Role Permissions**: The database user `kinergy_user` holds `SUPERUSER` / `CREATEROLE` privileges in development/staging environments, allowing extension registration without privilege escalation errors.
3. **Multi-Environment Alignment**:
   - `docker-compose.yml` (Development)
   - `docker-compose.demo.yml` (Demo)
   - `docker-compose.staging.yml` (Staging)
   - `docker-compose.production.yml` (Production)
   - `.github/workflows/ci.yml` (Continuous Integration)
     All pin `pgvector/pgvector:pg16` ensuring environment parity.

---

## 3. Migration Anatomy & Table Definitions

The migration creates 4 new tables, 6 enums, and comprehensive relational integrity constraints:

### A. Enums

- `EmbeddingType` (`DENSE`, `SPARSE`, `HYBRID`)
- `NormalizationPolicy` (`UNIT_L2`, `NONE`)
- `PoolingStrategy` (`CLS`, `MEAN`, `LAST_TOKEN`)
- `IndexGenerationStatus` (`DRAFT`, `BUILDING`, `VALIDATING`, `ACTIVE`, `RETIRED`, `FAILED`, `CANCELLED`)
- `VectorIndexingScope` (`DOCUMENT`, `DOCUMENT_VERSION`, `INDEX_GENERATION`, `REINDEX_ALL`)
- `VectorIndexingJobStatus` (`PENDING`, `RUNNING`, `COMPLETED`, `FAILED`, `CANCELLED`)

### B. Tables & Relationships

1. **`embedding_profiles`**:
   - Stores immutable model identities and cryptographic fingerprints (`profile_id`).
   - Unique on `profile_id`.
2. **`index_generations`**:
   - Versioned container for tenant vector indexes.
   - Enforces unique generation numbers per tenant: `UNIQUE (tenant_id, generation_number)`.
   - **Partial Unique Index Guard**:
     ```sql
     CREATE UNIQUE INDEX unique_active_index_generation_per_tenant
     ON index_generations (tenant_id)
     WHERE status = 'ACTIVE';
     ```
     Guarantees that at most one index generation is active per tenant at any point in time.
3. **`document_embeddings`**:
   - Dedicated table housing dense vectors: `embedding vector(1024) NOT NULL`.
   - Check constraint: `CHECK (dimensions = 1024)`.
   - Unique per chunk and generation: `UNIQUE (chunk_id, index_generation_id)`.
   - HNSW index:
     ```sql
     CREATE INDEX idx_document_embeddings_hnsw
     ON document_embeddings USING hnsw (embedding vector_cosine_ops);
     ```
   - Cascading foreign keys to `knowledge_chunks`, `knowledge_documents`, `document_versions`, and `index_generations`.
4. **`vector_indexing_jobs`**:
   - Coordinates bounded background batch indexing and durable progress tracking.

---

## 4. Rollback & Disaster Recovery Procedures

### Non-Destructive Rollback (Application-Level)

If a newly promoted index generation shows anomalous behavior:

1. Re-run `promoteGeneration(previousGenerationId, tenantId)` to switch active status back to the previous generation.
2. The partial unique index handles the atomic switchover in a single transaction with zero data loss and zero downtime.

### Schema Rollback (Emergency DDL)

To revert migration `20261120000000_enable_pgvector_and_vector_persistence`:

```sql
DROP TABLE IF EXISTS "vector_indexing_jobs" CASCADE;
DROP TABLE IF EXISTS "document_embeddings" CASCADE;
DROP TABLE IF EXISTS "index_generations" CASCADE;
DROP TABLE IF EXISTS "embedding_profiles" CASCADE;

DROP TYPE IF EXISTS "VectorIndexingJobStatus";
DROP TYPE IF EXISTS "VectorIndexingScope";
DROP TYPE IF EXISTS "IndexGenerationStatus";
DROP TYPE IF EXISTS "PoolingStrategy";
DROP TYPE IF EXISTS "NormalizationPolicy";
DROP TYPE IF EXISTS "EmbeddingType";

-- Note: The vector extension is NOT dropped in production to prevent affecting other services.
DELETE FROM "_prisma_migrations" WHERE migration_name = '20261120000000_enable_pgvector_and_vector_persistence';
```
