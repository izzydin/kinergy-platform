# Fixed Asset Physical Relocation (Asset Transfer) UX Architecture

**Bounded Context**: `Resources Management`  
**Sub-Domain**: `Fixed Assets`  
**Primary Entity**: `FixedAsset` Aggregate Root  
**Authoritative Mutation Endpoint**: `POST /api/v1/resources/assets/:id/transfer`  
**Application Command**: `TransferFixedAssetLocationCommand`  
**Domain Event**: `AssetTransferredDomainEvent`  
**Audit Ledger Entry**: `AssetHistoryEventType.TRANSFERRED`

---

## 1. Transfer Interaction Model

Asset physical relocation is an **auditable lifecycle transition**, not an arbitrary metadata edit. When capital equipment (e.g. cardio treadmills, physical therapy tables, commercial blenders) moves from one physical location to another:

1. An explicit operational dialogue is initiated via the **Asset Cockpit** (`Transfer` action button) or from the **Deployment Location** tab.
2. The user is presented with the **authoritative current placement context**:
   - Current Facility ID, Room, Micro Zone, and Placement Landmark notes.
   - Current Operational Status (`<AssetStatusBadge>`).
   - Current Physical Condition (`<AssetConditionBadge>`).
   - Asset Category taxonomy (`<AssetCategoryBadge>`).
3. The operator specifies the new target destination:
   - Destination Facility ID (mandatory).
   - Room / Studio (optional).
   - Floor / Micro Zone (optional).
   - Placement Landmarks (optional).
   - Operational Justification / Reason (optional, preserved in the immutable audit log).
4. The frontend dispatches a dedicated domain transfer command.
5. Upon confirmation from the aggregate root, the asset's location changes atomically, an immutable lifecycle history entry is logged, and affected query caches are reconciled immediately.

```
┌────────────────────────────────────────────────────────────────────────┐
│             Fixed Asset Detail Screen (Equipment Cockpit)              │
│                [ Transfer Physical Location Button ]                   │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│                   TransferAssetLocationDialog                          │
│ ┌────────────────────────────────────────────────────────────────────┐ │
│ │ Current Placement: fac-main • Studio A • Zone 1                    │ │
│ │ Status: [ Active ]  •  Condition: [ Excellent ]                    │ │
│ └────────────────────────────────────────────────────────────────────┘ │
│ Destination Facility: [ fac-west                                   ]   │
│ Room / Studio:        [ Cardio Studio B                            ]   │
│ Floor / Micro Zone:   [ Zone 3                                     ]   │
│ Placement Landmarks:  [ Near west windows                          ]   │
│ Justification Reason: [ Studio renovation rebalancing              ]   │
│                                                                        │
│                      [ Cancel ]  [ Execute Transfer → ]                │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │ POST /api/v1/resources/assets/:id/transfer
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│                  Authoritative Backend Execution                       │
│  1. Assert not SOLD or RETIRED ([AST-INV-1], [AST-INV-2])              │
│  2. Assert authenticated actor ID ([AST-INV-3])                        │
│  3. AssetLocation.create(...) Value Object validation                  │
│  4. Idempotency check: if current == target, no-op                     │
│  5. Append AssetHistoryEventType.TRANSFERRED to immutable ledger       │
│  6. Emit AssetTransferredDomainEvent                                   │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│                    Frontend Cache Reconciliation                       │
│  • assetsQueryKeys.detail(id)        (Refreshes cockpit location)      │
│  • assetsQueryKeys.lists()           (Refreshes catalog table)         │
│  • assetsQueryKeys.historyLists(id)  (Appends new audit event)         │
│  • Success Notification: "Asset 'Name' relocated to facility fac-west" │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Destination Representation

Location is structured around the domain's authoritative `AssetLocation` Value Object:

- `facilityId` (`string`, required): Canonical campus or site identifier (e.g. `fac-main`, `fac-west`, `Campus 2`).
- `roomId` (`string`, optional): Dedicated room, studio, or suite (e.g. `Cardio Studio A`, `Physical Therapy Suite 3`).
- `zone` (`string`, optional): Micro zone or floor coordinate (e.g. `Zone 2 East`, `Row 4`).
- `description` (`string`, optional): Human-readable placement landmarks (e.g. `Under air vent 4, south corner`).

Location is **not** a loose, unstructured comment string. It represents a structured multi-tier physical placement model that supports facility-level filtering, room-level scheduling, and technician routing.

---

## 3. Lifecycle Restrictions & Terminal Invariants

Per enterprise domain invariants:

- **`[AST-INV-1]` (Retired Invariant)**: Equipment in `RETIRED` status is permanently decommissioned. Physical transfer is strictly prohibited.
- **`[AST-INV-2]` (Sold Invariant)**: Equipment in `SOLD` status has been liquidated and realized. Physical transfer is strictly prohibited.
- **UI Boundary Enforcement**:
  - When the dialog opens for an asset with `status === RETIRED` or `status === SOLD`, the UI renders a prominent warning alert:
    `Terminal Lifecycle State ({status}) — Per domain invariants [AST-INV-1] and [AST-INV-2], decommissioned equipment cannot be relocated. Physical transfer is prohibited.`
  - All form fields (`<fieldset disabled>`) and the submit button are disabled.
  - If a backend rejection occurs due to a concurrent status transition, the backend error is preserved and surfaced directly in the dialog.

---

## 4. Pending Behavior & Concurrency Protection

To ensure transactional integrity and prevent duplicate submissions:

- While the mutation is executing (`isPending === true`):
  - The submit button is disabled.
  - The submit button icon switches to an animated `<Loader2 className="animate-spin" />` with text `Relocating...`.
  - The entire form `<fieldset>` is disabled, preventing double-clicks or rapid keystrokes from creating redundant requests.
  - The `Cancel` button is disabled to prevent unmounting during in-flight network transit.

---

## 5. Success Behavior

Upon HTTP `200 OK` from `POST /api/v1/resources/assets/:id/transfer`:

1. The dialog automatically closes (`onOpenChange(false)`).
2. Any registered `onSuccess` callback is invoked.
3. A standardized global success notification is dispatched via `useNotification().success(...)`:
   `Asset "{name}" relocated to facility {destinationFacilityId}`
4. Authoritative query caches are refreshed so the new location is reflected instantly across the application without requiring a manual page reload.

---

## 6. Failure Handling

If the transfer operation fails:

- The dialog **remains open** to allow the operator to inspect the error and correct their input without losing form state.
- A prominent `<Alert variant="destructive" data-testid="transfer-server-error">` is rendered at the top of the dialog, displaying the exact error message returned by the backend:
  - Invalid destination facility (`"Target facility 'X' does not exist in domain registry"`).
  - Terminal state rejection (`"Cannot transfer an asset in RETIRED or SOLD status"`).
  - Security permission denied (`"Forbidden resource"`).
  - Network timeout or unexpected infrastructure errors.

---

## 7. Cache Reconciliation Strategy

The mutation hook `useTransferAssetLocation` invalidates all query keys impacted by physical movement:

- **Asset Detail**: `assetsQueryKeys.detail(id)` — immediately updates the cockpit's Placement KPI card and Deployment Location card.
- **Asset Catalog**: `assetsQueryKeys.lists()` — updates catalog tables, including any location-filtered views (`facilityId`).
- **Asset History**: `assetsQueryKeys.historyLists(id)` — ensures the newly emitted `TRANSFERRED` event appears in the timeline.

Unrelated cache trees (such as gym memberships, appointment schedules, or inventory stock counts) are **not** invalidated, keeping network overhead minimal.

---

## 8. Permission & Authorization Behavior

- **Required Permission**: `assets.write`.
- **Authorized Roles**: `ADMIN`, `SUPER_ADMIN`, `OWNER`, or any user granted `assets.write`.
- **Enforcement**:
  - Operators lacking `assets.write` do not have access to the `Transfer` button on the Asset Detail Cockpit.
  - Direct HTTP requests without the `assets.write` permission or role are rejected by NestJS `@Permissions('assets.write')` guard with HTTP `403 Forbidden`.

---

## 9. Accessibility Considerations

- **Modal Semantics**: Renders within a Radix UI `<Dialog>` primitive with `role="dialog"` and `aria-modal="true"`.
- **Descriptive Labelling**:
  - `DialogTitle` is linked via `aria-labelledby`.
  - `DialogDescription` is linked via `aria-describedby`.
- **Keyboard Navigation**:
  - Focus is trapped within the dialog while open.
  - Pressing `Escape` invokes `onOpenChange(false)` (unless `isPending`).
  - Focus returns to the triggering button upon dialog closure.
- **Screen Reader Announcements**:
  - Errors and terminal warnings are wrapped in `<Alert>` with `role="alert"` for immediate screen reader announcement.
  - Required fields are marked with `aria-required="true"`.
