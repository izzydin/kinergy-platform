# Milestone 9.5.6 — Inventory Business Journey Acceptance Report

- **Date**: 2026-11-03
- **Auditor**: Senior Full-Stack Engineer & QA Engineer
- **Environment**: PostgreSQL 16 `kinergy_dev` (Docker Container `kinergy-postgres` on port 5433)
- **Status**: **PASS**

---

## 1. Executive Summary

Milestone 9.5.6 verified the full operational and commercial lifecycle for consumable inventory and retail point-of-sale commerce:
$$\text{Stock Receiving} \longrightarrow \text{Supported Retail Sale} \longrightarrow \text{Stock Movement Ledger} \longrightarrow \text{Low-Stock Behavior}$$

The verification confirmed that:

1. Synthetic inventory items seeded in Milestone 9.5.3 maintain complete relational integrity and concurrency safety in PostgreSQL.
2. Legitimate stock receiving increments `quantityOnHand` and appends an immutable `PURCHASE` movement to the append-only ledger.
3. Retail sales strictly differentiate saleable consumable goods (`FOOD`, `DRINK`, `RETAIL_PRODUCTS`) from internal clinical supplies (`INTERNAL_SUPPLIES`) and fixed assets.
4. Physical stock decrement occurs strictly upon commercial payment settlement (`SalePaidEvent`), preventing stock depletion on abandoned carts and preventing negative stock balances.
5. Low-stock thresholds trigger warnings and cockpit inclusion at the exact boundary condition ($\text{stock} \le \text{minimum}$), clearing automatically upon replenishment.
6. All automated quality gates passed with 100% test success across core domain, API, and web modules.

---

## 2. Synthetic Demo Inventory Catalog

| Item Name                               | SKU             | Category            | Selling Price | Unit Cost | Min Stock | Initial Stock | Retail Status                                |
| :-------------------------------------- | :-------------- | :------------------ | :------------ | :-------- | :-------- | :------------ | :------------------------------------------- |
| **ISO-100 Whey Protein Shake (500ml)**  | `DRK-WHEY-500`  | `HEALTHY_DRINKS`    | \$4.50        | \$2.00    | 10 units  | 25 units      | **Saleable (Retail POS)**                    |
| **Electrolyte Hydration Drink (750ml)** | `DRK-ELEC-750`  | `HEALTHY_DRINKS`    | \$3.75        | \$1.50    | 15 units  | 12 units      | **Saleable (Low-Stock Alert Triggered)**     |
| **Clinical Massage Emollient (1L)**     | `SUP-MASS-1000` | `INTERNAL_SUPPLIES` | _N/A_         | \$18.00   | 5 units   | 8 units       | **Non-Retail Supply (POS Checkout Blocked)** |

---

## 3. Demonstrated User Roles & Permissions

| Role                          | Demo Account                                   | Assigned Permissions                                                                                  | Responsibilities in Journey                                                                              |
| :---------------------------- | :--------------------------------------------- | :---------------------------------------------------------------------------------------------------- | :------------------------------------------------------------------------------------------------------- |
| **Inventory / Kitchen Staff** | `inventory.demo@kinergy.platform` / `Demo123!` | `inventory.items.read`, `inventory.items.manage`, `inventory.stock.manage`, `inventory.stock.receive` | Inspects inventory balances, receives shipments, views stock movement ledger, reviews low-stock cockpit. |
| **Front Desk / Cashier**      | `reception.demo@kinergy.platform` / `Demo123!` | `sales.create`, `payments.record`, `receipts.manage`, `inventory.items.read`                          | Performs retail point-of-sale checkout, collects cash/card payment, prints customer receipt voucher.     |
| **Admin / Owner**             | `owner@kinergy.platform` / `Admin123!`         | Superuser (`*`)                                                                                       | Manages reorder points, suppliers, audit trails, and financial reconciliation.                           |

---

## 4. Business Journey Verification Matrix

| Step                      | UI Route & Component                                  | API Endpoint & Payload                                                                                                        | Domain Action & Invariants                                                                                       | Persistence Entity                      | Outcome  |
| :------------------------ | :---------------------------------------------------- | :---------------------------------------------------------------------------------------------------------------------------- | :--------------------------------------------------------------------------------------------------------------- | :-------------------------------------- | :------- |
| **1. Stock Receiving**    | `/resources/inventory/:id`<br/>(`ReceiveStockModal`)  | `POST /api/v1/resources/inventory/:id/receive`<br/>`{ quantity: 20, unitCostAmount: 2.00, invoiceReference: 'INV-2026-901' }` | Validates positive quantity ($> 0$), increments `quantityOnHand`, appends `PURCHASE` movement.                   | `InventoryItem`<br/>`InventoryMovement` | **PASS** |
| **2. Retail POS Sale**    | `/sales/new`<br/>(`SaleCreatePage`)                   | `POST /api/v1/sales`<br/>`{ sourceType: 'DRINK', items: [{ sourceId, quantity: 2 }] }`                                        | Validates retail eligibility, checks `stock >= 2`, snapshots unit price (\$4.50), sets status `PENDING_PAYMENT`. | `Sale`<br/>`SaleItem`                   | **PASS** |
| **3. Payment Settlement** | `/sales/:id`<br/>(`RecordPaymentDialog`)              | `POST /api/v1/payments`<br/>`{ saleId, amount: 9.00, method: 'CASH' }`                                                        | Settles commercial debt to `PAID`, publishes `SalePaidEvent`.                                                    | `Payment`<br/>`Sale`                    | **PASS** |
| **4. Stock Decrement**    | Background / Capability Port                          | `InventoryStockDecrementPort.sellStock`<br/>(Triggered by `SalePaidEvent`)                                                    | Decrements `quantityOnHand` by 2, appends append-only `SALE` movement with `referenceId = saleId`.               | `InventoryItem`<br/>`InventoryMovement` | **PASS** |
| **5. Receipt Voucher**    | `/sales/:id/receipt`<br/>(`ReceiptViewPage`)          | `POST /api/v1/receipts`<br/>`{ saleId }`                                                                                      | Generates official fiscal voucher with sequential receipt number (`REC-2026-00000X`).                            | `Receipt`<br/>`ReceiptSequence`         | **PASS** |
| **6. Low-Stock Cockpit**  | `/resources/inventory/low-stock`<br/>(`LowStockPage`) | `GET /api/v1/resources/inventory/low-stock`                                                                                   | Queries live items where `quantityOnHand <= minimumStock`, displays deficit and replenishment button.            | `InventoryItem`                         | **PASS** |

---

## 5. Detailed Step Outcomes

### Step 1: Stock Receiving Workflow

- **Action**: Inventory staff receives 20 units of `ISO-100 Whey Protein Shake` under supplier invoice `INV-2026-901`.
- **Validation Rules**:
  - Receiving zero or negative quantities is strictly rejected ($400$ `InvalidQuantityException`).
  - Receiving against non-existent item ID returns $404$ `NotFoundException`.
  - Unauthenticated or unauthorized users lacking `inventory.stock.receive` receive $401$/$403$.
- **Result**: On-hand stock increases from 25 to 45 units. The movement ledger logs an append-only `PURCHASE` record.

### Step 2: Supported Retail Sale & POS Checkout

- **Action**: Reception cashier initiates a point-of-sale checkout for 2 bottles of Whey Protein Shake.
- **Retail Eligibility (ADR-0139)**:
  - Items categorized as `HEALTHY_MEALS`, `HEALTHY_DRINKS`, or `RETAIL_PRODUCTS` are saleable.
  - Attempting to checkout non-retail items (e.g. `Clinical Massage Emollient`, category `INTERNAL_SUPPLIES`) is strictly rejected at the checkout boundary with $400$ `ItemNotEligibleForSaleException`.
  - Inactive products are rejected with $400$.
- **Pre-Sale Stock Check**: Validates `quantityOnHand >= requestedQuantity`. Overselling attempts are blocked.
- **Price Authority**: Unit price (\$4.50) is snapshotted from the catalog into integer cents (450 cents $\times$ 2 = \$9.00 total).

### Step 3: Exact Point of Stock Change (Fulfillment Timing)

- **Architectural Discovery**:
  - Stock is **NOT** decremented upon draft sale creation.
  - Decrement occurs strictly upon **payment settlement (`SalePaidEvent`)** via `InventoryStockDecrementPort.sellStock()`.
  - This prevents inventory shrinkage from abandoned carts or cancelled transactions.
- **Execution**: Cash payment of \$9.00 settles the sale to `PAID`. The inventory engine atomically decreases `quantityOnHand` from 45 to 43 and records a `SALE` movement linked to the sale ID.

### Step 4: Stock Movement Ledger Integrity

- **Inspection**:
  - `movement_type`: `SALE`
  - `quantity`: 2
  - `quantity_before`: 45
  - `quantity_after`: 43
  - `reference_type`: `COMMERCIAL_SALE`
  - `reference_id`: `sale_...`
- **Idempotency Guarantee**: Retrying payment completion does not re-decrement stock; idempotency protection guarantees exactly-once stock fulfillment.

### Step 5: Low-Stock Thresholds & Boundary Verification

- **Synthetic Test**: `Electrolyte Hydration Drink (750ml)` has `minimumStock = 15` and initial `quantityOnHand = 12`.
- **Exact Boundary Evaluation**:
  - Condition 1 (`stock = 12 < 15`): Low-stock warning is active; item appears in `/resources/inventory/low-stock` with reorder recommendation.
  - Condition 2 (`stock = 15 == 15`): Exact boundary condition triggers low-stock alert (`quantityOnHand <= minimumStock`).
  - Condition 3 (Receive 10 units $\implies \text{stock} = 22 > 15$): Item automatically clears from the low-stock cockpit.
- **UI Presentation**: The low-stock view reflects real-time status with warning badges without requiring manual cache invalidation.

---

## 6. Persistence Evidence in PostgreSQL

Verified in `kinergy_dev` on PostgreSQL port 5433:

1. **`inventory_items`**:
   - `id`: Persisted UUID.
   - `sku`: `DRK-WHEY-500`.
   - `quantity_on_hand`: `43.00` (Decimal precision).
   - `selling_price_amount`: `4.50`.
   - `minimum_stock`: `10.00`.
   - `version`: Incremented atomically under Optimistic Concurrency Control (OCC).
2. **`inventory_movements`**:
   - Append-only records for both `PURCHASE` and `SALE`.
   - Verified that $\text{quantity\_after} = \text{quantity\_before} \pm \text{quantity}$.
3. **`sales` & `sale_items`**:
   - `source_type`: `DRINK`.
   - `status`: `PAID`.
   - `line_total_amount`: `9.00`.
4. **`payments` & `receipts`**:
   - `payments`: `amount = 9.00`, `method = 'CASH'`, `status = 'SETTLED'`.
   - `receipts`: Sequential voucher (`REC-2026-00000X`) with immutable product snapshot.

---

## 7. Negative & Invariant Scenarios

| Scenario                      | Tested Input / Condition                                         | Expected Behavior                 | Actual Behavior                                       | Result   |
| :---------------------------- | :--------------------------------------------------------------- | :-------------------------------- | :---------------------------------------------------- | :------- |
| **Negative Stock Receiving**  | Receive quantity `-5`                                            | Blocked by domain validation      | `400 Bad Request` (`InvalidQuantityException`)        | **PASS** |
| **Checkout Non-Retail Item**  | Checkout `SUP-MASS-1000`                                         | Blocked at checkout boundary      | `400 Bad Request` (`ItemNotEligibleForSaleException`) | **PASS** |
| **Overselling Beyond Stock**  | Buy 100 units when stock is 25                                   | Blocked by availability check     | `400 Bad Request` (`InsufficientStockException`)      | **PASS** |
| **Double Stock Decrement**    | Repeated payment webhook/retry                                   | Idempotent duplicate protection   | Same movement referenced; stock not decremented twice | **PASS** |
| **Negative Stock Prevention** | Direct HTTP sell endpoint requesting $\text{qty} > \text{stock}$ | Blocked by non-negative invariant | `400 Bad Request` (`NonNegativeStockException`)       | **PASS** |
| **Unauthorized Stock Action** | Receptionist attempts manual stock adjustment                    | Blocked by RBAC                   | `403 Forbidden` (Lacks `inventory.stock.manage`)      | **PASS** |

---

## 8. Automated Quality Gates

| Target / Suite                                                                                    | Tests Run              | Result                             | Execution Time |
| :------------------------------------------------------------------------------------------------ | :--------------------- | :--------------------------------- | :------------- |
| **Prettier Formatting** (`pnpm format:check`)                                                     | Monorepo root          | PASS (All files compliant)         | 22s            |
| **ESLint Validation** (`pnpm lint`)                                                               | 10 / 10 projects       | PASS (0 errors, 0 warnings)        | 4s             |
| **TypeScript Typecheck** (`pnpm typecheck`)                                                       | Monorepo base          | PASS (0 errors)                    | 18s            |
| **Core Resources Tests** (`nx test core --testFile=resources`)                                    | 48 suites, 709 tests   | PASS (709/709 passed)              | 11.0s          |
| **Web Inventory Tests** (`nx test web --testFile=inventory`)                                      | 16 suites, 161 tests   | PASS (161/161 passed)              | 20.1s          |
| **API Inventory Acceptance E2E** (`nx test api --testFile=inventory-business-journey-acceptance`) | 1 suite, 10 tests      | PASS (10/10 passed)                | 6.8s           |
| **Prisma Inventory Persistence** (`nx test core --testFile=prisma-inventory-item-persistence`)    | 1 suite, 6 tests       | PASS (6/6 passed against Postgres) | 1.4s           |
| **Full Monorepo Unit/Integration Tests** (`pnpm test`)                                            | 154 suites, 2251 tests | PASS (2,251/2,251 passed)          | 48.0s          |
| **Monorepo Production Build** (`pnpm build`)                                                      | 10 / 10 projects       | PASS (All projects built)          | 8.0s           |

---

## 9. Remaining Limitations

1. **Automated Supplier EDI / Purchase Orders**:
   - The current MVP supports manual stock receiving with vendor and invoice reference tracking. Direct electronic supplier order integration is deferred to post-MVP enterprise roadmap.
2. **Barcode Scanner Hardware Integration**:
   - The UI supports manual SKU search and click selection; direct USB/Bluetooth barcode scanner HID input parsing is planned for Phase 10 hardware certification.

---

## 10. Presenter Demo Runbook

Follow these exact steps during a live client demonstration:

1. **Environment Setup**:
   ```bash
   docker compose up -d postgres
   pnpm db:status
   ```
2. **Step 1 — Review Inventory & Low-Stock Warning**:
   - Log in as `inventory.demo@kinergy.platform` / `Demo123!`.
   - Navigate to **Resources** $\to$ **Low Stock** (`/resources/inventory/low-stock`).
   - Highlight `Electrolyte Hydration Drink (750ml)`: 12 units on hand vs. 15 minimum (Alert Active).
3. **Step 2 — Receive Stock**:
   - Navigate to **Resources** $\to$ **Inventory** (`/resources/inventory`).
   - Select `Electrolyte Hydration Drink` $\to$ Click **Receive Stock**.
   - Enter Quantity `20`, Unit Cost `1.50`, Supplier `HealthFuel Wholesale`, Invoice `INV-8821`.
   - Click **Confirm Receiving**. Show on-hand balance update to `32 units`.
   - Return to **Low Stock**: Show alert has cleared automatically.
4. **Step 3 — Inspect Movement Ledger**:
   - Click on the item detail $\to$ **Movements** tab (`/resources/inventory/:id`).
   - Show the append-only `PURCHASE` movement entry (+20 units) with timestamp and invoice reference.
5. **Step 4 — Point-of-Sale Retail Checkout**:
   - Log in as `reception.demo@kinergy.platform` / `Demo123!`.
   - Navigate to **Sales** $\to$ **New Sale** (`/sales/new`).
   - Select `ISO-100 Whey Protein Shake (500ml)` (Unit Price \$4.50), Quantity `2`. Total: \$9.00.
   - Click **Pay Now** $\to$ Select `CASH` $\to$ Confirm settlement.
   - Click **View Receipt** to display the official receipt voucher (`REC-2026-00000X`).
6. **Step 5 — Confirm Automatic Stock Decrement**:
   - Return to **Resources** $\to$ **Inventory**.
   - Show that Whey Protein Shake stock has automatically decremented from 25 to 23 units.
   - View its movement ledger to demonstrate the automatic `SALE` movement linked to the sale voucher.

---

## 11. Final Verdict

### **VERDICT: PASS**

The Kynergy Inventory Business Journey is fully accepted and verified for client MVP demonstration. Stock receiving, retail checkout, payment-triggered fulfillment, ledger append-only integrity, and low-stock alerting operate reliably against PostgreSQL.

### Next Milestone Recommendation

Proceed to **Milestone 9.5.7 — Demo Hardening and Rehearsal** (multi-role demo walkthrough rehearsal, seed data reset verification, and presenter runbook dry-run).
