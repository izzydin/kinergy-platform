# 0072. Frontend Optimistic UX Architecture and Decision Policy

Date: 2026-08-21
Status: Accepted

## Context

Track A6 established the Kinergy Platform's base mutation infrastructure using TanStack Query, normalized notification toasts, and standard cache invalidation. As the platform expands across Track C (CRUD Experience) and upcoming Tracks (Client Management, Clinical Scheduling, Gym Operations, and Billing), developers require a deterministic, unambiguous policy governing **when** mutations should use optimistic UI and **how** rollback, concurrency, and cache reconciliation must be implemented.

Improper or undisciplined use of optimistic UI in enterprise applications risks severe UX and business failures:

1. Implying that financial transactions, payment captures, or physical stock movements succeeded before backend validation.
2. Inconsistent client-side state when optimistic mutations fail without clean rollback mechanisms.
3. Race conditions caused by rapid consecutive toggles or in-flight background query refetches.

## Decision

We establish the **Kinergy Optimistic UX Architecture and Decision Policy**:

1. **Pessimistic Default:** All mutations in the platform are **pessimistic by default** (displaying a pending spinner/disabled state until server resolution). A mutation may only be optimistic if explicitly justified against the 6-point criteria.
2. **6-Point Justification Criteria:**
   - Result is completely deterministic.
   - Target cache query key is precisely known.
   - Reliable rollback snapshot can be captured in `onMutate`.
   - Operation is lightweight and reversible.
   - Temporary UI divergence is acceptable.
   - Failure carries zero critical financial, legal, medical, or inventory consequences.
3. **Approved Mutation Categories:**
   - Status toggles (Active, Inactive, Suspended).
   - Soft archive / restore operations.
   - User display and notification preferences.
   - Simple scalar metadata updates.
4. **Disallowed Mutation Categories:**
   - Payments and financial ledger transactions.
   - Sales order completions and billing captures.
   - Physical inventory adjustments and movements.
   - Clinical progress notes (SOAP notes) and medical chart locking.
   - Multi-party resource scheduling and double-booking verifications.
   - Multi-step entity creation wizards.
5. **Rollback & Cache Contract:**
   - `onMutate`: Must call `queryClient.cancelQueries()`, snapshot previous cache state, and return `{ previousData }`.
   - `onError`: Must restore `previousData` to the cache and dispatch an error notification.
   - `onSettled`: Must call `queryClient.invalidateQueries()` to guarantee ultimate server reconciliation.
6. **Concurrency & Accessibility:**
   - Action triggers must be disabled while mutation is in flight to prevent out-of-order race conditions.
   - Assistive technologies must be notified via `aria-live` assertive regions if an optimistic update reverts on failure.

## Consequences

### Positive

- **Deterministic UX:** Users experience instantaneous feedback on safe, lightweight operations without misleading perceptions of critical transactions.
- **Data Integrity:** Reliable 4-step rollback contracts prevent divergent or corrupted client cache states upon network failure.
- **Architectural Clarity:** Feature developers have an explicit decision tree and code blueprint for mutation design.

### Negative / Trade-offs

- **Implementation Rigor:** Optimistic mutations require additional boilerplate (`onMutate`, `onError`, `onSettled`, and snapshot capture) and comprehensive unit tests verifying error reversions.

## References

- `docs/frontend/optimistic-ux-architecture-and-decision-policy.md`
- `docs/frontend/crud-experience-contract.md`
- ADR 0071: Frontend CRUD Experience Lifecycle and Composition Contract
