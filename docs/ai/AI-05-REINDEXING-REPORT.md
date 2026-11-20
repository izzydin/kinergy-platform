# AI-05 — Re-indexing & Model Versioning Report

**Milestone:** AI-05 — Embedding Generation & Vector Indexing  
**Author:** Principal RAG Architect, Data Governance Specialist  
**Date:** 2026-11-20  
**Status:** **VERIFIED & ACCEPTED**

---

## 1. Executive Summary

This report documents the verification of the model versioning, drift detection, zero-downtime re-indexing, atomic promotion, rollback capability, and physical vector cleanup implemented in `AI-05.6`.

---

## 2. Model Drift Detection & Candidate Profile Derivation

The `ModelChangeDetectorService` acts as an automated governance gate between runtime configuration and database persistence:

- Compares active baseline `EmbeddingProfile` against runtime attributes:
  - `modelName`, `modelDigest`, `dimensions`, `provider`, `normalizationPolicy`, `poolingStrategy`, `tokenizerIdentity`.
- **Zero In-Place Mutation:** Baseline profile rows in `embedding_profiles` are strictly immutable.
- **Candidate Derivation:** Material changes derive a new deterministic profile ID:
  $$\text{prof\_id} = \text{"prof\_"} + \text{modelName} + \text{"\_"} + \text{dim} + \text{"\_"} + \text{SHA256}(\text{canonicalParams})[0..12]$$
  _Example:_ `prof_bge-m3_1024_8e3c70eedcd3`

---

## 3. Zero-Downtime Re-indexing Workflow

```
[ Active Generation: Gen #1 (ACTIVE) ] <=== Serves live queries with 0% downtime
                      │
                      ▼
[ Provision Shadow Generation: Gen #2 (BUILDING) ]
                      │
                      ▼
[ Batch Compute Embeddings for all Active Tenant Chunks ]
                      │
                      ▼
[ Completeness & Profile Integrity Validation ]
        │
   Pass?├── No  ──> Mark Gen #2 FAILED. Live search remains on Gen #1.
        │
        └── Yes ──> [ Atomic PostgreSQL Transaction ]
                      ├── Gen #1: ACTIVE   -> RETIRED
                      └── Gen #2: BUILDING -> ACTIVE
```

### 3.1 Verification Scenarios

1. **Model Upgrade:** Migrating tenant corpus from a 768-dim model or older checkpoint to BGE-M3 (1024-dim) successfully provisions Gen #2 in `BUILDING` status, computes embeddings, validates 100% chunk accounting, and atomically promotes Gen #2.
2. **Partial Failure Protection:** If any chunk fails embedding generation during re-indexing, completeness validation rejects promotion. The candidate generation is marked `FAILED` and search traffic continues pointing to Gen #1 without interruption.
3. **Cancellation:** Calling `reindexTenant` with an aborted `AbortSignal` immediately throws `GenerationCancelledException`, halts processing, and cancels in-flight jobs.

---

## 4. Rollback Without Recomputation

When an active generation exhibits clinical regressions or latency spikes:

1. Administrator calls `reindexService.rollbackToGeneration(tenantId, targetGenerationId)`.
2. Subsystem verifies:
   - Target generation belongs to `tenantId`.
   - Target generation is in `RETIRED` status.
   - Vectors for target generation remain intact in `document_embeddings`.
3. Swaps status in an atomic transaction:
   - Currently `ACTIVE` generation $\rightarrow$ `RETIRED`.
   - Target `RETIRED` generation $\rightarrow$ `ACTIVE`.
4. **Result:** Retrieval immediately uses the previously retired vectors. **Zero recalculation or external API calls required.**

---

## 5. Deletion & Cleanup Governance

| Deletion Event         | Indexing Jobs Impact                                              | Vector Store Impact                                                                                             | Source Document Impact                                                    |
| :--------------------- | :---------------------------------------------------------------- | :-------------------------------------------------------------------------------------------------------------- | :------------------------------------------------------------------------ |
| **Document Deletion**  | In-flight jobs (`PENDING`, `RUNNING`) transitioned to `CANCELLED` | Vector rows physically deleted from `document_embeddings` (`WHERE document_id = $id AND tenant_id = $tenantId`) | Soft-deleted (`deleted_at = NOW()`) for audit preservation                |
| **Version Deletion**   | Jobs scoped to version cancelled                                  | Vectors for version physically deleted (`WHERE document_version_id = $id`)                                      | Version soft-deleted or purged                                            |
| **Generation Cleanup** | Jobs for retired generation cleaned                               | Expired retired generation vectors purged (`WHERE index_generation_id = $id`)                                   | Generation metadata retained in `RETIRED` / `CLEANED` with vector count 0 |

### 5.1 Retention Buffer Safety Window

To protect rollback capabilities, `VectorCleanupService` enforces a strict retention buffer:

- Active generation: Strictly protected from vector deletion.
- In-flight building generations: Strictly protected.
- Most recent $N$ retired generations (default: `retainRetiredCount = 2`): Strictly protected.
- Only generations older than $N$ retired generations have their vectors physically purged.
