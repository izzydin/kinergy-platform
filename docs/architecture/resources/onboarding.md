# Phase 6: Resources Management — Senior Engineer Onboarding & Architecture Navigation Guide

- **Status**: Authoritative Onboarding Baseline & Architecture Map
- **Target Audience**: Senior Software Engineers, Tech Leads, QA Architects, Engineering Managers
- **Document Owners**: Principal Architect, Resources Engineering Team
- **Context Location**: `docs/architecture/resources/`
- **Source Code Locations**:
  - Domain & Application Core: [`packages/core/src/resources/`](file:///c:/Projects/kinergy-platform/packages/core/src/resources/)
  - NestJS API & Controllers: [`apps/api/src/resources/`](file:///c:/Projects/kinergy-platform/apps/api/src/resources/)
  - React/Vite Frontend Module: [`apps/web/src/modules/resources/`](file:///c:/Projects/kinergy-platform/apps/web/src/modules/resources/)
- **Last Verified**: 2026-09-16 (Milestone 6.17 / Prompt 19)

---

## Table of Contents

1. [Executive Overview of Phase 6 Resources Management](#1-executive-overview-of-phase-6-resources-management)
2. [Where to Start: Role-Based Onboarding Paths](#2-where-to-start-role-based-onboarding-paths)
   - [Path A: Senior Backend Engineer](#path-a-senior-backend-engineer)
   - [Path B: Senior Frontend Engineer](#path-b-senior-frontend-engineer)
   - [Path C: Senior QA & Verification Engineer](#path-c-senior-qa--verification-engineer)
   - [Path D: Principal Architect & Tech Lead](#path-d-principal-architect--tech-lead)
3. [The Canonical 8-Stage Architecture Navigation Chain](#3-the-canonical-8-stage-architecture-navigation-chain)
   - [Stage 1: Architecture](#stage-1-architecture)
   - [Stage 2: Domain](#stage-2-domain)
   - [Stage 3: Business Rules](#stage-3-business-rules)
   - [Stage 4: API](#stage-4-api)
   - [Stage 5: Frontend](#stage-5-frontend)
   - [Stage 6: Testing](#stage-6-testing)
   - [Stage 7: ADRs](#stage-7-adrs)
   - [Stage 8: Traceability](#stage-8-traceability)
4. [Document Ownership & Governance Matrix](#4-document-ownership--governance-matrix)
5. [Architecture FAQ & Rapid Decision Finder](#5-architecture-faq--rapid-decision-finder)

---

## 1. Executive Overview of Phase 6 Resources Management

The **Resources Management Bounded Context** is the authoritative enterprise subsystem responsible for total operational visibility into everything the Kinergy facility owns, maintains, and consumes.

### Two Segregated Sub-Domains

Physical resources in wellness and sports clinics fall into two fundamentally segregated sub-domains governed by distinct lifecycles and invariants ([ADR-0081](file:///c:/Projects/kinergy-platform/docs/architecture/resources/adr/0081-resources-bounded-context-topology-and-domain-segregation.md), [ADR-0082](file:///c:/Projects/kinergy-platform/docs/architecture/resources/adr/0082-fixed-asset-domain-modeling-and-complete-segregation-from-inventory.md)):

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                        RESOURCES MANAGEMENT BOUNDED CONTEXT                           │
│                                                                                        │
│   ┌─────────────────────────────────────┐    ┌─────────────────────────────────────┐   │
│   │         Consumable Inventory        │    │             Fixed Assets            │   │
│   ├─────────────────────────────────────┤    ├─────────────────────────────────────┤   │
│   │ • Fungible Items (SKU-based)        │    │ • Non-Fungible Capital Property     │   │
│   │ • Depletion / Restock Lifecycle     │    │ • Operational Lifecycle State Mach. │   │
│   │ • Double-Entry Movement Ledger      │    │ • Maintenance & Servicing History   │   │
│   │ • High-Contention OCC Concurrency   │    │ • Low-Contention OCC State Changes  │   │
│   │ • Low-Stock Operational Attention   │    │ • Terminal Irreversible State (SOLD)│   │
│   │ • Weighted Unit Cost Valuation      │    │ • Acquisition & Carrying Valuation  │   │
│   └──────────────────┬──────────────────┘    └──────────────────┬──────────────────┘   │
│                      │                                          │                      │
│                      └────────────────────┬─────────────────────┘                      │
│                                           ▼                                            │
│                      ┌──────────────────────────────────────────┐                      │
│                      │   Resource Overview Read Synthesizer     │                      │
│                      │   (Executive Cockpit & Dual Valuation)   │                      │
│                      └──────────────────────────────────────────┘                      │
└────────────────────────────────────────────────────────────────────────────────────────┘
```

1. **Consumable Inventory**: High-volume, fungible supplies (therapeutic tape, electrodes, sanitizing wipes, supplements) tracked by numerical quantity on hand, reorder points, unit purchase costs, and an immutable double-entry movement ledger.
2. **Fixed Assets**: Low-volume, non-fungible capital property (commercial gym machines, clinical ultrasound units, treatment tables, facility fixtures) tracked by unique asset tags, serial numbers, operational states (`ACTIVE`, `UNDER_MAINTENANCE`, `DAMAGED`, `RETIRED`, `SOLD`), maintenance logs, and financial carrying values.
3. **Resource Overview**: An executive read-only aggregation providing unified KPI metrics, low-stock alerts, asset health distribution, and dual-permission valuation summaries.

---

## 2. Where to Start: Role-Based Onboarding Paths

Depending on your engineering focus, start with the curated onboarding sequence below before diving into code.

### Path A: Senior Backend Engineer

Goal: Safely author domain models, write application use cases, modify PostgreSQL persistence, or implement API endpoints.

1. **Read Domain Vocabulary**: [Resources Canonical Vocabulary](file:///c:/Projects/kinergy-platform/docs/business/resources-vocabulary.md) — Master the ubiquitous language (`quantityOnHand`, `assetTag`, `balanceAfter`).
2. **Understand Domain Rules**: [Executable Business Rules Specification](file:///c:/Projects/kinergy-platform/docs/architecture/resources/business-rules.md) — Review the 10 core invariant tiers and error policies.
3. **Master Concurrency**: [Concurrency Strategy & Stock Guarantees](file:///c:/Projects/kinergy-platform/docs/architecture/resources/concurrency-strategy.md) — Understand 3-tier defense-in-depth, OCC conditional updates, and race condition prevention.
4. **Inspect Persistence**: [Resources Persistence Architecture](file:///c:/Projects/kinergy-platform/docs/architecture/resources/persistence-strategy.md) — Review table topology, foreign key cascades, and check constraints.
5. **Review API Contracts**: [Authoritative API Reference](file:///c:/Projects/kinergy-platform/docs/architecture/resources/api-documentation.md) & [API Error Handling](file:///c:/Projects/kinergy-platform/docs/architecture/resources/api-error-handling.md).
6. **Code Anchor**: [`packages/core/src/resources/`](file:///c:/Projects/kinergy-platform/packages/core/src/resources/) and [`apps/api/src/resources/`](file:///c:/Projects/kinergy-platform/apps/api/src/resources/).

### Path B: Senior Frontend Engineer

Goal: Build new resource screens, extend tables/forms, modify query hooks, or customize modal dialogs.

1. **Review Frontend Architecture**: [Resources Frontend Architecture Specification](file:///c:/Projects/kinergy-platform/docs/architecture/resources/frontend-architecture.md) — Master the 5-pillar state separation (Server, URL, Local, Form, Validation).
2. **Understand UI Contracts**: [Frontend Engineering Principles](file:///c:/Projects/kinergy-platform/docs/frontend/principles.md) — 4-State UI contract (Loading, Empty, Error, Populated), zero business logic in shared components.
3. **Inspect API Contracts**: [Authoritative API Reference](file:///c:/Projects/kinergy-platform/docs/architecture/resources/api-documentation.md) — DTO schemas, query parameters, sorting/filtering conventions.
4. **Security & Permissions**: [Resources Authorization Model](file:///c:/Projects/kinergy-platform/docs/architecture/resources/authorization-model.md) — UI capability gates vs backend security boundary.
5. **Code Anchor**: [`apps/web/src/modules/resources/`](file:///c:/Projects/kinergy-platform/apps/web/src/modules/resources/).

### Path C: Senior QA & Verification Engineer

Goal: Audit test coverage, verify regression scenarios, reproduce edge cases, or write new multi-tier tests.

1. **Review Testing Pyramid**: [Testing Architecture & Verification Specification](file:///c:/Projects/kinergy-platform/docs/architecture/resources/testing-architecture.md) — The 6 testing tiers, proof vs non-proof boundaries.
2. **Inspect Scenarios A–H**: [Testing Architecture — Scenarios Section](file:///c:/Projects/kinergy-platform/docs/architecture/resources/testing-architecture.md#7-phase-617-scenarios-a-h-specification) — End-to-end multi-step business journeys.
3. **Trace Requirements to Tests**: [Canonical Traceability Matrix](file:///c:/Projects/kinergy-platform/docs/architecture/resources/traceability-matrix.md) — The 15 canonical capabilities mapped across all 5 architecture layers.
4. **Read Decision Rationale**: [ADR-0107: Multi-Tier Verification Strategy](file:///c:/Projects/kinergy-platform/docs/architecture/resources/adr/0107-phase-6-multi-tier-verification-architecture-and-proof-boundary-testing-strategy.md).
5. **Code Anchor**: [`packages/core/src/resources/test/`](file:///c:/Projects/kinergy-platform/packages/core/src/resources/test/) and [`apps/api/test/resources/`](file:///c:/Projects/kinergy-platform/apps/api/test/resources/).

### Path D: Principal Architect & Tech Lead

Goal: Evaluate cross-domain integrations, audit architectural decisions, or extend the system into Phase 7.

1. **Bounded Context Contract**: [Resources Bounded Context Specification](file:///c:/Projects/kinergy-platform/docs/architecture/contexts/resources.md) — Context topology, aggregate boundaries, ports & adapters.
2. **Cross-Domain Boundaries**: [Cross-Domain Integration Specification](file:///c:/Projects/kinergy-platform/docs/architecture/resources/cross-domain-integration.md) — Decoupled Client, deferred Scheduling, Sales port, IAM consuming.
3. **ADR Catalog**: [Phase 6 ADR Index](file:///c:/Projects/kinergy-platform/docs/architecture/resources/README.md#5-architectural-decision-records-adr-index) — Complete index of ADR-0081 through ADR-0107.
4. **Traceability & Governance**: [Phase 6 Traceability Matrix](file:///c:/Projects/kinergy-platform/docs/architecture/resources/traceability-matrix.md).

---

## 3. The Canonical 8-Stage Architecture Navigation Chain

Every senior engineer must understand how architectural intent cascades down to verifiable software. Navigate the documentation through this linear chain:

```
┌────────────────────────────────────────────────────────────────────────┐
│                        CANONICAL NAVIGATION CHAIN                      │
│                                                                        │
│   1. Architecture  ──►  Bounded Context, Aggregates, Context Map       │
│           │                                                            │
│           ▼                                                            │
│   2. Domain        ──►  Ubiquitous Language, Entities, Value Objects   │
│           │                                                            │
│           ▼                                                            │
│   3. Business Rules──►  Invariants, State Machines, Concurrency        │
│           │                                                            │
│           ▼                                                            │
│   4. API           ──►  Endpoints, DTOs, Validation, Error Handling    │
│           │                                                            │
│           ▼                                                            │
│   5. Frontend      ──►  Modules, State Taxonomy, 4-State UI, Forms     │
│           │                                                            │
│           ▼                                                            │
│   6. Testing       ──►  6-Tier Pyramid, Proof Boundaries, Scenarios    │
│           │                                                            │
│           ▼                                                            │
│   7. ADRs          ──►  Decision Records (ADR-0081 through ADR-0107)   │
│           │                                                            │
│           ▼                                                            │
│   8. Traceability  ──►  15 Capabilities Mapped Across All Layers       │
└────────────────────────────────────────────────────────────────────────┘
```

---

### Stage 1: Architecture

**What It Covers**: The bounded context topology, context mapping, Clean Architecture layer structure, and physical monorepo partitioning.

| Item                   | Reference Link                                                                                                                         | Key Architectural Concept                                     |
| :--------------------- | :------------------------------------------------------------------------------------------------------------------------------------- | :------------------------------------------------------------ |
| **Primary Spec**       | [Resources Bounded Context Specification](file:///c:/Projects/kinergy-platform/docs/architecture/contexts/resources.md)                | Authoritative boundaries, sub-domain split, Hexagonal ports   |
| **Architecture Hub**   | [Phase 6 Documentation Hub](file:///c:/Projects/kinergy-platform/docs/architecture/resources/README.md)                                | Complete master index and milestone gate approvals            |
| **Discovery Baseline** | [Phase 6 Architecture Discovery](file:///c:/Projects/kinergy-platform/docs/architecture/resources/phase-6-architecture-discovery.md)   | Reconnaissance baseline, monorepo constraints, design risks   |
| **Cross-Domain**       | [Cross-Domain Integration Specification](file:///c:/Projects/kinergy-platform/docs/architecture/resources/cross-domain-integration.md) | Integration contracts with IAM, Client, Scheduling, and Sales |

**Critical Architectural Invariants**:

- Zero monolithic "Resource" god-class; Consumable Inventory and Fixed Assets are strictly segregated ([ADR-0081](file:///c:/Projects/kinergy-platform/docs/architecture/resources/adr/0081-resources-bounded-context-topology-and-domain-segregation.md), [ADR-0082](file:///c:/Projects/kinergy-platform/docs/architecture/resources/adr/0082-fixed-asset-domain-modeling-and-complete-segregation-from-inventory.md)).
- Domain layer has **zero dependencies** on external frameworks, databases, NestJS, or Prisma.

---

### Stage 2: Domain

**What It Covers**: The ubiquitous language, domain models, entity aggregates, value objects, and ownership boundaries.

| Item                      | Reference Link                                                                                                                                     | Key Domain Concept                                               |
| :------------------------ | :------------------------------------------------------------------------------------------------------------------------------------------------- | :--------------------------------------------------------------- |
| **Domain Glossary**       | [Resources Canonical Vocabulary](file:///c:/Projects/kinergy-platform/docs/business/resources-vocabulary.md)                                       | Canonical ubiquitous language, entity taxonomy, movements        |
| **Domain Models**         | [Domain Model Specification](file:///c:/Projects/kinergy-platform/docs/architecture/resources/domain-model.md)                                     | Aggregate roots, value objects, factory methods, state rules     |
| **Fixed Asset Domain**    | [Fixed Asset Domain Model Specification](file:///c:/Projects/kinergy-platform/docs/architecture/resources/asset-domain-model.md)                   | Capital property aggregate, maintenance history, serial tracking |
| **Responsibility Matrix** | [Entity Responsibility Matrix & Placement Guide](file:///c:/Projects/kinergy-platform/docs/architecture/resources/entity-responsibility-matrix.md) | Aggregate root ownership, mutation entry points, anti-patterns   |

**Key Domain Entities**:

- `InventoryItem`: Aggregate root for consumable goods; encapsulates `quantityOnHand`, `reorderThreshold`, and unit cost.
- `StockMovement`: Immutable child entity representing double-entry stock transactions (`PURCHASE`, `SALE`, `CONSUMPTION`, `ADJUSTMENT`, `TRANSFER`).
- `FixedAsset`: Aggregate root for durable capital property; encapsulates `assetTag`, operational status, and condition grade.
- `AssetMaintenanceRecord`: Immutable historical servicing record linked to a fixed asset.

---

### Stage 3: Business Rules

**What It Covers**: Deterministic invariants, state transition rules, concurrency guarantees, audit preservation, and security models.

| Item                     | Reference Link                                                                                                                      | Key Business Rule Concept                                        |
| :----------------------- | :---------------------------------------------------------------------------------------------------------------------------------- | :--------------------------------------------------------------- |
| **Canonical Rules**      | [Executable Business Rules Specification](file:///c:/Projects/kinergy-platform/docs/architecture/resources/business-rules.md)       | 10 invariant tiers, low-stock equality case, valuation math      |
| **Asset State Machine**  | [Fixed Asset Status State Machine](file:///c:/Projects/kinergy-platform/docs/architecture/resources/asset-status-state-machine.md)  | 5x5 transition matrix, confirmation rules, `SOLD` terminal state |
| **Concurrency Strategy** | [Concurrency Strategy & Stock Guarantees](file:///c:/Projects/kinergy-platform/docs/architecture/resources/concurrency-strategy.md) | 3-layer defense, OCC versioning, atomic stock checks             |
| **Audit & History**      | [Audit & History Strategy](file:///c:/Projects/kinergy-platform/docs/architecture/resources/audit-and-history-strategy.md)          | Current state vs historical ledger, immutable history            |
| **Authorization Model**  | [Resources Authorization Model](file:///c:/Projects/kinergy-platform/docs/architecture/resources/authorization-model.md)            | RBAC permissions, sensitive valuation access, security boundary  |

**Non-Negotiable Business Rules**:

1. **[INV-RULE-1] Non-Negative Stock**: Stock balances must never drop below zero under any circumstance.
2. **[INV-RULE-2] Low-Stock Condition**: Low-stock status triggers when $\text{quantityOnHand} \le \text{reorderThreshold}$ (strict $\le$).
3. **[AST-RULE-1] Terminal SOLD State**: Once an asset enters `SOLD`, it cannot transition to any other state or be mutated.
4. **[SEC-RULE-1] Security Boundary**: Frontend permission checks are UX enhancements; backend guards are the only security boundary.

---

### Stage 4: API

**What It Covers**: Public HTTP REST contracts, DTO schemas, query conventions, pagination, sorting, and error pipelines.

| Item                  | Reference Link                                                                                                                           | Key API Concept                                               |
| :-------------------- | :--------------------------------------------------------------------------------------------------------------------------------------- | :------------------------------------------------------------ |
| **API Reference**     | [Authoritative API Reference & Contract](file:///c:/Projects/kinergy-platform/docs/architecture/resources/api-documentation.md)          | Endpoints, query params, DTO payloads, response envelopes     |
| **Error Handling**    | [Resources API Error & Failure Specification](file:///c:/Projects/kinergy-platform/docs/architecture/resources/api-error-handling.md)    | 4-tier error pipeline, domain exceptions to HTTP mapping      |
| **Query Conventions** | [Resource API Query Conventions](file:///c:/Projects/kinergy-platform/docs/architecture/resources/resource-api-query-conventions.md)     | Pagination (`page`, `pageSize`), multi-column sorting, search |
| **Controller Arch**   | [Resource Controller Architecture](file:///c:/Projects/kinergy-platform/docs/architecture/resources/resource-controller-architecture.md) | Thin controller pattern, CQRS command bus dispatching         |

**Key API Routes**:

- Consumable Inventory: `/api/v1/resources/inventory/items` (CRUD, movements, restock, consume, audit)
- Fixed Assets: `/api/v1/resources/assets` (CRUD, status transitions, transfers, maintenance logs)
- Resource Overview: `/api/v1/resources/overview` (Synthesized dashboard, alerts, aggregate valuation)

---

### Stage 5: Frontend

**What It Covers**: Client application module architecture, state taxonomy, 4-state UI contracts, accessibility, and form validation.

| Item                  | Reference Link                                                                                                                                                               | Key Frontend Concept                                          |
| :-------------------- | :--------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :------------------------------------------------------------ |
| **Frontend Spec**     | [Resources Frontend Architecture Specification](file:///c:/Projects/kinergy-platform/docs/architecture/resources/frontend-architecture.md)                                   | Module boundaries, 5-pillar state separation, screen playbook |
| **Engineering Rules** | [Frontend Engineering Principles](file:///c:/Projects/kinergy-platform/docs/frontend/principles.md)                                                                          | 4-state UI contract, zero business logic in shared components |
| **State Taxonomy**    | [Frontend State Management Architecture](file:///c:/Projects/kinergy-platform/docs/frontend/state-management.md)                                                             | TanStack Query, URL state, React Hook Form, ephemeral state   |
| **Modal Policy**      | [ADR-0103: Frontend Modal Interaction Policy](file:///c:/Projects/kinergy-platform/docs/architecture/resources/adr/0103-frontend-modal-interaction-and-safe-focus-policy.md) | Safe focus traps, accessibility, optimistic mutation rollback |

**5-Pillar State Separation**:

```
Server State     ──►  TanStack Query (cached, server-synchronized, invalidated on mutation)
URL State        ──►  React Router SearchParams (search, filters, page, sorting)
Local State      ──►  React useState (modals, dropdown toggles, ephemeral UI)
Form State       ──►  React Hook Form (uncontrolled inputs, dirty checks, submit triggers)
Validation State ──►  Zod Schemas (shared schema validation before network dispatch)
```

---

### Stage 6: Testing

**What It Covers**: The multi-tier testing pyramid, proof boundaries, automated test suites, and End-to-End business scenarios A–H.

| Item                 | Reference Link                                                                                                                                                                                              | Key Testing Concept                                       |
| :------------------- | :---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :-------------------------------------------------------- |
| **Testing Spec**     | [Testing Architecture & Verification Specification](file:///c:/Projects/kinergy-platform/docs/architecture/resources/testing-architecture.md)                                                               | 6-tier testing pyramid, proof boundaries, Scenarios A–H   |
| **Backend Baseline** | [Backend Testing Baseline & Gap Analysis](file:///c:/Projects/kinergy-platform/docs/architecture/resources/backend-testing-baseline.md)                                                                     | 48 test suites, 730 tests baseline, coverage requirements |
| **Valuation Tests**  | [Resource Valuation Testing Specification](file:///c:/Projects/kinergy-platform/docs/architecture/resources/resource-valuation-testing.md)                                                                  | Precision verification, dual-permission valuation tests   |
| **Testing ADR**      | [ADR-0107: Multi-Tier Verification Strategy](file:///c:/Projects/kinergy-platform/docs/architecture/resources/adr/0107-phase-6-multi-tier-verification-architecture-and-proof-boundary-testing-strategy.md) | Architectural decision record for verification boundaries |

**The 6 Testing Layers**:

1. **Domain Unit Tests**: Pure invariant checks (`InventoryItem`, `FixedAsset`, state machine).
2. **Application Use Case Tests**: Orchestration, mock repositories, transactional boundaries.
3. **Integration Persistence Tests**: Prisma, PostgreSQL constraints, OCC rollback proofs.
4. **API Controller & E2E Tests**: HTTP pipeline, validation pipes, guards, response envelopes.
5. **Frontend Component & Hook Tests**: 4-state contract, React Hook Form, TanStack Query cache.
6. **Business Scenario Tests**: Scenarios A–H multi-step business journeys.

---

### Stage 7: ADRs

**What It Covers**: The 27 Architectural Decision Records governing Phase 6, from topology segregation (ADR-0081) to multi-tier verification (ADR-0107).

| Item                      | Reference Link                                                                                                                                                                                              | Key Decision Scope                            |
| :------------------------ | :---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :-------------------------------------------- |
| **ADR Master Index**      | [Phase 6 ADR Index](file:///c:/Projects/kinergy-platform/docs/architecture/resources/README.md#5-architectural-decision-records-adr-index)                                                                  | Directory of all 27 accepted decision records |
| **Platform ADR Hub**      | [Platform ADR Directory Index](file:///c:/Projects/kinergy-platform/docs/adr/README.md)                                                                                                                     | Enterprise ADR directory (0001 through 0107)  |
| **Key ADR: Topology**     | [ADR-0081: Resources Sub-Domain Segregation](file:///c:/Projects/kinergy-platform/docs/architecture/resources/adr/0081-resources-bounded-context-topology-and-domain-segregation.md)                        | Segregation of inventory and capital assets   |
| **Key ADR: Ledger**       | [ADR-0083: Inventory Movement Ledger](file:///c:/Projects/kinergy-platform/docs/architecture/resources/adr/0083-inventory-movement-ledger-and-materialized-stock-mutation-strategy.md)                      | Double-entry append-only ledger pattern       |
| **Key ADR: Concurrency**  | [ADR-0084: Inventory Concurrency Control](file:///c:/Projects/kinergy-platform/docs/architecture/resources/adr/0084-inventory-concurrency-control-and-race-condition-prevention.md)                         | OCC and race condition defense                |
| **Key ADR: Cross-Domain** | [ADR-0104: Resources Cross-Domain Decoupling](file:///c:/Projects/kinergy-platform/docs/architecture/resources/adr/0104-resources-cross-domain-decoupling-and-client-boundary-invariant.md)                 | Client independence invariant                 |
| **Key ADR: Verification** | [ADR-0107: Multi-Tier Verification Strategy](file:///c:/Projects/kinergy-platform/docs/architecture/resources/adr/0107-phase-6-multi-tier-verification-architecture-and-proof-boundary-testing-strategy.md) | Proof vs non-proof testing boundaries         |

---

### Stage 8: Traceability

**What It Covers**: The canonical, authoritative matrix verifying that all 15 business capabilities trace directly from requirements through domain rules, application use cases, REST endpoints, frontend screens, to automated tests.

| Item                    | Reference Link                                                                                                           | Key Traceability Scope                           |
| :---------------------- | :----------------------------------------------------------------------------------------------------------------------- | :----------------------------------------------- |
| **Traceability Matrix** | [Canonical Traceability Matrix](file:///c:/Projects/kinergy-platform/docs/architecture/resources/traceability-matrix.md) | Complete 15-capability unbroken chain of custody |

**Unbroken Traceability Chain Structure**:
$$\text{Requirement} \longrightarrow \text{Domain Rule} \longrightarrow \text{Use Case} \longrightarrow \text{API Endpoint} \longrightarrow \text{Frontend Feature} \longrightarrow \text{Automated Test}$$

---

## 4. Document Ownership & Governance Matrix

To prevent documentation decay and resolve ambiguities about document authority, the following governance matrix assigns document ownership:

| Document Name                                                                                                                             | Governed Architecture Layer           | Target Audience               | Owner / Maintainer              | Authority Level               |
| :---------------------------------------------------------------------------------------------------------------------------------------- | :------------------------------------ | :---------------------------- | :------------------------------ | :---------------------------- |
| [`contexts/resources.md`](file:///c:/Projects/kinergy-platform/docs/architecture/contexts/resources.md)                                   | Bounded Context & System Architecture | All Engineers, Architects     | Principal Software Architect    | Authoritative System Baseline |
| [`resources-vocabulary.md`](file:///c:/Projects/kinergy-platform/docs/business/resources-vocabulary.md)                                   | Domain Ubiquitous Language            | All Engineers, Product Owners | Domain Lead / Tech Lead         | Canonical Vocabulary          |
| [`domain-model.md`](file:///c:/Projects/kinergy-platform/docs/architecture/resources/domain-model.md)                                     | Domain Entities & Aggregates          | Backend Engineers             | Senior Domain Engineer          | Authoritative Domain Spec     |
| [`business-rules.md`](file:///c:/Projects/kinergy-platform/docs/architecture/resources/business-rules.md)                                 | Domain Invariants & Rules             | Backend & QA Engineers        | Senior Domain Engineer          | Executable Rule Contract      |
| [`concurrency-strategy.md`](file:///c:/Projects/kinergy-platform/docs/architecture/resources/concurrency-strategy.md)                     | Concurrency & Data Integrity          | Backend & DB Engineers        | Backend Tech Lead               | Authoritative Guarantee Spec  |
| [`audit-and-history-strategy.md`](file:///c:/Projects/kinergy-platform/docs/architecture/resources/audit-and-history-strategy.md)         | Audit Trails & Event History          | Backend & Compliance          | Senior Backend Engineer         | Authoritative Audit Spec      |
| [`authorization-model.md`](file:///c:/Projects/kinergy-platform/docs/architecture/resources/authorization-model.md)                       | RBAC & API Security                   | Security & Backend Engineers  | Security Lead / Tech Lead       | Security Contract             |
| [`cross-domain-integration.md`](file:///c:/Projects/kinergy-platform/docs/architecture/resources/cross-domain-integration.md)             | Inter-Context Boundaries              | All Engineers, Architects     | Principal Software Architect    | Integration Contract          |
| [`api-documentation.md`](file:///c:/Projects/kinergy-platform/docs/architecture/resources/api-documentation.md)                           | REST HTTP Contracts & DTOs            | Backend & Frontend Engineers  | API Guild / Backend Lead        | Public Interface Contract     |
| [`api-error-handling.md`](file:///c:/Projects/kinergy-platform/docs/architecture/resources/api-error-handling.md)                         | Exception Pipeline & HTTP Mapping     | Backend & Frontend Engineers  | API Guild                       | Error Handling Standard       |
| [`frontend-architecture.md`](file:///c:/Projects/kinergy-platform/docs/architecture/resources/frontend-architecture.md)                   | UI Modules, State & Forms             | Frontend Engineers            | Frontend Tech Lead              | Authoritative Frontend Spec   |
| [`testing-architecture.md`](file:///c:/Projects/kinergy-platform/docs/architecture/resources/testing-architecture.md)                     | Testing Pyramid & Scenarios           | QA & All Engineers            | Test Automation Lead            | Authoritative Test Strategy   |
| [`traceability-matrix.md`](file:///c:/Projects/kinergy-platform/docs/architecture/resources/traceability-matrix.md)                       | Requirement-to-Test Mapping           | Architects, QA, Auditors      | Lead Architect & QA Lead        | Canonical Audit Matrix        |
| [`adr/0081..0107`](file:///c:/Projects/kinergy-platform/docs/architecture/resources/README.md#5-architectural-decision-records-adr-index) | Architectural Decisions               | Entire Engineering Org        | Architecture Review Board (ARB) | Permanent Decision Log        |

---

## 5. Architecture FAQ & Rapid Decision Finder

Quick answers to common senior engineer questions without searching the codebase:

### Q1: How does Kinergy guarantee that inventory stock never goes negative under concurrent sales?

**Answer**: Through a 3-layer defense-in-depth architecture:

1. **Domain Layer**: `InventoryItem.recordMovement()` checks $Q_{\text{current}} - \Delta \ge 0$; throws `InsufficientStockException` if breached.
2. **Application / Database Layer**: Optimistic Concurrency Control (OCC) executes `UPDATE ... WHERE id = :id AND version = :version`. If another transaction changed the balance, version mismatch triggers rollback and retry.
3. **Database Constraint**: PostgreSQL `CHECK (quantity_on_hand >= 0)` constraint serves as the final, immutable safety net.  
   _Read Full Spec_: [Concurrency Strategy & Stock Guarantees](file:///c:/Projects/kinergy-platform/docs/architecture/resources/concurrency-strategy.md) & [ADR-0084](file:///c:/Projects/kinergy-platform/docs/architecture/resources/adr/0084-inventory-concurrency-control-and-race-condition-prevention.md).

### Q2: Why don't Fixed Assets reference Client or Patient records?

**Answer**: By deliberate domain segregation invariant **[AST-INV-4]** ([ADR-0104](file:///c:/Projects/kinergy-platform/docs/architecture/resources/adr/0104-resources-cross-domain-decoupling-and-client-boundary-invariant.md)). Assets are physical capital equipment owned by the enterprise. Associating patients with assets would violate HIPAA/GDPR data minimization and create tight coupling across bounded contexts. Clinical interactions are recorded in the Kinesiology context (`TreatmentSession`), not on the asset entity.  
_Read Full Spec_: [Cross-Domain Integration Specification](file:///c:/Projects/kinergy-platform/docs/architecture/resources/cross-domain-integration.md).

### Q3: Why is Fixed Asset state `SOLD` irreversible?

**Answer**: Under rule **[AST-INV-1]** ([ADR-0085](file:///c:/Projects/kinergy-platform/docs/architecture/resources/adr/0085-fixed-asset-operational-lifecycle-state-machine-and-terminal-disposal-policy.md)), `SOLD` represents external ownership transfer. Once sold, the asset no longer belongs to the facility; allowing subsequent status or maintenance updates would corrupt historical accounting records.  
_Read Full Spec_: [Fixed Asset Status State Machine](file:///c:/Projects/kinergy-platform/docs/architecture/resources/asset-status-state-machine.md).

### Q4: How is sensitive financial valuation protected in API responses?

**Answer**: Under policy **[VAL-AUTH-1]** ([ADR-0095](file:///c:/Projects/kinergy-platform/docs/architecture/resources/adr/0095-resource-sensitive-valuation-data-access-and-response-shaping-policy.md)), valuation endpoints require specific permissions (`resources:inventory:read` AND `resources:asset:read` for combined valuation). In standard list endpoints, sensitive monetary fields (`purchaseCostAmount`, `totalCarryingValue`) are redacted or omitted unless the caller possesses financial read privileges.  
_Read Full Spec_: [Resources Authorization Model](file:///c:/Projects/kinergy-platform/docs/architecture/resources/authorization-model.md).

### Q5: How do frontend components handle loading, error, empty, and populated states?

**Answer**: Every feature screen adheres to the **4-State UI Contract** ([Frontend Engineering Principles](file:///c:/Projects/kinergy-platform/docs/frontend/principles.md)). Components must render dedicated, accessible UI states for `isLoading`, `isError` (with retry action), `isEmpty` (actionable empty state), and populated data table/view. Business logic must never reside in shared presentation primitives.  
_Read Full Spec_: [Resources Frontend Architecture](file:///c:/Projects/kinergy-platform/docs/architecture/resources/frontend-architecture.md).

### Q6: Where is the authoritative proof that an automated test exists for Scenario D (Atomic Sale Rejection)?

**Answer**: Consult the canonical Traceability Matrix: Row 5 ("Invalid sale rejected atomically") maps directly to domain invariant `[INV-INV-1]`, use case `RecordStockMovementUseCase`, endpoint `POST /api/v1/resources/inventory/items/:id/movements`, and test `apps/api/test/resources/inventory-movements.e2e-spec.ts`.  
_Read Full Spec_: [Phase 6 Traceability Matrix](file:///c:/Projects/kinergy-platform/docs/architecture/resources/traceability-matrix.md).
