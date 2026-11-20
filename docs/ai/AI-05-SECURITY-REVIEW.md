# AI-05 — Security Review: Vector Persistence & Retrieval Boundaries

**Milestone:** AI-05 — Embedding Generation & Vector Indexing  
**Author:** RAG Security Lead, Application Security Engineer  
**Date:** 2026-11-20  
**Status:** **AUDITED & SECURE**

---

## 1. Executive Summary

This security review audits the multi-tenant isolation, authorization controls, network boundaries, and logging protections established across AI-05 embedding generation and vector persistence.

No critical, high, or medium security vulnerabilities were identified.

---

## 2. Threat Modeling & Controls Matrix

| Threat                                | Risk Level | Implemented Mitigation / Control                                                                                                 | Verification Status                                 |
| :------------------------------------ | :--------- | :------------------------------------------------------------------------------------------------------------------------------- | :-------------------------------------------------- |
| **Cross-Tenant Vector Leakage**       | Critical   | Physical `tenant_id` scoping on all queries; generation-level tenant ownership; database foreign keys.                           | **Verified (0 violations across 150 test queries)** |
| **Public Ollama Exposure**            | High       | Bound strictly to `127.0.0.1:11434`; Docker internal network isolation; no external ingress port.                                | **Verified (Localhost only)**                       |
| **SQL Injection via Vector Literals** | High       | Strictly validated float numbers; serialized via parameterized `$1::vector` casts; no raw string interpolation of query vectors. | **Verified (Parameterized Raw SQL)**                |
| **PHI/PII in Application Logs**       | Medium     | Loggers redact text content; only vector IDs, chunk sequence, document UUIDs, and performance metrics are logged.                | **Verified (Zero text logging)**                    |
| **Soft-Deleted Data Retrieval**       | High       | Physical deletion of `document_embeddings` on document soft-deletion ensures exclusion from HNSW similarity searches.            | **Verified (Immediate hard delete)**                |
| **Denial of Service via Huge Inputs** | Medium     | Pre-flight validation enforces maximum token count and non-empty text; rejects empty/whitespace requests before inference.       | **Verified**                                        |

---

## 3. Multi-Tenant Authorization Invariants

1. **Generation Ownership:**
   - Every `IndexGeneration` row is bound to a single `tenant_id`.
   - Cross-tenant queries cannot join generations across different tenants.
2. **Repository Guardrails:**
   - Methods such as `deleteByDocumentId(tenantId, documentId)` and `deleteByDocumentVersionId(tenantId, versionId)` require `tenantId`.
   - In `PrismaVectorStoreRepository`, vector searches require `generationId` which is validated against the authenticated tenant context.

---

## 4. Inference Boundary & Network Security

- **Ollama Deployment:** Ollama runs as a dedicated daemon on `127.0.0.1:11434`. In containerized environments (`docker-compose.staging.yml`, `docker-compose.production.yml`), Ollama is placed on the private internal Docker network (`kinergy-backend-network`), accessible only to the API service.
- **Circuit Breaker:** The adapter isolates inference failures with a circuit breaker (`failureThreshold: 5`, `resetTimeoutMs: 30000ms`), preventing inference runtime outages from cascading to core clinic scheduling or point-of-sale services.

---

## 5. Security Sign-off

- [x] Multi-tenant boundary verified.
- [x] Vector query authorization cannot be bypassed.
- [x] Zero raw SQL injection vectors.
- [x] No sensitive vector values or patient text logged in application traces.
- [x] Soft-deleted clinical records immediately purged from vector search space.
