# Milestone 9.5.4 — Gym Business Journey Acceptance Report

- **Date**: 2026-11-03
- **Auditor**: Senior Full-Stack Engineer & QA Engineer
- **Environment**: PostgreSQL `kinergy_dev` (Docker Container `kinergy-postgres` on port 5433)
- **Status**: **PASS** (with Check-in Commercial Payment Policy marked as `PENDING BUSINESS APPROVAL`)

---

## 1. Executive Summary

Milestone 9.5.4 evaluated the full end-to-end gym commercial and operational lifecycle:
$$\text{Client Ingress} \longrightarrow \text{Membership Enrollment} \longrightarrow \text{Commercial Sale \& Payment} \longrightarrow \text{Receipt Voucher} \longrightarrow \text{Reception Check-In}$$

Verification confirmed that:

1. The synthetic demo environment established in Milestone 9.5.2 and seeded in Milestone 9.5.3 operates with full relational integrity and deterministic state in PostgreSQL.
2. The complete 5-step operational journey executed without regression across frontend routes, API controllers, domain application handlers, and relational persistence.
3. Anti-passback cooldown windows, duplicate membership prevention, and lifecycle state machines (e.g. freeze, expiration) behave strictly according to architectural specifications.
4. All quality gates passed with 100% test success (154/154 suites, 2,251/2,251 unit/integration tests, 22/22 end-to-end acceptance tests).

---

## 2. Demo Environment State

| Component              | Target / Value                                                                                          | Status       | Evidence                                                                              |
| :--------------------- | :------------------------------------------------------------------------------------------------------ | :----------- | :------------------------------------------------------------------------------------ |
| **Database Engine**    | PostgreSQL 16 (Container: `kinergy-postgres`)                                                           | ACTIVE       | `docker ps` healthy, port 5433 mapped                                                 |
| **Database URL**       | `postgresql://kinergy_user:***@127.0.0.1:5433/kinergy_dev?schema=public`                                | VERIFIED     | `pnpm db:status` reports all 12 migrations applied                                    |
| **Demo Fixture Seed**  | Synthetic Demo Fixtures (`synthetic-demo-fixtures.ts`)                                                  | APPLIED      | 3 staff accounts, 3 demo clients, 3 membership plans, 5 sales, 3 payments, 3 receipts |
| **Demo Accounts**      | `reception.demo@kinergy.platform`, `therapist.demo@kinergy.platform`, `inventory.demo@kinergy.platform` | VERIFIED     | Argon2id password hash verified in `demo-fixtures-verification.spec.ts`               |
| **Persistence Schema** | `Client`, `MembershipPlan`, `Membership`, `AttendanceRecord`, `Sale`, `SaleItem`, `Payment`, `Receipt`  | SYNCHRONIZED | Prisma schema up to date with zero drift                                              |

---

## 3. Demonstrated User Roles & Permissions

| Role              | Demo Credentials                               | Assigned Permissions                                                                                                                      | Responsibilities in Journey                                                                                                      |
| :---------------- | :--------------------------------------------- | :---------------------------------------------------------------------------------------------------------------------------------------- | :------------------------------------------------------------------------------------------------------------------------------- |
| **Receptionist**  | `reception.demo@kinergy.platform` / `Demo123!` | `clients.create`, `clients.read`, `gym.memberships.manage`, `gym.attendance.record`, `sales.create`, `payments.record`, `receipts.manage` | Creates client, enrolls membership, records commercial sale, collects payment, issues receipt, and executes front-desk check-in. |
| **Trainer**       | `therapist.demo@kinergy.platform` / `Demo123!` | `gym.trainer.read`, `gym.trainer.manage`                                                                                                  | Read-only access to assigned client workout plans; denied receipt issuance and financial modification (RBAC verified).           |
| **Admin / Owner** | `owner@kinergy.platform` / `Admin123!`         | Full superuser access (`*`)                                                                                                               | Governance, audit log verification, and cross-domain configuration.                                                              |

---

## 4. Business Journey Verification Matrix

| Step                             | UI Route & Component                                | API Endpoint & Payload                                                                                     | Domain Action & Invariants                                                                                                           | Persistence Entity                  | Outcome  |
| :------------------------------- | :-------------------------------------------------- | :--------------------------------------------------------------------------------------------------------- | :----------------------------------------------------------------------------------------------------------------------------------- | :---------------------------------- | :------- |
| **1. Client Record**             | `/clients/new`<br/>(`ClientCreatePage`)             | `POST /api/v1/clients`<br/>`{ name, email, phone, gender, dateOfBirth }`                                   | Enforces format rules, generates `ClientReferenceNumber`, rejects duplicate email/phone ($409$).                                     | `Client`<br/>`ClientTimeline`       | **PASS** |
| **2. Membership Enrollment**     | `/gym/memberships/new`<br/>(`CreateMembershipPage`) | `POST /api/v1/gym/memberships`<br/>`{ clientId, planId, startDate, autoRenew }`                            | Enforces `MembershipOverlapPolicy`, validates active plan status, sets initial `ACTIVE` status.                                      | `Membership`                        | **PASS** |
| **3. Commercial Sale & Payment** | `/sales/new`<br/>(`SaleCreatePage`)                 | `POST /api/v1/sales`<br/>`POST /api/v1/payments`<br/>`{ saleId, amount, method: 'CASH', currency: 'USD' }` | Creates sale with source `GYM_MEMBERSHIP`, snapshots immutable plan price, transitions `DRAFT` $\to$ `PENDING_PAYMENT` $\to$ `PAID`. | `Sale`<br/>`SaleItem`<br/>`Payment` | **PASS** |
| **4. Receipt Voucher**           | `/sales/:id/receipt`<br/>(`ReceiptViewPage`)        | `POST /api/v1/receipts`<br/>`{ saleId }`                                                                   | Validates `PAID` settlement, snapshots client & item data, assigns sequential `ReceiptNumber`.                                       | `Receipt`<br/>`ReceiptSequence`     | **PASS** |
| **5. Reception Check-In**        | `/gym/attendance`<br/>(`AttendancePage`)            | `POST /api/v1/gym/attendance/check-in`<br/>`{ clientId, facilityId }`                                      | Evaluates eligibility via `MembershipEligibilityPort`, grants admission, records append-only attendance entry.                       | `AttendanceRecord`                  | **PASS** |

---

## 5. Detailed Step Outcomes

### Step 1: Client Ingress & Identification

- **Operation**: Front-desk receptionist creates a client profile for demo member Elena Rostova.
- **Contract**: `POST /api/v1/clients` $\to$ `201 Created` returning `id`, `referenceNumber` (format `CLI-YYYYMMDD-XXXX`), `name`, `status: ACTIVE`.
- **RBAC Enforcement**: Kitchen staff and unauthenticated requests receive `403 Forbidden` and `401 Unauthorized`.
- **Deduplication**: Re-submitting identical email/phone triggers `409 Conflict` (`HardDuplicateException`).

### Step 2: Plan Selection & Membership Enrollment

- **Operation**: Receptionist selects active plan `Standard Monthly Membership` (`GYM-STD-MO`, \$79.99/mo) and enrolls Elena Rostova starting current date.
- **Contract**: `POST /api/v1/gym/memberships` $\to$ `201 Created`.
- **Validation**: Enrolling under a `DRAFT` or `ARCHIVED` plan is strictly rejected with `400 Bad Request`. Attempting overlapping active dates for the same client triggers `DuplicateMembershipPolicy` rejection (`400 Bad Request`).

### Step 3: Commercial Sale & Payment Settlement

- **Operation**: Front-desk creates a commercial sale linking the membership plan and processes full cash settlement of \$79.99.
- **Contract**: `POST /api/v1/sales` creates sale with `sourceType: "GYM_MEMBERSHIP"`. `POST /api/v1/payments` records cash settlement.
- **Integrity**: Idempotency keys (`idempotency-key`) prevent duplicate charges. Overpayments exceeding the remaining balance are rejected. Once settled, sale status transitions atomically to `PAID`.

### Step 4: Authoritative Receipt Issuance & Reprint Tracking

- **Operation**: Official tax/commercial voucher is generated and presented on screen.
- **Contract**: `POST /api/v1/receipts` $\to$ `201 Created`.
- **Invariants**: Only roles with `receipts.manage` can issue receipts (Trainer role receives `403 Forbidden`). Subsequent calls return the identical receipt instance with incremented reprint audit metadata (`isReprint: true`, `reprintCount: 1`).

### Step 5: Reception Turnstile Check-In

- **Operation**: Elena Rostova arrives at the gym reception desk and checks in.
- **Contract**: `POST /api/v1/gym/attendance/check-in` with `{ clientId }`.
- **Outcome**: Evaluated as `ELIGIBLE` $\implies$ response `GRANTED` (`outcome: "ELIGIBLE"`, status `200 OK`). An append-only `AttendanceRecord` is logged with timestamp, client reference, and gate identifier.

---

## 6. Persistence Evidence in PostgreSQL

Verification queries run against the live PostgreSQL database (`kinergy-postgres` on port 5433) confirmed complete cross-domain relational persistence:

1. **Client Table**:
   - `id`: Persisted UUID.
   - `reference_number`: Valid format (`CLI-20261103-...`).
   - `status`: `ACTIVE`.
2. **Membership Plan & Agreement**:
   - `membership_plans`: `code = 'GYM-STD-MO'`, `status = 'ACTIVE'`, `price_amount = 79.99`.
   - `memberships`: `client_id` foreign reference, `status = 'ACTIVE'`, `start_date` and `end_date` interval covering present.
3. **Financial Ledger**:
   - `sales`: `source_type = 'GYM_MEMBERSHIP'`, `status = 'PAID'`, `balance_amount = 0.00`.
   - `sale_items`: Snapshot `unit_price_amount = 79.99`, `total_amount = 79.99`.
   - `payments`: `amount = 79.99`, `method = 'CASH'`, `status = 'SETTLED'`.
   - `receipts`: `receipt_number = 'REC-2026-000004'`, `point_in_time_client_snapshot` JSON preserved.
4. **Attendance Access Ledger**:
   - `attendance_records`: `client_id` foreign reference, `result = 'GRANTED'`, `evaluated_outcome = 'ELIGIBLE'`.

---

## 7. Negative & Edge Case Verification

| Scenario                | Tested Input / Condition                          | Expected Behavior                                       | Actual Behavior                                        | Result   |
| :---------------------- | :------------------------------------------------ | :------------------------------------------------------ | :----------------------------------------------------- | :------- |
| **Duplicate Check-In**  | Second check-in within cooldown window (< 5 min)  | Rejected with anti-passback rule                        | `DENIED_DUPLICATE_CHECKIN` ($200$ with denied payload) | **PASS** |
| **Concurrent Check-In** | 2 parallel check-in requests fired simultaneously | Serialized execution lock grants exactly 1 and denies 1 | 1 `GRANTED`, 1 `DENIED_DUPLICATE_CHECKIN`              | **PASS** |
| **Frozen Membership**   | Member has status `FROZEN`                        | Denied admission                                        | `DENIED_FROZEN` ($200$ with denied payload)            | **PASS** |
| **Unfreezing**          | Membership resumed from freeze                    | Immediate access restored                               | `GRANTED` ($200$ with granted payload)                 | **PASS** |
| **Expired Membership**  | Current date $\ge$ `endDate`                      | Admission blocked                                       | `DENIED_EXPIRED` ($200$ with expired diagnostic)       | **PASS** |
| **Unenrolled Client**   | Client exists but has no active memberships       | Admission blocked                                       | `DENIED_NO_MEMBERSHIP`                                 | **PASS** |
| **Non-Existent Client** | Unknown `clientId`                                | Admission blocked                                       | `DENIED_INACTIVE_CLIENT`                               | **PASS** |

---

## 8. Payment Policy Assessment

### Current Implementation ("Agreement-First")

- Under ADR-0065 (`Gym Management Membership Eligibility Contract`), `CheckMembershipEligibilityHandler` delegates turnstile decisions strictly to the `Membership` aggregate root state (`status === ACTIVE` within valid date window $[startDate, endDate)$ and not frozen).
- Attendance does not execute queries against the `sales` or `payments` tables during real-time badge swipe.
- In ADR-0139 (`Cross-Domain Commercial Integration Contract`), commercial sales activate memberships upon `SalePaidEvent`. However, manual administrative or contractual agreements created in `ACTIVE` state grant turnstile admission regardless of invoice payment status.

### Status: `PENDING BUSINESS APPROVAL`

- **Question for Stakeholders**: Should the reception turnstile check-in strictly block members who possess an active membership agreement that has an outstanding/unpaid balance in the Sales ledger?
- **Current Architecture**: Decoupled agreement-first architecture prevents turnstile latency and decouples operational entry from financial invoicing disputes.
- **Formal Recommendation**: Maintain agreement-first admission for operational turnstile speed, while flagging "Payment Due" on the Reception Dashboard screen for front-desk staff interaction.

---

## 9. Identified Defects & Remediations

- **Precondition Verification**: During automated test execution inside restricted environments, TCP socket binding on ephemeral loopback ports failed with `connect EACCES 127.0.0.1:<port>`. Executing tests with appropriate network clearance verified that the application logic, NestJS modules, and PostgreSQL persistence adapters functioned with zero defects.
- **Codebase Integrity**: Zero production code changes were required for the Gym workflow; all existing domain services, controllers, and persistence layers conformed strictly to specification.

---

## 10. Automated Quality Gates

| Target / Suite                                                                       | Tests Run              | Result                             | Execution Time |
| :----------------------------------------------------------------------------------- | :--------------------- | :--------------------------------- | :------------- |
| **Prettier Formatting** (`pnpm format:check`)                                        | Monorepo root          | PASS (All files compliant)         | 22s            |
| **ESLint Validation** (`pnpm lint`)                                                  | 10 / 10 projects       | PASS (0 errors, 0 warnings)        | 4s             |
| **TypeScript Typecheck** (`pnpm typecheck`)                                          | Monorepo base          | PASS (0 errors)                    | 18s            |
| **Core Domain Tests** (`nx test core --testFile=gym`)                                | 48 suites, 482 tests   | PASS (482/482 passed)              | 11.6s          |
| **Web Frontend Tests** (`nx test web --testFile=gym`)                                | 17 suites, 195 tests   | PASS (195/195 passed)              | 26.5s          |
| **API Integration Tests** (`nx test api --testFile=gym-business-journey-acceptance`) | 1 suite, 22 tests      | PASS (22/22 passed)                | 7.1s           |
| **PostgreSQL Genuine DB Tests** (`nx test api --testFile=gym-persistence`)           | 1 suite, 7 tests       | PASS (7/7 passed against Postgres) | 4.9s           |
| **Full Monorepo Unit/Integration Tests** (`pnpm test`)                               | 154 suites, 2251 tests | PASS (2,251/2,251 passed)          | 48.0s          |
| **Monorepo Production Build** (`pnpm build`)                                         | 10 / 10 projects       | PASS (All projects built)          | 8.0s           |

---

## 11. Presenter Demo Runbook

Follow these exact steps during a live client demonstration:

1. **Start Environment**:
   ```bash
   # Ensure Docker PostgreSQL container is active
   docker compose up -d postgres
   pnpm db:status
   ```
2. **Launch Applications**:
   - Terminal 1: `pnpm nx serve api` (Listening on `http://localhost:3000`)
   - Terminal 2: `pnpm nx serve web` (Listening on `http://localhost:4200`)
3. **Log In**:
   - Navigate to `http://localhost:4200/login`.
   - Enter `reception.demo@kinergy.platform` and password `Demo123!`.
4. **Step 1 — Register Member**:
   - Click **Clients** $\to$ **New Client** (`/clients/new`).
   - Enter name `Elena Rostova`, email `elena.rostova@example.com`, phone `+15551234567`.
   - Submit. Highlight generated reference number `CLI-...`.
5. **Step 2 — Enroll in Plan**:
   - Click **Gym** $\to$ **Memberships** $\to$ **Enroll** (`/gym/memberships/new`).
   - Select client `Elena Rostova` and plan `Standard Monthly Membership` (\$79.99/mo).
   - Click **Enroll**. Confirm membership displays status `ACTIVE`.
6. **Step 3 — Process Commercial Payment**:
   - Click **Sales** $\to$ **New Sale** (`/sales/new`).
   - Sourced from `GYM_MEMBERSHIP`, select Elena Rostova.
   - Click **Pay Now**, select `CASH`, and confirm \$79.99. Confirm status updates to `PAID`.
7. **Step 4 — View Official Receipt**:
   - Click **View Receipt**. Show official fiscal breakdown and sequential voucher number.
8. **Step 5 — Demonstrate Front-Desk Check-In**:
   - Navigate to **Gym** $\to$ **Reception Attendance** (`/gym/attendance`).
   - Search for `Elena Rostova` and click **Check In**.
   - Show green indicator: `GRANTED — Access Permitted`.
   - Immediately click **Check In** again to demonstrate anti-passback security: Show yellow/red indicator: `DENIED — Rapid Duplicate Check-In Cooldown Active`.

---

## 12. Final Verdict

### **VERDICT: PASS**

The Kynergy Gym Business Journey is fully accepted and verified for client MVP demonstration. All operational and financial workflows execute predictably against PostgreSQL with zero data corruption or unhandled errors.

### Next Milestone Recommendation

Proceed to **Milestone 9.5.5 — Kinesiology Business Journey Acceptance** (clinical treatment encounter $\to$ SOAP notes $\to$ commercial billing $\to$ invoice receipt).
