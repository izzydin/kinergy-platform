-- Milestone AI-05.2: Enable pgvector and Add Vector Persistence Tables

-- 1. Enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- 2. Create AI-05 Enums safely
DO $$ BEGIN
    CREATE TYPE "EmbeddingType" AS ENUM ('DENSE', 'SPARSE', 'HYBRID');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE "NormalizationPolicy" AS ENUM ('UNIT_L2', 'NONE');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE "PoolingStrategy" AS ENUM ('CLS', 'MEAN', 'LAST_TOKEN');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE "IndexGenerationStatus" AS ENUM ('DRAFT', 'BUILDING', 'VALIDATING', 'ACTIVE', 'RETIRED', 'FAILED', 'CANCELLED');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE "VectorIndexingScope" AS ENUM ('DOCUMENT', 'DOCUMENT_VERSION', 'INDEX_GENERATION', 'REINDEX_ALL');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE "VectorIndexingJobStatus" AS ENUM ('PENDING', 'RUNNING', 'COMPLETED', 'FAILED', 'CANCELLED');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- 3. Create embedding_profiles table
CREATE TABLE IF NOT EXISTS "embedding_profiles" (
    "id" TEXT NOT NULL,
    "profile_id" VARCHAR(128) NOT NULL,
    "provider" VARCHAR(64) NOT NULL,
    "model_name" VARCHAR(128) NOT NULL,
    "model_version" VARCHAR(64) NOT NULL,
    "model_digest" VARCHAR(128) NOT NULL,
    "dimensions" INTEGER NOT NULL,
    "tokenizer_identity" VARCHAR(128) NOT NULL,
    "normalization_policy" "NormalizationPolicy" NOT NULL DEFAULT 'UNIT_L2',
    "pooling_strategy" "PoolingStrategy" NOT NULL DEFAULT 'CLS',
    "embedding_type" "EmbeddingType" NOT NULL DEFAULT 'DENSE',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "embedding_profiles_pkey" PRIMARY KEY ("id")
);

-- 4. Create index_generations table
CREATE TABLE IF NOT EXISTS "index_generations" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "generation_number" INTEGER NOT NULL,
    "profile_id" VARCHAR(128) NOT NULL,
    "status" "IndexGenerationStatus" NOT NULL DEFAULT 'DRAFT',
    "target_chunk_count" INTEGER NOT NULL DEFAULT 0,
    "indexed_chunk_count" INTEGER NOT NULL DEFAULT 0,
    "failed_chunk_count" INTEGER NOT NULL DEFAULT 0,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "started_at" TIMESTAMP(3),
    "validated_at" TIMESTAMP(3),
    "activated_at" TIMESTAMP(3),
    "retired_at" TIMESTAMP(3),
    "failed_at" TIMESTAMP(3),
    "cancelled_at" TIMESTAMP(3),
    "error_code" VARCHAR(100),
    "failure_reason" TEXT,
    "cancellation_reason" TEXT,

    CONSTRAINT "index_generations_pkey" PRIMARY KEY ("id")
);

-- 5. Create document_embeddings table with vector(1024)
CREATE TABLE IF NOT EXISTS "document_embeddings" (
    "id" TEXT NOT NULL,
    "chunk_id" TEXT NOT NULL,
    "document_id" TEXT NOT NULL,
    "document_version_id" TEXT NOT NULL,
    "index_generation_id" TEXT NOT NULL,
    "profile_id" VARCHAR(128) NOT NULL,
    "dimensions" INTEGER NOT NULL,
    "embedding" vector(1024) NOT NULL,
    "content_fingerprint" VARCHAR(64) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "document_embeddings_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "chk_document_embeddings_dimensions" CHECK ("dimensions" = 1024)
);

-- 6. Create vector_indexing_jobs table
CREATE TABLE IF NOT EXISTS "vector_indexing_jobs" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "scope" "VectorIndexingScope" NOT NULL,
    "scope_id" TEXT NOT NULL,
    "generation_id" TEXT NOT NULL,
    "profile_id" VARCHAR(128) NOT NULL,
    "status" "VectorIndexingJobStatus" NOT NULL DEFAULT 'PENDING',
    "batch_size" INTEGER NOT NULL DEFAULT 16,
    "total_chunks" INTEGER NOT NULL DEFAULT 0,
    "processed_chunks" INTEGER NOT NULL DEFAULT 0,
    "failed_chunks" INTEGER NOT NULL DEFAULT 0,
    "current_batch_number" INTEGER NOT NULL DEFAULT 0,
    "attempt_count" INTEGER NOT NULL DEFAULT 0,
    "max_attempts" INTEGER NOT NULL DEFAULT 3,
    "last_error_code" VARCHAR(100),
    "last_error_message" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "started_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "failed_at" TIMESTAMP(3),
    "cancelled_at" TIMESTAMP(3),

    CONSTRAINT "vector_indexing_jobs_pkey" PRIMARY KEY ("id")
);

-- 7. Indexes & Unique Constraints

-- EmbeddingProfile
CREATE UNIQUE INDEX IF NOT EXISTS "embedding_profiles_profile_id_key" ON "embedding_profiles"("profile_id");
CREATE INDEX IF NOT EXISTS "embedding_profiles_provider_model_name_idx" ON "embedding_profiles"("provider", "model_name");
CREATE INDEX IF NOT EXISTS "embedding_profiles_model_digest_idx" ON "embedding_profiles"("model_digest");

-- IndexGeneration
CREATE UNIQUE INDEX IF NOT EXISTS "index_generations_tenant_id_generation_number_key" ON "index_generations"("tenant_id", "generation_number");
CREATE INDEX IF NOT EXISTS "index_generations_tenant_id_idx" ON "index_generations"("tenant_id");
CREATE INDEX IF NOT EXISTS "index_generations_status_idx" ON "index_generations"("status");
CREATE INDEX IF NOT EXISTS "index_generations_tenant_id_status_idx" ON "index_generations"("tenant_id", "status");

-- Single active index generation per tenant invariant
CREATE UNIQUE INDEX IF NOT EXISTS "unique_active_index_generation_per_tenant" ON "index_generations"("tenant_id") WHERE status = 'ACTIVE';

-- DocumentEmbedding
CREATE UNIQUE INDEX IF NOT EXISTS "document_embeddings_chunk_id_index_generation_id_key" ON "document_embeddings"("chunk_id", "index_generation_id");
CREATE INDEX IF NOT EXISTS "document_embeddings_document_id_idx" ON "document_embeddings"("document_id");
CREATE INDEX IF NOT EXISTS "document_embeddings_document_version_id_idx" ON "document_embeddings"("document_version_id");
CREATE INDEX IF NOT EXISTS "document_embeddings_index_generation_id_idx" ON "document_embeddings"("index_generation_id");
CREATE INDEX IF NOT EXISTS "document_embeddings_profile_id_idx" ON "document_embeddings"("profile_id");

-- HNSW Vector Index with Cosine Distance
CREATE INDEX IF NOT EXISTS "idx_document_embeddings_hnsw" ON "document_embeddings" USING hnsw ("embedding" vector_cosine_ops);

-- VectorIndexingJob
CREATE INDEX IF NOT EXISTS "vector_indexing_jobs_tenant_id_idx" ON "vector_indexing_jobs"("tenant_id");
CREATE INDEX IF NOT EXISTS "vector_indexing_jobs_status_idx" ON "vector_indexing_jobs"("status");
CREATE INDEX IF NOT EXISTS "vector_indexing_jobs_generation_id_idx" ON "vector_indexing_jobs"("generation_id");

-- 8. Foreign Key Constraints
ALTER TABLE "index_generations" ADD CONSTRAINT "index_generations_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "embedding_profiles"("profile_id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "document_embeddings" ADD CONSTRAINT "document_embeddings_chunk_id_fkey" FOREIGN KEY ("chunk_id") REFERENCES "knowledge_chunks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "document_embeddings" ADD CONSTRAINT "document_embeddings_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "knowledge_documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "document_embeddings" ADD CONSTRAINT "document_embeddings_document_version_id_fkey" FOREIGN KEY ("document_version_id") REFERENCES "document_versions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "document_embeddings" ADD CONSTRAINT "document_embeddings_index_generation_id_fkey" FOREIGN KEY ("index_generation_id") REFERENCES "index_generations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "document_embeddings" ADD CONSTRAINT "document_embeddings_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "embedding_profiles"("profile_id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "vector_indexing_jobs" ADD CONSTRAINT "vector_indexing_jobs_generation_id_fkey" FOREIGN KEY ("generation_id") REFERENCES "index_generations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
