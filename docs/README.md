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
├── adr/                  ◄── Architectural Decision Records (0001 - 0119)
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
- **[Sales API & URL-driven DataTable Contract](file:///c:/Projects/kinergy-platform/docs/frontend/sales_url_query_contract.md)**: Authoritative contract mapping URL search, filters, sorting, and pagination state to backend DTOs.
- **[Milestone 7.20 Sales & Payments Frontend Specification](file:///c:/Projects/kinergy-platform/docs/frontend/milestone-7.20-sales-and-payments-frontend.md)**: Authoritative architecture, 7-screen specifications, public module API, URL-state contract, test suites, and acceptance certification.
- **[Frontend Technical Glossary](file:///c:/Projects/kinergy-platform/docs/frontend/glossary.md)**: Terminology index for frontend state taxonomy, UI contracts, routing, and design system abstractions.

### 5. Security Infrastructure

- **[Security Architecture Index](file:///c:/Projects/kinergy-platform/docs/security/README.md)**: Overview of platform security controls.
- **[Authentication Specification](file:///c:/Projects/kinergy-platform/docs/security/authentication.md)**: Dual-token JWT architecture, Refresh Token Rotation (RTR), generic error handling, and Argon2id timing attack defenses.
- **[Authorization Framework](file:///c:/Projects/kinergy-platform/docs/security/authorization.md)**: RBAC/ABAC authorization engine, `@RequirePermissions()` decorators, and permission resolution.
- **[Password Policy](file:///c:/Projects/kinergy-platform/docs/security/password-policy.md)**: Hardened Argon2id parameters, complexity validation, reuse prevention, and CSPRNG temporary password resets.
- **[Web Security, CORS & Helmet](file:///c:/Projects/kinergy-platform/docs/security/web-security-cors-and-headers.md)**: Production Helmet options, OWASP security headers, and environment-driven CORS.
- **[Audit Logging Architecture](file:///c:/Projects/kinergy-platform/docs/security/audit-logging-architecture.md)**: `IAuditEventPublisher` port, `LoggerAuditEventPublisher` adapter, and `SecurityAuditHookService`.
- **[Milestone 7.13 Authorization Governance & Security Specification](file:///c:/Projects/kinergy-platform/docs/architecture/milestone-7.13-authorization-governance.md)**: Canonical specification for permissions, multi-tier boundaries, resource protection, test pyramid, and deferred decisions.
- **[Sales, Payments & Receipts Authorization Matrix](file:///c:/Projects/kinergy-platform/docs/security/sales-payments-receipts-authorization-matrix.md)**: Operational matrix mapping RBAC roles and permissions across all 24 protected endpoints.

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
- **[Payment Domain Implementation Specification](file:///c:/Projects/kinergy-platform/docs/domain/payment-domain-implementation.md)**: Authoritative implemented domain specification for Payment aggregate, canonical state machine, multi-tender settlement, and persistence boundaries.
- **[Payment State Machine Review & Specification](file:///c:/Projects/kinergy-platform/docs/architecture/payment-state-machine-review.md)**: Authoritative specification for Payment state machine, terminality guarantees, and concurrency model.
- **[Milestone 7.4 Final Acceptance Certification](file:///c:/Projects/kinergy-platform/docs/architecture/sale-totals-acceptance.md)**: Complete certification of domain totals, persistence, API, and automated safety net quality gates.
- **[Milestone 7.5 Final Acceptance Certification](file:///c:/Projects/kinergy-platform/docs/architecture/payment-domain-acceptance.md)**: Complete certification of Payment domain, multi-tender settlement, 52-test safety net, and HTTP API quality gates.
- **[Milestone 7.6 Final Acceptance Certification](file:///c:/Projects/kinergy-platform/docs/architecture/payment-domain-acceptance.md)**: Complete certification of Payment State Machine, 16-cell transition matrix, OCC concurrency, client bypass immunity, and 100% test pass rate.
- **[Sales Domain Model Specification](file:///c:/Projects/kinergy-platform/docs/domain/sales-payments.md)**: Conceptual domain models, aggregate roots (`Sale`, `Payment`), value objects (`Money`, `Discount`, `SourceReference`), and state machines.
- **[Sales Business Rules & Invariants](file:///c:/Projects/kinergy-platform/docs/business-rules/sales-payments.md)**: Complete inventory of commercial rules, 13 canonical formulas, and milestone statuses.
- **[Sale Invariant Catalog (Milestone 7.8)](file:///c:/Projects/kinergy-platform/docs/business-rules/sale-invariants-catalog.md)**: Authoritative catalog of Sale invariants (SALE-001 through SALE-021), failure behaviors, enforcement locations, and executable test mappings.
- **[Receipt Domain Specification](file:///c:/Projects/kinergy-platform/docs/domain/receipt-domain-specification.md)**: Milestone 7.7 architectural specification for legal proof-of-purchase document model, snapshotting, and immutability invariants.
- **[Receipt Canonical Response Contract](file:///c:/Projects/kinergy-platform/docs/api/receipt-canonical-response-contract.md)**: Authoritative API presentation contract, reference vs historical snapshot taxonomy, and zero-float serialization rules.
- **[Receipt End-to-End Traceability Matrix](file:///c:/Projects/kinergy-platform/docs/architecture/receipt-traceability-matrix.md)**: Complete traceability matrix mapping business requirements, ADRs, invariants, use cases, persistence constraints, API contracts, and test coverage.
- **[Milestone 7.16 Receipt API OpenAPI & Traceability Report](file:///c:/Projects/kinergy-platform/docs/api/receipt_api_traceability_report.md)**: Authoritative specification and verification report for `GET /sales/:saleId/receipt`.
- **[Milestone 7.17 Receipt PDF & Thermal Rendering Specification](file:///c:/Projects/kinergy-platform/docs/architecture/milestone-7.17-receipt-pdf-and-thermal-rendering.md)**: Future scope specification for vector PDF layout, ESC/POS 80mm/58mm thermal streams, and presentation decoupling.
- **[Milestone 7.18 Financial Concurrency, Idempotency & Multi-Tender Settlement Integrity](file:///c:/Projects/kinergy-platform/docs/adr/0140-financial-concurrency-and-settlement-integrity.md)**: Authoritative architectural baseline, PostgreSQL partial unique indexes, deterministic rendezvous barriers, and multi-aggregate OCC.
- **[Receipt Reprint Auditing & Operational Workflow Specification (Future Scope)](file:///c:/Projects/kinergy-platform/docs/architecture/milestone-7.18-receipt-reprint-auditing.md)**: Architecture specification for `POST /receipts/:id/reprint`, mandatory operational reasons, OCC, and platform audit publishing.
- **[Cross-Domain Commercial Integration Architecture Specification](file:///c:/Projects/kinergy-platform/docs/architecture/cross-domain-commercial-integration.md)**: Authoritative integration contract governing source validation, price resolution, single-billing invariants, and post-settlement fulfillment.
- **[Milestone 7.19 Backend Test Suite & Financial Integrity Verification Specification](file:///c:/Projects/kinergy-platform/docs/architecture/milestone-7.19-backend-test-suite.md)**: Authoritative test execution guide, database isolation architecture, and requirement-to-test traceability matrix.
- **[Sales & Payments Requirement-to-Test Traceability Matrix](file:///c:/Projects/kinergy-platform/docs/architecture/sales-payments-traceability-matrix.md)**: Canonical 6-tier requirement-to-test traceability matrix mapping all 15 financial behaviors across Domain, Application, Persistence, Concurrency, API, and Frontend.
- **[Milestone 7.20 Sales & Payments Frontend Architecture & Acceptance Certification](file:///c:/Projects/kinergy-platform/docs/frontend/milestone-7.20-sales-and-payments-frontend.md)**: Complete certification of the 7-screen Sales & Payments frontend experience, URL-driven DataTable integration, and 100% test pass rate.
- **[Milestone 7.21 Financial UX Hardening & Consistency Acceptance Certification](file:///c:/Projects/kinergy-platform/docs/frontend/milestone-7.21-financial-ux-hardening-and-consistency.md)**: Comprehensive certification of permission-aware actions, submission safety, unambiguous settlement UX, accessibility, and URL state consistency.
- **[Milestone 7.23 Final Business Acceptance Matrix](file:///c:/Projects/kinergy-platform/docs/architecture/milestone-7.23-business-acceptance-matrix.md)**: Comprehensive certification of the six end-to-end commercial checkout scenarios (kinesiology session checkout, healthy drink flow, percentage discounts, overpayment prevention, concurrency/uniqueness, and non-destructive cancellation), quality gates, and 100% test pass rate.
- **[Milestone 7.24 Final Business Acceptance Matrix](file:///c:/Projects/kinergy-platform/docs/architecture/milestone-7.24-business-acceptance-matrix.md)**: Comprehensive repository-backed business acceptance matrix auditing all 28 commercial requirements across Sales, Payments, Receipts, Cross-Domain, Security, and Financial Integrity.
- **[Sales & Payments API Reference](file:///c:/Projects/kinergy-platform/docs/api/README.md#35-payments-module-apiv1salesaleidpayments--apiv1payments)**: REST endpoints (`/api/v1/sales` & `/api/v1/sales/:saleId/payments`, `/api/v1/payments`, `/api/v1/receipts`), DTO contracts, and JSON payloads.
- **[Milestone 7.13 Authorization Governance & Security Specification](file:///c:/Projects/kinergy-platform/docs/architecture/milestone-7.13-authorization-governance.md)**: Canonical specification for permissions, multi-tier boundaries, resource protection, test pyramid, and deferred decisions.
- **[Sales, Payments & Receipts Authorization Matrix](file:///c:/Projects/kinergy-platform/docs/security/sales-payments-receipts-authorization-matrix.md)**: Operational matrix mapping RBAC roles and permissions across all 24 protected endpoints.

### 10. Architectural Decision Records (ADRs)

- **[ADR Directory Index](file:///c:/Projects/kinergy-platform/docs/adr/README.md)**: Complete log of 50+ Architectural Decision Records documenting all major platform design choices (0001 through 0119).
- **[Phase 6 ADR Index (ADR-0081–0107)](file:///c:/Projects/kinergy-platform/docs/architecture/resources/README.md#6-architectural-decision-records-adr-index)**: Detailed index of all 27 Phase 6 Resources Management Architectural Decision Records.
- **Phase 7 ADRs**:
  - [ADR-0108: Deterministic Financial Representation and Currency Modeling](file:///c:/Projects/kinergy-platform/docs/adr/0108-money-representation.md)
  - [ADR-0109: Payment Lifecycle, Multi-Tender Settlement, and Financial Immutability](file:///c:/Projects/kinergy-platform/docs/adr/0109-payment-lifecycle.md)
  - [ADR-0110: Sale Transaction Ownership and Source Bounded-Context Integrity](file:///c:/Projects/kinergy-platform/docs/adr/0110-sale-ownership.md)
  - [ADR-0111: Sales & Payments Authorization, Organization Isolation, and Audit Boundaries](file:///c:/Projects/kinergy-platform/docs/adr/0111-sales-payments-authorization-and-audit.md)
  - [ADR-0112: Sales & Payments Bounded Context Establishment](file:///c:/Projects/kinergy-platform/docs/adr/0112-sales-bounded-context.md)
  - [ADR-0113: Item-Level Discount Domain Model, Deterministic Calculation, and Invariant Enforcement](file:///c:/Projects/kinergy-platform/docs/adr/0113-item-level-discounts.md)
  - [ADR-0114: Canonical Monetary Policy, Deterministic Arithmetic, and Sale Totals Invariant Enforcement](file:///c:/Projects/kinergy-platform/docs/adr/0114-canonical-monetary-policy-and-sale-totals.md)
  - [ADR-0115: Payment Domain Canonical Architecture, Aggregate Boundaries, and Tender Decoupling](file:///c:/Projects/kinergy-platform/docs/adr/0115-payment-domain-canonical-architecture.md)
  - [ADR-0116: Payment State Machine, Lifecycle Specification, and Financial Transition Determinism](file:///c:/Projects/kinergy-platform/docs/adr/0116-payment-state-machine-and-lifecycle-specification.md)
  - [ADR-0117: Receipt Domain Boundary, Document Model, and Legal Proof-of-Purchase Invariants](file:///c:/Projects/kinergy-platform/docs/adr/0117-receipt-domain-boundary-and-document-model.md)
  - [ADR-0118: Sale Reference and Receipt Identification Strategy](file:///c:/Projects/kinergy-platform/docs/adr/0118-sale-reference-and-receipt-identification-strategy.md)
  - [ADR-0119: Sale Aggregate Boundary, Invariants, and Commercial Transaction Integrity](file:///c:/Projects/kinergy-platform/docs/adr/0119-sale-aggregate-boundary-and-invariants.md)
  - [ADR-0120: Commercial Transaction Uniqueness, Idempotency, and Exactly-One-Sale Invariant](file:///c:/Projects/kinergy-platform/docs/adr/0120-commercial-transaction-uniqueness-and-sale-idempotency.md)
  - [ADR-0121: Sale Source References and Commercial Origin Model](file:///c:/Projects/kinergy-platform/docs/adr/0121-sale-source-references-and-commercial-origin-model.md)
  - [ADR-0122: Phase 7 Financial Persistence Architecture and Relational Integrity Model](file:///c:/Projects/kinergy-platform/docs/adr/0122-phase-7-financial-persistence-architecture.md)
  - [ADR-0123: Phase 7 Financial Model Database Index Strategy and Query Optimization](file:///c:/Projects/kinergy-platform/docs/adr/0123-phase-7-financial-database-index-strategy.md)
  - [ADR-0124: Phase 7 Financial Models Uniqueness Audit and Constraint Architecture](file:///c:/Projects/kinergy-platform/docs/adr/0124-phase-7-financial-models-uniqueness-audit.md)
  - [ADR-0125: Phase 7 Transaction Architecture and Atomic Persistence Boundaries](file:///c:/Projects/kinergy-platform/docs/adr/0125-phase-7-transaction-architecture-and-atomic-boundaries.md)
  - [ADR-0126: Phase 7 Hexagonal Architecture Repository Reconciliation and Clean Persistence Boundaries](file:///c:/Projects/kinergy-platform/docs/adr/0126-phase-7-hexagonal-architecture-repository-reconciliation.md)
  - [ADR-0127: Phase 7 Database Migration Review, Data Compatibility, and Verification](file:///c:/Projects/kinergy-platform/docs/adr/0127-phase-7-database-migration-review-and-validation.md)
  - [ADR-0128: Phase 7 Test Infrastructure, Fixtures, Builders, and Seeds Reconciliation](file:///c:/Projects/kinergy-platform/docs/adr/0128-phase-7-test-infrastructure-and-seed-reconciliation.md)
  - [ADR-0129: Phase 7 Prisma Schema Architectural Review and Final Integrity Verification](file:///c:/Projects/kinergy-platform/docs/adr/0129-phase-7-prisma-schema-architectural-review.md)
  - [ADR-0130: Phase 7 Persistence-Boundary Audit and Domain Purity Hardening](file:///c:/Projects/kinergy-platform/docs/adr/0130-phase-7-persistence-boundary-audit-and-domain-purity.md)
  - [ADR-0131: Phase 7 Query Patterns, Index Optimization, and Relation-Loading Strategy](file:///c:/Projects/kinergy-platform/docs/adr/0131-phase-7-query-patterns-index-optimization-and-relation-loading.md)
  - [ADR-0132: Sale Application Layer Architecture, Use Case Inventory, and Orchestration Contracts](file:///c:/Projects/kinergy-platform/docs/adr/0132-sale-application-layer-architecture.md)
  - [ADR-0133: Payment Application Layer Architecture, Cross-Aggregate Settlement Orchestration, and Use Case Inventory](file:///c:/Projects/kinergy-platform/docs/adr/0133-payment-application-layer-architecture.md)
  - [ADR-0134: Financial Settlement Validation, Multi-Tender Boundaries & Overpayment Invariants](file:///c:/Projects/kinergy-platform/docs/adr/0134-financial-settlement-validation-and-overpayment-invariants.md)
  - [ADR-0135: Sales, Payments & Receipts Authorization Architecture, IAM Integration & Security Boundaries](file:///c:/Projects/kinergy-platform/docs/adr/0135-sales-payments-receipts-authorization-and-security.md)
  - [ADR-0136: Sales API Architecture, HTTP Contracts & Unified Commercial Ledger Specification](file:///c:/Projects/kinergy-platform/docs/adr/0136-sales-api-architecture-and-contracts.md)
  - [ADR-0139: Cross-Domain Commercial Integration Contract, Source Resolution, and Fulfillment Orchestration](file:///c:/Projects/kinergy-platform/docs/adr/0139-cross-domain-commercial-integration-contract.md)
  - [ADR-0140: Financial Concurrency, Idempotency, and Multi-Tender Settlement Integrity](file:///c:/Projects/kinergy-platform/docs/adr/0140-financial-concurrency-and-settlement-integrity.md)
