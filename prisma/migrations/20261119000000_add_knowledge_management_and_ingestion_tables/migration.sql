-- CreateEnum
CREATE TYPE "VisibilityScope" AS ENUM ('ALL_STAFF', 'CLINICAL_STAFF', 'MANAGEMENT');

-- CreateEnum
CREATE TYPE "IngestionStatus" AS ENUM ('UPLOADED', 'VALIDATING', 'PROCESSING', 'INDEXING', 'READY', 'FAILED', 'CANCELLED');

-- CreateTable
CREATE TABLE "knowledge_documents" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "title" VARCHAR(255) NOT NULL,
    "description" TEXT,
    "uploaded_by" TEXT NOT NULL,
    "visibility_scope" "VisibilityScope" NOT NULL DEFAULT 'ALL_STAFF',
    "current_version_id" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "knowledge_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "document_versions" (
    "id" TEXT NOT NULL,
    "document_id" TEXT NOT NULL,
    "version_number" INTEGER NOT NULL,
    "original_file_name" VARCHAR(255) NOT NULL,
    "mime_type" VARCHAR(100) NOT NULL,
    "file_size" INTEGER NOT NULL,
    "checksum" VARCHAR(64) NOT NULL,
    "storage_key" VARCHAR(512) NOT NULL,
    "language" VARCHAR(10) NOT NULL DEFAULT 'es',
    "uploaded_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "document_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ingestion_jobs" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "document_id" TEXT NOT NULL,
    "document_version_id" TEXT NOT NULL,
    "status" "IngestionStatus" NOT NULL DEFAULT 'UPLOADED',
    "attempt_count" INTEGER NOT NULL DEFAULT 1,
    "max_attempts" INTEGER NOT NULL DEFAULT 3,
    "last_error_code" VARCHAR(100),
    "last_error_message" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "started_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "next_retry_at" TIMESTAMP(3),
    "cancelled_at" TIMESTAMP(3),
    "cancellation_reason" TEXT,

    CONSTRAINT "ingestion_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "knowledge_documents_tenant_id_idx" ON "knowledge_documents"("tenant_id");

-- CreateIndex
CREATE INDEX "knowledge_documents_tenant_id_visibility_scope_idx" ON "knowledge_documents"("tenant_id", "visibility_scope");

-- CreateIndex
CREATE INDEX "knowledge_documents_tenant_id_deleted_at_idx" ON "knowledge_documents"("tenant_id", "deleted_at");

-- CreateIndex
CREATE INDEX "knowledge_documents_created_at_idx" ON "knowledge_documents"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "document_versions_document_id_version_number_key" ON "document_versions"("document_id", "version_number");

-- CreateIndex
CREATE UNIQUE INDEX "document_versions_document_id_checksum_key" ON "document_versions"("document_id", "checksum");

-- CreateIndex
CREATE INDEX "document_versions_document_id_idx" ON "document_versions"("document_id");

-- CreateIndex
CREATE INDEX "document_versions_checksum_idx" ON "document_versions"("checksum");

-- CreateIndex
CREATE INDEX "document_versions_created_at_idx" ON "document_versions"("created_at");

-- CreateIndex
CREATE INDEX "ingestion_jobs_tenant_id_idx" ON "ingestion_jobs"("tenant_id");

-- CreateIndex
CREATE INDEX "ingestion_jobs_document_id_idx" ON "ingestion_jobs"("document_id");

-- CreateIndex
CREATE INDEX "ingestion_jobs_document_version_id_idx" ON "ingestion_jobs"("document_version_id");

-- CreateIndex
CREATE INDEX "ingestion_jobs_status_idx" ON "ingestion_jobs"("status");

-- CreateIndex
CREATE INDEX "ingestion_jobs_tenant_id_status_idx" ON "ingestion_jobs"("tenant_id", "status");

-- CreateIndex
CREATE INDEX "ingestion_jobs_next_retry_at_idx" ON "ingestion_jobs"("next_retry_at");

-- CreateIndex
CREATE INDEX "ingestion_jobs_created_at_idx" ON "ingestion_jobs"("created_at");

-- Partial Unique Index for Active Ingestion Jobs (prevents duplicate active ingestion per document version)
CREATE UNIQUE INDEX "unique_active_ingestion_per_version" ON "ingestion_jobs"("document_version_id") WHERE "status" IN ('UPLOADED', 'VALIDATING', 'PROCESSING', 'INDEXING');

-- AddForeignKey
ALTER TABLE "document_versions" ADD CONSTRAINT "document_versions_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "knowledge_documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ingestion_jobs" ADD CONSTRAINT "ingestion_jobs_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "knowledge_documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ingestion_jobs" ADD CONSTRAINT "ingestion_jobs_document_version_id_fkey" FOREIGN KEY ("document_version_id") REFERENCES "document_versions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
