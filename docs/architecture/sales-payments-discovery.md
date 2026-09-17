# Phase 7: Sales & Payments — Architectural Discovery & Baseline Report

- **Document**: `docs/architecture/sales-payments-discovery.md`
- **Milestone**: Phase 7.0 — Architectural Reconnaissance & Discovery
- **Status**: Complete Discovery & Baseline
- **Role**: Principal Software Architect / Staff Platform Engineer
- **Date**: 2026-09-17

---

## 1. Executive Summary & Context

This discovery report establishes the authoritative architectural baseline for **Phase 7: Sales & Payments** of the **Kinergy Platform**.

Kinergy is a modular Health & Wellness Business Management Platform designed to support:

- Kinesiology & clinical rehabilitation treatments (Phase 4)
- Gym memberships, plans, and turnstile access (Phase 5)
- Resource management: Consumable inventory & fixed capital assets (Phase 6)
- Healthy meals, drinks, and wellness consumables (Phase 6)
- Client relationship management & longitudinal timelines (Phase 2)
- Unified Identity & Access Management (Phase 1)
- Future multi-branch operations and SaaS expansion

### Business Goal for Phase 7

> **"Centralize every financial transaction without allowing the Sales domain to corrupt ownership of other bounded contexts."**

Phase 7 must ingest financial transactions originating from diverse sources:

1. **Consumable Inventory**: Healthy meals, protein shakes, wellness drinks, clinical tape, supplements.
2. **Gym Management**: Membership plan subscriptions, renewals, visit passes, sign-up fees.
3. **Kinesiology / Treatments**: Clinical treatment sessions, therapy evaluations, specialized treatments.
4. **Future Products & Services**: Facility room rentals, workshops, custom fees, gift cards.

In accordance with Kinergy's engineering governance, **Milestone 7.0 is pure architectural discovery**. No production code, Prisma models, controllers, services, DTOs, or speculative abstractions have been created. This document synthesizes the existing architecture and establishes the precise constraints, integration mechanisms, and decisions required for Phase 7.

---

## 2. Existing Architecture Summary

### 2.1 Monorepo Topology

The platform is organized as an **Nx integrated monorepo** managed with **pnpm** and **strict TypeScript**:

- `apps/api`: NestJS 10 REST API application host and dependency injection composition root.
- `apps/web`: React 18 + Vite 5 SPA host with TanStack Query and Radix UI primitives.
- `modules/client`: Standalone Client Management bounded context package.
- `packages/core`: Core domain library containing pure domain models, aggregates, and application CQRS handlers for `scheduling`, `kinesiology`, `gym`, and `resources`.
- `packages/config`: Zod-validated application environment configuration.
- `packages/testing`: Testing harnesses, mock factories, in-memory repository fakes.
- `packages/types`: Core ambient types (`Result<T, E>`, `Nullable<T>`, `Optional<T>`, `EntityId`).
- `packages/ui`: Shared UI component primitives and styling tokens.
- `packages/utils`: Shared pure utility functions.
- `packages/validation`: Shared input sanitization and Zod validation schemas.
- `prisma`: PostgreSQL schema (`schema.prisma`), append-only migrations, idempotent seeders.

### 2.2 Architectural Layering & Invariants

Every bounded context adheres to strict **Clean / Hexagonal Architecture**:

1. **Domain Layer (`packages/core/src/<context>/domain/`)**:
   - **100% Pure TypeScript**: Zero imports of `@nestjs/*`, `@prisma/*`, Express, or foreign context aggregates.
   - Aggregates encapsulate state mutations behind intention-revealing methods (e.g. `membership.renew()`, `inventoryItem.sellStock()`).
   - Domain invariants throw domain-specific exceptions extending standard Error (e.g. `NegativeStockException`, `MembershipPlanInvariantViolationException`).
   - Optimistic Concurrency Control (OCC) is enforced on all aggregate roots via integer `version` fields.
2. **Application Layer (`packages/core/src/<context>/application/`)**:
   - CQRS Command Handlers and Query Handlers orchestrate business use cases.
   - Returns structured `ApplicationResult<T, E>` or `Result<T, E>` with zero framework leakage.
   - Declares output ports (interfaces) for repositories, event publishers, and external bounded context capability contracts.
3. **Infrastructure Layer (`packages/core/src/<context>/infrastructure/`)**:
   - Implements domain repository interfaces using Prisma ORM (`Prisma<Aggregate>Repository`).
   - Bidirectional mappers (`<Aggregate>Mapper.toDomain()` and `toPersistence()`) isolate relational columns from domain models.
4. **Presentation Layer (`apps/api/src/<context>/`)**:
   - NestJS Controllers expose versioned REST endpoints (`/api/v1/...`).
   - Guard-based security pipeline (`AuthenticationGuard`, `AuthorizationGuard`).
   - Declarative RBAC decorators (`@Permissions(...)`, `@Roles(...)`, `@CurrentUser()`).
   - Swagger / OpenAPI annotations (`@ApiTags`, `@ApiOperation`, `@ApiResponse`).
   - Input sanitization and validation via `GlobalSanitizationValidationPipe`.

---

## 3. Relevant Bounded Contexts

| Bounded Context                        | Location                          | Core Entities & Models                                                              | Phase 7 Sales & Payments Relationship                                                                                                                         |
| :------------------------------------- | :-------------------------------- | :---------------------------------------------------------------------------------- | :------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Identity & Access Management (IAM)** | `apps/api/src/platform/identity/` | `User`, `Role`, `Permission`, `RefreshToken`                                        | **Upstream Supplier**: Authenticates sales actors (cashier, receptionist, admin); provides `userId` and `tenantId`; enforces permissions.                     |
| **Client Management**                  | `modules/client/`                 | `Client`, `ClientTimelineEntry`, `IClientFacade`                                    | **Upstream Supplier / Downstream Projection**: Provides client lookup and identity verification; receives sale/payment events for client timeline projection. |
| **Resources Management (Inventory)**   | `packages/core/src/resources/`    | `InventoryItem`, `StockMovement`, `FixedAsset`, `InventoryStockDecrementPort`       | **Peer Service & Stock Custodian**: Sells physical consumables; deducts stock via `InventoryStockDecrementPort`; records `SALE` movements.                    |
| **Gym Management**                     | `packages/core/src/gym/`          | `Membership`, `MembershipPlan`, `AttendanceRecord`, `PlanPrice`                     | **Peer Service**: Sells membership plans and renewals; activates membership periods upon verified payment.                                                    |
| **Kinesiology / Treatments**           | `packages/core/src/kinesiology/`  | `TreatmentSession`, `SessionNotes` (SOAP)                                           | **Peer Service**: Clinical treatment sessions billed or settled through sales transactions.                                                                   |
| **Scheduling**                         | `packages/core/src/scheduling/`   | `Appointment`, `RecurrenceSeries`, `Room`                                           | **Peer Service**: Appointments linked to treatment sessions or bookable services being paid.                                                                  |
| **Enterprise Platform**                | `apps/api/src/platform/`          | `PrismaService`, `PlatformLoggerService`, `IAuditService`, `SecurityEventPublisher` | **Cross-Cutting Infrastructure**: Provides persistence, audit logging, and security telemetry.                                                                |

---

## 4. Existing Aggregate Patterns

Across previous phases (Client, Scheduling, Kinesiology, Gym, Resources), aggregates consistently exhibit the following structural patterns:

1. **Explicit Typed Identifiers**:
   - Aggregates use string/UUID-based typed identifiers (`EntityId` or specialized Value Objects like `PlanId`, `InventoryItemId`).
2. **Factory Creation & Reconstitution Methods**:
   - `public static create(props)` for initial business creation (assigns new UUID, sets `version = 1`, validates invariants, sets `createdAt`/`updatedAt`).
   - `public static reconstitute(props)` or `toDomain()` for hydration from persistence without triggering creation side-effects.
3. **Encapsulated State Mutation**:
   - Private constructor and private fields with public getters. No arbitrary property setters.
   - All state mutations execute through domain methods that validate state transitions against domain rules.
4. **Optimistic Concurrency Control (OCC)**:
   - Aggregates contain `version: number`.
   - Repository persistence updates check `WHERE id = :id AND version = :version` and increment version on commit.
   - Version mismatch throws `OptimisticLockException` (mapped to `HTTP 409 Conflict`).
5. **Domain Event Recording**:
   - Aggregates maintain an internal list of uncommitted domain events (`pullDomainEvents()` / `clearDomainEvents()`).
6. **Persistence Separation**:
   - Aggregates have zero knowledge of Prisma, SQL, or relational table schemas.
   - Mappers explicitly map between domain aggregates and Prisma model payloads.

---

## 5. Existing Authorization Patterns

1. **Guard Pipeline**:
   - Every protected route applies `@UseGuards(AuthenticationGuard, AuthorizationGuard)`.
   - `AuthenticationGuard`: Validates JWT Bearer access token, extracts `userId`, `tenantId`, `role`, and `permissions`, attaching `AuthenticatedUserContext` to request.
   - `AuthorizationGuard`: Validates permissions and roles against endpoint metadata.
2. **Pre-Existing Billing Permissions**:
   - The platform permission catalog (`prisma/seeds/identity.seed.ts`) already reserves the `Billing` namespace:
     - `billing.read`: _"View invoices and payment history"_
     - `billing.write`: _"Process payments and issue invoices"_
   - Pre-assigned roles in `identity.seed.ts`:
     - `Owner`: Receives all permissions (including `billing.read`, `billing.write`).
     - `Receptionist`: Assigned `billing.read` and `billing.write` alongside client and appointment management.
3. **Multi-Tenancy Enforcement**:
   - Every request context carries `tenantId`. Handlers filter and persist data scoped to `tenantId`.
   - Multi-tenant isolation is verified by integration security tests.
4. **Object-Level / Least-Privilege Policies**:
   - Seen in Gym `TrainerAccessPolicy`: Trainers are prohibited from viewing commercial plan prices or billing details.
   - Phase 7 must ensure commercial sales data is masked or restricted from unauthorized clinical staff.

---

## 6. Existing Audit & History Patterns

1. **Immutable Append-Only Audit Ledgers**:
   - **Consumable Inventory**: Every stock balance change writes an immutable row to `stock_movements` (`movement_type`, `quantity_delta`, `balance_after`, `unit_cost_amount`, `reason`, `recorded_by_user_id`, `reference_id`, `recorded_at`).
   - **Fixed Assets**: Every lifecycle mutation writes an immutable row to `asset_history_events` (`event_type`, `description`, `details`, `recorded_by_user_id`, `recorded_at`).
   - **Gym**: Every turnstile check-in writes to `attendance_records` (`method`, `result`, `check_in_time`, `gym_day`, `gate_id`).
   - **Client**: Cross-module milestones append to `client_timeline_entries` (`source_module`, `event_type`, `summary`, `metadata`, `occurred_at`).
2. **Audit Attribution**:
   - Every historical event captures:
     - Timestamp (`recordedAt` / `occurredAt`)
     - Actor identifier (`recordedByUserId` / `actorId`)
     - Reason / Description (`reason` / `summary`)
     - Source Reference (`referenceId`)
3. **Platform Audit Hook**:
   - Security-sensitive actions emit structured audit events via `SecurityEventPublisher` or `IAuditService`.

---

## 7. Existing Financial & Monetary Concepts

### 7.1 The `Money` Value Object

In Phase 6, the platform established the canonical `Money` value object:

- **Location**: `packages/core/src/resources/domain/shared/value-objects/money.vo.ts`
- **Specification**:
  - `amount: number`: Non-negative finite number, rounded to 2 decimal places (integer cents / hundredths: `Math.round(amount * 100) / 100`).
  - `currency: string`: Normalized uppercase 3-letter ISO-4217 code (default `'USD'`).
  - Immutable (`Object.freeze`).
  - Arithmetic operations: `add(other)`, `subtract(other)`, `multiply(factor)`.
  - Invariants: Currency match required for addition/subtraction; negative results throw `InvalidMoneyException`.
  - Zero factory: `Money.zero(currency)`.

### 7.2 Pre-Existing Gym `PlanPrice`

- **Location**: `packages/core/src/gym/domain/plan/plan-price.vo.ts`
- **Specification**: Encapsulates `amount` (non-negative, 2 decimals) and `currency` (ISO-4217), with `isFree()` helper. Throws `MembershipPlanInvariantViolationException`.

### 7.3 Relational Persistence Representation

In `prisma/schema.prisma`, monetary amounts are consistently stored as:

- `amount`: `Decimal @db.Decimal(10, 2)` (e.g. `purchase_cost_amount`, `selling_price_amount`, `price_amount`, `purchase_value_amount`).
- `currency`: `String @default("USD")` (e.g. `purchase_cost_currency`, `selling_price_currency`, `price_currency`).

### 7.4 On-Demand Valuation vs Stored Totals

A fundamental platform financial law established in Phase 6:

> **Aggregate monetary totals are NEVER stored as persisted columns in database tables.**
> All balances and financial valuations are computed dynamically on-demand using exact integer-cents arithmetic to prevent state/financial drift.

### 7.5 Pre-Existing Sales Capability Port in Resources

Phase 6 anticipated commercial sales and implemented the application boundary port:

- **File**: `packages/core/src/resources/application/ports/inventory-stock-decrement.port.ts`
- **Method**: `sellStock(params: DecrementStockParams): Promise<ApplicationResult<StockMutationResultDTO>>`
- **Contract**: Allows external commercial callers (e.g. Phase 7 Sales) to deduct inventory stock, verify availability, and log a `SALE` movement with external `referenceId` without direct database access.

---

## 8. Existing Cross-Domain Reference Patterns

A core principle established across all phases:

```
Bounded Context A                              Bounded Context B
┌─────────────────────────┐                    ┌─────────────────────────┐
│ Aggregate Root A        │                    │ Aggregate Root B        │
│                         │                    │                         │
│ - targetId: string  ────┼─── Scalar UUID ────┼──► - id: string         │
│   (No DB Foreign Key)   │                    │                         │
└─────────────────────────┘                    └─────────────────────────┘
```

1. **Scalar Identifiers Only**:
   - Foreign entities are referenced strictly by unconstrained scalar string UUIDs (`clientId: string`, `therapistId: string`, `planId: string`, `itemId: string`, `referenceId: string`).
2. **Zero Cross-Context Foreign Keys in Database**:
   - `prisma/schema.prisma` enforces database foreign keys ONLY within the same bounded context.
   - Tables across bounded contexts (e.g. `treatment_sessions` to `appointments`, `memberships` to `clients`, `stock_movements` to `clients`) have **zero relational foreign key constraints**.
3. **Zero Aggregate Nesting**:
   - Domain aggregates never import or hold references to domain aggregates of another context.
4. **Integration Facades and Ports**:
   - Synchronous read-only lookups use injected facade interfaces (e.g. `IClientFacade` via `CLIENT_FACADE_TOKEN`).
   - Synchronous mutation requests use application capability ports (e.g. `InventoryStockDecrementPort`).
   - Asynchronous notifications use domain/integration events (e.g. `ClientTimelineEntry`).

---

## 9. Existing Prisma Conventions

1. **Model Naming**: PascalCase for Prisma models (`InventoryItem`, `StockMovement`, `FixedAsset`, `Membership`, `Client`).
2. **Table Mappings**: Snake_case table names using `@@map("table_names")` (e.g. `@@map("inventory_items")`, `@@map("stock_movements")`).
3. **Column Mappings**: Snake_case database column names using `@map("column_name")` with camelCase TypeScript model fields (e.g. `quantityOnHand Decimal @map("quantity_on_hand")`).
4. **Index Strategy**:
   - Index on `tenant_id` for multi-tenant isolation.
   - Unique constraints on business codes (`sku`, `code`, `asset_tag`).
   - Compound indices for frequent queries (`[tenant_id, status]`, `[client_id, occurred_at(sort: Desc)]`).
5. **Audit Columns**:
   - `createdAt DateTime @default(now()) @map("created_at")`
   - `updatedAt DateTime @updatedAt @map("updated_at")`
6. **Optimistic Locking**:
   - `version Int @default(1) @map("version")`

---

## 10. Existing API Conventions

1. **Routing & Versioning**: Prefixed with `/api/v1/...` (e.g. `/api/v1/resources/inventory`, `/api/v1/gym/memberships`).
2. **Standard HTTP Status Codes**:
   - `200 OK`: Successful reads, queries, and idempotent state updates.
   - `201 Created`: Resource creation via `@HttpCode(HttpStatus.CREATED)`.
   - `400 Bad Request`: Input validation or domain rule violations.
   - `401 Unauthorized`: Missing or invalid JWT credentials.
   - `403 Forbidden`: Insufficient permissions or role mismatch.
   - `404 Not Found`: Entity not found.
   - `409 Conflict`: Optimistic locking race condition.
   - `500 Internal Server Error`: Unhandled infrastructure failures.
3. **DTO Separation & Validation**:
   - Controllers receive explicit Request DTOs and return explicit Response DTOs. Domain aggregates are never returned directly over the wire.
   - Validation performed via `GlobalSanitizationValidationPipe` with class-validator/Zod.
4. **Pagination**:
   - Query DTOs take `page?: number`, `limit?: number`, `sortBy?: string`, `sortOrder?: 'asc' | 'desc'`.
   - Paginated responses return `{ items: T[], total: number, page: number, limit: number, totalPages: number }`.
5. **OpenAPI / Swagger Documentation**:
   - Every controller annotated with `@ApiTags(...)`, `@ApiBearerAuth()`.
   - Every action annotated with `@ApiOperation(...)`, `@ApiResponse(...)`, `@ApiParam(...)`, `@ApiQuery(...)`.

---

## 11. Existing Documentation Conventions

1. **Architecture Decision Records (ADRs)**:
   - Stored under `docs/adr/` in standard Michael Nygard format:
     - Title, Status, Date, Deciders, Context & Problem Statement, Architectural Decision, Alternatives Considered, Consequences.
     - 80 ADRs currently recorded and maintained.
2. **Domain & Subsystem Specifications**:
   - Stored under `docs/architecture/` and `docs/domain/`.
   - Rich use of Mermaid class diagrams, sequence diagrams, state machines, and boundary maps.
3. **Traceability & Verification**:
   - Clear requirements-to-test matrices (`traceability-matrix.md`, `acceptance-matrix.md`).

---

## 12. Potential Architectural Conflicts & Risks for Phase 7

### 12.1 Context Ownership vs Financial Centralization (The Central Dilemma)

- **The Risk**: If Sales & Payments attempts to directly mutate the state of products, memberships, or clinical sessions in its own database transactions, it violates bounded-context autonomy.
- **Resolution**: Sales & Payments owns **the commercial transaction (Sales Order / Invoice)** and **the financial settlement (Payment / Transaction)**. It delegates domain-specific fulfillment to the owning bounded contexts through established ports (e.g. `InventoryStockDecrementPort`, Gym renewal service) via scalar reference IDs.

### 12.2 Fragmentation of Monetary Value Objects

- **The Risk**: Gym has `PlanPrice` (`packages/core/src/gym/domain/plan/plan-price.vo.ts`); Resources has `Money` (`packages/core/src/resources/domain/shared/value-objects/money.vo.ts`). If Phase 7 creates a third monetary value object (`PaymentAmount`), the platform has duplicate, fragmented monetary logic.
- **Resolution**: Promote the canonical `Money` value object to a platform-wide shared domain kernel in `packages/core/src/shared/kernel/money.vo.ts` so that Sales, Payments, Inventory, Assets, and Gym share one unified, rigorously tested currency/money representation.

### 12.3 Heterogeneous Sellable Items (Physical vs Service vs Subscription)

- **The Risk**: In Phase 6, `InventoryItem` represents physical goods with stock on hand. However, a sale in Kinergy can contain:
  1. Physical consumable items (protein bar, shake, bandage) $\rightarrow$ Requires stock deduction.
  2. Gym memberships (monthly plan, annual VIP) $\rightarrow$ Requires membership creation/renewal, no stock deduction.
  3. Treatment sessions (kinesiology rehabilitation session) $\rightarrow$ Requires clinical appointment correlation, no stock deduction.
  4. Ad-hoc/custom items (locker rental, guest pass, late fee) $\rightarrow$ Pure commercial charge.
- **Resolution**: The `SaleItem` / `OrderLineItem` entity must model sellable items polymorphically or via source references (`itemType`: `INVENTORY`, `MEMBERSHIP_PLAN`, `TREATMENT_SERVICE`, `CUSTOM`), snapshotting the unit price and description at the moment of sale while dispatching fulfillment according to `itemType`.

### 12.4 Price Snapshotting & Historical Immutability

- **The Risk**: If an order line item merely references an `inventoryItemId` or `membershipPlanId` and queries current prices dynamically, any subsequent price change retroactively alters historical sales, receipts, tax records, and revenue metrics.
- **Resolution**: Sales order line items must **permanently snapshot** the commercial details at the time of transaction: `unitPriceAmount`, `unitPriceCurrency`, `itemDescription`, `itemSkuOrCode`, `taxRate`, and `appliedDiscount`.

### 12.5 Walk-in / Guest Customers vs Client Management

- **The Risk**: Phase 2 Client Management requires complete client registration (`firstName`, `lastName`, `email`, `phone`). Front-desk sales (e.g. someone walking in to buy a smoothie or bottled water) frequently do not have or want a full client profile.
- **Resolution**: `Sale` must treat `clientId` as **optional** (`clientId?: string`), allowing anonymous/guest walk-in purchases with optional customer name notes (`customerName?: string`). When `clientId` is present, it correlates with Client Management and projects onto the client timeline.

### 12.6 Multi-Payment & Partial Payment Complexity

- **The Risk**: Modeling payment merely as a status flag on a sale (`isPaid: boolean`, `paymentMethod: string`) fails to support real-world front-desk operations: split payments (half cash, half card), partial deposits, refunds, or asynchronous payment gateway processing.
- **Resolution**: Explicitly decouple the `Sale` / `Invoice` aggregate from the `Payment` aggregate or entity. A `Sale` can have multiple `Payment` records that sum up to the total order amount.

### 12.7 Permission Alignment: `Billing` vs `Sales`

- **The Risk**: Pre-existing seeds use `billing.read` and `billing.write`. If Phase 7 introduces completely disjoint permissions (`sales.read`, `sales.create`, `payments.process`) without aligning with the existing IAM catalog and `Receptionist`/`Owner` roles, existing role assignments break.
- **Resolution**: Ensure Phase 7 maps cleanly to the existing `Billing` permission catalog, adding fine-grained sub-permissions if needed while preserving backward compatibility.

---

## 13. Decisions that Phase 7.0 Must Explicitly Resolve

Before any Phase 7 implementation begins, the architecture design milestone (Phase 7.1) must formally establish:

1. **Core Aggregate Definitions**:
   - What is the primary commercial aggregate? (`Sale` vs `SalesOrder` vs `Invoice`).
   - Is `Payment` an internal entity of `Sale` or an autonomous aggregate root?
2. **Fulfillment Orchestration Strategy**:
   - How does a completed sale trigger inventory deduction and membership activation?
   - In-process domain service / application orchestrator vs transactional outbox integration events.
   - What is the compensation strategy if stock deduction succeeds but payment fails?
3. **Monetary Shared Kernel Promotion**:
   - Move canonical `Money` to `packages/core/src/shared/kernel/value-objects/money.vo.ts` so all contexts share the same value object.
4. **Payment Methods & Gateway Abstraction**:
   - Supported payment methods: `CASH`, `CREDIT_CARD`, `DEBIT_CARD`, `BANK_TRANSFER`, `DIGITAL_WALLET`, `ACCOUNT_CREDIT`.
   - Payment Gateway Port (`PaymentGatewayPort`) interface for future integrations (Stripe, POS terminals) without coupling domain logic to external providers.
5. **Receipts & Invoicing Standards**:
   - Generation of immutable receipt numbers (e.g. `REC-2026-00001`) with tax calculations, line item summaries, and cashier attribution.
6. **Refund & Cancellation Policy**:
   - Full refunds vs partial refunds; restocking of consumable inventory on refund vs write-off; membership cancellation/reversion policies.
7. **IAM Permission Taxonomy**:
   - Finalizing the permission codes (`billing.read`, `billing.write`, or refined `sales.read`, `sales.write`, `payments.process`, `refunds.issue`).

---

## 14. Files Inspected During Architectural Discovery

### Documentation & Architecture

- [bounded-contexts.md](file:///c:/Projects/kinergy-platform/docs/architecture/bounded-contexts.md)
- [system-architecture.md](file:///c:/Projects/kinergy-platform/docs/architecture/system-architecture.md)
- [domain-driven-design.md](file:///c:/Projects/kinergy-platform/docs/architecture/domain-driven-design.md)
- [patterns-and-decisions.md](file:///c:/Projects/kinergy-platform/docs/architecture/patterns-and-decisions.md)
- [phase-6-architecture-discovery.md](file:///c:/Projects/kinergy-platform/docs/architecture/resources/phase-6-architecture-discovery.md)
- [cross-domain-integration.md](file:///c:/Projects/kinergy-platform/docs/architecture/resources/cross-domain-integration.md)
- [authorization-security-baseline.md](file:///c:/Projects/kinergy-platform/docs/architecture/resources/authorization-security-baseline.md)
- [ARCHITECTURE.md (modules/client)](file:///c:/Projects/kinergy-platform/modules/client/docs/ARCHITECTURE.md)
- [0045-kinesiology-bounded-context-and-cross-context-identifiers.md](file:///c:/Projects/kinergy-platform/docs/adr/0045-kinesiology-bounded-context-and-cross-context-identifiers.md)
- [0054-gym-management-bounded-context-ownership-and-context-map.md](file:///c:/Projects/kinergy-platform/docs/adr/0054-gym-management-bounded-context-ownership-and-context-map.md)
- [0058-gym-management-membership-plan-commercial-and-pricing-model.md](file:///c:/Projects/kinergy-platform/docs/adr/0058-gym-management-membership-plan-commercial-and-pricing-model.md)

### Persistence & Data Models

- [schema.prisma](file:///c:/Projects/kinergy-platform/prisma/schema.prisma)
- [identity.seed.ts](file:///c:/Projects/kinergy-platform/prisma/seeds/identity.seed.ts)

### Core Domain & Application Interfaces

- [money.vo.ts](file:///c:/Projects/kinergy-platform/packages/core/src/resources/domain/shared/value-objects/money.vo.ts)
- [plan-price.vo.ts](file:///c:/Projects/kinergy-platform/packages/core/src/gym/domain/plan/plan-price.vo.ts)
- [inventory-stock-decrement.port.ts](file:///c:/Projects/kinergy-platform/packages/core/src/resources/application/ports/inventory-stock-decrement.port.ts)
- [sales-inventory-integration-port.spec.ts](file:///c:/Projects/kinergy-platform/packages/core/src/resources/application/__tests__/sales-inventory-integration-port.spec.ts)
- [optimistic-lock.exception.ts](file:///c:/Projects/kinergy-platform/packages/core/src/resources/domain/shared/exceptions/optimistic-lock.exception.ts)
- [index.ts (packages/types)](file:///c:/Projects/kinergy-platform/packages/types/src/index.ts)
- [index.ts (packages/utils)](file:///c:/Projects/kinergy-platform/packages/utils/src/index.ts)

### Backend API & Presentation

- [app.module.ts](file:///c:/Projects/kinergy-platform/apps/api/src/app.module.ts)
- [resources.module.ts](file:///c:/Projects/kinergy-platform/apps/api/src/resources/resources.module.ts)
- [gym.module.ts](file:///c:/Projects/kinergy-platform/apps/api/src/gym/gym.module.ts)
- [inventory.controller.ts](file:///c:/Projects/kinergy-platform/apps/api/src/resources/controllers/inventory.controller.ts)
- [global-exception.filter.ts](file:///c:/Projects/kinergy-platform/apps/api/src/common/filters/global-exception.filter.ts)
- [authentication.guard.ts](file:///c:/Projects/kinergy-platform/apps/api/src/platform/identity/guards/authentication.guard.ts)
- [authorization.guard.ts](file:///c:/Projects/kinergy-platform/apps/api/src/platform/identity/authorization/authorization.guard.ts)
