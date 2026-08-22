# ADR-0077: Trainer Dashboard Application API Endpoints & Error Mapping

- **Status**: Accepted
- **Date**: 2026-08-22
- **Deciders**: Senior Backend Engineer, Principal Architect
- **Context**: Kinergy Platform Phase 5.6-E (Trainer Dashboard Application Queries & API). Exposes the Trainer Dashboard read models via secure, strictly typed REST endpoints in `apps/api/src/gym/` without leaking persistence entities or domain internals.

---

## 1. Context & Problem Statement

The frontend Trainer Dashboard requires four dedicated REST endpoints to fetch top-line KPIs, paginated assigned agreements, expiring memberships, and scoped attendance arrivals.
The endpoints must:

1. Strictly enforce backend role & permission boundaries (`@Roles('Trainer', 'Admin', 'Owner')` & `@Permissions('clients.read')`).
2. Prevent horizontal privilege escalation by binding `trainerId` to `currentUser.id` for standard trainers.
3. Provide deterministic pagination and sorting without allowing clients to issue unbounded queries.
4. Expose clean DTOs, masking domain aggregate instances and database internals.

---

## 2. API Endpoints Specification

| Method | Endpoint                                             | Query DTO                                                                                     | Response DTO                          | Auth / Scoping Rule                    |
| ------ | ---------------------------------------------------- | --------------------------------------------------------------------------------------------- | ------------------------------------- | -------------------------------------- |
| `GET`  | `/api/v1/gym/trainer-dashboard/summary`              | `asOfDate`, `horizonDays`, `timezone`, `facilityId`                                           | `TrainerDashboardSummaryResponseDto`  | Scoped to caller `currentUser.id`      |
| `GET`  | `/api/v1/gym/trainer-dashboard/clients`              | `AssignedClientsQueryDto` (`page`, `limit`, `sortBy`, `sortOrder`, `statuses`, `horizonDays`) | `PaginatedAssignedClientsResponseDto` | Paginated & sorted, scoped to caller   |
| `GET`  | `/api/v1/gym/trainer-dashboard/expiring-memberships` | `ExpiringMembershipsQueryDto` (`horizonDays`, `asOfDate`)                                     | `ExpiringMembershipsResponseDto`      | Filtered by lookahead horizon          |
| `GET`  | `/api/v1/gym/trainer-dashboard/attendance`           | `TrainerAttendanceQueryDto` (`date`, `facilityId`, `timezone`, `page`, `limit`)               | `TrainerAttendanceResponseDto`        | Scoped strictly to assigned client IDs |

---

## 3. Error Mapping Taxonomy

- **Domain/Application Failure (`ApplicationResult.fail`)** $\to$ `400 Bad Request` (with sanitized error message).
- **Authentication Failure** $\to$ `401 Unauthorized`.
- **Authorization Failure (Role/Permission missing or unauthorized cross-trainer query)** $\to$ `403 Forbidden`.
- **Resource Not Found** $\to$ `404 Not Found`.

---

## 4. Consequences & Compliance

- Zero leakage of Prisma models or database schema.
- Full Swagger/OpenAPI documentation for automated client generation.
- Strict horizontal isolation prevents trainers from viewing peers' client rosters.

---

## 5. References

- [ADR-0074: Trainer Authorization Boundary](./0074-trainer-operational-authorization-boundary-and-object-level-scoping-policy.md)
- [ADR-0075: Cross-Context Query Contracts](./0075-trainer-dashboard-cross-context-query-contracts-and-resilience-model.md)
- [ADR-0076: Trainer Operational Read Model](./0076-trainer-operational-read-model-and-kpi-summary-projection.md)
