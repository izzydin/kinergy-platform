# ADR-AI-003: PostgreSQL and pgvector Persistence Strategy

## 1. ADR Identifier

ADR-AI-003

## 2. Title

Adoption of PostgreSQL 16 with pgvector Extension for Unified Relational and Vector Persistence

## 3. Status

Proposed

## 4. Date

2026-11-19

## 5. Context

Kinergy uses PostgreSQL 16 as its authoritative ACID relational datastore, managed via Prisma ORM 6.3.1. Vector search requires storing dense mathematical embeddings (1,024 dimensions) and executing approximate nearest neighbor (ANN) similarity distance calculations. The **AI-00 Readiness Audit** empirically established that the current Docker and production base image (`postgres:16-alpine`) **completely lacks the compiled `vector.so` binary**, and zero vector migrations or schema definitions currently exist.

## 6. Problem Statement

How should high-dimensional vector embeddings and document metadata be persisted and indexed without introducing an unmanageable external vector database cluster, violating dual-role database security, or coupling the core domain to raw SQL operators?

## 7. Decision Drivers

- **Operational Simplicity**: Avoid the cost, operational overhead, and distributed split-brain failure modes of standalone vector databases (e.g. Pinecone, Milvus, Qdrant).
- **Relational Atomic Joins**: Execute vector distance queries and multi-tenant permission filters (`tenant_id`, `visibility_scope`) within a single transactional query execution plan.
- **Single Source of Truth**: Retain all organizational backups, point-in-time recovery (PITR), and disaster recovery inside the unified PostgreSQL cluster.
- **Least-Privilege Security**: Adhere to Kinergy's separation between `kinergy_migrator` (DDL/extensions) and `kinergy_app` (DML only).
- **Framework Independence**: Insulate domain models from Prisma limitations regarding unsupported vector types.

## 8. Decision

We propose **PostgreSQL 16 with the `pgvector` extension** as the primary vector persistence engine, implementing **HNSW (Hierarchical Navigable Small World)** indexing and a hybrid Prisma/Raw SQL repository pattern:

1. **Container Image Upgrade (Target Requirement)**: The PostgreSQL service in `docker-compose.yml` and staging environments will be migrated from `postgres:16-alpine` to `pgvector/pgvector:pg16`.
2. **Explicit Baseline vs. Target Distinction**: The `vector` extension is **currently absent**. It must be provisioned via an explicit SQL migration executed by the administrative identity `kinergy_migrator`:
   ```sql
   CREATE EXTENSION IF NOT EXISTS vector;
   ```
   The runtime application identity `kinergy_app` remains strictly DML-only.
3. **Relational Schema**: Relational metadata (`knowledge_documents`) and vector chunks (`knowledge_chunks`) are maintained as relational tables with foreign keys and cascade deletion.
4. **HNSW Indexing Strategy**: We select HNSW over IVFFlat because HNSW builds incrementally as documents are uploaded (requiring no pre-clustering training phase) and delivers superior recall (>98%) at sub-15ms latency:
   ```sql
   CREATE INDEX idx_knowledge_chunks_embedding_hnsw
   ON knowledge_chunks USING hnsw (embedding vector_cosine_ops)
   WITH (m = 16, ef_construction = 64);
   ```
5. **Hybrid Persistence Port Adapter**: Prisma ORM lacks native schema syntax for vector distance operators (`<=>`). The domain interacts strictly with `IVectorSearchPort`. The concrete adapter (`PgVectorKnowledgeStoreAdapter`) executes parameterized raw SQL queries (`prisma.$queryRaw`) incorporating pre-retrieval filters:
   ```sql
   SELECT c.id, c.content, 1 - (c.embedding <=> :queryVector::vector) AS similarity
   FROM knowledge_chunks c
   WHERE c.tenant_id = :tenantId AND c.visibility_scope = ANY(:allowedScopes)
   ORDER BY c.embedding <=> :queryVector::vector ASC LIMIT :limit;
   ```

## 9. Alternatives Considered

- **Alternative 1: Standalone Vector Database (Pinecone / Qdrant / Milvus)**: Specialized vector engines. _Rejected_: Introduces cross-network latency, dual-write synchronization bugs, separate backup lifecycles, and high recurring SaaS fees without necessity for the expected scale (<100,000 chunks).
- **Alternative 2: IVFFlat Indexing in PostgreSQL**: Centroid-based vector indexing. _Rejected_: Requires pre-populating data before index creation; indexing accuracy degrades significantly as new documents are added without re-clustering.
- **Alternative 3: In-Memory Vector Search (hnswlib-node)**: Storing vectors in Node.js heap memory. _Rejected_: High RAM consumption, loss of persistence across API restarts, and complex cluster synchronization across multiple API instances.

## 10. Positive Consequences

- **Unified Datastore**: Backups, replication, transactions, and security audits remain in a single PostgreSQL engine.
- **Atomic Pre-Retrieval Filtering**: Metadata filters (`tenant_id`, `visibility_scope`) and vector distances are evaluated simultaneously in PostgreSQL's query optimizer, eliminating post-retrieval data leaks.
- **Zero Domain Contamination**: Pure port interfaces prevent Prisma's lack of vector typing from leaking into application use cases.

## 11. Negative Consequences

- Standard `postgres:16-alpine` base image cannot be used; environments must deploy `pgvector/pgvector:pg16` or compile the extension manually.
- Vector search queries require raw SQL strings within the adapter rather than type-generated Prisma Client methods.

## 12. Security Implications

- `kinergy_app` runtime user cannot alter schemas, drop tables, or create extensions.
- Tenant isolation is enforced at the database query engine level, preventing unauthorized cross-tenant vector scans.

## 13. Operational Implications

- HNSW indexes consume additional RAM (approximately 1.2x to 1.5x the raw vector storage size). With 10,000 chunks (1024-dim), RAM overhead is under 50 MB, easily accommodated by the database host.
- Database backups via `pg_dump` natively include vector columns and HNSW definitions without specialized tooling.

## 14. Dependencies

- Docker image `pgvector/pgvector:pg16`.
- Execution of extension initialization via `kinergy_migrator`.
- Prisma ORM 6.3.1.

## 15. Implementation Implications

- Create migration script in subsequent milestone AI-02 adding `CREATE EXTENSION IF NOT EXISTS vector;` and table definitions.
- Implement `PgVectorKnowledgeStoreAdapter` implementing `IVectorSearchPort`.

## 16. Validation Requirements

- Validation script querying `SELECT * FROM pg_available_extensions WHERE name = 'vector';` on target container.
- Benchmark HNSW query execution time under 1,000 mock 1024-dim vectors to confirm sub-15ms performance.

## 17. Conditions for Reconsideration

- If managed database hosting (e.g. AWS RDS or GCP Cloud SQL) without pgvector extension support is mandated by external business constraints.
- If vector collection size exceeds millions of vectors requiring distributed sharding beyond a single PostgreSQL node.

## 18. Related ADRs

- ADR-AI-001: Dedicated AI bounded context
- ADR-AI-004: Embedding and model abstraction
- ADR-AI-006: RAG security and access control
