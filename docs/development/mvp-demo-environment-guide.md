# Kinergy Platform — MVP Demonstration Environment Guide & Presenter Manual

**Document ID:** `DOC-ENV-011`  
**Milestone:** 11.2 — Professional MVP Demo Documentation  
**Version:** `2.0.0`  
**Status:** **ACTIVE & OPERATIONAL**  
**Document Ownership:** Platform Architecture Team, Product Delivery Lead, QA Lead  
**Last Verified Date:** 2026-11-05  
**Cross-References:** [Milestone 11.8 Final Demo Readiness Certification](../demo/MILESTONE-11-8-FINAL-DEMO-ACCEPTANCE.md), [Milestone 11.1 Readiness Audit](../demo/MILESTONE-11-1-READINESS-AUDIT.md), [ADR-0006](../adr/0006-docker-local-development-infrastructure.md), [ADR-0010](../adr/0010-backend-clean-architecture-layering.md), [ADR-0017](../adr/0017-password-infrastructure-argon2id.md), [ADR-0025](../adr/0025-role-and-permission-authorization-framework.md)

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
5. **Commercial Sales, Payments & Receipt Vouchers**: Order composition, immutable item price snapshotting, promotional discount checks, multi-tender payments (`CASH`, `CARD`, `QR`, `TRANSFER`), split settlements, explicit QR settlement confirmation, and sequential commercial receipt vouchers (`REC-YYYY-XXXXX`).

### 1.4 Exclusions & Non-Goals

The following operational capabilities are deliberately excluded from MVP demonstration scope:

- **Physical Hardware Integration**: USB barcode scanners, physical turnstile relays, and EMV chip-and-PIN payment terminals (simulated via software web UI).
- **Electronic Data Interchange (EDI)**: Automated supplier replenishment orders (manual invoice receiving is implemented).
- **Government Tax Authority Integration (Fiscal Invoicing)**: External tax authority electronic digital signatures and fiscal clearance (e.g. Bolivian SIN CUF) are not integrated in this MVP; the system issues internal commercial sequential receipt vouchers (`REC-YYYY-XXXXX`) as proof of payment.
- **Clinical SOAP Addenda**: In-place post-completion note mutation (prohibited for healthcare medico-legal compliance; addendum workflow is planned for Phase 12).
- **Multi-Tenant Self-Service Onboarding**: Dynamic tenant registration (single primary demonstration tenant `tenant-kinergy-main` is seeded).

---

## 2. System Architecture & Topology

The demonstration environment executes the real NestJS API and React 18 SPA, persisting directly to an authentic PostgreSQL relational engine. Mock in-memory backends and SQLite shims are strictly prohibited.

```
┌─────────────────────────────────────────┐          HTTP / REST (Port 3000)          ┌─────────────────────────────────────────┐
│        React 18 / Vite SPA Client       │ ────────────────────────────────────────► │             NestJS REST API             │
│    (Port 8080 Demo / Port 5173 Dev)     │                                           │               (Port 3000)               │
│    (Modules: Gym, Clinic, POS, Admin)   │ ◄──────────────────────────────────────── │         (Zod Validation, RBAC)          │
└─────────────────────────────────────────┘                                           └────────────────────┬────────────────────┘
                                                                                                           │
                                                                                            Prisma Client  │ (TCP 5433 / 5432)
                                                                                                           ▼
                                                                                      ┌─────────────────────────────────────────┐
                                                                                      │           PostgreSQL 16 / 18            │
                                                                                      │             (kinergy_dev)               │
                                                                                      │       (16 Relational Migrations)        │
                                                                                      └─────────────────────────────────────────┘
```

### Module Boundary Directory Mapping

- **API Runtime (`apps/api`)**: NestJS HTTP controllers, routing, guards, exception filters, OpenAPI Swagger documentation.
- **Web SPA (`apps/web`)**: React 18, React Router v6, TanStack Query, Radix UI primitives, TailwindCSS.
- **Core Domain Kernel (`packages/core`)**: Pure domain aggregates, Value Objects, repository ports, application use cases.
- **Client Bounded Context (`modules/client`)**: Hexagonal client profile, trigram search, timeline event projections.
- **UI Primitives (`packages/ui`)**: Shared accessible design system components.
- **Persistence (`prisma/`)**: Canonical schema, 16 migrations, deterministic seed orchestrator.

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

Apply all **16 schema migrations** and synchronize the Prisma Client:

```powershell
# 1. Verify connection status
pnpm db:status

# 2. Deploy all 16 migrations deterministically
pnpm prisma:migrate:deploy

# 3. Generate latest Prisma Client types
pnpm prisma:generate
```

### 5.3 Deterministic Schema Migrations Inventory

The 16 migrations deployed to `kinergy_dev` are:

1. `20260729000000_init_base_tables`: Users, roles, permissions, clients, tokens.
2. `20260730000000_add_client_search_trgm_indexes`: PostgreSQL trigram extensions and indices.
3. `20260730000001_add_client_timeline_entries`: Append-only client activity timeline.
4. `20260815000000_add_room_and_maintenance_windows`: Schedulable rooms and blackout periods.
5. `20260826000000_add_resources_management`: Inventory items, stock movements, fixed assets.
6. `20260918000000_add_sales_and_payments_monetary_persistence`: Orders, items, tenders.
7. `20260921000000_add_payments_domain_persistence`: Payment domain aggregates and methods.
8. `20260924000000_add_receipts_and_sequence_persistence`: Commercial receipt vouchers and atomic sequences.
9. `20260930000000_add_sale_source_correlation_indexes`: Fast lookup indices across cross-domain sources.
10. `20261001000000_add_phase_7_monetary_check_constraints`: Non-negative math check constraints.
11. `20261001010000_add_discount_structural_check_constraints`: Discount integrity bounds.
12. `20261002000000_optimize_phase_7_financial_indexes`: High-throughput reporting indices.
13. `20261016000000_add_phase_7_concurrency_and_single_billing_indexes`: Concurrency locks.
14. `20261104000000_align_treatment_sessions_and_scheduling_schema`: Clinical session alignment.
15. `20261110010000_align_trainer_receptionist_permissions`: Operational scheduling RBAC parity for Receptionist and Trainer roles.
16. `20261110020000_normalize_room_feature_tags`: Normalized lowercase room feature tags for deterministic containment queries.

---

## 6. Demo Account Provisioning & Deterministic Fixtures

Seed the database with deterministic baseline accounts, entities, and historical records:

```powershell
pnpm db:seed
# Equivalent to: prisma db seed (executes prisma/seed.ts)
```

### 6.1 Demonstration User Personas & Credentials

| Role / Persona                     | Email Address                     | Password            | Effective Granted Capabilities                                                                                                                                                                                                                                                                    |
| :--------------------------------- | :-------------------------------- | :------------------ | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Platform Owner / Administrator** | `owner@kinergy.platform`          | `OwnerPassword123!` | Complete wildcard administrative access (`*`).                                                                                                                                                                                                                                                    |
| **Front Desk Receptionist**        | `reception.demo@kinergy.platform` | `DemoPass123!`      | Client registration, gym plan enrollment, check-in, POS checkout, cash/QR payment settlement, receipts.                                                                                                                                                                                           |
| **Clinical Therapist / Trainer**   | `therapist.demo@kinergy.platform` | `DemoPass123!`      | Assigned client lookup, treatment session execution, clinical SOAP documentation charting, medico-legal completion.                                                                                                                                                                               |
| **Gym Movement Coach / Trainer**   | `trainer.demo@kinergy.platform`   | `DemoPass123!`      | Full operational front-desk & gym access equivalent to Receptionist (client registration & search, kinesiology/treatment scheduling, POS food/drinks/membership sales, cash/QR payment processing, receipt issuance/retrieval, gym check-in) plus assigned movement coaching & reports oversight. |
| **Operations / Inventory Staff**   | `inventory.demo@kinergy.platform` | `DemoPass123!`      | Inventory item management, stock receiving, supplier invoice tracking, inventory movement ledger inspection.                                                                                                                                                                                      |

> [!WARNING]
> **Credential Accuracy**: The default password for all demo staff accounts is **`DemoPass123!`** (not `Demo123!`). Using incorrect credentials will result in `401 Unauthorized`.

### 6.2 Deterministic Seed Fixtures Reference

For complete catalog breakdown, entity relationship graphs, and reset procedures, see [docs/demo/demo-fixtures.md](../demo/demo-fixtures.md).

| Domain        | Entity Identifier | Display Name / Description                        | Initial Seed State                                                                   |
| :------------ | :---------------- | :------------------------------------------------ | :----------------------------------------------------------------------------------- |
| **Clients**   | `CLI-2026-00001`  | **Jane Doe** (`jane.doe@example.com`)             | Has completed assessment with SOAP notes; upcoming scheduled appointment.            |
| **Clients**   | `CLI-2026-00002`  | **John Smith** (`john.smith@example.com`)         | Has active Gold Annual Membership; verified turnstile check-in record.               |
| **Clients**   | `CLI-2026-00003`  | **Carlos Rivera** (`carlos.rivera@example.com`)   | Registered intake profile ready for live enrollment, billing, and check-in.          |
| **Clients**   | `CLI-2026-00004`  | **Maria Gonzalez** (`maria.gonzalez@example.com`) | Has Silver Monthly Membership **frozen** on medical hold; scheduled therapy session. |
| **Clients**   | `CLI-2026-00005`  | **David Kim** (`david.kim@example.com`)           | Has **expired** membership; documented turnstile gate check-in denial.               |
| **Gym Plans** | `MEM-GOLD-2026`   | Gold Annual Gym Membership                        | \$600.00 / 365 days; unlimited facility access.                                      |
| **Gym Plans** | `MEM-SLV-MONTH`   | Silver Monthly Gym Membership                     | \$60.00 / 30 days; recurring facility access.                                        |
| **Gym Plans** | `MEM-10-VISITS`   | 10-Visit Flexibility Pass                         | \$45.00 / 60 days; 10 check-in quota limit.                                          |

---

### 6.3 Operational Alignment: Trainer & Receptionist Equivalence (Milestone 11.9 / ADR-0145)

In small boutique facilities like Kynergy, trainers frequently cover front-desk and reception operational responsibilities. Under this operational model:

$$\text{RECEPTIONIST operational permissions} \subseteq \text{TRAINER operational permissions}$$
$$\text{TRAINER operational permissions} = \text{RECEPTIONIST operational permissions} \cup \{\text{reports.read}\}$$

#### Shared Operational Permissions (17 Permissions)

Both `Trainer` and `Receptionist` possess full operational authorization for:

1. **Clients**: `clients.read`, `clients.write` (registration, search, profile updates).
2. **Scheduling**: `appointments.read`, `appointments.create`, `appointments.update`, `appointments.delete` (agenda inspection across daily/weekly/monthly views, kinesiology and clinical session bookings).
3. **Sales & POS**: `sales.read`, `sales.create`, `sales.cancel` (cart management, consumable catalog checkout for food and drinks, gym membership sales).
4. **Billing & Catalog**: `billing.read`, `billing.write`, `inventory.read` (consumables catalog inspection).
5. **Payments**: `payments.read`, `payments.create`, `payments.manage` (cash tenders, customer QR capture, settlement reconciliation).
6. **Receipts**: `receipts.read`, `receipts.manage` (issuance of official legal proof-of-purchase vouchers, reprint management).

#### Preserved Trainer-Specific Capabilities

- `reports.read`: Movement coaching metrics, session completion verification, attendance utilization summaries.
- **Shared Facility Operational Client Directory**: View and filter all clients within the trainer's authorized facility on the Trainer Dashboard (to support drop-ins and multi-trainer floor shifts).

#### Strictly Preserved Administrative Boundaries

Neither `Trainer` nor `Receptionist` receive administrative access:

- **No User/Role Administration**: `users.*`, `identity.roles.*`, `identity.permissions.*` remain strictly restricted to `Owner` / `Manager`.
- **No System Configuration**: `settings.*` remains strictly restricted to administrators.
- **No Discretionary Overrides**: `sales.manage` (arbitrary price overrides and unconstrained discounts) remains restricted.
- **No Inventory Stock Adjustment**: `inventory.write` remains restricted to Operations / Inventory staff.
- **No Permanent Client Deletion**: `clients.delete` remains restricted.

#### How Existing Accounts Receive Updated Permissions

1. **Database Migration**: Idempotent, non-destructive migration `20261110000000_align_trainer_receptionist_permissions` inserts missing `role_permissions` rows with `ON CONFLICT DO NOTHING`, preserving all existing user accounts, passwords, and custom role assignments.
2. **Token Refresh / Login**: The runtime `PrismaUserRepository` dynamically loads active role permissions from PostgreSQL upon login. Authenticated users generate fresh JWT tokens reflecting the full 18 permissions immediately without requiring account re-seeding or destructive resets.

#### Demo Verification Steps

To verify operational equivalence in the Docker demo environment (`http://localhost:8080`):

1. Navigate to `http://localhost:8080` and log in with `trainer.demo@kinergy.platform` / `DemoPass123!`.
2. Verify access to navigation items: **Clients**, **Calendar / Appointments**, **Point of Sale (POS)**, **Sales History**, and **Gym Attendance**.
3. Create a client, schedule a kinesiology treatment session, sell a food/drink item via POS with cash tender, issue the receipt, and perform an attendance check-in. All operational flows execute with zero 403 Forbidden errors.

---

### 6.4 Inventory Operator Persona & Operational Permissions (Prompt 84315)

The Inventory Operator persona (`inventory.demo@kinergy.platform`) is provisioned to manage day-to-day consumable inventory and stock movements across the platform.

```
inventory.demo@kinergy.platform (Password: DemoPass123!)
Role: Kitchen Staff
```

#### Granted Operational Capabilities

The role possesses the following authoritative permissions:

- `inventory.read`: Full access to the consumable catalog, stock levels, low-stock cockpit, and movement audit logs.
- `inventory.write`: Full capability to execute stock receiving (replenishment), stock adjustments (count reconciliation), scrapping (damage/spoilage disposal), clinical session consumption, and POS sales decrements, as well as catalog product creation and metadata updates.
- `kitchen.read`, `kitchen.orders.manage`: Preparation queue and kitchen order tracking.
- `sales.read`, `sales.create`: Retail product ordering and sales creation.
- `payments.create`: POS payment processing.
- `receipts.read`: Sale receipt generation and viewing.

#### Strictly Enforced Security & Least-Privilege Boundaries

Following Kinergy's fail-closed security architecture, the inventory operator is strictly barred from non-inventory administrative capabilities:

- **No Inventory Valuation Reports**: `GET /api/v1/resources/inventory/valuation` strictly requires `billing.read` in addition to `inventory.read`. Requests from the inventory operator are denied with `403 Forbidden`.
- **No Catalog Archival / Activation / Deactivation**: `POST /api/v1/resources/inventory/:id/(archive|activate|deactivate)` are restricted to `ADMIN`, `SUPER_ADMIN`, and `OWNER`.
- **No Identity / User Administration**: `users.*`, `identity.*` remain restricted to administrators.
- **No System Settings Configuration**: `settings.*` remains restricted.

#### Architectural Fix: Separator & Case Invariant Role Matching

Prisma seeds assign human-readable role names in title case (e.g. `'Kitchen Staff'`), while controller decorators may declare roles in uppercase snake case (e.g. `@Roles('KITCHEN_STAFF')`).

Both runtime layers normalize role comparisons:

- **API Runtime (`AuthenticatedUserContext.hasRole`)**: Normalizes whitespace and hyphens to underscores (`r.toUpperCase().replace(/[\s-]+/g, '_')`), ensuring `'Kitchen Staff'` seamlessly matches `'KITCHEN_STAFF'`.
- **Frontend Matcher (`matchRole`)**: Normalizes whitespace and hyphens to underscores (`r.trim().toLowerCase().replace(/[\s-]+/g, '_')`), ensuring seamless client-side gating.

#### Verification Procedure

1. Sign in as `inventory.demo@kinergy.platform` / `DemoPass123!`.
2. Navigate to `/resources/inventory` and `/resources/inventory/low-stock`.
3. Verify catalog list and low-stock cockpit load without HTTP 403 errors.
4. Execute stock receiving, adjustment, or scrapping on any catalog item.
5. Attempting to access valuation reports yields `403 Forbidden`.
   | **Rooms** | `room-seed-kinesio-01` | Room 1 - Kinesiology Therapy Suite | Therapy bed, ultrasound machine; available for booking. |
   | **Rooms** | `room-seed-consult-02` | Room 2 - Assessment & Consultation | Consultation desk, goniometers; available for booking. |
   | **Rooms** | `studio-b-facility` | Studio B - Movement Room | Mats, Pilates reformers, wall bars (Capacity: 20). |
   | **Inventory** | `SKU-SNK-BAR-01` | Organic Whey Protein Bar 60g | In Stock: 42 units (Min: 15) \| Selling Price: \$5.50 |
   | **Inventory** | `SKU-DRK-ELEC-01` | Electrolyte Hydration Drink 500ml | In Stock: 36 units (Min: 12) \| Selling Price: \$3.00 |
   | **Inventory** | `SKU-CLIN-BAND-01` | Kinesiology Tape Roll 5m | Low Stock: 3 units (Min: 10) \| **Triggers Low-Stock Alert** |
   | **Inventory** | `SKU-SUP-CREAT-01` | Micronized Creatine Monohydrate 300g | In Stock: 25 units (Min: 8) \| Selling Price: \$28.00 |
   | **Inventory** | `SKU-RET-BOTTLE-01` | Stainless Steel Insulated Shaker Bottle 750ml | In Stock: 18 units (Min: 5) \| Selling Price: \$22.00 |
   | **Fixed Assets** | `AST-GYM-TRDM-01` | Commercial Treadmill Pro Series 8 | Condition: EXCELLENT \| Purchase Cost: \$3,500.00 |
   | **Fixed Assets** | `AST-CLN-PLTH-02` | Hi-Lo Electric Clinical Treatment Plinth | Condition: EXCELLENT \| Purchase Cost: \$2,850.00 |

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

#### Network Architecture & Service Discovery

The demo environment provisions an isolated Docker bridge network (`kinergy_demo_network`) with deterministic startup dependencies:

- **Service Discovery & Network Aliases:** `demo-api` declares a network alias `api` on `kinergy-demo-network`. This enables the unprivileged Nginx ingress (`demo-web`) to resolve the upstream `http://api:3000` via Docker's embedded DNS (`127.0.0.11`) without modifying environment-invariant Nginx production configurations.
- **Startup Readiness Chain:** Containers follow strict healthcheck dependencies:
  1. `demo-postgres`: Runs PostgreSQL 16 Alpine with `pg_isready` healthcheck (5s interval).
  2. `demo-api`: Waits for `demo-postgres` (`condition: service_healthy`) and reports healthy via internal HTTP probe (`/api/v1/health`).
  3. `demo-web`: Waits for `demo-api` (`condition: service_healthy`) before launching Nginx to guarantee upstream DNS and TCP availability at startup.

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

# 4. Verify Frontend Routing (Port 8080 for Containerized Option B, 5173 for Dev Option A)
curl -I http://localhost:8080/healthz   # Ingress probe (Containerized Option B)
curl -I http://localhost:8080/login     # Web SPA Entrypoint (Containerized Option B)
curl -I http://localhost:5173           # SPA direct (Dev Option A)
# Expected HTTP Status: 200 OK
```

---

## 8. Business Walkthrough Scripts (Presenter Runbooks)

> [!IMPORTANT]
> **Authoritative Deployment Mode & Frontend URL Notice**:
>
> - **Option B: Dedicated Containerized Demo (`pnpm demo:up` — Default & Recommended)**:
>   - **Frontend Web SPA & Ingress:** **`http://localhost:8080/login`** (or `http://localhost:8080`). All client browser navigation for this option **must** target port **`8080`**.
>   - **Direct Backend API / Docs:** `http://localhost:3000` (Swagger: `http://localhost:3000/api/docs`).
>   - **Relational Database:** `127.0.0.1:5433`.
> - **Option A: Hybrid Local Development Stack (`pnpm dev:api` + `pnpm dev:web`)**:
>   - **Frontend Web SPA:** **`http://localhost:5173/login`** (or `http://localhost:4200`). Port 5173 is active **only** when running the Vite dev server on the host machine.
>   - **Backend API:** `http://localhost:3000/api/v1`.
>   - **Database:** `127.0.0.1:5433` (Docker container).

### 8.1 Journey 1: Gym Membership Enrollment, Payment & Turnstile Access

> [!NOTE]
> **Formal Acceptance**: Fully verified in [Milestone 11.5 Gym MVP Business Acceptance Report](../demo/MILESTONE-11-5-GYM-ACCEPTANCE.md) (**100% PASS** across 87 automated and UI scenarios).

- **Presenter Persona**: Front Desk Receptionist (`reception.demo@kinergy.platform` / `DemoPass123!`)
- **Target Subject**: Carlos Rivera (`CLI-2026-00003`)

#### Step-by-Step Walkthrough

1. **Sign In**:
   - **Option B (Containerized Demo)**: Navigate to `http://localhost:8080/login` (or `http://localhost:8080`).
   - **Option A (Local Dev Stack)**: Navigate to `http://localhost:5173/login`.
     Enter receptionist credentials (`reception.demo@kinergy.platform` / `DemoPass123!`) and submit.
2. **Member Selection**: Navigate to `/clients` (`http://localhost:8080/clients` in Option B / `http://localhost:5173/clients` in Option A). Locate Carlos Rivera (`CLI-2026-00003`) using the search bar (evaluated via trigram index in < 25ms).
3. **Plan Enrollment**:
   - Click **Enroll in Plan** or navigate to `/gym/memberships/new` (`http://localhost:8080/gym/memberships/new`).
   - In the **Select Client** field, search for and select **Carlos Rivera** by typing his name, phone number, or client code (`CLI-2026-00003`) into the searchable client combobox.
   - Select **Silver Monthly Gym Membership** ($60.00 / 30 days).
   - Confirm enrollment. Highlight that the membership status immediately updates to `ACTIVE`.
4. **Commercial POS Station Billing & Cash Tender**:
   - Navigate to `/sales/new` (`http://localhost:8080/sales/new`). The intuitive Point of Sale (POS) Station opens by default.
   - In **Customer Selection**, Carlos Rivera is selected (or search by typing "Carlos" in the client combobox).
   - In **Purchase Categories**, select **Gym Memberships**.
   - Browse the active membership catalog and click **Add to Cart** on **Silver Monthly Gym Membership** ($60.00 / 30 days).
   - In the **Current Transaction** panel, review the subtotal ($60.00 USD).
   - In the **Payment Tender** panel, select **CASH Tender**, enter tender amount $60.00 (or click **Exact $60.00**), and verify change is $0.00.
   - Click **Complete Sale**. The station automatically orchestrates agreement initialization, order finalization, cash settlement, and receipt voucher issuance.
5. **Post-Sale Confirmation & Receipt Voucher**:
   - The station displays the **Sale Completed Successfully** confirmation voucher with sequential receipt reference (`REC-2026-00000X`), settled total, and itemized lines.
   - Click **View Receipt** to inspect the printable proof-of-payment receipt voucher.
   - Click **Start Next Sale** to clear the cart and return the terminal to standby for the next client.
6. **Turnstile Check-In**:
   - Navigate to `/gym/attendance` (`http://localhost:8080/gym/attendance`).
   - Search for Carlos Rivera and click **Check In**.
   - Show green indicator: `GRANTED — Access Permitted`.
7. **Anti-Passback Security Demonstration**:
   - Immediately click **Check In** again for Carlos Rivera.
   - Show yellow/red indicator: `DENIED — Rapid Duplicate Check-In Cooldown Active` (5-minute security cooldown).
8. **Negative Ingress Security Demonstrations**:
   - Search for **David Kim** (`CLI-2026-00005`) $\to$ Click **Check In** $\to$ Red indicator: `DENIED — Membership Expired on 2026-09-01`.
   - Search for **Maria Gonzalez** (`CLI-2026-00004`) $\to$ Click **Check In** $\to$ Blue/Yellow indicator: `DENIED — Membership Frozen (Medical Hold)`.

> [!NOTE]
> **Business Disclosure**: Attendance turnstiles operate on an **agreement-first** model, validating active membership status and date validity. Linking strict unpaid sales ledger balances to turnstile gate denial is configurable per business policy.

---

### 8.2 Journey 2: Clinical Kinesiology, 4D Scheduling & SOAP Charting

> [!NOTE]
> **Formal Acceptance**: Fully verified in [Milestone 11.6 Kinesiology MVP Business Acceptance Report](../demo/MILESTONE-11-6-KINESIOLOGY-ACCEPTANCE.md) (**100% PASS** across 42 automated E2E and UI scenarios).

- **Presenter Personas**:
  - Receptionist (`reception.demo@kinergy.platform`) for booking & billing.
  - Clinical Therapist Dr. Sarah Chen (`therapist.demo@kinergy.platform`) for clinical documentation.
- **Target Subject**: Jane Doe (`CLI-2026-00001`), Room 1 (`room-seed-kinesio-01`)

#### Step-by-Step Walkthrough

1. **Appointment Booking (Receptionist)**:
   - Navigate to `/scheduling/calendar` (`http://localhost:8080/scheduling/calendar` in Option B / `http://localhost:5173/scheduling/calendar` in Option A).
   - Book a 60-minute **Kinesiology Assessment** for Jane Doe in Room 1 with therapist Dr. Sarah Chen.
   - Highlight that timestamps are stored in UTC while rendering in the facility's local time zone.
2. **4D Conflict Prevention Demonstration**:
   - Attempt to book a overlapping appointment for Room 1 or Dr. Sarah Chen at the identical time slot.
   - Verify that the scheduling engine rejects the collision with a clear conflict warning (`409 Conflict`).
3. **Clinical Encounter Start (Switch to Therapist)**:
   - Sign out and sign in as `therapist.demo@kinergy.platform` / `DemoPass123!` at `http://localhost:8080/login` (Option B) or `http://localhost:5173/login` (Option A).
   - Navigate to `/kinesiology/sessions` (`http://localhost:8080/kinesiology/sessions`).
   - Locate Jane Doe's scheduled encounter and click **Start Treatment Session**. Status transitions to `IN_PROGRESS`.
4. **SOAP Charting**:
   - In the clinical workspace, enter clinical notes:
     - **Subjective**: Patient reports persistent shoulder stiffness after overhead training; pain 3/10.
     - **Objective**: Range of motion restricted in abduction (140°); impingement test mildly positive.
     - **Assessment**: Subacromial irritation responding favorably to manual therapy.
     - **Plan**: Prescribed rotator cuff strengthening and scapular stabilization drills.
   - Click **Save Draft Notes**. Point out that drafts can be incrementally updated during the encounter.
5. **Medico-Legal Immutability Locking & Integrated Therapist Checkout**:
   - Click **Complete Session**.
   - The integrated checkout modal opens displaying the client's full name, authoritative service fee ($85.00), and settlement options.
   - **Option A — Complete & Collect Payment**:
     - Select payment method: **CASH** (with dynamic tender and change calculator) or **QR Code** (with transaction reference).
     - Confirm payment details and submit.
     - The system locks clinical documentation (immutability), completes the treatment session, orchestrates the Sales module to create exactly one Sale, completes Payment (`PAID`), issues the official receipt, and updates financial records.
     - A dedicated success view displays the receipt number and provides one-click navigation to **View Official Receipt** (`/sales/:id/receipt`).
   - **Option B — Complete Treatment (Already Paid)**:
     - If the client paid upfront at the front desk before the encounter, select **Already Paid**.
     - The system verifies the existing settled payment linked to the session and completes it with zero duplicate charges.
6. **Receptionist Commercial Overview & Audit Visibility**:
   - When operational staff or receptionists view `/sales` (`http://localhost:8080/sales`), the therapist-collected sale and payment are immediately visible with full audit trails.
   - Therapists retain strict least-privilege RBAC: authorized to treat, collect payment, and view receipts for their encounters, while administrative capabilities (sales cancellation, refunds, broad financial reports) remain restricted to authorized operational roles.

---

### 8.3 Journey 3: Consumable Inventory, Receiving & Retail POS

> [!NOTE]
> **Formal Acceptance**: Fully verified in [Milestone 11.7 Inventory & Financial MVP Acceptance Report](../demo/MILESTONE-11-7-INVENTORY-FINANCIAL-ACCEPTANCE.md) (**100% PASS** across 36 inventory automated and UI scenarios).

- **Presenter Personas**:
  - Inventory Staff (`inventory.demo@kinergy.platform`) for replenishment.
  - Cashier (`reception.demo@kinergy.platform`) for retail checkout.

#### Step-by-Step Walkthrough

1. **Low-Stock Cockpit & Operational Hub (Inventory Staff)**:
   - Sign in as `inventory.demo@kinergy.platform` / `DemoPass123!` at `http://localhost:8080/login` (Option B) or `http://localhost:5173/login` (Option A).
   - Navigate to `/resources/inventory/overview` (`http://localhost:8080/resources/inventory/overview`) or `/resources/inventory/low-stock`.
   - Point out **Operational Actions** on the overview: clicking **Register New Product** opens the dedicated product creation workflow (`/resources/inventory/new`) to define new consumable items.
   - Highlight that **Kinesiology Tape Roll 5m** is flagged with a low-stock alert (3 rolls on hand vs. 10 minimum).
2. **Stock Receiving (Replenishment)**:
   - Navigate to `/resources/inventory` (`http://localhost:8080/resources/inventory`) and select **Kinesiology Tape Roll**.
   - Click **Receive Stock**. Add 15 rolls, enter supplier invoice `INV-2026-991`, and submit.
   - Verify that quantity on hand updates to 18 rolls and that the low-stock alert clears immediately.
3. **Movement Ledger Audit**:
   - Click the **Movements** tab on the item detail page (`http://localhost:8080/resources/inventory/:id/movements`).
   - Point out the immutable `PURCHASE` movement entry (+15 rolls) with timestamp and user audit trail.
4. **Retail POS Checkout (Cashier)**:
   - Switch to `reception.demo@kinergy.platform`.
   - Navigate to `/sales/new` (`http://localhost:8080/sales/new`).
   - Add retail items: 2 bottles of **Electrolyte Hydration Drink** ($3.00 each = $6.00).
   - Click **Create Order**. Order enters `PENDING_PAYMENT`.
5. **Payment-Triggered Stock Decrement**:
   - Settle payment via `CASH`.
   - Return to `/resources/inventory` (`http://localhost:8080/resources/inventory`) and inspect the Electrolyte Drink item.
   - Verify that stock on hand has automatically decremented from 36 to 34 bottles, and verify the corresponding `SALE` record in the movement ledger.

---

### 8.4 Journey 4: Commercial Sales, POS Station & Multi-Tender Workflows

> [!NOTE]
> **Formal Acceptance**: Fully verified in [Milestone 11.7 Inventory & Financial MVP Acceptance Report](../demo/MILESTONE-11-7-INVENTORY-FINANCIAL-ACCEPTANCE.md) and Task 84265 POS Stabilization (**100% PASS** across sales lifecycle, payment settlement, receipting, and post-settlement membership fulfillment).

- **Presenter Persona**: Receptionist / Cashier (`reception.demo@kinergy.platform`)

#### 8.4.1 Workflow A: Immediate Membership Purchase via CASH Tender

1. **Access POS Station**:
   - Sign in as `reception.demo@kinergy.platform` / `DemoPass123!`.
   - Navigate to `/sales/new` (`http://localhost:8080/sales/new`).
   - The interactive Point of Sale interface loads with client selector, category filter buttons, catalog grid, and active cart.
2. **Select Client & Gym Membership**:
   - In the **Client Selector**, search and choose an active client without an existing conflicting membership (e.g. `Jane Doe`).
   - Click the **Gym Memberships** category filter.
   - Click **Add to Cart** on **Silver Monthly** ($60.00).
   - Verify cart subtotal, tax ($0.00), and grand total ($60.00) calculated with exact integer cents.
3. **Execute Immediate CASH Tender**:
   - Select **Cash** tender.
   - In **Amount Tendered**, enter `$60.00` (or `$100.00` to preview automated change calculation).
   - Click **Complete Sale ($60.00)**.
4. **Automated Settlement & Fulfillment**:
   - The POS creates the sale in `DRAFT`, transitions it cleanly to `PENDING_PAYMENT`, registers the CASH tender, and settles the transaction immediately.
   - The sale status transitions to `PAID`.
   - An immutable sequential receipt (`REC-YYYY-XXXXX`) is issued automatically.
   - Upon payment settlement (`SalePaidEvent`), the backend triggers `ActivateOrRenewMembershipHandler` to activate the gym membership contract with a 30-day validity window without requiring pre-sale side effects or violating billing invariants.
   - The interface displays the completed confirmation dialog with a one-click button to view the official receipt.

#### 8.4.2 Workflow B: Pay Later Draft Flow & Resumed Settlement

1. **Compose Draft Order**:
   - Navigate to `/sales/new` (`http://localhost:8080/sales/new`).
   - Select a customer (e.g. `Maria Gonzalez`).
   - Add **Silver Monthly** ($60.00) or retail products to the cart.
2. **Save as Draft (Pay Later)**:
   - Click **Save as Draft** (or Pay Later).
   - Invariants guaranteed:
     - The sale is persisted in `DRAFT` status.
     - **Zero payments** are created.
     - **No receipt** is generated (`404 Not Found`).
     - **No inventory decrements** occur for retail items while in draft.
     - **No premature gym membership activation** occurs.
     - Terminal origin (`pos_checkout_terminal`) is recognized without triggering phantom inventory catalog lookups.
3. **Resume and Settle from Sales Management**:
   - Navigate to `/sales` (`http://localhost:8080/sales`).
   - Filter by status `DRAFT`.
   - Locate the saved draft order and click to view or resume payment.
   - Finalize the order: transitions cleanly from `DRAFT` to `PENDING_PAYMENT` (idempotent replay protection ensures subsequent retries do not trigger state transition errors).
   - Tender payment (e.g. CASH or QR) and confirm settlement.
   - The sale transitions to `PAID`, receipt voucher is issued, and membership is activated / renewed gaplessly.

#### 8.4.3 Workflow C: QR Digital Tender & Asynchronous Settle Workflow

1. **Compose Sale at POS Station**:
   - Navigate to `/sales/new` (`http://localhost:8080/sales/new`).
   - In **Purchase Categories**, click **Drinks & Products**.
   - Browse retail items and click **Add to Cart** for 1 **Organic Whey Protein Bar** ($5.50).
   - Review integer-cents total ($5.50 USD) in the transaction cart.
2. **Initiate QR Digital Tender at Checkout**:
   - In the **Payment Tender** panel, select **QR Digital**.
   - Enter customer payment reference (e.g., `QR-REF-8841`).
     _(Note: Do not enter 13-19 digit card numbers or raw timestamps in payment reference fields; the PCI-DSS PAN guard strictly blocks PAN-like strings)._
   - Click **Complete Sale ($5.50)**.
3. **Verify Pending Status (Financial Safety Rule)**:
   - The checkout completes with tender status **`PENDING`** (not `COMPLETED`).
   - Commercial receipt voucher is withheld until funds settle.
   - Click **Sale Agreement** on the confirmation voucher to view the sale in `PENDING_PAYMENT` status.
4. **Confirm External Funds & Settle Payment**:
   - Navigate to `/payments/:id` (`http://localhost:8080/payments/:id`).
   - Click **Settle Payment**.
   - The `SettlePaymentDialog` displays an authoritative financial breakdown.
   - Enter bank confirmation code `BANK-TXN-90210` and click **Confirm Settlement**.
   - Payment transitions to `COMPLETED` with an authoritative `paidAt` timestamp.
   - Sale transitions to `PAID`.
5. **Issue Receipt Voucher**:
   - Click **View Receipt** (or `/sales/:id/receipt`). Print or inspect the official proof-of-payment receipt voucher (`REC-YYYY-XXXXX`).

#### 8.4.4 Workflow D: Front Desk Food & Drink Retail Sale (Receptionist Role / Least Privilege)

1. **Role Scope & Invariants**:
   - The Receptionist role (`reception.demo@kinergy.platform`) is granted `inventory.read` along with `sales.create` and front-desk billing permissions.
   - This enables front-desk staff to browse food, beverage, and retail catalogs and complete checkouts through the POS Station.
   - **Least-Privilege Enforcement**: Receptionist is strictly **denied** `inventory.write`. Receptionist cannot execute stock receiving, manual inventory adjustments, stock scrapping, product creation, or product catalog edits, and cannot access confidential cost/valuation reports.
   - **Mixed Cart Authorization Guard**: If a checkout contains mixed items (e.g. Food plus Gym Membership), the user must be authorized for _all_ included categories. Roles restricted to kitchen sales (e.g. `Kitchen Staff`) cannot process gym memberships or therapy sessions simply by bundling them with food.
2. **Execute Food & Drink Checkout**:
   - Sign in as `reception.demo@kinergy.platform` / `DemoPass123!`.
   - Navigate to `/sales/new` (`http://localhost:8080/sales/new`).
   - Select customer (e.g. `Carlos Rivera`) or toggle **Walk-in Guest** mode.
   - Click **Food & Meals**: browse prepared food and add **Organic Whey Protein Bar** ($5.50).
   - Click **Drinks & Products**: browse beverages and add **Electrolyte Hydration Drink** ($3.00).
   - Review integer-cents total ($8.50 USD) in the active cart.
   - Select **Cash** tender and enter `$10.00` (change: `$1.50`).
   - Click **Complete Sale ($8.50)**.
3. **Automated Stock Decrement & Ledger Audit**:
   - Upon payment settlement (`SalePaidEvent`), the backend orchestrator triggers `SellStockHandler` for each consumable line item.
   - Physical inventory balances on hand decrement automatically ($42 $\to$ 41 for protein bars, $36 $\to$ 35 for electrolyte drinks).
   - An append-only `SALE` movement record is written to `stock_movements` with external transaction reference `${saleId}:${itemId}`.
   - Duplicate events or retries are deduplicated idempotently by reference ID without double stock deductions.

#### 8.4.5 Workflow E: Repeat Purchases for Same Customer (Sale Immutability & Independent Checkouts)

1. **Business Invariants & Scope**:
   - Repeat retail purchases (such as food, beverages, consumables, or recurring services) by the same customer must each create an entirely independent `Sale` transaction with a unique Sale ID.
   - A `PAID` sale is strictly immutable with respect to further payments; it must never be reopened or returned to the POS station to accommodate a new purchase.
   - Idempotency protections are scoped strictly to the specific checkout session (`idempotencyKey`), not to the combination of `clientId` and product SKU.
   - Every completed checkout generates its own distinct payment record and sequential commercial receipt voucher (`REC-YYYY-XXXXX`).
   - Physical inventory is decremented for each purchase according to stock movement rules.
2. **Execute Repeat Purchase Sequence**:
   - **Purchase 1 (Carlos Rivera - Protein Bar)**:
     - Navigate to `/sales/new` (`http://localhost:8080/sales/new`).
     - Select customer `Carlos Rivera` (`CLI-2026-00001`).
     - Add **Organic Whey Protein Bar** ($5.50) to the cart.
     - Select **Cash** tender, enter `$10.00`, and click **Complete Sale ($5.50)**.
     - Authoritative settlement transitions Sale 1 to `PAID`, produces Payment 1, decrements stock ($41 $\to$ 40), and displays receipt confirmation `REC-2026-XXXXX`.
   - **Station Transition Options**:
     - The POS Confirmation station presents two options:
       - **Start Next Sale**: Clears cart and unselects customer for walk-in or new customer ingress.
       - **Keep Customer (Carlos Rivera)**: Preserves customer selection while regenerating the station idempotency key and clearing cart items.
   - **Purchase 2 (Carlos Rivera - Protein Bar Again)**:
     - Click **Keep Customer (Carlos Rivera)** or click **Start Next Sale** and re-select `Carlos Rivera`.
     - Add **Organic Whey Protein Bar** ($5.50) again.
     - Select **Cash** tender, enter `$10.00`, and click **Complete Sale ($5.50)**.
     - **Verification**: The transaction creates a distinct new `Sale` (Sale 2 $\neq$ Sale 1), transitions from `DRAFT` to `PENDING_PAYMENT` to `PAID`, generates Payment 2, decrements stock ($40 $\to$ 39), and issues Receipt 2. Historical Sale 1 remains immutable in `PAID` status.
   - **Purchase 3 (Carlos Rivera - Drink)**:
     - Re-select `Carlos Rivera` (or click **Keep Customer**).
     - Add **Electrolyte Hydration Drink** ($3.00).
     - Tender Cash `$5.00` and complete the sale.
     - Distinct Sale 3 is created, settled, and issued Receipt 3.

### 8.5 Journey 5: POS Receipt Viewing, Persistent Lifecycle & Thermal Output Verification

> **Formal Acceptance**: Verified in Task 84269 POS Receipt Viewing Regression (**100% PASS** across POS confirmation, persistent session banner, sales directory lookup, dual-identifier routing, and thermal print formats).

1. **Immediate Receipt Viewing Post-Checkout**:
   - Upon completing any sale (Food, Drink, Gym Membership, or Treatment Session), the POS Confirmation station renders the green confirmation card with order summary and a prominent **View Receipt** button (`data-testid="pos-view-receipt-btn"`).
   - Clicking **View Receipt** routes directly to `/sales/:saleId/receipt` (with state `{ from: '/sales/new' }`), loading the authoritative receipt from `GET /api/v1/sales/:saleId/receipt`.

2. **Persistent Receipt Accessibility Across Next Sale & Navigation**:
   - When the cashier clicks **Start Next Sale** (`data-testid="pos-new-sale-btn"`), the cart and client selection are cleared for the next transaction, but the previous sale metadata is retained in `sessionStorage` (`kinergy_pos_last_completed_sale`).
   - A persistent banner (`data-testid="pos-last-completed-sale-banner"`) appears at the top of the POS workstation displaying the previous sale ID, total, client name, and a one-click **View Receipt** button (`data-testid="pos-view-last-receipt-btn"`).
   - The banner persists across page refreshes and module navigation (e.g. visiting Clients or Memberships and returning to POS), and can be dismissed at any time with the close button (`data-testid="dismiss-last-sale-banner-btn"`).

3. **Receipt Retrieval from Sales Directory**:
   - In the Sales Directory (`/sales/list`), all settled transactions in `PAID` status feature a dedicated **Receipt** action button (`data-testid="row-receipt-btn-${sale.id}"`).
   - Receptionists and managers can open receipts for any historical sale at any time without entering the checkout station.

4. **Dual-Identifier Receipt Resolution**:
   - The Receipt View Page (`/sales/:identifier/receipt`) automatically detects whether the route parameter is a `saleId` or a direct `receiptId` (`rec_...` / `REC-YYYY-XXXXX`).
   - If a `receiptId` is passed, it queries `GET /api/v1/receipts/:id` and authoritatively extracts the corresponding `saleId` for full context and "Back to Sale" navigation.
   - If a `saleId` is passed, it queries `GET /api/v1/sales/:saleId/receipt`.

5. **Print and Thermal Receipt Output**:
   - The Receipt view page provides a **Print** button (`data-testid="print-receipt-btn"`) invoking `window.print()`.
   - Print media queries (`@media print`) and layout modes support:
     - **Standard Paper**: Clean multi-column A4/Letter invoice format.
     - **80mm Thermal POS**: Formatted 3-inch receipt width with compact line items, store header, tax breakdown, and barcode/QR area.
     - **58mm Thermal POS**: Ultra-compact 2-inch receipt width optimized for mini handheld terminals.

---

## 9. Financial & Payment Integrity Rules

1. **Integer Cents Precision**: All monetary values are processed internally in integer cents to prevent floating-point rounding errors.
2. **Price Snapshotting**: When an item is added to an order, its unit price is frozen in `SaleItem`. Future price catalog changes never affect existing orders.
3. **Discount Bounds**: Discounts cannot exceed 100% of line item subtotal or create negative order totals.
4. **Payment State Machine**:
   - `CASH` tenders can be settled immediately at the register.
   - `QR` and `TRANSFER` tenders are created in `PENDING` status and require explicit settlement confirmation via the API endpoint `POST /api/v1/payments/:id/complete`.
5. **Receipt Immutability**: Receipts are strictly generated only for sales with settled payments and receive a gapless sequence number (`REC-YYYY-XXXXX`). Attempting to fetch a receipt for a `DRAFT` or `PENDING_PAYMENT` sale returns HTTP 404.
6. **PCI-DSS Anti-PAN Security Guard**: All payment references are validated via `PaymentReference` value object. Strings matching payment card primary account numbers (13-19 consecutive digits) are rejected with HTTP 400. System-generated references must not interpolate millisecond timestamps (`Date.now()`) directly into tender references.
7. **Gym Membership Overlap Invariant**: `MembershipOverlapPolicy` strictly prohibits concurrent active memberships under different plans for the same client. Purchasing an identical plan extends the validity window gaplessly from `endDate + 1 day`, while purchasing a different plan when an active membership exists is rejected with a domain invariant exception.
8. **Sale State Transition Immutability**: Commercial sales follow a strict lifecycle: `DRAFT` -> `PENDING_PAYMENT` -> `PAID` (or `CANCELLED`). Finalization can only occur from `DRAFT`; idempotent retries when already in `PENDING_PAYMENT` succeed without altering state. Drafts incur no inventory decrements, zero payments, and no premature membership activations.

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

### Incident 6: Browser Cannot Access Port 5173 During Containerized Demo

- **Symptom**: Browser cannot access `localhost:5173/login` while using the containerized demo (`ERR_CONNECTION_REFUSED` or timeout).
- **Cause**: Port 5173 belongs to Vite development mode (Option A). The dedicated containerized demo stack (Option B) serves the React frontend via Nginx on port 8080.
- **Resolution**: Navigate to `http://localhost:8080/login` (or `http://localhost:8080`).

### Incident 7: Clients Module "Failed to load data / Failed to fetch"

- **Symptom**: Navigating to `/clients` displays `Failed to load data — Failed to fetch` or HTTP 502 Bad Gateway.
- **Root Cause & Diagnosis**:
  - **API Connectivity / Exception Failure (HTTP 502)**: The backend API process crashed or threw an unhandled exception during client entity deserialization, causing Nginx to return 502 Bad Gateway. Check backend container logs:
    ```powershell
    docker compose -f docker-compose.demo.yml logs --tail=100 demo-api
    ```
  - **Authentication / Authorization Failure (HTTP 401 / 403)**: Access token expired or user lacks `clients.read` permission. If 401, re-authenticate at `/login`.
- **Resolution**:
  1. Verify container health: `docker compose -f docker-compose.demo.yml ps`.
  2. Verify API upstream responds to probes:
     ```powershell
     curl -i http://localhost:8080/api/v1/health
     ```
  3. Ensure latest API container image is running:
     ```powershell
     docker compose -f docker-compose.demo.yml up -d --build demo-api
     ```

### Incident 8: Rapid Navigation Returns HTTP 429 Too Many Requests

- **Symptom**: Navigating between modules (Clients, Memberships, Attendance, POS) rapidly causes some requests to fail with `HTTP 429 Too Many Requests` and empty states.
- **Root Cause**:
  1. Global rate limiter was previously pegged to the strict authentication threshold (`AUTH_LOGIN_LIMIT=5` per 60s) rather than general API traffic thresholds.
  2. The Express server did not trust the Nginx edge reverse proxy (`trust proxy` was unset), grouping all client browser traffic into Nginx's bridge IP.
  3. Rate limiting was tracked by IP rather than cryptographically validated user identity (`user:<id>`).
- **Resolution & Architecture**:
  1. **Separated Policy Throttlers**: Sensitive authentication endpoints use dedicated granular decorators (`@LoginThrottle()` at 5 req/min, `@RefreshThrottle()` at 20 req/min, `@LogoutThrottle()` at 30 req/min, `@MeThrottle()` at 60 req/min, `@PasswordThrottle()` at 10 req/min), while general API navigation uses `THROTTLE_LIMIT=120` (default: 120 req / 60s).
  2. **Proxy Trust**: Express enables `app.set('trust proxy', 1)` to correctly inspect client IPs from `X-Forwarded-For` forwarded by Nginx.
  3. **User-Aware Tracking**: `CustomThrottlerGuard` inspects the request context and verified Bearer JWT tokens, tracking requests by `user:<userId>` for authenticated sessions with graceful fallback to `ip:<clientIp>`.
  4. **Frontend Normalization**: Frontend `HttpClient` extracts `Retry-After` headers into `RateLimitError` and preserves server exception messages.

### Incident 9: Frontend Source Changes Not Reflected in Running Containerized Demo

- **Symptom**: Modifications made to React SPA source code (e.g. `/sales/new` POS Station) do not appear at `http://localhost:8080/sales/new` even after browser hard refresh.
- **Root Cause**: In Option B (`docker-compose.demo.yml`), the frontend container `kinergy-demo-web` serves precompiled production static assets from Nginx (`/usr/share/nginx/html/`). Vite development hot module reloading is active only in Option A (`pnpm dev:web` on port 5173). Editing source code does not automatically update static assets inside the running Docker container.
- **Resolution (Safe Zero-Data-Loss Frontend Rebuild)**:
  Rebuild only the frontend image and recreate the web container without modifying PostgreSQL, volumes, or the backend API:
  ```powershell
  # 1. Rebuild web Docker image with latest production assets
  docker compose -f docker-compose.demo.yml build demo-web

  # 2. Recreate web container gracefully without touching DB or API
  docker compose -f docker-compose.demo.yml up -d --no-deps demo-web
  ```
  Nginx configuration guarantees that `index.html` is served with `Cache-Control: no-cache, no-store, must-revalidate`, allowing browsers to immediately pick up new JS chunks upon refresh.

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

| Check | Item                             | Verification Method                                                                                      |     Status      |
| :---: | :------------------------------- | :------------------------------------------------------------------------------------------------------- | :-------------: |
|  [ ]  | **Host Node & pnpm**             | `node -v` ($\ge 20$), `pnpm -v` ($\ge 10$)                                                               |    Verified     |
|  [ ]  | **PostgreSQL Engine Running**    | `pg_isready -h 127.0.0.1 -p 5433` reports accepting connections                                          | Pending Startup |
|  [ ]  | **CORS Configuration Verified**  | `.env` includes `CORS_ORIGINS=http://localhost:5173,http://localhost:4200`                               |    Required     |
|  [ ]  | **Migrations Applied**           | `pnpm prisma:migrate:status` reports all 16 migrations applied                                           |    Required     |
|  [ ]  | **Baseline Seed Data Present**   | `pnpm db:seed` completed successfully                                                                    |    Required     |
|  [ ]  | **API Healthy**                  | `http://localhost:3000/api/v1/health` returns `{"status":"ok"}`                                          |    Required     |
|  [ ]  | **Swagger Docs Accessible**      | `http://localhost:3000/api/docs` renders OpenAPI spec                                                    |    Required     |
|  [ ]  | **Web Client Accessible**        | `http://localhost:8080` (Option B: Demo) or `http://localhost:5173` (Option A: Dev) renders login screen |    Required     |
|  [ ]  | **Presenter Credentials Tested** | Login verified with `reception.demo@kinergy.platform` / `DemoPass123!`                                   |    Required     |

---

## 14. Known Limitations & Next Planned Milestones

| Domain / Area               | Current MVP Demonstration Behavior                                           | Planned Production Enhancement                                                  | Milestone    |
| :-------------------------- | :--------------------------------------------------------------------------- | :------------------------------------------------------------------------------ | :----------- |
| **Turnstile Gating**        | Agreement-first: allows check-in based on active membership validity window. | Commercial payment balance gating (blocks check-in if overdue balance exists).  | Milestone 12 |
| **Clinical Records**        | Completed SOAP notes are permanently locked and read-only.                   | Formal healthcare clinical addendum authoring workflow.                         | Milestone 12 |
| **Inventory Replenishment** | Manual item receiving with purchase invoice reference logging.               | Electronic Data Interchange (EDI) and automated vendor purchase orders.         | Milestone 13 |
| **Hardware Devices**        | Software turnstile and POS entry via responsive web interface.               | USB barcode scanner driver and physical turnstile relay integration.            | Milestone 13 |
| **Payment Terminals**       | Software payment simulation for Cash, Card, QR, Transfer.                    | Direct EMV smart-card terminal pre-authorization and capture integration.       | Milestone 13 |
| **Fiscal Invoicing / Tax**  | Internal sequential proof-of-payment receipt vouchers (`REC-YYYY-XXXXX`).    | Bolivian SIN / electronic fiscal invoicing integration with digital signatures. | Milestone 13 |
| **Fiscal Invoicing / Tax**  | Internal sequential proof-of-payment receipt vouchers (`REC-YYYY-XXXXX`).    | Bolivian SIN / electronic fiscal invoicing integration with digital signatures. | Milestone 13 |

---

## 15. Final Demonstration Readiness Certification

The Kinergy platform has undergone formal rehearsal audit and has achieved an **UNCONDITIONAL GO** certification for all business, investor, and client demonstrations.

For full certification artifacts, automated test matrices, and executive sign-off details, refer to:
👉 **[Milestone 11.8 Final Demo Rehearsal and Readiness Certification Report](../demo/MILESTONE-11-8-FINAL-DEMO-ACCEPTANCE.md)**

---

_Document Author: Platform Architecture Team_  
_Approved by: Product Delivery Lead, QA Lead, DevOps Lead, Business Acceptance Manager_  
_Last Certified: 2026-11-05 (Commit `3a14fb5`) — UNCONDITIONAL GO_
