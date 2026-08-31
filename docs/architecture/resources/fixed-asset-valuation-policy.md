# Fixed Asset Valuation Policy

## Metadata

- **Author**: Principal Domain Architect & Asset Lifecycle Specialist
- **Phase**: Phase 6 — Resources Management
- **Milestone**: Milestone 6.8 — Resource Valuation
- **Status**: `AUTHORITATIVE POLICY`
- **Review Date**: August 31, 2026

---

## 1. Business Purpose

The fixed asset valuation policy defines the deterministic, auditable rules for evaluating capital equipment (gym machines, wellness devices, therapy equipment, kitchen fixtures, and electronic infrastructure) owned and deployed across Kinergy facilities.

When the business owner or management team inspects the executive valuation dashboard to answer:

> _"What is the total monetary value of our physical equipment, which assets are included, and why?"_

the system must provide a deterministic calculation derived exclusively from authoritative domain data, honoring lifecycle states without hidden assumptions or arbitrary adjustments.

---

## 2. Selected Valuation Formula & Authoritative Fields

### 2.1 Primary Carrying Value (Current Fair Book Value)

The authoritative metric for active fixed asset resource value on management dashboards is the **Current Estimated Carrying Value**:

$$\text{Active Asset Value} = \sum_{a \in \text{EligibleAssets}} a.\text{currentEstimatedValueAmount}$$

- **Authoritative Field**: `FixedAsset.currentEstimatedValue` (`fixed_assets.current_estimated_value_amount Decimal(10, 2)`).
- **Domain Value Object**: `Money` VO (Scale 2 fixed precision, ISO-4217 currency).

### 2.2 Secondary Financial Dimensions (Distinct Reporting Streams)

- **Historical Acquisition Capital (CAPEX)**: $\sum a.\text{purchaseValueAmount}$ (tracks total capital deployed).
- **Cumulative Maintenance OpEx**: $\sum \text{AssetMaintenanceRecord.costAmount}$ (tracks operational upkeep expenses; segregated from capital asset value).

---

## 3. Mandatory Lifecycle State Inclusion Matrix

To ensure that the same database state always produces the exact same valuation result, asset inclusion is governed by an explicit lifecycle matrix:

| Lifecycle Status    | Valuation Status       | Business Justification                                                                               | Financial Rationale                                                                                |
| :------------------ | :--------------------- | :--------------------------------------------------------------------------------------------------- | :------------------------------------------------------------------------------------------------- |
| `ACTIVE`            | **INCLUDED**           | Asset is deployed, fully commissioned, and in active operational service.                            | Contributes active utility and carrying book value to business operations.                         |
| `UNDER_MAINTENANCE` | **INCLUDED**           | Asset is temporarily in service/repair. Legal ownership and operational capital remain with Kinergy. | Temporary service interruption does not extinguish capital asset ownership.                        |
| `DAMAGED`           | **INCLUDED**           | Asset is impaired or defective, but remains business property pending repair or write-down.          | Carrying value reflects assessed worth (revalued via administrative action).                       |
| `RETIRED`           | **EXCLUDED (Default)** | Asset is decommissioned, scrapped, or written off from operational service.                          | Removed from active resource valuation. Retained for historical audit and disposal tracking.       |
| `SOLD`              | **EXCLUDED**           | Asset has been liquidated or transferred to a third party.                                           | Legal and physical ownership has departed the organization boundary. Value to Kinergy is $\$0.00$. |

---

## 4. Condition Rating vs. Valuation Decoupling

In Kinergy, **Asset Condition** and **Asset Valuation** are separate, decoupled domain concepts:

- **Condition Ratings** (`EXCELLENT`, `GOOD`, `FAIR`, `NEEDS_REPAIR`, `OUT_OF_SERVICE`): Represent qualitative, physical health assessments recorded by trainers, facilities staff, or technicians.
- **Valuation (`currentEstimatedValue`)**: Represents quantitative financial carrying value.

### Invariant:

Qualitative condition ratings **do not trigger automatic programmatic discounts or double-deductions** on `currentEstimatedValue`. If an asset suffers physical degradation, the authorized financial administrator updates `currentEstimatedValue` explicitly via `UpdateFixedAssetValuationCommand`.

---

## 5. Specific Lifecycle Treatments

### 5.1 Under-Maintenance Treatment

- Assets in `UNDER_MAINTENANCE` state remain in active facility inventory.
- Their `currentEstimatedValue` continues to contribute to the active asset total.

### 5.2 Damaged Asset Treatment

- Damaged equipment remains on the balance sheet until formal write-down, salvage, or disposal.
- When damage impairs value, the book value is adjusted via explicit revaluation mutation.

### 5.3 Retired Asset Treatment

- `RETIRED` assets are excluded from active equipment summaries by default.
- If an audit query requests decommissioned equipment (`includeDecommissioned = true`), retired assets are reported in a distinct, segregated audit stream (`totalRetiredValueAmount`).

### 5.4 Sold Asset Treatment

- `SOLD` assets are permanently excluded from Kinergy resource carrying value.
- Sale proceeds and gain/loss on disposal are domain concerns of billing/invoicing, not active asset inventory.

### 5.5 Maintenance Record Relationship

- Incurring maintenance expenditures (`POST /assets/:id/maintenance`) logs operational expenses in `AssetMaintenanceRecord`.
- Maintenance records **do not automatically increase or decrease `currentEstimatedValue`**. Capitalization of major overhauls is handled via explicit valuation update.

---

## 6. Precision & Arithmetic Rounding Rules

1. **Non-Negative Invariant**: `currentEstimatedValue >= 0.00` and `purchaseValue >= 0.00`.
2. **Line-Item Integer Arithmetic**:
   $$\text{assetValueCents} = \text{Math.round}(\text{currentEstimatedValueAmount} \times 100)$$
3. **Aggregate Accumulation**:
   $$\text{totalCents} = \sum \text{assetValueCents}$$
   $$\text{totalActiveAssetValue} = \frac{\text{totalCents}}{100}$$
4. **Zero Float Drift**: Integer cents summation guarantees 100% mathematical consistency across line items, category breakdowns, and grand totals.

---

## 7. Future Lifecycle Extensions & Non-Goals

1. **Automated Scheduled Depreciation**: Milestone 6.8 does not implement automatic straight-line or MACRS automated depreciation chron-jobs; valuations are adjusted on-demand via domain commands.
2. **Physical Salvage Auctions**: Tracking bidding or external consignment is out of scope.
3. **Multi-Currency Normalization**: Grouped by native currency code; FX conversion is handled at reporting layer.

---

## 8. Rejected Alternatives

| Alternative                                                            | Description                                                              | Reason for Rejection                                                                                                         |
| :--------------------------------------------------------------------- | :----------------------------------------------------------------------- | :--------------------------------------------------------------------------------------------------------------------------- |
| **Alternative A: Acquisition Cost Only ($\sum \text{purchaseValue}$)** | Value all assets at historical purchase cost.                            | Rejected because it ignores wear, aging, and impairment, grossly overstating current balance sheet assets.                   |
| **Alternative B: Automatic Formulaic Condition Markdown**              | Apply fixed percentages (e.g. `FAIR` = 50%, `POOR` = 25%) to book value. | Rejected because condition is qualitative; programmatic formulas create arbitrary, non-auditable balance sheet fluctuations. |
| **Alternative C: Include Sold Assets in Historical View by Default**   | Retain sold assets in standard asset totals.                             | Rejected because sold assets no longer belong to the organization and distort working capital metrics.                       |
