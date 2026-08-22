# ADR-0073: Trainer Operational Dashboard Domain Boundaries & Read-Model Architecture

- **Status**: Accepted
- **Date**: 2026-08-22
- **Deciders**: Principal Product Architect, Domain Architect
- **Context**: Kinergy Platform Phase 5.6-A (Trainer Operational Dashboard Discovery & Implementation). Following the Reception Workflow (ADR-0069), we must establish the authoritative boundaries, information ownership, CQRS projection models, authorization rules, and cross-context contracts for the Trainer Operational Dashboard.

---

## 1. Context & Problem Statement

Trainers on the gym floor require real-time operational visibility to manage their daily interactions:

1. Identifying which clients they are currently responsible for.
2. Confirming active membership status and validity periods.
3. Receiving proactive alerts for memberships expiring within a 7-day lookahead horizon.
4. Monitoring whether their assigned clients have checked in today.
5. Looking up any registered client and evaluating their authoritative access eligibility.

However, naive dashboard designs often introduce critical anti-patterns:

- Fabricating a duplicate `Trainer` aggregate root within the Gym Management domain.
- Leaking commercial pricing or billing details (`PlanPrice.amount`) to personas without billing permissions.
- Performing cross-context database joins across `clients` and `memberships` tables.
- Performing temporal expiration math on the client/frontend side.
- Conflating reception check-in mutation workflows with floor supervisory read views.

---

## 2. Decision Summary

```mermaid
graph TD
    subgraph Identity Context [Identity IAM]
        User[User / Trainer Account<br/>claims: roles=['Trainer'], permissions=['clients.read']]
    end

    subgraph Gym Management Context [Gym Management]
        Membership[Membership Aggregate<br/>TrainerAssignment VO: trainerId]
        Plan[MembershipPlan Aggregate<br/>name, durationDays]
        Attendance[AttendanceRecord Aggregate<br/>checkInTime, result, clientId]

        Q1[GetAssignedClientMembershipsQuery<br/>Projects AssignedClientMembershipDTO]
        Q2[GetExpiringMembershipsQuery<br/>trainerId filter, horizonDays=7]
        Q3[GetDailyAttendanceQuery<br/>assignedClientIds whitelist filter]
    end

    subgraph Client Context [Client Management]
        ClientSearch[Client Search / Summary Facade]
    end

    subgraph Web Frontend [Trainer Dashboard Module]
        UI[TrainerDashboardPage<br/>4 MVP Sections]
    end

    User -->|JWT Auth Context| UI
    UI -->|GET /api/v1/gym/memberships/assigned| Q1
    UI -->|GET /api/v1/gym/memberships/expiring| Q2
    UI -->|GET /api/v1/gym/attendance/today| Q3
    UI -->|Client Search & Lookup| ClientSearch
```

---

## 3. Key Architectural Decisions

### 3.1 Domain Ownership & Trainer Identity

- **Trainer Assignment Source**: `TrainerAssignment` is an immutable **Value Object** encapsulated inside the `Membership` aggregate root (`trainerId: string`, `assignedAt: Date`).
- **No Duplicate Aggregate**: Gym Management strictly does **NOT** instantiate a `Trainer` aggregate root or database table.
- **Identity Scope**: Trainer identity (`currentUser.id`) originates from the Identity (IAM) token claims.

### 3.2 Read-Only Operational Boundary

- The Trainer Dashboard is strictly a **read-only operational view**.
- Trainers **cannot** record check-ins (Reception workflow), create/renew memberships (Admin workflow), or access financial data (`PlanPrice.amount`).

### 3.3 Authoritative Server-Side Projections

- Temporal projections (`isExpiringSoon`, `daysRemaining`, `isExpired`, `isCurrentlyFrozen`) are computed **server-side** in CQRS query handlers (`GetAssignedClientMembershipsHandler`, `GetExpiringMembershipsHandler`).
- Frontend components render projected booleans and integers directly without local date math.

### 3.4 Cross-Context Integration & Decoupling

- Client profile details (`fullName`, `email`) are resolved through public client search endpoints or in-process facades (`IClientFacade`), guaranteeing zero direct database table joins between Gym and Client domains.

### 3.5 Authorization & Scoping

- **Required Permission**: `clients.read` with `Trainer` role.
- **Data Scoping**: Read queries enforce `assignedTrainerId = currentUser.id` at the API/query layer to prevent horizontal privilege escalation.

---

## 4. Consequences & Compliance

### Positive

- Strict adherence to DDD bounded context maps and zero database leakage.
- High performance with targeted queries and near-real-time 30s background polling for today's check-ins.
- Clear separation of concerns between Reception ingress operations and Trainer floor operations.

### Negative / Trade-offs

- Plan names are resolved via `MembershipPlanRepository` in the query handler rather than a flat SQL join.

---

## 5. References

- [ADR-0054: Gym Management Bounded Context Ownership](./0054-gym-management-bounded-context-ownership-and-context-map.md)
- [ADR-0056: Gym Management Aggregate Discovery & Boundaries](./0056-gym-management-aggregate-discovery-and-boundary-decisions.md)
- [ADR-0063: Gym Operational Read Models & Expiring Soon Semantics](./0063-gym-management-operational-read-models-expiring-soon-semantics-and-notification-boundaries.md)
- [ADR-0069: Reception Workflow Frontend Architecture](./0069-gym-management-daily-reception-workflow-frontend-architecture.md)
