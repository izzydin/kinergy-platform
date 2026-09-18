# Kinergy Platform - Master Documentation Index

Welcome to the centralized documentation hub for the **Kinergy Platform**. This platform is engineered following **Clean Architecture**, **Domain-Driven Design (DDD)**, and **SOLID principles** within an **Nx Integrated Monorepo**.

---

## 📚 Documentation Map

```
docs/
├── getting-started/      ◄── Onboarding, Local Setup & Quick Start
├── architecture/         ◄── System Overview, C4 Models, Clean Architecture & DDD
│   └── resources/        ◄── Phase 6 Resources Management Hub, Onboarding & ADRs
├── frontend/             ◄── Frontend Architecture Vision, Principles & Glossary
├── scheduling/           ◄── Scheduling Bounded Context, Aggregates, CQRS & API
├── security/             ◄── OWASP Specifications, Auth, Tokens, Web Security & Audit
├── testing/              ◄── Quality Gates, Harnesses, Unit, Integration & E2E Testing
├── configuration/        ◄── Centralized Zod Environment Variables & Secrets Reference
├── api/                  ◄── OpenAPI / Swagger Docs, Envelope Schemas & Routes
├── adr/                  ◄── Architectural Decision Records (0001 - 0114)
└── glossary.md           ◄── Ubiquitous Language, Security Acronyms & Terminology
```

---

## 🚀 Quick Navigation

### 1. Developer Onboarding & Local Setup

- **[Getting Started Guide](file:///c:/Projects/kinergy-platform/docs/getting-started/README.md)**: Dependencies, local Docker container execution, database seeding, and development server launch.
- **[Platform Glossary](file:///c:/Projects/kinergy-platform/docs/glossary.md)**: Definitions for domain concepts, security acronyms, and technical terminology.

### 2. Core Platform Architecture & Design

- **[System Architecture Guide](file:///c:/Projects/kinergy-platform/docs/architecture/system-architecture.md)**: Layer boundaries (Domain, Application, Infrastructure, Presentation) and request execution sequence diagrams.
- **[Domain-Driven Design Strategy](file:///c:/Projects/kinergy-platform/docs/architecture/domain-driven-design.md)**: Shared Kernel primitives (`Entity`, `ValueObject`, `Result`), aggregate boundaries, and domain rules.
- **[Bounded Contexts](file:///c:/Projects/kinergy-platform/docs/architecture/bounded-contexts.md)**: Context isolation map and enterprise platform services.
- **[Kinesiology Bounded Context](file:///c:/Projects/kinergy-platform/docs/architecture/contexts/kinesiology.md)**: Domain ownership boundaries, aggregate matrix, and cross-context contracts.
- **[Gym Management Bounded Context](file:///c:/Projects/kinergy-platform/docs/architecture/contexts/gym.md)**: Domain ownership boundaries, Context Map, and integration matrix.
- **[Gym Management Reconnaissance & Baseline](file:///c:/Projects/kinergy-platform/docs/architecture/gym-management-reconnaissance.md)**: Phase 5.1-A reconnaissance, context constraints, and client ownership rules.
- **[Gym Management Canonical Vocabulary](file:///c:/Projects/kinergy-platform/docs/business/gym-vocabulary.md)**: Phase 5.1-C ubiquitous language, semantic models, and term definitions.
- **[Gym Management Aggregate Boundaries](file:///c:/Projects/kinergy-platform/docs/architecture/gym-aggregate-boundaries.md)**: Phase 5.1-D aggregate boundaries (`Membership`, `MembershipPlan`, `AttendanceRecord`), invariants, and concurrency rules.
- **[Gym Management Lifecycle & Invariants](file:///c:/Projects/kinergy-platform/docs/architecture/gym-lifecycle-and-invariants.md)**: Phase 5.1-E state transitions, freeze/renewal mathematical rules, and time model.

### 3. Phase 6: Resources Management (Inventory & Fixed Assets)

The **Resources Management Bounded Context** is the authoritative enterprise domain responsible for total operational visibility into everything the business owns, maintains, and consumes. It strictly segregates **Consumable Inventory** (fungible supplies, double-entry ledger, OCC stock defense) from **Fixed Assets** (durable capital property, 5x5 state machine, maintenance records, irreversible `SOLD` status).

> [!TIP]
> **New to Phase 6?**  
> Read the **[Senior Engineer Onboarding & Architecture Navigation Guide](file:///c:/Projects/kinergy-platform/docs/architecture/resources/onboarding.md)** for persona-based reading paths (Backend, Frontend, QA, Architect), document ownership, and quick FAQ answers.  
> You can also explore the complete **[Resources Management Architecture Hub](file:///c:/Projects/kinergy-platform/docs/architecture/resources/README.md)** for the full 65-document catalog.

#### The Canonical 8-Stage Architecture Navigation Flow

```
Architecture  ──►  Domain  ──►  Business Rules  ──►  API  ──►  Frontend  ──►  Testing  ──►  ADRs  ──►  Traceability
```

1. **[Architecture](file:///c:/Projects/kinergy-platform/docs/architecture/contexts/resources.md)**: Authoritative bounded context specification, sub-domain topology, and cross-domain integration.
2. **[Domain](file:///c:/Projects/kinergy-platform/docs/business/resources-vocabulary.md)**: Canonical ubiquitous language, entity classification, and [Domain Model Specification](file:///c:/Projects/kinergy-platform/docs/architecture/resources/domain-model.md).
3. **[Business Rules](file:///c:/Projects/kinergy-platform/docs/architecture/resources/business-rules.md)**: Executable invariants, [Asset State Machine](file:///c:/Projects/kinergy-platform/docs/architecture/resources/asset-status-state-machine.md), [Concurrency Strategy](file:///c:/Projects/kinergy-platform/docs/architecture/resources/concurrency-strategy.md), and [Audit Strategy](file:///c:/Projects/kinergy-platform/docs/architecture/resources/audit-and-history-strategy.md).
4. **[API](file:///c:/Projects/kinergy-platform/docs/architecture/resources/api-documentation.md)**: Public REST HTTP contracts, DTO schemas, permissions, and [API Error Handling](file:///c:/Projects/kinergy-platform/docs/architecture/resources/api-error-handling.md).
5. **[Frontend](file:///c:/Projects/kinergy-platform/docs/architecture/resources/frontend-architecture.md)**: Feature module boundaries, 5-pillar state separation, 4-state UI contract, and screen playbook.
6. **[Testing](file:///c:/Projects/kinergy-platform/docs/architecture/resources/testing-architecture.md)**: 6-tier verification pyramid, proof boundaries, test suites, and Phase 6.17 Scenarios A–H.
7. **[ADRs](file:///c:/Projects/kinergy-platform/docs/architecture/resources/README.md#6-architectural-decision-records-adr-index)**: Complete index of 27 Architectural Decision Records (ADR-0081 through ADR-0107).
8. **[Traceability](file:///c:/Projects/kinergy-platform/docs/architecture/resources/traceability-matrix.md)**: Canonical requirement-to-test traceability matrix mapping all 15 business capabilities across all 5 architecture tiers.

### 4. Frontend Architecture Vision & Principles

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

### 5. Security Infrastructure

- **[Security Architecture Index](file:///c:/Projects/kinergy-platform/docs/security/README.md)**: Overview of platform security controls.
- **[Authentication Specification](file:///c:/Projects/kinergy-platform/docs/security/authentication.md)**: Dual-token JWT architecture, Refresh Token Rotation (RTR), generic error handling, and Argon2id timing attack defenses.
- **[Authorization Framework](file:///c:/Projects/kinergy-platform/docs/security/authorization.md)**: RBAC/ABAC authorization engine, `@RequirePermissions()` decorators, and permission resolution.
- **[Password Policy](file:///c:/Projects/kinergy-platform/docs/security/password-policy.md)**: Hardened Argon2id parameters, complexity validation, reuse prevention, and CSPRNG temporary password resets.
- **[Web Security, CORS & Helmet](file:///c:/Projects/kinergy-platform/docs/security/web-security-cors-and-headers.md)**: Production Helmet options, OWASP security headers, and environment-driven CORS.
- **[Audit Logging Architecture](file:///c:/Projects/kinergy-platform/docs/security/audit-logging-architecture.md)**: `IAuditEventPublisher` port, `LoggerAuditEventPublisher` adapter, and `SecurityAuditHookService`.

### 6. Testing & Quality Gates

- **[Enterprise Testing Strategy](file:///c:/Projects/kinergy-platform/docs/testing/README.md)**: Testing philosophy, `@kinergy/testing` harness usage, and edge case matrix.
- **[Integration Testing Strategy](file:///c:/Projects/kinergy-platform/docs/testing/integration-testing-strategy.md)**: Multi-layer workflow verification and state isolation guidelines.
- **[End-to-End (E2E) Testing Strategy](file:///c:/Projects/kinergy-platform/docs/testing/e2e-testing-strategy.md)**: Complete HTTP pipeline testing with NestJS and Supertest.
- **[Technical Quality Report](file:///c:/Projects/kinergy-platform/docs/testing/technical-quality-report.md)**: Automated quality gate metrics and 100% test pass verification.

### 7. Environment Configuration & API Reference

- **[Environment Configuration Guide](file:///c:/Projects/kinergy-platform/docs/configuration/README.md)**: Zod `envSchema` variable reference, required secrets, and production fail-fast rules.
- **[API Reference Guide](file:///c:/Projects/kinergy-platform/docs/api/README.md)**: OpenAPI / Swagger setup (`/api/docs`), standard response envelopes (`Result<T>`), and endpoint catalog.

### 8. Scheduling Bounded Context

- **[Scheduling Domain Model](file:///c:/Projects/kinergy-platform/docs/scheduling/domain-model.md)**: Aggregate roots (`Appointment`, `TherapistSchedule`, `Room`, `RecurrenceSeries`), value objects, and domain invariants.
- **[Scheduling Application Architecture](file:///c:/Projects/kinergy-platform/docs/scheduling/application-architecture.md)**: CQRS command/query handlers, 4D conflict detection engine, and temporal calculation.
- **[Appointment Lifecycle & State Machine](file:///c:/Projects/kinergy-platform/docs/scheduling/appointment-lifecycle.md)**: State machine model, valid transitions, guard rules, and terminal states.
- **[Room & Resource Scheduling Architecture](file:///c:/Projects/kinergy-platform/docs/scheduling/room-scheduling.md)**: SchedulableResource design, capacity management, maintenance windows, and equipment features.
- **[Recurring Appointments Architecture](file:///c:/Projects/kinergy-platform/docs/scheduling/recurring-appointments-flow.md)**: Rolling generation horizon, idempotency keys, single-occurrence detachments, and DST clamping.
- **[Scheduling API Documentation](file:///c:/Projects/kinergy-platform/docs/scheduling/api-documentation.md)**: CQRS command/query contracts and REST endpoints for `/api/v1/scheduling/rooms` and `/api/v1/scheduling/recurring`.

### 9. Phase 7: Sales & Payments (Point-of-Sale & Financial Engine)

The **Sales & Payments Bounded Context** is the authoritative commercial engine responsible for customer checkout sessions, commercial terms snapshotting, item-level discounts, deterministic monetary totals, and financial settlement.

- **[Sales Architecture Hub](file:///c:/Projects/kinergy-platform/docs/architecture/sales-payments.md)**: Authoritative architecture, aggregate boundaries, "References Over Ownership" law, and checkout flows.
- **[Sale Totals & Canonical Money Rules Architecture](file:///c:/Projects/kinergy-platform/docs/architecture/sale-totals-and-money-rules.md)**: Milestone 7.4 architectural specification for deterministic integer-cent arithmetic, Commercial Half-Up rounding, and boundary mappings.
- **[Sale Totals Implementation Specification](file:///c:/Projects/kinergy-platform/docs/domain/sale-totals-implementation.md)**: Authoritative implemented domain specification for Sale totals, non-negative invariants, and discount calculation.
- **[Milestone 7.4 Final Acceptance Certification](file:///c:/Projects/kinergy-platform/docs/architecture/sale-totals-acceptance.md)**: Complete certification of domain, persistence, API, and automated safety net quality gates.
- **[Sales Domain Model Specification](file:///c:/Projects/kinergy-platform/docs/domain/sales-payments.md)**: Conceptual domain models, aggregate roots (`Sale`, `Payment`), value objects (`Money`, `Discount`, `SourceReference`), and state machines.
- **[Sales Business Rules & Invariants](file:///c:/Projects/kinergy-platform/docs/business-rules/sales-payments.md)**: Complete inventory of commercial rules, 13 canonical formulas, and milestone statuses.
- **[Sales API Reference](file:///c:/Projects/kinergy-platform/docs/api/README.md#34-sales--payments-module-apiv1sales)**: REST endpoints (`/api/v1/sales`), `MoneyResponseDto` contract, and JSON payloads.

### 10. Architectural Decision Records (ADRs)

- **[ADR Directory Index](file:///c:/Projects/kinergy-platform/docs/adr/README.md)**: Complete log of 50+ Architectural Decision Records documenting all major platform design choices (0001 through 0114).
- **[Phase 6 ADR Index (ADR-0081–0107)](file:///c:/Projects/kinergy-platform/docs/architecture/resources/README.md#6-architectural-decision-records-adr-index)**: Detailed index of all 27 Phase 6 Resources Management Architectural Decision Records.
- **Phase 7 ADRs**:
  - [ADR-0108: Deterministic Financial Representation and Currency Modeling](file:///c:/Projects/kinergy-platform/docs/adr/0108-money-representation.md)
  - [ADR-0109: Payment Lifecycle, Multi-Tender Settlement, and Financial Immutability](file:///c:/Projects/kinergy-platform/docs/adr/0109-payment-lifecycle.md)
  - [ADR-0110: Sale Transaction Ownership and Source Bounded-Context Integrity](file:///c:/Projects/kinergy-platform/docs/adr/0110-sale-ownership.md)
  - [ADR-0111: Sales & Payments Authorization, Organization Isolation, and Audit Boundaries](file:///c:/Projects/kinergy-platform/docs/adr/0111-sales-payments-authorization-and-audit.md)
  - [ADR-0112: Sales & Payments Bounded Context Establishment](file:///c:/Projects/kinergy-platform/docs/adr/0112-sales-bounded-context.md)
  - [ADR-0113: Item-Level Discount Domain Model, Deterministic Calculation, and Invariant Enforcement](file:///c:/Projects/kinergy-platform/docs/adr/0113-item-level-discounts.md)
  - [ADR-0114: Canonical Monetary Policy, Deterministic Arithmetic, and Sale Totals Invariant Enforcement](file:///c:/Projects/kinergy-platform/docs/adr/0114-canonical-monetary-policy-and-sale-totals.md)
