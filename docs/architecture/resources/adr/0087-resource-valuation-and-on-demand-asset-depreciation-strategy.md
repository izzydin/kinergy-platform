# ADR-0087: Resource Valuation & On-Demand Asset Depreciation Strategy

- **Status**: Accepted
- **Deciders**: Principal Architect, Lead Financial Architect, Lead Backend Engineer
- **Date**: 2026-08-25
- **Context/Milestone**: Phase 6 — Resource Valuation Architecture

---

## Context and Problem Statement

Business owners need accurate asset valuation reports for tax, insurance, and balance sheet visibility. In software systems, asset depreciation is often either:

- Over-engineered with daily/monthly cron mutation jobs writing journal entries into database tables.
- Neglected entirely, forcing manual spreadsheet tracking.

We must decide the valuation and depreciation calculation strategy for Kinergy Phase 6.

---

## Decision Drivers

- **Zero Data Drift**: Avoid background cron jobs mutating millions of asset rows daily.
- **Scope Defense**: Avoid building double-entry general ledger accounting in Phase 6.
- **Mathematical Accuracy**: Use exact `Decimal(10, 2)` calculations to avoid IEEE 754 floating-point inaccuracies.

---

## Decision Outcome

We implement **On-Demand Domain Value Object Depreciation Calculations**:

1. **`DepreciationSchedule` Value Object**:
   - Persisted as structured `jsonb` on `fixed_assets`: `{ method: 'STRAIGHT_LINE', usefulLifeMonths: 60, salvageValueAmount: '500.00', depreciationStartDate: '...' }`.
2. **Pure Domain Function**:
   - `FixedAsset.calculateCurrentBookValue(asOfDate: Date): Money` computes current net book value deterministically using:
     $$\text{MonthlyRate} = \frac{\text{AcquisitionCost} - \text{SalvageValue}}{\text{UsefulLifeMonths}}$$
     $$\text{CurrentBookValue} = \max(\text{SalvageValue}, \text{AcquisitionCost} - (\text{ElapsedMonths} \times \text{MonthlyRate}))$$
3. **Consumable Inventory Valuation**:
   - Evaluated on-demand as $\text{QuantityOnHand} \times \text{UnitCost}$.
4. **Zero Cron Database Mutations**: Database rows store only immutable inputs; outputs are projected on-demand during read queries.

---

## Alternatives Considered

1. **Nightly Cron Job Mutating `current_book_value` Column**:
   - _Rejected_: Creates unnecessary database write churn, migration risks, and potential data drift if cron fails.
2. **Full General Ledger Journal Posting**:
   - _Rejected_: Out of scope. Kinergy provides operational reports; formal financial statements integrate via CSV/API export to QuickBooks/Xero.

---

## Consequences

- **Positive**: Zero database write overhead, 100% deterministic valuation across any historical or future date, zero data drift.
- **Negative**: Complex non-linear depreciation methods (e.g. MACRS double-declining) require future value object extensions.
