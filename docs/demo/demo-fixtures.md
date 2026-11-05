# Kinergy Platform — Deterministic Demo Data & User Provisioning Manual

| Document Attribute      | Details                                                      |
| :---------------------- | :----------------------------------------------------------- |
| **Document ID**         | `KIN-DOC-DEMO-FIXTURES-11-4`                                 |
| **Version**             | `1.0.0`                                                      |
| **Status**              | **APPROVED FOR MVP DEMONSTRATION**                           |
| **Milestone Reference** | Milestone 11.4 — Deterministic Demo Data & User Provisioning |
| **Environment Target**  | Isolated Demo Environment (`kinergy_dev` on port `5433`)     |
| **Last Verified Date**  | 2026-11-05                                                   |
| **Maintainer**          | Senior Backend Engineer & Platform QA Lead                   |

---

## 1. Executive Summary & Core Principles

This document defines the deterministic synthetic fixtures and user accounts provisioned in the Kinergy demonstration environment. It serves as the authoritative catalog for sales engineers, QA testers, and presenters conducting business walkthroughs.

### Core Engineering Invariants

1. **Zero Real PII (100% Synthetic Data)**:
   - All client names, email addresses (`@example.com`), phone numbers (`+155501...`), clinical notes, and physical addresses are entirely synthetic.
   - No patient records, health insurance data, or identifiable employee credentials exist in seed files or source control.

2. **Strict Determinism & Stable Identifiers**:
   - Every seeded entity utilizes deterministic, human-readable primary keys (e.g. `cli-seed-jane-01`, `plan-seed-gold-annual`, `SKU-SUP-CREAT-01`, `AST-CLN-PLTH-02`).
   - All timestamps are pinned to a documented demo epoch (`2026-11-02T12:00:00.000Z` UTC) while respecting facility local time rendering in the web SPA.

3. **Complete Idempotency via Upsert**:
   - Every seed routine employs PostgreSQL `upsert` semantics. Re-executing `pnpm db:seed` multiple times produces zero duplicate keys, zero orphaned foreign relations, and leaves the database in an identical, verified state.

4. **Production Safety Guards (`assertSafeDemoEnvironment`)**:
   - The provisioning orchestrator programmatically inspects `NODE_ENV` and `DATABASE_URL`.
   - Seeding automatically aborts if `NODE_ENV=production` or if connection strings contain production keywords (`prod`, `production`, `live-db`). All logged credentials are securely masked (`:***@`).

---

## 2. Provisioned Demo Accounts & RBAC Matrix

The demonstration environment provisions 5 dedicated staff personas corresponding to the exact supported domain roles (`Owner`, `Receptionist`, `Trainer`, `Kitchen Staff`). No artificial permissions are introduced.

| Persona / Business Role            | Email Address                     | Password            | Assigned Role   | Domain Responsibilities & Scope                                                                                                  |
| :--------------------------------- | :-------------------------------- | :------------------ | :-------------- | :------------------------------------------------------------------------------------------------------------------------------- |
| **Platform Owner / Administrator** | `owner@kinergy.platform`          | `OwnerPassword123!` | `Owner`         | Global wildcard administrative authority (`*`), tenant settings, user provisioning, full fiscal ledger inspection.               |
| **Front Desk Receptionist**        | `reception.demo@kinergy.platform` | `DemoPass123!`      | `Receptionist`  | Client intake, gym plan enrollment, turnstile check-in verification, POS checkout, cash & QR payments, fiscal receipts.          |
| **Clinical Therapist**             | `therapist.demo@kinergy.platform` | `DemoPass123!`      | `Trainer`       | Assigned clinical client lookup, rehabilitation treatment execution, clinical SOAP documentation charting, consultation booking. |
| **Gym Movement Coach / Trainer**   | `trainer.demo@kinergy.platform`   | `DemoPass123!`      | `Trainer`       | Facility floor supervision, member workout tracking, personal training sessions, check-in validation.                            |
| **Operations / Inventory Staff**   | `inventory.demo@kinergy.platform` | `DemoPass123!`      | `Kitchen Staff` | Inventory management, supplier receipt recording, low-stock threshold monitoring, movement audit trail inspection.               |

> [!IMPORTANT]
> **Authentication Method**: Password hashes are computed using PBKDF2 with SHA-512 (600,000 iterations, 32-byte salt). The API's `Argon2PasswordHasher` transparently authenticates both legacy seed hashes and standard Argon2id hashes.

---

## 3. Comprehensive Synthetic Data Catalog

### 3.1 Facility & Consultation Rooms

| Room Identifier        | Name                               | Capacity | Resource Type | Available Equipment & Features                                       | Status      |
| :--------------------- | :--------------------------------- | :------- | :------------ | :------------------------------------------------------------------- | :---------- |
| `room-seed-kinesio-01` | Room 1 - Kinesiology Therapy Suite | 1        | `ROOM`        | Motorized Therapy Bed, Therapeutic Ultrasound, Rehab Resistance Gear | `AVAILABLE` |
| `room-seed-consult-02` | Room 2 - Assessment & Consultation | 1        | `ROOM`        | Clinical Evaluation Desk, Biomechanical Goniometers, Spine Models    | `AVAILABLE` |
| `studio-b-facility`    | Studio B - Movement Room           | 20       | `ROOM`        | Premium Exercise Mats, Pilates Reformers, Wall Bars                  | `AVAILABLE` |

---

### 3.2 Demo Clients Directory

| Client ID            | Reference Number | Full Name          | Email                        | Phone          | Relationship & Demo Journey Focus                                           | Status   |
| :------------------- | :--------------- | :----------------- | :--------------------------- | :------------- | :-------------------------------------------------------------------------- | :------- |
| `cli-seed-jane-01`   | `CLI-2026-00001` | **Jane Doe**       | `jane.doe@example.com`       | `+15550199123` | Kinesiology patient with completed assessment, SOAP notes, upcoming session | `ACTIVE` |
| `cli-seed-john-02`   | `CLI-2026-00002` | **John Smith**     | `john.smith@example.com`     | `+15550144123` | Gym member with Gold Annual Plan; verified turnstile check-in record        | `ACTIVE` |
| `cli-seed-carlos-03` | `CLI-2026-00003` | **Carlos Rivera**  | `carlos.rivera@example.com`  | `+15550177123` | Walk-in intake profile ready for live front-desk enrollment and payment     | `ACTIVE` |
| `cli-seed-maria-04`  | `CLI-2026-00004` | **Maria Gonzalez** | `maria.gonzalez@example.com` | `+15550188123` | Gym member with **frozen** membership on medical hold; scheduled therapy    | `ACTIVE` |
| `cli-seed-david-05`  | `CLI-2026-00005` | **David Kim**      | `david.kim@example.com`      | `+15550133123` | Former member with **expired** plan; verified turnstile access denial       | `ACTIVE` |

---

### 3.3 Gym Membership Plans & Status Invariants

#### Catalog Plans

| Plan Identifier            | Code            | Plan Name                     | Duration | Price (USD) | Quota     | Status   |
| :------------------------- | :-------------- | :---------------------------- | :------- | :---------- | :-------- | :------- |
| `plan-seed-gold-annual`    | `MEM-GOLD-2026` | Gold Annual Gym Membership    | 365 Days | \$600.00    | Unlimited | `ACTIVE` |
| `plan-seed-silver-monthly` | `MEM-SLV-MONTH` | Silver Monthly Gym Membership | 30 Days  | \$60.00     | Unlimited | `ACTIVE` |
| `plan-seed-10-visits`      | `MEM-10-VISITS` | 10-Visit Flexibility Pass     | 60 Days  | \$45.00     | 10 Visits | `ACTIVE` |

#### Client Membership States

| Membership ID       | Client Name    | Plan                          | Period                   | Status    | Assigned Trainer                  | Notes / Freeze History                                   |
| :------------------ | :------------- | :---------------------------- | :----------------------- | :-------- | :-------------------------------- | :------------------------------------------------------- |
| `mem-seed-john-01`  | John Smith     | Gold Annual Gym Membership    | 2026-10-01 to 2027-10-01 | `ACTIVE`  | `usr-demo-trainer-002` (M. Vance) | Active unrestricted facility access.                     |
| `mem-seed-maria-02` | Maria Gonzalez | Silver Monthly Gym Membership | 2026-09-01 to 2026-12-01 | `FROZEN`  | `usr-demo-trainer-002` (M. Vance) | Frozen on 2026-10-15: "Medical leave after knee strain." |
| `mem-seed-david-03` | David Kim      | Silver Monthly Gym Membership | 2026-08-01 to 2026-09-01 | `EXPIRED` | None                              | Expired on 2026-09-01. Access denied at turnstile.       |

---

### 3.4 Turnstile Gate Attendance History

| Attendance ID        | Client Name    | Timestamp (UTC)     | Check-In Method    | Access Result    | Gate Location     | Documented Audit Note                                             |
| :------------------- | :------------- | :------------------ | :----------------- | :--------------- | :---------------- | :---------------------------------------------------------------- |
| `att-seed-john-001`  | John Smith     | 2026-11-02 08:30:00 | `QR_CODE`          | `GRANTED`        | `GATE-FRONT-DESK` | Presenter demonstration check-in verified.                        |
| `att-seed-david-002` | David Kim      | 2026-11-02 09:15:00 | `MANUAL_RECEPTION` | `DENIED_EXPIRED` | `GATE-FRONT-DESK` | Turnstile gate check-in denied: membership expired on 2026-09-01. |
| `att-seed-maria-003` | Maria Gonzalez | 2026-11-02 10:00:00 | `QR_CODE`          | `DENIED_FROZEN`  | `GATE-FRONT-DESK` | Access denied: membership is currently frozen on medical hold.    |

---

### 3.5 Appointments & Clinical SOAP Documentation

#### Appointments Register

| Appointment ID            | Client Name    | Practitioner                    | Room                   | Scheduled Time (UTC)     | Status      |
| :------------------------ | :------------- | :------------------------------ | :--------------------- | :----------------------- | :---------- |
| `appt-seed-jane-001`      | Jane Doe       | Dr. Sarah Chen (`usr-demo-001`) | `room-seed-kinesio-01` | 2026-10-02 10:00 - 11:00 | `COMPLETED` |
| `appt-seed-jane-upcoming` | Jane Doe       | Dr. Sarah Chen (`usr-demo-001`) | `room-seed-kinesio-01` | 2026-11-03 10:00 - 11:00 | `SCHEDULED` |
| `appt-seed-maria-003`     | Maria Gonzalez | Dr. Sarah Chen (`usr-demo-001`) | `room-seed-consult-02` | 2026-11-04 14:00 - 15:00 | `SCHEDULED` |

#### Completed Clinical SOAP Session (`sess-seed-rehab-001`)

- **Patient**: Jane Doe (`CLI-2026-00001`)
- **Clinician**: Dr. Sarah Chen, PT, Kinesiologist
- **Appointment ID**: `appt-seed-jane-001`
- **Clinical Status**: `COMPLETED`
- **SOAP Medical Charting**:
  - **Subjective (S)**: "Client reports persistent right shoulder stiffness after heavy bench pressing. Pain 4/10 upon abduction."
  - **Objective (O)**: "Active abduction limited to 140 deg. Supraspinatus tendon tender to palpation. Hawkins-Kennedy positive."
  - **Assessment (A)**: "Subacromial impingement syndrome, early stage. Good response to passive mobilization."
  - **Plan (P)**: "Prescribed isometric rotator cuff strengthening, manual therapy, and scapular control drills. Re-evaluate next session."
  - **Raw Text**: "Client completed 60min evaluation and manual treatment."

---

### 3.6 Inventory Items, Pricing, & Stock Balances

| Item ID                      | SKU                 | Item Name                                     | Category            | Unit      | Cost (USD) | Price (USD) | Min Stock | QOH   | Stock Health Alert            |
| :--------------------------- | :------------------ | :-------------------------------------------- | :------------------ | :-------- | :--------- | :---------- | :-------- | :---- | :---------------------------- |
| `inv-seed-bar-protein`       | `SKU-SNK-BAR-01`    | Organic Whey Protein Bar 60g (Chocolate)      | `HEALTHY_MEALS`     | `UNITS`   | \$1.50     | \$5.50      | 15.00     | 42.00 | Normal Balance                |
| `inv-seed-drink-electrolyte` | `SKU-DRK-ELEC-01`   | Electrolyte Hydration Drink (Lemon, 500ml)    | `HEALTHY_DRINKS`    | `BOTTLES` | \$1.00     | \$3.00      | 12.00     | 36.00 | Normal Balance                |
| `inv-seed-med-bandage`       | `SKU-CLIN-BAND-01`  | Kinesiology Tape Roll (5m Elastic Beige)      | `CLINICAL_SUPPLIES` | `ROLLS`   | \$3.50     | \$0.00      | 10.00     | 3.00  | **LOW STOCK ALERT (3 <= 10)** |
| `inv-seed-sup-creatine`      | `SKU-SUP-CREAT-01`  | Micronized Creatine Monohydrate 300g          | `SUPPLEMENTS`       | `UNITS`   | \$14.00    | \$28.00     | 8.00      | 25.00 | Normal Balance                |
| `inv-seed-ret-bottle`        | `SKU-RET-BOTTLE-01` | Stainless Steel Insulated Shaker Bottle 750ml | `RETAIL_PRODUCTS`   | `BOTTLES` | \$9.50     | \$22.00     | 5.00      | 18.00 | Normal Balance                |

---

### 3.7 Stock Movement Audit Ledger

| Movement ID      | Item SKU            | Movement Type | Delta  | Balance | Unit Cost | Justification / Reason                               | Recorded By          |
| :--------------- | :------------------ | :------------ | :----- | :------ | :-------- | :--------------------------------------------------- | :------------------- |
| `sm-seed-bar-01` | `SKU-SNK-BAR-01`    | `PURCHASE`    | +50.00 | 50.00   | \$1.50    | Initial demo stock shipment receipt                  | `usr-demo-inventory` |
| `sm-seed-bar-02` | `SKU-SNK-BAR-01`    | `SALE`        | -8.00  | 42.00   | \$1.50    | Retail counter sales batch                           | `usr-demo-inventory` |
| `sm-seed-drk-01` | `SKU-DRK-ELEC-01`   | `PURCHASE`    | +40.00 | 40.00   | \$1.00    | Initial demo stock shipment receipt                  | `usr-demo-inventory` |
| `sm-seed-drk-02` | `SKU-DRK-ELEC-01`   | `SALE`        | -4.00  | 36.00   | \$1.00    | Front desk retail sales                              | `usr-demo-inventory` |
| `sm-seed-med-01` | `SKU-CLIN-BAND-01`  | `PURCHASE`    | +15.00 | 15.00   | \$3.50    | Clinical supplier delivery                           | `usr-demo-inventory` |
| `sm-seed-med-02` | `SKU-CLIN-BAND-01`  | `CONSUMPTION` | -12.00 | 3.00    | \$3.50    | Clinical consumable usage (Low stock trigger: 3<=10) | `usr-demo-inventory` |
| `sm-seed-sup-01` | `SKU-SUP-CREAT-01`  | `PURCHASE`    | +30.00 | 30.00   | \$14.00   | Initial supplement inventory receipt                 | `usr-demo-inventory` |
| `sm-seed-sup-02` | `SKU-SUP-CREAT-01`  | `SALE`        | -5.00  | 25.00   | \$14.00   | Client supplement purchases at front desk            | `usr-demo-inventory` |
| `sm-seed-ret-01` | `SKU-RET-BOTTLE-01` | `PURCHASE`    | +20.00 | 20.00   | \$9.50    | Retail merchandise shipment receipt                  | `usr-demo-inventory` |
| `sm-seed-ret-02` | `SKU-RET-BOTTLE-01` | `SALE`        | -2.00  | 18.00   | \$9.50    | Member merchandise sales                             | `usr-demo-inventory` |

---

### 3.8 Fixed Assets Register

| Asset ID                  | Asset Tag         | Asset Name                               | Category            | Cost (USD) | Est. Value | Condition   | Physical Location           |
| :------------------------ | :---------------- | :--------------------------------------- | :------------------ | :--------- | :--------- | :---------- | :-------------------------- |
| `asset-seed-treadmill-01` | `AST-GYM-TRDM-01` | Commercial Treadmill Pro Series 8        | `GYM_EQUIPMENT`     | \$3,500.00 | \$3,100.00 | `EXCELLENT` | Main Facility - Cardio Zone |
| `asset-seed-plinth-02`    | `AST-CLN-PLTH-02` | Hi-Lo Electric Clinical Treatment Plinth | `THERAPY_EQUIPMENT` | \$2,850.00 | \$2,600.00 | `EXCELLENT` | Room 1 - Kinesiology Suite  |

---

### 3.9 Sales Orders, Payments, & Fiscal Receipts

| Sale ID              | Client Name | Source Type           | Subtotal | Discount | Total    | Payment Method | Settlement State | Receipt Number  |
| :------------------- | :---------- | :-------------------- | :------- | :------- | :------- | :------------- | :--------------- | :-------------- |
| `sale-seed-clin-001` | Jane Doe    | `KINESIOLOGY_SESSION` | \$120.00 | \$0.00   | \$120.00 | `QR`           | `SETTLED`        | `REC-2026-0001` |
| `sale-seed-gym-002`  | John Smith  | `GYM_MEMBERSHIP`      | \$600.00 | \$0.00   | \$600.00 | `CASH`         | `SETTLED`        | `REC-2026-0002` |
| `sale-seed-pos-003`  | Walk-In POS | `RETAIL_COUNTER`      | \$11.50  | \$0.00   | \$11.50  | `CASH`         | `SETTLED`        | `REC-2026-0003` |
| `sale-seed-pos-004`  | Jane Doe    | `RETAIL_COUNTER`      | \$14.00  | \$0.00   | \$14.00  | None           | `PENDING`        | None            |
| `sale-seed-gym-005`  | Walk-In     | `GYM_MEMBERSHIP`      | \$60.00  | \$0.00   | \$60.00  | None           | `CANCELLED`      | None            |

---

## 4. Provisioning & Reset Workflows

### 4.1 Standard Provisioning Command

To populate the isolated demonstration database with all synthetic fixtures:

```powershell
pnpm db:seed
```

### 4.2 Complete Deterministic Environment Reset

To reset the database from scratch, re-deploy all 14 schema migrations, and re-seed the exact baseline fixtures:

```powershell
pnpm demo:reset
```

The underlying script:

1. Re-applies all Prisma migrations via `prisma migrate deploy`.
2. Validates safety guards via `assertSafeDemoEnvironment()`.
3. Populates all identity roles and permissions.
4. Executes deterministic upserts across all 11 entity categories.
5. Synchronizes the atomic receipt sequence generator (`currentValue = 3`).

---

## 5. Verification Test Evidence

### 5.1 Automated Safety & Determinism Suite

The test suite at `apps/api/src/platform/identity/__tests__/demo-fixtures-verification.spec.ts` verifies:

- `assertSafeDemoEnvironment` terminates on `NODE_ENV=production`.
- `assertSafeDemoEnvironment` blocks database strings indicating production clusters (`prod-db`, `production`, `live-db`).
- Credential masking strictly redacts database passwords in all exception traces.
- Password hashes for all 5 demo accounts match expected seed credentials.
- Synthetic identifier regex invariants (`CLI-2026-XXXXX` and `SKU-XXX-XXXX-XX`) pass without exception.

**Execution Evidence**:

```
 PASS   api  apps/api/src/platform/identity/__tests__/demo-fixtures-verification.spec.ts
  Demo Fixtures Safety and Determinism Verification
    assertSafeDemoEnvironment
      √ should throw SAFETY LOCK error when NODE_ENV is production
      √ should throw SAFETY LOCK error when DATABASE_URL indicates production
      √ should mask credentials in production warning messages
      √ should throw error when DATABASE_URL is missing
      √ should pass safety assertion for local demo/development database URL
    Demo Account Authentication Verification
      √ should verify password hash for all demo accounts with default demo password
      √ should verify owner account credentials against seed hasher
      √ should verify synthetic client and inventory identifiers follow strict formatting invariants

Test Suites: 1 passed, 1 total
Tests:       8 passed, 8 total
Snapshots:   0 total
Time:        5.119 s
```

### 5.2 Seeding Idempotency Verification

Executed back-to-back runs of `pnpm db:seed` against the active demonstration database `kinergy_dev`:

```
Run 1: Total Execution Time: 708ms
- Permissions Seeded:      34
- Roles Seeded:            4
- Role-Permissions Seeded: 66
- Demo Staff Accounts:     4
- Rooms Seeded:            3
- Demo Clients Seeded:     5
- Membership Plans Seeded: 3
- Active Memberships:      3
- Check-In Records:        3
- Appointments Seeded:     3
- Clinical SOAP Sessions:  1
- Inventory Items Seeded:  5
- Stock Movement Entries:  10
- Fixed Assets Seeded:     2
- Sales Orders Seeded:     5
- Sale Items Seeded:       6
- Payments Seeded:         3
- Receipts Seeded:         3

Run 2: Total Execution Time: 627ms
All entity counts identical; 0 duplicate key violations; 0 orphaned relations.
```
