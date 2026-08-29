# ADR 0093: Fixed Asset Application Layer Orchestration & Atomic Lifecycle Mutation Pattern

**Status**: `APPROVED`  
**Date**: August 29, 2026  
**Context**: Resources Management — Fixed Asset Application Layer (Milestone 6.6)  
**Deciders**: Architecture Review Board, Principal Backend Engineer, Security Architect

---

## 1. Context & Problem Statement

Fixed Assets (capital equipment, treatment modalities, clinical machines, facility fixtures) represent long-lived physical property with strict accounting and operational integrity requirements:

1. Operations like location transfers, status state transitions, condition ratings, revaluations, and maintenance servicing have distinct business semantics and must never be collapsed into a generic update.
2. Every lifecycle change must atomically create a meaningful, structured history record (`AssetHistoryEvent` or `AssetMaintenanceRecord`) and emit corresponding domain events without leaving orphan records or partial state on failure.
3. Terminal states (`SOLD`) and decommissioned states (`RETIRED`) must enforce hard operational freezes ([AST-INV-1]).
4. Querying history and maintenance must provide deterministic pagination and stable ordering across identical millisecond timestamps.

---

## 2. Decision & Architecture

We establish the **Fixed Asset Application Layer Orchestration Pattern**:

1. **Explicit Segregation of Mutations**:
   - `UpdateFixedAssetDetailsHandler`: Whitelisted exclusively for descriptive metadata (`name`, `description`, `notes`). Strictly blocked from altering location, status, condition, or valuation.
   - `TransferFixedAssetLocationHandler`: Explicit physical relocation with destination validation, terminal state locks, and `TRANSFERRED` history logging.
   - `ChangeFixedAssetStatusHandler`: Finite state machine transition with mandatory justification ($\ge 3$ chars) and `STATUS_CHANGED` history.
   - `UpdateFixedAssetConditionHandler`: Physical wear rating updates preserving status orthogonality and `CONDITION_CHANGED` history.
   - `UpdateFixedAssetValuationHandler`: Estimated economic book value updates ($\ge 0.00$) preserving historical `purchaseValue` and `VALUE_UPDATED` history.
   - `RecordAssetMaintenanceHandler`: Dedicated servicing logging with $0.00 warranty support, technician provenance, and automated restoration to `ACTIVE` upon serviceable repair.

2. **Atomic Aggregate & History Persistence**:
   - All state mutations and history event additions commit together within an atomic database transaction (`prisma.$transaction`).
   - Concurrency conflicts are prevented via Optimistic Concurrency Control (OCC) version tracking (`WHERE version = priorVersion`).

3. **Deterministic Query & History Ordering**:
   - History and maintenance queries default to newest-first (`recordedAt: desc` / `serviceDate: desc`) and apply aggregate insertion sequence indexing (`b.index - a.index`) as a stable tie-breaker for identical millisecond events.
   - Date range filters enforce inclusive boundaries with automatic UTC day-end expansion (`T23:59:59.999Z`) for date-only queries.

4. **Terminal Sink Lock ([AST-INV-1])**:
   - Assets in `SOLD` status are permanently locked from any further modification, transfer, servicing, or status change.
   - Recommissioning of `RETIRED` assets is strictly prohibited by accounting policy; disposal is permitted exclusively via salvage sale (`SOLD`).

---

## 3. Consequences

### Positive:

- **Audit Integrity**: Every state change preserves complete provenance (who, what, when, previous/new state).
- **Invariant Safety**: Generic updates cannot bypass state machine, transfer, or financial rules.
- **Transactional Correctness**: Zero phantom history or orphaned records on failure.

### Trade-offs:

- Strict separation requires dedicated commands and handlers for each distinct business lifecycle event.
