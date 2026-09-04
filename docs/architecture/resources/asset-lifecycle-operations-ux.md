# Fixed Asset Explicit Lifecycle Operations UX Architecture

**Bounded Context**: `Resources Management`  
**Sub-Domain**: `Fixed Assets`  
**Primary Entity**: `FixedAsset` Aggregate Root  
**Relevant Operations**:

- Status Transition: `POST /api/v1/resources/assets/:id/status` (`ChangeFixedAssetStatusCommand`)
- Condition Inspection: `POST /api/v1/resources/assets/:id/condition` (`UpdateFixedAssetConditionCommand`)
- Carrying Valuation: `POST /api/v1/resources/assets/:id/valuation` (`UpdateFixedAssetValuationCommand`)

---

## 1. Status Change Interaction Model & State-Machine Integration

The asset lifecycle is not an arbitrary dropdown containing every possible enum. The current state strictly determines which transitions are valid:

- **Authoritative State Machine**: Driven directly by `AssetLifecycleStateMachine.getAllowedTransitions(currentStatus)` imported from `@kinergy-platform/core`.
- **Allowed Transition Discovery**:
  - `ACTIVE` → `[UNDER_MAINTENANCE, DAMAGED, RETIRED]`
  - `UNDER_MAINTENANCE` → `[ACTIVE, DAMAGED, RETIRED]`
  - `DAMAGED` → `[UNDER_MAINTENANCE, ACTIVE, RETIRED]`
  - `RETIRED` → Terminal state; status changes locked (`[AST-INV-1]`).
  - `SOLD` → Irreversible terminal state; all transitions locked (`[AST-INV-2]`).
- **Direct Liquidation Prohibition**: Direct status transition to `SOLD` is prohibited by the domain. Asset liquidation requires recording the realization sale proceeds through the explicit `sell()` domain method.
- **Physical Condition Constraint**:
  - If an asset is in `UNDER_MAINTENANCE` or `DAMAGED` and its physical condition is `OUT_OF_SERVICE`, attempting to restore it to `ACTIVE` is blocked by the domain rule.
  - The UI presents a clear diagnostic alert: `Cannot Restore to Active (Condition Blocked) — An asset with physical condition OUT_OF_SERVICE cannot return to ACTIVE status. Perform repairs and upgrade condition first.`
- **Mandatory Reason**: Status transition requires an operational justification of at least 3 characters, preserved in the immutable lifecycle audit history (`AssetHistoryEventType.STATUS_CHANGED`).

---

## 2. Condition Inspection Model & Severity Hierarchy

Physical condition represents certified mechanical and cosmetic serviceability, distinct from operational status:

- **Severity Hierarchy**: Structured according to the 5-point severity ranking in `ASSET_CONDITION_REGISTRY`:
  - `Rank 1: EXCELLENT` — Factory-grade operational performance.
  - `Rank 2: GOOD` — Fully functional with normal cosmetic wear.
  - `Rank 3: FAIR` — Operational; scheduled preventative maintenance recommended.
  - `Rank 4: NEEDS_REPAIR` — Impaired; flags equipment for priority technician attention.
  - `Rank 5: OUT_OF_SERVICE` — Inoperable / safety hazard; blocks operational scheduling.
- **Maintenance Priority Trigger**: Selecting `NEEDS_REPAIR` or `OUT_OF_SERVICE` renders an informative notice explaining that this rating flags the equipment for priority maintenance.
- **Immutable History**: Each condition change produces an `AssetConditionChangedDomainEvent` and an `AssetHistoryEventType.CONDITION_CHANGED` entry.

---

## 3. Carrying Valuation Model & Dual-Permission Security Boundaries

Valuation updates alter the corporate balance sheet carrying value of capital equipment:

- **Dual-Permission Gate**:
  - Modifying capital valuations requires **both** `assets.write` AND `billing.read` (or `valuation.read`).
  - Operators lacking financial credentials see an explicit lock banner: `Dual-Permission Authorization Required — Modifying capital carrying valuations requires both assets.write and billing.read permissions.`
- **Non-Negative Validation**:
  - Enforces client and server validation ensuring `estimatedValueAmount >= 0.00`.
- **Monetary Representation**:
  - Deterministic USD currency formatting with `'en-US'` locale conventions (`$1,200.00`).
- **History & Reconciliation**:
  - Generates `AssetHistoryEventType.VALUE_UPDATED` with previous and updated amounts.
  - Invalidates `assetsQueryKeys.detail(id)`, `assetsQueryKeys.valuation(id)`, `assetsQueryKeys.historyLists(id)`, and `['resources', 'valuation']`.

---

## 4. Terminal State Restrictions (`[AST-INV-1]` & `[AST-INV-2]`)

- **`RETIRED` Equipment (`[AST-INV-1]`)**:
  - Permanently decommissioned from fleet use.
  - Status cannot be changed back to `ACTIVE`, `UNDER_MAINTENANCE`, or `DAMAGED`.
  - Condition inspections are prohibited.
  - Physical relocation is prohibited.
- **`SOLD` Equipment (`[AST-INV-2]`)**:
  - Ownership transferred outside company boundary.
  - Irreversible terminal state: cannot change status, update condition, relocate, or re-appraise.
- **UI Presentation**:
  - Terminal assets render prominent destructive alerts explaining the invariant.
  - Action buttons and form fieldsets are disabled.

---

## 5. Cache Reconciliation Matrix

| Lifecycle Operation   | Queries Reconciled                                                                                                                                         |
| :-------------------- | :--------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Change Status**     | `assetsQueryKeys.detail(id)`, `assetsQueryKeys.lists()`, `assetsQueryKeys.historyLists(id)`, `['resources', 'valuation']`                                  |
| **Update Condition**  | `assetsQueryKeys.detail(id)`, `assetsQueryKeys.lists()`, `assetsQueryKeys.historyLists(id)`                                                                |
| **Update Valuation**  | `assetsQueryKeys.detail(id)`, `assetsQueryKeys.lists()`, `assetsQueryKeys.valuation(id)`, `assetsQueryKeys.historyLists(id)`, `['resources', 'valuation']` |
| **Relocate Location** | `assetsQueryKeys.detail(id)`, `assetsQueryKeys.lists()`, `assetsQueryKeys.historyLists(id)`                                                                |

---

## 6. Failure Handling & Diagnostic Preservation

When a lifecycle transition is rejected by backend business invariants (e.g. concurrent state modification, illegal transition path, missing permissions):

1. The dialog remains open.
2. In-flight input data is preserved.
3. The exact error message from the domain layer is surfaced in a high-visibility `<Alert variant="destructive">` at the top of the modal.
