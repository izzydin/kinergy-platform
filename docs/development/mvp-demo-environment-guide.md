# MVP Demo Environment Setup & Operational Runbook

**Milestone:** 9.5.2 — Establish a Repeatable MVP Demo Environment  
**Audience:** Platform Engineers, Presenters, QA Leads, Product Owners  
**Target Environment:** Local Presenter-Controlled Demonstration / Controlled Client Evaluation  
**Status:** **ACTIVE & OPERATIONAL**

---

## 1. Overview & Demonstration Architecture

This runbook specifies the exact procedure to establish, start, verify, and safely tear down the **Kinergy Platform** demonstration environment.

The demonstration environment executes the real NestJS API (`apps/api`) and React Vite web application (`apps/web`), communicating with an authentic relational PostgreSQL database managed via Prisma ORM. It strictly prohibits synthetic production bypasses or mock SQLite fallbacks, ensuring total parity with domain aggregates, check constraints, and integer-cent financial integrity.

```
┌────────────────────────────────┐       HTTP / REST (Port 3000)       ┌────────────────────────────────┐
│       React / Vite SPA         │ ─────────────────────────────────► │         NestJS REST API        │
│          (Port 5173)           │                                    │           (Port 3000)          │
│   (Modules: Gym, Clinic, POS)  │ ◄───────────────────────────────── │    (Zod Validation, RBAC)      │
└────────────────────────────────┘                                    └───────────────┬────────────────┘
                                                                                      │
                                                                       Prisma Client  │ (TCP 5432 / 5433)
                                                                                      ▼
                                                                      ┌────────────────────────────────┐
                                                                      │      PostgreSQL 16 / 18        │
                                                                      │        (kinergy_dev)           │
                                                                      │ (12 Relational Migrations)     │
                                                                      └────────────────────────────────┘
```

---

## 2. Prerequisites

| Component            | Minimum Version      | Verified Host Location / Status                                 | Purpose                                       |
| :------------------- | :------------------- | :-------------------------------------------------------------- | :-------------------------------------------- |
| **Node.js**          | `v20.x` or `v24.x`   | `Node.js v24.12.0` (Active)                                     | JavaScript runtime                            |
| **pnpm**             | `v10.x` or `v11.x`   | `pnpm v11.17.0` (Active)                                        | Fast monorepo package manager                 |
| **Docker Desktop**   | `v29+` (Compose v5+) | `C:\Program Files\Docker\Docker\Docker Desktop.exe`             | Preferred option: containerized PostgreSQL 16 |
| **Local PostgreSQL** | `v16+` or `v18+`     | `C:\Program Files\PostgreSQL\18` (Service: `postgresql-x64-18`) | Fallback option: native Windows service       |

---

## 3. Database Options Supported by Repository

The repository supports two distinct configurations for PostgreSQL. Presenters can select either option based on machine privileges.

### Option A: Docker Compose (Recommended per ADR-0006)

This is the canonical developer setup. It requires zero host OS database configuration and isolates database files in named volume `kinergy_postgres_data`.

1. **Launch Docker Desktop:**
   - Open **Docker Desktop** from the Start Menu or run `& "C:\Program Files\Docker\Docker\Docker Desktop.exe"`.
   - Ensure the Docker whale icon in the Windows taskbar tray indicates _Docker Desktop is running_.
2. **Start PostgreSQL Container:**
   ```powershell
   pnpm docker:up
   # Equivalent to: docker-compose up -d postgres
   ```
3. **Container Network Mapping:**
   - Container port `5432` is mapped to host port `${POSTGRES_PORT:-5432}` (set to `5433` in `.env` to prevent port collisions).
   - Database name: `kinergy_dev`
   - Superuser credentials: `kinergy_user` / `kinergy_secure_pass`
   - Extensions initialized: `uuid-ossp`, `pgcrypto` (via `./infrastructure/docker/init-db.sql`).

### Option B: Native Host Windows PostgreSQL 18 Service

If Docker is unavailable, the native PostgreSQL 18 engine already installed on the Windows host can be utilized.

1. **Start the Windows PostgreSQL Service:**
   Open an elevated (Run as Administrator) PowerShell or Services manager (`services.msc`) and run:
   ```powershell
   net start postgresql-x64-18
   # Or: Start-Service postgresql-x64-18
   ```
2. **Ensure Demo Database Exists:**
   Using `psql` or `pgAdmin 4`:
   ```sql
   CREATE DATABASE kinergy_dev;
   \c kinergy_dev
   CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
   CREATE EXTENSION IF NOT EXISTS "pgcrypto";
   ```
3. **Configure Connection String in `.env`:**
   ```bash
   DATABASE_URL="postgresql://postgres:YOUR_POSTGRES_PASSWORD@localhost:5432/kinergy_dev?schema=public"
   ```

---

## 4. Environment Configuration (`.env`)

The repository requires a valid `.env` file at the root. Copy from `.env.example` if not already present:

```powershell
# Copy template if .env does not exist
Copy-Item .env.example .env
```

### Authoritative Demo Variables Reference

```ini
# ==============================================================================
# Kinergy Platform - Demo Environment Configuration
# ==============================================================================

# Server Runtime
NODE_ENV=development
PORT=3000
API_PREFIX=api/v1
SWAGGER_ENABLED=true

# Database Persistence
# Option A (Docker on port 5433):
DATABASE_URL=postgresql://kinergy_user:kinergy_secure_pass@127.0.0.1:5433/kinergy_dev?schema=public
POSTGRES_PORT=5433

# Option B (Native PostgreSQL on port 5432):
# DATABASE_URL=postgresql://postgres:postgres@localhost:5432/kinergy_dev?schema=public
# POSTGRES_PORT=5432

# Security & Tokens (Minimum 32 characters)
JWT_ACCESS_SECRET=kinergy-platform-dev-access-secret-min-32-chars!
JWT_REFRESH_SECRET=kinergy-platform-dev-refresh-secret-min-32-chars!
JWT_ACCESS_EXPIRES_IN=15m
JWT_REFRESH_EXPIRES_IN=7d
JWT_ISSUER=kinergy-platform
JWT_AUDIENCE=kinergy-api

# Web Security & CORS
CORS_ORIGINS=http://localhost:5173,http://localhost:4200
CORS_ALLOW_CREDENTIALS=true

# Password Infrastructure Defaults
PASSWORD_MIN_LENGTH=12
```

---

## 5. Database Migration & Schema Deployment

Before starting the API, apply the 12 existing schema migrations. This step creates all relational tables, indexes, and monetary check constraints:

```powershell
# 1. Verify connection status
pnpm db:status
# Equivalent to: pnpm prisma migrate status

# 2. Deploy migrations
pnpm prisma:migrate
# Equivalent to: pnpm prisma migrate dev

# 3. Generate fresh Prisma Client
pnpm prisma:generate

# 4. Seed deterministic synthetic demo data (Milestone 9.5.3)
pnpm db:seed
# Or: pnpm prisma:seed
```

---

## 6. Deterministic Synthetic Demo Dataset & Persona Accounts

Milestone 9.5.3 establishes a fully repeatable synthetic demo dataset that seeds all prerequisites for the **Gym**, **Kinesiology**, and **Inventory** presenter journeys.

### A. Demo Accounts & Role Mapping

All demo passwords are encrypted using PBKDF2 (`$pbkdf2-sha512$i=100000$...`) and verified by `Argon2PasswordHasher`. Credentials can be configured via environment variables or default to standard demonstration values:

| Persona / Role                   | Email                             | Configurable Env Var  | Default Password    | Effective Granted Capabilities                                                            |
| :------------------------------- | :-------------------------------- | :-------------------- | :------------------ | :---------------------------------------------------------------------------------------- |
| **Platform Owner / Admin**       | `owner@kinergy.platform`          | `OWNER_PASSWORD`      | `OwnerPassword123!` | Full wildcard access across all modules (`*`).                                            |
| **Front Desk Receptionist**      | `reception.demo@kinergy.platform` | `DEMO_USERS_PASSWORD` | `DemoPass123!`      | Client intake, plan enrollment, check-in, checkout, cash/QR payment settlement, receipts. |
| **Clinical Therapist / Trainer** | `therapist.demo@kinergy.platform` | `DEMO_USERS_PASSWORD` | `DemoPass123!`      | Assigned client lookup, treatment session execution, clinical SOAP documentation notes.   |
| **Operations / Inventory Staff** | `inventory.demo@kinergy.platform` | `DEMO_USERS_PASSWORD` | `DemoPass123!`      | Stock receiving, stock movement adjustments, retail product sales, inventory reports.     |

### B. Seeded Demonstration Entities

| Domain        | Entity ID / Code       | Name / Details                                  | Demonstration Purpose                                                                   |
| :------------ | :--------------------- | :---------------------------------------------- | :-------------------------------------------------------------------------------------- |
| **Rooms**     | `room-seed-kinesio-01` | Room 1 - Kinesiology Therapy Suite              | Clinical treatment & therapy bed appointment scheduling.                                |
| **Rooms**     | `room-seed-consult-02` | Room 2 - Assessment & Consultation              | Private clinical consultation and physical evaluation.                                  |
| **Rooms**     | `studio-b-facility`    | Studio B - Movement Room (Cap: 20)              | Movement group classes and facility access.                                             |
| **Clients**   | `CLI-2026-00001`       | **Jane Doe** (`jane.doe@example.com`)           | Has completed assessment with SOAP notes and upcoming scheduled appointment.            |
| **Clients**   | `CLI-2026-00002`       | **John Smith** (`john.smith@example.com`)       | Has active Gold Annual Membership and verified reception check-in record.               |
| **Clients**   | `CLI-2026-00003`       | **Carlos Rivera** (`carlos.rivera@example.com`) | Unenrolled intake client ready for live front-desk membership enrollment and POS sales. |
| **Plans**     | `MEM-GOLD-2026`        | Gold Annual Gym Membership ($600.00 / 365d)     | Annual full-facility gym membership tier.                                               |
| **Plans**     | `MEM-SLV-MONTH`        | Silver Monthly Gym Membership ($60.00 / 30d)    | Standard recurring monthly gym membership.                                              |
| **Plans**     | `MEM-10-VISITS`        | 10-Visit Flexibility Pass ($45.00 / 60d)        | Punch-card quota pass (10 check-in limit).                                              |
| **Inventory** | `SKU-SNK-BAR-01`       | Organic Whey Protein Bar 60g                    | Saleable retail snack ($5.50 retail, On Hand: 42, Min: 15).                             |
| **Inventory** | `SKU-DRK-ELEC-01`      | Electrolyte Hydration Drink 500ml               | Saleable retail beverage ($3.00 retail, On Hand: 36, Min: 12).                          |
| **Inventory** | `SKU-CLIN-BAND-01`     | Kinesiology Tape Roll 5m                        | Low-stock consumable (On Hand: 3, Min: 10). **Triggers Low-Stock Alert**.               |
| **Assets**    | `AST-GYM-TRDM-01`      | Commercial Treadmill Pro Series 8               | Cardio floor fixed asset tracking ($3,500 purchase, condition: EXCELLENT).              |

### C. Safety Protections & Environment Lock

The fixture mechanism includes `assertSafeDemoEnvironment()` which enforces:

1. **Production Guard:** Throws immediately if `NODE_ENV=production`.
2. **URL Inspector:** Rejects database connection strings containing `prod`, `production`, or `live-db`.
3. **Secret Masking:** Error messages mask user credentials (`:***@`) to avoid leaking connection secrets.
4. **Idempotency:** All entities use deterministic UUIDs and unique code/SKU keys with `upsert` semantics. Re-running `pnpm db:seed` multiple times updates existing entities non-destructively without creating duplicate records.

---

## 7. Starting the Demo Applications

Launch the backend API and frontend SPA in two separate terminal windows:

### Terminal 1 — Backend REST API

```powershell
pnpm dev:api
# Equivalent to: pnpm nx serve api
```

- **Listening Address:** `http://localhost:3000/api/v1`
- **Swagger Documentation:** `http://localhost:3000/api/docs`

### Terminal 2 — Frontend Web Application

```powershell
pnpm dev:web
# Equivalent to: pnpm nx serve web
```

- **Listening Address:** `http://localhost:5173`
- Communicates directly with `http://localhost:3000/api/v1`.

---

## 7. Health & Connectivity Verification

Once both servers are running, verify runtime readiness using non-destructive probes:

### 1. Database Connectivity Probe

```powershell
& "C:\Program Files\PostgreSQL\18\bin\pg_isready.exe" -h 127.0.0.1 -p 5433
# Output: 127.0.0.1:5433 - accepting connections
```

### 2. API Health Check

```powershell
curl http://localhost:3000/api/v1/health
# Expected JSON Response:
# {"status":"ok","timestamp":"2026-11-02T...","uptime":...}
```

### 3. Swagger OpenAPI Verification

Open `http://localhost:3000/api/docs` in your browser. Verify that the endpoints for `Gym`, `Scheduling`, `Kinesiology`, `Resources`, and `Sales` are visible.

### 4. Web Application Health

Open `http://localhost:5173` in your browser. The login screen should render without console errors.

---

## 8. Safe Shutdown & Reset Procedures

### Normal Shutdown

- Stop the frontend: Press `Ctrl + C` in Terminal 2.
- Stop the backend API: Press `Ctrl + C` in Terminal 1.
- Stop the database container (Option A):
  ```powershell
  pnpm docker:down
  # Preserves volume data
  ```

### Complete Disposable Reset (Rehearsal Cleanup)

If rehearsal test data needs to be completely purged to return to clean state:

```powershell
# 1. Stop and remove persistent database volume
docker-compose down -v

# 2. Start fresh container
pnpm docker:up

# 3. Re-apply schema migrations
pnpm prisma:migrate

# 4. Seed baseline data (Prompt 9.5.3)
pnpm prisma:seed
```

---

## 9. Comprehensive Presenter Recovery Procedures (Milestone 9.5.7)

During live demonstration rehearsals or client presentations, operational issues must be resolved rapidly following deterministic, non-destructive protocols.

```
                                      PRESENTER INCIDENT DETECTED
                                                   │
                   ┌───────────────────────────────┼───────────────────────────────┐
                   ▼                               ▼                               ▼
          [PostgreSQL Outage]              [API / Web Crash]             [State Desync / Fail]
                   │                               │                               │
             pnpm docker:up                 nx reset && build              pnpm db:seed (Upsert)
                   │                               │                               │
            Check port 5433                 Restart Service                 Verify in Cockpit
                   │                               │                               │
                   └───────────────────────┬───────┴───────────────────────────────┘
                                           ▼
                                [PROCEED WITH RUNBOOK]
```

### Scenario 1: PostgreSQL Database Unavailable

- **Symptom**: `PrismaClientInitializationError: Can't reach database server at 127.0.0.1:5433` or API logs connection refused.
- **Root Cause**: Docker daemon paused, container stopped, or port conflict.
- **Recovery Protocol**:
  ```powershell
  # 1. Check container status
  docker ps -a --filter name=kinergy-postgres
  # 2. Restart container
  docker compose up -d postgres
  # 3. Test TCP readiness
  & "C:\Program Files\PostgreSQL\18\bin\pg_isready.exe" -h 127.0.0.1 -p 5433
  ```
- **Stop Condition**: If Docker reports `daemon not running`, launch Docker Desktop from Windows Start Menu and wait 30 seconds before retrying.

### Scenario 2: API Startup Failure

- **Symptom**: `pnpm dev:api` fails to bind port 3000 or exits with module error.
- **Root Cause**: Zombie Node.js process occupying port 3000, or stale build artifact in `dist/`.
- **Recovery Protocol**:
  ```powershell
  # 1. Kill zombie process on port 3000
  Get-Process -Id (Get-NetTCPConnection -LocalPort 3000).OwningProcess -ErrorAction SilentlyContinue | Stop-Process -Force
  # 2. Clear Nx cache and restart
  npx nx reset
  pnpm dev:api
  ```

### Scenario 3: Web Application Startup Failure

- **Symptom**: `pnpm dev:web` fails or Vite server exits immediately.
- **Root Cause**: Vite port 5173 occupied, or corrupted cache in `node_modules/.vite`.
- **Recovery Protocol**:
  ```powershell
  # 1. Kill process on port 5173
  Get-Process -Id (Get-NetTCPConnection -LocalPort 5173).OwningProcess -ErrorAction SilentlyContinue | Stop-Process -Force
  # 2. Clean Vite cache and restart
  Remove-Item -Recurse -Force apps/web/node_modules/.vite -ErrorAction SilentlyContinue
  pnpm dev:web
  ```

### Scenario 4: Authentication Failure

- **Symptom**: `401 Unauthorized` on login; demo credentials rejected.
- **Root Cause**: JWT secret mismatch or password hash desynchronization.
- **Recovery Protocol**:
  ```powershell
  # 1. Verify .env JWT variables match reference
  Get-Content .env | Select-String "JWT_"
  # 2. Re-apply identity seed to re-encrypt password hashes
  pnpm prisma:seed
  # 3. Presenter signs in with verified default credentials:
  #    reception.demo@kinergy.platform / Demo123!
  ```

### Scenario 5: Incorrect Demo Data or Entity Missing

- **Symptom**: Demo patient (Elena Rostova) or catalog item (Protein Shake) missing from dropdowns.
- **Root Cause**: Seed data partially applied or modified during previous test session.
- **Recovery Protocol**:
  ```powershell
  # Re-run idempotent seed pipeline (non-destructive upserts)
  pnpm db:seed
  ```

### Scenario 6: Fixture Creation Failure

- **Symptom**: `ts-node prisma/seed.ts` throws constraint or validation error.
- **Root Cause**: Unapplied schema migration.
- **Recovery Protocol**:
  ```powershell
  pnpm prisma:migrate
  pnpm prisma:generate
  pnpm db:seed
  ```

### Scenario 7: Incomplete or Failed Business Workflow

- **Symptom**: A demo workflow was interrupted mid-stream (e.g. sale created in `PENDING_PAYMENT`, but cashier dialog closed).
- **Recovery Protocol**:
  - Do **not** mutate the database manually.
  - Navigate to `/sales` and locate the draft or pending order.
  - Complete payment or cancel the order via the UI action button.
  - Alternatively, create a fresh sale with a distinct synthetic line item.

### Scenario 8: Demo State That Cannot Be Safely Reversed

- **Symptom**: Terminal state (e.g. treatment session signed off or member expired) prevents re-demonstrating an ingress action on the same record.
- **Recovery Protocol (Disposable Demo DB Reset Only)**:
  ```powershell
  # Explicit reset for dedicated local disposable database (Port 5433 ONLY)
  docker-compose down -v
  docker-compose up -d postgres
  pnpm prisma:migrate
  pnpm db:seed
  ```
  > [!CAUTION]
  > Execute this command ONLY against the local demo database `kinergy_dev` on port 5433. Never run against staging or production.

### Scenario 9: Application Shutdown and Restart

- **Normal Shutdown Protocol**:
  1. Frontend: Press `Ctrl + C` in Terminal 2.
  2. Backend: Press `Ctrl + C` in Terminal 1.
  3. Database: `docker compose stop postgres` (preserves data).
- **Restart Protocol**:
  1. `docker compose start postgres`
  2. `pnpm dev:api` (Terminal 1)
  3. `pnpm dev:web` (Terminal 2)

---

## 10. Remaining Prerequisite Register (Production vs. Demo Scope)

| ID         | Prerequisite                    | Demo Status                    | Production Status               | Next Planned Milestone |
| :--------- | :------------------------------ | :----------------------------- | :------------------------------ | :--------------------- |
| **PRE-01** | **PostgreSQL Availability**     | **ACTIVE (Port 5433)**         | Cloud Staging DB Pending        | Milestone 10           |
| **PRE-02** | **Synthetic Demo Fixtures**     | **ACTIVE (Seeded & Verified)** | Production Seed Policy Required | Milestone 10           |
| **PRE-03** | **Production Docker Packaging** | Local Container Operational    | Multi-stage Dockerfile Deferred | Milestone 10           |
| **PRE-04** | **Reverse Proxy & TLS**         | Localhost Direct Routing       | Nginx / Caddy Ingress Deferred  | Milestone 10           |
| **PRE-05** | **Cloud Object Storage (S3)**   | Local Attachment Simulation    | AWS S3 / MinIO Integration      | Milestone 10           |
| **PRE-06** | **Automated Staging CI/CD**     | Local Validation Passing       | GitHub Actions Staging Pipeline | Milestone 10           |
