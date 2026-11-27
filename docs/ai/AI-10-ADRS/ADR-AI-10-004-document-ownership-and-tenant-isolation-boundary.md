# ADR-AI-10-004: Document Ownership and Tenant Isolation Boundary

## Status

Accepted

## Context

Following the completion of AI-10.1, application-level authorization and identity propagation for Kynergy Intelligence are strictly enforced. However, readiness audit `AI-10.2-READINESS-AUDIT.md` revealed architectural vulnerabilities in the database persistence and vector indexing layers:

1. **Missing Tenant Keys on Derived Artifacts:** Neither `document_embeddings` nor `document_versions` contains a `tenant_id` column. Filtering relies on 5-table relational joins, leaving direct queries and bulk maintenance scripts (e.g. `deleteByDocumentId`) vulnerable to cross-tenant execution.
2. **Lack of Engine-Level Referential Tenant Constraints:** Foreign keys from `knowledge_chunks` and `document_versions` reference only the parent `document_id`. The database engine does not enforce that child chunks possess the identical `tenant_id` as their parent document.
3. **Absence of Database Row-Level Security (RLS):** Zero RLS policies exist in PostgreSQL, meaning any future raw SQL query or misconfigured Prisma invocation could bypass application-layer filters.
4. **Global Unpartitioned Vector Traversal:** The pgvector HNSW index `idx_document_embeddings_hnsw` is global. Post-filtering via joined SQL predicates risks candidate exhaustion at scale.

## Decision

1. **Additive Schema Hardening for Tenant Partitioning:**
   - Add `tenant_id TEXT` to `document_embeddings` and `document_versions`.
   - Add `@@unique([id, tenantId])` on `knowledge_documents`.
   - Update foreign keys on `document_versions`, `knowledge_chunks`, and `document_embeddings` to reference `(document_id, tenant_id)`.
2. **Derived Artifact Authorization Inheritance:**
   - Chunks and vectors do NOT store independent visibility scopes or access policies. They strictly inherit their clearance dynamically from `KnowledgeDocument.visibilityScope` and `KnowledgeDocument.deletedAt`.
3. **Mandatory Tenant Predicate on Vector Deletion:**
   - Update `IVectorStorePort.deleteByDocumentId` and `VectorCleanupService` to require both `(tenantId, documentId)`, ensuring physical vector deletion operations cannot cross tenant boundaries.
4. **PostgreSQL Row-Level Security (RLS) Adoption:**
   - Enable PostgreSQL native RLS on `knowledge_documents`, `document_versions`, `knowledge_chunks`, and `document_embeddings` using `current_setting('app.current_tenant_id', true)`.
5. **Preserve Single-Clinic Simplicity while Preparing for Multi-Tenant SaaS:**
   - Do NOT introduce speculative tenant management entities or dynamic schema switching. Retain the unconstrained `tenantId` string consistent with platform IAM.

## Consequences

### Positive

- Enforces physical tenant isolation at the PostgreSQL database engine level (defense-in-depth).
- Prevents cross-tenant vector contamination, even if an application bug omits a WHERE clause.
- Eliminates 5-table joins for vector scoping by allowing direct `de.tenant_id = $tenantId` filtering.
- Enables PostgreSQL Row-Level Security (RLS) to fail closed on queries lacking a tenant session variable.
- Preserves immediate visibility scope revocation without requiring bulk chunk or vector re-indexing.

### Negative / Trade-offs

- Requires an additive database migration to add `tenant_id` and backfill existing embedding and version records.
- Prisma repositories and unit test fixtures must pass `tenantId` to vector store deletion and insertion routines.
