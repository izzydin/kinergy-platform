# ADR-0053: Clinical Treatment Session Presentation Workflow, SOAP Charting Workspace & API Contract Architecture

## Status

**Accepted**

## Context

Milestones 4.1 through 4.6 established the domain foundation, aggregate invariants, appointment ACL correlation, practitioner handover, SOAP clinical notes value object, treatment history query repository, and asynchronous timeline projection event pipelines for the **Kinesiology Bounded Context**.

Milestone 4.7 requires exposing these capabilities to authorized practitioners and staff through a production-ready HTTP REST API (`apps/api/src/kinesiology/`) and an enterprise React frontend module (`apps/web/src/modules/kinesiology/` & `apps/web/src/modules/client/`).

Key architectural challenges addressed:

1. **API Boundary & Intent-Driven Lifecycle Operations**: How to structure RESTful endpoints for treatment session creation and explicit domain state transitions without reducing clinical actions to generic CRUD updates.
2. **Frontend State & Authoritative Server Ownership**: Where business rules and validation reside, preventing duplicate domain logic from leaking into React while ensuring responsive, accessible, and error-resilient clinical UX.
3. **Cross-Context Timeline & Read Model Consumption**: How the frontend renders longitudinal client history and timeline entries without performing ad-hoc client-side joins across multiple contexts.
4. **Cache Invalidation Topology & Concurrency Safety**: How TanStack Query manages cache hierarchies, optimistic hazard prevention, and concurrent modification (HTTP 409) reconciliation.
5. **Progressive Authorization UX**: How fine-grained RBAC permissions dictate UI action visibility while backend `AuthorizationGuard` remains strictly authoritative.

---

## Decision

### 1. REST API Contract & Explicit Command Endpoints

We expose the Kinesiology domain through explicit, command-aligned endpoints mapped 1-to-1 to application command handlers:

```text
POST   /api/v1/kinesiology/sessions                  -> CreateTreatmentSessionFromAppointmentHandler
GET    /api/v1/kinesiology/sessions/:id              -> GetTreatmentSessionByIdHandler
POST   /api/v1/kinesiology/sessions/:id/start        -> StartTreatmentSessionHandler
POST   /api/v1/kinesiology/sessions/:id/assign-therapist -> AssignTherapistToSessionHandler
PUT    /api/v1/kinesiology/sessions/:id/notes        -> UpdateSessionNotesHandler
POST   /api/v1/kinesiology/sessions/:id/complete     -> CompleteTreatmentSessionHandler
POST   /api/v1/kinesiology/sessions/:id/cancel       -> CancelTreatmentSessionHandler
GET    /api/v1/kinesiology/clients/:id/treatment-history -> GetClientTreatmentHistoryHandler
GET    /api/v1/clients/:id/timeline                  -> GetClientHistoryUseCase (Client Read Model)
```

- **Domain Integrity**: No business logic resides in NestJS controllers. Controllers only perform DTO validation, context extraction (`req.user`), dispatch to CQRS command/query handlers, and map functional `ApplicationResult` to HTTP status codes.
- **Explicit RPC/REST Balance**: Explicit intent endpoints (`/start`, `/complete`, `/cancel`, `/assign-therapist`) prevent ambiguity over lifecycle transitions.

---

### 2. Frontend Module Architecture & Route Ownership

The frontend module is organized under `apps/web/src/modules/kinesiology/` following platform frontend architecture standards:

```text
apps/web/src/modules/kinesiology/
├── api/                    # kinesiologyApi using centralized HttpClient
├── components/             # Domain presentation components (SoapNotesForm, StatusBadge, Modals)
├── hooks/                  # TanStack Query custom hooks (useTreatmentSession, useTreatmentMutations, useClientTreatmentHistory)
├── routes/                 # Top-level workspace pages (TreatmentSessionWorkspacePage, ClientTreatmentHistoryPage)
├── schemas/                # Zod validation schemas for forms (session-notes, assign-therapist, cancel-session)
├── types/                  # Domain-facing frontend DTO interfaces
└── index.ts                # Public module contract exports
```

- **Route Ownership**:
  - `/kinesiology/sessions/:sessionId`: Clinical Treatment Session Workspace (guarded by `kinesiology.sessions.read`).
  - `/clients/:clientId/treatments`: Dedicated Client Treatment History view under the Client Profile navigation tabs.
  - `/clients/:clientId/timeline`: Longitudinal Activity Timeline consuming cross-context projections.

---

### 3. Server State & Targeted Cache Invalidation

The frontend strictly uses **TanStack Query** as the single source of truth for server state. Server state is never duplicated in Redux, Zustand, React Context, or `localStorage`.

#### Query Key Hierarchy:

- `kinesiologyQueryKeys.sessions()` -> `['kinesiology', 'sessions']`
- `kinesiologyQueryKeys.session(sessionId)` -> `['kinesiology', 'sessions', sessionId]`
- `kinesiologyQueryKeys.history(clientId, filters)` -> `['kinesiology', 'history', clientId, filters]`
- `clientTimelineQueryKeys.client(clientId, params)` -> `['timeline', clientId, params]`

#### Targeted Mutation Invalidation (Zero Global Wipes):

- **`startSession`**: Updates session cache; invalidates `sessions` and `history`.
- **`updateNotes`**: Updates session cache; invalidates `history`.
- **`completeSession`**: Updates session cache; invalidates `sessions`, `history`, and `timeline`.
- **`cancelSession`**: Updates session cache; invalidates `sessions`, `history`, and `timeline`.
- **`createSession`**: Invalidates `sessions`, `history`, `appointments`, and `timeline`.

---

### 4. Authoritative Confirmation Over Optimistic Hazards

For business-significant lifecycle transitions (e.g. signing off a clinical session or cancelling an encounter), **optimistic updates are prohibited**. The UI disables buttons during `isPending` state and awaits authoritative backend confirmation before transitioning UI state and invalidating dependent caches.

---

### 5. Multi-State Error & Conflict Handling

- **HTTP 409 (Conflict)**: Surfaced to the practitioner via `useNotification()` with actionable explanations (e.g. duplicate appointment session or concurrent version conflict) while triggering automatic cache invalidation to reconcile server state.
- **HTTP 403 (Forbidden)**: Progressive UI gating hides or disables unauthorized actions based on `useAuth().hasPermission()`, while backend `AuthorizationGuard` evaluates permissions with zero role hardcoding (`if role === ...`).

---

## Consequences

### Positive

- **Clean Architectural Separation**: Pure command-driven REST API layer orchestrating domain aggregates without business logic duplication.
- **Zero Cross-Context Leakage**: Client timeline read model consumes event-projected metadata without exposing clinical progress notes (PHI).
- **Medico-Legal Assurance**: Irrevocable session completion locks form inputs and provides immediate visual feedback.
- **Comprehensive Automated Coverage**: Verified by 182 monorepo test suites spanning domain invariants, CQRS handlers, API security, and React testing library workflows.

### Negative

- Practitioners modifying notes concurrently on the same session will encounter optimistic version concurrency conflicts (HTTP 409) requiring reconciliation on stale client views.

---

## References

- ADR-0045: Kinesiology Bounded Context Ownership & Cross-Context Identifiers
- ADR-0046: TreatmentSession Lifecycle State Machine & Transition Specification
- ADR-0047: Appointment Correlation, Uniqueness & Event Emission Architecture
- ADR-0050: Clinical Therapist Assignment, Handover & Authorization Architecture in Kinesiology
- ADR-0051: Clinical Progress Notes (SOAP) Schema, Medico-Legal Immutability & History Query
- ADR-0052: Client Activity Timeline & Cross-Context Event Projection Architecture
