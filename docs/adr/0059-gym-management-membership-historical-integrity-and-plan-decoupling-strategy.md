# ADR-0059: Gym Management Membership Historical Integrity & Plan Decoupling Strategy

- **Status**: Accepted
- **Date**: 2026-08-18
- **Deciders**: Principal Domain Architect, Senior Domain Modeler & Business Analyst
- **Context**: Kinergy Platform Phase 5.3-C (Membership Plans Lifecycle & Historical Integrity). We must establish the architectural strategy guaranteeing that commercial catalog changes (such as price increases, catalog deactivations, duration adjustments, and plan archiving) never corrupt active or historical customer membership agreements.

---

## 1. Context & Problem Statement

Commercial fitness plans evolve over time (e.g. inflation adjustments, seasonal promotions, tier retirements). If the relationship between `Membership` (the contractual agreement) and `MembershipPlan` (the commercial catalog offering) is designed via direct mutable coupling or live foreign queries:

1. **Price Inflation Corruption**: Changing a plan's price from $50 to $70 could retroactively alter financial reports or active customer contract terms.
2. **Archival Invalidation**: Retiring a plan could invalidate active members' turnstile access or break historical reporting.
3. **Over-engineered Versioning**: Creating versioned database rows for every minor cosmetic change (e.g. typo in description) adds unnecessary operational complexity.

We require a definitive architectural strategy that decouples historical membership facts from mutable commercial catalog definitions.

---

## 2. Decision Summary

```mermaid
graph TD
    subgraph "Commercial Catalog (Mutable Configuration)"
        PlanAR["MembershipPlan (Aggregate Root)<br/>- id: PlanId<br/>- code: PlanCode<br/>- duration: PlanDuration (30 days)<br/>- price: PlanPrice ($50 USD)<br/>- status: PlanStatus (ACTIVE -> ARCHIVED)<br/>- version: number"]
    end

    subgraph "Customer Agreement (Historical Fact)"
        MembershipAR["Membership (Aggregate Root)<br/>- id: MembershipId<br/>- clientId: string (scalar)<br/>- planId: string (scalar lineage)<br/>- period: MembershipPeriod [June 1 - July 1]<br/>- status: MembershipStatus (ACTIVE)<br/>- version: number"]
    end

    PlanAR -.->|1. Evaluated at Purchase/Renewal Time| MembershipAR
    PlanAR -->|2. Later Price Updated to $75 / Archived| PlanAR
    MembershipAR -->|3. Preserves [June 1 - July 1] and Active Access| MembershipAR
```

### 2.1 The Selected Decoupling Strategy: Self-Contained Contract Periods with Plan Lineage

- **Decision**: `Membership` encapsulates its own contract validity interval (`MembershipPeriod`), computed deterministically at creation/renewal time from the plan's `durationInDays`.
- **Lineage**: `Membership` holds `planId: string` strictly as an immutable identifier for audit and commercial reporting lineage.
- **Independence**: Once a `Membership` is created or renewed, its period, status, freeze history, and turnstile access eligibility are completely independent of subsequent mutations or archival of the referenced `MembershipPlan`.

---

## 3. Commercial Operation Rules

### 3.1 Price Changes

- When a `MembershipPlan` updates its pricing (`updatePricing(newPrice)`):
  - Emits `MembershipPlanPriceChangedEvent`.
  - The new price applies exclusively to future membership creations or renewals.
  - Active existing memberships retain their purchased contract period and financial agreement without mutation.

### 3.2 Duration Changes

- `PlanDuration` is immutable once a plan transitions to `ACTIVE` or `ARCHIVED`.
- If a club wishes to offer a different duration (e.g. replace 30-day with 45-day), administrators create a new `MembershipPlan` (e.g. `STD_45D`).

### 3.3 Plan Archival

- Archiving a plan (`archive()` $\rightarrow$ `PlanStatus.ARCHIVED`):
  - Prevents new membership purchases or standard renewals under that plan.
  - Emits `MembershipPlanArchivedEvent`.
  - **Zero Impact on Active Memberships**: Existing memberships referencing the archived plan continue until their contracted `endDate`, and remain eligible for turnstile access, freezes, unfreezes, and administrative operations.

---

## 4. Architectural Invariants

1. **Self-Sufficiency**: A `Membership` must be able to validate its own lifecycle, turnstile access eligibility (`isEligibleForAttendance`), and freeze calculations in memory with zero database lookups to `MembershipPlan`.
2. **Zero Cross-Aggregate Transactional Locks**: Updating a `MembershipPlan` never acquires locks on `Membership` aggregate roots.
3. **Eventual Consistency**: Billing projections and analytics consume domain events (`MembershipPlanPriceChangedEvent`, `MembershipRenewedEvent`) asynchronously.

---

## 5. Rejected Alternatives

### Alternative A: Re-evaluating Duration from Plan on Every Query

- _Proposal_: Store only `startDate` on `Membership`, querying `MembershipPlan.duration` dynamically to calculate `endDate`.
- _Reason for Rejection_: If the plan's duration were changed or archived, existing memberships would silently change their expiration dates or throw missing entity errors.

### Alternative B: Full Commercial Snapshot Copy on Every Membership

- _Proposal_: Clone the complete `MembershipPlan` entity (name, description, terms, pricing) into JSON columns on every `Membership` row.
- _Reason for Rejection_: Unnecessary data duplication and database bloat. Storing `planId` and the evaluated `MembershipPeriod` satisfies 100% of domain and access invariants.

---

## 6. Consequences

### Positive

- 100% protection of historical contract terms.
- High-performance turnstile eligibility evaluation without cross-table joins.
- Clean aggregate separation conforming to DDD bounded context rules.

### Negative / Trade-offs

- Renewals must explicitly look up active commercial plans at renewal time rather than blindly copying existing plan attributes if a plan was archived.

---

## 7. References

- [ADR-0056: Gym Management Aggregate Discovery & Boundaries](./0056-gym-management-aggregate-discovery-and-boundary-decisions.md)
- [ADR-0058: Gym Management MembershipPlan Commercial & Pricing Model](./0058-gym-management-membership-plan-commercial-and-pricing-model.md)
- [Gym Commercial Model Specification](../architecture/gym-commercial-model.md)
