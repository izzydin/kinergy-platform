# ADR 0063: Gym Management Operational Read Models, Expiring-Soon Semantics & Notification Boundaries

- **Status**: Accepted
- **Date**: 2026-08-18
- **Context**: Gym Management Bounded Context (`packages/core/src/gym/`)
- **Deciders**: Principal Product Architect, Senior Application Architect

---

## 1. Context and Problem Statement

Following the establishment of canonical expiration semantics ([ADR-0062](./0062-gym-management-membership-expiration-temporal-semantics-and-canonical-eligibility-model.md)) and background reconciliation processing (Phase 5.4-E), the platform requires operational visibility into expiring and expired memberships for front-desk reception dashboards, CRM outreach lists, and notification workflows.

We must decide:

1. How "expiring-soon" is modeled (Domain Lifecycle State vs. Operational Read Model Projection).
2. How dashboards identify active, expiring soon, and expired memberships without duplicate frontend business logic.
3. The architectural boundary for membership notifications in the MVP (In-App / Event Intents vs. External Provider Integrations).

---

## 2. Decision Drivers

- **Domain Model Purity**: The `MembershipStatus` domain state machine must only model true lifecycle states (`PENDING`, `ACTIVE`, `FROZEN`, `EXPIRED`, `CANCELLED`, `TERMINATED`). "Expiring soon" is an operational query concern based on a time horizon, not a persistent aggregate state.
- **Single Source of Truth**: Frontends must consume authoritative backend DTO projections (`daysRemaining`, `isExpiringSoon`, `isExpired`) rather than duplicating temporal interval logic in client JavaScript.
- **Scope Discipline (MVP)**: External delivery channels (WhatsApp, Twilio SMS, SendGrid email) are deferred to a dedicated Communications context. Gym Management dispatches immutable domain events and structured notification intents.

---

## 3. Considered Options

- **Option A (Domain State)**: Add `EXPIRING_SOON` as a distinct enum value in `MembershipStatus`.
  - _Cons_: Corrupts domain lifecycle state machine; requires frequent cron workers to transition `ACTIVE -> EXPIRING_SOON`; complicates renewal rules and access control checks.
- **Option B (Frontend Computation)**: Expose raw `endDate` and have the frontend compute "expiring soon" and "expired" status via JavaScript `Date.now()`.
  - _Cons_: Violates backend authority; causes inconsistencies across browser timezones; leaks business rules into presentation layer.
- **Option C (CQRS Operational Read Models & Projections - Selected)**: Keep `MembershipStatus` pure. Implement CQRS read queries (`GetExpiringMembershipsQuery`, `GetMembershipOperationalSummaryQuery`) projecting derived temporal indicators (`isExpiringSoon`, `daysRemaining`, `isExpired`) in UTC.

---

## 4. Decision Outcome

**Chosen Option: Option C (CQRS Operational Read Models & Projections)**

### 4.1 Expiring-Soon Definition & Horizon

- **Threshold**: Default 7 days ($endDate - now \le 7 \times 24 \times 60 \times 60 \times 1000\text{ ms}$), configurable per query request (`horizonDays`).
- **Domain Status**: Remains `ACTIVE` or `FROZEN`.
- **Read Model DTO**: [`ExpiringMembershipItemDTO`](../../packages/core/src/gym/application/dtos/expiring-membership-item.dto.ts).

### 4.2 Dashboard Status Interpretation Matrix

- **`ACTIVE`**: `status === ACTIVE && !isExpiringSoon && isCurrent(now)`
- **`EXPIRING_SOON`**: `(status === ACTIVE || status === FROZEN) && isCurrent(now) && (endDate - now <= horizonMs)`
- **`EXPIRED`**: `status === EXPIRED || (endDate <= now)`
- **`FROZEN`**: `status === FROZEN && !isExpiringSoon`

### 4.3 Notification Boundary & External Channels

- **In-Scope (MVP)**: Gym Management publishes immutable domain events (`MembershipExpiredEvent`, `MembershipRenewedEvent`) and structured notification intents via `MembershipNotificationDispatcher`.
- **Deferred**: WhatsApp Business API, Twilio SMS, and SMTP email infrastructure are deferred to the dedicated Communications subsystem.

---

## 5. Consequences

### Positive

- **Zero Domain State Pollution**: The aggregate root remains focused entirely on core business invariants.
- **Client Timezone Resilience**: All projections execute with respect to `Clock` in UTC, ensuring identical dashboard views regardless of client machine settings.
- **Clean Event-Driven Integration**: Downstream notification consumers integrate via standard domain events without aggregate coupling.

### Negative / Trade-offs

- Read models must be queried using explicit CQRS query handlers rather than direct aggregate property inspection.
