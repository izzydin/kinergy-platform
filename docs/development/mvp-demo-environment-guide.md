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
```

---

## 6. Starting the Demo Applications

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

## 9. Common Failures & Troubleshooting

### Error 1: `PrismaClientInitializationError: Can't reach database server at 127.0.0.1:5433`

- **Cause:** Docker daemon is stopped, or container was not started.
- **Remedy:** Ensure Docker Desktop is running, then execute `pnpm docker:up`. Verify port with `netstat -ano | findstr 5433`.

### Error 2: `Port 5432 is already in use`

- **Cause:** Host Windows PostgreSQL service is occupying port 5432 while Docker attempts to bind 5432.
- **Remedy:** Set `POSTGRES_PORT=5433` in `.env`. The Docker container will map host port 5433 to container port 5432 cleanly.

### Error 3: `Error: Could not find .../dist/apps/api/src/main.js`

- **Cause:** Project compiler options configured with mismatched root directory.
- **Remedy:** Verified fixed in Milestone 9.5.2 by removing redundant `"rootDir": "."` from `apps/api/project.json`.

### Error 4: `Directory import ... is not supported resolving ES modules`

- **Cause:** Node.js native ESM loader rejecting directory imports without explicit `index` files.
- **Remedy:** Verified fixed in Milestone 9.5.2 by specifying explicit `/index` paths in `packages/core/src/server.ts`.

---

## 10. Remaining Prerequisite Register

| ID         | Prerequisite                              | Status / Responsibility | Blocking What              | Next Action / Prompt       |
| :--------- | :---------------------------------------- | :---------------------- | :------------------------- | :------------------------- |
| **PRE-01** | **Host PostgreSQL Activation**            | **RESOLVED & VERIFIED** | None (Active on port 5433) | Complete (Milestone 9.5.2) |
| **PRE-02** | **Deterministic Synthetic Demo Fixtures** | Agent / Engineer        | Full demo workflow         | Prompt 9.5.3               |
| **PRE-03** | **Production Dockerfiles & Nginx**        | DevOps (Deferred)       | Production deployment      | Milestone 10               |
| **PRE-04** | **Cloud S3 Media Storage Adapter**        | Platform Eng (Deferred) | Production media uploads   | Milestone 10               |
