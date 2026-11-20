# ADR-AI-05-003: Hexagonal Vector Store Abstraction & Dedicated Embedding Table

## Status

Accepted

## Context

Prisma ORM does not natively support the PostgreSQL `vector` data type. Adding `vector` directly to the `knowledge_chunks` table requires either `Unsupported("vector(1024)")` or raw SQL migrations, which:

1. Couples chunk text metadata to vector search infrastructure.
2. Violates Clean Architecture by leaking database specifics into the domain chunk model.
3. Locks the primary `knowledge_chunks` table during index re-builds or model migrations.
4. Makes it impossible to maintain multiple vector embeddings (e.g. for different models or generations) for the same chunk.

## Decision

1. Define pure domain Outbound Ports in `@kynergy/core`:
   - `IVectorStorePort`: Boundary for vector persistence, batch ingestion, similarity search, and generational cleanup.
   - `IIndexGenerationRepositoryPort`: Boundary for generation aggregate persistence, lookup, and atomic promotion.
2. Prohibit any `@prisma/client`, `pgvector`, or SQL keywords in `@kynergy/core` domain models and ports.
3. In persistence (Milestone AI-05.2), create a dedicated `document_embeddings` table:
   - Foreign keys to `chunk_id`, `document_id`, `document_version_id`, `index_generation_id`.
   - Native `vector(1024)` column managed via raw SQL migration and Prisma adapter.
   - Separate HNSW / IVFFlat vector index on the dedicated embedding table.
4. Maintain `knowledge_chunks` as the immutable source of truth for text content, token counts, and structural provenance.

## Consequences

### Positive

- Pure Hexagonal Architecture: The domain is decoupled from PostgreSQL and pgvector.
- Multi-generation support: One chunk can have embeddings in Generation 1 (e.g., BGE-M3) and Generation 2 (e.g., future model) concurrently during migration.
- Independent table performance: High-frequency vector similarity scans do not lock or bloat `knowledge_chunks`.

### Negative / Trade-offs

- Requires joins between `document_embeddings` and `knowledge_chunks` when returning full chunk content with search results.
