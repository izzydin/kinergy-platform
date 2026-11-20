# AI-05 — Implementation Report: Embedding Generation & Vector Indexing

**Milestone:** AI-05 — Embedding Generation & Vector Indexing  
**Author:** Principal Software Architect, Principal Database Architect, Senior NestJS Engineer  
**Date:** 2026-11-20  
**Status:** **APPROVED & FULLY IMPLEMENTED**

---

## 1. Executive Summary

Milestone **AI-05** implements provider-independent, versioned embedding generation and vector persistence for the Kinergy medical, kinesiology, and fitness management platform.

AI-05 builds on the AI-04 immutable chunking and normalization pipeline, persisting 1024-dimensional dense vectors using the approved **BAAI/bge-m3** model hosted locally on Ollama and stored in PostgreSQL 16 with the **pgvector 0.8.7** extension.

All implementations follow strict Hexagonal Architecture / Domain-Driven Design principles, fully decoupling domain logic from PostgreSQL/pgvector syntax and external inference APIs.

---

## 2. Milestone Deliverables Summary

| Sub-Milestone | Objective                         | Primary Components                                                               | Status     |
| :------------ | :-------------------------------- | :------------------------------------------------------------------------------- | :--------- |
| **AI-05.0**   | Read-Only Readiness Assessment    | Environment audit, hardware benchmarking, Ollama verification                    | **PASSED** |
| **AI-05.0.1** | Infrastructure Remediation        | PostgreSQL 16 pgvector binary enablement in Docker & CI                          | **PASSED** |
| **AI-05.1**   | Architecture & Domain Design      | ADR-0010 to ADR-0014, `EmbeddingProfile`, `DocumentEmbedding`, `IndexGeneration` | **PASSED** |
| **AI-05.2**   | pgvector Persistence Strategy     | Additive Prisma migration, `PrismaVectorStoreRepository`, HNSW cosine index      | **PASSED** |
| **AI-05.3**   | BGE-M3 Provider Integration       | `OllamaEmbeddingAdapter`, runtime health checks, model digest stamping           | **PASSED** |
| **AI-05.4**   | Embedding Generation Pipeline     | `EmbeddingGenerationPipelineService`, circuit breaker, bounded batching          | **PASSED** |
| **AI-05.5**   | Indexing Orchestration & Recovery | `VectorIndexingOrchestratorService`, `VectorIndexingRecoveryWorker`              | **PASSED** |
| **AI-05.6**   | Re-Indexing, Versioning & Cleanup | `ModelChangeDetectorService`, `IndexReindexingService`, `VectorCleanupService`   | **PASSED** |
| **AI-05.7**   | Benchmarking & Optimization       | 20k vector benchmark, IVFFlat vs HNSW, metric proof, query planning              | **PASSED** |
| **AI-05.8**   | Final Acceptance & Governance     | Full regression testing, typecheck, linting, operations documentation            | **PASSED** |

---

## 3. Architecture & Domain Model

```
[ Inbound: DocumentController / Event Handlers ]
                       │
                       ▼
    [ VectorIndexingOrchestratorService ]
       ├── 1. Resolves / Provisions IndexGeneration (BUILDING)
       ├── 2. Claims VectorIndexingJob (Lease-based lock)
       │
       ▼
    [ EmbeddingGenerationPipelineService ] (Outside DB Transaction)
       ├── Resolves DocumentChunks (AI-04 Provenance)
       ├── Computes SHA-256 Fingerprint
       └── Calls EmbeddingProviderPort (Ollama BGE-M3, Batch size: 16)
               │
               ▼ (Floats validated: 1024-dim, finite, Unit-L2)
    [ PrismaVectorStoreRepository ] (In Atomic DB Transaction)
       ├── Bulk INSERT into document_embeddings
       ├── Increments IndexGeneration.indexedChunkCount
       └── Updates VectorIndexingJob progress
```

### 3.1 Key Domain Entities & Value Objects

- **`EmbeddingProfile`:** Immutable record of embedding generation configuration (`profileId`, `provider`, `modelName`, `modelDigest`, `dimensions = 1024`, `normalizationPolicy = UNIT_L2`, `poolingStrategy = CLS`).
- **`DocumentEmbedding`:** First-class domain entity linking a chunk to its vector values, profile ID, generation ID, and content fingerprint.
- **`IndexGeneration`:** Tenant-scoped generation aggregate managing the vector lifecycle (`DRAFT` $\rightarrow$ `BUILDING` $\rightarrow$ `VALIDATING` $\rightarrow$ `ACTIVE` $\rightarrow$ `RETIRED` / `FAILED` / `CANCELLED`).
- **`VectorValues`:** Encapsulated float array enforcing dimension matching and finite numeric constraints.

---

## 4. Subsystem Implementation Details

### 4.1 Persistence Layer (`packages/core`)

- **Prisma Schema & Migrations:** Additive migration `20261120000000_enable_pgvector_and_vector_persistence` enables `CREATE EXTENSION IF NOT EXISTS vector;` and provisions 4 tables: `embedding_profiles`, `index_generations`, `document_embeddings`, and `vector_indexing_jobs`.
- **Database Invariants:**
  - `unique_active_index_generation_per_tenant`: Partial unique B-tree index guaranteeing exactly one `ACTIVE` generation per tenant.
  - `chk_document_embeddings_dimensions`: Strict CHECK constraint enforcing `dimensions = 1024`.
  - `document_embeddings_chunk_id_index_generation_id_key`: Composite unique constraint preventing duplicate embeddings per chunk within a generation.

### 4.2 Application Services (`apps/api`)

- **`EmbeddingGenerationPipelineService`:** Handles batching, exponential backoff with jitter (initial: 300ms, max: 2000ms), circuit breaker protection, and automatic single-chunk fallback if batch context limits are exceeded.
- **`VectorIndexingOrchestratorService`:** Idempotently claims indexing jobs, tracks progress, and drives generation completion.
- **`VectorIndexingRecoveryWorker`:** Background interval worker recovering stale or orphaned `RUNNING` jobs whose lease expired (> 5 minutes).
- **`IndexGenerationCompletenessValidatorService`:** Audits vector counts, job statuses, and profile attributes prior to generation activation.
- **`IndexReindexingService`:** Executes zero-downtime model migrations in a parallel shadow generation, performing an atomic PostgreSQL swap on validation success.
- **`VectorCleanupService`:** Enforces immediate vector deletion on document/version soft-delete, cancels active indexing jobs, and applies generation retention windows.

---

## 5. Non-Functional Requirements Compliance

1. **Deterministic Multi-Tenancy:** All queries, jobs, generations, and deletions are strictly scoped by `tenant_id`. No cross-tenant access is possible.
2. **Outside-Transaction Generation:** High-latency Ollama API calls are executed strictly outside database transactions. Database transactions are restricted to sub-second batch persistence.
3. **Resilience & Fault Tolerance:** Worker crashes or network timeouts leave persistent jobs in recoverable states with attempt counters.
4. **Zero-Downtime Rollback:** Rolling back to a previously `RETIRED` generation executes via an atomic metadata swap without re-calculating embeddings.
