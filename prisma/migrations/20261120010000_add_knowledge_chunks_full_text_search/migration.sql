-- Milestone AI-07.1: Add PostgreSQL Full-Text Search to Knowledge Chunks

-- 1. Add generated tsvector column to knowledge_chunks with multi-lingual support
-- Weighted: B = section title (from metadata->>'section'), C = chunk content
ALTER TABLE "knowledge_chunks"
ADD COLUMN IF NOT EXISTS "tsv" tsvector
GENERATED ALWAYS AS (
    setweight(
        to_tsvector(
            CASE WHEN "language" = 'en' THEN 'english'::regconfig ELSE 'spanish'::regconfig END,
            coalesce("metadata"->>'section', '')
        ),
        'B'
    ) ||
    setweight(
        to_tsvector(
            CASE WHEN "language" = 'en' THEN 'english'::regconfig ELSE 'spanish'::regconfig END,
            "content"
        ),
        'C'
    )
) STORED;

-- 2. Create GIN index on knowledge_chunks.tsv for fast candidate filtering
CREATE INDEX IF NOT EXISTS "idx_knowledge_chunks_tsv" ON "knowledge_chunks" USING gin ("tsv");

-- 3. Create GIN index on knowledge_documents.title for fast title matching
CREATE INDEX IF NOT EXISTS "idx_knowledge_documents_title_tsv" ON "knowledge_documents" USING gin (
    to_tsvector('spanish', "title")
);
