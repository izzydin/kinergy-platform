# ADR 0052: Client Longitudinal Activity Timeline & Cross-Context Event Projection Architecture

## Status

**ACCEPTED** (Phase 4 — Milestone 4.6)

## Context

As the Kinergy Platform expands across multiple bounded contexts (Client Management, Scheduling, Kinesiology / Treatment Sessions), practitioners, administrators, and support staff require a unified, longitudinal activity timeline of client business events.

In Milestone 4.6, the specific trigger requirement is that when a clinical treatment session completes in Kinesiology (`TreatmentSessionCompletedEvent`), the client's activity timeline must reflect this event. Future business events across other contexts (e.g. Appointment Scheduled, Appointment Cancelled, Treatment Session Started, Profile Updated) must integrate seamlessly without compromising bounded context boundaries or leaking protected health information (PHI).

### Architectural Challenges

1. **Ownership Boundary**: Which bounded context owns the patient timeline? Does Kinesiology own it, or does Client Management own it, or is it an ad-hoc composition?
2. **Clinical Privacy & PHI Separation**: Clinical progress notes (SOAP notes, physical findings, muscle test results) belong exclusively to Kinesiology and require strict clinical authorization (`kinesiology.sessions.read`). The general patient timeline must be accessible under standard administrative/client permissions (`client.read`) without exposing PHI.
3. **Transactional Isolation**: The completion of a clinical encounter (`TreatmentSession.complete()`) is an authoritative medico-legal transaction. Failures or latency in timeline projection must never rollback or fail the completed clinical encounter.
4. **Deterministic Ordering**: Timeline queries must preserve strictly deterministic sorting across pagination boundaries, even when multiple events share identical microsecond timestamps.
5. **Idempotency & Replay**: Network retries or event redeliveries must not create duplicate timeline rows.

---

## Decision

### 1. Ownership & Bounded Context Boundary

- **Client Management Context** is the authoritative owner of the **Client Activity Timeline** read model (`client_timeline_entries` table in PostgreSQL).
- **Kinesiology Context** remains the sole authoritative owner of `TreatmentSession` aggregates, clinical lifecycles, and SOAP documentation.
- The Patient Timeline is an **Append-Only Materialized Read Model Projection**, completely decoupled from domain aggregates.

```text
┌───────────────────────────────────────────────────────────┐
│ KINESIOLOGY BOUNDED CONTEXT                               │
│ • TreatmentSession Aggregate (Authoritative Source)       │
│ • Emits TreatmentSessionCompletedEvent                    │
└─────────────────────────────┬─────────────────────────────┘
                              │
                              ▼ (In-process Domain Event Dispatcher)
┌───────────────────────────────────────────────────────────┐
│ CLIENT MANAGEMENT BOUNDED CONTEXT                         │
│ • ClientTimelineProjectionHandler (Projection Consumer)   │
│ • Correlation Idempotency Guard (sessionId check)         │
│ • ClientTimelineEntry Read Model (client_timeline_entries)│
│ • GET /clients/:id/timeline (Fast, non-locking read view) │
└───────────────────────────────────────────────────────────┘
```

### 2. Event Contract & PHI Protection

The integration contract `TreatmentSessionCompletedEvent` publishes only immutable, non-sensitive operational identifiers:

- `sessionId`: Unique scalar identifier of the completed session.
- `clientId`: Unique scalar identifier of the client.
- `therapistId`: Unique scalar identifier of the treating practitioner.
- `appointmentId`: Unique scalar identifier of the correlated booking.
- `completedAt`: Domain business completion timestamp (`occurredAt`).

**PHI Invariant**: Zero SOAP progress notes, clinical evaluations, or medical observations are placed in `ClientTimelineEntry.summary` or `metadata`.

### 3. Materialized Projection Schema

```prisma
model ClientTimelineEntry {
  id           String   @id @default(uuid())
  clientId     String   @map("client_id")
  sourceModule String   @map("source_module")
  eventType    String   @map("event_type")
  summary      String
  metadata     Json     @default("{}")
  occurredAt   DateTime @map("occurred_at")
  createdAt    DateTime @default(now()) @map("created_at")

  client Client @relation("ClientToTimeline", fields: [clientId], references: [id], onDelete: Cascade)

  @@index([clientId, occurredAt(sort: Desc)])
  @@index([eventType])
  @@map("client_timeline_entries")
}
```

### 4. Deterministic Ordering & Tie-Breaker Standard

Timeline queries enforce strict deterministic sorting:

```sql
ORDER BY occurred_at DESC, id DESC
```

- **Primary Sort Key**: `occurredAt DESC` (Domain business instant, strictly in UTC ISO 8601).
- **Deterministic Tie-Breaker**: `id DESC` (Synthetic UUID).
- **Prohibition**: Database ingestion timestamp (`createdAt`) is never used as the primary timeline order key.

### 5. Idempotency Standard

Before persisting a new `ClientTimelineEntry` from a domain event, the projection handler invokes `existsByCorrelation(clientId, eventType, 'sessionId', sessionId)`. If an entry for that session already exists, the projection is safely skipped with zero side effects.

### 6. Resilience & Failure Isolation

- **Non-Blocking Execution**: Event publication and projection handling are wrapped in defensive try/catch error boundaries.
- **Transactional Invariant**: A projection failure (e.g. database timeout or dead-letter condition) never aborts or rolls back the authoritative `TreatmentSession` state.
- **Replayability**: If the projection table is lost or corrupted, 100% of historical timeline entries can be deterministically reconstructed by replaying completed `TreatmentSession` records.

---

## Consequences

### Positive

- **High Performance**: $O(\text{limit})$ indexed timeline queries without runtime table joins across domains.
- **Strict Privacy Compliance**: Zero PHI leaks into general client audit trails; clinical notes remain protected behind `kinesiology.sessions.read`.
- **Fault Isolation**: Kinesiology transactional throughput is completely isolated from downstream timeline projection latency.
- **Total Determinism**: Pagination is stable and repeatable under identical or rapid event occurrences.

### Negative / Trade-Offs

- **Eventual Consistency Lag**: The timeline projection reflects completed sessions with a minor latency (< 100ms in-process).
- **Denormalized Storage**: Basic metadata is duplicated in `client_timeline_entries` to enable fast reads without cross-context RPC.

---

## References

- [ADR 0045: Kinesiology Bounded Context and Cross-Context Identifiers](./0045-kinesiology-bounded-context-and-cross-context-identifiers.md)
- [ADR 0046: Treatment Session Lifecycle State Machine](./0046-treatment-session-lifecycle-state-machine-and-transition-specification.md)
- [ADR 0051: Clinical Progress Notes (SOAP) Schema & Treatment History Query](./0051-clinical-progress-notes-soap-schema-medico-legal-immutability-and-treatment-history-query-architecture.md)
