# ADR-0074: Trainer Operational Authorization Boundary and Object-Level Scoping Policy

- **Status**: Accepted
- **Date**: 2026-08-22
- **Deciders**: Principal Security Architect, Domain Architect
- **Context**: Kinergy Platform Phase 5.6-B (Trainer Authorization & Context Boundary). Defines the precise authorization semantics, role vs. assignment separation, horizontal isolation guarantees, least-privilege data access, and API boundary enforcement for the Trainer Operational Dashboard.

---

## 1. Context & Problem Statement

In fitness and sports platform architectures, assigning a user the `Trainer` system role must not grant unrestricted access to all organizational data:

1. **Role vs. Assignment Conflation**: An actor holding the `Trainer` system role has operational permissions, but is not automatically authorized to view all client rosters across the entire gym.
2. **Horizontal Privilege Escalation**: Trainer A must never be able to inspect or scrape Trainer B's assigned clients or private notes.
3. **Least Privilege & Financial Masking**: Trainers do not have billing responsibilities (`billing.read`); therefore, commercial plan pricing (`PlanPrice.amount`) must not be accessible to them.
4. **Ingress & Mutation Boundaries**: Gym check-ins and membership lifecycle operations (renewals, freezes, terminations) are owned by Reception and Administrative desks, not gym floor trainers.

We must establish the authoritative security architecture, access policies, object-level scoping rules, and error semantics for Trainer operations.

---

## 2. Decision Summary

```mermaid
graph TD
    subgraph "Actor Context (JWT Claims)"
        Actor[Authenticated Actor<br/>userId: 'trainer_01'<br/>roles: ['Trainer']<br/>permissions: ['clients.read']]
    end

    subgraph "Authorization Layer"
        Guard[AuthorizationGuard<br/>Validates @Permissions / @Roles]
        Policy[TrainerAccessPolicy<br/>Evaluates object-level scoping & horizontal isolation]
    end

    subgraph "Application CQRS Queries"
        Q1["GetAssignedClientMembershipsQuery<br/>Enforces trainerId === actor.userId"]
        Q2["GetExpiringMembershipsQuery<br/>Enforces trainerId === actor.userId"]
        Q3["GetDailyAttendanceQuery<br/>Scopes by assignedClientIds whitelist"]
    end

    Actor --> Guard
    Guard --> Policy
    Policy -->|Authorized Scope| Q1
    Policy -->|Authorized Scope| Q2
    Policy -->|Authorized Scope| Q3
    Policy -.->|Cross-trainer query without Admin role| Denied["403 Forbidden<br/>Horizontal Privilege Escalation Rejected"]
```

---

## 3. Key Architectural Decisions

### 3.1 Role vs. Domain Assignment Distinction

- **`Role = Trainer` (System Role)**: Grants permission to access trainer floor capabilities, perform client lookup for admission verification, and inspect operational reports (`clients.read`, `reports.read`).
- **`TrainerAssignment` (Domain Relationship)**: An immutable Value Object on `Membership` (`trainerId: string`, `assignedAt: Date`).
- **Invariant**: A user can hold the `Trainer` role with zero assigned clients. One trainer can be assigned to multiple clients. Role grants capability; Assignment defines data scope.

### 3.2 Information Visibility & Scoping Matrix

| Resource                   | Scope Accessible to Trainer                                                    | Rationale / Boundary                                    |
| -------------------------- | ------------------------------------------------------------------------------ | ------------------------------------------------------- |
| **Assigned Clients**       | Only clients where `Membership.TrainerAssignment.trainerId === currentUser.id` | Horizontal isolation enforced by query handler.         |
| **All Clients Search**     | Read-only lookup by name/email for ingress verification                        | Necessary to diagnose arrival issues on the floor.      |
| **All Memberships Roster** | ❌ Denied                                                                      | Administrative overview belongs to Owner/Admin.         |
| **Membership Pricing**     | ❌ Denied (`PlanPrice.amount` stripped)                                        | Trainer role lacks `billing.read` permission.           |
| **Today's Attendance**     | Scoped strictly to assigned clients (`assignedClientIds`)                      | All-gym attendance feed belongs to Reception.           |
| **Historical Attendance**  | Permitted per-client on demand via `getClientHistory(clientId)`                | Diagnostic pre-session check.                           |
| **Clinical SOAP Notes**    | ❌ Denied (isolated in Kinesiology context)                                    | Medical confidentiality; requires therapist assignment. |

### 3.3 Authorization vs. Query Filtering

- **Authorization**: The server evaluates whether the actor is permitted to query the target resource. Direct API tampering (e.g. `GET /memberships/assigned?trainerId={otherTrainer}`) is rejected with `403 Forbidden` unless the caller holds `Owner` or `Admin` roles.
- **Filtering**: Repository queries select candidate records matching `trainerId` before data projection, preventing in-memory full-table scans.

### 3.4 HTTP Error Semantics & Security Invariants

- **Unauthenticated** (`!userContext`): HTTP `401 Unauthorized`.
- **Authenticated without required role/permission**: HTTP `403 Forbidden`.
- **Horizontal Escalation Attempt**: HTTP `403 Forbidden` (`Access denied: cross-trainer assignment query unauthorized`).
- **Non-Existent Resource**: HTTP `404 Not Found`.

---

## 4. Consequences & Compliance

### Positive

- Strict horizontal and vertical privilege separation enforced at the server API and domain policy boundaries.
- Zero leakage of commercial/financial numbers to unauthorized roles.
- Clear alignment between DDD bounded contexts, Identity IAM, and REST transport layers.

---

## 5. References

- [ADR-0025: Role and Permission Authorization Framework](./0025-role-and-permission-authorization-framework.md)
- [ADR-0050: Clinical Therapist Assignment & Authorization](./0050-clinical-therapist-assignment-handover-and-authorization-architecture.md)
- [ADR-0073: Trainer Operational Dashboard Domain Boundaries](./0073-trainer-operational-dashboard-domain-boundaries-and-read-model-architecture.md)
