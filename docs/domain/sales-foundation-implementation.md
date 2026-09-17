# Phase 7.1: Sale Domain Foundation — Implementation Reconnaissance & Design Specification

- **Document**: `docs/domain/sales-foundation-implementation.md`
- **Status**: Authoritative Implementation Blueprint (APPROVED FOR PHASE 7.1)
- **Role**: Principal Domain Engineer
- **Bounded Context**: Sales & Payments (`packages/core/src/sales/`)
- **Governing ADRs**: [ADR-0108](../adr/0108-money-representation.md), [ADR-0109](../adr/0109-payment-lifecycle.md), [ADR-0110](../adr/0110-sale-ownership.md), [ADR-0111](../adr/0111-sales-payments-authorization-and-audit.md), [ADR-0112](../adr/0112-sales-bounded-context.md)
- **Governing Business Rules**: [`docs/business-rules/sales-payments.md`](../business-rules/sales-payments.md) (`SALE-*`, `ITEM-*`, `MNY-*`, `ORG-*`)
- **Date**: 2026-09-17

---

## 1. Executive Summary & Mission

Phase 7 Milestone 7.0 established the architectural contract, domain boundaries, financial mathematics, and business rules for **Sales & Payments**.

As Principal Domain Engineer, the mission for **Phase 7.1** is to implement the **Sale Domain Foundation**. This milestone is strictly constrained to the core domain model of the `Sale` aggregate and its internal `SaleItem` entity.

> **Foundational Engineering Law**:  
> _"Do not invent a second architectural language."_  
> Kinergy possesses an established, battle-tested domain pattern across Resources, Gym, Kinesiology, and Scheduling. The Sale aggregate must seamlessly mirror these exact patterns, file layouts, and naming conventions.

---

## 2. Reconnaissance of Existing Kinergy Domain Patterns

A thorough inspection of `packages/core/src/` reveals the following mature conventions:

### 2.1 Domain Code Placement

- Pure domain logic belongs exclusively in **`packages/core/src/<bounded-context>/domain/`**.
- It is 100% framework-agnostic TypeScript with zero imports of NestJS (`@nestjs/*`), Prisma (`@prisma/*`), or infrastructure packages.
- Public exports are governed by hierarchical barrel files (`index.ts`).

### 2.2 Aggregate Root Pattern

As evidenced by `InventoryItem` (`packages/core/src/resources/domain/inventory/inventory-item.aggregate.ts`) and `MembershipPlan` (`packages/core/src/gym/domain/plan/membership-plan.aggregate.ts`):

1. **Interface Contract**: Implements `AggregateRoot<ID>`:
   ```typescript
   export interface AggregateRoot<ID = string> {
     readonly id: ID;
     readonly version: number;
     getUncommittedEvents(): ReadonlyArray<DomainEvent>;
     clearEvents(): void;
   }
   ```
2. **Private Constructor & Dual Factories**:
   - `private constructor(props: SaleProps)`
   - `public static create(props: CreateSaleProps): Sale`: Enforces initial creation invariants (starts in `DRAFT`, assigns UUID, sets version to 1, emits creation event).
   - `public static reconstitute(props: ReconstituteSaleProps): Sale`: Restores historical state from persistence with zero validation side-effects or event emission.
3. **Encapsulation & Semantic Mutation**:
   - Internal collections (`_items: SaleItem[]`) are private.
   - External consumers receive frozen read-only projections: `public get items(): ReadonlyArray<SaleItem> { return Object.freeze([...this._items]); }`.
   - All mutations execute through semantic business methods: `addItem()`, `updateItemQuantity()`, `removeItem()`, `applyOrderDiscount()`, `finalizeOrder()`, `cancel()`.

### 2.3 Value Object Pattern

As evidenced by `Money` (`packages/core/src/resources/domain/shared/value-objects/money.vo.ts`) and `InventoryItemId`:

1. **Interface Contract**: Implements `ValueObject<T>`:
   ```typescript
   export interface ValueObject<T> {
     getValue(): T;
     equals(other: ValueObject<T>): boolean;
   }
   ```
2. **Immutability**: Guaranteed via `Object.freeze(this)` in the constructor.
3. **Strongly Typed IDs**: `SaleId` and `SaleItemId` are distinct classes wrapping validated UUID strings, preventing primitive obsession.

### 2.4 Domain Errors & Exceptions

As evidenced by `packages/core/src/resources/domain/inventory/exceptions/`:

1. **Base Domain Exception**:
   ```typescript
   export class SaleDomainException extends Error {
     constructor(message: string) {
       super(message);
       this.name = 'SaleDomainException';
       Object.setPrototypeOf(this, new.target.prototype);
     }
   }
   ```
2. **Semantic Subclasses**: Specific violations throw tailored exceptions (`EmptySaleException`, `SaleAlreadyFinalizedException`, `InvalidDiscountException`, `NegativeTotalException`).

### 2.5 Domain Events

As evidenced by `packages/core/src/resources/domain/shared/domain-event.ts`:

1. Standard contract:
   ```typescript
   export interface DomainEvent<TPayload = unknown> {
     readonly eventId: string;
     readonly eventType: string;
     readonly aggregateId: string;
     readonly aggregateVersion: number;
     readonly occurredAt: Date;
     readonly payload?: TPayload;
   }
   ```
2. Events are held in a private uncommitted array (`_uncommittedEvents`) and exposed via `getUncommittedEvents()`.

### 2.6 Testing Strategy & Co-location

- Unit tests live under `packages/core/src/<context>/domain/__tests__/`.
- Test naming follows: `<aggregate>.aggregate.spec.ts`, `<aggregate>-invariants.spec.ts`, and `<feature>.spec.ts`.
- Tests are hermetic, executing without databases, containers, or mock frameworks.

### 2.7 TypeScript Strictness

The workspace enforces strict TypeScript (`strict: true`, `noImplicitAny: true`, `strictNullChecks: true`, `noUncheckedIndexedAccess: true`). All domain entities must account for optional fields (`clientId?: string`) and undefinable array lookups cleanly.

---

## 3. Selected Implementation Location for Phase 7.1

```text
packages/core/src/sales/
├── domain/
│   ├── enums/
│   │   ├── sale-status.enum.ts
│   │   ├── discount-type.enum.ts
│   │   ├── source-type.enum.ts
│   │   └── index.ts
│   ├── exceptions/
│   │   ├── sale-domain.exception.ts
│   │   ├── empty-sale.exception.ts
│   │   ├── sale-already-finalized.exception.ts
│   │   ├── invalid-sale-state.exception.ts
│   │   ├── invalid-sale-item.exception.ts
│   │   ├── invalid-discount.exception.ts
│   │   ├── negative-total.exception.ts
│   │   └── index.ts
│   ├── value-objects/
│   │   ├── sale-id.vo.ts
│   │   ├── sale-item-id.vo.ts
│   │   ├── source-reference.vo.ts
│   │   ├── discount.vo.ts
│   │   ├── money.vo.ts (re-export or canonical implementation)
│   │   └── index.ts
│   ├── entities/
│   │   ├── sale-item.entity.ts
│   │   └── index.ts
│   ├── events/
│   │   ├── sale-created.event.ts
│   │   ├── sale-item-added.event.ts
│   │   ├── sale-item-removed.event.ts
│   │   ├── sale-finalized.event.ts
│   │   ├── sale-cancelled.event.ts
│   │   └── index.ts
│   ├── shared/
│   │   ├── aggregate-root.ts
│   │   ├── value-object.ts
│   │   ├── domain-event.ts
│   │   └── index.ts
│   ├── sale.aggregate.ts
│   ├── index.ts
│   └── __tests__/
│       ├── sale.aggregate.spec.ts
│       ├── sale-item.entity.spec.ts
│       ├── sale-discount-and-totals.spec.ts
│       └── sale-invariants.spec.ts
└── index.ts
```

---

## 4. Selected Domain Patterns for Sale Aggregate

### 4.1 `Sale` Aggregate Root Design

```
Sale (Aggregate Root)
├── id: SaleId (Value Object)
├── tenantId: string (Organization Boundary)
├── branchId?: string (Optional Facility Scope)
├── clientId?: string (Optional Client Reference)
├── cashierId: string (Creator User ID)
├── status: SaleStatus (DRAFT | PENDING_PAYMENT | PARTIALLY_PAID | PAID | COMPLETED | CANCELLED | REFUNDED)
├── items: SaleItem[] (Internal Owned Entities)
├── orderDiscount?: Discount (Order-Level Price Reduction)
├── notes?: string (Operational Annotations)
├── completedAt?: Date
├── cancelledAt?: Date
├── cancellationReason?: string
├── version: number (OCC Guard)
├── createdAt: Date
└── updatedAt: Date
```

#### Core Aggregate Methods

- `addItem(props: AddSaleItemProps): void`
- `updateItemQuantity(itemId: SaleItemId, newQuantity: number): void`
- `removeItem(itemId: SaleItemId): void`
- `applyOrderDiscount(discount: Discount): void`
- `removeOrderDiscount(): void`
- `finalizeOrder(): void` (Transitions `DRAFT` $\rightarrow$ `PENDING_PAYMENT`, locks items)
- `cancel(reason: string, actorId: string): void`
- `recalculateTotals(): void` (Applies 13 deterministic formulas)

---

### 4.2 `SaleItem` Internal Entity Design

`SaleItem` is strictly an internal entity with package-private mutations managed exclusively by `Sale`:

```
SaleItem (Internal Entity)
├── id: SaleItemId
├── saleId: SaleId
├── sourceRef: SourceReference (Value Object)
├── description: string (Snapshot at checkout)
├── skuOrCode?: string (Snapshot at checkout)
├── quantity: number (> 0)
├── unitPrice: Money (>= 0)
├── taxRate: number (>= 0, default 0.00)
├── itemDiscount?: Discount (Optional line discount)
├── lineSubtotal: Money (quantity * unitPrice)
├── lineDiscountAmount: Money (capped at lineSubtotal)
├── lineNet: Money (lineSubtotal - lineDiscountAmount)
├── lineTax: Money (round(lineNet * taxRate * 100) / 100)
└── lineTotal: Money (lineNet + lineTax)
```

---

### 4.3 Value Objects Specification

1. **`SaleId` / `SaleItemId`**: Implements `ValueObject<string>`. Validates non-empty string; defaults to `crypto.randomUUID()`.
2. **`SourceReference`**: Implements `ValueObject<SourceReferenceProps>`. Encapsulates `sourceType` (`INVENTORY_ITEM`, `MEMBERSHIP_PLAN`, `TREATMENT_SESSION`, `CUSTOM_SERVICE`), `sourceId: string`, and optional `sourceCode?: string`.
3. **`Discount`**: Implements `ValueObject<DiscountProps>`. Encapsulates `type` (`PERCENTAGE` | `FIXED_AMOUNT`), `value: number`, mandatory `reason: string`, and optional `authorizedByUserId?: string`. Provides `calculateReduction(subtotal: Money): Money`.
4. **`Money`**: Reuses the canonical, cent-guarded `Money` VO from `packages/core/src/resources/domain/shared/value-objects/money.vo.ts` (or equivalent shared kernel location), ensuring unified arithmetic across all modules.

---

## 5. Files Expected to Be Created in Phase 7.1

| File Path                                                             | Component      | Responsibility                                                                                                                   |
| :-------------------------------------------------------------------- | :------------- | :------------------------------------------------------------------------------------------------------------------------------- |
| `packages/core/src/sales/domain/enums/sale-status.enum.ts`            | Enum           | Defines commercial lifecycle states: `DRAFT`, `PENDING_PAYMENT`, `PARTIALLY_PAID`, `PAID`, `COMPLETED`, `CANCELLED`, `REFUNDED`. |
| `packages/core/src/sales/domain/enums/discount-type.enum.ts`          | Enum           | Defines discount mechanisms: `PERCENTAGE`, `FIXED_AMOUNT`.                                                                       |
| `packages/core/src/sales/domain/enums/source-type.enum.ts`            | Enum           | Defines sellable source classifications: `INVENTORY_ITEM`, `MEMBERSHIP_PLAN`, `TREATMENT_SESSION`, `CUSTOM_SERVICE`.             |
| `packages/core/src/sales/domain/value-objects/sale-id.vo.ts`          | VO             | Strongly typed UUID wrapper for `Sale`.                                                                                          |
| `packages/core/src/sales/domain/value-objects/sale-item-id.vo.ts`     | VO             | Strongly typed UUID wrapper for `SaleItem`.                                                                                      |
| `packages/core/src/sales/domain/value-objects/source-reference.vo.ts` | VO             | Unconstrained typed pointer to upstream domain catalog items.                                                                    |
| `packages/core/src/sales/domain/value-objects/discount.vo.ts`         | VO             | Encapsulates percentage/fixed reductions, subtotal capping, and reason.                                                          |
| `packages/core/src/sales/domain/value-objects/money.vo.ts`            | VO             | Re-exports or integrates canonical `Money` with cent-guarded integer math.                                                       |
| `packages/core/src/sales/domain/exceptions/*.ts`                      | Exceptions     | Comprehensive hierarchy inheriting from `SaleDomainException`.                                                                   |
| `packages/core/src/sales/domain/events/*.ts`                          | Domain Events  | Immutable event payloads for `SaleCreated`, `SaleItemAdded`, `SaleFinalized`, etc.                                               |
| `packages/core/src/sales/domain/entities/sale-item.entity.ts`         | Entity         | Internal line-item entity with price snapshotting and line totals.                                                               |
| `packages/core/src/sales/domain/sale.aggregate.ts`                    | Aggregate Root | Main commercial aggregate enforcing 13 reconciliation formulas, cart editing in `DRAFT`, and freezing upon finalization.         |
| `packages/core/src/sales/domain/__tests__/*.spec.ts`                  | Unit Tests     | Hermetic test suites asserting 100% invariant and calculation coverage.                                                          |
| `packages/core/src/sales/index.ts`                                    | Public API     | Root barrel file exporting domain classes and contracts.                                                                         |
| `packages/core/src/index.ts`                                          | Root Barrel    | Re-exports `./sales` to expose Sales domain to workspace packages.                                                               |

---

## 6. Files Intentionally NOT Created in Phase 7.1

To preserve the implementation firewall and maintain atomic milestones:

1. **`Payment` Aggregate (`payment.aggregate.ts`)**: Deferred to **Phase 7.2** (Payment domain & multi-tender settlement).
2. **`Receipt` Document Entity (`receipt.entity.ts`)**: Deferred to **Phase 7.3** (Receipt issuance & document model).
3. **Prisma Schema & Migrations (`schema.prisma`)**: Deferred to **Phase 7.4** (Persistence layer & database mappings).
4. **Repositories (`prisma-sale.repository.ts`)**: Deferred to **Phase 7.4**.
5. **NestJS Controllers & Modules (`sales.controller.ts`, `sales.module.ts`)**: Deferred to **Phase 7.5** (Application CQRS & REST APIs).
6. **DTOs & HTTP Pipes**: Deferred to **Phase 7.5**.
7. **Payment Provider Adapters (Stripe, Terminal)**: Deferred to **Phase 7.6** (External PSP integration).
8. **Frontend Components & Hooks**: Deferred to **Phase 7.7** (UI & POS Register View).

---

## 7. Reused Architectural Decisions & Business Rules

Phase 7.1 directly implements the following certified specifications:

| Specification Document | Reused Decision / Rule        | Enforcement in Phase 7.1                                                                                                                                     |
| :--------------------- | :---------------------------- | :----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **ADR-0108**           | **Deterministic Money Math**  | All line subtotals, discounts, taxes, and order totals execute via cent-integer arithmetic (`Math.round(amount * 100)`). Zero raw floating-point operations. |
| **ADR-0110**           | **References Over Ownership** | `SaleItem` references items via `SourceReference` without coupling to source domain entities. Snapshots `description`, `skuOrCode`, `unitPrice`, `taxRate`.  |
| **ADR-0110**           | **Commercial Immutability**   | Order terms freeze permanently upon leaving `DRAFT` (transition to `PENDING_PAYMENT`). Cart mutation methods throw `SaleAlreadyFinalizedException`.          |
| **ADR-0111**           | **Multi-Tenant Scoping**      | `tenantId` is immutable and required at instantiation. Cross-tenant item additions are rejected.                                                             |
| **ADR-0112**           | **Bounded Context Boundary**  | Sales owns the order and line items; it has zero knowledge of physical stock balances, turns, or SOAP notes.                                                 |
| **Business Rules**     | **`SALE-01` to `SALE-12`**    | Enforced natively as domain invariants inside `Sale.ts`.                                                                                                     |
| **Business Rules**     | **`ITEM-01` to `ITEM-09`**    | Enforced natively as internal invariants inside `SaleItem.ts`.                                                                                               |
| **Business Rules**     | **`MNY-01` to `MNY-05`**      | Implemented through the 13 reconciliation formulas in `recalculateTotals()`.                                                                                 |

---

## 8. Conclusion & Readiness

The reconnaissance is complete. The exact directory locations, class structures, Value Object hierarchies, exception classes, and testing topologies have been identified and mapped to Kinergy’s established conventions.

Phase 7.1 may now proceed directly to code implementation of the Sale Domain Foundation without guesswork, speculative abstractions, or architectural divergence.
