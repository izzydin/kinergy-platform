# Phase 7.2: SaleItem Implementation & Integration Reconnaissance

- **Document**: `docs/domain/sale-item-implementation.md`
- **Phase**: `7.2 — Sales Application & Persistence` (Domain Reconnaissance)
- **Role**: Principal Domain Engineer
- **Status**: Complete Architectural Reconnaissance
- **Bounded Context**: Sales & Payments (`packages/core/src/sales/`)
- **Governing ADRs**: [ADR-0108](../adr/0108-money-representation.md), [ADR-0109](../adr/0109-payment-lifecycle.md), [ADR-0110](../adr/0110-sale-ownership.md), [ADR-0111](../adr/0111-sales-payments-authorization-and-audit.md), [ADR-0112](../adr/0112-sales-bounded-context.md)
- **Governing Documentation**:
  - `docs/architecture/sales-payments.md`
  - `docs/domain/sales-payments.md`
  - `docs/business-rules/sales-payments.md`
  - `docs/domain/sales-foundation-implementation.md`
  - `docs/architecture/sales-foundation-acceptance.md`
- **Date**: 2026-09-17

---

## 1. Executive Summary & Objective

As Principal Domain Engineer for Phase 7.2 of the Kinergy platform, this reconnaissance audit determines exactly how `SaleItem` is implemented, encapsulated, and integrated within the `Sale` aggregate root, and defines the precise boundary between what exists from Phase 7.1 and what must be delivered in Phase 7.2.

### Historical Commercial Principle

> **Core Principle of Phase 7.2**:  
> A `SaleItem` represents what was commercially agreed upon and sold at the exact moment of checkout.  
> The source catalog entity (e.g., `InventoryItem`, `MembershipPlan`, `TreatmentSession`) represents current operational state.  
> These are entirely separate responsibilities.

Changing a catalog product price, description, or SKU at any point after checkout must never alter existing historical `SaleItem` records.

```text
Current Catalog Product (Source)          Historical SaleItem (Snapshot)
--------------------------------          -----------------------------
id: "prod_123"                            id: "item_456"
name: "Whey Protein 1kg"                  description: "Whey Protein 1kg (Vanilla)"
price: $32.00 (updated today)             unitPrice: $25.00 (snapshot at sale)
stock: 14 units                           quantity: 2
                                          subtotal: $50.00
```

---

## 2. Responses to Mandatory Architectural Questions

### 1. Is SaleItem an entity inside the Sale aggregate?

**Yes.** `SaleItem` is a child domain entity owned exclusively by the `Sale` aggregate root. It has no independent lifecycle, repository, or global access path. External callers can only interact with `SaleItem` instances through `Sale` aggregate root methods (`sale.addItem()`, `sale.updateItemQuantity()`, `sale.applyItemDiscount()`, `sale.removeItem()`).

### 2. Does SaleItem have its own domain identity?

**Yes.** `SaleItem` possesses its own local entity identity encapsulated by the `SaleItemId` value object (`packages/core/src/sales/domain/value-objects/sale-item-id.vo.ts`). Within the `Sale` aggregate boundary, line item uniqueness is strictly enforced (`assertNoDuplicateSaleItem`).

### 3. Is `saleId` represented inside the domain object or only established during persistence?

**`saleId` is established during persistence, NOT inside the domain entity.**  
In pure Domain-Driven Design, a child entity contained within an in-memory aggregate root does not require a foreign key reference to its parent; the parent aggregate root (`Sale`) owns its collection of items directly (`_items: SaleItem[]`).  
During persistence (Prisma relational schema), `saleId` is established as a required foreign key on the `SaleItem` database table linking back to the `Sale` table. When reconstituting from persistence, the repository provides the items directly to `Sale.reconstitute({ items: [...] })`.

### 4. How are nested aggregate entities represented?

In Kinergy's DDD patterns:

- Nested entities are stored in private internal collections (`private _items: SaleItem[]`).
- Public accessors provide immutable or defensive shallow copies (`public get items(): ReadonlyArray<SaleItem> { return Object.freeze([...this._items]); }`).
- Entity instances are created via factory methods (`create()` and `reconstitute()`) and frozen via `Object.freeze(this)`.
- Mutations within the aggregate do not mutate the entity in place; instead, immutable withers (`withQuantity()`, `withDiscount()`) create a replacement instance that updates the parent array, triggering automatic recalculation of aggregate totals.

### 5. How are immutable value objects represented?

All value objects in the domain implement the canonical `ValueObject<T>` contract (`packages/core/src/sales/domain/shared/value-object.ts`):

- Private constructors.
- Static factory methods (`create()`, semantic constructors like `percentage()`, `fixedAmount()`).
- Immutable state enforced via `Object.freeze(this)`.
- Structural equality via `equals(other)`.
- Reusable serialization via `getValue()` and `toString()`.

### 6. How are Money values represented?

Money is represented via the canonical `Money` value object (`packages/core/src/sales/domain/value-objects/money.vo.ts`, re-exporting `packages/core/src/resources/domain/shared/value-objects/money.vo.ts`) approved in ADR-0108:

- Backed by integer minor units (cents, e.g., `$25.00` = `2500`).
- Immutable arithmetic operations (`add`, `subtract`, `multiply`).
- Commercial Half-Up rounding policy.
- Two-decimal fixed scale.
- Guaranteed non-negative invariants for prices, subtotals, and final totals.

### 7. How are quantities represented?

Quantity is represented as a finite, strictly positive number (`number`), bounded and normalized to 3 decimal places precision (`Math.round((quantity + Number.EPSILON) * 1000) / 1000`):

- **Supported Range**: Minimum positive quantity is `0.001`; maximum supported quantity is `999,999` (`SaleItem.MAX_QUANTITY`).
- **Supports Discrete and Bulk**: Fully supports integer counts (e.g. 1 session, 2 retail shirts) and bulk/weighted goods (e.g. 1.250 kg powder, 0.333 L oil).
- **Underflow Guard**: Quantities strictly $< 0.0005$ round down to `0.000` at 3 decimal places and are deterministically rejected with `InvalidSaleItemException`.
- **Invalid Rejections**: Negative values, zero, `NaN`, non-finite numbers, and values exceeding `999,999` throw `InvalidSaleItemException`.

### 8. How are discounts represented?

Discounts are represented via the canonical `Discount` value object (`packages/core/src/sales/domain/value-objects/discount.vo.ts`):

- Characterized by `type: DiscountType` (`PERCENTAGE` or `FIXED_AMOUNT`), `value: number`, and non-empty `reason: string` (mandatory audit justification).
- Calculates exact reduction via `discount.calculateReduction(subtotal: Money): Money`.
- Caps reduction at the subtotal (`min(subtotal, reduction)`), guaranteeing that line totals never become negative.
- Both line-item discounts (`saleItem.discount`) and order-level discounts (`sale.orderDiscount`) use this exact type.

### 9. How are source references represented?

Source references are represented via the `SourceReference` value object (`packages/core/src/sales/domain/value-objects/source-reference.vo.ts`):

- Captures loose external references under ADR-0110 ("References Over Ownership").
- Encapsulates:
  - `sourceType: SourceType` (`INVENTORY_ITEM`, `MEMBERSHIP_PLAN`, `TREATMENT_SESSION`, `CUSTOM_SERVICE`).
  - `sourceId: string` (UUID/identifier of the entity in the source bounded context).
  - `sourceCode?: string | null` (optional human-readable code or SKU).
- Contains zero object references or direct foreign-key constraints to external domain tables.

### 10. How does Sale currently calculate totals?

In `Sale.recalculateTotals()`:

1. `lineSubtotal` = `unitPrice * quantity` (calculated inside `SaleItem`).
2. `lineDiscountTotal` = `discount.calculateReduction(lineSubtotal)` (calculated inside `SaleItem`).
3. `lineTotal` = `lineSubtotal - lineDiscountTotal` (calculated inside `SaleItem`).
4. `subtotal` = $\sum \text{lineSubtotal}$.
5. `totalLineDiscounts` = $\sum \text{lineDiscountTotal}$.
6. `netPreOrderDiscount` = `subtotal - totalLineDiscounts`.
7. `orderDiscountTotal` = `orderDiscount.calculateReduction(netPreOrderDiscount)`.
8. `discountTotal` = `totalLineDiscounts + orderDiscountTotal`.
9. `total` = `subtotal - discountTotal` (guaranteed $\ge 0.00$).

### 11. Which SaleItem behavior already exists from Phase 7.1?

The core domain model for `SaleItem` was fully implemented and tested in Phase 7.1:

- `SaleItem` entity class with private readonly fields.
- `CreateSaleItemProps` and `ReconstituteSaleItemProps` interfaces.
- Factory method `SaleItem.create(props)`.
- Reconstitution method `SaleItem.reconstitute(props)` with mathematical reconciliation.
- Immutability withers (`withQuantity()`, `withDiscount()`) and convenience aliases (`updateQuantity()`, `applyDiscount()`, `removeDiscount()`).
- Compatibility aliases (`lineSubtotal`, `lineDiscountTotal`, `lineTotal`).
- Co-located unit test suite `sale-item.entity.spec.ts` (36 tests) and integration within `sale.aggregate.spec.ts`.

### 12. Which behavior belongs specifically to Phase 7.2?

Phase 7.2 is responsible for:

1. **Application Use Cases & Ports**:
   - `AddItemToSaleUseCase` (orchestrating source validation, price capture, and cart addition).
   - `UpdateSaleItemQuantityUseCase` & `RemoveItemFromSaleUseCase`.
   - `ApplyItemDiscountUseCase`.
2. **Catalog Price/Metadata Resolution (ACL / Ports)**:
   - External domain query ports (`InventoryCatalogPort`, `MembershipPlanPort`, `TreatmentSessionPort`) to retrieve current catalog price and description before taking the immutable `SaleItem` snapshot.
3. **Prisma Persistence & Mapping**:
   - Adding `Sale` and `SaleItem` models to `prisma/schema.prisma`.
   - Creating database migrations.
   - Authoring `PrismaSaleRepository` and `PrismaSaleMapper` to serialize/deserialize `SaleItem` entities.
4. **DTOs & HTTP Presentation**:
   - `AddSaleItemRequestDto`, `SaleItemResponseDto`, Zod validation schemas.
5. **Historical Integrity Verification**:
   - Integration tests proving that catalog price changes in Resources/Gym/Kinesiology do not affect previously persisted `SaleItem` records.

---

## 3. Existing SaleItem State & Anatomy

The existing `SaleItem` implementation is located at:
[`packages/core/src/sales/domain/entities/sale-item.entity.ts`](file:///c:/Projects/kinergy-platform/packages/core/src/sales/domain/entities/sale-item.entity.ts)

### State Structure

```typescript
export class SaleItem {
  private readonly _id: SaleItemId;
  private readonly _source: SourceReference;
  private readonly _description: string;
  private readonly _skuOrCode: string | null;
  private readonly _quantity: number;
  private readonly _unitPrice: Money;
  private readonly _discount: Discount | null;
  private readonly _subtotal: Money;
  private readonly _discountTotal: Money;
  private readonly _total: Money;
}
```

### Complete Reused Domain Types

| Type Name                  | Classification   | Source Path                                                                | Purpose in SaleItem                                                    |
| :------------------------- | :--------------- | :------------------------------------------------------------------------- | :--------------------------------------------------------------------- |
| `SaleItemId`               | Value Object     | `packages/core/src/sales/domain/value-objects/sale-item-id.vo.ts`          | Local entity identifier.                                               |
| `SourceReference`          | Value Object     | `packages/core/src/sales/domain/value-objects/source-reference.vo.ts`      | Loose unowned pointer to source catalog entity.                        |
| `SourceType`               | Enum             | `packages/core/src/sales/domain/enums/source-type.enum.ts`                 | Source category (`INVENTORY_ITEM`, etc.).                              |
| `Money`                    | Value Object     | `packages/core/src/sales/domain/value-objects/money.vo.ts`                 | Financial amounts (`unitPrice`, `subtotal`, `discountTotal`, `total`). |
| `Discount`                 | Value Object     | `packages/core/src/sales/domain/value-objects/discount.vo.ts`              | Commercial price reduction policy.                                     |
| `DiscountType`             | Enum             | `packages/core/src/sales/domain/enums/discount-type.enum.ts`               | Discount method (`PERCENTAGE`, `FIXED_AMOUNT`).                        |
| `InvalidSaleItemException` | Domain Exception | `packages/core/src/sales/domain/exceptions/invalid-sale-item.exception.ts` | Invariant violation error.                                             |

---

## 4. Historical Snapshot Strategy

When adding a line item to a sale:

1. **Query Port (Catalog Read)**: The application service calls an external catalog port to read the source entity's current description, SKU, and unit price.
2. **Snapshot Creation**: The application service maps these current values into `CreateSaleItemProps`:
   ```typescript
   const itemProps: CreateSaleItemProps = {
     source: SourceReference.create({
       sourceType: SourceType.INVENTORY_ITEM,
       sourceId: catalogItem.id,
       sourceCode: catalogItem.sku,
     }),
     description: catalogItem.name,
     skuOrCode: catalogItem.sku,
     quantity: requestedQuantity,
     unitPrice: Money.create(catalogItem.price, sale.currency),
     discount: requestedDiscount ?? null,
   };
   ```
3. **Aggregate Ingestion**: The `Sale` aggregate invokes `SaleItem.create(itemProps)`, computing and freezing `subtotal`, `discountTotal`, and `total`.
4. **Permanent Insulation**: The persisted `SaleItem` row stores the snapshot values (`description`, `skuOrCode`, `unitPriceCents`, `quantity`, `discountValue`, `discountType`, `subtotalCents`, `totalCents`). If the source catalog item is subsequently deleted, renamed, or repriced, the `SaleItem` remains 100% intact and unaffected.

---

## 5. Fields Analysis: Included vs. Intentionally Excluded

### Fields That Belong to SaleItem

| Field Name      | Type               | Rationale                                                                           |
| :-------------- | :----------------- | :---------------------------------------------------------------------------------- |
| `id`            | `SaleItemId`       | Entity identity within the aggregate.                                               |
| `source`        | `SourceReference`  | Loose pointer to originating catalog item (`sourceType`, `sourceId`, `sourceCode`). |
| `description`   | `string`           | Immutable point-in-time commercial description for invoices and receipts.           |
| `skuOrCode`     | `string \| null`   | Historical SKU, barcode, or internal billing code.                                  |
| `quantity`      | `number`           | Purchased volume/count (strictly $> 0$, normalized to 3 decimal places).            |
| `unitPrice`     | `Money`            | Immutable point-in-time agreed unit price.                                          |
| `discount`      | `Discount \| null` | Line-item discount and mandatory business justification.                            |
| `subtotal`      | `Money`            | Calculated `unitPrice * quantity`.                                                  |
| `discountTotal` | `Money`            | Calculated reduction from line discount.                                            |
| `total`         | `Money`            | Calculated net line total (`subtotal - discountTotal`).                             |

### Fields Intentionally Excluded from SaleItem

| Excluded Concept                                               | Reason for Exclusion                                                                                           |
| :------------------------------------------------------------- | :------------------------------------------------------------------------------------------------------------- |
| `saleId` (in domain)                                           | Unnecessary in domain memory; `Sale` aggregate owns its items directly. Managed during persistence.            |
| `taxRate` / `taxAmount`                                        | Tax computation is a Phase 7.3/7.4 extension; currently all prices are tax-inclusive or tax-exempt.            |
| Direct source entity reference (e.g. `product: InventoryItem`) | Prohibited by ADR-0110 ("References Over Ownership"). Cross-aggregate object coupling violates DDD boundaries. |
| Physical inventory stock count                                 | Owned exclusively by `Resources` context (`packages/core/src/resources/`).                                     |
| Fulfillments / Shipments                                       | Handled by operational fulfillment workflows, not the commercial agreement line.                               |
| Commission / Trainer Split                                     | Sales captures commercial totals; practitioner payouts belong to practitioner compensation domain.             |

---

## 6. Phase 7.2 Implementation Scope & Impact

### Files Expected to Change / Be Created in Phase 7.2

1. **Persistence & Schema**:
   - `prisma/schema.prisma` (Add `Sale` and `SaleItem` models).
   - `prisma/migrations/*` (Generate SQL migration).
   - `packages/core/src/sales/infrastructure/persistence/prisma-sale.repository.ts` (Implement repository).
   - `packages/core/src/sales/infrastructure/persistence/mappers/prisma-sale.mapper.ts` (Map between domain entities and Prisma models).
2. **Application Layer (Use Cases & Ports)**:
   - `packages/core/src/sales/application/use-cases/add-item-to-sale.use-case.ts`.
   - `packages/core/src/sales/application/use-cases/update-sale-item-quantity.use-case.ts`.
   - `packages/core/src/sales/application/use-cases/remove-item-from-sale.use-case.ts`.
   - `packages/core/src/sales/application/ports/sale.repository.port.ts`.
   - `packages/core/src/sales/application/ports/catalog-resolver.port.ts`.
3. **HTTP Presentation & DTOs**:
   - `apps/api/src/sales/dto/add-sale-item.dto.ts`.
   - `apps/api/src/sales/controllers/sales.controller.ts`.
4. **Integration & Contract Tests**:
   - `packages/core/src/sales/infrastructure/persistence/__tests__/prisma-sale-persistence.spec.ts`.
   - `apps/api/src/sales/__tests__/sales-api.spec.ts`.

### Files Intentionally NOT Changed (Protected Phase 7.1 Foundation)

1. `packages/core/src/sales/domain/entities/sale-item.entity.ts` (Domain model already complete, correct, and tested).
2. `packages/core/src/sales/domain/sale.aggregate.ts` (Core aggregate already protects all invariants and lifecycle).
3. `packages/core/src/sales/domain/value-objects/money.vo.ts` (Canonical Money re-export is locked).
4. `packages/core/src/sales/domain/value-objects/discount.vo.ts` (Discount VO is locked).
5. `packages/core/src/sales/domain/value-objects/source-reference.vo.ts` (SourceReference VO is locked).
6. Existing Phase 7.1 unit test suites (`sale-item.entity.spec.ts`, `sale.aggregate.spec.ts`, etc.).

---

## 7. Conclusion & Readiness

The `SaleItem` domain foundation authored in Phase 7.1 and hardened in Phase 7.2 meets 100% of the architectural, mathematical, and historical snapshot requirements for Phase 7.2.

No duplicate domain concepts (`ProductSnapshot`, `HistoricalProduct`, `SaleProduct`) are needed. Phase 7.2 will build application use cases, persistence adapters, and catalog integration ports on top of this established domain foundation without altering its core model.

---

## 8. Historical Commercial Snapshot Traceability & Executable Scenarios

### Traceability Chain

```text
Requirement: REQ-HIST-01 (Historical Commercial Truth)
    ↓
Business Rules: SALE-08 (Commercial Lock), ITEM-04 (Permanent Snapshot), ITEM-09 (Post-Finalization Freeze)
    ↓
SaleItem Invariants: ITEM-01 (Ownership), ITEM-02 (Quantity), ITEM-03 (Price), ITEM-07 (Discount Cap)
    ↓
Domain Implementation:
  - packages/core/src/sales/domain/sale.aggregate.ts
  - packages/core/src/sales/domain/entities/sale-item.entity.ts
  - packages/core/src/sales/domain/value-objects/source-reference.vo.ts
    ↓
Executable Test Suites:
  - packages/core/src/sales/domain/__tests__/sale-item-historical-snapshot.spec.ts (Scenarios 1–8)
  - packages/core/src/sales/domain/__tests__/sale-item-integration.spec.ts
  - packages/core/src/sales/domain/__tests__/sale-item.entity.spec.ts
```

### Verified Regression Scenarios (`sale-item-historical-snapshot.spec.ts`)

| Scenario       | Title                        | Domain Invariant Proven                                                                                                       |
| :------------- | :--------------------------- | :---------------------------------------------------------------------------------------------------------------------------- |
| **Scenario 1** | **Price Change**             | Source repricing ($10.00 $\rightarrow$ $15.00) leaves historical `unitPrice = 10`, `subtotal = 20`, and `total = 20` stable.  |
| **Scenario 2** | **Description Change**       | Source renaming (`"Healthy Shake"` $\rightarrow$ `"Premium Healthy Shake"`) leaves historical transaction description intact. |
| **Scenario 3** | **Source Status Change**     | Source retirement or deprecation (`INACTIVE`, `UNAVAILABLE`, `RETIRED`, `OUT_OF_STOCK`) leaves historical lines valid.        |
| **Scenario 4** | **Source Deletion/Archival** | Source deletion from memory or table does not impair `SaleItem` calculation or serialization.                                 |
| **Scenario 5** | **Finalized Sale**           | Finalized sale locks description, quantity, price, discount, source, and items with `SaleAlreadyFinalizedException`.          |
| **Scenario 6** | **Aggregate Encapsulation**  | Mutating returned item collections (`push`, `pop`, `splice`) or invoking withers fails to corrupt aggregate state.            |
| **Scenario 7** | **Financial Reconciliation** | Sum of line subtotals and net totals reconciles with order subtotal, discounts, and payable total.                            |
| **Scenario 8** | **Failure Atomicity**        | Every rejected invalid operation preserves `before === after` across all aggregate state fields.                              |
