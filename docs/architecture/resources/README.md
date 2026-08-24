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

| Document                                                                  | Description                                                                                                           | Status                  |
| :------------------------------------------------------------------------ | :-------------------------------------------------------------------------------------------------------------------- | :---------------------- |
| **[Phase 6 Architecture Discovery](./phase-6-architecture-discovery.md)** | Comprehensive reconnaissance of existing architecture, constraints, evolution, reusable patterns, risks, and evidence | Complete / Baseline     |
| **Domain Model & Vocabulary (Upcoming)**                                  | Canonical vocabulary, entity specifications, and value object definitions for Inventory & Assets                      | Planned (Milestone 6.1) |
| **Aggregate Boundaries & Invariants (Upcoming)**                          | Aggregate root definitions, transactional boundaries, state machines, and concurrency controls                        | Planned (Milestone 6.1) |
| **Integration Contracts & Context Map (Upcoming)**                        | Cross-context contracts with Scheduling, Kinesiology, IAM, and Client contexts                                        | Planned (Milestone 6.1) |

---

## 5. Architectural Decision Records (ADR) Index Placeholder

Architectural Decision Records governing Phase 6 will be authored in `docs/adr/` adhering to the MADR format established by ADR-0001:

| ADR ID  | Title                                                                         | Status     | Date                    |
| :------ | :---------------------------------------------------------------------------- | :--------- | :---------------------- |
| _0081+_ | _Phase 6 Resources Bounded Context Ownership & Context Map_                   | _Proposed_ | _Pending Milestone 6.1_ |
| _0082+_ | _Consumable Inventory Aggregate Boundaries & Stock Tracking Strategy_         | _Proposed_ | _Pending Milestone 6.1_ |
| _0083+_ | _Fixed Asset Lifecycle, Maintenance & Depreciation Strategy_                  | _Proposed_ | _Pending Milestone 6.1_ |
| _0084+_ | _SchedulableResource (Phase 3) vs Fixed Asset (Phase 6) Integration Contract_ | _Proposed_ | _Pending Milestone 6.1_ |

---

## 6. Status of the Architectural Baseline

- **Current Milestone**: Phase 6.0 — Phase Discovery & Architectural Baseline.
- **Status**: **DISCOVERY COMPLETE — BASELINE ESTABLISHED**.
- **Gate**: Milestone 6.0 Review.

> [!CAUTION]
>
> ### STRICT ARCHITECTURAL GOVERNANCE RULE
>
> **Implementation must not begin until Milestone 6.0 is formally reviewed and approved.**
>
> No Prisma schema migrations, domain aggregates, application handlers, NestJS controllers, services, or frontend components for Phase 6 may be authored until the baseline and domain design milestones are officially signed off.
