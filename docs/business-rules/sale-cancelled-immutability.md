# Cancelled Sale Immutability & Financial Integrity Policy

- **Status**: Authoritative Architectural Baseline (APPROVED & EXECUTABLE)
- **Role**: Senior Financial Integrity Architecture
- **Bounded Context**: Sales & Payments (`packages/core/src/sales/`, `apps/api/src/sales/`)
- **Aggregate Root**: `Sale` ([`sale.aggregate.ts`](file:///c:/Projects/kinergy-platform/packages/core/src/sales/domain/sale.aggregate.ts))
- **Persistence Driver**: `PrismaSaleRepository` ([`prisma-sale.repository.ts`](file:///c:/Projects/kinergy-platform/packages/core/src/sales/infrastructure/persistence/prisma/repositories/prisma-sale.repository.ts))
- **Executable Test Suite**: [`sale-cancelled-immutability.spec.ts`](file:///c:/Projects/kinergy-platform/packages/core/src/sales/domain/__tests__/sale-cancelled-immutability.spec.ts)
- **Related Documentation**:
  - [Sale Invariant Catalog](sale-invariants-catalog.md) (Rule `SALE-008`)
  - [Sale Lifecycle & State Transition Matrix](sale-lifecycle-transition-matrix.md)
  - [Sale-Payment Cross-Aggregate Coordination](sale-payment-coordination.md)

---

## 1. Executive Summary & Policy Statement

In commercial and financial systems, voided or cancelled contracts represent a legally binding termination of a commercial agreement. Once a `Sale` reaches `CANCELLED` status, it constitutes an irreversible snapshot of the cancelled transaction.

### Core Policy Rule: Zero Silent Modifications

> **Under no circumstances may a `CANCELLED` Sale aggregate be silently modified.**
> Every mutation operation attempted on a cancelled sale must be explicitly rejected by the aggregate itself.
> The architectural design does not rely on caller discipline, external service guards, or UI checks to maintain financial integrity. The domain aggregate and persistence repository strictly enforce terminal immutability at their respective boundaries.

No generic proxy-based immutability framework is used; invariants are enforced via direct domain operations, encapsulation, readonly backing fields, and database transaction preconditions.

---

## 2. Comprehensive Mutation Audit Against Cancelled State

Every state-mutating operation across domain, application, and persistence layers has been audited against the `CANCELLED` status. Every operation must either be explicitly allowed by the architecture (with documented audit rationale) or strictly rejected:

| Operation                                        | Target Layer                                   | Status on Cancelled Sale | Enforcing Mechanism                      | Thrown Exception / Failure Response                                                                                                                                                      |
| :----------------------------------------------- | :--------------------------------------------- | :----------------------- | :--------------------------------------- | :--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **`addItem`**                                    | Domain (`Sale`)                                | **REJECTED**             | `assertDraftState()`                     | [`SaleAlreadyFinalizedException`](file:///c:/Projects/kinergy-platform/packages/core/src/sales/domain/exceptions/sale-already-finalized.exception.ts) (`SALE_ALREADY_FINALIZED`, 409)    |
| **`removeItem`**                                 | Domain (`Sale`)                                | **REJECTED**             | `assertDraftState()`                     | [`SaleAlreadyFinalizedException`](file:///c:/Projects/kinergy-platform/packages/core/src/sales/domain/exceptions/sale-already-finalized.exception.ts) (`SALE_ALREADY_FINALIZED`, 409)    |
| **`updateItem`**                                 | Domain (`Sale`)                                | **REJECTED**             | `assertDraftState()`                     | [`SaleAlreadyFinalizedException`](file:///c:/Projects/kinergy-platform/packages/core/src/sales/domain/exceptions/sale-already-finalized.exception.ts) (`SALE_ALREADY_FINALIZED`, 409)    |
| **`updateItemQuantity`**                         | Domain (`Sale`)                                | **REJECTED**             | `assertDraftState()`                     | [`SaleAlreadyFinalizedException`](file:///c:/Projects/kinergy-platform/packages/core/src/sales/domain/exceptions/sale-already-finalized.exception.ts) (`SALE_ALREADY_FINALIZED`, 409)    |
| **Direct Item Property Mutation**                | Entity (`SaleItem`)                            | **REJECTED**             | `Object.freeze(this)` in constructor     | `TypeError: Cannot assign to read only property` (Strict Mode)                                                                                                                           |
| **Direct Items Collection Mutation**             | Domain (`Sale`)                                | **REJECTED**             | `Object.freeze([...this._items])` getter | `TypeError: Cannot add/modify property on frozen object`                                                                                                                                 |
| **`applyItemDiscount`**                          | Domain (`Sale`)                                | **REJECTED**             | `assertDraftState()`                     | [`SaleAlreadyFinalizedException`](file:///c:/Projects/kinergy-platform/packages/core/src/sales/domain/exceptions/sale-already-finalized.exception.ts) (`SALE_ALREADY_FINALIZED`, 409)    |
| **`removeItemDiscount`**                         | Domain (`Sale`)                                | **REJECTED**             | `assertDraftState()`                     | [`SaleAlreadyFinalizedException`](file:///c:/Projects/kinergy-platform/packages/core/src/sales/domain/exceptions/sale-already-finalized.exception.ts) (`SALE_ALREADY_FINALIZED`, 409)    |
| **`applyOrderDiscount`** / **`applyDiscount`**   | Domain (`Sale`)                                | **REJECTED**             | `assertDraftState()`                     | [`SaleAlreadyFinalizedException`](file:///c:/Projects/kinergy-platform/packages/core/src/sales/domain/exceptions/sale-already-finalized.exception.ts) (`SALE_ALREADY_FINALIZED`, 409)    |
| **`removeOrderDiscount`** / **`removeDiscount`** | Domain (`Sale`)                                | **REJECTED**             | `assertDraftState()`                     | [`SaleAlreadyFinalizedException`](file:///c:/Projects/kinergy-platform/packages/core/src/sales/domain/exceptions/sale-already-finalized.exception.ts) (`SALE_ALREADY_FINALIZED`, 409)    |
| **`calculateTotals`**                            | Domain (`Sale`)                                | **REJECTED**             | `assertDraftState()`                     | [`SaleAlreadyFinalizedException`](file:///c:/Projects/kinergy-platform/packages/core/src/sales/domain/exceptions/sale-already-finalized.exception.ts) (`SALE_ALREADY_FINALIZED`, 409)    |
| **Currency Mutation**                            | Domain (`Sale`)                                | **REJECTED**             | `private readonly _currency`, no setter  | `TypeError` / Compile-time error                                                                                                                                                         |
| **Client Association (`assignClient`)**          | Domain (`Sale`)                                | **REJECTED**             | `assertDraftState()`                     | [`SaleAlreadyFinalizedException`](file:///c:/Projects/kinergy-platform/packages/core/src/sales/domain/exceptions/sale-already-finalized.exception.ts) (`SALE_ALREADY_FINALIZED`, 409)    |
| **Status Transition to `PAID`**                  | Domain (`Sale`)                                | **REJECTED**             | `markPaid()` state guard                 | [`InvalidSaleTransitionException`](file:///c:/Projects/kinergy-platform/packages/core/src/sales/domain/exceptions/invalid-sale-transition.exception.ts) (`INVALID_SALE_TRANSITION`, 409) |
| **Status Transition to `PENDING_PAYMENT`**       | Domain (`Sale`)                                | **REJECTED**             | `finalize()` state guard                 | [`InvalidSaleTransitionException`](file:///c:/Projects/kinergy-platform/packages/core/src/sales/domain/exceptions/invalid-sale-transition.exception.ts) (`INVALID_SALE_TRANSITION`, 409) |
| **Status Transition to `PARTIALLY_PAID`**        | Domain (`Sale`)                                | **REJECTED**             | `markPartiallyPaid()` state guard        | [`InvalidSaleTransitionException`](file:///c:/Projects/kinergy-platform/packages/core/src/sales/domain/exceptions/invalid-sale-transition.exception.ts) (`INVALID_SALE_TRANSITION`, 409) |
| **Status Transition to `COMPLETED`**             | Domain (`Sale`)                                | **REJECTED**             | `markCompleted()` state guard            | [`InvalidSaleTransitionException`](file:///c:/Projects/kinergy-platform/packages/core/src/sales/domain/exceptions/invalid-sale-transition.exception.ts) (`INVALID_SALE_TRANSITION`, 409) |
| **Status Transition to `REFUNDED`**              | Domain (`Sale`)                                | **REJECTED**             | `markRefunded()` state guard             | [`InvalidSaleTransitionException`](file:///c:/Projects/kinergy-platform/packages/core/src/sales/domain/exceptions/invalid-sale-transition.exception.ts) (`INVALID_SALE_TRANSITION`, 409) |
| **Repeated `cancel()` call**                     | Domain (`Sale`)                                | **REJECTED**             | `cancel()` state guard                   | [`InvalidSaleTransitionException`](file:///c:/Projects/kinergy-platform/packages/core/src/sales/domain/exceptions/invalid-sale-transition.exception.ts) (`INVALID_SALE_TRANSITION`, 409) |
| **Resurrection to `DRAFT`**                      | Domain (`Sale`)                                | **REJECTED**             | No method exists, no status setter       | `TypeError` / Compile-time error                                                                                                                                                         |
| **Payment Settlement Coordination**              | App Service (`SalePaymentCoordinationService`) | **REJECTED**             | Precondition Step 6 guard                | Returns `SalesApplicationResult.fail(InvalidSaleTransitionException)`                                                                                                                    |
| **Payment Recording**                            | App Handler (`RecordPaymentHandler`)           | **REJECTED**             | Sale status verification                 | Returns `SalesApplicationResult.fail(SaleNotPayableException)`                                                                                                                           |
| **Payment Completion**                           | App Handler (`CompletePaymentHandler`)         | **REJECTED**             | Sale status verification                 | Returns `SalesApplicationResult.fail(SaleNotPayableException)`                                                                                                                           |
| **Receipt Issuance**                             | App Handler (`IssueReceiptHandler`)            | **REJECTED**             | Precondition verification                | Returns `SalesApplicationResult.fail(ReceiptIssuanceRejectedException)`                                                                                                                  |
| **Persistence Update to Cancelled Sale**         | Infrastructure (`PrismaSaleRepository.save`)   | **REJECTED**             | Database terminal status check           | [`InvalidSaleStateException`](file:///c:/Projects/kinergy-platform/packages/core/src/sales/domain/exceptions/invalid-sale-state.exception.ts) (`TERMINAL_SALE_IMMUTABLE`, 500)           |
| **Persistence Transition TO Cancelled**          | Infrastructure (`PrismaSaleRepository.save`)   | **ALLOWED**              | Valid initial cancellation write         | Updates `status='CANCELLED'`, `cancelledAt`, `cancellationReason`, OCC check                                                                                                             |

---

## 3. Aggregate Boundary & Invariant Implementation Details

### 3.1 Direct Aggregate Enforcement

The `Sale` aggregate root controls all internal state transitions and modifications.
When a sale enters `CANCELLED` status via `sale.cancel(reason, clock)`:

1. `_status` transitions to `SaleStatus.CANCELLED`.
2. `_cancelledAt` is stamped using the domain `Clock`.
3. `_cancellationReason` is recorded (must be non-empty string).
4. `_version` increments, reflecting optimistic concurrency control progression.
5. `SaleCancelledEvent` is recorded in uncommitted domain events.

All cart mutations route through `assertDraftState()`:

```typescript
private assertDraftState(): void {
  if (this._status !== SaleStatus.DRAFT) {
    throw new SaleAlreadyFinalizedException(
      `Cannot mutate Sale '${this._id.value}' in status '${this._status}'. Commercial terms freeze upon leaving DRAFT.`,
    );
  }
}
```

Because `this._status === SaleStatus.CANCELLED` is strictly non-DRAFT, any attempt to add items, modify items, remove items, apply discounts, remove discounts, or trigger explicit totals recalculation immediately throws `SaleAlreadyFinalizedException`.

### 3.2 Immutability of Client Association (`assignClient`)

Customer association may only occur during the pre-settlement quotation phase (`DRAFT`):

```typescript
public assignClient(clientId?: string): void {
  this.assertDraftState();
  if (clientId !== undefined && clientId !== null) {
    const trimmed = clientId.trim();
    if (trimmed === '') {
      throw new InvalidSaleStateException('clientId cannot be empty or whitespace.');
    }
    this._clientId = trimmed;
  } else {
    this._clientId = undefined;
  }
  this._updatedAt = new Date();
}
```

Once `CANCELLED` (or finalized), any attempt to associate, reassign, or detach a client throws `SaleAlreadyFinalizedException`.

### 3.3 Financial Calculations & Totals Protection

The authoritative totals calculation:
$$\text{subtotal} = \sum (\text{item.quantity} \times \text{item.unitPrice})$$
$$\text{discountTotal} = \sum (\text{itemDiscounts}) + \text{orderDiscount}$$
$$\text{total} = \text{subtotal} - \text{discountTotal} \ge 0.00$$
is permanently locked upon departure from `DRAFT`. Calling `sale.calculateTotals()` on a cancelled sale is rejected by `assertDraftState()`. Direct property assignment to `subtotal`, `discountTotal`, or `total` is prevented because no property setters exist on the class prototype.

---

## 4. Persistence-Level Hardening Against Bypass

To ensure that direct database access or rogue repository consumers cannot bypass domain aggregate rules, [`PrismaSaleRepository.save()`](file:///c:/Projects/kinergy-platform/packages/core/src/sales/infrastructure/persistence/prisma/repositories/prisma-sale.repository.ts) enforces a transactional persistence precondition:

```typescript
await this.prisma.$transaction(async (tx) => {
  // Persistence Guard: If record in persistence is already CANCELLED, reject any mutation.
  // CANCELLED sales are immutable terminal states; no persistence updates may alter them.
  const existing = await tx.sale.findUnique({
    where: { id: saleData.id },
    select: { status: true },
  });

  if (existing && existing.status === 'CANCELLED') {
    throw new InvalidSaleStateException(
      `Cannot update Sale '${saleData.id}': Sale is already in terminal CANCELLED status in persistence.`,
      'TERMINAL_SALE_IMMUTABLE',
    );
  }
  // ... execute upsert/update with OCC ...
});
```

### Persistence Security Guarantees:

1. **Transitioning TO `CANCELLED` is permitted**: When a DRAFT or PENDING_PAYMENT sale is cancelled, `existing.status` in the database is not yet `CANCELLED`, so the update commits and increments the version.
2. **Subsequent writes are rejected**: Once the database row is `CANCELLED`, any subsequent `save()` call matching this ID will discover `existing.status === 'CANCELLED'` and abort immediately before modifying `sales` or `sale_items` tables.
3. **No Partial Line-Item Patches**: The repository interface exposes only `save(sale: Sale)`. There are no ad-hoc patch methods such as `updateSaleStatus`, `updateSaleItem`, or `deleteSaleItemDirectly`.

---

## 5. Verification Matrix & Executable Proofs

The executable test suite [`sale-cancelled-immutability.spec.ts`](file:///c:/Projects/kinergy-platform/packages/core/src/sales/domain/__tests__/sale-cancelled-immutability.spec.ts) provides 100% automated coverage of these guarantees across 27 unit and integration tests:

- [x] **Item Mutations**: Proves `addItem`, `removeItem`, `updateItem`, `updateItemQuantity`, and direct array mutations are rejected on cancelled sales.
- [x] **Discount Mutations**: Proves `applyItemDiscount`, `removeItemDiscount`, `applyOrderDiscount`, and `removeOrderDiscount` are rejected on cancelled sales.
- [x] **Financial Mutations**: Proves `calculateTotals` is rejected on cancelled sales and financial properties (`total`, `subtotal`, `currency`) have no setters.
- [x] **Client Association**: Proves `assignClient` succeeds in `DRAFT` but is strictly rejected once `CANCELLED`.
- [x] **Status Transitions**: Proves a cancelled sale cannot become `PAID`, `PENDING_PAYMENT`, `PARTIALLY_PAID`, `COMPLETED`, `REFUNDED`, or `DRAFT`.
- [x] **Persistence Enforcements**: Proves `PrismaSaleRepository.save` allows saving the transition to `CANCELLED` but halts and throws when updating an already cancelled sale record.
