# Kinergy Platform — MVP Demonstration Business Scenarios Manual

**Document ID:** `DOC-SCN-011`  
**Milestone:** 11.2 — Professional MVP Demo Documentation  
**Version:** `1.0.0`  
**Status:** **ACTIVE & VERIFIED**  
**Document Ownership:** Product Delivery Lead, QA Lead, Solution Architects  
**Last Verified Date:** 2026-11-05  
**Companion Manuals:** [MVP Demo Environment Guide](../development/mvp-demo-environment-guide.md), [Readiness Checklist](demo-readiness-checklist.md)

---

## 1. Overview & Demonstration Strategy

This document provides complete, deterministic execution scripts for the four primary business journeys demonstrated to prospective commercial stakeholders. Every scenario specifies the precise actor, necessary permissions, preconditions, UI actions, real-time visual feedback, persisted database state, and underlying automated test evidence.

---

## 2. Demonstration Persona Matrix

| Persona ID    | System Role               | Default Email                     | Password            | Granted Permissions                                                                                                                               |
| :------------ | :------------------------ | :-------------------------------- | :------------------ | :------------------------------------------------------------------------------------------------------------------------------------------------ |
| **`ACT-REC`** | Receptionist              | `reception.demo@kinergy.platform` | `DemoPass123!`      | `clients.read`, `clients.write`, `memberships.read`, `memberships.create`, `attendance.*`, `billing.*`, `sales.*`, `payments.*`, `receipts.*`     |
| **`ACT-THR`** | Trainer / Therapist       | `therapist.demo@kinergy.platform` | `DemoPass123!`      | `clients.read`, `clients.write`, `appointments.read`, `appointments.create`, `appointments.update`, `reports.read`, `sales.read`, `receipts.read` |
| **`ACT-TRN`** | Gym Movement Coach        | `trainer.demo@kinergy.platform`   | `DemoPass123!`      | `clients.read`, `attendance.read` (assigned floor coaching and attendance oversight)                                                              |
| **`ACT-INV`** | Kitchen / Inventory Staff | `inventory.demo@kinergy.platform` | `DemoPass123!`      | `kitchen.*`, `inventory.read`, `inventory.write`, `sales.read`, `sales.create`, `payments.create`, `receipts.read`                                |
| **`ACT-OWN`** | Platform Owner            | `owner@kinergy.platform`          | `OwnerPassword123!` | Superuser wildcard (`*`)                                                                                                                          |

---

## 3. Scenario 1: Gym Membership Intake, POS Billing & Turnstile Access

### 3.1 Scenario Metadata

- **Domain Focus:** Gym & Reception Operations
- **Primary Actor:** Front Desk Receptionist (`ACT-REC`)
- **Target Subject:** Carlos Rivera (`CLI-2026-00003`)
- **Key Business Invariants:** Immediate active agreement, integer cent pricing, 5-minute turnstile anti-passback cooldown.

### 3.2 Preconditions

- Database seeded via `pnpm db:seed`.
- Carlos Rivera exists in `clients` table with status `ACTIVE` and no active gym membership.
- Silver Monthly Gym Membership (`MEM-SLV-MONTH`) exists in `membership_plans` (\$60.00 / 30 days).

### 3.3 Step-by-Step Execution Script

|   Step   | User Action                       | Interface Location                     | Input Data                                                             | Expected UI Feedback                                                                                                       | Expected Persisted State                                                                                        |
| :------: | :-------------------------------- | :------------------------------------- | :--------------------------------------------------------------------- | :------------------------------------------------------------------------------------------------------------------------- | :-------------------------------------------------------------------------------------------------------------- |
| **1.1**  | Sign in as Receptionist           | `/login`                               | `reception.demo@kinergy.platform`<br>`DemoPass123!`                    | Redirects to `/dashboard`; navigation menu displays Gym, Sales, Scheduling tabs.                                           | Session cookie/token stored; User status `ACTIVE`.                                                              |
| **1.2**  | Search for Intake Client          | `/clients`                             | Search term: `Carlos`                                                  | Client table displays Carlos Rivera (`CLI-2026-00003`, `carlos.rivera@example.com`).                                       | Query executed via PostgreSQL trigram index in < 25ms.                                                          |
| **1.3**  | Open Client Profile               | `/clients/cli-seed-carlos-03`          | Click client row                                                       | Profile displays contact details and activity timeline ("Client intake profile registered...").                            | Client timeline loaded from `client_timeline_entries`.                                                          |
| **1.4**  | Enroll in Gym Plan                | `/gym/memberships/new`                 | Member: Carlos Rivera<br>Plan: Silver Monthly Gym Membership (\$60.00) | Form validates; button displays "Enroll Member". Upon submission, status badge shows `ACTIVE`.                             | Row inserted into `memberships` table (`status: ACTIVE`, `startDate: today`, `endDate: today + 30d`).           |
| **1.5**  | Generate Commercial Sale          | `/sales/new`                           | Source: `GYM_MEMBERSHIP`<br>Target: Newly created membership ID        | Item line populated: "Silver Monthly Gym Membership", Unit: \$60.00, Total: \$60.00. Order status shows `PENDING_PAYMENT`. | Row inserted into `sales` (`status: PENDING_PAYMENT`) and `sale_items` with immutable price snapshot.           |
| **1.6**  | Collect Cash Tender               | Click **Record Payment** in order view | Method: `CASH`<br>Amount: `60.00`<br>Reference: `CASH-REG-01`          | Modal confirms settlement; sale status badge transitions from `PENDING_PAYMENT` to `PAID`. Balance shows `$0.00`.          | Row inserted into `payments` (`status: COMPLETED`, `method: CASH`, `paidAt: NOW()`). Sale `version` increments. |
| **1.7**  | Issue Fiscal Receipt              | Click **View Receipt**                 | Action button click                                                    | Receipt preview drawer opens showing official voucher: `REC-2026-00000X`, client details, tax rate, and paid total.        | Row inserted into `receipts` table; `receipt_sequences` incremented atomically.                                 |
| **1.8**  | Check-in at Facility Turnstile    | `/gym/attendance`                      | Search: `Carlos Rivera`<br>Click **Check In**                          | Green turnstile banner: `GRANTED — Access Permitted`. Check-in counter increments.                                         | Row inserted into `attendance_records` (`result: GRANTED`, `gateId: GATE-FRONT-DESK`).                          |
| **1.9**  | Demonstrate Anti-Passback         | `/gym/attendance`                      | Immediately click **Check In** again for Carlos                        | Yellow/Red alert: `DENIED — Rapid Duplicate Check-In Cooldown Active` (5-minute security barrier).                         | Row inserted into `attendance_records` (`result: DENIED_DUPLICATE_CHECKIN`, notes indicate anti-passback rule). |
| **1.10** | Demonstrate Expired Rejection     | `/gym/attendance`                      | Search: `David Kim`<br>Click **Check In**                              | Red turnstile banner: `DENIED — Membership Expired on 2026-09-01`. Turnstile remains locked.                               | Row inserted into `attendance_records` (`result: DENIED_EXPIRED`).                                              |
| **1.11** | Demonstrate Frozen Hold Rejection | `/gym/attendance`                      | Search: `Maria Gonzalez`<br>Click **Check In**                         | Blue/Yellow banner: `DENIED — Membership Frozen (Medical Hold)`. Turnstile remains locked.                                 | Row inserted into `attendance_records` (`result: DENIED_FROZEN`).                                               |

### 3.4 Verification Evidence

- **Acceptance Report**: [Milestone 11.5 Gym MVP Business Acceptance Report](MILESTONE-11-5-GYM-ACCEPTANCE.md) (**PASS**).
- **Backend Integration Spec**: `apps/api/src/gym/__tests__/gym-business-journey-acceptance.e2e.spec.ts` (22/22 tests passed).
- **Frontend E2E Spec**: `apps/web/src/modules/gym/__tests__/gym-critical-business-workflows.e2e.spec.tsx` (9/9 tests passed).
- **Lifecycle & Anti-Passback Hardening**: `apps/web/src/modules/gym/__tests__/gym-cross-feature-lifecycle-integrity.spec.tsx` (10/10 tests passed).
- **Domain Orchestration Audit**: `packages/core/src/gym/application/__tests__/gym-application-orchestration-audit.spec.ts`.

---

## 4. Scenario 2: Clinical Kinesiology, 4D Scheduling & SOAP Immutability

### 4.1 Scenario Metadata

- **Domain Focus:** Clinical Kinesiology & Facility Resource Scheduling
- **Primary Actors:** Receptionist (`ACT-REC`) and Clinical Therapist Dr. Sarah Chen (`ACT-THR`)
- **Target Subject:** Jane Doe (`CLI-2026-00001`), Room 1 (`room-seed-kinesio-01`)
- **Key Business Invariants:** 4D conflict prevention (therapist, room, client, buffer), UTC time normalization, post-completion SOAP locking.

### 4.2 Preconditions

- Jane Doe exists in `clients` table.
- Room 1 (Therapy Suite) exists in `rooms` table with capacity 1.
- Therapist Dr. Sarah Chen exists with active system role `Trainer`.

### 4.3 Step-by-Step Execution Script

|   Step   | User Action                     | Interface Location                         | Input Data                                                                                                                                                                                                    | Expected UI Feedback                                                                                             | Expected Persisted State                                                                    |
| :------: | :------------------------------ | :----------------------------------------- | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | :--------------------------------------------------------------------------------------------------------------- | :------------------------------------------------------------------------------------------ |
| **2.1**  | Open Scheduling Calendar        | `/scheduling/calendar` (as Receptionist)   | Calendar view                                                                                                                                                                                                 | 7-day facility grid renders rooms, therapists, and existing bookings.                                            | Queries appointments within date boundary window.                                           |
| **2.2**  | Book Clinical Appointment       | Click empty calendar slot in Room 1        | Client: Jane Doe<br>Therapist: Dr. Sarah Chen<br>Room: Room 1 - Kinesiology Suite<br>Type: `KINESIOLOGY_ASSESSMENT`<br>Duration: 60 minutes                                                                   | Slot wizard displays duration and turnaround buffer. Submission renders blue appointment card on grid.           | Row inserted into `appointments` (`status: SCHEDULED`, normalized UTC start/end times).     |
| **2.3**  | Demonstrate 4D Collision Engine | Attempt duplicate booking in Room 1        | Identical room and therapist at identical time                                                                                                                                                                | System displays error modal: `409 Conflict — Resource Room 1 is already allocated during this interval`.         | Database transaction rolls back; no duplicate appointment created.                          |
| **2.4**  | Switch to Clinical Therapist    | Logout $\to$ `/login`                      | `therapist.demo@kinergy.platform`<br>`DemoPass123!`                                                                                                                                                           | Interface switches to clinical workspace view.                                                                   | Token issues with therapist roles and permissions.                                          |
| **2.5**  | Initiate Clinical Encounter     | `/kinesiology/sessions`                    | Locate Jane Doe's appointment $\to$ Click **Start Session**                                                                                                                                                   | Appointment status transitions to `IN_PROGRESS`. Clinical SOAP form activates.                                   | Row created in `treatment_sessions` (`status: IN_PROGRESS`, `therapistId: Dr. Sarah Chen`). |
| **2.6**  | Record Structured SOAP Notes    | Clinical Session Workspace                 | **S**: Right shoulder pain 4/10 upon overhead reach.<br>**O**: Active abduction 140°, Hawkins-Kennedy test positive.<br>**A**: Early subacromial impingement.<br>**P**: Rotator cuff isometric stabilization. | Status shows "Draft Saved" with local timestamp.                                                                 | `treatment_sessions` updated with notes fields; draft status preserved.                     |
| **2.7**  | Medico-Legal Session Sign-off   | Click **Complete Treatment Session**       | Confirmation dialog                                                                                                                                                                                           | Status badge turns purple: `COMPLETED`. Padlock icon indicates notes are permanently locked and read-only.       | `treatment_sessions` updated (`status: COMPLETED`, `completedAt: NOW()`). Notes immutable.  |
| **2.8**  | Verify Medico-Legal Lock        | Attempt editing SOAP text fields           | Type in Subjective field                                                                                                                                                                                      | Fields are disabled / read-only; no save or edit action is available.                                            | Handlers reject mutation attempts on `COMPLETED` sessions with HTTP 422.                    |
| **2.9**  | Initiate Commercial Billing     | Switch to Receptionist $\to$ `/sales/new`  | Source: `KINESIOLOGY_SESSION`<br>Target: Completed Session ID                                                                                                                                                 | Cart populates "Kinesiology Clinical Consultation" with locked price snapshot of $120.00. Click **Create Sale**. | Row inserted into `sales` (`status: PENDING_PAYMENT`) and `sale_items`. Price locked.       |
| **2.10** | Settle Multi-Tender Payment     | Order detail page $\to$ **Record Payment** | Method: `CASH`<br>Amount: `120.00`<br>Reference: `CASH-REG-02`                                                                                                                                                | Payment settles immediately; sale transitions to `PAID` (balance: $0.00).                                        | Row inserted into `payments` (`status: COMPLETED`). Sale `version` increments.              |
| **2.11** | Issue Sequential Fiscal Receipt | Click **View Receipt** in order view       | Action button click                                                                                                                                                                                           | Fiscal voucher drawer opens displaying sequential receipt number (`REC-2026-00000X`) and clinical breakdown.     | Row inserted into `receipts`; `receipt_sequences` atomically incremented.                   |
| **2.12** | Verify Single-Billing Guard     | Attempt creating second sale for session   | `/sales/new` $\to$ select same session ID                                                                                                                                                                     | System returns collision alert: `409 Conflict — Treatment session has already been billed`.                      | Active sales partial unique index prevents duplicate order creation.                        |

### 4.4 Verification Evidence

- **Acceptance Report**: [Milestone 11.6 Kinesiology MVP Business Acceptance Report](MILESTONE-11-6-KINESIOLOGY-ACCEPTANCE.md) (**PASS**).
- **Automated Integration Spec**: `apps/api/src/kinesiology/__tests__/kinesiology-business-journey-acceptance.e2e.spec.ts` (19/19 tests passed).
- **Clinical Frontend Workspace Spec**: `apps/web/src/modules/kinesiology/__tests__/treatment-session-workspace-page.spec.tsx` (4/4 tests passed).
- **Client Treatment History & Security Spec**: `apps/web/src/modules/kinesiology/__tests__/client-treatment-history.spec.tsx` (13/13 tests passed).
- **Appointment Booking Wizard Spec**: `apps/web/src/modules/scheduling/components/__tests__/appointment-booking-wizard.spec.tsx` (3/3 tests passed).
- **Kinesiology Full-Stack Integration**: `apps/web/src/modules/kinesiology/__tests__/kinesiology-fullstack-integration.spec.tsx` (3/3 tests passed).
- **Clinical Process Spec**: `packages/core/src/kinesiology/application/handlers/phase4-business-process-master.integration.spec.ts`.

---

## 5. Scenario 3: Consumable Inventory, Receiving & POS Checkout

### 5.1 Scenario Metadata

- **Domain Focus:** Goods Management, Stock Movement Ledger, Retail POS
- **Primary Actors:** Inventory Operations Staff (`ACT-INV`) and Receptionist/Cashier (`ACT-REC`)
- **Target Items:** Kinesiology Tape (`SKU-CLIN-BAND-01`), Electrolyte Drink (`SKU-DRK-ELEC-01`)
- **Key Business Invariants:** Append-only stock movements, automatic low-stock boundary alerts, payment-triggered inventory decrements.

### 5.2 Preconditions

- Kinesiology Tape Roll 5m has quantity on hand 3.00 vs. minimum stock 10.00 (triggers low-stock alert).
- Electrolyte Drink has quantity on hand 36.00 and selling price \$3.00.

### 5.3 Step-by-Step Execution Script

|  Step   | User Action                      | Interface Location                                    | Input Data                                                               | Expected UI Feedback                                                                                              | Expected Persisted State                                                                                                            |
| :-----: | :------------------------------- | :---------------------------------------------------- | :----------------------------------------------------------------------- | :---------------------------------------------------------------------------------------------------------------- | :---------------------------------------------------------------------------------------------------------------------------------- |
| **3.1** | Inspect Low-Stock Dashboard      | `/resources/inventory/low-stock` (as Inventory Staff) | Navigation menu                                                          | Low-stock cockpit lists **Kinesiology Tape Roll 5m** with red badge: `On Hand: 3 / Min: 10`.                      | Query filters items where `quantityOnHand <= minimumStock`.                                                                         |
| **3.2** | Receive Supplier Shipment        | Click item $\to$ **Receive Stock**                    | Quantity: `15`<br>Supplier Invoice: `INV-2026-991`<br>Unit Cost: `$3.50` | Form confirms receiving; toast notification appears. Quantity updates to `18.00`. Red low-stock alert disappears. | Row inserted into `stock_movements` (`type: PURCHASE`, `quantity: 15`, `invoiceNumber: INV-2026-991`). Item stock updated to 18.00. |
| **3.3** | Verify Movement Ledger           | `/resources/inventory/inv-seed-med-bandage`           | Click **Movements** tab                                                  | Append-only ledger displays chronological record: `+15 ROLLS (PURCHASE)` with invoice reference and user ID.      | Ledger query reads `stock_movements` ordered by `createdAt DESC`.                                                                   |
| **3.4** | Ring up Retail Sale              | `/sales/new` (as Cashier `ACT-REC`)                   | Item: Electrolyte Hydration Drink<br>Quantity: `2` bottles               | Cart displays 2 bottles $\times$ \$3.00 = \$6.00 subtotal. Click **Create Sale**. Order enters `PENDING_PAYMENT`. | Row inserted into `sales` and `sale_items`. Electrolyte stock remains at 36 (not decremented until paid).                           |
| **3.5** | Settle Retail Payment            | Order detail page $\to$ **Record Payment**            | Method: `CASH`<br>Amount: `6.00`                                         | Payment settles immediately; order transitions to `PAID`.                                                         | Row inserted into `payments` (`status: COMPLETED`).                                                                                 |
| **3.6** | Verify Automatic Stock Decrement | `/resources/inventory/inv-seed-drink-electrolyte`     | View item detail                                                         | Quantity on hand shows **`34.00 BOTTLES`** (decremented from 36 to 34). Movements tab logs `SALE (-2.00)`.        | Stock movement automatically appended upon payment completion event.                                                                |

### 5.4 Verification Evidence

- **Acceptance Report**: [Milestone 11.7 Inventory & Financial MVP Acceptance Report](MILESTONE-11-7-INVENTORY-FINANCIAL-ACCEPTANCE.md) (**PASS**).
- **Automated Integration Spec**: `apps/api/src/resources/__tests__/inventory-business-journey-acceptance.e2e.spec.ts` (10/10 tests passed).
- **Consumable Retail Integration Spec**: `apps/api/src/sales/__tests__/sales-milestone-7-23-scenario-2.e2e.spec.ts` (8/8 tests passed).
- **Inventory Mutation Dialogs Spec**: `apps/web/src/modules/resources/inventory/__tests__/stock-mutation-dialogs.spec.tsx` (19/19 tests passed).
- **Low-Stock Cockpit Spec**: `apps/web/src/modules/resources/inventory/__tests__/low-stock-page.spec.tsx` (7/7 tests passed).
- **Cross-Domain Inventory Port Spec**: `packages/core/src/resources/application/__tests__/food-drink-sales-integration.spec.ts`.

---

## 6. Scenario 4: Cross-Domain Orders, Multi-Tender & QR Settlement

### 6.1 Scenario Metadata

- **Domain Focus:** Financial Integrity, Payment State Transitions, Fiscal Receipts
- **Primary Actor:** Cashier / Receptionist (`ACT-REC`)
- **Key Business Invariants:** QR tenders remain `PENDING` until external verification; overpayment prevention; gapless receipt numbering.

### 6.2 Step-by-Step Execution Script

|  Step   | User Action                      | Interface Location                               | Input Data                                                         | Expected UI Feedback                                                                                                      | Expected Persisted State                                                                                         |
| :-----: | :------------------------------- | :----------------------------------------------- | :----------------------------------------------------------------- | :------------------------------------------------------------------------------------------------------------------------ | :--------------------------------------------------------------------------------------------------------------- |
| **4.1** | Create Multi-Item Order          | `/sales/new`                                     | Item 1: Protein Bar (\$5.50)<br>Item 2: Electrolyte Drink (\$3.00) | Order total calculates exactly: \$8.50. Click **Create Sale**.                                                            | Order created in `sales` (`status: PENDING_PAYMENT`, `totalAmount: 8.50`).                                       |
| **4.2** | Record Split Tender 1 (Cash)     | Click **Record Payment**                         | Method: `CASH`<br>Amount: `3.50`                                   | Partial payment banner: `PARTIALLY_PAID`. Remaining balance updates to `$5.00`.                                           | Row inserted into `payments` (`amount: 3.50`, `status: COMPLETED`). Sale status transitions to `PARTIALLY_PAID`. |
| **4.3** | Record Split Tender 2 (QR)       | Click **Record Payment**                         | Method: `QR`<br>Amount: `5.00`<br>Reference: `QR-TXN-4412`         | Notice: Payment record created in **`PENDING`** state. Sale remains in `PARTIALLY_PAID`.                                  | Row inserted into `payments` (`amount: 5.00`, `status: PENDING`, `reference: QR-TXN-4412`). `paidAt` is null.    |
| **4.4** | Confirm External Funds & Settle  | Click pending payment link $\to$ `/payments/:id` | Click **Settle Payment** button                                    | `SettlePaymentDialog` opens showing authoritative financial breakdown and settlement confirmation prompt.                 | Dialog evaluates `evaluateSettlementConfirmation()`.                                                             |
| **4.5** | Execute Final Settlement         | `SettlePaymentDialog`                            | Bank confirmation: `MERCHANT-QR-CONFIRMED-99`                      | Payment transitions to `COMPLETED`; `paidAt` is populated. Sale transitions to `PAID` (balance: \$0.00).                  | `payments.status` updated to `COMPLETED`. Sale `status` updated to `PAID`.                                       |
| **4.6** | Generate Official Fiscal Voucher | Sale detail page $\to$ **View Receipt**          | Click **View Receipt**                                             | Fiscal voucher preview opens: shows both tenders (Cash \$3.50, QR \$5.00), sequential receipt number (`REC-2026-00000X`). | Receipt record generated with unique sequence number.                                                            |

### 6.3 Verification Evidence

- **Acceptance Report**: [Milestone 11.7 Inventory & Financial MVP Acceptance Report](MILESTONE-11-7-INVENTORY-FINANCIAL-ACCEPTANCE.md) (**PASS**).
- **Payments Lifecycle UI Spec**: `apps/web/src/modules/sales/__tests__/payment-lifecycle-verification.spec.tsx` (17/17 tests passed).
- **Receipt View & Output Hardening Spec**: `apps/web/src/modules/sales/__tests__/receipt-view-and-output-verification.spec.tsx` (13/13 tests passed).
- **Discounts & Monetary Math Spec**: `apps/api/src/sales/__tests__/sales-milestone-7-23-scenario-3.e2e.spec.ts` (10/10 tests passed).
- **Overpayment Protection Spec**: `apps/api/src/sales/__tests__/sales-milestone-7-23-scenario-4.e2e.spec.ts` (8/8 tests passed).
- **Concurrency & Idempotency Spec**: `apps/api/src/sales/__tests__/sales-milestone-7-23-scenario-5.e2e.spec.ts` (8/8 tests passed).
- **Sale Cancellation & Audit Spec**: `apps/api/src/sales/__tests__/sales-milestone-7-23-scenario-6.e2e.spec.ts` (9/9 tests passed).
- **Financial Concurrency Spec**: `packages/core/src/sales/infrastructure/persistence/prisma/__tests__/financial-concurrency.integration.spec.ts`.
