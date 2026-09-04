# Fixed Asset Lifecycle History & Auditability UX Architecture

**Bounded Context**: `Resources Management`  
**Sub-Domain**: `Fixed Assets`  
**Primary Entity**: `FixedAsset` Aggregate Root  
**Authoritative Query Endpoint**: `GET /api/v1/resources/assets/:id/history`  
**Application Query**: `GetAssetHistoryQuery`  
**Domain Event Set**: `AssetCreatedDomainEvent`, `AssetTransferredDomainEvent`, `AssetStatusChangedDomainEvent`, `AssetConditionChangedDomainEvent`, `AssetValuationUpdatedDomainEvent`, `AssetMaintenanceRecordedDomainEvent`, `AssetRetiredDomainEvent`, `AssetSoldDomainEvent`  
**Authoritative Event Enum**: `AssetHistoryEventType`

---

## 1. Auditability & Interaction Model

Equipment auditability is a fundamental governance requirement in capital asset management. When a facility manager, auditor, or insurance inspector asks:

> _"What happened to this piece of equipment over its operational lifetime?"_

The frontend reconstructs the authoritative, tamper-evident lifecycle history from domain events appended to the aggregate root's immutable history ledger.

### A. Meaningful Lifecycle Events vs. Technical Noise

The history ledger captures **business-significant domain transitions**, not arbitrary metadata churn:

- **No-Op Filtering**: The backend domain explicitly forbids recording `UPDATED` history entries if no actual fields were altered (`Object.keys(changedFields).length === 0`).
- **Domain Event Alignment**: Only the 9 approved lifecycle transitions produce history entries:
  1. `CREATED`: Asset registered and commissioned at physical baseline.
  2. `UPDATED`: Meaningful attribute modifications (`name`, `description`, `notes`).
  3. `TRANSFERRED`: Physical relocation between facilities, rooms, or zones.
  4. `STATUS_CHANGED`: State transitions (e.g. `ACTIVE` ↔ `UNDER_MAINTENANCE` ↔ `DAMAGED`).
  5. `CONDITION_CHANGED`: Physical inspection re-rating (e.g. `GOOD` → `NEEDS_REPAIR`).
  6. `VALUE_UPDATED`: Economic book value or fair market appraisal update.
  7. `MAINTENANCE_RECORDED`: Servicing, repairs, or preventative maintenance work orders.
  8. `RETIRED`: Permanent decommissioning from active service.
  9. `SOLD`: Liquidation / salvage realization (terminal state).

---

## 2. Presentation Model: Structured Timeline vs. Raw Records

Following Kinergy's longitudinal activity stream design conventions (seen in client activity and kinesiology treatment streams), asset history uses a **vertical chronological timeline**:

```
┌────────────────────────────────────────────────────────────────────────┐
│             Fixed Asset Detail Screen (Equipment Cockpit)              │
│                [ Tab: Lifecycle Audit History ]                        │
│                └── AssetHistoryPreview (Latest 5 Events)               │
│                └── [ View Complete Audit History → ]                   │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│           Dedicated Route: /resources/assets/:id/history               │
│ ┌────────────────────────────────────────────────────────────────────┐ │
│ │ Header: Equipment Name & Tag • Category, Status, Condition Badges  │ │
│ └────────────────────────────────────────────────────────────────────┘ │
│ ┌────────────────────────────────────────────────────────────────────┐ │
│ │ Overview Metrics: Total Events • Current State • Current Condition │ │
│ └────────────────────────────────────────────────────────────────────┘ │
│ ┌────────────────────────────────────────────────────────────────────┐ │
│ │ Toolbar: [Event Filter: All/Transfers/Status/...] [Sort Order] [⟳] │ │
│ └────────────────────────────────────────────────────────────────────┘ │
│                                                                        │
│   ● [Latest Event] Status Transition: UNDER_MAINTENANCE → ACTIVE       │
│   │   Reason: Completed preventative service and load testing          │
│   │   Audited by: usr-tech-01 • Sep 4, 2026, 08:00 AM                  │
│   │                                                                    │
│   ● Maintenance Serviced: Belt replacement ($350.00 by Matrix Tech)   │
│   │   Context: Vendor Matrix Certified • Sep 3, 2026                   │
│   │                                                                    │
│   ● Relocated: [Storage] → [Cardio Zone A • Row 3]                     │
│   │   Reason: Gym floor rebalancing deployment                         │
│   │                                                                    │
│   ● Commissioned: Asset registered at fac-main • Storage               │
│       Baseline: Tag AST-CARDIO-001 • Gym Equipment • Good              │
│                                                                        │
│ ┌────────────────────────────────────────────────────────────────────┐ │
│ │ Pagination Controls: [Previous] Page 1 of 1 (4 items) [Next]       │ │
│ └────────────────────────────────────────────────────────────────────┘ │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 3. Contextual Event Decoders

Rather than displaying unformatted JSON blobs, each timeline card (`AssetHistoryItem`) decodes domain-specific metadata into meaningful UI components:

| Event Type                 | Visual Representation                   | Context Decoded                                                        |
| :------------------------- | :-------------------------------------- | :--------------------------------------------------------------------- |
| **`STATUS_CHANGED`**       | Purple badge (`Status Transition`)      | `<AssetStatusBadge>` prior → `<AssetStatusBadge>` new                  |
| **`CONDITION_CHANGED`**    | Amber badge (`Condition Rated`)         | `<AssetConditionBadge>` prior → `<AssetConditionBadge>` new            |
| **`TRANSFERRED`**          | Indigo badge (`Relocated`)              | `<MapPin>` `[From: Facility / Room]` → `[To: Facility / Room]`         |
| **`VALUE_UPDATED`**        | Teal badge (`Valuation Appraised`)      | `<DollarSign>` Valuation delta (`$Prior → $New`) or Confidential badge |
| **`MAINTENANCE_RECORDED`** | Cyan badge (`Maintenance Serviced`)     | `<Wrench>` Servicing date, technician/vendor, invoiced cost            |
| **`SOLD`**                 | Slate badge (`Liquidated / Sold`)       | Transition to `SOLD` + liquidation sale proceeds                       |
| **`RETIRED`**              | Rose badge (`Decommissioned / Retired`) | Transition to `RETIRED` + decommissioning justification                |
| **`UPDATED`**              | Blue badge (`Metadata Updated`)         | Modified attribute chips (`name: Old → New`, `notes`, etc.)            |
| **`CREATED`**              | Emerald badge (`Commissioned`)          | Initial baseline equipment taxonomy, status, and placement             |

---

## 4. Role-Based Financial Confidentiality

In adherence to Kinergy's Resource Valuation & Sensitive Data Security Policy:

- Equipment acquisition costs, appraisal valuations, repair expenses, and sale proceeds are restricted to authorized financial personnel.
- The UI checks `hasPermission('billing.read') || hasPermission('valuation.read') || hasRole('ADMIN') || hasRole('SUPER_ADMIN') || hasRole('OWNER')`.
- Unauthorized users (e.g. gym floor staff or read-only auditors) see monetary values masked behind:
  `<Badge variant="outline" data-testid="confidential-cost-badge"><Lock /> Confidential</Badge>` or
  `<Badge variant="outline" data-testid="confidential-valuation-badge"><Lock /> Confidential Valuation</Badge>`.

---

## 5. Differentiated Empty & Async States

The audit history experience distinguishes between distinct operational conditions:

1. **Initial Baseline Only**:
   When equipment is brand new and has only its `CREATED` event, an informative notice informs staff:
   `Initial Baseline Record — This equipment currently has only its baseline commissioning entry. Subsequent physical relocations, operational status changes, condition re-ratings, or servicing events will appear here in chronological sequence.`
2. **Zero History Available**:
   Empty state informing user that no events are available.
3. **Filtered Empty State**:
   When an active filter (e.g., `Relocations`) produces zero records, displays:
   `No audit entries found matching the filter 'TRANSFERRED'` with a prominent `Clear Event Filter` button.
4. **Loading Skeleton**:
   Skeletons matching the timeline rail structure (`history-loading`).
5. **Query Failure**:
   Destructive alert with an explicit `Retry Query` button.

---

## 6. Verification & Test Coverage

Automated integration test suites:

- **`apps/web/src/modules/resources/assets/__tests__/asset-history-workflow.spec.tsx`**:
  - Full lifecycle chronological stream rendering.
  - Contextual decoders for status, condition, transfer, and maintenance.
  - Role-based financial masking for unauthorized inspectors.
  - Event type filtering and filter resetting.
  - Initial baseline commissioning alert.
  - Empty history rendering.
  - Cockpit preview integration and navigation.
- **`apps/web/src/modules/resources/assets/__tests__/assets-routing.spec.tsx`**:
  - Validates permission protection for `/resources/assets/:id/history`.
