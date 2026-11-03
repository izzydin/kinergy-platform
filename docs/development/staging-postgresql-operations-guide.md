# Staging PostgreSQL Operations & Validation Guide

**Milestone:** 10.6 — Staging PostgreSQL Provisioning and Validation  
**Applies To:** Staging & Pre-Production Environments  
**Target Engine:** PostgreSQL 16

---

## 1. Overview & Architecture

The Kinergy staging PostgreSQL architecture is designed to replicate production security, concurrency, and persistence characteristics without incurring unnecessary costs or exposing critical infrastructure.

```mermaid
flowchart TD
    subgraph CI/CD Pre-Deploy
        MigratorRunner["CI / CD Migration Job\n(pnpm prisma:migrate:deploy)"]
    end

    subgraph Staging Runtime
        NestAPI["NestJS API Container\n(apps/api)"]
        TestHarness["Acceptance Test Runner"]
    end

    subgraph PostgreSQL 16 Staging Tier
        AuthEngine["PostgreSQL Engine (v16.x)"]

        subgraph Role Separation
            MigratorRole["kinergy_migrator\n(DDL + DML, Schema Owner)"]
            AppRole["kinergy_app\n(DML Only: SELECT, INSERT, UPDATE, DELETE)"]
            TestRole["kinergy_test\n(DML + TRUNCATE for Fixtures)"]
        end

        subgraph Extensions & Database
            Ext["Extensions: uuid-ossp, pgcrypto, pg_trgm"]
            Tables["17 Domain Entity Tables\nTrigram Indexes, Numeric Checks, JSONB Snapshots"]
        end
    end

    MigratorRunner -->|MIGRATION_DATABASE_URL| MigratorRole
    NestAPI -->|DATABASE_URL| AppRole
    TestHarness -->|TEST_DATABASE_URL| TestRole

    MigratorRole -->|DDL Migration Execution| AuthEngine
    AppRole -->|DML Business Queries| AuthEngine
    TestRole -->|DML Fixture Management| AuthEngine

    AuthEngine --> Ext
    AuthEngine --> Tables
```

---

## 2. Least-Privilege Identity Matrix

| Identity Name           | Role Classification     | Allowed Operations                                                                                                    | Prohibited Operations                                                           | Primary Consumer                |
| :---------------------- | :---------------------- | :-------------------------------------------------------------------------------------------------------------------- | :------------------------------------------------------------------------------ | :------------------------------ |
| `kinergy_staging_admin` | Database Administrator  | Superuser / Admin, extension management                                                                               | Production application runtime                                                  | Local DBA / Init container      |
| `kinergy_migrator`      | Pre-Deploy DDL Engine   | `CREATE TABLE`, `ALTER TABLE`, `DROP TABLE`, `CREATE INDEX`, `DROP INDEX`, `CREATE TYPE`, DML on `_prisma_migrations` | None within `public` schema                                                     | CI/CD Pre-deploy job            |
| `kinergy_app`           | Application Runtime     | `SELECT`, `INSERT`, `UPDATE`, `DELETE` on all tables; `USAGE, SELECT` on sequences                                    | `CREATE TABLE`, `DROP TABLE`, `ALTER TABLE`, `TRUNCATE`, extension modification | `apps/api` runtime process      |
| `kinergy_test`          | Integration Test Runner | `SELECT`, `INSERT`, `UPDATE`, `DELETE`, `TRUNCATE` on tables                                                          | `CREATE TABLE`, `DROP TABLE`, `ALTER TABLE`, extension modification             | Staging acceptance test harness |

---

## 3. Dedicated Staging Docker Stack

To test and run staging locally or on an isolated staging runner:

```bash
# 1. Start dedicated staging postgres on isolated port 5434
docker compose -f docker-compose.staging.yml up -d staging-postgres

# 2. Verify staging postgres readiness
docker compose -f docker-compose.staging.yml ps

# 3. Run non-interactive migration deployment as kinergy_migrator
MIGRATION_DATABASE_URL="postgresql://kinergy_migrator:kinergy_migrator_secure_password@localhost:5434/kinergy_staging?schema=public" \
  pnpm prisma:migrate:deploy

# 4. Start staging API and Web containers
docker compose -f docker-compose.staging.yml up -d staging-api staging-web
```

---

## 4. Cloud Managed Database Provisioning Options

If provisioning on an external cloud database provider, follow the exact configuration requirements:

### Option A: Neon Serverless Postgres (Recommended Free-First Cloud Option)

1. Create a project at [Neon Console](https://console.neon.tech).
2. Select **PostgreSQL 16** in the desired region.
3. In SQL Editor, execute `infrastructure/docker/init-staging-roles.sql`.
4. Enable Connection Pooling (PgBouncer mode) for `DATABASE_URL`.
5. Connection string format:
   ```
   DATABASE_URL="postgresql://kinergy_app:<PASSWORD>@<ENDPOINT>-pooler.neon.tech/kinergy_staging?sslmode=require&connection_limit=10"
   ```

### Option B: Supabase Managed Postgres

1. Create a staging project at [Supabase Console](https://supabase.com).
2. Run `infrastructure/docker/init-staging-roles.sql` via Supabase SQL Editor.
3. Configure `DATABASE_URL` targeting port `6543` (transaction pooler) or port `5432` (session pooler).
4. Connection string format:
   ```
   DATABASE_URL="postgresql://kinergy_app.<PROJECT-REF>:<PASSWORD>@aws-0-<REGION>.pooler.supabase.com:6543/postgres?sslmode=require"
   ```

### Option C: AWS RDS PostgreSQL 16

1. Provision `db.t4g.micro` with PostgreSQL 16 in a private staging VPC subnet.
2. Require SSL by setting `rds.force_ssl = 1` in DB Parameter Group.
3. Execute role initialization script via a bastion host.

---

## 5. Health & Readiness Verification

The staging API exposes three standardized health endpoints:

### Liveness Probe (`GET /api/v1/health/liveness`)

- **Purpose:** Verifies that the Node.js process is active and responding to HTTP requests.
- **Payload:**
  ```json
  {
    "status": "ok",
    "timestamp": "2026-11-03T19:20:00.000Z",
    "uptime": 124.5
  }
  ```

### Readiness Probe (`GET /api/v1/health/readiness`)

- **Purpose:** Executes `SELECT 1` against PostgreSQL via `PrismaService` with a 2,000ms timeout.
- **Success (HTTP 200 OK):**
  ```json
  {
    "status": "ok",
    "timestamp": "2026-11-03T19:20:00.000Z",
    "database": "ready",
    "latencyMs": 4
  }
  ```
- **Failure (HTTP 503 Service Unavailable):**
  ```json
  {
    "status": "error",
    "timestamp": "2026-11-03T19:20:00.000Z",
    "database": "unavailable",
    "message": "Database ping timeout (2000ms)"
  }
  ```

---

## 6. Backup & Disaster Recovery Baseline

### Manual / Scheduled Backup

```bash
# Bash / Linux / Mac / Container
export PGHOST="localhost"
export PGPORT="5434"
export PGDATABASE="kinergy_staging"
export PGUSER="kinergy_staging_admin"
export PGPASSWORD="kinergy_staging_admin_password"
./infrastructure/scripts/backup-staging-db.sh

# Windows PowerShell
powershell -File ./infrastructure/scripts/backup-staging-db.ps1
```

### Restore Verification

```bash
# Bash / Linux
./infrastructure/scripts/restore-staging-db.sh ./backups/staging/kinergy_staging_20261103_190000.dump

# PowerShell
powershell -File ./infrastructure/scripts/restore-staging-db.ps1 -BackupFile ./backups/staging/kinergy_staging_20261103_190000.dump
```
