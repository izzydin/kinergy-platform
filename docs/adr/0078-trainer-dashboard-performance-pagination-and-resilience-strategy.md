# ADR-0078: Trainer Dashboard Performance, Pagination & Resilience Strategy

## Status

**ACCEPTED**

## Context

The Trainer Operational Dashboard (introduced across Phases 5.6-A through 5.6-F) aggregates operational membership, client assignment, and facility attendance data across bounded contexts for reception/gym-floor trainers.

To ensure high performance, reliability, and security without introducing premature distributed infrastructure (such as distributed caching clusters or dedicated search indexing engines like Elasticsearch), we must formalize the query optimization, pagination stability, database index strategy, and resilience invariants for the Trainer Dashboard.

## Decision

### 1. N+1 Elimination via Batch Plan Lookup Caching

- **Problem**: Projecting 50 assigned client memberships could trigger 50 separate repository lookups for `MembershipPlan` entities to resolve commercial plan names.
- **Decision**: The `GetAssignedClientMembershipsHandler` extracts all unique `planId`s from the fetched memberships, resolves unique plans in parallel via `planRepository.findById(planId)`, and populates a localized in-memory Map lookup cache.
- **Complexity**: $O(K)$ plan lookups where $K$ is the number of distinct plans assigned to the trainer (typically $K \le 3$), reducing database roundtrips from $O(N)$ to $O(1)$.

### 2. Deterministic Pagination & Stable Tie-Breaking

- **Problem**: When multiple clients share identical expiration dates or remaining days, standard database/array sorting without a deterministic secondary key produces unstable page splits across page boundary requests.
- **Decision**: All pagination sorting algorithms enforce a secondary stable tie-breaker:
  ```typescript
  if (primaryComparison !== 0) return primaryComparison;
  return a.membershipId.localeCompare(b.membershipId);
  ```
- **Boundary Clamping**: All query handlers and API controllers strictly clamp `limit` between 1 and 100 (`@Max(100)`), and `page` to $\ge 1$.

### 3. Recommended Database Index Strategy

To support real-world production query patterns efficiently, the following compound indexes are specified:

1. **Gym Membership Table**:
   - `CREATE INDEX idx_memberships_trainer_status ON memberships (trainer_id, status);`
   - `CREATE INDEX idx_memberships_trainer_end_date ON memberships (trainer_id, end_date);`
   - `CREATE INDEX idx_memberships_client_status ON memberships (client_id, status);`
2. **Attendance Records Table**:
   - `CREATE INDEX idx_attendance_gym_day_facility ON attendance_records (gym_day, facility_id);`
   - `CREATE INDEX idx_attendance_client_gym_day ON attendance_records (client_id, gym_day);`

### 4. Cache Decision & Authorization Isolation

- **No Global / Shared Result Caching**: Authoritative operational metrics are never stored in a shared cross-tenant cache where one trainer's data could leak to another.
- **Frontend TanStack Query Caching**:
  - `Summary KPIs`: 60s staleTime, query key `['gym', 'trainer-dashboard', 'summary', { trainerId, horizonDays }]`.
  - `Assigned Clients`: 30s staleTime, query key `['gym', 'trainer-dashboard', 'assigned-clients', params]`.
  - `Expiring Memberships`: 60s staleTime, query key `['gym', 'trainer-dashboard', 'expiring-memberships', params]`.
  - `Live Attendance`: 15s staleTime with 30s live background polling, query key `['gym', 'trainer-dashboard', 'attendance', params]`.

### 5. Failure Resilience & Graceful Degradation

- **Independent Section Failure Isolation**: The frontend and backend query structures isolate sections. A transient failure in the attendance feed or plan repository does NOT crash the entire dashboard or the assigned client roster.
- **Plan Lookup Fallback**: If a plan entity is temporarily inaccessible, the projection gracefully falls back to displaying the `planId` string rather than failing the entire request.
- **Input Validation**: Invalid temporal dates (`asOfDate`) return clean functional `ApplicationResult.fail(...)` responses mapping to `400 Bad Request` rather than throwing unhandled 500 internal server exceptions.

### 6. Observability & PII Protection

- Operational errors log query identifiers, trainer IDs, and execution durations.
- Personal Identifiable Information (such as client phone numbers, medical notes, or payment details) is excluded from log payloads.

## Consequences

### Positive

- Prevents database connection exhaustion during peak morning check-in rush hours.
- Deterministic pagination prevents duplicate client records across page navigation.
- No infrastructure overhead or operational maintenance cost of Redis or Elasticsearch clusters at current operational scale.
- Section-level fault isolation prevents whole-page outages.

### Negative / Trade-offs

- In-memory batch plan map is scoped per query execution rather than shared across requests, requiring re-fetching per query (which is negligible given $K \le 3$).
