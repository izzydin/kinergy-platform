# ADR-0097: Fixed Asset Lifecycle Valuation Inclusion Policy

## Status

`ACCEPTED`

## Date

2026-08-31

## Context

In Phase 6 (Resources Management), Milestone 6.8 establishes executive resource valuation capabilities. Fixed assets encompass high-value capital equipment (treadmills, strength machines, cryotherapy tanks, massage beds, commercial kitchen ovens, electronic servers) across multiple facilities.

Fixed assets transition across complex lifecycle states (`ACTIVE`, `UNDER_MAINTENANCE`, `DAMAGED`, `RETIRED`, `SOLD`) and condition ratings (`EXCELLENT` through `OUT_OF_SERVICE`).

Management dashboards require an unambiguous, deterministic standard defining:

1. Which asset lifecycle states contribute to the business's active capital equipment carrying value.
2. The relationship between qualitative condition assessments, maintenance expenditures, and quantitative financial valuations.

## Decision

We establish the **Authoritative Fixed Asset Lifecycle Valuation Policy**:

1. **Authoritative Metric**: `FixedAsset.currentEstimatedValue` (`current_estimated_value_amount Decimal(10, 2)`) represents current carrying book value.
2. **Lifecycle Inclusion Rules**:
   - `ACTIVE`, `UNDER_MAINTENANCE`, and `DAMAGED` assets are **INCLUDED** in active resource carrying value totals.
   - `RETIRED` and `SOLD` assets are **EXCLUDED** from active resource carrying value totals.
3. **Decoupling Condition from Valuation**: Qualitative condition ratings do not automatically trigger programmatic deductions on `currentEstimatedValue`. Value adjustments require explicit administrative revaluations (`UpdateFixedAssetValuationCommand`).
4. **Segregation of Maintenance OpEx**: Maintenance expenses logged in `AssetMaintenanceRecord` are tracked as operational costs and do not automatically mutate capital asset book values.
5. **Exact Arithmetic**: Line-item integer-cents arithmetic ($\text{Math.round}(\text{currentEstimatedValue} \times 100)$) is enforced to eliminate floating-point drift.

## Consequences

### Positive

- **Deterministic & Auditable**: Every aggregate total is 100% reproducible directly from current database records.
- **Accurate Balance Sheet Reflection**: Prevents sold equipment or decommissioned write-offs from falsely inflating business assets.
- **Clear Operational Boundaries**: Distinguishes between qualitative physical condition ratings, operational maintenance costs, and balance sheet capital carrying values.

### Negative / Trade-offs

- Revaluations due to severe physical damage or age require explicit administrative action rather than automatic time/condition depreciation rules.

## Compliance

- Aligns with [ADR-0094](0094-resources-authorization-and-permission-taxonomy-model.md) and [ADR-0095](0095-resource-sensitive-valuation-data-access-and-response-shaping-policy.md).
- Enforced across query handlers in `packages/core/src/resources/application/handlers/`.
