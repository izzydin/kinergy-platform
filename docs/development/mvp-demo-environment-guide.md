# Kinergy Platform — MVP Demonstration Environment Guide & Presenter Manual

**Document ID:** `DOC-ENV-011`  
**Milestone:** 11.2 — Professional MVP Demo Documentation  
**Version:** `2.0.0`  
**Status:** **ACTIVE & OPERATIONAL**  
**Document Ownership:** Platform Architecture Team, Product Delivery Lead, QA Lead  
**Last Verified Date:** 2026-11-05  
**Cross-References:** [Milestone 11.1 Readiness Audit](../demo/MILESTONE-11-1-READINESS-AUDIT.md), [ADR-0006](../adr/0006-docker-local-development-infrastructure.md), [ADR-0010](../adr/0010-backend-clean-architecture-layering.md), [ADR-0017](../adr/0017-password-infrastructure-argon2id.md), [ADR-0025](../adr/0025-role-and-permission-authorization-framework.md)

---

## 1. Document Purpose, Audience & Scope

### 1.1 Purpose

This manual is the authoritative operational guide for configuring, booting, demonstrating, and safely troubleshooting the **Kinergy Platform** MVP demonstration environment. It enables presenters, product managers, and evaluation engineers to conduct repeatable, deterministic client-facing demonstrations without code modifications or synthetic mocks.

### 1.2 Target Audience

- **Presenters & Solution Architects**: Conducting structured functional demonstrations of business flows.
- **QA & Evaluation Engineers**: Verifying end-to-end integration across domain boundaries.
- **Platform & DevOps Engineers**: Managing containerized infrastructure, migrations, and runtime safety.

### 1.3 Demonstration Scope

The MVP demonstration encompasses four fully realized, cross-integrated business domains:

1. **Client Identity & Ingress**: Registration, normalization, unique reference assignment (`CLI-YYYY-XXXXX`), trigram search, and audit timeline tracking.
2. **Gym & Membership Management**: Plan cataloging, agreement enrollment, date validity resolution, suspension/renewal, and attendance turnstile check-in with a 5-minute anti-passback cooldown.
3. **Clinical Kinesiology & Therapy**: 4D conflict-protected appointment booking (therapist, room, client, turnaround buffer), treatment session lifecycle, structured SOAP clinical charting, and medico-legal immutability locking upon completion.
4. **Consumable Inventory & Retail POS**: Multi-category catalog, unit-of-measure tracking, supplier stock receiving, append-only stock movement ledger, automated low-stock warnings, and payment-triggered stock decrementing.
5. **Commercial Sales, Payments & Fiscal Receipts**: Order composition, immutable item price snapshotting, promotional discount checks, multi-tender payments (`CASH`, `CARD`, `QR`, `TRANSFER`), split settlements, explicit QR settlement confirmation, and sequential fiscal receipt vouchers (`REC-YYYY-XXXXX`).

### 1.4 Exclusions & Non-Goals

The following operational capabilities are deliberately excluded from MVP demonstration scope:

- **Physical Hardware Integration**: USB barcode scanners, physical turnstile relays, and EMV chip-and-PIN payment terminals (simulated via software web UI).
- **Electronic Data Interchange (EDI)**: Automated supplier replenishment orders (manual invoice receiving is implemented).
- **Clinical SOAP Addenda**: In-place post-completion note mutation (prohibited for healthcare medico-legal compliance; addendum workflow is planned for Phase 12).
- **Multi-Tenant Self-Service Onboarding**: Dynamic tenant registration (single primary demonstration tenant `tenant-kinergy-main` is seeded).

---

## 2. System Architecture & Topology

The demonstration environment executes the real NestJS API and React 18 SPA, persisting directly to an authentic PostgreSQL relational engine. Mock in-memory backends and SQLite shims are strictly prohibited.

```
┌─────────────────────────────────────────┐          HTTP / REST (Port 3000)          ┌─────────────────────────────────────────┐
│        React 18 / Vite SPA Client       │ ────────────────────────────────────────► │             NestJS REST API             │
│               (Port 5173)               │                                           │               (Port 3000)               │
│    (Modules: Gym, Clinic, POS, Admin)   │ ◄──────────────────────────────────────── │         (Zod Validation, RBAC)          │
└─────────────────────────────────────────┘                                           └────────────────────┬────────────────────┘
                                                                                                           │
                                                                                            Prisma Client  │ (TCP 5433 / 5432)
                                                                                                           ▼
                                                                                      ┌─────────────────────────────────────────┐
                                                                                      │           PostgreSQL 16 / 18            │
                                                                                      │             (kinergy_dev)               │
                                                                                      │       (14 Relational Migrations)        │
                                                                                      └─────────────────────────────────────────┘
```

### Module Boundary Directory Mapping

- **API Runtime (`apps/api`)**: NestJS HTTP controllers, routing, guards, exception filters, OpenAPI Swagger documentation.
- **Web SPA (`apps/web`)**: React 18, React Router v6, TanStack Query, Radix UI primitives, TailwindCSS.
- **Core Domain Kernel (`packages/core`)**: Pure domain aggregates, Value Objects, repository ports, application use cases.
- **Client Bounded Context (`modules/client`)**: Hexagonal client profile, trigram search, timeline event projections.
- **UI Primitives (`packages/ui`)**: Shared accessible design system components.
- **Persistence (`prisma/`)**: Canonical schema, 14 migrations, deterministic seed orchestrator.

---

## 3. Supported Environment & Host Prerequisites

### 3.1 Software Baseline

| Component            | Minimum Version  | Recommended Version       | Verification Command     | Purpose                                        |
| :------------------- | :--------------- | :------------------------ | :----------------------- | :--------------------------------------------- |
| **Node.js**          | `v20.12.0+`      | `v24.12.0`                | `node -v`                | JavaScript runtime environment                 |
| **pnpm**             | `v10.0.0+`       | `v11.17.0`                | `pnpm -v`                | Monorepo package manager                       |
| **Docker Desktop**   | `v27.0.0+`       | `v29.0+` (Compose v2.30+) | `docker compose version` | Primary option: Containerized PostgreSQL       |
| **Local PostgreSQL** | `v16.0+`         | `v18.0+`                  | `psql --version`         | Fallback option: Native host PostgreSQL engine |
| **Web Browser**      | Recent Evergreen | Chrome 120+, Edge 120+    | Help $\to$ About         | HTML5, CSS Grid, LocalStorage support          |

---

## 4. Environment Configuration (`.env`)

The application validates all configuration on startup using Zod (`apps/api/src/config/env.validation.ts`). Missing or invalid configuration will immediately halt startup with descriptive diagnostics.

### 4.1 Configuration Initialization

Create the root `.env` file from the repository template if not already present:

```powershell
Copy-Item .env.example .env
```

### 4.2 Authoritative Demo Configuration Template

Verify that `c:\Projects\kinergy-platform\.env` contains the following active keys:

```ini
# ==============================================================================
# Kinergy Platform - Authoritative Demo Environment Configuration
# ==============================================================================

# 1. Server Execution Environment
NODE_ENV=development
PORT=3000
API_PREFIX=api/v1
SWAGGER_ENABLED=true

# 2. Database & Persistence Infrastructure
# Option A: Docker Compose container on port 5433 (Default & Recommended)
POSTGRES_USER=kinergy_user
POSTGRES_PASSWORD=kinergy_secure_pass
POSTGRES_DB=kinergy_dev
POSTGRES_PORT=5433
DATABASE_URL=postgresql://kinergy_user:kinergy_secure_pass@127.0.0.1:5433/kinergy_dev?schema=public

# Option B: Native Host PostgreSQL on port 5432 (Uncomment if Docker is unavailable)
# POSTGRES_PORT=5432
# DATABASE_URL=postgresql://postgres:postgres@localhost:5432/kinergy_dev?schema=public

# 3. Cryptographic Security Secrets (Minimum 32 characters)
JWT_ACCESS_SECRET=kinergy-platform-dev-access-secret-min-32-chars!
JWT_REFRESH_SECRET=kinergy-platform-dev-refresh-secret-min-32-chars!
JWT_ACCESS_EXPIRES_IN=15m
JWT_REFRESH_EXPIRES_IN=7d
JWT_ISSUER=kinergy-platform
JWT_AUDIENCE=kinergy-api

# 4. Web Security & CORS Configuration (CRITICAL FOR DEMO)
# Allows both Vite dev server (5173) and alternate ports (4200, 8080)
CORS_ORIGINS=http://localhost:5173,http://localhost:4200,http://localhost:8080
CORS_ALLOWED_METHODS=GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS
CORS_ALLOWED_HEADERS=Content-Type,Authorization,X-Requested-With,Accept,Origin,X-Tenant-ID
CORS_ALLOW_CREDENTIALS=true

# 5. Password Infrastructure Defaults
PASSWORD_MIN_LENGTH=12
ARGON2_MEMORY_COST=65536
ARGON2_TIME_COST=3

# 6. Object & Media Storage (Local Filesystem Simulation)
STORAGE_PROVIDER=local
STORAGE_LOCAL_ROOT=./.storage

# 7. Demo Seeding Customization (Optional overrides)
DEMO_USERS_PASSWORD=DemoPass123!
OWNER_PASSWORD=OwnerPassword123!
```

> [!IMPORTANT]
> **CORS Origin Requirement**: The backend API defaults `CORS_ORIGINS` to `http://localhost:4200` if omitted. Because the Vite development server serves the frontend on `http://localhost:5173`, `CORS_ORIGINS` **must** include `http://localhost:5173` to prevent browser CORS request blocking.

---

## 5. Database Preparation & Migration Pipeline

### 5.1 Starting the PostgreSQL Engine

#### Option A: Docker Compose (Recommended)

```powershell
pnpm docker:up
# Equivalent to: docker compose up -d postgres
```

Verify container health:

```powershell
docker ps --filter name=kinergy-postgres
```

#### Option B: Native Host Windows PostgreSQL Service

If Docker is unavailable, start the native Windows service from an elevated terminal:

```powershell
Start-Service postgresql-x64-18
```

Ensure the target database `kinergy_dev` exists with required extensions:

```sql
CREATE DATABASE kinergy_dev;
\c kinergy_dev
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
```

### 5.2 Schema Migration Deployment

Apply all **14 schema migrations** and synchronize the Prisma Client:

```powershell
# 1. Verify connection status
pnpm db:status

# 2. Deploy all 14 migrations deterministically
pnpm prisma:migrate:deploy

# 3. Generate latest Prisma Client types
pnpm prisma:generate
```

### 5.3 Deterministic Schema Migrations Inventory

The 14 migrations deployed to `kinergy_dev` are:

1. `20260729000000_init_base_tables`: Users, roles, permissions, clients, tokens.
2. `20260730000000_add_client_search_trgm_indexes`: PostgreSQL trigram extensions and indices.
3. `20260730000001_add_client_timeline_entries`: Append-only client activity timeline.
4. `20260815000000_add_room_and_maintenance_windows`: Schedulable rooms and blackout periods.
5. `20260826000000_add_resources_management`: Inventory items, stock movements, fixed assets.
6. `20260918000000_add_sales_and_payments_monetary_persistence`: Orders, items, tenders.
7. `20260921000000_add_payments_domain_persistence`: Payment domain aggregates and methods.
8. `20260924000000_add_receipts_and_sequence_persistence`: Fiscal vouchers and atomic sequences.
9. `20260930000000_add_sale_source_correlation_indexes`: Fast lookup indices across cross-domain sources.
10. `20261001000000_add_phase_7_monetary_check_constraints`: Non-negative math check constraints.
11. `20261001010000_add_discount_structural_check_constraints`: Discount integrity bounds.
12. `20261002000000_optimize_phase_7_financial_indexes`: High-throughput reporting indices.
13. `20261016000000_add_phase_7_concurrency_and_single_billing_indexes`: Concurrency locks.
14. `20261104000000_align_treatment_sessions_and_scheduling_schema`: Clinical session alignment.

---

## 6. Demo Account Provisioning & Deterministic Fixtures

Seed the database with deterministic baseline accounts, entities, and historical records:

```powershell
pnpm db:seed
# Equivalent to: prisma db seed (executes prisma/seed.ts)
```

### 6.1 Demonstration User Personas & Credentials

| Role / Persona                     | Email Address                     | Password            | Effective Granted Capabilities                                                                                      |
| :--------------------------------- | :-------------------------------- | :------------------ | :------------------------------------------------------------------------------------------------------------------ |
| **Platform Owner / Administrator** | `owner@kinergy.platform`          | `OwnerPassword123!` | Complete wildcard administrative access (`*`).                                                                      |
| **Front Desk Receptionist**        | `reception.demo@kinergy.platform` | `DemoPass123!`      | Client registration, gym plan enrollment, check-in, POS checkout, cash/QR payment settlement, receipts.             |
| **Clinical Therapist / Trainer**   | `therapist.demo@kinergy.platform` | `DemoPass123!`      | Assigned client lookup, treatment session execution, clinical SOAP documentation charting, medico-legal completion. |
| **Gym Movement Coach / Trainer**   | `trainer.demo@kinergy.platform`   | `DemoPass123!`      | Assigned member training oversight, movement supervision, check-in access verification, attendance tracking.        |
| **Operations / Inventory Staff**   | `inventory.demo@kinergy.platform` | `DemoPass123!`      | Inventory item management, stock receiving, supplier invoice tracking, inventory movement ledger inspection.        |

> [!WARNING]
> **Credential Accuracy**: The default password for all demo staff accounts is **`DemoPass123!`** (not `Demo123!`). Using incorrect credentials will result in `401 Unauthorized`.

### 6.2 Deterministic Seed Fixtures Reference

For complete catalog breakdown, entity relationship graphs, and reset procedures, see [docs/demo/demo-fixtures.md](../demo/demo-fixtures.md).

| Domain           | Entity Identifier      | Display Name / Description                        | Initial Seed State                                                                   |
| :--------------- | :--------------------- | :------------------------------------------------ | :----------------------------------------------------------------------------------- |
| **Clients**      | `CLI-2026-00001`       | **Jane Doe** (`jane.doe@example.com`)             | Has completed assessment with SOAP notes; upcoming scheduled appointment.            |
| **Clients**      | `CLI-2026-00002`       | **John Smith** (`john.smith@example.com`)         | Has active Gold Annual Membership; verified turnstile check-in record.               |
| **Clients**      | `CLI-2026-00003`       | **Carlos Rivera** (`carlos.rivera@example.com`)   | Registered intake profile ready for live enrollment, billing, and check-in.          |
| **Clients**      | `CLI-2026-00004`       | **Maria Gonzalez** (`maria.gonzalez@example.com`) | Has Silver Monthly Membership **frozen** on medical hold; scheduled therapy session. |
| **Clients**      | `CLI-2026-00005`       | **David Kim** (`david.kim@example.com`)           | Has **expired** membership; documented turnstile gate check-in denial.               |
| **Gym Plans**    | `MEM-GOLD-2026`        | Gold Annual Gym Membership                        | \$600.00 / 365 days; unlimited facility access.                                      |
| **Gym Plans**    | `MEM-SLV-MONTH`        | Silver Monthly Gym Membership                     | \$60.00 / 30 days; recurring facility access.                                        |
| **Gym Plans**    | `MEM-10-VISITS`        | 10-Visit Flexibility Pass                         | \$45.00 / 60 days; 10 check-in quota limit.                                          |
| **Rooms**        | `room-seed-kinesio-01` | Room 1 - Kinesiology Therapy Suite                | Therapy bed, ultrasound machine; available for booking.                              |
| **Rooms**        | `room-seed-consult-02` | Room 2 - Assessment & Consultation                | Consultation desk, goniometers; available for booking.                               |
| **Rooms**        | `studio-b-facility`    | Studio B - Movement Room                          | Mats, Pilates reformers, wall bars (Capacity: 20).                                   |
| **Inventory**    | `SKU-SNK-BAR-01`       | Organic Whey Protein Bar 60g                      | In Stock: 42 units (Min: 15) \| Selling Price: \$5.50                                |
| **Inventory**    | `SKU-DRK-ELEC-01`      | Electrolyte Hydration Drink 500ml                 | In Stock: 36 units (Min: 12) \| Selling Price: \$3.00                                |
| **Inventory**    | `SKU-CLIN-BAND-01`     | Kinesiology Tape Roll 5m                          | Low Stock: 3 units (Min: 10) \| **Triggers Low-Stock Alert**                         |
| **Inventory**    | `SKU-SUP-CREAT-01`     | Micronized Creatine Monohydrate 300g              | In Stock: 25 units (Min: 8) \| Selling Price: \$28.00                                |
| **Inventory**    | `SKU-RET-BOTTLE-01`    | Stainless Steel Insulated Shaker Bottle 750ml     | In Stock: 18 units (Min: 5) \| Selling Price: \$22.00                                |
| **Fixed Assets** | `AST-GYM-TRDM-01`      | Commercial Treadmill Pro Series 8                 | Condition: EXCELLENT \| Purchase Cost: \$3,500.00                                    |
| **Fixed Assets** | `AST-CLN-PLTH-02`      | Hi-Lo Electric Clinical Treatment Plinth          | Condition: EXCELLENT \| Purchase Cost: \$2,850.00                                    |

| Domain           | Entity Identifier      | Display Name / Description                        | Initial Seed State                                                                   |
| :--------------- | :--------------------- | :------------------------------------------------ | :----------------------------------------------------------------------------------- |
| **Clients**      | `CLI-2026-00001`       | **Jane Doe** (`jane.doe@example.com`)             | Has completed assessment with SOAP notes; upcoming scheduled appointment.            |
| **Clients**      | `CLI-2026-00002`       | **John Smith** (`john.smith@example.com`)         | Has active Gold Annual Membership; verified turnstile check-in record.               |
| **Clients**      | `CLI-2026-00003`       | **Carlos Rivera** (`carlos.rivera@example.com`)   | Registered intake profile ready for live enrollment, billing, and check-in.          |
| **Clients**      | `CLI-2026-00004`       | **Maria Gonzalez** (`maria.gonzalez@example.com`) | Has Silver Monthly Membership **frozen** on medical hold; scheduled therapy session. |
| **Clients**      | `CLI-2026-00005`       | **David Kim** (`david.kim@example.com`)           | Has **expired** membership; documented turnstile gate check-in denial.               |
| **Gym Plans**    | `MEM-GOLD-2026`        | Gold Annual Gym Membership                        | \$600.00 / 365 days; unlimited facility access.                                      |
| **Gym Plans**    | `MEM-SLV-MONTH`        | Silver Monthly Gym Membership                     | \$60.00 / 30 days; recurring facility access.                                        |
| **Gym Plans**    | `MEM-10-VISITS`        | 10-Visit Flexibility Pass                         | \$45.00 / 60 days; 10 check-in quota limit.                                          |
| **Rooms**        | `room-seed-kinesio-01` | Room 1 - Kinesiology Therapy Suite                | Therapy bed, ultrasound machine; available for booking.                              |
| **Rooms**        | `room-seed-consult-02` | Room 2 - Assessment & Consultation                | Consultation desk, goniometers; available for booking.                               |
| **Rooms**        | `studio-b-facility`    | Studio B - Movement Room                          | Mats, Pilates reformers, wall bars (Capacity: 20).                                   |
| **Inventory**    | `SKU-SNK-BAR-01`       | Organic Whey Protein Bar 60g                      | In Stock: 42 units (Min: 15) \| Selling Price: \$5.50                                |
| **Inventory**    | `SKU-DRK-ELEC-01`      | Electrolyte Hydration Drink 500ml                 | In Stock: 36 units (Min: 12) \| Selling Price: \$3.00                                |
| **Inventory**    | `SKU-CLIN-BAND-01`     | Kinesiology Tape Roll 5m                          | Low Stock: 3 units (Min: 10) \| **Triggers Low-Stock Alert**                         |
| **Inventory**    | `SKU-SUP-CREAT-01`     | Micronized Creatine Monohydrate 300g              | In Stock: 25 units (Min: 8) \| Selling Price: \$28.00                                |
| **Inventory**    | `SKU-RET-BOTTLE-01`    | Stainless Steel Insulated Shaker Bottle 750ml     | In Stock: 18 units (Min: 5) \| Selling Price: \$22.00                                |
| **Fixed Assets** | `AST-GYM-TRDM-01`      | Commercial Treadmill Pro Series 8                 | Condition: EXCELLENT \| Purchase Cost: \$3,500.00                                    |
| **Fixed Assets** | `AST-CLN-PLTH-02`      | Hi-Lo Electric Clinical Treatment Plinth          | Condition: EXCELLENT \| Purchase Cost: \$2,850.00                                    |

### 6.3 Safety Protections & Environment Guards

The fixture pipeline executes `assertSafeDemoEnvironment()`, which enforces:

1. Immediate termination if `NODE_ENV=production`.
2. Immediate termination if the database connection string contains `prod`, `production`, or `live-db`.
3. Secret masking in all log output (`:***@`).
4. Idempotent upsert semantics; re-running `pnpm db:seed` restores baseline state without creating duplicate records.

---

## 7. Application Startup & Operating Topologies

The demonstration environment supports two reproducible execution topologies:

### Option A: Hybrid Presenter Stack (Default & Fast Iteration)

In this mode, PostgreSQL executes in Docker on port 5433, while the API and Web apps run directly on Node.js.

```powershell
# 1. Start database container
pnpm docker:up

# 2. Terminal 1: Launch Backend REST API
pnpm dev:api
# Listening on: http://localhost:3000/api/v1 (Swagger: http://localhost:3000/api/docs)

# 3. Terminal 2: Launch Frontend Web SPA
pnpm dev:web
# Listening on: http://localhost:4200 (or http://localhost:5173)
```

### Option B: Dedicated Containerized Demo Stack (`docker-compose.demo.yml`)

For completely isolated presentations where zero host Node processes are desired, deploy the self-contained 3-tier container stack:

```powershell
# 1. Start full demo container orchestration (PostgreSQL 16, API, Web / Nginx)
pnpm demo:up
# Equivalent to: docker compose -f docker-compose.demo.yml up -d

# 2. Verify all 3 containers are healthy
docker compose -f docker-compose.demo.yml ps

# 3. Deploy migrations & baseline seed into container
pnpm prisma:migrate:deploy
pnpm db:seed
```

- **Web SPA & Nginx Ingress:** `http://localhost:8080` (Proxies `/api` to internal API container)
- **API Direct & Swagger:** `http://localhost:3000/api/docs`
- **Database Port:** `127.0.0.1:5433`

### 7.1 Health Probes & Runtime Verification

Execute these verification checks before starting a presentation:

```powershell
# 1. Probe Database Connectivity
& "C:\Program Files\PostgreSQL\18\bin\pg_isready.exe" -h 127.0.0.1 -p 5433

# 2. Probe API Health Endpoint
curl http://localhost:3000/api/v1/health
# Expected response: {"status":"ok","timestamp":"...","uptime":...}

# 3. Verify Swagger OpenAPI Specification
curl -I http://localhost:3000/api/docs
# Expected HTTP Status: 200 OK

# 4. Verify Frontend Routing (Port 8080 for Containerized, 4200/5173 for Dev)
curl -I http://localhost:8080/healthz   # Ingress probe (Containerized)
curl -I http://localhost:5173           # SPA direct (Dev)
# Expected HTTP Status: 200 OK
```

---

## 8. Business Walkthrough Scripts (Presenter Runbooks)

### 8.1 Journey 1: Gym Membership Enrollment, Payment & Turnstile Access

> [!NOTE]
> **Formal Acceptance**: Fully verified in [Milestone 11.5 Gym MVP Business Acceptance Report](../demo/MILESTONE-11-5-GYM-ACCEPTANCE.md) (**100% PASS** across 87 automated and UI scenarios).

- **Presenter Persona**: Front Desk Receptionist (`reception.demo@kinergy.platform` / `DemoPass123!`)
- **Target Subject**: Carlos Rivera (`CLI-2026-00003`)

#### Step-by-Step Walkthrough

1. **Sign In**: Navigate to `http://localhost:5173/login`. Enter receptionist credentials and submit.
2. **Member Selection**: Navigate to `/clients`. Locate Carlos Rivera (`CLI-2026-00003`) using the search bar (evaluated via trigram index in < 25ms).
3. **Plan Enrollment**:
   - Click **Enroll in Plan** or navigate to `/gym/memberships/new`.
   - Select **Silver Monthly Gym Membership** (\$60.00 / 30 days).
   - Confirm enrollment. Highlight that the membership status immediately updates to `ACTIVE`.
4. **Commercial POS Billing**:
   - Navigate to `/sales/new`.
   - Set source type to `GYM_MEMBERSHIP`, select the newly created membership, and verify that the line item snapshot locks at \$60.00.
   - Click **Create Order**. Order transitions to `PENDING_PAYMENT`.
5. **Cash Payment Tender**:
   - Click **Record Payment**. Select method `CASH`, input \$60.00, and confirm.
   - Verify that the order transitions to `PAID` with balance \$0.00.
6. **Fiscal Receipt Generation**:
   - Click **View Receipt**. Show the fiscal receipt voucher with sequential number (`REC-2026-00000X`).
7. **Turnstile Check-In**:
   - Navigate to `/gym/attendance`.
   - Search for Carlos Rivera and click **Check In**.
   - Show green indicator: `GRANTED — Access Permitted`.
8. **Anti-Passback Security Demonstration**:
   - Immediately click **Check In** again for Carlos Rivera.
   - Show yellow/red indicator: `DENIED — Rapid Duplicate Check-In Cooldown Active` (5-minute security cooldown).
9. **Negative Ingress Security Demonstrations**:
   - Search for **David Kim** (`CLI-2026-00005`) $\to$ Click **Check In** $\to$ Red indicator: `DENIED — Membership Expired on 2026-09-01`.
   - Search for **Maria Gonzalez** (`CLI-2026-00004`) $\to$ Click **Check In** $\to$ Blue/Yellow indicator: `DENIED — Membership Frozen (Medical Hold)`.

> [!NOTE]
> **Business Disclosure**: Attendance turnstiles operate on an **agreement-first** model, validating active membership status and date validity. Linking strict unpaid sales ledger balances to turnstile gate denial is configurable per business policy.

---

### 8.2 Journey 2: Clinical Kinesiology, 4D Scheduling & SOAP Charting

- **Presenter Personas**:
  - Receptionist (`reception.demo@kinergy.platform`) for booking & billing.
  - Clinical Therapist Dr. Sarah Chen (`therapist.demo@kinergy.platform`) for clinical documentation.
- **Target Subject**: Jane Doe (`CLI-2026-00001`), Room 1 (`room-seed-kinesio-01`)

#### Step-by-Step Walkthrough

1. **Appointment Booking (Receptionist)**:
   - Navigate to `/scheduling/calendar`.
   - Book a 60-minute **Kinesiology Assessment** for Jane Doe in Room 1 with therapist Dr. Sarah Chen.
   - Highlight that timestamps are stored in UTC while rendering in the facility's local time zone.
2. **4D Conflict Prevention Demonstration**:
   - Attempt to book a overlapping appointment for Room 1 or Dr. Sarah Chen at the identical time slot.
   - Verify that the scheduling engine rejects the collision with a clear conflict warning (`409 Conflict`).
3. **Clinical Encounter Start (Switch to Therapist)**:
   - Sign out and sign in as `therapist.demo@kinergy.platform` / `DemoPass123!`.
   - Navigate to `/kinesiology/sessions`.
   - Locate Jane Doe's scheduled encounter and click **Start Treatment Session**. Status transitions to `IN_PROGRESS`.
4. **SOAP Charting**:
   - In the clinical workspace, enter clinical notes:
     - **Subjective**: Patient reports persistent shoulder stiffness after overhead training; pain 3/10.
     - **Objective**: Range of motion restricted in abduction (140°); impingement test mildly positive.
     - **Assessment**: Subacromial irritation responding favorably to manual therapy.
     - **Plan**: Prescribed rotator cuff strengthening and scapular stabilization drills.
   - Click **Save Draft Notes**. Point out that drafts can be incrementally updated during the encounter.
5. **Medico-Legal Immutability Locking**:
   - Click **Complete Session**.
   - Note the status transition to `COMPLETED` with a locked badge.
   - Point out that the clinical notes are now permanently read-only and cannot be tampered with.
6. **Commercial Checkout (Switch to Receptionist)**:
   - Switch back to `reception.demo@kinergy.platform`.
   - Navigate to `/sales/new`, source the completed session, bill \$120.00, and complete payment.

---

### 8.3 Journey 3: Consumable Inventory, Receiving & Retail POS

- **Presenter Personas**:
  - Inventory Staff (`inventory.demo@kinergy.platform`) for replenishment.
  - Cashier (`reception.demo@kinergy.platform`) for retail checkout.

#### Step-by-Step Walkthrough

1. **Low-Stock Cockpit (Inventory Staff)**:
   - Sign in as `inventory.demo@kinergy.platform` / `DemoPass123!`.
   - Navigate to `/resources/inventory/low-stock`.
   - Highlight that **Kinesiology Tape Roll 5m** is flagged with a low-stock alert (3 rolls on hand vs. 10 minimum).
2. **Stock Receiving (Replenishment)**:
   - Navigate to `/resources/inventory` and select **Kinesiology Tape Roll**.
   - Click **Receive Stock**. Add 15 rolls, enter supplier invoice `INV-2026-991`, and submit.
   - Verify that quantity on hand updates to 18 rolls and that the low-stock alert clears immediately.
3. **Movement Ledger Audit**:
   - Click the **Movements** tab on the item detail page.
   - Point out the immutable `PURCHASE` movement entry (+15 rolls) with timestamp and user audit trail.
4. **Retail POS Checkout (Cashier)**:
   - Switch to `reception.demo@kinergy.platform`.
   - Navigate to `/sales/new`.
   - Add retail items: 2 bottles of **Electrolyte Hydration Drink** (\$3.00 each = \$6.00).
   - Click **Create Order**. Order enters `PENDING_PAYMENT`.
5. **Payment-Triggered Stock Decrement**:
   - Settle payment via `CASH`.
   - Return to `/resources/inventory` and inspect the Electrolyte Drink item.
   - Verify that stock on hand has automatically decremented from 36 to 34 bottles, and verify the corresponding `SALE` record in the movement ledger.

---

### 8.4 Journey 4: Commercial Sales, QR Payment Settlement & Receipts

- **Presenter Persona**: Receptionist / Cashier (`reception.demo@kinergy.platform`)

#### Step-by-Step Walkthrough

1. **Create Commercial Sale**:
   - Navigate to `/sales/new`. Add 1 **Organic Whey Protein Bar** (\$5.50).
   - Create order in `PENDING_PAYMENT` status.
2. **Initiate QR Tender**:
   - Click **Record Payment**. Select method `QR`, enter \$5.50, and input customer reference `QR-REF-8841`.
   - Submit payment.
3. **Verify Pending Status (Financial Safety Rule)**:
   - Notice that the payment is recorded with status **`PENDING`** (not `COMPLETED`).
   - The sale remains in `PENDING_PAYMENT`.
4. **Confirm External Funds & Settle Payment**:
   - Click on the pending payment ID to navigate to `/payments/:id`.
   - Click **Settle Payment**.
   - The `SettlePaymentDialog` displays an authoritative financial breakdown.
   - Enter bank confirmation code `BANK-TXN-90210` and click **Confirm Settlement**.
   - The payment transitions to `COMPLETED` with an authoritative `paidAt` timestamp.
   - The sale transitions to `PAID`.
5. **Issue Tax Receipt**:
   - Click **View Receipt**. Print or inspect the official fiscal voucher.

---

## 9. Financial & Payment Integrity Rules

1. **Integer Cents Precision**: All monetary values are processed internally in integer cents to prevent floating-point rounding errors.
2. **Price Snapshotting**: When an item is added to an order, its unit price is frozen in `SaleItem`. Future price catalog changes never affect existing orders.
3. **Discount Bounds**: Discounts cannot exceed 100% of line item subtotal or create negative order totals.
4. **Payment State Machine**:
   - `CASH` tenders can be settled immediately at the register.
   - `QR` and `TRANSFER` tenders are created in `PENDING` status and require explicit settlement confirmation via the API endpoint `POST /api/v1/payments/:id/complete`.
5. **Receipt Immutability**: Receipts are strictly generated only for sales with settled payments and receive a gapless sequence number (`REC-YYYY-XXXXX`).

---

## 10. Security & Tenant Boundary Considerations

1. **Password Hashing**: Passwords in the live application are hashed using Argon2id (64MB memory, 3 iterations).
2. **JWT Token Policy**: Access tokens expire in 15 minutes; refresh tokens expire in 7 days and use cryptographic hash storage with replay detection.
3. **Role-Based Access Control**:
   - `Owner`: Wildcard access (`*`).
   - `Receptionist`: Client ingress, gym plans, attendance, sales orders, payment settlement, receipts.
   - `Trainer`: Client lookup, scheduling, treatment sessions, SOAP notes.
   - `Kitchen Staff` / `Inventory Staff`: Inventory items, stock receiving, retail sales.
4. **Tenant Isolation**: All database queries enforce tenant scoping (`tenantId = 'tenant-kinergy-main'`).

---

## 11. Presenter Troubleshooting & Incident Recovery

```
                                  INCIDENT DETECTED DURING DEMO
                                                │
               ┌────────────────────────────────┼────────────────────────────────┐
               ▼                                ▼                                ▼
      [PostgreSQL Offline]             [Port Collision / API Crash]     [Authentication Failure]
               │                                │                                │
      docker compose up -d postgres    Stop conflicting process          Verify .env credentials
               │                                │                                │
      Check port 5433 (pg_isready)     Restart: pnpm dev:api             Use: DemoPass123!
               │                                │                                │
               └────────────────────────┬───────┴────────────────────────────────┘
                                        ▼
                                 [RESUME RUNBOOK]
```

### Incident 1: Database Unavailable (`PrismaClientInitializationError`)

- **Symptom**: API logs show `Can't reach database server at 127.0.0.1:5433`.
- **Resolution**:
  ```powershell
  docker compose up -d postgres
  & "C:\Program Files\PostgreSQL\18\bin\pg_isready.exe" -h 127.0.0.1 -p 5433
  ```

### Incident 2: Port Collision on Port 3000 or 5173 (`EADDRINUSE`)

- **Symptom**: `pnpm dev:api` or `pnpm dev:web` fails with address already in use.
- **Resolution**:
  ```powershell
  # Kill process on port 3000 (API)
  Get-Process -Id (Get-NetTCPConnection -LocalPort 3000).OwningProcess -ErrorAction SilentlyContinue | Stop-Process -Force

  # Kill process on port 5173 (Web)
  Get-Process -Id (Get-NetTCPConnection -LocalPort 5173).OwningProcess -ErrorAction SilentlyContinue | Stop-Process -Force
  ```

### Incident 3: CORS Request Blocked in Browser

- **Symptom**: Browser console logs `Access to XMLHttpRequest has been blocked by CORS policy`.
- **Resolution**: Ensure `.env` contains `CORS_ORIGINS=http://localhost:5173,http://localhost:4200` and restart the backend API.

### Incident 4: Authentication Rejected (`401 Unauthorized`)

- **Symptom**: Login rejected with demo credentials.
- **Resolution**: Re-apply the deterministic identity seed:
  ```powershell
  pnpm db:seed
  ```
  Sign in with verified credentials: `reception.demo@kinergy.platform` / `DemoPass123!`.

### Incident 5: Live Rehearsal State Reset (Clean Baseline Restoration)

To restore the demo environment to its baseline state non-destructively:

```powershell
# Re-run idempotent seed pipeline (restores base clients, plans, items)
pnpm db:seed
```

If a complete database wipe is required for dedicated demo container:

```powershell
docker compose down -v
docker compose up -d postgres
pnpm prisma:migrate:deploy
pnpm db:seed
```

---

## 12. Safe Shutdown & Reset Instructions

### Normal Session Termination

#### Mode A: Hybrid Dev Stack

1. **Frontend Web App**: Press `Ctrl + C` in Terminal 2.
2. **Backend API**: Press `Ctrl + C` in Terminal 1.
3. **PostgreSQL Container**:
   ```powershell
   pnpm docker:down
   # Preserves container volume data
   ```

#### Mode B: Dedicated Containerized Demo Stack

```powershell
pnpm demo:down
# Equivalent to: docker compose -f docker-compose.demo.yml down
# Safely sends SIGTERM and preserves demo volumes
```

### Clean Rehearsal Reset (Disposable Volume Wipe)

When an evaluation session requires a clean slate:

```powershell
pnpm demo:reset
# Equivalent to: docker compose -f docker-compose.demo.yml down -v
pnpm demo:up
pnpm prisma:migrate:deploy
pnpm db:seed
```

---

## 13. Pre-Flight Demonstration Readiness Checklist

Verify all items before commencing a client demonstration:

| Check | Item                             | Verification Method                                                        |     Status      |
| :---: | :------------------------------- | :------------------------------------------------------------------------- | :-------------: |
|  [ ]  | **Host Node & pnpm**             | `node -v` ($\ge 20$), `pnpm -v` ($\ge 10$)                                 |    Verified     |
|  [ ]  | **PostgreSQL Engine Running**    | `pg_isready -h 127.0.0.1 -p 5433` reports accepting connections            | Pending Startup |
|  [ ]  | **CORS Configuration Verified**  | `.env` includes `CORS_ORIGINS=http://localhost:5173,http://localhost:4200` |    Required     |
|  [ ]  | **Migrations Applied**           | `pnpm prisma:migrate:status` reports all 14 migrations applied             |    Required     |
|  [ ]  | **Baseline Seed Data Present**   | `pnpm db:seed` completed successfully                                      |    Required     |
|  [ ]  | **API Healthy**                  | `http://localhost:3000/api/v1/health` returns `{"status":"ok"}`            |    Required     |
|  [ ]  | **Swagger Docs Accessible**      | `http://localhost:3000/api/docs` renders OpenAPI spec                      |    Required     |
|  [ ]  | **Web Client Accessible**        | `http://localhost:5173` renders login screen                               |    Required     |
|  [ ]  | **Presenter Credentials Tested** | Login verified with `reception.demo@kinergy.platform` / `DemoPass123!`     |    Required     |

---

## 14. Known Limitations & Next Planned Milestones

| Domain / Area               | Current MVP Demonstration Behavior                                           | Planned Production Enhancement                                                 | Milestone    |
| :-------------------------- | :--------------------------------------------------------------------------- | :----------------------------------------------------------------------------- | :----------- |
| **Turnstile Gating**        | Agreement-first: allows check-in based on active membership validity window. | Commercial payment balance gating (blocks check-in if overdue balance exists). | Milestone 12 |
| **Clinical Records**        | Completed SOAP notes are permanently locked and read-only.                   | Formal healthcare clinical addendum authoring workflow.                        | Milestone 12 |
| **Inventory Replenishment** | Manual item receiving with purchase invoice reference logging.               | Electronic Data Interchange (EDI) and automated vendor purchase orders.        | Milestone 13 |
| **Hardware Devices**        | Software turnstile and POS entry via responsive web interface.               | USB barcode scanner driver and physical turnstile relay integration.           | Milestone 13 |
| **Payment Terminals**       | Software payment simulation for Cash, Card, QR, Transfer.                    | Direct EMV smart-card terminal pre-authorization and capture integration.      | Milestone 13 |

---

_Document Author: Platform Architecture Team_  
_Approved by: Product Delivery Lead, QA Lead_  
_Last Verified: 2026-11-05 against commit ef580d1_
