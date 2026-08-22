# Trainer Dashboard — Cross-Context Query Contracts & Communication Architecture

- **Status**: Authoritative Architectural Specification
- **Bounded Contexts**: Gym Management, Client Management, Identity (IAM)
- **ADR References**: [ADR-0054](../adr/0054-gym-management-bounded-context-ownership-and-context-map.md), [ADR-0073](../adr/0073-trainer-operational-dashboard-domain-boundaries-and-read-model-architecture.md), [ADR-0075](../adr/0075-trainer-dashboard-cross-context-query-contracts-and-resilience-model.md)

---

## 1. Context Interaction Architecture

The **Trainer Operational Dashboard** acts as a pure **read-side aggregator**. It obtains data through explicit query contracts across three bounded contexts:

```text
┌─────────────────────────┐
│     Identity (IAM)      │──► AuthenticatedUserContext (userId, roles, permissions)
└─────────────────────────┘
             │
┌─────────────────────────┐
│    Client Management    │──► IClientFacade (searchClientsSummary, getClientSummary)
└─────────────────────────┘
             │
┌─────────────────────────┐
│     Gym Management      │──► GetAssignedClientMembershipsQuery
│                         │──► GetExpiringMembershipsQuery
│                         │──► GetDailyAttendanceQuery (scoped whitelist)
│                         │──► CheckMembershipEligibilityQuery
└─────────────────────────┘
```

---

## 2. Information Ownership & Field Transformation Matrix

| Dashboard Field / Section      | Authoritative Context | Query Contract                       | Authorization Boundary         | Transformation / DTO Output   |
| ------------------------------ | --------------------- | ------------------------------------ | ------------------------------ | ----------------------------- |
| **Client Search & Name**       | Client Management     | `IClientFacade.searchClientsSummary` | `@Permissions('clients.read')` | `ClientSearchResultDTO`       |
| **Assigned Membership Roster** | Gym Management        | `GetAssignedClientMembershipsQuery`  | `trainerId === currentUser.id` | `AssignedClientMembershipDTO` |
| **Expiring Soon Notice**       | Gym Management        | `GetExpiringMembershipsQuery`        | `trainerId === currentUser.id` | `ExpiringMembershipItemDTO`   |
| **Today's Check-In Feed**      | Gym Management        | `GetDailyAttendanceQuery`            | `assignedClientIds` whitelist  | `AttendanceItemDTO`           |
| **Live Admission Eligibility** | Gym Management        | `CheckMembershipEligibilityQuery`    | `@Permissions('clients.read')` | `MembershipEligibilityDTO`    |

---

## 3. N+1 Query Prevention

1. **Batch Plan Name Resolution**:
   - In `GetAssignedClientMembershipsHandler`, all memberships are retrieved in a single repository query.
   - Unique `planId`s are extracted into a `Set` ($K$ unique plans).
   - `planRepository.findById` is invoked once per unique plan and cached in-memory.
   - **Complexity**: $O(K)$ database calls instead of $O(N)$ calls for $N$ clients ($K \le 5$, $N \ge 50$).

2. **Single-Pass Attendance Whitelisting**:
   - In `GetDailyAttendanceHandler`, today's check-ins are filtered against a set of `assignedClientIds` in a single pass rather than issuing $N$ individual attendance history queries.

---

## 4. Failure Semantics & Resilience Model

- **Section-Level Isolation**: Each dashboard section operates via an independent React Query hook.
- **Graceful Fallbacks**:
  - If a plan template is deleted or missing from the database, the query safely falls back to displaying `planId` without throwing an unhandled exception.
  - If the Attendance subsystem experiences transient latency, the Assigned Clients roster and Expiring Soon cards render without interruption.
  - Errors render in-context warning alerts rather than blanking the page.

---

## 5. Freshness & Consistency Model

- **Assigned Clients List**: Strong request-time read consistency (30s stale time).
- **Expiring Soon Alert**: Request-time projection (60s stale time).
- **Today's Check-Ins Feed**: Near-real-time via 30s background polling (`refetchInterval: 30000`).
- **Live Eligibility Inspector**: Direct synchronous evaluation against `MembershipEligibilityPort`.
