# Phase 6 Resources Security & Authorization Testing Specification

## Status

`APPROVED — COMPLETE QA VERIFICATION`

---

## 1. Security Testing Strategy & Rationale

Security verification in Kinergy requires explicit negative testing. Proving that an authorized actor can execute an operation (happy path) is insufficient to guarantee system security. This test suite establishes verifiable proof that:

1. **Unauthorized actors are forbidden** (`403 Forbidden`) with zero business mutation.
2. **Unauthenticated callers are rejected** (`401 Unauthorized`) before reaching any application service or repository.
3. **No side effects occur on authorization failure**: When an authorization check fails, the repository layer is never touched, stock levels remain unchanged, zero stock movement ledger records are created, and zero asset history audit logs are emitted.
4. **Sensitive financial valuations are protected**: Confidential acquisition costs, fair-value book write-downs, and cumulative working capital valuations are inaccessible to operational staff lacking `billing.read`.
5. **Multi-tenant boundaries are impenetrable**: Cross-tenant resource queries and mutations fail with `404 Not Found` without information leakage.

---

## 2. Role / Permission Matrix Test Coverage

| Persona / Role          | Possessed Permissions                                                              | Test Operations Covered                                          | Expected Security Decision                                        | Result      |
| :---------------------- | :--------------------------------------------------------------------------------- | :--------------------------------------------------------------- | :---------------------------------------------------------------- | :---------- |
| **Owner / Super Admin** | `inventory.write`, `inventory.read`, `assets.write`, `assets.read`, `billing.read` | All 26 Phase 6 operations                                        | `200 OK` / `201 Created`                                          | ✅ Verified |
| **Admin**               | `inventory.write`, `inventory.read`, `assets.write`, `assets.read`, `billing.read` | All standard and valuation operations                            | `200 OK` / `201 Created`                                          | ✅ Verified |
| **Trainer**             | `inventory.read`, `assets.read`, `assets.write`                                    | Asset transfers, condition updates, maintenance, physical counts | `200 OK` for ops; `403 Forbidden` for valuation & creation        | ✅ Verified |
| **Kitchen Staff**       | `inventory.read`, `inventory.write`                                                | Stock receipts, usage, adjustments, inventory catalog            | `200 OK` for inventory; `403 Forbidden` for asset ops & valuation | ✅ Verified |
| **Receptionist**        | `inventory.read`, `inventory.write` (POS), `assets.read`, `billing.read`           | POS retail sales, catalog read, asset read                       | `200 OK` for POS sales; `403 Forbidden` for asset mutations       | ✅ Verified |
| **Unauthenticated**     | None                                                                               | Any mutation or query                                            | `401 Unauthorized`                                                | ✅ Verified |

---

## 3. Forbidden Mutation Coverage & No-Side-Effect Guarantees

### 3.1 Consumable Inventory Mutations

| Forbidden Mutation Attempt     | Security Boundary | Verified Negative Guarantee (No Side Effect)                                           | Test Location                                          |
| :----------------------------- | :---------------- | :------------------------------------------------------------------------------------- | :----------------------------------------------------- |
| **Create Product**             | `inventory.write` | No database record created; aggregate root not initialized.                            | `inventory.authorization.spec.ts`                      |
| **Update Product Details**     | `inventory.write` | Product title, SKU, category, and retail price remain unchanged.                       | `inventory.authorization.spec.ts`                      |
| **Archive / Activate Product** | `inventory.write` | Product status remains `ACTIVE`; no transition to `ARCHIVED`.                          | `resources-security-negative-and-side-effects.spec.ts` |
| **Receive Stock (Purchase)**   | `inventory.write` | `quantityOnHand` unchanged; zero `RECEIPT` `StockMovement` records appended to ledger. | `resources-security-negative-and-side-effects.spec.ts` |
| **Sell Stock (POS)**           | `inventory.write` | `quantityOnHand` unchanged; zero `SALE` movements generated.                           | `resources-security-negative-and-side-effects.spec.ts` |
| **Consume Stock (Usage)**      | `inventory.write` | `quantityOnHand` unchanged; zero `CONSUMPTION` movements generated.                    | `resources-security-negative-and-side-effects.spec.ts` |
| **Adjust Stock (Audit)**       | `inventory.write` | `quantityOnHand` unchanged; zero `ADJUSTMENT` movements generated.                     | `resources-security-negative-and-side-effects.spec.ts` |

### 3.2 Fixed Asset Mutations

| Forbidden Mutation Attempt      | Security Boundary               | Verified Negative Guarantee (No Side Effect)                                         | Test Location                                          |
| :------------------------------ | :------------------------------ | :----------------------------------------------------------------------------------- | :----------------------------------------------------- |
| **Commission Asset**            | `assets.write`                  | No asset record created; initial history event suppressed.                           | `fixed-assets.authorization.spec.ts`                   |
| **Update Asset Details**        | `assets.write`                  | Name, description, and notes remain unchanged.                                       | `fixed-assets.authorization.spec.ts`                   |
| **Location Transfer**           | `assets.write`                  | Physical location unchanged; zero `AssetLocationHistoryRecord` entries created.      | `resources-security-negative-and-side-effects.spec.ts` |
| **Change Lifecycle Status**     | `assets.write`                  | Lifecycle state (`status`) unchanged; zero `STATUS_CHANGED` history events emitted.  | `resources-security-negative-and-side-effects.spec.ts` |
| **Update Condition Rating**     | `assets.write`                  | Condition (`EXCELLENT`/`GOOD`/`FAIR`/`POOR`) unchanged; zero condition logs emitted. | `resources-security-negative-and-side-effects.spec.ts` |
| **Record Maintenance**          | `assets.write`                  | Zero `MaintenanceRecord` work orders created; zero service history logged.           | `resources-security-negative-and-side-effects.spec.ts` |
| **Revalue Balance Sheet Value** | `assets.write` + `billing.read` | Book value unchanged; zero `VALUE_UPDATED` history events emitted.                   | `resources-security-negative-and-side-effects.spec.ts` |

---

## 4. Sensitive Valuation & Response-Shaping Tests

1. **Inventory Valuation (`GET /api/v1/resources/inventory/valuation`)**:
   - Requires: `inventory.read` **AND** `billing.read`.
   - Verified: Operational users (e.g. Kitchen Staff with `inventory.read/write` but lacking `billing.read`) receive `403 Forbidden` with zero disclosure of total inventory monetary valuation.
2. **Fixed Asset Valuation (`GET /api/v1/resources/assets/:id/valuation`)**:
   - Requires: `assets.read` **AND** `billing.read`.
   - Verified: Trainers possessing `assets.read/write` receive `403 Forbidden` with zero disclosure of original `purchaseValue` or current `currentEstimatedValue`.
3. **Response-Shaping Verification**:
   - Standard asset detail (`GET /api/v1/resources/assets/:id`) and list (`GET /api/v1/resources/assets`) return `FixedAssetResponseDto`, structurally omitting financial book values from generic presentation contracts.

---

## 5. Multi-Tenant Business Boundary Tests

1. **Cross-Tenant Item Read Isolation**:
   - Verified: Querying an inventory item ID belonging to Tenant B from an authenticated Tenant A session triggers `where: { id, tenantId }` isolation, failing with `404 Not Found` and preventing cross-tenant data leakage.
2. **Cross-Tenant Asset Mutation Isolation**:
   - Verified: Attempting to transfer the physical location of an asset in Tenant B from a Tenant A session returns `404 Not Found` and produces zero state changes or history events in Tenant B's ledger.

---

## 6. Bypass Regression Test Matrix

| Potential Bypass Vector                    | Tested Defense Mechanism                                                                                                                               | Result      |
| :----------------------------------------- | :----------------------------------------------------------------------------------------------------------------------------------------------------- | :---------- |
| **Generic Stock Overwrite**                | Verified `UpdateInventoryItemRequestDto` has no stock fields; mutations strictly require ledger-backed movement handlers.                              | ✅ `PASSED` |
| **Generic Asset Status / Value Overwrite** | Verified `UpdateFixedAssetDetailsRequestDto` strictly filters metadata (`name`, `description`, `notes`), disallowing lifecycle or valuation tampering. | ✅ `PASSED` |
| **Client-Supplied `actorId` Tampering**    | Verified `actorId` is injected exclusively from `@CurrentUser()` (`user.userId`), ignoring request body parameters.                                    | ✅ `PASSED` |
| **Terminal State Bypass**                  | Verified domain aggregate invariants prevent transitioning or modifying `DISPOSED` assets regardless of caller write permissions.                      | ✅ `PASSED` |

---

## 7. Test Suite Summary

- [`apps/api/src/resources/__tests__/inventory.authorization.spec.ts`](file:///c:/Projects/kinergy-platform/apps/api/src/resources/__tests__/inventory.authorization.spec.ts): 22/22 Passing.
- [`apps/api/src/resources/__tests__/fixed-assets.authorization.spec.ts`](file:///c:/Projects/kinergy-platform/apps/api/src/resources/__tests__/fixed-assets.authorization.spec.ts): 25/25 Passing.
- [`apps/api/src/resources/__tests__/resources-security-negative-and-side-effects.spec.ts`](file:///c:/Projects/kinergy-platform/apps/api/src/resources/__tests__/resources-security-negative-and-side-effects.spec.ts): 15/15 Passing.
- **Total Security Tests**: **62 / 62 Tests Passing Cleanly**.
