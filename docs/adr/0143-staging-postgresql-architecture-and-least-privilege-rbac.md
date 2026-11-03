# ADR-0143: Staging PostgreSQL Architecture & Least-Privilege RBAC Specification

## Status

Accepted

## Date

2026-11-03

## Context

Kynergy Platform relies on PostgreSQL 16 as its relational persistence engine, managed via Prisma ORM across 17 domain entities and 12 sequential migrations.

In local development, the application connects as a single user (`kinergy_user` or `postgres`) holding superuser/database-owner privileges. In staging and production environments, running an application runtime with database-owner permissions violates the Principle of Least Privilege and introduces severe operational and security vulnerabilities:

1. If an application service is compromised, an attacker can alter schemas, drop tables, or manipulate migration history (`_prisma_migrations`).
2. Automated deployment pipelines executing `prisma migrate dev` risk unintended interactive resets and schema drift in staging.
3. Health check probes that only check Node.js process uptime report healthy status even when the database is dead or unreachable (`OPS-01`).
4. Without dedicated connection pooling constraints, concurrent container scaling can quickly exhaust PostgreSQL `max_connections`.
5. Without verified backup automation and checksum validation, data recoverability cannot be guaranteed.

## Decision

We establish a dedicated Staging PostgreSQL Architecture governed by the following core decisions:

### 1. Tripartite Role-Based Access Control (RBAC)

PostgreSQL permissions are divided into three strictly isolated database identities:

- **`kinergy_migrator` (DDL + DML):** Used exclusively during pre-deployment CI/CD jobs executing `pnpm prisma:migrate:deploy`. Has `CREATE`, `ALTER`, and `DROP` privileges on schema `public` and ownership of `_prisma_migrations`.
- **`kinergy_app` (DML ONLY):** Used exclusively by the NestJS API application runtime. Holds `SELECT`, `INSERT`, `UPDATE`, `DELETE` on all current and future tables in `public`, and `USAGE, SELECT` on all sequences. `CREATE` on schema `public` is explicitly revoked. Cannot create, alter, or drop tables or extensions.
- **`kinergy_test` (DML + TRUNCATE):** Used exclusively by integration test runners. Holds DML permissions plus `TRUNCATE` for cleaning tables between integration tests.

### 2. Migration Execution Strategy

- `prisma migrate dev` is strictly prohibited in staging and production environments.
- All staging schema updates are executed via `pnpm prisma:migrate:deploy` run by `kinergy_migrator` prior to application rollout.

### 3. Application Health and Database Readiness Probes

- `GET /api/v1/health/liveness`: Probes Node.js process responsiveness without querying the database.
- `GET /api/v1/health/readiness`: Queries `SELECT 1` via `PrismaService` with a 2,000ms timeout. Fails with HTTP 503 (`ServiceUnavailableException`) if PostgreSQL is unresponsive, preventing ingress traffic routing to degraded instances.
- `GET /api/v1/health`: Backwards-compatible general status reporting database connection state and roundtrip latency.

### 4. Connection Pooling and Network Security

- Staging connection strings enforce connection bounds (`?connection_limit=10&pool_timeout=20`).
- Remote staging databases enforce TLS (`sslmode=require`).
- When running in Docker, staging runs on an isolated network (`kinergy_staging_network`) with non-colliding host port mapping (`5434:5432`) and distinct persistent volumes (`kinergy_staging_postgres_data`).

### 5. Automated Backup & Disaster Recovery Baseline

- Staging backups utilize compressed custom archives (`pg_dump --format=custom --blobs`) with SHA256 checksum generation.
- Automated retention policy purges staging archives older than 7 days.
- Recovery Point Objective (RPO) $\le 1$ hour; Recovery Time Objective (RTO) $\le 15$ minutes.

## Consequences

### Positive

- Strict isolation prevents runtime processes from modifying database structure or altering migration locks.
- Container orchestrators and ingress proxies can detect database failures immediately via `/api/v1/health/readiness`.
- `SEC-03` is remediated by rejecting default localhost database connections in production environments.
- Turnkey scripts allow instant disaster recovery verification and non-destructive backups.

### Neutral / Trade-offs

- Staging pre-deployment pipelines require two database connection credentials: `MIGRATION_DATABASE_URL` (for `kinergy_migrator`) and `DATABASE_URL` (for `kinergy_app`).
