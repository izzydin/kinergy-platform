# AI-01.0 — Architecture Baseline & Evidence Reconciliation

- **Status**: ARCHITECTURE BASELINE (VERIFIED)
- **Date**: 2026-11-19
- **Author Role**: Principal Software Architect, Senior AI Systems Architect, Security Architect
- **Repository**: `izzydin/kinergy-platform`
- **Milestone**: AI-01 — Kynergy Intelligence Architecture & Domain Design
- **Sub-Task**: AI-01.0 — Baseline Reconciliation & Constraint Definition

---

## 1. Executive Baseline Reconciliation

This document establishes the verified architectural baseline and governing constraints for **Kynergy Intelligence**, the AI subsystem of the Kinergy platform.

This baseline reconciles the empirical findings of the **AI-00 Readiness Audit** with independent repository source-code verifications. It defines the unassailable technical foundation upon which all subsequent architectural designs, domain models, and decision records must build.

In strict compliance with the **AI-01 Global Execution Contract**:

1. All findings are derived directly from verified codebase evidence.
2. Every constraint is classified and grounded in established project conventions.
3. No application code is introduced or modified.
4. Core business domains, database migrations, package manifests, and configuration files remain completely untouched.

---

## 2. Review & Reconciliation of AI-00 Documentation

A systematic review of the three authoritative AI-00 deliverables was conducted:

- [`docs/audits/AI-00-READINESS-AUDIT.md`](file:///c:/Projects/kinergy-platform/docs/audits/AI-00-READINESS-AUDIT.md)
- [`docs/audits/AI-00-ARCHITECTURE-GAP-ANALYSIS.md`](file:///c:/Projects/kinergy-platform/docs/audits/AI-00-ARCHITECTURE-GAP-ANALYSIS.md)
- [`docs/audits/AI-00-DEPENDENCY-AND-RISK-REGISTER.md`](file:///c:/Projects/kinergy-platform/docs/audits/AI-00-DEPENDENCY-AND-RISK-REGISTER.md)

### Reconciled Findings Summary:

1. **Application Structure**: Monorepo managed via `nx@20.4.0` and `pnpm@11.17.0` (frozen lockfile). Separates applications (`apps/api`, `apps/web`) from shared libraries (`packages/core`, `packages/ui`, `packages/types`, `packages/validation`, etc.) and standalone contexts (`modules/client`).
2. **Architectural Conventions**: Hexagonal Architecture (Ports and Adapters) and Clean Architecture are non-negotiable. Domain cores (`packages/core/src/*/domain`) maintain zero dependencies on NestJS, Prisma, SQL, or external SDKs.
3. **Backend Boundaries**: Presentation controllers in `apps/api/src/` bind domain ports to concrete infrastructure adapters using explicit dependency injection tokens.
4. **Database & Persistence**: Single relational PostgreSQL 16 database accessed via Prisma ORM 6.3.1. Staging and production enforce dual-role least-privilege security (`kinergy_migrator` with DDL/DML vs `kinergy_app` with DML only).
5. **Storage Architecture**: Milestone 10.5's `StorageModule` provides multi-backend object storage (`S3StorageAdapter` for Cloudflare R2 / AWS S3, `LocalStorageAdapter` for local disk), supporting tenant isolation, pre-signed URLs, and quota tracking.
6. **Authentication & RBAC**: Dual-token JWT (15-minute access, 7-day refresh). Identity context (`AuthenticatedUserContext`) is propagated ambiently across async operations via Node.js `AsyncLocalStorage`. Authorization is enforced by `@RequirePermissions()` using hierarchical dot-notation (`<module>.<resource>.<action>`).
7. **Infrastructure & Acceleration**: Host GPU is an **NVIDIA GeForce RTX 3060 Ti with 8,192 MiB GDDR6 VRAM** (Driver 616.92). Target models (Qwen 4B ~2.8 GB + BGE-M3 ~1.5 GB) fit within physical VRAM alongside desktop OS overhead. Ollama is not installed on system PATH; CI runners lack GPU acceleration.
8. **Vector Persistence**: `pgvector` is completely **missing** from the current `postgres:16-alpine` Docker images and migrations. Prisma schema has zero vector types.
9. **Technical Debt & Architectural Risks**: Incomplete multi-tenancy in existing relational tables (`tenant_id` missing on `clients` and `appointments`, though present on `users`, `sales`, `payments`). Clinical SOAP notes contain Protected Health Information (PHI) requiring total exclusion from initial RAG ingestion.

---

## 3. Independent Verification of Critical Repository Evidence

Each critical finding has been independently verified against the physical codebase:

```
+--------------------------------------------------------------------------------------------------------------------+
|                                      INDEPENDENT CODEBASE VERIFICATION MATRIX                                     |
+----+--------------------------------+--------------------------------------+---------------------------------------+
| #  | Architectural Dimension        | Primary Repository Source Evidence   | Verified Concrete Behavior            |
+----+--------------------------------+--------------------------------------+---------------------------------------+
| 1  | Nx Workspace Organization      | nx.json (L1-36),                     | 10 projects, cached builds/lint/tests.|
|    |                                | pnpm-workspace.yaml (L1-17),         | Path mapping cleanly isolated between |
|    |                                | tsconfig.base.json (L18-32)          | isomorphic core & server persistence. |
+----+--------------------------------+--------------------------------------+---------------------------------------+
| 2  | NestJS Module Conventions      | apps/api/src/app.module.ts (L1-36),  | Global PlatformModule, feature        |
|    |                                | apps/api/src/sales/sales.module.ts   | modules registered via imports. Port  |
|    |                                | apps/api/src/sales/sales.tokens.ts   | bindings use token strings/symbols.   |
+----+--------------------------------+--------------------------------------+---------------------------------------+
| 3  | Clean Architecture Purity      | packages/core/src/sales/domain/,     | Zero framework/ORM imports in domain. |
|    |                                | packages/core/src/kinesiology/domain/| Strict isolation enforced by          |
|    |                                | packages/core/src/sales/*-spec.ts    | automated architecture unit tests.    |
+----+--------------------------------+--------------------------------------+---------------------------------------+
| 4  | Hexagonal Architecture Ports   | packages/core/src/sales/application/ | Domain exposes pure interfaces        |
|    |                                |   ports/sale-repository.port.ts      | (ports); apps/api implements adapters |
|    |                                | apps/api/src/sales/infrastructure/   | (e.g., PrismaSaleRepository).         |
+----+--------------------------------+--------------------------------------+---------------------------------------+
| 5  | Prisma Integration & Client    | prisma/schema.prisma (L1-12),        | Prisma 6.3.1 datasource postgresql;   |
|    |                                | package.json (L55)                   | RFC 4122 v4 UUID PKs, version OCC;    |
|    |                                |                                      | zero vector types declared.           |
+----+--------------------------------+--------------------------------------+---------------------------------------+
| 6  | PostgreSQL & pgvector Status   | docker-compose.yml (L3),             | Base image is postgres:16-alpine.     |
|    |                                | infrastructure/docker/               | Extensions: uuid-ossp, pgcrypto,      |
|    |                                |   init-staging-roles.sql (L7-9)      | pg_trgm. vector extension is ABSENT.  |
+----+--------------------------------+--------------------------------------+---------------------------------------+
| 7  | Object Storage Abstraction     | apps/api/src/platform/storage/ports/ | OBJECT_STORAGE_PORT symbol; S3 & Local|
|    |                                |   object-storage.port.ts (L8-64),    | adapters; 10MB file limit; 5GB quota; |
|    |                                |   domain/storage.types.ts (L6-50)    | domain folders: clinical, clients...  |
+----+--------------------------------+--------------------------------------+---------------------------------------+
| 8  | Authentication & RBAC Model    | apps/api/src/platform/identity/      | AuthenticationGuard validates JWT;    |
|    |                                |   guards/authentication.guard.ts,    | AsyncLocalStorage stores context;     |
|    |                                |   authorization/permissions.ts       | Permissions use dot-notation hierarchy|
+----+--------------------------------+--------------------------------------+---------------------------------------+
| 9  | Frontend Routing & Conventions | apps/web/src/modules/,               | Modular SPA: auth, gym, kinesiology,  |
|    |                                | apps/web/src/app/router/,            | sales... React 18, Vite 5, TanStack   |
|    |                                | packages/ui/src/components/feedback  | Query v5; StateView 4-state contract. |
+----+--------------------------------+--------------------------------------+---------------------------------------+
| 10 | Error Handling Standardization | apps/api/src/common/filters/         | Catches domain & HTTP exceptions;     |
|    |                                |   global-exception.filter.ts (L1-117)| masks internal 500 stack traces;      |
|    |                                |                                      | returns RFC 7807 structured envelopes.|
+----+--------------------------------+--------------------------------------+---------------------------------------+
| 11 | Testing Quality Gates          | package.json (L15-24),               | pnpm validate executes format:check,  |
|    |                                | nx.json (L27-30)                     | lint, typecheck, test, and build;     |
|    |                                |                                      | >9,000 unit/integration tests pass.   |
+----+--------------------------------+--------------------------------------+---------------------------------------+
| 12 | Deployment Restrictions        | .github/workflows/ci.yml (L1-89),    | CI on ubuntu-latest; zero GPU in CI;  |
|    |                                | docker-compose.staging.yml           | Migrations via kinergy_migrator only. |
|    |                                | infrastructure/deployment/docker/    | Nginx proxy on port 8080.             |
+----+--------------------------------+--------------------------------------+---------------------------------------+
```

---

## 4. Architectural Constraints Classification

Based on verified codebase realities, all architectural constraints governing Kynergy Intelligence are classified into six explicit categories:

### 4.1. Mandatory Constraints

1. **Zero-Infrastructure Domain Core**: All domain logic, entities, value objects, and domain services in `packages/core/src/ai/` must contain zero imports from `@nestjs/*`, `@prisma/client`, `ollama`, `openai`, `@langchain/*`, or transport libraries.
2. **Nx Dependency Boundary Compliance**: Module references must adhere to established `@kinergy-platform/*` path mappings. Circular dependencies between libraries are strictly prohibited.
3. **Database Dual-Role Separation**: All schema changes and extension activations must be executable by `kinergy_migrator`. The runtime NestJS application (`kinergy_app`) must never be granted DDL privileges.
4. **Mandatory Pre-Retrieval SQL Filtering**: Multi-tenant isolation (`tenant_id`) and authorization scopes (`visibility_scope`) must be evaluated as mandatory predicates in the vector database SQL query before ranking and returning candidates. Post-retrieval filtering in application memory is strictly prohibited.
5. **Strict TypeScript & ESLint Rules**: Zero usage of `any` (`@typescript-eslint/no-explicit-any: error`), `strict: true`, `noImplicitAny: true`.
6. **Frozen Dependencies**: New libraries must not be introduced arbitrarily. Pure JavaScript/TypeScript parsers and native HTTP clients are mandatory to prevent native C++ compilation hazards on Windows/Linux environments.

### 4.2. Existing Reusable Capabilities

1. **`StorageModule`**: Fully tested object storage subsystem (`OBJECT_STORAGE_PORT`) supporting Cloudflare R2, AWS S3, and local disk. Immediately reusable for staging raw binary documents (PDF, DOCX, Markdown, TXT).
2. **`AuthenticationGuard` & Identity Context**: Ambient `AuthenticatedUserContext` powered by Node.js `AsyncLocalStorage`, providing tamper-proof resolution of `tenantId`, `userId`, and assigned permissions on every request.
3. **`PermissionsGuard` & Authorization Evaluator**: Established RBAC evaluator enforcing `@RequirePermissions()` using hierarchical dot-notation.
4. **Trigram Text Indexing (`pg_trgm`)**: Active extension in PostgreSQL supporting trigram-based fuzzy lexical search, enabling hybrid vector/lexical retrieval without adding Elasticsearch.
5. **Design System & UI Components**: `@kinergy-platform/ui` providing Radix UI `Dialog` (drawer), `Badge` (citation pills), and `StateView` (Loading, Error, Empty, Success states).
6. **Input Sanitization**: `InputSanitizer` in `packages/validation` to neutralize malicious markup or script injections.

### 4.3. Missing Capabilities (To Be Built in Subsequent Milestones)

1. **Vector Storage & Indexing Extension**: `pgvector` extension and compiled `vector.so` binary missing in `postgres:16-alpine`.
2. **AI Relational Schema**: Database tables for document metadata (`knowledge_documents`) and chunk embeddings (`knowledge_chunks`).
3. **Local Inference Daemon**: Ollama runtime daemon and container orchestration manifests.
4. **Model Artifacts**: Locally pulled model weights for Qwen 4B generation model and BGE-M3 embedding model.
5. **Text Extraction Engine**: Node.js parser for unstructured documents (PDF, DOCX).
6. **Token-Aware Chunking Engine**: Text splitter capable of 512-token semantic windowing with 64-token overlap and boundary preservation.
7. **Streaming Presentation Layer**: NestJS `@Sse()` controller endpoint and React UI streaming Markdown parser hook (`useAiStream`).

### 4.4. Architectural Limitations

1. **GPU Concurrency Bounds**: The host NVIDIA RTX 3060 Ti has 8,192 MiB GDDR6 VRAM. While Qwen 4B (~2.8 GB) and BGE-M3 (~1.5 GB) fit simultaneously with ~2 GB headroom, concurrent generation requests cannot execute in parallel on the GPU without thrashing. Execution must be serialized or throttled (`OLLAMA_NUM_PARALLEL=1`).
2. **CI Environment Hardware Gap**: GitHub Actions runners (`ubuntu-latest`) have zero GPU hardware and 7 GB total system RAM. Ollama and local models cannot run during automated CI builds. Integration tests must use mock provider adapters.
3. **Prisma Vector Limitation**: Prisma ORM does not support `vector` types or cosine distance operators (`<=>`). Vector similarity queries must be authored in parameterized raw SQL (`prisma.$queryRaw`).
4. **Relational Multi-Tenancy Asymmetry**: Legacy database tables (`clients`, `appointments`, `treatment_sessions`) lack `tenant_id` columns. The AI schema must strictly mandate `tenant_id NOT NULL` to avoid inheriting this technical debt.

### 4.5. Unresolved Technical Questions

1. **WSL 2 NVIDIA Container Passthrough**: Can Docker Desktop on the Windows host pass the NVIDIA RTX 3060 Ti GPU to a Linux container via the NVIDIA Container Toolkit without driver latency overhead, or should the Ollama daemon run as a native Windows service during development?
2. **DOCX Parsing Library**: Which lightweight, pure-JavaScript library (e.g., `mammoth` vs `docx`) provides the highest semantic extraction fidelity without introducing unmaintained native dependencies?
3. **Asynchronous Ingestion Worker**: Should background document chunking and embedding generation execute via an in-memory transactional worker, a lightweight Redis/BullMQ queue, or a PostgreSQL-backed job table?

### 4.6. Decisions Requiring Explicit Approval

1. **PostgreSQL Docker Image Upgrade**: Approval to update base PostgreSQL image in `docker-compose.yml` and staging manifests from `postgres:16-alpine` to `pgvector/pgvector:pg16`.
2. **AI Permission Taxonomy**: Approval to register new permissions under `ai.*` (`ai.knowledge.read`, `ai.knowledge.manage`, `ai.assistant.use`) in `permissions.ts`.
3. **Storage Domain Folder Extension**: Approval to extend `StorageDomainFolder` union in `apps/api/src/platform/storage/domain/storage.types.ts` to include `'knowledge_base'`.

---

## 5. Initial System Scope Boundaries

To prevent unauthorized access, regulatory non-compliance, and data contamination, strict scope boundaries are established for the initial Kynergy Intelligence implementation:

```
+----------------------------------------------------------------------------------------------------+
|                                    KYNERGY INTELLIGENCE SCOPE BOUNDARIES                           |
+--------------------------------------------------+-------------------------------------------------+
| IN SCOPE (Initial System Target)                 | STRICTLY OUT OF SCOPE (Deferred / Restricted)   |
+--------------------------------------------------+-------------------------------------------------+
| - Internal business and administrative knowledge | - Patient clinical medical records              |
| - Technical platform documentation & architecture| - Clinical SOAP notes (treatment_sessions)      |
| - Clinic and gym standard operating procedures   | - Evaluative biomechanical consultation notes   |
| - Member onboarding & subscription policies      | - Personal client identifiable records (PII)    |
| - Facility rules, equipment & room manuals       | - Financial payment card / credit card data     |
| - Employee guidelines and scheduling FAQs        | - Direct automated database mutations           |
| - Authorized file formats: PDF, DOCX, MD, TXT    | - Scanned image OCR / Audio / Video files       |
+--------------------------------------------------+-------------------------------------------------+
```

> [!CAUTION]
> **Clinical SOAP Notes & PHI Exclusion**:
> Under statutory healthcare privacy mandates (e.g., HIPAA, GDPR, Medico-legal standards), patient consultation notes (`notesSubjective`, `notesObjective`, `notesAssessment`, `notesPlan`) stored in `treatment_sessions` are **100% excluded** from the initial RAG knowledge base.
>
> Any future expansion into patient data requires an independent security audit, cryptographic client-side PII redacting pipelines, signed Business Associate Agreements (BAAs), and dedicated privacy board approval.

---

## 6. Architectural Quality Attributes & Measurable Design Objectives

The Kynergy Intelligence architecture is designed against ten measurable quality attributes. Numerical targets reflect actual host hardware capabilities and platform standards:

```
+--------------------------------------------------------------------------------------------------------------------+
|                                      ARCHITECTURAL QUALITY ATTRIBUTES MATRIX                                       |
+----+------------------------+------------------------------------+-------------------------------------------------+
| #  | Quality Attribute      | Objective Definition               | Concrete Verification Metric                    |
+----+------------------------+------------------------------------+-------------------------------------------------+
| 1  | Maintainability        | Strict Clean Architecture isolation| Zero external AI/DB SDK imports in              |
|    |                        | across domain and application code.| packages/core/src/ai/domain/. Enforced by lint. |
+----+------------------------+------------------------------------+-------------------------------------------------+
| 2  | Testability            | Sub-millisecond unit testing of all| 100% of domain use cases testable in-memory     |
|    |                        | domain logic and retrieval flows.  | using mock ports without DB or Ollama daemons.  |
+----+------------------------+------------------------------------+-------------------------------------------------+
| 3  | Security               | Zero cross-tenant data leakage and | 100% of vector queries enforce tenant_id and    |
|    |                        | pre-retrieval access control.      | visibility_scope in SQL WHERE clause.           |
+----+------------------------+------------------------------------+-------------------------------------------------+
| 4  | Availability           | Graceful system degradation when   | Platform API remains 100% functional even if    |
|    |                        | local inference daemon is down.    | Ollama daemon is offline (returns circuit error)|
+----+------------------------+------------------------------------+-------------------------------------------------+
| 5  | Provider Independence  | Decoupled hexagonal ports for LLMs,| Switching inference provider requires authoring |
|    |                        | embeddings, and vector databases.  | exactly 1 adapter class; 0 domain code edits.   |
+----+------------------------+------------------------------------+-------------------------------------------------+
| 6  | Extensibility          | Support new document formats and   | New text extractors implement IDocumentExtractor|
|    |                        | metadata attributes seamlessly.    | without modifying ingestion orchestrator.       |
+----+------------------------+------------------------------------+-------------------------------------------------+
| 7  | Performance            | Low-latency token streaming for    | Time-to-First-Token (TTFT) < 400ms on RTX 3060Ti|
|    |                        | conversational user experience.    | via SSE streaming; vector search < 15ms.        |
+----+------------------------+------------------------------------+-------------------------------------------------+
| 8  | Observability          | Transparent auditability of queries| Every inference request logs prompt token count,|
|    |                        | and generated token usage.         | completion token count, latency, and citations. |
+----+------------------------+------------------------------------+-------------------------------------------------+
| 9  | Data Isolation         | Cryptographic and relational multi-| Vector embeddings partitioned by tenant_id;     |
|    |                        | tenancy with immutable boundaries. | zero cross-tenant retrieval under any vector.   |
+----+------------------------+------------------------------------+-------------------------------------------------+
| 10 | Operational Simplicity | Minimized infrastructure footprint | Unified persistence inside PostgreSQL; zero     |
|    |                        | leveraging existing platform stack.| external vector DB clusters (Pinecone/Milvus).  |
+----+------------------------+------------------------------------+-------------------------------------------------+
```

---

## 7. Baseline Traceability & Acceptance

1. **Traceability**: All subsequent architectural artifacts (C4 diagrams, domain models, and the seven MADR decision records) trace directly to the constraints, quality attributes, and verified facts documented in this baseline.
2. **Open Questions Register**:
   - Item OQ-1: Windows Native vs WSL 2 Docker containerization for Ollama GPU passthrough.
   - Item OQ-2: Evaluation of pure-JS DOCX extraction library (`mammoth` vs `officeparser`).
   - Item OQ-3: Selection of asynchronous ingestion job mechanism (transactional database poll vs in-process event emitter).
3. **Execution Guardrail**: In accordance with the AI-01 Global Execution Contract, no application code has been generated, and no implementation milestones (AI-02 through AI-05) will commence until this baseline and its associated architecture designs are accepted.
