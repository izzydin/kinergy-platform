# Gym Management — Comprehensive Attendance Verification Matrix & Test Architecture

- **Status**: Authoritative Architectural Specification
- **Phase**: 5.5-H
- **Test Suite**: [`packages/core/src/gym/gym-attendance-comprehensive-verification.spec.ts`](file:///c:/Projects/kinergy-platform/packages/core/src/gym/gym-attendance-comprehensive-verification.spec.ts)
- **ADR References**: [ADR-0054](../adr/0054-gym-management-bounded-context-ownership-and-context-map.md), [ADR-0064](../adr/0064-gym-management-attendance-domain-boundary-identity-and-append-only-log-model.md), [ADR-0065](../adr/0065-gym-management-membership-eligibility-contract-and-cross-context-integration.md), [ADR-0066](../adr/0066-gym-management-record-check-in-use-case-anti-passback-and-idempotency.md), [ADR-0067](../adr/0067-gym-management-duplicate-check-in-concurrency-and-idempotency-architecture.md), [ADR-0068](../adr/0068-gym-management-attendance-history-and-operational-read-models.md), [ADR-0069](../adr/0069-gym-management-daily-reception-workflow-frontend-architecture.md), [ADR-0070](../adr/0070-gym-management-attendance-and-daily-operations-comprehensive-verification.md)

---

## 1. Executive Summary

This document serves as the master certification matrix for Gym Attendance, Ingress Control, and Operational Read Models. It guarantees that all physical admission decisions are deterministic, safe under high concurrent race conditions, compliant with anti-passback cooldown rules, and fully isolated from foreign bounded contexts.

---

## 2. Complete Verification Permutations

| #   | Permutation Category          | Scenario / Conditions                            | Expected Access Result                              | Invariant Enforced            |
| --- | ----------------------------- | ------------------------------------------------ | --------------------------------------------------- | ----------------------------- |
| 1   | Active Valid                  | Valid client + Active membership in window       | `GRANTED`                                           | Full access granted           |
| 2   | Expired                       | Valid client + Expired membership                | `DENIED_EXPIRED`                                    | Expired contract blocked      |
| 3   | Frozen / Suspended            | Valid client + Active freeze window              | `DENIED_FROZEN`                                     | Suspended contract blocked    |
| 4   | Cancelled / Terminated        | Valid client + Terminated membership             | `DENIED_NO_MEMBERSHIP`                              | Cancelled contract blocked    |
| 5   | Future Agreement              | Valid client + Start date in future              | `DENIED_NO_MEMBERSHIP`                              | Premature scan blocked        |
| 6   | No Agreement                  | Valid client + Zero memberships on file          | `DENIED_NO_MEMBERSHIP`                              | Unregistered client blocked   |
| 7   | Inactive Client Profile       | Inactive standing in Client context              | `DENIED_INACTIVE_CLIENT`                            | Inactive member blocked       |
| 8   | Multiple Agreements           | Expired old agreement + Active renewed agreement | `GRANTED` (mem_current)                             | Deterministic resolution      |
| 9   | Temporal Boundary - 1ms       | Scan at $T_{exp} - 1\text{ms}$                   | `GRANTED`                                           | Open until last millisecond   |
| 10  | Temporal Boundary Exact       | Scan at $T_{exp}$ exact                          | `DENIED_EXPIRED`                                    | Closed at expiration boundary |
| 11  | Temporal Boundary + 1ms       | Scan at $T_{exp} + 1\text{ms}$                   | `DENIED_EXPIRED`                                    | Expired state enforced        |
| 12  | Midnight Crossover (23:59:59) | Scan at 23:59:59.999 local (UTC-5)               | `GRANTED` (Day $D$)                                 | Correct local business day    |
| 13  | Midnight Crossover (00:00:00) | Scan at 00:00:00.000 local (UTC-5)               | `GRANTED` (Day $D+1$)                               | Next business day rollover    |
| 14  | Anti-Passback Violation       | Rescan within 5-min cooldown window              | `DENIED_DUPLICATE_CHECKIN`                          | Anti-passback cooldown        |
| 15  | Re-admission After Cooldown   | Scan 6 minutes after initial admission           | `GRANTED`                                           | Multi-activity re-admission   |
| 16  | Concurrency Mutex Race        | 10 concurrent requests for same client           | Exactly 1 `GRANTED`, 9 `DENIED_DUPLICATE_CHECKIN`   | In-flight mutex isolation     |
| 17  | Concurrent Multi-Client       | 5 distinct clients scanned simultaneously        | 5 `GRANTED` (0 deadlocks)                           | Per-client mutex granularity  |
| 18  | Idempotency Key Replay        | Repeated submission with same nonce              | `isIdempotentReplay = true`                         | 0 duplicate records stored    |
| 19  | Historical Immutability       | Subsequent renew / plan change / expire          | Attendance record unchanged                         | Append-only ledger integrity  |
| 20  | Daily Operational Query       | Summary KPI counts for local gym day             | 3 scans $\rightarrow$ 1 granted, 2 denied, 1 unique | Read model aggregation        |
| 21  | Member Profile Timeline       | Chronological member admission history           | Descending timestamp order                          | Member timeline display       |
| 22  | Date Range Summary            | Multi-day traffic breakdown by method            | Exact ingress method count                          | Analytics aggregation         |

---

## 3. Layer Isolation & Non-Leakage

- **Zero DB / Framework Leaks in Domain**: Attendance entities and value objects do not reference Prisma, NestJS, or HTTP controllers.
- **Clock Controllability**: 100% of time calculations accept controllable clock instances.
- **Frontend Independence**: The UI layer consumes authoritative backend evaluations without calculating business access rules locally.
