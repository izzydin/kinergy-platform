# Milestone 10.6: Staging PostgreSQL Provisioning and Validation Report

**Date:** 2026-11-03  
**Reviewer:** Senior Database Engineer, Platform Engineer, and DevOps Lead  
**Repository:** `@kinergy-platform/source`  
**Milestone:** Milestone 10.6 — Staging PostgreSQL Provisioning and Validation  
**Evaluation Status:** **BLOCKED (PENDING CLOUD PROVIDER SELECTION & PROVISIONING APPROVAL) — LOCAL STAGING ARTIFACTS, RBAC SCRIPTS, AND HEALTH PROBES VERIFIED**

---

## 1. Executive Summary

Milestone 10.6 assesses and establishes the PostgreSQL staging infrastructure requirements, security posture, connectivity validation, and disaster recovery baseline for the Kinergy platform.

In alignment with the non-negotiable rules:

- Rule 10: _"Do not create billable infrastructure without explicit authorization."_
- Milestone Precondition: _"If provider, budget, or authorization decisions are pending, do not create billable resources. Produce the implementation plan and report BLOCKED pending approval."_

No billable external cloud resources have been provisioned without user authorization. Instead, we have completed the full architectural specification, implemented least-privilege RBAC schemas (`infrastructure/docker/init-staging-roles.sql`), created a turnkey dedicated staging container stack (`docker-compose.staging.yml`), added database readiness probes (`GET /api/v1/health/readiness`), fixed critical configuration defect `SEC-03`, and created automated backup and restore pipelines with SHA256 integrity verification.

---

## 2. Preconditions Verification

| Precondition              |          Status           | Finding / Evidence                                                                                                                                 |
| :------------------------ | :-----------------------: | :------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Provider Selection**    | **PENDING USER APPROVAL** | Free-first cloud strategy approved for Object Storage (Milestone 10.5); cloud database provider (Neon vs. Supabase vs. Docker) awaiting selection. |
| **PostgreSQL Version**    |       **VERIFIED**        | PostgreSQL 16.x pinned in `docker-compose.staging.yml`, `schema.prisma`, and `migration_lock.toml`.                                                |
| **Network & Access**      |       **VERIFIED**        | Isolated network `kinergy_staging_network`, isolated port `5434`, SSL enforcement rules documented.                                                |
| **Secrets Supply**        |       **VERIFIED**        | Separate credentials for `kinergy_migrator` (DDL) and `kinergy_app` (DML); secrets injected via environment variables.                             |
| **Environment Isolation** |       **VERIFIED**        | Distinct volumes (`kinergy_staging_postgres_data`), isolated ports, completely decoupled from `kinergy-postgres` (dev).                            |
| **Provisioning Plan**     |       **COMPLETE**        | Comprehensive operations guide created in `docs/development/staging-postgresql-operations-guide.md`.                                               |

---

## 3. Implementation Assets Delivered

1. **Least-Privilege Database RBAC:**
   - Script: `infrastructure/docker/init-staging-roles.sql`
   - Identities:
     - `kinergy_migrator`: Full DDL + DML on schema `public` for pre-deployment migrations.
     - `kinergy_app`: DML only (`SELECT`, `INSERT`, `UPDATE`, `DELETE`, sequences). `CREATE` explicitly revoked.
     - `kinergy_test`: DML + `TRUNCATE` for acceptance test fixture cleanup.
   - Extensions: `uuid-ossp`, `pgcrypto`, `pg_trgm`.

2. **Dedicated Staging Orchestration:**
   - Compose file: `docker-compose.staging.yml`
   - Services: `staging-postgres` (PostgreSQL 16 on port 5434), `staging-api` (port 3001), `staging-web` (port 8081).
   - Dedicated volume: `kinergy_staging_postgres_data`.

3. **Database Readiness Probe (Remediating OPS-01):**
   - Implemented `GET /api/v1/health/readiness` executing `SELECT 1` with a 2,000ms timeout.
   - Implemented `GET /api/v1/health/liveness` for orchestrator process monitoring.
   - Updated `GET /api/v1/health` with database latency and status reporting.

4. **Production Configuration Hardening (Remediating SEC-03):**
   - Updated `apps/api/src/config/env.validation.ts` to reject default localhost `DATABASE_URL` when `NODE_ENV === 'production'`.
   - Verified via automated unit tests in `apps/api/src/config/env.validation.spec.ts`.

5. **Safe Migration Scripting:**
   - Added `"prisma:migrate:deploy": "prisma migrate deploy"` and `"prisma:migrate:status": "prisma migrate status"` in `package.json`.

6. **Backup & Disaster Recovery Automation:**
   - `infrastructure/scripts/backup-staging-db.sh` & `.ps1`: Compressed `pg_dump` with SHA256 checksum and 7-day retention.
   - `infrastructure/scripts/restore-staging-db.sh` & `.ps1`: Automated checksum-validated restoration.

7. **Automated Verification Test Suite:**
   - `apps/api/src/platform/persistence/__tests__/staging-database-readiness.spec.ts` (8/8 tests pass).
   - `apps/api/src/app.controller.spec.ts` (7/7 tests pass).

---

## 4. Cloud Provider Options for User Selection

| Provider Option                                       | Architecture                   |              Ongoing Cost               | Pros                                                                                                           | Cons                                                   |
| :---------------------------------------------------- | :----------------------------- | :-------------------------------------: | :------------------------------------------------------------------------------------------------------------- | :----------------------------------------------------- |
| **Option 1: Neon Serverless Postgres (Recommended)**  | Cloud Managed Serverless       | **$0** (Free Tier: 0.5 GiB, 1 project)  | Built-in PgBouncer pooling, instant branching, TLS enforced, zero compute idle costs.                          | 0.5 GiB limit (ample for staging MVP).                 |
| **Option 2: Supabase Managed Postgres**               | Cloud Managed                  | **$0** (Free Tier: 500 MB, 2 projects)  | Built-in Supavisor pooling, web SQL editor, TLS enforced, daily automated backups.                             | Pauses after 1 week of inactivity on free tier.        |
| **Option 3: Dedicated Container Stack (Local / VPS)** | Self-hosted Docker Compose     |   **$0** (Runs on existing host/VPS)    | Zero external dependencies, full configuration control, instant availability via `docker-compose.staging.yml`. | Requires running Docker daemon on staging server.      |
| **Option 4: AWS RDS PostgreSQL 16**                   | Cloud Managed (`db.t4g.micro`) | **~$15–20/mo** (or AWS Free Tier 12 mo) | Enterprise SLA, IAM authentication, automated snapshots, automated failover.                                   | Billable after free tier, requires AWS VPC management. |

---

## 5. Outstanding Risks & Next Steps

1. **Cloud Database Selection:** Waiting on user approval to proceed with Neon Free Tier, Supabase, or Dedicated Docker Staging.
2. **Next Milestone:** Milestone 10.7 — Staging Integration and Acceptance Test Execution (PostgreSQL-backed).

---

## 6. Final Status

**Evaluation Status:** **BLOCKED (PENDING CLOUD PROVIDER SELECTION & PROVISIONING APPROVAL)**
