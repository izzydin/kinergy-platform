# Kinergy Platform - Master Documentation Index

Welcome to the centralized documentation hub for the **Kinergy Platform**. This platform is engineered following **Clean Architecture**, **Domain-Driven Design (DDD)**, and **SOLID principles** within an **Nx Integrated Monorepo**.

---

## 📚 Documentation Map

```
docs/
├── getting-started/      ◄── Onboarding, Local Setup & Quick Start
├── architecture/         ◄── System Overview, C4 Models, Clean Architecture & DDD
├── frontend/             ◄── Frontend Architecture Vision, Principles & Glossary
├── scheduling/           ◄── Scheduling Bounded Context, Aggregates, CQRS & API
├── security/             ◄── OWASP Specifications, Auth, Tokens, Web Security & Audit
├── testing/              ◄── Quality Gates, Harnesses, Unit, Integration & E2E Testing
├── configuration/        ◄── Centralized Zod Environment Variables & Secrets Reference
├── api/                  ◄── OpenAPI / Swagger Docs, Envelope Schemas & Routes
├── adr/                  ◄── Architectural Decision Records (0001 - 0044+)
└── glossary.md           ◄── Ubiquitous Language, Security Acronyms & Terminology
```

---

## 🚀 Quick Navigation

### 1. Developer Onboarding & Local Setup

- **[Getting Started Guide](file:///c:/Projects/kinergy-platform/docs/getting-started/README.md)**: Dependencies, local Docker container execution, database seeding, and development server launch.
- **[Platform Glossary](file:///c:/Projects/kinergy-platform/docs/glossary.md)**: Definitions for domain concepts, security acronyms, and technical terminology.

### 2. Architecture & Design

- **[System Architecture Guide](file:///c:/Projects/kinergy-platform/docs/architecture/system-architecture.md)**: Layer boundaries (Domain, Application, Infrastructure, Presentation) and request execution sequence diagrams.
- **[Domain-Driven Design Strategy](file:///c:/Projects/kinergy-platform/docs/architecture/domain-driven-design.md)**: Shared Kernel primitives (`Entity`, `ValueObject`, `Result`), aggregate boundaries, and domain rules.
- **[Bounded Contexts](file:///c:/Projects/kinergy-platform/docs/architecture/bounded-contexts.md)**: Context isolation map and enterprise platform services.
- **[Kinesiology Bounded Context](file:///c:/Projects/kinergy-platform/docs/architecture/contexts/kinesiology.md)**: Domain ownership boundaries, aggregate matrix, and cross-context contracts.
- **[Gym Management Reconnaissance & Baseline](file:///c:/Projects/kinergy-platform/docs/architecture/gym-management-reconnaissance.md)**: Phase 5.1-A reconnaissance, context constraints, and client ownership rules.

### 3. Frontend Architecture Vision & Principles

- **[Frontend Architecture Vision](file:///c:/Projects/kinergy-platform/docs/frontend/architecture.md)**: SPA architecture, backend alignment, feature modules, design system, shared package rules, state discipline, and future SaaS goals.
- **[Frontend Engineering Principles](file:///c:/Projects/kinergy-platform/docs/frontend/principles.md)**: Bounded context fidelity, feature-first structure, hybrid routing, zero business logic in shared, composition, 4-state UI contract, anti-patterns.
- **[Frontend Folder Structure](file:///c:/Projects/kinergy-platform/docs/frontend/folder-structure.md)**: Directory taxonomy (`src/`, `app/`, `modules/`, `shared/`, `assets/`, `test/`), ownership rules, import boundaries, `index.ts` public contracts, and import examples.
- **[Frontend Routing Architecture](file:///c:/Projects/kinergy-platform/docs/frontend/routing.md)**: Hybrid feature routing strategy, app shell vs module routers, protected routes, nested layout inheritance, lazy loading, multi-tenant & SaaS compatibility.
- **[Frontend State Management Architecture](file:///c:/Projects/kinergy-platform/docs/frontend/state-management.md)**: Single-responsibility state taxonomy (Server, URL, Local, Form, Global Context, Theme, Auth, Toast Notifications), decision matrix, and anti-patterns.
- **[Frontend API Architecture](file:///c:/Projects/kinergy-platform/docs/frontend/api.md)**: Transport client, TanStack Query conventions, Query Key Factory, optimistic updates & rollback, DTO mapping/Zod parsing, MSW testing, and module decoupling.
- **[Frontend UI Architecture](file:///c:/Projects/kinergy-platform/docs/frontend/ui-architecture.md)**: Design system philosophy, atomic primitives vs business components, Component Location Decision Tree, shared UI frameworks, 4-State UI Contract, and Rule of Three.
- **[Component Architecture Contracts](file:///c:/Projects/kinergy-platform/docs/frontend/component-contracts.md)**: Mandatory standards for public API design, DOM ref forwarding, `asChild` composition, `cn()` styling, token enforcement, WAI-ARIA accessibility, and unit testing.
- **[Frontend Testing Strategy](file:///c:/Projects/kinergy-platform/docs/frontend/testing.md)**: Testing pyramid (Vitest, RTL, MSW v2, Playwright), folder conventions, coverage expectations, 4-state contract testing, mocking strategy, and CI integration.
- **[Frontend Error Handling Strategy](file:///c:/Projects/kinergy-platform/docs/frontend/error-handling.md)**: API errors, NestJS exception alignment, error boundaries, recoverable vs flow-terminating matrix, retry policies, and logging/telemetry.
- **[Frontend Technical Glossary](file:///c:/Projects/kinergy-platform/docs/frontend/glossary.md)**: Terminology index for frontend state taxonomy, UI contracts, routing, and design system abstractions.

### 4. Security Infrastructure

- **[Security Architecture Index](file:///c:/Projects/kinergy-platform/docs/security/README.md)**: Overview of platform security controls.
- **[Authentication Specification](file:///c:/Projects/kinergy-platform/docs/security/authentication.md)**: Dual-token JWT architecture, Refresh Token Rotation (RTR), generic error handling, and Argon2id timing attack defenses.
- **[Authorization Framework](file:///c:/Projects/kinergy-platform/docs/security/authorization.md)**: RBAC/ABAC authorization engine, `@RequirePermissions()` decorators, and permission resolution.
- **[Password Policy](file:///c:/Projects/kinergy-platform/docs/security/password-policy.md)**: Hardened Argon2id parameters, complexity validation, reuse prevention, and CSPRNG temporary password resets.
- **[Web Security, CORS & Helmet](file:///c:/Projects/kinergy-platform/docs/security/web-security-cors-and-headers.md)**: Production Helmet options, OWASP security headers, and environment-driven CORS.
- **[Audit Logging Architecture](file:///c:/Projects/kinergy-platform/docs/security/audit-logging-architecture.md)**: `IAuditEventPublisher` port, `LoggerAuditEventPublisher` adapter, and `SecurityAuditHookService`.

### 5. Testing & Quality Gates

- **[Enterprise Testing Strategy](file:///c:/Projects/kinergy-platform/docs/testing/README.md)**: Testing philosophy, `@kinergy/testing` harness usage, and edge case matrix.
- **[Integration Testing Strategy](file:///c:/Projects/kinergy-platform/docs/testing/integration-testing-strategy.md)**: Multi-layer workflow verification and state isolation guidelines.
- **[End-to-End (E2E) Testing Strategy](file:///c:/Projects/kinergy-platform/docs/testing/e2e-testing-strategy.md)**: Complete HTTP pipeline testing with NestJS and Supertest.
- **[Technical Quality Report](file:///c:/Projects/kinergy-platform/docs/testing/technical-quality-report.md)**: Automated quality gate metrics and 100% test pass verification.

### 6. Environment Configuration & API Reference

- **[Environment Configuration Guide](file:///c:/Projects/kinergy-platform/docs/configuration/README.md)**: Zod `envSchema` variable reference, required secrets, and production fail-fast rules.
- **[API Reference Guide](file:///c:/Projects/kinergy-platform/docs/api/README.md)**: OpenAPI / Swagger setup (`/api/docs`), standard response envelopes (`Result<T>`), and endpoint catalog.

### 7. Scheduling Bounded Context

- **[Scheduling Domain Model](file:///c:/Projects/kinergy-platform/docs/scheduling/domain-model.md)**: Aggregate roots (`Appointment`, `TherapistSchedule`, `Room`, `RecurrenceSeries`), value objects, and domain invariants.
- **[Scheduling Application Architecture](file:///c:/Projects/kinergy-platform/docs/scheduling/application-architecture.md)**: CQRS command/query handlers, 4D conflict detection engine, and temporal calculation.
- **[Appointment Lifecycle & State Machine](file:///c:/Projects/kinergy-platform/docs/scheduling/appointment-lifecycle.md)**: State machine model, valid transitions, guard rules, and terminal states.
- **[Room & Resource Scheduling Architecture](file:///c:/Projects/kinergy-platform/docs/scheduling/room-scheduling.md)**: SchedulableResource design, capacity management, maintenance windows, and equipment features.
- **[Recurring Appointments Architecture](file:///c:/Projects/kinergy-platform/docs/scheduling/recurring-appointments-flow.md)**: Rolling generation horizon, idempotency keys, single-occurrence detachments, and DST clamping.
- **[Scheduling API Documentation](file:///c:/Projects/kinergy-platform/docs/scheduling/api-documentation.md)**: CQRS command/query contracts and REST endpoints for `/api/v1/scheduling/rooms` and `/api/v1/scheduling/recurring`.

### 8. Architectural Decision Records (ADRs)

- **[ADR Directory Index](file:///c:/Projects/kinergy-platform/docs/adr/README.md)**: Complete log of 44+ Architectural Decision Records documenting all major platform design choices.
