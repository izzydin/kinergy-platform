# 6. Docker Infrastructure for Local Development

- **Status:** Accepted
- **Date:** 2026-07-24

## Context and Problem Statement

To enable consistent, reproducible local development without requiring manual database installation across developer machines, we require containerized infrastructure for PostgreSQL and database management.

## Decision Drivers

- Zero manual database setup for local development.
- Environment variable configuration parity across developer environments.
- Persistence of local development data across container restarts.
- Health checks ensuring database readiness before dependent services connect.

## Decision Outcome

Chosen Option: **Docker Compose with PostgreSQL 16 and Adminer**.

### Architecture Specifications

1. **PostgreSQL Service (`postgres:16-alpine`)**:
   - Exposed on port `5432`.
   - Healthcheck executing `pg_isready -U ${POSTGRES_USER} -d ${POSTGRES_DB}`.
   - Mounting `./infrastructure/docker/init-db.sql` to initialize `uuid-ossp` and `pgcrypto` extensions.
   - Named volume `kinergy_postgres_data` for data persistence.
2. **Adminer Management UI (`adminer:latest`)**:
   - Exposed on port `8080`.
   - Configured with `depends_on` condition waiting for `postgres` healthcheck status (`service_healthy`).

## Consequences

### Positive

- One command setup: `docker compose up -d`.
- Isolated, containerized environment preventing port/version conflicts on host OS.
- Pre-configured extensions ready for domain entities and ORM migrations.
