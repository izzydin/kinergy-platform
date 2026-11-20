# AI-05.6 — Vector Cleanup, Deletion Lifecycle & Retention Architecture

## 1. Executive Summary

Clinical and multitenant data governance requires strict vector lifecycle guarantees:

1. When a clinical document or document version is deleted, its vector embeddings must be immediately excluded from similarity searches to prevent stale or unauthorized knowledge retrieval.
2. In-flight indexing jobs for deleted documents or versions must be cancelled to avoid orphaned vector persistence.
3. Multitenant isolation must be physically enforced during all delete operations (`tenant_id` scoping).
4. Physical cleanup must prune expired generation vectors without compromising the rollback safety window.

---

## 2. Document & Version Deletion Lifecycle

```
[ User/API Document Deletion ]
              │
              ▼
[ KnowledgeDocument Soft-Delete (`deleted_at = NOW()`) ]
              │
              ▼
[ VectorCleanupService.cleanupDocumentVectors(tenantId, documentId) ]
       ├── 1. Cancel in-flight jobs in `vector_indexing_jobs`
       │      (status IN ('PENDING', 'RUNNING') -> 'CANCELLED')
       │
       └── 2. Physical DELETE from `document_embeddings`
              WHERE document_id = $1 AND tenant_id = $2
```

### 2.1 Why Physical Delete for Embeddings?

While source `KnowledgeDocument` records use soft-deletion for regulatory audit purposes (HIPAA / clinical record retention), `DocumentEmbedding` rows are **physically deleted**:

- **Index Hygiene:** PostgreSQL `pgvector` HNSW indexes include all rows present in the table unless filtered. Soft-deleted rows with `deleted_at` would slow down vector search and require index re-traversal.
- **Immediate Exclusion:** Hard deletion guarantees that ANN vector similarity queries can never retrieve embeddings for deleted documents under any circumstances.
- **Audit Preservation:** Source provenance (`KnowledgeDocument`, `DocumentVersion`, `DocumentChunk`) remains intact in their respective audit-retained tables.

---

## 3. In-Flight Job Cancellation

When a document or document version is deleted:

1. `IVectorIndexingJobRepositoryPort.cancelJobsForDocument(tenantId, documentId)` executes:
   ```sql
   UPDATE vector_indexing_jobs
   SET status = 'CANCELLED',
       completed_at = NOW(),
       error_message = 'Cancelled due to document deletion'
   WHERE tenant_id = $1
     AND scope_id = $2
     AND status IN ('PENDING', 'RUNNING');
   ```
2. Any active worker holding the job lease checks cancellation status and halts embedding generation before persisting orphaned vectors.

---

## 4. Generation Retention & Vector Pruning

To balance disk usage against rollback capability:

1. **Protected Generations:**
   - The currently `ACTIVE` generation is strictly protected from vector deletion.
   - Any generation currently `BUILDING` is protected.
   - The most recent $N$ generations in `RETIRED` status (default: `retainRetiredCount = 2`) are protected as an instant rollback buffer.
2. **Expired Generations:**
   - Any `RETIRED` or `FAILED` generation older than the retention threshold has its vectors pruned:
     ```sql
     DELETE FROM document_embeddings
     WHERE index_generation_id = $expiredGenerationId;
     ```
   - The `index_generations` metadata row is updated to `CLEANED` or retained in `RETIRED` with vector count 0, preserving generation history for compliance auditing.

---

## 5. Multitenant Boundary Enforcement

All deletion and cleanup queries are explicitly bound to `tenant_id`:

- `deleteByDocumentId(tenantId, documentId)`
- `deleteByDocumentVersionId(tenantId, versionId)`
- `deleteByGenerationId(generationId)` (verified by generation tenant ownership)
- `cancelJobsForDocument(tenantId, documentId)`
- `cancelJobsForVersion(tenantId, versionId)`

Cross-tenant vector deletion is structurally impossible.
