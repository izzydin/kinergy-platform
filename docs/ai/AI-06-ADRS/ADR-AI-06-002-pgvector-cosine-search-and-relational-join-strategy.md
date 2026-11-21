# ADR-AI-06-002: pgvector Cosine Search & Relational Join Strategy

## Status

Accepted

## Context

In PostgreSQL with `pgvector`, vector similarity queries use distance operators (`<=>` for cosine distance, `<->` for L2 distance, `<#>` for inner product). For dense text representations from BGE-M3 (which are unit L2-normalized), cosine distance and Euclidean distance provide identical rank orderings, but cosine distance maps linearly to the cosine similarity metric:

$$\text{similarity} = 1 - \text{cosine\_distance}$$

Currently, `document_embeddings` contains raw vectors and foreign keys (`chunk_id`, `document_id`, `document_version_id`, `index_generation_id`), but does **not** duplicate chunk text, token counts, or document metadata.

Executing vector searches without joining relational tables forces the application to:

1. Retrieve raw embedding IDs from pgvector.
2. Issue a secondary query to `knowledge_chunks` to fetch text.
3. Issue a tertiary query to `knowledge_documents` to verify tenant ownership and visibility.

If authorization filtering is performed in application memory _after_ pgvector applies `LIMIT k`, the query suffers from **Filter Starvation**: top-ranked chunks may be rejected by post-filters, returning fewer than $k$ results (or zero results) even when valid matching documents exist in the database.

## Decision

1. Implement `PrismaSemanticRetrievalRepository` executing a single raw SQL query with explicit relational JOINs:
   ```sql
   SELECT
       de.id AS embedding_id,
       de.chunk_id,
       de.document_id,
       de.document_version_id,
       de.index_generation_id,
       1 - (de.embedding <=> $1::vector) AS similarity,
       (de.embedding <=> $1::vector) AS distance,
       kc.content,
       kc.token_count,
       kc.sequence AS chunk_sequence,
       kc.provenance AS chunk_provenance,
       kc.metadata AS chunk_metadata,
       kd.title AS document_title,
       kd.visibility_scope,
       dv.version_number,
       dv.original_file_name,
       dv.mime_type,
       dv.language
   FROM document_embeddings de
   JOIN index_generations ig ON ig.id = de.index_generation_id
   JOIN knowledge_documents kd ON kd.id = de.document_id
   JOIN document_versions dv ON dv.id = de.document_version_id
   JOIN knowledge_chunks kc ON kc.id = de.chunk_id
   WHERE ig.tenant_id = $2
     AND kd.tenant_id = $2
     AND kd.deleted_at IS NULL
     AND de.index_generation_id = $3
     AND kd.visibility_scope = ANY($4::"VisibilityScope"[])
   ```
2. Parameterize all inputs (`$1::vector`, `$2` for `tenantId`, `$3` for `generationId`, `$4` for allowed scopes array).
3. Enforce relevance thresholding directly in SQL when `minSimilarity > 0.0`:
   ```sql
   AND (1 - (de.embedding <=> $1::vector)) >= $minSimilarity
   ```
4. Order strictly by cosine distance ascending (`ORDER BY de.embedding <=> $1::vector ASC`) and enforce `LIMIT $topK`.

## Consequences

### Positive

- **Zero Filter Starvation:** Authorization, tenant scoping, soft-deletion checks, and similarity thresholds are evaluated inside PostgreSQL _before_ `LIMIT $topK` is applied.
- **Maximum Performance:** Single-trip index scan leveraging the `idx_document_embeddings_hnsw` HNSW index with `vector_cosine_ops`.
- **Zero SQL Injection Risk:** All vectors, IDs, and filters use strictly parameterized placeholders.

### Negative / Trade-offs

- Relational JOINs across 5 tables increase SQL query complexity compared to raw vector scans. However, all join keys are indexed primary keys or indexed foreign keys.
