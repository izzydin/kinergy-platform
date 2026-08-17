# ADR-0051: Clinical Progress Notes (SOAP) Schema, Medico-Legal Immutability & Treatment History Query Architecture

- **Status:** Accepted
- **Date:** 2026-08-17
- **Deciders:** Principal Software Architect, Senior DDD Engineer, Clinical Documentation Specialist, Security Architect
- **Consulted:** Phase 1 Authorization Team, Phase 2 Client Team, Phase 3 Scheduling Team, Phase 4 Kinesiology Core Team
- **Informed:** Core Platform Engineers, API & Frontend Developers

---

## Context and Problem Statement

In Kinesiology treatment, clinical documentation (progress notes) is essential for patient continuity of care, legal defensibility, insurance auditability, and clinical history review.

Milestone 4.5 introduces two critical functional capabilities to the platform:

1. **Clinical Session Notes (`SessionNotes`)**: Recording structured clinical observations, SOAP notes (Subjective, Objective, Assessment, Plan), and free-text observations during a clinical encounter.
2. **Client Treatment History Query (`TreatmentHistory`)**: Efficiently retrieving a chronological, filtered, and paginated timeline of past clinical encounters for a client.

We must establish explicit architectural governance answering:

- Is `SessionNotes` a Value Object or Entity, and how is it owned?
- What are the length, sanitization, encoding, and whitespace normalization boundaries?
- Can notes be modified after session completion?
- How is Client Treatment History queried without degrading database throughput by hydrating full aggregate roots?
- How is 100% deterministic pagination and sorting guaranteed?
- How is authorization governed between writing clinical notes vs. querying historical encounters?

---

## Decision Drivers

1. **DDD Boundary & Aggregate Purity**: Notes must belong to the transactional consistency boundary of `TreatmentSession` without introducing external framework or database dependencies into the domain layer.
2. **Medico-Legal Immutability**: Healthcare regulations mandate that once a clinical encounter is completed/signed off, the notes cannot undergo in-place silent modifications.
3. **High-Performance Query Architecture**: Treatment history list queries must be lightweight projections that avoid N+1 database queries and avoid transferring multi-kilobyte SOAP records in paginated summaries.
4. **Security & Input Sanitization**: Text input must prevent cross-site scripting (XSS) while supporting clean clinical plain text and standard formatting (bullet points, line breaks).
5. **Deterministic Pagination**: High-concurrency client history pagination must never produce erratic sorting when encounters share identical database timestamps.
6. **Explicit RBAC Authorization**: Authorization decisions must delegate strictly to `IAuthorizationEvaluator` (`kinesiology.sessions.treat` and `kinesiology.sessions.read`).

---

## Considered Options

### Clinical Notes Representation

- **Option 1 (Rich Text / HTML Document Model)**: Store raw HTML or Lexical/Slate AST JSON in the domain. _(Rejected: Introduces severe XSS vulnerabilities, complex schema migrations, and frontend library coupling to domain)_.
- **Option 2 (Full Clinical Addenda & Versioned Entity Graph)**: Build an elaborate multi-entity append-only addendum system in MVP. _(Rejected: Speculative over-engineering for MVP scope)_.
- **Option 3 (Immutable Domain Value Object with SOAP & Plain Text Support)**: Implement `SessionNotes` as an immutable Value Object with length boundaries, CRLF normalization, and whole-value replacement semantics. _(Selected)_.

### Treatment History Query Model

- **Option 1 (Aggregate Hydration & In-Memory Filtering)**: Load all `TreatmentSession` aggregates for a client into Node.js memory, filter, and sort. _(Rejected: Severe memory bloat, unacceptable latency, and N+1 query vulnerability)_.
- **Option 2 (Dedicated CQRS Read Projection & Direct Repository Query)**: Query lightweight summary projections directly via database index, selecting only required fields with bounded notes summaries. _(Selected)_.

---

## Decision Outcome

Chosen Option: **Option 3 (Immutable SessionNotes VO) + Option 2 (Dedicated Read Projection & Deterministic Pagination)**.

### 1. `SessionNotes` Value Object & Invariant Matrix

`SessionNotes` is modeled strictly as an **Immutable Domain Value Object** (`ValueObject<SessionNotesProps>`) embedded directly in the `TreatmentSession` aggregate state:

```typescript
export interface SessionNotesProps {
  readonly subjective?: string;
  readonly objective?: string;
  readonly assessment?: string;
  readonly plan?: string;
  readonly rawText?: string;
}
```

```text
┌──────────────────────────────────────────────────────────────────────────┐
│ CONTENT & NORMALIZATION INVARIANTS:                                      │
│ • Section Bound: Max 10,000 characters per section (MAX_NOTE_SECTION).  │
│ • Total Bound: Max 50,000 characters total across note (MAX_TOTAL_NOTE).│
│ • Normalization: CRLF (\r\n) is normalized to standard UNIX LF (\n).     │
│ • Whitespace: Leading/trailing whitespace trimmed; empty strings -> undef│
│ • Sanitization: HTML stripped at ingress; pure plain text & Markdown.   │
│ • Immutability: Whole-value replacement; instance permanently frozen.    │
└──────────────────────────────────────────────────────────────────────────┘
```

### 2. Medico-Legal Completion Immutability Rule

```text
┌──────────────────────────────────────────────────────────────────────────┐
│ LIFECYCLE INVARIANT:                                                     │
│ • SCHEDULED: updateNotes() is ALLOWED (Intake & pre-session charting).   │
│ • IN_PROGRESS: updateNotes() is ALLOWED (Active clinical SOAP charting). │
│ • COMPLETED: updateNotes() is STRICTLY PROHIBITED (Throws domain error). │
│ • CANCELLED: updateNotes() is STRICTLY PROHIBITED (Throws domain error). │
│ • NO_SHOW: updateNotes() is STRICTLY PROHIBITED (Throws domain error).   │
└──────────────────────────────────────────────────────────────────────────┘
```

Once `complete()` is called, the clinical encounter is finalized. In-place modification of `SessionNotes` on a `COMPLETED` session throws a domain error to protect medical record legal integrity.

### 3. Dedicated Treatment History Query Architecture

We strictly separate the **Write (Aggregate)** model from the **Read (History Projection)** model:

```text
Write Path:  UpdateSessionNotesCommand ──> TreatmentSession Aggregate ──> ITreatmentSessionRepository.save()
Read Path:   GetClientTreatmentHistory ──> ITreatmentSessionRepository.findHistoryByClientId() ──> PaginatedTreatmentHistoryDTO
```

- **Avoidance of Aggregate Hydration**: The read query executes a projected SQL query selecting only summary columns (`id`, `client_id`, `appointment_id`, `therapist_id`, `status`, `created_at`, `updated_at`, `version`), preventing aggregate overhead.
- **Notes Summary Strategy**: List views do not return full 50,000-character SOAP payloads. The projection generates a compact 160-character `notesSummary` following priority order: $\text{Assessment} \to \text{RawText} \to \text{Subjective}$. Full notes are retrieved only via single-session detail query (`GET /kinesiology/sessions/:id`).

### 4. Deterministic Pagination & Tie-Breaker Standard

To guarantee 100% stable pagination across concurrent database writes or identical timestamps:

```sql
ORDER BY
  created_at DESC,
  id DESC
LIMIT :limit OFFSET :offset
```

- **Primary Sort**: `created_at DESC` (chronological encounter timeline).
- **Stable Tie-Breaker**: `id DESC` (unique UUID/CUID tie-breaker prevents record shuffling across page boundaries).
- **Pagination Defaults**: Default `page = 1`, default `limit = 20`, bounded strictly between $1 \le \text{limit} \le 50$.

### 5. Multi-Tier Authorization Separation

```text
┌──────────────────────────────────────────────────────────────────────────┐
│ AUTHORIZATION CAPABILITIES (IAuthorizationEvaluator):                    │
│ 1. kinesiology.sessions.treat:                                           │
│    • Authorizes updating clinical progress notes on an active session.   │
│    • Granted to: THERAPIST, ADMIN, OWNER.                                │
│    • Denied to: RECEPTIONIST, CLIENT (Throws 403 Forbidden).             │
│                                                                          │
│ 2. kinesiology.sessions.read:                                            │
│    • Authorizes viewing client treatment history timelines.              │
│    • Granted to: ADMIN, OWNER, THERAPIST, RECEPTIONIST.                  │
│    • Client Self-Service: Permitted if actor.clientId === requested.id. │
└──────────────────────────────────────────────────────────────────────────┘
```

### 6. Audit Metadata Scope (MVP vs. Future)

- **MVP Scope**:
  - `TreatmentSession` captures `createdAt`, `updatedAt`, and `version`.
  - Every note update advances aggregate `version` ($v \to v + 1$) and records `TreatmentSessionNotesUpdatedEvent(sessionId, clientId, therapistId, version, updatedAt)`.
- **Explicit Non-Scope**: Full deep diff snapshots, differential undo history, and formal multi-signature addenda entities are explicitly deferred to post-MVP milestones.

---

## Consequences

### Positive

- **Guaranteed Legal Record Integrity**: Completed clinical encounters cannot be silently altered or tampered with.
- **High Database Scalability**: Querying treatment history produces predictable $O(\text{limit})$ indexed reads without table scans or memory-intensive aggregate hydration.
- **Protection Against DoS / Storage Abuse**: Strict 10k/50k character boundaries prevent storage exhaustion.
- **Zero XSS Risk**: Raw HTML is stripped at the application boundary; plain text and Markdown are stored cleanly.
- **Clean Architecture & Purity**: Kinesiology domain code remains 100% free of Prisma, NestJS, HTTP, and browser dependencies.

### Negative / Trade-offs

- Post-completion notes correction requires administrative addenda procedures rather than simple inline editing.

---

## Related Documentation

- [`docs/adr/0045-kinesiology-bounded-context-and-cross-context-identifiers.md`](file:///c:/Projects/kinergy-platform/docs/adr/0045-kinesiology-bounded-context-and-cross-context-identifiers.md)
- [`docs/adr/0046-treatment-session-lifecycle-state-machine-and-transition-specification.md`](file:///c:/Projects/kinergy-platform/docs/adr/0046-treatment-session-lifecycle-state-machine-and-transition-specification.md)
- [`docs/adr/0050-clinical-therapist-assignment-handover-and-authorization-architecture.md`](file:///c:/Projects/kinergy-platform/docs/adr/0050-clinical-therapist-assignment-handover-and-authorization-architecture.md)
- [`docs/architecture/contexts/kinesiology.md`](file:///c:/Projects/kinergy-platform/docs/architecture/contexts/kinesiology.md)
