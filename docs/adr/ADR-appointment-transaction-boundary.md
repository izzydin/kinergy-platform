# ADR-002: Independent Aggregate Transaction Boundaries & Scalar Identifier References

- **Status**: Accepted
- **Date**: 2026-08-03
- **Context**: In complex scheduling domains, modeling direct object-graph associations between Aggregates (e.g. `Appointment` holding a hard object reference to `TherapistSchedule` or `Room`) forces large transaction boundaries, causing severe database row locks, high contention, and deadlock risks under high concurrency.

## Decision

We decouple `Appointment`, `TherapistSchedule`, and `Room` into independent Aggregate Roots that reference each other strictly by **scalar string identifiers** (`clientId: string`, `therapistId: string`, `roomId: string`).

1. **Transaction Isolation**: Each transaction mutates exactly one Aggregate Root instance. Modifying an `Appointment` never mutates a `Room` or `TherapistSchedule`.
2. **Optimistic Concurrency Control**: Each Aggregate Root maintains an integer `version` field that increments on every state transition. Repository persistence adapters check `version` on `save()`.
3. **Stateless Conflict Resolution**: Multi-aggregate conflict checks are executed in memory by `ConflictDetectionService` using domain specifications rather than database foreign-key locks.

## Consequences

### Positive

- **High Throughput**: Prevents database table/row locks across multiple scheduling tables.
- **Microservices Readiness**: Aggregates can be split into separate microservices or database partitions seamlessly.

### Negative / Trade-offs

- Cross-aggregate consistency relies on eventual consistency via domain events or stateless domain service validations before command execution.
