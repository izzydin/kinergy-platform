# ADR-0065: Gym Management Membership Eligibility Contract & Cross-Context Integration

- **Status**: Accepted
- **Date**: 2026-08-19
- **Deciders**: Principal Domain Architect, Senior Application Architect, Test Architect
- **Context**: Kinergy Platform Phase 5.5-B (Membership Eligibility Contract & Cross-Context Integration). Attendance and turnstile check-in mechanisms require an unambiguous, high-speed contract to answer: _"Can this Client check in to the gym right now?"_. Attendance must consume this eligibility decision without duplicating or reconstructing Membership aggregate state-machine rules, freeze calculations, or expiration mathematics.

---

## 1. Context & Problem Statement

In fitness facility software engineering, coupling access control directly to raw database queries or reproducing lifecycle logic inside attendance controllers introduces severe defects:

1. **Lifecycle Rule Duplication**: If the Attendance module writes `if (membership.status === 'ACTIVE' && membership.endDate > now)`, any change in membership lifecycle (e.g. grace periods, freeze calculations, half-open interval boundaries) requires synchronized changes in attendance code, leading to logic drift.
2. **Multi-Membership Ambiguity**: A client may possess multiple historical memberships (e.g. past expired agreements, past cancellations, or a pre-scheduled renewal for next month). Without a canonical evaluation policy, database sort order can cause an active member to be rejected or an expired agreement to be evaluated.
3. **Cross-Context Leaking**: Attendance attempting to query Client Management database tables directly breaches bounded context isolation.
4. **Poor Front-Desk Diagnostics**: Merely returning a boolean `false` without explicit operational failure codes (`INACTIVE_CLIENT`, `NO_MEMBERSHIP`, `EXPIRED`, `FROZEN`, `NOT_YET_ACTIVE`, `CANCELLED`, `TERMINATED`) forces front-desk receptionists to guess why access was denied.

A formal Architectural Decision Record is required to define the authoritative Membership Eligibility contract, canonical outcome codes, multi-membership resolution policy, and cross-context boundaries.

---

## 2. Architectural Decisions

### 2.1 The Authoritative Eligibility Ownership Invariant

> **Gym Management (specifically the Membership domain and application service layer) is the sole authoritative owner of membership admission eligibility evaluation.**
>
> **Attendance owns recording the check-in event and enforcing anti-passback policies, but delegates the admission decision to the Membership Eligibility contract.**

Attendance must **NEVER** inspect membership end dates or status strings directly to infer eligibility.

```mermaid
graph TD
    subgraph "Client Management Context [Upstream Master]"
        ClientPort[ClientLookupPort / IClientFacade]
    end

    subgraph "Gym Management Bounded Context"
        subgraph "Customer Agreement Boundary (Owner)"
            MembershipRepo[MembershipRepository]
            MemAR[Membership Aggregate Root]
            EligHandler["CheckMembershipEligibilityHandler<br/>(Implements MembershipEligibilityPort)"]
        end

        subgraph "Operational Access Boundary (Consumer)"
            AttendanceHandler[RecordCheckInHandler]
            ReceptionQuery[GetReceptionDashboardQuery]
        end
    end

    AttendanceHandler -->|Invokes evaluateEligibility(clientId, asOf)| EligHandler
    ReceptionQuery -->|Invokes evaluateEligibility(clientId, asOf)| EligHandler
    EligHandler -->|1. Validates standing| ClientPort
    EligHandler -->|2. Loads agreements| MembershipRepo
    EligHandler -->|3. Evaluates domain predicate| MemAR
    EligHandler -->>|4. Returns MembershipEligibilityResultDTO| AttendanceHandler
```

---

### 2.2 Canonical Eligibility Contract: `MembershipEligibilityPort`

The contract is formalized as a domain/application port interface in `packages/core/src/gym/application/ports/membership-eligibility.port.ts`:

```typescript
export interface MembershipEligibilityPort {
  evaluateEligibility(clientId: string, asOf?: Date): Promise<MembershipEligibilityResultDTO>;
}
```

And as a CQRS Query in `packages/core/src/gym/application/queries/check-membership-eligibility.query.ts`.

---

### 2.3 Canonical Diagnostic Outcomes (`MembershipEligibilityOutcome`)

The contract returns a structured DTO carrying explicit diagnostic results:

| Outcome Code          | Meaning                                                                | `isEligible` | Operational Front-Desk Action                   |
| :-------------------- | :--------------------------------------------------------------------- | :----------- | :---------------------------------------------- |
| **`ELIGIBLE`**        | Client has an active, valid membership covering current time.          | `true`       | Grant admission / Open turnstile.               |
| **`NO_MEMBERSHIP`**   | Client has no membership agreements on record.                         | `false`      | Direct to sales desk / Offer membership plan.   |
| **`INACTIVE_CLIENT`** | Client ID does not exist or client is inactive in Client Management.   | `false`      | Direct to reception for account resolution.     |
| **`EXPIRED`**         | Validity period has ended ($asOf \ge endDate$) or status is `EXPIRED`. | `false`      | Offer immediate renewal / Process payment.      |
| **`FROZEN`**          | Membership is currently in an active freeze suspension window.         | `false`      | Inform member of freeze / Offer early unfreeze. |
| **`NOT_YET_ACTIVE`**  | Membership is `PENDING` or validity period starts in the future.       | `false`      | Inform member of start date.                    |
| **`CANCELLED`**       | Membership was cancelled prior to natural expiration.                  | `false`      | Inform member of cancellation status.           |
| **`TERMINATED`**      | Membership was revoked for administrative/policy reasons.              | `false`      | Refer to club management.                       |

---

### 2.4 Multiple Memberships Resolution Policy

When a client record contains multiple membership agreements:

1. **Step 1 — Search for Active Eligibility**: The handler evaluates `membership.isEligibleForAttendance(asOf) && asOf < membership.period.endDate`. If an eligible agreement is found, it is selected immediately, returning `ELIGIBLE` with its `membershipId`.
2. **Step 2 — Invariant Protection**: Under `MembershipOverlapPolicy` (ADR-0060), a client cannot have overlapping active commitments. Thus, at most ONE membership can be eligible at any instant $T$.
3. **Step 3 — Deterministic Diagnostics**: If no currently eligible agreement is found:
   - Check if any agreement is `FROZEN` covering $asOf \implies$ return `FROZEN`.
   - Check if any agreement is `PENDING` or scheduled for the future $\implies$ return `NOT_YET_ACTIVE`.
   - Sort remaining agreements by `period.endDate` descending (analyzing the most recent contractual agreement) $\implies$ return `EXPIRED`, `CANCELLED`, or `TERMINATED` accordingly.

---

### 2.5 Temporal Boundary Consistency

- Evaluates against the exact half-open interval $[startDate, endDate)$ in UTC (ADR-0062).
- At $1\text{ ms}$ before $endDate$ (`23:59:59.999Z`), access is `ELIGIBLE`.
- At exact boundary $endDate$ (`00:00:00.000Z`) and beyond, real-time gate evaluation returns `EXPIRED` even before asynchronous batch reconciliation occurs.

---

### 2.6 Transaction & Consistency Boundaries

- **Query / Read-Only**: `CheckMembershipEligibilityHandler` is a read-only query. It acquires zero row locks.
- **Check-In Transaction**: The subsequent check-in use case (`RecordCheckInHandler`) orchestrates:
  1. Invoking `MembershipEligibilityPort.evaluateEligibility()`.
  2. If `!isEligible`, appends a `DENIED` attendance log and returns the error code.
  3. If `isEligible`, checks anti-passback and appends a `GRANTED` attendance record atomically.

---

## 3. Consequences

### Positive

- **Complete Decoupling**: Attendance remains an append-only access log and does not leak or duplicate membership state machine rules.
- **Deterministic Resolution**: Multi-membership clients are handled predictably without database order dependencies.
- **Rich Operational UX**: Front desk and mobile kiosks receive clear diagnostic messages explaining exact denial reasons.
- **Strict Layering**: Fully complies with Clean Architecture and DDD onion principles.

### Negative / Trade-offs

- An additional query lookup is performed during turnstile check-in (mitigated by indexed lookups on `(clientId, status)` and `(clientId, period)`).

---

## 4. References

- [ADR-0054: Gym Management Bounded Context Ownership](0054-gym-management-bounded-context-ownership-and-context-map.md)
- [ADR-0060: Duplicate & Overlapping Membership Policy](0060-gym-management-duplicate-and-overlapping-membership-policy.md)
- [ADR-0062: Membership Expiration Temporal Semantics & Canonical Eligibility Model](0062-gym-management-membership-expiration-temporal-semantics-and-canonical-eligibility-model.md)
- [ADR-0064: Gym Management Attendance Domain Boundary, Identity & Append-Only Log Model](0064-gym-management-attendance-domain-boundary-identity-and-append-only-log-model.md)
