# ADR-0075: Trainer Dashboard Cross-Context Query Contracts, N+1 Prevention & Resilience Model

- **Status**: Accepted
- **Date**: 2026-08-22
- **Deciders**: Principal Architect, Domain Architect
- **Context**: Kinergy Platform Phase 5.6-C (Trainer Dashboard Cross-Context Query Contracts). Defines the communication contracts between the Trainer Dashboard and existing bounded contexts (Gym Management, Client Management, Identity), preventing persistence coupling, N+1 queries, and monolithic failure cascades.

---

## 1. Context & Problem Statement

Dashboards that aggregate multi-context data are prone to severe architectural pitfalls:

1. **Monolithic Persistence Coupling**: Creating cross-context SQL/Prisma joins across `Client`, `Membership`, and `Attendance` tables violates bounded-context autonomy (ADR-0054).
2. **Domain Duplication**: Re-instantiating duplicate aggregates (`TrainerClient`, `TrainerMembershipSummary`) creates conflicting sources of truth.
3. **N+1 Query Explosions**: Loading $N$ assigned clients and iterating in a loop to fetch plan details, membership periods, and attendance records causes severe latency and database load.
4. **All-or-Nothing Failure Cascades**: A transient failure in an auxiliary subsystem (e.g. attendance feed replica latency) should not bring down the entire dashboard or blank out membership cards.

---

## 2. Decision Summary

```mermaid
graph TD
    subgraph "Web Frontend (Trainer Dashboard)"
        UI[Trainer Dashboard View<br/>Independent React Query Hooks]
    end

    subgraph "Client Management Context"
        Facade[IClientFacade<br/>searchClientsSummary]
    end

    subgraph "Gym Management Context"
        Q1[GetAssignedClientMembershipsQuery<br/>Batch Plan Name Lookup Map]
        Q2[GetExpiringMembershipsQuery<br/>Trainer Scoped Horizon Evaluation]
        Q3[GetDailyAttendanceQuery<br/>assignedClientIds Single-Pass Whitelist Filter]
        Q4[CheckMembershipEligibilityQuery<br/>Authoritative Instant Evaluation]
    end

    UI -->|Hook 1: Assigned Clients| Q1
    UI -->|Hook 2: Expiring Soon| Q2
    UI -->|Hook 3: Today's Ingress (30s polling)| Q3
    UI -->|Hook 4: On-Demand Search| Facade
    UI -->|Hook 5: Real-Time Eligibility| Q4
```

---

## 3. Key Architectural Decisions

### 3.1 Explicit Query Contracts & Context Ownership

Every piece of data displayed on the dashboard originates from an authoritative context contract:

| Dashboard Field           | Authoritative Context | Query Contract                       | Authorization Boundary         |
| ------------------------- | --------------------- | ------------------------------------ | ------------------------------ |
| **Client Name / Search**  | Client Management     | `IClientFacade.searchClientsSummary` | `clients.read`                 |
| **Assigned Memberships**  | Gym Management        | `GetAssignedClientMembershipsQuery`  | `trainerId === currentUser.id` |
| **Expiring Memberships**  | Gym Management        | `GetExpiringMembershipsQuery`        | `trainerId === currentUser.id` |
| **Today's Check-Ins**     | Gym Management        | `GetDailyAttendanceQuery`            | `assignedClientIds` scope      |
| **Real-Time Eligibility** | Gym Management        | `CheckMembershipEligibilityQuery`    | `clients.read`                 |

### 3.2 N+1 Query Prevention Strategy

- **Batch Plan Deduplication**: `GetAssignedClientMembershipsHandler` extracts the set of unique `planId`s from all retrieved memberships ($K$ unique plans, where $K \ll N$). It resolves each plan once into an in-memory Map, ensuring $O(K)$ lookups rather than $O(N)$.
- **Single-Pass Whitelist Scoping**: `GetDailyAttendanceHandler` filters records against the `assignedClientIds` Set in a single in-memory evaluation rather than issuing $N$ individual database queries.

### 3.3 Section-Level Resilience & Partial Failure Model

- The dashboard employs **Section-Level Failure Isolation**:
  - If the Attendance subsystem is unreachable, the **Assigned Clients** roster and **Expiring Soon** sections continue to render and function normally.
  - If Client Search fails, assigned floor operations remain fully operational.
  - Failures surface localized contextual alerts (`Alert variant="destructive"`) rather than crashing the page or showing deceptive empty states.

### 3.4 Consistency & Freshness Model

- **Assigned Clients List**: Strong request-time read consistency (30s stale time).
- **Expiring Soon Alert**: Request-time projection (60s stale time).
- **Today's Check-Ins**: Near-real-time via 30s background polling (`refetchInterval: 30000`).
- **Real-Time Eligibility**: Synchronous on-demand evaluation against `MembershipEligibilityPort`.

---

## 4. Consequences & Compliance

### Positive

- Zero direct database coupling across contexts.
- High resilience and fault containment.
- Linear execution times with zero N+1 database queries.
- Clean separation between DTO transfer models and domain aggregate roots.

---

## 5. References

- [ADR-0054: Gym Management Bounded Context Ownership](./0054-gym-management-bounded-context-ownership-and-context-map.md)
- [ADR-0073: Trainer Operational Dashboard Domain Boundaries](./0073-trainer-operational-dashboard-domain-boundaries-and-read-model-architecture.md)
- [ADR-0074: Trainer Operational Authorization Boundary](./0074-trainer-operational-authorization-boundary-and-object-level-scoping-policy.md)
