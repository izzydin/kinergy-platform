# ADR-0069: Gym Management Daily Reception Workflow & Frontend Access Architecture

- **Status**: Accepted
- **Date**: 2026-08-19
- **Deciders**: Senior Product Engineer, Principal Frontend Architect, Domain Architect
- **Context**: Kinergy Platform Phase 5.5-G (Daily Gym Check-In Workflow — Reception Experience). Reception staff require a rapid, zero-navigation operational workspace to identify members, inspect authoritative membership eligibility, process ingress admissions with one click, and observe today's real-time attendance feed without manually maintaining external logs.

---

## 1. Context & Problem Statement

Reception desks operate in high-throughput environments where friction or multi-page navigation leads to customer bottlenecks and staff errors. Key design requirements:

1. **Unified Operational Workspace**: The entire check-in sequence (`Search Member -> Verify Eligibility -> Check In -> Confirmation -> Daily Feed`) must occur on a single responsive screen without modal fatigue or page transitions.
2. **Zero Client-Side Rule Recalculation**: The frontend must never evaluate expiration dates, calculate remaining days, or determine eligibility locally. It must render the authoritative decision directly from `MembershipEligibilityDTO`.
3. **Idempotency & Double-Click Safety**: UI forms generate unique idempotency keys per submission to safeguard against network timeouts and double clicks.
4. **Targeted Cache Invalidation**: Admissions automatically invalidate `['attendance', 'today']` and member-specific query keys without broad, expensive cache purges.

---

## 2. Architectural Decisions

```mermaid
flowchart TD
    subgraph Reception Workspace (Single Page)
        Search[Client Search Bar] --> Select[Select Member Profile]
        Select --> EligCard[Authoritative Backend Eligibility Card]
        EligCard --> Action[Check-In Action Panel<br/>Method + Gate + Idempotency]
        Action --> Mutate[Submit Ingress Admission]
        Mutate --> Confirm[Immediate Inline Diagnostic Confirmation]
        Confirm --> AutoRefresh[Invalidate & Refresh Live Feed]
        AutoRefresh --> Table[Today's Live Ingress Table & KPIs]
    end
```

### 2.1 Authoritative Eligibility Presentation

- The frontend renders backend eligibility outcomes with semantic badges:
  - `ELIGIBLE` $\rightarrow$ Green badge (`✓ ELIGIBLE TO ENTER`)
  - `EXPIRED` $\rightarrow$ Destructive red badge (`✕ MEMBERSHIP EXPIRED`)
  - `FROZEN` $\rightarrow$ Amber badge (`❄ MEMBERSHIP FROZEN`)
  - `NO_MEMBERSHIP` $\rightarrow$ Destructive red badge (`✕ NO ACTIVE MEMBERSHIP`)
  - `NOT_YET_ACTIVE` $\rightarrow$ Outline badge (`⏳ NOT YET ACTIVE`)
- If the backend returns a denial reason (e.g. suspension notes or expired date), it is displayed prominently in an alert box.

---

### 2.2 Optimistic Feedback & Query Invalidation

- Successful check-ins invalidate:
  1. `['attendance', 'today']` $\rightarrow$ immediately updates table feed and daily KPI counters.
  2. `['attendance', 'eligibility', clientId]` $\rightarrow$ refreshes eligibility if needed.
  3. `['attendance', 'client-history', clientId]` $\rightarrow$ keeps member profile timeline synchronized.
- Live attendance table performs non-intrusive background polling every 15 seconds.

---

### 2.3 Idempotency & Concurrency Protection

- Each check-in submission generates an idempotency nonce: `web_desk_${clientId}_${timestamp}_${randomNonce}`.
- Replayed submissions (e.g. from network retries) display an informational `Replay` badge without throwing misleading errors.

---

## 3. Consequences

### Positive

- **Lightning-Fast Reception Throughput**: 1-click check-ins take under 2 seconds from member search to physical admission.
- **Strict Bounded Context Compliance**: Frontend does not import backend domain models or recalculate business rules.
- **Accessible & Responsive**: Fully keyboard navigable (`ArrowDown`, `ArrowUp`, `Enter`, `Escape` in search) with ARIA roles.

---

## 4. References

- [ADR-0064: Attendance Domain Boundary & Append-Only Log Model](0064-gym-management-attendance-domain-boundary-identity-and-append-only-log-model.md)
- [ADR-0065: Membership Eligibility Contract & Cross-Context Integration](0065-gym-management-membership-eligibility-contract-and-cross-context-integration.md)
- [ADR-0066: Record Check-In Use Case, Anti-Passback & Idempotency](0066-gym-management-record-check-in-use-case-anti-passback-and-idempotency.md)
- [ADR-0067: Duplicate Check-In, Concurrency & Idempotency Architecture](0067-gym-management-duplicate-check-in-concurrency-and-idempotency-architecture.md)
- [ADR-0068: Attendance History & Operational Read Models](0068-gym-management-attendance-history-and-operational-read-models.md)
