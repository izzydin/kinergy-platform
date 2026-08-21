# Optimistic Mutation Decision Matrix

## 1. Purpose & Developer Workflow

This document provides Kinergy frontend developers with a deterministic, step-by-step decision framework to evaluate whether a new mutation should be implemented as **OPTIMISTIC**, **SAFE ONLY WITH JUSTIFICATION**, or **PESSIMISTIC**.

> **The Golden Rule:** When uncertain, choose **PESSIMISTIC** behavior. The platform defaults to pessimistic mutation state (displaying spinners, disabling actions, and awaiting backend confirmation).

---

## 2. The 12-Point Mutation Evaluation Checklist

Before implementing any mutation in a domain feature module (`apps/web/src/modules/<domain>`), answer the 12 evaluation questions:

|    #    | Evaluation Question                                                           | Ideal for Optimistic |    Risk Indicator (Pessimistic)     |
| :-----: | :---------------------------------------------------------------------------- | :------------------: | :---------------------------------: |
| **Q1**  | Is the operation lightweight (low computational/payload complexity)?          |       **YES**        |      NO (Heavy/Multi-payload)       |
| **Q2**  | Is the expected result 100% deterministic and predictable?                    |       **YES**        | NO (Server computes/adjusts values) |
| **Q3**  | Is the operation reversible (can be cleanly flipped back)?                    |       **YES**        |     NO (Permanent/Destructive)      |
| **Q4**  | Can the previous client cache state be captured reliably in `onMutate`?       |       **YES**        | NO (Complex distributed cache keys) |
| **Q5**  | Can a deterministic rollback be guaranteed upon API rejection (`onError`)?    |       **YES**        | NO (Side effects already occurred)  |
| **Q6**  | Is the operation financially or legally significant (ledger, payment, taxes)? |        **NO**        |   **YES → STRICTLY PESSIMISTIC**    |
| **Q7**  | Does the operation affect inventory levels, stock counts, or accounting?      |        **NO**        |   **YES → STRICTLY PESSIMISTIC**    |
| **Q8**  | Does the operation trigger third-party side effects (SMS, email, gateways)?   |        **NO**        |   **YES → STRICTLY PESSIMISTIC**    |
| **Q9**  | Does the backend perform multi-aggregate transactions or unit-of-work steps?  |        **NO**        |   **YES → STRICTLY PESSIMISTIC**    |
| **Q10** | Does the server generate critical state (IDs, tokens, hashes, timestamps)?    |        **NO**        |   **YES → STRICTLY PESSIMISTIC**    |
| **Q11** | Can concurrent user actions create conflicting state / race conditions?       |        **NO**        |   **YES → STRICTLY PESSIMISTIC**    |
| **Q12** | Would a 500ms temporary incorrect UI create meaningful business risk?         |        **NO**        |   **YES → STRICTLY PESSIMISTIC**    |

---

## 3. Classification Tiers & Decision Rules

```
                             ┌───────────────────────────────────────┐
                             │       Evaluate 12-Point Checklist     │
                             └───────────────────┬───────────────────┘
                                                 │
                  ┌──────────────────────────────┴──────────────────────────────┐
                  ▼                                                             ▼
     Any Q6–Q12 answered YES?                                      All Q6–Q12 answered NO?
                  │                                                             │
                  ▼                                                             ▼
        ┌───────────────────┐                                      All Q1–Q5 answered YES?
        │    PESSIMISTIC    │                                                   │
        └───────────────────┘                                    ┌──────────────┴──────────────┐
                                                                 ▼                             ▼
                                                                YES                           NO
                                                                 │                             │
                                                                 ▼                             ▼
                                                       ┌───────────────────┐        ┌───────────────────────┐
                                                       │    OPTIMISTIC     │        │ SAFE ONLY WITH        │
                                                       └───────────────────┘        │ JUSTIFICATION         │
                                                                                    └───────────────────────┘
```

### 1. `OPTIMISTIC` (Approved by Policy)

- **Criteria:** All Q1–Q5 are YES; All Q6–Q12 are NO.
- **Implementation Requirement:** Must implement standard 4-step rollback (`cancelQueries`, `onMutate` snapshot, `onError` restore, `onSettled` invalidate) and automated unit tests verifying error rollback.

### 2. `SAFE ONLY WITH JUSTIFICATION` (Conditional Exception)

- **Criteria:** Lightweight edit where server generates minor metadata (e.g. `updatedAt`), but previous state is known.
- **Requirement:** Feature lead must document rollback proof, verify server reconciliation in `onSettled`, and provide test coverage for network failure scenarios.

### 3. `PESSIMISTIC` (Platform Default)

- **Criteria:** Any of Q6–Q12 is YES, or operation creates/deletes entities with server-generated identity/invariants.
- **Implementation Requirement:** Keep button disabled with `<Spinner />` or skeleton until promise resolves. Disclose errors with standard toast/alert.

---

## 4. Platform Domain Operations Matrix

### A. Identity & Access Management

| Operation                             |         Classification         | Justification / Rollback Strategy                                       |
| :------------------------------------ | :----------------------------: | :---------------------------------------------------------------------- |
| **Activate User**                     |          `OPTIMISTIC`          | Binary state flip (`ACTIVE`). Rollback restores `INACTIVE`/`SUSPENDED`. |
| **Deactivate User**                   |          `OPTIMISTIC`          | Binary state flip (`INACTIVE`). Rollback restores `ACTIVE`.             |
| **Toggle User Preference / Theme**    |          `OPTIMISTIC`          | Local display preference. Rollback restores previous boolean value.     |
| **Update User Profile (Name, Phone)** | `SAFE ONLY WITH JUSTIFICATION` | Scalar string replacement. Rollback restores previous string fields.    |
| **Change User Roles / Permissions**   |         `PESSIMISTIC`          | High security impact; affects route authorization guards immediately.   |
| **Admin Password Reset / Invite**     |         `PESSIMISTIC`          | Generates secure temporary tokens and triggers email dispatch.          |

### B. Client Domain & Gym Operations

| Operation                        | Classification | Justification / Rollback Strategy                                              |
| :------------------------------- | :------------: | :----------------------------------------------------------------------------- |
| **Archive Client (Soft Delete)** |  `OPTIMISTIC`  | Binary status change (`ARCHIVED`). Rollback restores client to active list.    |
| **Restore Client**               |  `OPTIMISTIC`  | Binary status change (`ACTIVE`). Rollback returns client to archive view.      |
| **Record Daily Check-in**        | `PESSIMISTIC`  | Anti-passback validation and temporal eligibility check required by backend.   |
| **Create New Client**            | `PESSIMISTIC`  | Generates aggregate `ClientId`, audit logs, and default profile records.       |
| **Assign Membership Plan**       | `PESSIMISTIC`  | Involves commercial pricing calculation, contract terms, and billing schedule. |

### C. Clinical & Treatment Workflow

| Operation                           |         Classification         | Justification / Rollback Strategy                                     |
| :---------------------------------- | :----------------------------: | :-------------------------------------------------------------------- |
| **Sign-Off SOAP Progress Note**     |         `PESSIMISTIC`          | Medico-legal record requiring cryptographic locking and timestamping. |
| **Update Treatment Session Status** |         `PESSIMISTIC`          | Cross-context event emission to Scheduling and Client timeline.       |
| **Draft Exercise Recommendation**   | `SAFE ONLY WITH JUSTIFICATION` | Uncommitted draft notes in client-side scratchpad.                    |

### D. Scheduling & Resource Management

| Operation                  | Classification | Justification / Rollback Strategy                                     |
| :------------------------- | :------------: | :-------------------------------------------------------------------- |
| **Create Appointment**     | `PESSIMISTIC`  | Multi-party room/therapist conflict matrix check required.            |
| **Reschedule Appointment** | `PESSIMISTIC`  | Requires real-time calendar slot lock to prevent double booking.      |
| **Cancel Appointment**     | `PESSIMISTIC`  | Triggers cancellation policy fee calculations and notification hooks. |

### E. Commerce, Billing & Inventory

| Operation                        | Classification | Justification / Rollback Strategy                                         |
| :------------------------------- | :------------: | :------------------------------------------------------------------------ |
| **Payment Capture / Refund**     | `PESSIMISTIC`  | Direct financial gateway transaction; zero client-side guesswork allowed. |
| **Point of Sale (POS) Checkout** | `PESSIMISTIC`  | Fiscal invoice generation and real-time inventory deduction.              |
| **Stock Transfer / Adjustment**  | `PESSIMISTIC`  | Physical goods ledger mutation requiring strict warehouse consistency.    |

---

## 5. Developer Implementation Rules

1. **Never use optimistic UI for creation of new entities with server-generated IDs** unless a client-side UUID generation strategy with backend parity is explicitly approved in an ADR.
2. **Always disable action buttons while `isPending` is true** to avoid concurrent out-of-order race conditions.
3. **Always write an integration test asserting that when the API returns 500, the UI restores the previous state.**
