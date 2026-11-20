# AI-05.7 — PostgreSQL & pgvector Optimization Guide

**Milestone:** AI-05.7 — Vector Index Benchmarking & Optimization  
**Architect:** Principal PostgreSQL Performance Engineer, Vector Database Specialist, and Senior RAG Architect  
**Date:** 2026-11-20  
**Status:** Approved & Optimized

---

## 1. Executive Summary

Based on empirical evidence gathered in `AI-05-VECTOR-BENCHMARK.md`, this guide outlines the production PostgreSQL configuration, schema indexing design, query execution policies, and maintenance runbooks required to support low-latency (< 5ms), high-recall clinical knowledge retrieval across multi-tenant environments.

---

## 2. PostgreSQL Configuration Tuning

To maximize vector index performance, memory throughput, and graph construction speed on PostgreSQL 16 with pgvector 0.8.7, apply the following configuration parameters:

### 2.1 Query Time Parameters

| Parameter            | Recommended Setting | Default | Rationale                                                                                                                                                                                                                      |
| :------------------- | :------------------ | :------ | :----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **`hnsw.ef_search`** | **`64`**            | `40`    | Balances recall and query latency. Increases recall@10 on filtered queries while maintaining p50 latencies around **~3.6ms**. Can be tuned per-session via `SET LOCAL hnsw.ef_search = 64;` during clinical retrieval queries. |
| **`work_mem`**       | **`64MB`**          | `4MB`   | Ensures top-N heapsort and intermediate hash joins during multi-tenant retrieval execute entirely in RAM without spilling to disk temporary files.                                                                             |

### 2.2 Index Construction & Re-Indexing Parameters

| Parameter                              | Recommended Setting | Default | Rationale                                                                                                                                                                                    |
| :------------------------------------- | :------------------ | :------ | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **`maintenance_work_mem`**             | **`512MB`**         | `64MB`  | HNSW index builds require holding graph neighborhood structures in memory. Insufficient `maintenance_work_mem` forces page swapping, dramatically slowing index creation for 1024-d vectors. |
| **`max_parallel_maintenance_workers`** | **`4`**             | `2`     | Accelerates parallel index builds and table vacuuming on multi-core CPU hosts.                                                                                                               |

---

## 3. Approved Index Design

### 3.1 Primary Vector Index (HNSW)

The approved vector index for `document_embeddings` is:

```sql
CREATE INDEX IF NOT EXISTS "idx_document_embeddings_hnsw"
ON "document_embeddings" USING hnsw ("embedding" vector_cosine_ops)
WITH (m = 16, ef_construction = 64);
```

#### Why $m = 16$ and $ef_{construction} = 64$?

- **Memory Footprint:** At 20,000 vectors, this index consumes **157 MB**, keeping the entire graph memory-resident within PostgreSQL buffer pool cache.
- **Write Performance:** Supports batch insertion speeds of **146+ vectors/sec**, introducing only ~2.98ms overhead per vector.
- **Recall Stability:** Provides solid graph connectivity without excessive build-time latency.

### 3.2 Metadata B-Tree Indexes

Multi-tenant queries apply selective filters before or during similarity ranking. The following B-tree indexes are required:

```sql
-- 1. Index Generation Filter (Primary tenant partition boundary)
CREATE INDEX IF NOT EXISTS "document_embeddings_index_generation_id_idx"
ON "document_embeddings"("index_generation_id");

-- 2. Document Scoped Retrieval (Chat/Session context filter)
CREATE INDEX IF NOT EXISTS "document_embeddings_document_id_idx"
ON "document_embeddings"("document_id");

-- 3. Document Version Filter (Version-specific retrieval)
CREATE INDEX IF NOT EXISTS "document_embeddings_document_version_id_idx"
ON "document_embeddings"("document_version_id");

-- 4. Composite Generation + Document Filter (Recommended Optimization)
CREATE INDEX IF NOT EXISTS "idx_document_embeddings_gen_doc"
ON "document_embeddings"("index_generation_id", "document_id");
```

---

## 4. Query Execution & Planner Behavior

### 4.1 Broad Tenant Queries (> 30% of corpus)

When searching within a large tenant's active generation:

```sql
SELECT
  "id", "chunk_id", "document_id", "document_version_id",
  1 - ("embedding" <=> $1::vector) AS "similarity"
FROM "document_embeddings"
WHERE "index_generation_id" = $activeGenId
ORDER BY "embedding" <=> $1::vector ASC
LIMIT 10;
```

- **Planner Selection:** HNSW Iterative Index Scan.
- **Execution Profile:** ~4.18ms latency; visits nodes in graph and discards non-matching generations on the fly.

### 4.2 Selective Tenant Queries (< 15% of corpus) or Document-Scoped Search

When searching within a small tenant or scoped to a specific document:

```sql
SELECT
  "id", "chunk_id", "document_id",
  1 - ("embedding" <=> $1::vector) AS "similarity"
FROM "document_embeddings"
WHERE "index_generation_id" = $activeGenId AND "document_id" = $docId
ORDER BY "embedding" <=> $1::vector ASC
LIMIT 10;
```

- **Planner Selection:** B-tree Index Scan (`idx_document_embeddings_gen_doc`) + top-N heapsort.
- **Execution Profile:** **0.039ms – 1.40ms** latency!
- **Architectural Advantage:** When candidate rows are small (< 500 rows), computing exact dot products on the filtered rows in RAM is orders of magnitude faster than navigating the HNSW graph. PostgreSQL chooses this automatically without application-level branching.

---

## 5. Operations & Maintenance Runbook

### 5.1 Routine Maintenance

- **Autovacuum Tuning:**
  ```sql
  ALTER TABLE "document_embeddings" SET (
    autovacuum_vacuum_scale_factor = 0.05,
    autovacuum_analyze_scale_factor = 0.02
  );
  ```
  Ensures table statistics remain updated so the planner accurately estimates row selectivity between HNSW and B-tree scans.

### 5.2 Zero-Downtime Index Rebuilding

If HNSW index rebuilding is required in production:

```sql
CREATE INDEX CONCURRENTLY "idx_document_embeddings_hnsw_new"
ON "document_embeddings" USING hnsw ("embedding" vector_cosine_ops)
WITH (m = 16, ef_construction = 64);

DROP INDEX CONCURRENTLY "idx_document_embeddings_hnsw";

ALTER INDEX "idx_document_embeddings_hnsw_new" RENAME TO "idx_document_embeddings_hnsw";
```

### 5.3 Health & Sizing Monitoring Query

To monitor vector index bloat and table sizes:

```sql
SELECT
  relname AS object_name,
  pg_size_pretty(pg_relation_size(c.oid)) AS object_size,
  reltuples::bigint AS estimated_rows
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND relname IN ('document_embeddings', 'idx_document_embeddings_hnsw', 'document_embeddings_index_generation_id_idx');
```
