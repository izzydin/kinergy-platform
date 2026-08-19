# Gym Management — Attendance Concurrency, Anti-Passback & Idempotency Architecture

- **Status**: Authoritative Architectural Specification
- **Phase**: 5.5-E
- **Bounded Context**: Gym Management (`packages/core/src/gym/`)
- **ADR References**: [ADR-0054](../adr/0054-gym-management-bounded-context-ownership-and-context-map.md), [ADR-0060](../adr/0060-gym-management-duplicate-and-overlapping-membership-policy.md), [ADR-0062](../adr/0062-gym-management-membership-expiration-temporal-semantics-and-canonical-eligibility-model.md), [ADR-0064](../adr/0064-gym-management-attendance-domain-boundary-identity-and-append-only-log-model.md), [ADR-0065](../adr/0065-gym-management-membership-eligibility-contract-and-cross-context-integration.md), [ADR-0066](../adr/0066-gym-management-record-check-in-use-case-anti-passback-and-idempotency.md), [ADR-0067](../adr/0067-gym-management-duplicate-check-in-concurrency-and-idempotency-architecture.md)

---

## 1. Executive Summary & Problem Domain

Physical gym check-in systems operate under high-concurrency conditions where:

- Multiple turnstile controllers scan credentials concurrently.
- Mobile clients experience network timeouts and resubmit requests.
- Impatient staff or turnstile gates double-tap inputs.

This specification details how Kinergy guarantees:

1. **Mathematical Anti-Passback Cooldown**: Exactly 1 granted check-in per client within 5 minutes.
2. **Deterministic Concurrency Mutex**: In-flight request serialization per client.
3. **True Request Idempotency**: Safe replays without duplicate database rows.
4. **Legitimate Multi-Visit Support**: Multiple visits across the same calendar day.

---

## 2. Concurrency Architecture & Mutex Flow

```mermaid
sequenceDiagram
    autonumber
    actor Gate1 as Turnstile Gate 1
    actor Gate2 as Turnstile Gate 2
    participant Mutex as Client-Level Mutex (RecordCheckInHandler)
    participant Port as MembershipEligibilityPort
    participant Repo as AttendanceRecordRepository

    par Concurrent Ingress Attempt
        Gate1->>Mutex: execute(client_100, Gate 1)
        Gate2->>Mutex: execute(client_100, Gate 2)
    end

    Note over Mutex: Gate 1 acquires lock;<br/>Gate 2 waits.

    Mutex->>Port: evaluateEligibility(client_100)
    Port-->>Mutex: ELIGIBLE
    Mutex->>Repo: findRecentByClientId(client_100, now - 5m)
    Repo-->>Mutex: 0 records
    Mutex->>Repo: append(GRANTED Record)
    Mutex-->>Gate1: Return isGranted=true (Gate 1 Opens)

    Note over Mutex: Gate 1 releases lock;<br/>Gate 2 resumes.

    Mutex->>Port: evaluateEligibility(client_100)
    Port-->>Mutex: ELIGIBLE
    Mutex->>Repo: findRecentByClientId(client_100, now - 5m)
    Repo-->>Mutex: [GRANTED Record from Gate 1]
    Mutex->>Repo: append(DENIED_DUPLICATE_CHECKIN Record)
    Mutex-->>Gate2: Return isGranted=false, isDuplicate=true (Gate 2 Denies)
```

---

## 3. Database Indexes & Query Optimization

| Index Specification                                                                       | Purpose                                                                 | Complexity    |
| :---------------------------------------------------------------------------------------- | :---------------------------------------------------------------------- | :------------ |
| `CREATE INDEX idx_att_client_time ON attendance_records (client_id, check_in_time DESC);` | Fast anti-passback cooldown range scans (`findRecentByClientId`).       | $O(1)$ lookup |
| `CREATE INDEX idx_att_day_facility ON attendance_records (gym_day, facility_id);`         | Real-time reception daily attendance counters (`countGrantedByGymDay`). | $O(\log N)$   |
| `CREATE INDEX idx_att_client_day ON attendance_records (client_id, gym_day);`             | Plan visit quota verification (`countGrantedByClientAndGymDay`).        | $O(1)$ lookup |

---

## 4. Verification Suite

- Test Suite: [`record-check-in-concurrency-idempotency.spec.ts`](file:///c:/Projects/kinergy-platform/packages/core/src/gym/application/handlers/record-check-in-concurrency-idempotency.spec.ts)
- Verified Scenarios:
  - 10 simultaneous parallel check-ins for the same client $\rightarrow$ exactly 1 `GRANTED`, 9 `DENIED_DUPLICATE_CHECKIN`.
  - 5 parallel check-ins for distinct clients $\rightarrow$ all 5 `GRANTED`.
  - Exact anti-passback cooldown boundaries: $4\text{m } 59\text{s}$ denied vs $5\text{m } 01\text{s}$ granted.
  - Multi-checkin support: morning visit (08:00) + evening visit (18:00) on same `GymDay` both granted.
  - 10 concurrent requests sharing same `idempotencyKey` $\rightarrow$ 1 DB record, 9 cached idempotent replays.
  - Rapid recovery: unfreezing account permits retry 5s later without false anti-passback lockout.
