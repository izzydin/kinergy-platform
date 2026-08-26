# Phase 6: Resources Management — Architecture Documentation Hub

Welcome to the centralized architecture documentation repository for **Phase 6: Resources Management** of the **Kinergy Platform**.

---

## 1. Purpose of Phase 6 Architecture Documentation

This documentation hub captures the authoritative architectural baseline, domain models, aggregate boundaries, integration contracts, and decision records (ADRs) for the **Resources Management** bounded context. It provides complete technical governance and architectural clarity before and during implementation.

---

## 2. Current Architectural Context

The **Kinergy Platform** is an enterprise multi-tenant health and wellness business management system. It is structured as an **Nx integrated monorepo** governed by **Clean Architecture**, **Domain-Driven Design (DDD)**, and **Hexagonal (Ports & Adapters)** principles.

Phases 0 through 5 have established:

- **Phase 0**: Monorepo Foundation & Tooling (Nx, pnpm, NestJS, React/Vite, Prisma, Shared Packages, Docker, CI/CD)
- **Phase 1**: Identity & Access Management (IAM), Security Architecture, RBAC/ABAC Authorization
- **Phase 2**: Client Management Bounded Context (`Client`, `ClientTimelineEntry`, `IClientFacade`)
- **Phase 3**: Scheduling Bounded Context (`Appointment`, `RecurrenceSeries`, `Room`, `SchedulableResource`)
- **Phase 4**: Kinesiology Bounded Context (`TreatmentSession`, SOAP clinical notes, ACL adapter)
- **Phase 5**: Gym Management Bounded Context (`MembershipPlan`, `Membership`, `AttendanceRecord`, Trainer Dashboard)

---

## 3. Scope of Phase 6

**Phase 6 Business Domain**: Resources Management.  
**Business Goal**: Provide complete visibility into everything the business owns and consumes.

The phase is partitioned into two distinct sub-domains:

1. **Consumable Inventory**:
   - Tracking stock levels, SKUs, reorder thresholds, batch/lot tracking, unit costs, stock adjustments, receipts, and clinical/operational consumption logs.
2. **Fixed Assets**:
   - Tracking physical capital assets (machines, treatment devices, furniture, facility fixtures), asset tagging, serial numbers, acquisition costs, depreciation schedules, warranty status, maintenance histories, and operational lifecycle states (`OPERATIONAL`, `MAINTENANCE`, `DECOMMISSIONED`, `DISPOSED`).

---

## 4. Document Index

| Document                                                                    | Description                                                                                                           | Status                |
| :-------------------------------------------------------------------------- | :-------------------------------------------------------------------------------------------------------------------- | :-------------------- |
| **[Phase 6 Architecture Discovery](./phase-6-architecture-discovery.md)**   | Comprehensive reconnaissance of existing architecture, constraints, evolution, reusable patterns, risks, and evidence | Complete / Baseline   |
| **[Domain Boundary Design](./domain-boundaries.md)**                        | Domain boundaries, entity classification, aggregate root definitions, invariants, and lifecycle state machines        | Complete / Baseline   |
| **[Production Persistence Strategy](./persistence-strategy.md)**            | Database schema topology, table models, indexing, OCC concurrency controls, and asset history reconstruction          | Complete / Baseline   |
| **[Domain Model Specification](./domain-model.md)**                         | Canonical entities, aggregates, value objects, lifecycle state machines, and invariants                               | Approved & Active     |
| **[Fixed Asset Domain Model Specification](./asset-domain-model.md)**       | Non-fungible fixed asset aggregate, lifecycle state machine, history, and maintenance records                         | Approved & Active     |
| **[Fixed Asset Lifecycle Specification](./asset-lifecycle.md)**             | Deterministic state machine, complete transition matrix, terminal disposal rules, and atomic invariants               | Approved & Active     |
| **[Executable Business Rules Specification](./business-rules.md)**          | Deterministic business rules, invariant tier classification, stock mutation semantics, and error conditions           | Complete / Executable |
| **[Milestone 6.0 Architecture Gate](./milestone-6.0-architecture-gate.md)** | Formal Architecture Review Board (ARB) evaluation, evidence matrix, and implementation authorization                  | **Approved (100%)**   |
| **[Milestone 6.1 Consistency Review](./phase-6.1-review.md)**               | Architectural consistency verification, ADR audit, and domain-persistence parity review                               | Complete / Verified   |
| **[Milestone 6.1 Quality Gate](./milestone-6.1-quality-gate.md)**           | Formal Architecture Review Board evaluation and Quality Gate authorization for Milestone 6.2                          | **Approved (100%)**   |

---

## 5. Architectural Decision Records (ADR) Index

Architectural Decision Records governing Phase 6:

| ADR ID                                                                                                     | Title                                                                      | Status   | Date       |
| :--------------------------------------------------------------------------------------------------------- | :------------------------------------------------------------------------- | :------- | :--------- |
| **[ADR-0081](./adr/0081-resources-bounded-context-topology-and-domain-segregation.md)**                    | Resources Bounded Context Topology & Domain Segregation                    | Accepted | 2026-08-25 |
| **[ADR-0082](./adr/0082-fixed-asset-domain-modeling-and-complete-segregation-from-inventory.md)**          | Fixed Asset Domain Modeling & Complete Segregation from Inventory          | Accepted | 2026-08-25 |
| **[ADR-0083](./adr/0083-inventory-movement-ledger-and-materialized-stock-mutation-strategy.md)**           | Inventory Movement Ledger & Materialized Stock Mutation Strategy           | Accepted | 2026-08-25 |
| **[ADR-0084](./adr/0084-inventory-concurrency-control-and-race-condition-prevention.md)**                  | Inventory Concurrency Control & Race Condition Prevention                  | Accepted | 2026-08-25 |
| **[ADR-0085](./adr/0085-fixed-asset-operational-lifecycle-state-machine-and-terminal-disposal-policy.md)** | Fixed Asset Operational Lifecycle State Machine & Terminal Disposal Policy | Accepted | 2026-08-25 |
| **[ADR-0086](./adr/0086-fixed-asset-maintenance-history-and-service-tracking-model.md)**                   | Fixed Asset Maintenance History & Service Tracking Model                   | Accepted | 2026-08-25 |
| **[ADR-0087](./adr/0087-resource-valuation-and-on-demand-asset-depreciation-strategy.md)**                 | Resource Valuation & On-Demand Asset Depreciation Strategy                 | Accepted | 2026-08-25 |
| **[ADR-0088](./adr/0088-inventory-category-classification-strategy.md)**                                   | Inventory Category Classification Strategy                                 | Accepted | 2026-08-25 |
| **[ADR-0089](./adr/0089-inventory-monetary-quantity-and-unit-precision-semantics.md)**                     | Inventory Monetary, Quantity, and Unit Precision Semantics                 | Accepted | 2026-08-25 |
| **[ADR-0090](./adr/0090-fixed-asset-classification-lifecycle-state-and-condition-rating-strategy.md)**     | Fixed Asset Classification, Lifecycle State, & Condition Rating Strategy   | Accepted | 2026-08-26 |

---

## 6. Status of the Architectural Baseline

- **Current Milestone**: Phase 6.2 — Fixed Asset Domain Model.
- **Status**: **SPECIFICATION APPROVED & ACTIVE**.
- **Gate Result**: **APPROVED** (See [Milestone 6.1 Quality Gate](./milestone-6.1-quality-gate.md)).
- **Next Milestone**: Phase 6.3 — Application Services, Use Cases & CQRS Handlers (REST Endpoints & Frontend UI in Phase 6.4+).

> [!NOTE]
>
> ### ARCHITECTURAL GOVERNANCE STATUS
>
> **Milestone 6.0 and Milestone 6.1 have been formally reviewed and APPROVED by the Architecture Review Board.**
>
> The team is authorized to proceed with Phase 6.2 implementation (Fixed Asset Domain kernel, aggregate invariants, child entities, and test suites) in accordance with baseline design documents and ADRs.
