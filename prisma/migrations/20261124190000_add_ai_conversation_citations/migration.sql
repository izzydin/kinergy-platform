-- ============================================================================
-- Migration: 20261124190000_add_ai_conversation_citations
-- Module: Kynergy Intelligence Source Citations (AI-09.4 - CIT.02)
-- ============================================================================

-- 1. Create Table: ai_conversation_citations
CREATE TABLE "ai_conversation_citations" (
    "id" TEXT NOT NULL,
    "message_id" TEXT NOT NULL,
    "turn_id" TEXT NOT NULL,
    "conversation_id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "document_id" TEXT NOT NULL,
    "document_version_id" TEXT,
    "chunk_id" TEXT,
    "citation_position" INTEGER NOT NULL,
    "document_title_snapshot" VARCHAR(255) NOT NULL,
    "excerpt" TEXT NOT NULL,
    "page_number" INTEGER,
    "heading_path" TEXT[] NOT NULL DEFAULT '{}',
    "retrieval_rank" INTEGER,
    "relevance_score" DOUBLE PRECISION,
    "source_strategy" VARCHAR(64),
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_conversation_citations_pkey" PRIMARY KEY ("id")
);

-- 2. Create Unique Constraints
CREATE UNIQUE INDEX "ai_conversation_citations_message_id_citation_position_key" 
    ON "ai_conversation_citations"("message_id", "citation_position");

CREATE UNIQUE INDEX "ai_conversation_citations_id_tenant_id_key" 
    ON "ai_conversation_citations"("id", "tenant_id");

-- 3. Create Performance Indexes
CREATE INDEX "idx_citation_message" 
    ON "ai_conversation_citations"("message_id");

CREATE INDEX "idx_citation_conversation" 
    ON "ai_conversation_citations"("conversation_id");

CREATE INDEX "idx_citation_tenant_document" 
    ON "ai_conversation_citations"("tenant_id", "document_id");

CREATE INDEX "idx_citation_chunk" 
    ON "ai_conversation_citations"("chunk_id");

-- 4. Create Foreign Key Constraints with Multi-Tenant Composite Cascading
ALTER TABLE "ai_conversation_citations"
    ADD CONSTRAINT "ai_conversation_citations_message_id_turn_id_conversation_fkey"
    FOREIGN KEY ("message_id", "turn_id", "conversation_id", "tenant_id")
    REFERENCES "ai_conversation_messages"("id", "turn_id", "conversation_id", "tenant_id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ai_conversation_citations"
    ADD CONSTRAINT "ai_conversation_citations_document_id_fkey"
    FOREIGN KEY ("document_id")
    REFERENCES "knowledge_documents"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ai_conversation_citations"
    ADD CONSTRAINT "ai_conversation_citations_document_version_id_fkey"
    FOREIGN KEY ("document_version_id")
    REFERENCES "document_versions"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ai_conversation_citations"
    ADD CONSTRAINT "ai_conversation_citations_chunk_id_fkey"
    FOREIGN KEY ("chunk_id")
    REFERENCES "knowledge_chunks"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

-- 5. Relational Check Constraints
ALTER TABLE "ai_conversation_citations"
    ADD CONSTRAINT "chk_citation_position_positive"
    CHECK ("citation_position" >= 1);

ALTER TABLE "ai_conversation_citations"
    ADD CONSTRAINT "chk_citation_relevance_score_range"
    CHECK ("relevance_score" IS NULL OR ("relevance_score" >= 0.0 AND "relevance_score" <= 1.0));

ALTER TABLE "ai_conversation_citations"
    ADD CONSTRAINT "chk_citation_page_number_positive"
    CHECK ("page_number" IS NULL OR "page_number" >= 1);

ALTER TABLE "ai_conversation_citations"
    ADD CONSTRAINT "chk_citation_excerpt_non_empty"
    CHECK (length(trim("excerpt")) > 0);
