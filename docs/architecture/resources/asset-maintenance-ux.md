# Fixed Asset Maintenance Recording & Servicing Ledger UX Architecture

**Bounded Context**: `Resources Management`  
**Sub-Domain**: `Fixed Assets`  
**Primary Entity**: `FixedAsset` Aggregate Root  
**Authoritative Mutation Endpoint**: `POST /api/v1/resources/assets/:id/maintenance`  
**Authoritative Query Endpoint**: `GET /api/v1/resources/assets/:id/maintenance`  
**Application Command**: `RecordFixedAssetMaintenanceCommand`  
**Domain Event**: `AssetMaintenanceRecordedDomainEvent`  
**Audit Ledger Entry**: `AssetHistoryEventType.MAINTENANCE_RECORDED`

---

## 1. Maintenance Interaction Model

Fixed asset maintenance represents an **authoritative, auditable physical lifecycle event**, not an unstructured text memo or loose comment. When gym equipment (such as cardio treadmills, selectorized weight stacks, or physical therapy tables) undergoes repair or preventative servicing:

1. **Explicit Operational Trigger**:
   - The dialogue is launched via the **Asset Cockpit** (`Record Maintenance` action button) or from the dedicated **Servicing Ledger** (`/resources/assets/:id/maintenance`).
2. **Current Equipment Context**:
   - The operator inspects the authoritative status, condition, category, and current operational facility/room before logging servicing work.
3. **Structured Work Order Submission**:
   - **Service Date** (`serviceDate`, required): Date on which the physical service was performed.
   - **Work Order Description** (`description`, required): Summary of maintenance tasks (e.g. `Motor belt replacement and deck realignment`).
   - **Invoiced Cost Amount** (`costAmount`, required): Exact non-negative decimal value representing repair cost.
   - **Currency** (`costCurrency`, required): Standard ISO-4217 code (default `USD`).
   - **Performed By** (`performedBy`, required): Technician name, internal facility staff, or external authorized vendor (e.g. `Precor Authorized Service Corp`).
   - **Condition Evaluation** (`updateConditionTo`, optional): Allows the technician to update the asset's physical condition upon job completion.
   - **Work Order Notes** (`notes`, optional): Observations, calibration readings, or warranty references.
4. **Lifecycle Auto-Recovery Notification**:
   - If the asset is currently in `UNDER_MAINTENANCE` or `DAMAGED` status, the dialog informs the operator that assigning a serviceable condition (`EXCELLENT`, `GOOD`, or `FAIR`) automatically restores operational status to `ACTIVE`.

```
┌────────────────────────────────────────────────────────────────────────┐
│             Fixed Asset Detail Cockpit / Maintenance Route             │
│                 [ Record Maintenance / Work Order ]                    │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│                   RecordAssetMaintenanceDialog                         │
│ ┌────────────────────────────────────────────────────────────────────┐ │
│ │ Equipment: Treadmill TX-900 • Status: DAMAGED • Condition: POOR   │ │
│ └────────────────────────────────────────────────────────────────────┘ │
│ ┌────────────────────────────────────────────────────────────────────┐ │
│ │ ℹ Domain Notice: Completing maintenance and setting condition to   │ │
│ │   serviceable (Fair, Good, Excellent) automatically restores       │ │
│ │   asset status to ACTIVE.                                          │ │
│ └────────────────────────────────────────────────────────────────────┘ │
│ Service Date:       [ 2026-09-04                                    ]  │
│ Performed By:       [ LifeFitness Certified Technician              ]  │
│ Work Description:   [ Drive belt replacement and lubrication        ]  │
│ Invoiced Cost:      [ $ 250.00                                  USD ]  │
│ Resulting Condition:[ GOOD (Operational & Normal Wear)              ]  │
│ Maintenance Notes:  [ Tested under full load for 30 minutes         ]  │
│                                                                        │
│                      [ Cancel ]  [ Log Maintenance Record → ]          │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │ POST /api/v1/resources/assets/:id/maintenance
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│                  Authoritative Backend Execution                       │
│  1. Enforce invariant: not RETIRED [AST-INV-1] or SOLD [AST-INV-6]     │
│  2. Instantiate Money(costAmount, costCurrency) Value Object           │
│  3. If updateConditionTo provided, mutate asset condition              │
│  4. Auto-Recovery Rule: if status ∈ {UNDER_MAINTENANCE, DAMAGED} and   │
│     condition ∉ {OUT_OF_SERVICE, NEEDS_REPAIR}, transition to ACTIVE   │
│  5. Append MaintenanceRecord to asset's maintenance sub-collection     │
│  6. Append AssetHistoryEventType.MAINTENANCE_RECORDED to history ledger│
│  7. Emit AssetMaintenanceRecordedDomainEvent                           │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│                    Frontend Cache Reconciliation                       │
│  • assetsQueryKeys.detail(id)            (Refreshes cockpit status)    │
│  • assetsQueryKeys.maintenanceLists(id)  (Refreshes servicing ledger)  │
│  • assetsQueryKeys.historyLists(id)      (Refreshes lifecycle audit)   │
│  • assetsQueryKeys.lists()               (Refreshes equipment catalog) │
│  • Success Notification: "Maintenance recorded for asset '...'"        │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Monetary Precision & Safeguards

Maintenance invoices must adhere to strict enterprise financial guidelines:

- **No Floating-Point Math**: Monetary inputs are parsed directly as decimal representations. Calculation of multi-currency conversions or depreciation is strictly forbidden on the client side.
- **Value Object Mapping**: The frontend sends `{ amount: number, currency: string }` matching the domain's immutable `Money` Value Object.
- **Currency Enforcement**: Defaults to ISO-4217 `USD` and preserves server-specified currencies.
- **Confidentiality & Role-Based Masking**:
  - Maintenance repair costs are treated as sensitive financial data under the resource valuation security policy.
  - Users possessing `billing.read`, `valuation.read`, or administrative roles (`ADMIN`, `SUPER_ADMIN`, `OWNER`) view exact amounts (e.g. `$250.00`).
  - Users without financial permissions receive a masked `<Badge variant="outline"><Lock /> Confidential</Badge>` protecting vendor negotiation and internal repair costs.

---

## 3. Lifecycle Relationship & Domain Auto-Recovery

### A. Authoritative Auto-Recovery

In Kinergy's domain aggregate (`FixedAsset.recordMaintenance`):

- When equipment is flagged as `UNDER_MAINTENANCE` or `DAMAGED`:
  - Setting `updateConditionTo` to `EXCELLENT`, `GOOD`, or `FAIR` **automatically transitions the asset's status to `ACTIVE`**.
  - Setting condition to `NEEDS_REPAIR` or `OUT_OF_SERVICE` retains non-operational status.
- The UI surfaces this domain behavior proactively in a contextual info banner so operators understand the immediate operational effect.

### B. Terminal State Prohibitions

Per enterprise domain invariants:

- **`[AST-INV-1]`**: Equipment in `RETIRED` status is permanently decommissioned.
- **`[AST-INV-6]`**: Equipment in `SOLD` status has been liquidated.
- **UI Boundary Enforcement**:
  - The dialog detects terminal states and renders a destructive alert:
    `Decommissioned Equipment ({status}) — Per domain invariants [AST-INV-1] and [AST-INV-6], maintenance cannot be recorded on retired or sold assets.`
  - All form fields and action buttons are disabled.

---

## 4. Authoritative Servicing Ledger (`/resources/assets/:id/maintenance`)

The dedicated Maintenance Route provides a comprehensive audit trail:

1. **Metric Overview Cards**:
   - **Total Work Orders**: Aggregated count of servicing events.
   - **Current Physical Rating**: Live `<AssetConditionBadge>`.
   - **Operational Placement**: Facility and room coordinates.
2. **Technician / Vendor Filtering**:
   - Live search input filtering maintenance records by `performedBy` (case-insensitive substring match).
   - Instant page reset to page 1 upon typing.
3. **Chronological Servicing List**:
   - Structured work order card displaying:
     - Work Order badge and task description.
     - Formatted service date (`MMM D, YYYY`).
     - Technician or servicing vendor name.
     - Invoiced cost (or Confidential lock badge).
     - Technician observations and notes.
4. **Pagination**:
   - Server-backed pagination controls (`Previous`, `Next`, and item counter) preserving filter state.
5. **Async & Fallback States**:
   - **Loading Skeleton**: Dedicated `ledger-loading` skeleton matching layout structure.
   - **Empty Ledger**: Contextual empty state prompting the first work order if authorized.
   - **Filtered Empty State**: Clear feedback when filter criteria return zero records.
   - **Query Error**: Error boundary with explicit retry trigger.

---

## 5. Authorization & Permissions

| Action / Surface               | Required Permission / Role                  | Behavior when Unauthorized                |
| :----------------------------- | :------------------------------------------ | :---------------------------------------- |
| **Record Work Order Modal**    | `assets.write`                              | Action button hidden; dialog inaccessible |
| **View Servicing Ledger**      | `assets.read`                               | Route accessible to all asset inspectors  |
| **View Invoiced Cost Figures** | `billing.read` OR `valuation.read` OR Admin | Masked with `Confidential` lock badge     |

---

## 6. Verification & Test Coverage

All maintenance operations are rigorously tested under `apps/web/src/modules/resources/assets/__tests__/asset-maintenance-workflow.spec.tsx`:

- `RecordAssetMaintenanceDialog`:
  - Logs valid servicing work order and invalidates asset/maintenance queries.
  - Renders domain auto-recovery hint when servicing `DAMAGED` equipment.
  - Prohibits maintenance recording on `RETIRED` assets per `[AST-INV-1]` and `[AST-INV-6]`.
- `AssetMaintenancePage`:
  - Renders complete servicing ledger with work orders and authorized financial figures.
  - Protects financial figures with Confidential lock badge when user lacks `billing.read`.
  - Renders appropriate empty state when no maintenance records exist.
