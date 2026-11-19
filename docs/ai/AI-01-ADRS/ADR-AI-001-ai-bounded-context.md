# ADR-AI-001: Dedicated AI Bounded Context (Kynergy Intelligence)

## 1. ADR Identifier

ADR-AI-001

## 2. Title

Establishment of Kynergy Intelligence as an Independent Bounded Context within the Monorepo

## 3. Status

Proposed

## 4. Date

2026-11-19

## 5. Context

The Kinergy platform is an established enterprise wellness, kinesiology clinic, and gym management system engineered within an Nx integrated monorepo (`packages/core`, `apps/api`, `apps/web`). The business requires intelligent conversational retrieval, policy question answering, and operational guidance across equipment manuals, facility policies, and operational SOPs. Existing domain modules (`scheduling`, `kinesiology`, `gym`, `resources`, `sales`) have established boundaries and strict Clean Architecture rules. Adding AI capabilities directly into these existing business domains risks architectural erosion, cross-domain coupling, and vendor SDK contamination.

## 6. Problem Statement

Where and how should artificial intelligence and Retrieval-Augmented Generation (RAG) capabilities be structured within Kinergy without destabilizing established business domains, violating Nx module boundaries, or coupling core business models to evolving AI frameworks?

## 7. Decision Drivers

- **Domain Independence**: Protect core business models (`Client`, `Appointment`, `TreatmentSession`, `Sale`) from AI concerns.
- **Architectural Consistency**: Adhere to Kinergy's Clean Architecture, Hexagonal Architecture, and DDD conventions.
- **Maintainability & Modularity**: Permit independent evolution of AI ingestion and retrieval logic.
- **Operational Simplicity**: Avoid the operational overhead of microservices unless justified by concrete operational necessity.
- **Monorepo Synergy**: Reuse shared platform infrastructure (`StorageModule`, `AuthenticationGuard`, `packages/ui`).

## 8. Decision

We establish **Kynergy Intelligence** as a dedicated, first-class, independent Bounded Context within the existing Kinergy monorepo, partitioned across three established platform tiers:

1. **Core Domain & Application (`packages/core/src/ai/`)**: Contains pure domain aggregates (`KnowledgeDocument`, `Conversation`), entities (`DocumentChunk`, `Message`), value objects, domain events, inbound use case ports, and outbound provider port interfaces. Zero dependencies on NestJS, Prisma, or AI vendor SDKs.
2. **Server Infrastructure Adapters (`packages/core/src/server.ts` or `apps/api/src/ai/adapters/`)**: Implements secondary ports (Prisma raw SQL vector queries, Ollama HTTP clients, text extraction). Server-side only; prohibited from browser bundling.
3. **API Delivery (`apps/api/src/ai/`)**: NestJS `AiModule` registering controllers (`AiKnowledgeController`, `AiChatController`) and wiring adapters to ports via dependency injection tokens.
4. **Web Presentation (`apps/web/src/modules/ai/`)**: React 18 / Vite 5 modular frontend interface (`AiAssistantDrawer`, `useAiStream()`).

AI will **not** become the owner or modifier of existing business entities (`Client`, `Appointment`, `TreatmentSession`, `Sale`).

## 9. Alternatives Considered

- **Alternative 1: Embed AI into Existing Business Modules**: Adding RAG logic directly into `kinesiology`, `gym`, or `scheduling`. _Rejected_: Creates severe cross-domain coupling, violates single responsibility, and scatters vector logic across disparate packages.
- **Alternative 2: Separate Deployable Microservice**: Hosting Kynergy Intelligence as an independent Node.js or Python microservice. _Rejected_: Introduces distributed transaction overhead, deployment complexity, inter-service network latency, separate CI/CD pipelines, and duplicated authentication layers without any concrete operational need. Kinergy's single-node/staging deployment runs most efficiently within the unified monorepo.
- **Alternative 3: Standalone Nx Library (`libs/ai`)**: Creating a dedicated top-level library. _Deferred_: Kinergy groups all core domains inside `packages/core/src/` (e.g. `scheduling`, `kinesiology`, `sales`). Creating `packages/core/src/ai` adheres directly to current repository conventions.

## 10. Positive Consequences

- **Zero Cross-Domain Mutation**: Existing clinical and commercial business logic remains completely insulated from AI experiments and framework updates.
- **Strict Clean Architecture**: Domain code remains 100% testable in-memory without database or external daemon dependencies.
- **Direct Asset Reuse**: Leverages existing `StorageModule`, `AuthenticationGuard`, and design system tokens without duplication.
- **Nx Build Caching**: Builds and tests for AI packages are cached independently via standard Nx target defaults.

## 11. Negative Consequences

- Requires explicit mapping layers between database models, domain entities, and presentation DTOs.
- Requires maintenance of custom dependency injection tokens (`Symbol('ILLMProviderPort')`) in NestJS composition root.

## 12. Security Implications

- Multi-tenancy and authorization boundaries are enforced at the AI controller and database query layer before data enters the generation context.
- Isolates AI security policies (e.g., prompt injection defenses, token rate limits) within the AI module without altering global security guards.

## 13. Operational Implications

- AI features can be enabled, disabled, or throttled via environment configuration without affecting platform uptime.
- Deployment remains unified within the existing Docker Compose and CI/CD pipelines.

## 14. Dependencies

- `@kinergy-platform/core`: Core domain and port placement.
- `apps/api`: NestJS presentation and provider binding.
- `apps/web`: Frontend assistant interface.
- Milestone 10.5 `StorageModule`: Document binary persistence.
- `IdentityModule`: Ambient request security context.

## 15. Implementation Implications

- Register `AiModule` in `apps/api/src/app.module.ts`.
- Export isomorphic AI types from `packages/core/src/index.ts` and server adapters from `packages/core/src/server.ts`.
- Add permission codes (`ai.knowledge.read`, `ai.knowledge.manage`, `ai.assistant.use`) to `permissions.ts`.

## 16. Validation Requirements

- Automated architecture boundary tests (similar to `sales-architecture-boundaries.spec.ts`) asserting zero imports of external AI SDKs or cross-domain business modules in `packages/core/src/ai/domain/`.
- Full monorepo validation pass (`pnpm validate`).

## 17. Conditions for Reconsideration

- If AI inference workloads create unmanageable CPU/GPU contention on the primary API server, extracting the execution adapter to a dedicated worker service will be evaluated.
- If multi-language Python AI libraries are deemed mandatory over pure TypeScript adapters.

## 18. Related ADRs

- ADR-AI-002: Local inference with Ollama
- ADR-AI-003: PostgreSQL and pgvector persistence
- ADR-AI-006: RAG security and access control
