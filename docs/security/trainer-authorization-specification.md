# Trainer Operational Authorization & Context Boundary Specification

- **Status**: Authoritative Security Specification
- **Security Scope**: Identity IAM (`apps/api/src/platform/identity/`), Gym Domain (`packages/core/src/gym/`), and Web Client (`apps/web/src/modules/gym/trainer-dashboard/`)
- **ADR References**: [ADR-0025](../adr/0025-role-and-permission-authorization-framework.md), [ADR-0074](../adr/0074-trainer-operational-authorization-boundary-and-object-level-scoping-policy.md)

---

## 1. Trainer Role vs. Trainer Assignment

Kinergy platform explicitly separates **Role Authority** from **Domain Relationship**:

```text
┌─────────────────────────────────────────────────────────────┐
│ 1. SYSTEM ROLE: Role = Trainer                              │
│    • IAM User claim: user.roles.includes('Trainer')         │
│    • Permissions: clients.read, appointments.read, reports  │
│    • Authority: Access to Trainer Dashboard interface        │
└──────────────────────────────┬──────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────┐
│ 2. DOMAIN ASSIGNMENT: TrainerAssignment (Value Object)      │
│    • Location: Membership.trainerAssignment                 │
│    • Fields: trainerId (string), assignedAt (Date)          │
│    • Scope: Defines which clients are in the trainer roster │
└─────────────────────────────────────────────────────────────┘
```

- **A user can be a Trainer without assigned clients**: e.g., a newly onboarded trainer before any memberships are assigned.
- **One trainer can be assigned to multiple clients**: A one-to-many relationship governed by multiple `Membership` aggregates.
- **Conflation Prohibition**: Having `Role = Trainer` does NOT grant horizontal visibility into other trainers' clients or gym-wide membership registries.

---

## 2. Resource Visibility & Access Matrix

| Resource                          | Trainer Access Level    | Invariant & Boundary Rule                                            |
| --------------------------------- | ----------------------- | -------------------------------------------------------------------- |
| **My Assigned Clients**           | Read-Only (Full Roster) | Scoped strictly to `TrainerAssignment.trainerId === currentUser.id`. |
| **All Clients Directory**         | Search by Name / Email  | Permitted via `clients.read` to diagnose floor arrival issues.       |
| **All Gym Memberships**           | ❌ Denied               | Administrative overview restricted to `Owner` / `Admin`.             |
| **Membership Commercial Pricing** | ❌ Denied               | `PlanPrice.amount` stripped; Trainer lacks `billing.read`.           |
| **Today's Attendance Feed**       | Scoped (Assigned Only)  | Filtered by `assignedClientIds` whitelist.                           |
| **All-Gym Ingress Feed**          | ❌ Denied               | Global check-in feed belongs exclusively to Reception.               |
| **Historical Attendance**         | On-Demand (Per Client)  | Permitted via `getClientHistory(clientId)` for pre-workout checks.   |
| **Clinical SOAP Records**         | ❌ Denied               | Medical confidentiality; isolated in Kinesiology context.            |

---

## 3. Server-Side Enforcement & Anti-Escalation Architecture

1. **Authorization vs. Filtering**:
   - Authorization verifies whether the requesting actor is permitted to invoke the query.
   - Filtering ensures the database query only selects records matching `trainerId`.
   - Both are enforced on the backend. No security boundary relies on frontend filtering.
2. **Horizontal Privilege Escalation Prevention**:
   - Evaluated by `TrainerAccessPolicy.canAccessAssignedRoster()`.
   - If a caller requests `GET /gym/memberships/assigned?trainerId=other_trainer`, the backend rejects with `403 Forbidden` unless the caller possesses `Owner` or `Admin` roles.
3. **Least Privilege Data Masking**:
   - `AssignedClientMembershipDTO` omits commercial pricing fields by design.

---

## 4. HTTP Error Semantics

| Scenario                         | HTTP Status        | Error Message / Contract                                   |
| -------------------------------- | ------------------ | ---------------------------------------------------------- |
| Unauthenticated request          | `401 Unauthorized` | Authentication token missing or expired                    |
| Authenticated but wrong role     | `403 Forbidden`    | Access denied: required role missing                       |
| Cross-trainer roster query       | `403 Forbidden`    | Access denied: cross-trainer assignment query unauthorized |
| Non-existent client / membership | `404 Not Found`    | Resource not found on record                               |
