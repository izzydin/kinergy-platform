# ADR-AI-07-001: PostgreSQL Full-Text Search Engine for Knowledge Retrieval

## Status

Accepted

## Context

Milestone AI-06 delivered a semantic vector retrieval engine using 1024-dimensional BGE-M3 dense embeddings and pgvector HNSW indexing. While dense vector retrieval achieves superior recall on conceptual synonyms and cross-lingual queries, baseline evaluation (AI-06.7 and AI-07.0) established that:

1. Dense retrieval is computationally intensive (~28.5 ms mean latency) compared to database lexical indexing (~1.2 ms).
2. Dense vectors can experience dilution or false positives on exact alphanumeric codes, acronyms, or specific entity names (e.g. "Plan Black", "Formulario F-09", medication identifiers).
3. Hybrid search (combining dense semantic retrieval with sparse lexical retrieval) requires a native, multi-tenant, PostgreSQL-level lexical search strategy.

Prior to AI-07.1, `knowledge_chunks` lacked a full-text search index or `tsvector` representation.

## Decision

1. **Stored Generated `tsvector` Column:**
   - Add a stored generated column `tsv tsvector` to `knowledge_chunks` combining section heading (weight `'B'`) and chunk content (weight `'C'`).
   - Dynamic Language Configuration: Use a PostgreSQL `CASE` expression conditioned on `knowledge_chunks.language`:
     `CASE WHEN "language" = 'en' THEN 'english'::regconfig ELSE 'spanish'::regconfig END`.
   - Maintain GIN Index `idx_knowledge_chunks_tsv` on `knowledge_chunks("tsv")`.
   - Maintain GIN Index `idx_knowledge_documents_title_tsv` on `knowledge_documents` using `to_tsvector('spanish', "title")` for high-priority title matching (weight `'A'`).
2. **Domain Port Abstraction:**
   - Define `ILexicalRetrievalPort` and `LEXICAL_RETRIEVAL_PORT` in `@kinergy-platform/core`, decoupled from PostgreSQL or Prisma.
   - Reuse existing `RetrievalQuery`, `RetrievalCriteria`, and `RetrievedChunk` domain value objects and entities.
   - Extend `RetrievalSearchMode` enum with `KEYWORD = 'KEYWORD'`.
3. **Persistence Adapter (`PrismaLexicalRetrievalRepository`):**
   - Execute safe, parameterized SQL with `websearch_to_tsquery(...)` and `ts_rank(...)`.
   - Enforce mandatory tenant isolation (`kc.tenant_id = $2 AND kd.tenant_id = $2`) and document visibility filtering before ranking and `LIMIT`.
   - Enforce soft-delete exclusion (`kd.deleted_at IS NULL`).
   - Order results by `rank DESC, kc.id ASC` for deterministic tie-breaking.
   - Bounded `LIMIT topK` in $[1, 50]$.

## Consequences

- **Positive:**
  - Ultra-fast lexical retrieval (~1.2 ms p50 latency over 20,300+ indexed chunks).
  - Native multi-lingual stemming for both Spanish and English documents.
  - Zero trigger maintenance overhead; PostgreSQL automatically updates `tsv` on insert/update.
  - Full protection against SQL injection and syntax errors via `websearch_to_tsquery` parameterization.
  - Strict preservation of tenant isolation, document visibility scopes, and lifecycle rules.
- **Negative / Trade-offs:**
  - Additional storage footprint for the `tsv` column and GIN index (~12 MB for 20,300 chunks).
  - Stemming asymmetries in Spanish Snowball stemmer (e.g. `musculares` vs. `muscular`) require awareness in query formulation.
