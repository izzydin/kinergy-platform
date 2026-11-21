# ADR-AI-06-001: Semantic Retrieval Architecture & Pure Domain Ports

## Status

Accepted

## Context

In Milestone AI-05, vector embeddings were generated for document chunks and persisted in PostgreSQL using the pgvector extension (`document_embeddings` table). Milestone AI-06 introduces semantic retrieval across this knowledge base.

Under Clean and Hexagonal Architecture principles:

1. Domain and application logic must remain completely independent of persistence mechanisms (Prisma, PostgreSQL, pgvector), inference runtimes (Ollama), and framework libraries (NestJS).
2. Existing vector persistence (`IVectorStorePort`) is focused on low-level vector persistence and lifecycle management (save, delete, raw similarity search returning IDs).
3. Retrieval for end-users, clinic staff, and therapists requires rich, hydrated results—including chunk text, token counts, document titles, version numbers, mime types, and structured provenance citations—rather than raw vector IDs.
4. Calling `IVectorStorePort.similaritySearch` and subsequently querying `IKnowledgeChunkRepositoryPort` and `IKnowledgeDocumentRepositoryPort` in multiple roundtrips introduces severe N+1 latency and memory overhead.

## Decision

1. Establish a dedicated Outbound Port `ISemanticRetrievalPort` in `packages/core/src/ai/ports/outbound/semantic-retrieval.port.ts`:
   - Pure domain contract defining `search(queryVector: number[], query: RetrievalQuery): Promise<RetrievedChunk[]>`.
   - Returns fully hydrated `RetrievedChunk` domain models in a single optimized relational query at the infrastructure boundary.
2. Establish a dedicated Inbound Port `ISemanticSearchUseCase` in `packages/core/src/ai/ports/inbound/semantic-search.use-case.ts`:
   - Enforces an authenticated, server-resolved `RetrievalAuthContext` (`tenantId`, `userId`, `roles`, `allowedVisibilityScopes`).
   - Accepts a strongly-typed `SemanticSearchCommand` and returns a domain `RetrievalResult`.
3. Encapsulate all search inputs inside the `RetrievalQuery` Value Object:
   - Validates character bounds (1 to 1,000 characters), whitespace rejection, top-K boundaries ($1 \le k \le 50$), and Unicode NFKC normalization.
4. Define explicit domain exceptions (`EmptyRetrievalQueryException`, `InvalidRetrievalQueryException`, `InvalidSimilarityScoreException`, `ActiveIndexGenerationNotFoundException`, `RetrievalProfileMismatchException`, `RetrievalDatabaseException`).

## Consequences

### Positive

- **Decoupling:** Application and domain layers remain 100% agnostic to SQL, pgvector operators, and database drivers.
- **Single Roundtrip:** The infrastructure adapter performs a single relational JOIN between embeddings, chunks, and documents, eliminating N+1 retrieval queries.
- **Rich Domain Model:** Handlers and UI clients consume fully contextualized chunks with verified citations and similarity metrics.

### Negative / Trade-offs

- Requires maintaining both `IVectorStorePort` (for vector maintenance/indexing) and `ISemanticRetrievalPort` (for query-time semantic search and retrieval).
