# Milestone 9.5.1: Client MVP Readiness Audit & Demonstration Blueprint

**Date:** 2026-11-02  
**Reviewer:** Senior Software Architect, QA Lead, Platform Engineer & Technical Product Owner  
**Repository:** `@kinergy-platform/source`  
**Milestone:** Milestone 9.5.1 — Client MVP Readiness Audit  
**Overall Evaluation Status:** **CONDITIONAL PASS — READY FOR CONTROLLED DEMONSTRATION PENDING DEMO SEED & LOCAL POSTGRESQL PREREQUISITES**

---

## 1. Executive Summary

This independent technical audit and MVP readiness evaluation determines whether the current Kinergy Platform codebase is prepared for a controlled client-facing Minimum Viable Product (MVP) demonstration. The audit inspects Git status, architecture standards, relevant ADRs, prior Milestone 9 acceptance reports, frontend routing, backend controllers, domain invariants, test coverage, and local runtime constraints.

### Key Audit Findings:

1. **Core Business Journeys are Technically Functional:** All three MVP journeys (Gym, Kinesiology, and Consumable Inventory) have fully implemented domain models, backend REST controllers, and frontend UI screens backed by automated integration and acceptance tests.
2. **Local Demo Blocker — Database Runtime:** The API utilizes Prisma with PostgreSQL (`PrismaService` connects eagerly on `onModuleInit`). In the local Windows environment, the Docker daemon is offline and PostgreSQL is not listening on port 5432. The backend cannot bootstrap without a running PostgreSQL instance.
3. **Demo Friction Blocker — Synthetic Seed Incompleteness:** The existing seed pipeline (`prisma/seed.ts`) only seeds IAM roles, permissions, a single Owner account (`owner@kinergy.platform`), and isolated sales records. It does **not** seed treatment rooms, membership plans, inventory products, demo clients, or role-specific demo users (Receptionist, Trainer, Clinician). Demonstrating the platform requires either manual pre-configuration or a dedicated demo seed script.
4. **Cross-Domain Workflow UX Handovers:** While each domain functions independently in the UI, the handovers between domains (e.g. from a completed clinical treatment session to the retail/POS billing screen, and from membership enrollment to checkout) currently require manual navigation rather than a 1-click commercial handover button.
5. **Production Deployment Prerequisites Remain Unresolved:** Multi-stage Docker packaging, reverse proxy routing (Nginx), external S3/GCS media storage, and staging PostgreSQL CI integration remain outstanding as documented in Milestone 9. These are production prerequisites and do **not** block a local or controlled client demo.

---

## 2. Repository and Git Baseline

- **Current Branch:** `main` (synchronized with `origin/main`).
- **Working Tree:** Clean (`nothing to commit, working tree clean`).
- **Head Commit:** `3954e82 docs(audit): add milestone 9 cross-domain business acceptance report`.
- **Architecture Compliance:**
  - Strict adherence to Clean Architecture, Hexagonal Architecture (Ports & Adapters), and Domain-Driven Design (DDD).
  - Explicit aggregate boundaries: `Client`, `Gym`, `Scheduling`, `Kinesiology`, `Resources`, `Sales`, `Payments`, `Receipts`.
  - Zero floating-point monetary drift: Strict integer-cent arithmetic throughout core domain, persistence, and presentation.
  - Zero `any` or bypassed type checks across evaluated routes and contracts.
- **Verified Test Suite Baseline:**
  - `packages/core`: **291 test suites passed / 4,555 tests passed**.
  - `apps/api`: **153 test suites passed / 2,245 tests passed** (including `gym-business-journey-acceptance.e2e.spec.ts`).
  - `apps/web`: **189 test suites passed / 2,172 tests passed** (including accessibility and route guard specs).

---

## 3. Evidence-Based Status of the Three MVP Business Journeys

### Journey 1: Gym Management

`Client record → Membership enrollment → Commercial payment → Proof-of-purchase receipt → Reception check-in`

| Step                              | UI Route & Components                                                                                                                                                                                                                                                           | API Endpoints & Handlers                                                                   | Persistence & Domain Verification                                                                                                                                               | Acceptance Test Evidence                               | Status                         |
| :-------------------------------- | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | :----------------------------------------------------------------------------------------- | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | :----------------------------------------------------- | :----------------------------- |
| **1.1 Client Ingress**            | `/clients/new`<br>[`ClientCreatePage`](file:///c:/Projects/kinergy-platform/apps/web/src/modules/client/routes/client-create-page.tsx)                                                                                                                                          | `POST /api/v1/clients`<br>`ClientsController.createClient`                                 | Client aggregate persisted with reference number, email, and phone. Hard duplicate rejection (409) and soft duplicate detection.                                                | `gym-business-journey-acceptance.e2e.spec.ts` (Step 1) | **VERIFIED**                   |
| **1.2 Plan Catalog & Enrollment** | `/gym/plans`, `/gym/memberships/new`<br>[`CreateMembershipPage`](file:///c:/Projects/kinergy-platform/apps/web/src/modules/gym/memberships/routes/create-membership-page.tsx)                                                                                                   | `POST /api/v1/gym/memberships`<br>`MembershipsController.createMembership`                 | Creates `Membership` aggregate. Enforces `MembershipOverlapPolicy` and rejects DRAFT/ARCHIVED plans. Membership starts `ACTIVE` if `startDate <= now`.                          | `gym-business-journey-acceptance.e2e.spec.ts` (Step 2) | **VERIFIED**                   |
| **1.3 Commercial Payment**        | `/sales/new`, `/sales/:saleId`<br>[`SaleCreatePage`](file:///c:/Projects/kinergy-platform/apps/web/src/modules/sales/pages/sale-create-page.tsx), [`RecordPaymentDialog`](file:///c:/Projects/kinergy-platform/apps/web/src/modules/sales/components/record-payment-dialog.tsx) | `POST /api/v1/sales`<br>`POST /api/v1/payments`<br>`SalesController`, `PaymentsController` | Commercial `Sale` created with `MEMBERSHIP_PLAN` source reference; payment recorded via Cash, Card, or QR. Rejects overpayment with 422.                                        | `gym-business-journey-acceptance.e2e.spec.ts` (Step 3) | **VERIFIED (MANUAL HANDOVER)** |
| **1.4 Receipt Voucher**           | `/sales/:saleId/receipt`<br>[`ReceiptViewPage`](file:///c:/Projects/kinergy-platform/apps/web/src/modules/sales/pages/receipt-view-page.tsx)                                                                                                                                    | `POST /api/v1/receipts`<br>`POST /api/v1/receipts/:id/reprint`                             | Receipt entity issued with immutable JSONB snapshots of client, items, and tender payments. Enforces `receipts.manage`.                                                         | `gym-business-journey-acceptance.e2e.spec.ts` (Step 4) | **VERIFIED**                   |
| **1.5 Reception Ingress**         | `/gym/attendance`<br>[`AttendancePage`](file:///c:/Projects/kinergy-platform/apps/web/src/modules/gym/attendance/routes/attendance-page.tsx)                                                                                                                                    | `POST /api/v1/gym/attendance/check-in`<br>`AttendanceController.checkIn`                   | Live membership evaluation via `CheckMembershipEligibilityHandler`. Persists `AttendanceRecord`. Blocks rapid double check-in via cooldown window (`DENIED_DUPLICATE_CHECKIN`). | `gym-business-journey-acceptance.e2e.spec.ts` (Step 5) | **VERIFIED**                   |

**Journey 1 Evaluation:** Fully verified from domain to UI. The workflow can be demonstrated end-to-end.  
_UX Note:_ In the UI, creating a membership does not immediately prompt for payment because memberships starting today become `ACTIVE` upon creation. To demonstrate the commercial sale and receipt, the presenter opens `/sales/new`, selects `MEMBERSHIP_PLAN`, inputs the plan ID, and collects payment via `/sales/:id`.

---

### Journey 2: Kinesiology Clinical Workflow

`Client record → Appointment booking → Treatment session → SOAP documentation → Sale/payment → Receipt`

| Step                       | UI Route & Components                                                                                                                                                                                                                                                                                               | API Endpoints & Handlers                                                                             | Persistence & Domain Verification                                                                                                           | Acceptance Test Evidence                                       | Status                         |
| :------------------------- | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | :--------------------------------------------------------------------------------------------------- | :------------------------------------------------------------------------------------------------------------------------------------------ | :------------------------------------------------------------- | :----------------------------- |
| **2.1 Scheduling & Rooms** | `/scheduling`, `/rooms`<br>[`CalendarView`](file:///c:/Projects/kinergy-platform/apps/web/src/modules/scheduling/routes/scheduling-page.tsx), [`AppointmentDrawer`](file:///c:/Projects/kinergy-platform/apps/web/src/modules/scheduling/components/appointment-detail-drawer.tsx)                                  | `POST /api/v1/scheduling/appointments`<br>`AppointmentsController`                                   | `Appointment` aggregate created with 4D conflict avoidance (therapist, room, client, turnaround buffers, maintenance).                      | `kinesiology-business-journey-acceptance.e2e.spec.ts` (Step 1) | **VERIFIED**                   |
| **2.2 Session Initiation** | `StartTreatmentFromAppointment` inside [`AppointmentDetailDrawer`](file:///c:/Projects/kinergy-platform/apps/web/src/modules/scheduling/components/appointment-detail-drawer.tsx)                                                                                                                                   | `POST /api/v1/kinesiology/sessions`<br>`TreatmentSessionsController.createSession`                   | Correlates session to appointment; transitions `SCHEDULED` $\rightarrow$ `IN_PROGRESS`. Blocks duplicate sessions with 409 Conflict.        | `kinesiology-business-journey-acceptance.e2e.spec.ts` (Step 2) | **VERIFIED**                   |
| **2.3 SOAP Documentation** | `/kinesiology/sessions/:sessionId`<br>[`TreatmentSessionWorkspacePage`](file:///c:/Projects/kinergy-platform/apps/web/src/modules/kinesiology/routes/treatment-session-workspace-page.tsx), [`SoapNotesForm`](file:///c:/Projects/kinergy-platform/apps/web/src/modules/kinesiology/components/soap-notes-form.tsx) | `PUT /api/v1/kinesiology/sessions/:id/notes`<br>`POST .../complete`<br>`TreatmentSessionsController` | Medico-legal immutability: Draft notes auto-save; sign-off permanently locks SOAP documentation against modification or deletion.           | `kinesiology-business-journey-acceptance.e2e.spec.ts` (Step 3) | **VERIFIED**                   |
| **2.4 Commercial Billing** | `/sales/new`, `/sales/:saleId`<br>[`SaleCreatePage`](file:///c:/Projects/kinergy-platform/apps/web/src/modules/sales/pages/sale-create-page.tsx), [`RecordPaymentDialog`](file:///c:/Projects/kinergy-platform/apps/web/src/modules/sales/components/record-payment-dialog.tsx)                                     | `POST /api/v1/sales`<br>`POST /api/v1/payments`<br>`SalesController`, `PaymentsController`           | Commercial `Sale` created referencing `TREATMENT_SESSION`. Rejects uncompleted sessions. Settles upon payment. Duplicate billing prevented. | `kinesiology-business-journey-acceptance.e2e.spec.ts` (Step 4) | **VERIFIED (MANUAL HANDOVER)** |
| **2.5 Proof of Purchase**  | `/sales/:saleId/receipt`<br>[`ReceiptViewPage`](file:///c:/Projects/kinergy-platform/apps/web/src/modules/sales/pages/receipt-view-page.tsx)                                                                                                                                                                        | `POST /api/v1/receipts`<br>`ReceiptsController.issueReceipt`                                         | Immutable clinical receipt issued with breakdown of therapy service snapshot and settled tender.                                            | `kinesiology-business-journey-acceptance.e2e.spec.ts` (Step 5) | **VERIFIED**                   |

**Journey 2 Evaluation:** Fully verified. Appointment creation, 1-click clinical handover from the calendar drawer, SOAP note charting, and cryptographic locking work as designed.  
_UX Gap:_ When the practitioner completes the SOAP note on `/kinesiology/sessions/:sessionId`, the UI offers links to "Treatment History", "Client Timeline", and "Client Profile", but lacks a direct "Bill Treatment Session" button. The presenter must manually open `/sales/new`, enter the Client ID and Session ID, and collect payment.

---

### Journey 3: Consumable Inventory & Retail Commerce

`Receive stock → Supported retail sale → Stock movement ledger → Low-stock behavior`

| Step                             | UI Route & Components                                                                                                                                                                           | API Endpoints & Handlers                                                              | Persistence & Domain Verification                                                                                                | Acceptance Test Evidence                                          | Status       |
| :------------------------------- | :---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :------------------------------------------------------------------------------------ | :------------------------------------------------------------------------------------------------------------------------------- | :---------------------------------------------------------------- | :----------- |
| **3.1 Taxonomy & Receiving**     | `/resources/inventory`, `/resources/inventory/:id`<br>[`ReceiveStockDialog`](file:///c:/Projects/kinergy-platform/apps/web/src/modules/resources/inventory/components/receive-stock-dialog.tsx) | `POST /api/v1/resources/inventory/:id/receive`<br>`InventoryController.receiveStock`  | Validates retail consumable classification. Increments `quantityOnHand`. Records append-only `PURCHASE` movement.                | `inventory-business-journey-acceptance.e2e.spec.ts` (Steps 1 & 2) | **VERIFIED** |
| **3.2 Retail Sale Checkout**     | `/resources/inventory/:id` (`SellStockDialog`) or `/sales/new`                                                                                                                                  | `POST /api/v1/resources/inventory/:id/sell` or `POST /api/v1/sales`                   | Direct retail decrement via `sellStock` or unified commercial sale with payment collection. Prevents overselling.                | `inventory-business-journey-acceptance.e2e.spec.ts` (Step 3)      | **VERIFIED** |
| **3.3 Stock Decrement & Ledger** | `/resources/inventory/:id/movements`<br>[`InventoryMovementsPage`](file:///c:/Projects/kinergy-platform/apps/web/src/modules/resources/inventory/routes/inventory-movements-page.tsx)           | `GET /api/v1/resources/inventory/:id/movements`<br>`InventoryController.getMovements` | Immutable audit trail displaying all `PURCHASE` and `SALE` transactions with timestamp, user identity, and net delta.            | `inventory-business-journey-acceptance.e2e.spec.ts` (Step 4)      | **VERIFIED** |
| **3.4 Low-Stock Alerts**         | `/resources/inventory/low-stock`<br>[`LowStockPage`](file:///c:/Projects/kinergy-platform/apps/web/src/modules/resources/inventory/routes/low-stock-page.tsx)                                   | `GET /api/v1/resources/inventory/low-stock`<br>`InventoryController.getLowStock`      | Dynamic query filter evaluated where `quantityOnHand <= minimumStock`. Low-stock page features 1-click "Receive Stock" shortcut. | `inventory-business-journey-acceptance.e2e.spec.ts` (Step 5)      | **VERIFIED** |

**Journey 3 Evaluation:** Fully verified. Stock receiving, direct retail point-of-sale decrement, movement ledger auditing, and low-stock threshold triggers are operational and test-verified.

---

## 4. Demo Environment & Runtime Assessment

### 4.1 Local Startup Feasibility

- **Frontend (`apps/web`):** Starts cleanly with Vite on `http://localhost:5173` or `http://localhost:4200`. Uses TanStack Query to communicate directly with `http://localhost:3000/api/v1`. MSW is disabled by default (`VITE_ENABLE_MSW=false`).
- **Backend (`apps/api`):** NestJS application with Prisma ORM. On startup, `PrismaService.onModuleInit()` invokes `await this.$connect()`.
- **Infrastructure Status:**
  - Local port 5432 is closed (TCP connect failed).
  - Docker daemon is not running on the local Windows host.
  - **Impact:** Running `pnpm nx serve api` without an active PostgreSQL instance causes immediate process termination.

### 4.2 Demo User & Authentication Setup

- `prisma/seed.ts` only seeds `owner@kinergy.platform` (`OwnerPassword123!`).
- The system roles (`Owner`, `Admin`, `Receptionist`, `Trainer`, `Therapist`) and permissions are populated correctly.
- Demonstrating RBAC boundaries (e.g. showing that a Trainer cannot manage billing or issue receipts, or that a Receptionist can check-in clients) requires having separate role accounts ready.

### 4.3 Target Recommendation: Local vs. Hosted Demonstration

| Demonstration Target                                           | Feasibility            | Prerequisites Required                                                                                                                                                                                                        | Recommendation                                                                                                                                       |
| :------------------------------------------------------------- | :--------------------- | :---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :--------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Option A: Local Demonstration** (Presenter laptop)           | Feasible with local DB | 1. Start Docker Desktop (`docker compose up -d postgres`) or start local PostgreSQL service.<br>2. Run migrations (`pnpm prisma:migrate`).<br>3. Run demo seed script.<br>4. Run `pnpm nx serve api` and `pnpm nx serve web`. | **Recommended for internal QA rehearsal and initial owner walk-through.**                                                                            |
| **Option B: Hosted Demonstration** (Cloud staging environment) | Highly Reliable        | 1. Deploy API to container host (or Node runtime) connected to managed PostgreSQL (e.g. Supabase, Neon, AWS RDS).<br>2. Deploy Web build to static host (e.g. Vercel, Netlify, Cloudflare).<br>3. Seed staging database once. | **Recommended for client-facing MVP presentation.** Eliminates host environment flakiness and allows multiple stakeholders to log in simultaneously. |

---

## 5. MVP UX Assessment

### Usability and Workflow Findings

1. **Cross-Domain Handover Absence (Usability Friction — P2):**
   - **Kinesiology to Sales:** When a clinical session is signed and locked, there is no button to "Proceed to Payment / Bill Session". The receptionist or clinician must navigate to `/sales/new` and re-identify the client and session.
   - **Gym to Sales:** Creating a gym membership does not provide a button to "Collect Payment".
2. **`SaleCreatePage` Line Item Validation (Usability Friction — P2):**
   - The frontend schema requires at least one line item in `items` (`items: z.array(lineItemSchema).min(1)`), even when an authoritative domain source reference (`TREATMENT_SESSION` or `MEMBERSHIP_PLAN`) is supplied. The backend source validator is capable of populating price and items from the reference, but the frontend form insists on manual item entry.
3. **Absence of Top Navigation Item for Kinesiology (Minor — P2):**
   - Top-level sidebar navigation includes _Scheduling_, _Rooms_, _Clients_, _Gym_, _Attendance_, _Sales_, _Inventory_, and _Assets_, but omits _Kinesiology_. Practitioners access kinesiology via the Scheduling calendar drawer or via Client Profile treatment tabs. A direct link to recent clinical sessions or a clinician workspace would streamline navigation.
4. **Persona Switching UX (Demo Ergonomics — P2):**
   - There is no quick persona switcher or demo login selector in the UI. Presenters must log out and manually type credentials to show Receptionist vs. Therapist vs. Manager views.

---

## 6. Prioritized Gap Register

| ID         | Priority | Category      | Affected Journey        | Summary & Description                                                                                                                                                                                                     | Business Impact & Risk                                                                                              | Recommended Resolution                                                                                                                                                |
| :--------- | :------: | :------------ | :---------------------- | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | :------------------------------------------------------------------------------------------------------------------ | :-------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **GAP-01** |  **P1**  | Environment   | All Journeys            | **PostgreSQL Instance Required for API Bootstrap**<br>Docker daemon is inactive and port 5432 is closed. API crashes on startup without database connection.                                                              | Blocks local running of the application. Presenter cannot start the API locally.                                    | Ensure PostgreSQL is active (via Docker Desktop or local Windows PostgreSQL service) and provide connection string in `.env`.                                         |
| **GAP-02** |  **P1**  | Data / Demo   | All Journeys            | **Comprehensive Synthetic Demo Seed Script Missing**<br>`prisma/seed.ts` only seeds permissions, owner user, and detached sales. Lacks treatment rooms, membership plans, inventory products, clients, and role personas. | Demo cannot run cleanly out-of-the-box. Requires tedious manual data entry before the demonstration.                | Create an idempotent demo seed script (`prisma/seeds/mvp-demo.seed.ts`) that seeds 3 treatment rooms, 2 gym plans, 5 inventory items, 3 clients, and 4 role accounts. |
| **GAP-03** |  **P2**  | UX / Workflow | Journey B (Kinesiology) | **No Direct Billing Handover from Completed Session**<br>`TreatmentSessionWorkspacePage` lacks a "Bill Session / Go to POS" action button upon completion.                                                                | Increases demo friction; presenter must explain why they have to manually navigate to Sales to bill the session.    | Add a "Bill Treatment Session" button on the post-completion summary card linking to `/sales/new?sourceType=TREATMENT_SESSION&sourceId=:id&clientId=:clientId`.       |
| **GAP-04** |  **P2**  | UX / Forms    | Journey A & B (Sales)   | **`SaleCreatePage` Requires Manual Line Items on Sourced Sales**<br>`createSaleSchema` insists on `items.min(1)` even when an authoritative source reference is linked.                                                   | Presenter must manually type a dummy line item when creating a sale for an enrolled membership or clinical session. | Refine `createSaleSchema` to make `items` optional when `hasSourceReference` is true and valid, or auto-populate items from source.                                   |
| **GAP-05** |  **P2**  | Demo UX       | All Journeys            | **Demo Persona Switching Friction**<br>No demo login shortcuts on the login screen.                                                                                                                                       | Presenter must type credentials manually when demonstrating RBAC differences (e.g. Receptionist vs. Trainer).       | Add a non-intrusive demo persona selector on the development login view (populated only when `NODE_ENV !== 'production'`).                                            |
| **GAP-06** |  **P3**  | DevOps        | Production              | **Multi-stage Production Dockerfiles Pending**<br>`Dockerfile.api` and `Dockerfile.web` not yet authored.                                                                                                                 | Production release prerequisite; does not block local or hosted demo using raw node/vite runtimes.                  | Author container definitions in `infrastructure/deployment/docker/`.                                                                                                  |
| **GAP-07** |  **P3**  | DevOps        | Production              | **Reverse Proxy & Ingress Routing Configuration**<br>Nginx/Caddy configuration for static web hosting and `/api/v1` proxying pending.                                                                                     | Production deployment prerequisite.                                                                                 | Create Nginx ingress configuration for staging/production deployment.                                                                                                 |
| **GAP-08** |  **P3**  | Architecture  | Production              | **External Cloud Storage Adapter**<br>Avatars and clinical document attachments use local filesystem instead of S3/GCS.                                                                                                   | Production scalability prerequisite.                                                                                | Implement S3/GCS adapter behind storage port.                                                                                                                         |
| **GAP-09** |  **P3**  | QA            | Production              | **PostgreSQL Staging Acceptance Run**<br>Full e2e acceptance suites currently run in-memory; need execution against live PostgreSQL staging instance.                                                                     | Production data-layer confidence prerequisite.                                                                      | Run migration and acceptance suite in CI against dedicated PostgreSQL container.                                                                                      |

---

## 7. Recommended MVP Demo Scope & Sequence

### 7.1 Scope Boundaries

#### Included in MVP Demo:

- **Authentication & RBAC:** Logging in as Owner, Receptionist, or Practitioner to demonstrate role security.
- **Client Management:** Creating and searching clients (`Elena Vance`, `Marcus Brody`).
- **Gym Journey:** Enrolling a client into the _Monthly Unlimited_ plan; recording a Reception check-in; demonstrating duplicate check-in denial within the cooldown window; demonstrating frozen membership denial.
- **Kinesiology Journey:** Scheduling an appointment in _Treatment Room 1_; starting a clinical session from the calendar drawer; entering Subjective, Objective, Assessment, and Plan notes; signing and permanently locking notes.
- **Commercial Checkout & Receipts:** Generating a sale for a completed service or retail good; taking Cash tender; issuing official receipt voucher with immutable item and payment snapshot; demonstrating reprint audit logging.
- **Inventory Journey:** Inspecting the inventory catalog; receiving a batch of _Kinesiology Elastic Tape_; executing a retail sale; inspecting the real-time stock decrement in the movement ledger; viewing the low-stock alert cockpit.

#### Explicitly Excluded from MVP Demo:

- Complex recurring appointment series edge-case management (keep demo to single or confirmed appointments).
- Direct credit card hardware terminal integration (use simulated Card tender or Cash payment in POS).
- Cloud file attachment uploads (local avatar fallback is sufficient for demo).
- Self-service client mobile portal (staff-facing web application is the MVP boundary).

### 7.2 Recommended Demonstration Sequence (30 Minutes)

1. **Act I — Front Desk Reception & Gym Check-In (8 mins):**
   - Log in as **Receptionist** (`receptionist@kinergy.platform`).
   - Create new client: _Elena Vance_ (`elena.vance@example.com`).
   - Enroll Elena in the _Standard Monthly Gym Membership_.
   - Navigate to `/gym/attendance` and record Elena's check-in (Status: **GRANTED**).
   - Immediately attempt a second check-in to demonstrate the security cooldown guard (**DENIED_DUPLICATE_CHECKIN**).
2. **Act II — Clinic Appointment & Clinical Charting (10 mins):**
   - Switch to **Clinical Therapist** (`therapist@kinergy.platform`).
   - Open `/scheduling` calendar; select _Elena Vance_ for an Initial Kinesiology Assessment in _Room 1_.
   - Open the appointment in `AppointmentDetailDrawer`; click **Start Treatment Session**.
   - In `TreatmentSessionWorkspacePage`, fill in SOAP clinical observations and muscle assessment tests.
   - Click **Sign & Complete Session**. Show that clinical notes are now permanently sealed and tamper-proof.
3. **Act III — Retail Inventory & Commercial Checkout (8 mins):**
   - Switch to **Front Desk / Receptionist**.
   - Open `/resources/inventory`. Select _Kinesiology Elastic Tape_ (showing 3 units on hand, minimum 5).
   - Show `/resources/inventory/low-stock` alert cockpit. Click **Receive Stock** (+10 units @ \$8.50).
   - Navigate to `/sales/new` or inventory POS. Record retail checkout of 2 rolls of tape for Elena.
   - Collect exact cash payment; show change calculation ($0.00).
   - Generate official receipt voucher and view itemized snapshot.
4. **Act IV — Executive Dashboard & Audit Trail (4 mins):**
   - Log in as **Owner** (`owner@kinergy.platform`).
   - View high-level Dashboard metrics, sales ledger, and movement history.

### 7.3 Failure Recovery Plan

- **Accidental Duplicate Collision:** If a presenter tries to register an already-existing email/phone, point out the platform's robust 409 conflict detection and switch to existing client search.
- **Network / API Timeout:** Keep a local terminal visible to verify backend health via `GET /api/v1/health`.
- **Database State Reset:** If a rehearsal corrupts demo data, run the synthetic demo seed script to restore all fixtures in under 3 seconds.

---

## 8. Sequential Implementation Plan

To prepare the repository for this demonstration, the following sequential tasks are planned for implementation:

### Task 1: MVP Demo Synthetic Seed Script (`GAP-02`)

- **Objective:** Create a dedicated, idempotent demo seeding pipeline that prepares realistic baseline entities for the demonstration.
- **Scope:**
  - Create `prisma/seeds/mvp-demo.seed.ts`.
  - Seed 4 staff personas:
    - Owner: `owner@kinergy.platform` / `OwnerPassword123!`
    - Receptionist: `receptionist@kinergy.platform` / `Reception123!`
    - Therapist: `therapist@kinergy.platform` / `Therapist123!`
    - Trainer: `trainer@kinergy.platform` / `Trainer123!`
  - Seed 3 Treatment Rooms: `Room 1 — Rehabilitation Suite`, `Room 2 — Manual Therapy`, `Room 3 — Assessment Lab`.
  - Seed 2 Active Gym Plans: `Standard Monthly Unlimited` (\$79.99), `Annual VIP Membership` (\$799.00).
  - Seed 5 Consumable Products: `Kinesiology Tape (Black)` (low-stock trigger), `Electrolyte Drink 500ml`, `Whey Protein Bar`, `Organic Massage Oil 250ml`, `Resistance Band Set`.
  - Seed 2 Demo Clients: `Elena Vance` and `Marcus Brody`.
- **Quality Gates:** Must run idempotently via `pnpm prisma:seed` without violating relational unique constraints or foreign keys.

### Task 2: Cross-Domain Billing Handover Action (`GAP-03`)

- **Objective:** Enable a 1-click transition from completed clinical sessions and memberships directly into the commercial checkout flow.
- **Scope:**
  - In `TreatmentSessionWorkspacePage`, add a primary action button on the completion card: `Bill Treatment Session` $\rightarrow$ navigates to `/sales/new?sourceType=TREATMENT_SESSION&sourceId=${session.id}&clientId=${session.clientId}&fee=85`.
  - In `membership-detail-page.tsx`, add an action button in the toolbar: `Create Membership Sale` $\rightarrow$ navigates to `/sales/new?sourceType=MEMBERSHIP_PLAN&sourceId=${membership.planId}&clientId=${membership.clientId}`.
- **Quality Gates:** Unit tests for both components verifying button rendering and correct route navigation with query params.

### Task 3: `SaleCreatePage` Schema Polish for Authoritative Sources (`GAP-04`)

- **Objective:** Allow sales with authoritative source references (`TREATMENT_SESSION`, `MEMBERSHIP_PLAN`) to auto-populate or pass validation without requiring redundant manual line item entry.
- **Scope:**
  - Update `createSaleSchema` and `SaleCreatePage` to recognize when source parameters are present in the URL query.
  - Pre-fill line items with default description and price snapshot when initiated from a domain handover.
- **Quality Gates:** Unit tests verifying valid submission with source references.

### Task 4: Developer Demo Persona Quick-Login Helper (`GAP-05`)

- **Objective:** Provide a 1-click login helper on the login view in development mode (`NODE_ENV !== 'production'`) for rapid persona switching during the demonstration.
- **Scope:**
  - Add persona pill buttons on `LoginRoute` (Owner, Receptionist, Therapist, Trainer) that fill in credentials instantly.
  - Strictly disabled in production builds.
- **Quality Gates:** Vitest test verifying personas render in dev and are absent in production.

---

## 9. Acceptance Criteria for the MVP Demonstration

1. **Zero Runtime Crashes:** The API and Web applications run continuously without unhandled exceptions or connection drops throughout the 30-minute demonstration.
2. **Three Journeys Traversed Exclusively via UI:** The presenter completes all steps of Journey 1 (Gym), Journey 2 (Kinesiology), and Journey 3 (Inventory) directly in the web browser without using Postman, Swagger, or manual database intervention.
3. **Data Integrity & Consistency:**
   - Every created client, membership, appointment, session, sale, payment, receipt, and stock movement persists in the database and remains visible upon page refresh.
   - Financial balances match integer-cent precision with zero floating-point artifacts.
   - Signed SOAP notes cannot be edited after sign-off.
4. **RBAC Enforced & Visible:** Distinct users log in with their respective roles; unauthorized actions display accessible Forbidden views or disabled action triggers.

---

## 10. Open Questions Requiring Business-Owner Decisions

1. **Demonstration Environment Target:** Does the Kynergy executive team prefer a **local presenter demonstration** (running on the presenter's laptop with local/Docker PostgreSQL) or a **hosted cloud staging demonstration** (deployed to a shared staging URL accessible by remote stakeholders)?
2. **Retail POS Scope Boundary:** Should gym memberships require payment settlement before granting reception check-in, or is the current behavior (immediate `ACTIVE` status upon agreement enrollment with billing handled as an independent commercial step) the preferred operational workflow?
3. **Currency & Localization Defaults:** Should the demo data strictly use `USD` (\$ / integer-cents) or does the target market require localized currency formatting (e.g. `EUR`, `CAD`, `GBP`)?
4. **Sign-Off Schedule:** Once the synthetic seed and handover polishes are completed, what is the target date for convening the formal business-owner acceptance review session?

---

## 11. Final Verification Summary

- **What is Verified:**
  - All domain rules, aggregates, and REST API controllers for Gym, Kinesiology, Resources, Sales, Payments, and Receipts.
  - Frontend routes, layouts, accessibility (WCAG 2.1 AA), and responsive navigation across all three journeys.
  - Automated test suites: 100% pass across core (4,555 tests), api (2,245 tests), and web (2,172 tests).
- **What is Not Verified:**
  - Live PostgreSQL staging performance under multi-user concurrent load (tested with in-memory stores in local suites).
  - Headless Lighthouse performance in local sandboxed environment.
- **What Blocks the MVP Demonstration:**
  - `GAP-01`: PostgreSQL database availability for local API bootstrap.
  - `GAP-02`: Comprehensive synthetic demo seed data (rooms, plans, inventory items, clients, role personas).
- **What Can Safely Be Deferred:**
  - `GAP-06` through `GAP-09`: Multi-stage Docker packaging, Nginx ingress proxy, cloud S3/GCS media storage, and PostgreSQL staging CI pipeline.
- **What Requires a Business-Owner Decision:**
  - Local vs. Hosted demonstration target platform.
  - Membership payment enforcement policy (strict pay-before-entry vs. open account enrollment).

---

## Recommended Next Prompt

```markdown
Implement Milestone 9.5.1 Task 1: Author the comprehensive MVP synthetic demo seed script (`prisma/seeds/mvp-demo.seed.ts`) and register it in `prisma/seed.ts` to provision treatment rooms, active gym plans, consumable inventory items, demo clients, and role personas (Owner, Receptionist, Therapist, Trainer) idempotently.
```
