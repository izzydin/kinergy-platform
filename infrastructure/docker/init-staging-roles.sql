-- ==============================================================================
-- Kinergy Platform - Staging PostgreSQL Database Initialization & Least-Privilege RBAC
-- File: infrastructure/docker/init-staging-roles.sql
-- ==============================================================================

-- 1. Enable Required Extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- 2. Define Least-Privilege Database Roles

-- Migration Execution Identity (DDL + DML)
-- Used exclusively during CI/CD pre-deployment step: 'pnpm prisma:migrate:deploy'
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'kinergy_migrator') THEN
    CREATE ROLE kinergy_migrator WITH LOGIN PASSWORD 'kinergy_migrator_secure_password';
  END IF;
END
$$;
GRANT kinergy_migrator TO CURRENT_USER;

-- Application Runtime Identity (DML ONLY - Least Privilege)
-- Used exclusively by the NestJS API server runtime. No table create/drop/alter permissions.
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'kinergy_app') THEN
    CREATE ROLE kinergy_app WITH LOGIN PASSWORD 'kinergy_app_secure_password';
  END IF;
END
$$;

-- Test Execution Identity (DML + TRUNCATE for isolated integration test resets)
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'kinergy_test') THEN
    CREATE ROLE kinergy_test WITH LOGIN PASSWORD 'kinergy_test_secure_password';
  END IF;
END
$$;

-- 3. Schema & Table Permissions

-- Migrator Permissions: Full DDL and DML on public schema
GRANT ALL ON SCHEMA public TO kinergy_migrator;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO kinergy_migrator;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO kinergy_migrator;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO kinergy_migrator;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO kinergy_migrator;

-- Application Runtime Permissions: DML only
GRANT USAGE ON SCHEMA public TO kinergy_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO kinergy_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO kinergy_app;

-- Ensure tables and sequences created by kinergy_migrator automatically grant DML to kinergy_app
ALTER DEFAULT PRIVILEGES FOR ROLE kinergy_migrator IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO kinergy_app;
ALTER DEFAULT PRIVILEGES FOR ROLE kinergy_migrator IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO kinergy_app;

-- Explicitly revoke DDL privileges from kinergy_app (Defense-in-depth)
REVOKE CREATE ON SCHEMA public FROM kinergy_app;

-- Test Runner Permissions: DML + TRUNCATE
GRANT USAGE ON SCHEMA public TO kinergy_test;
GRANT SELECT, INSERT, UPDATE, DELETE, TRUNCATE ON ALL TABLES IN SCHEMA public TO kinergy_test;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO kinergy_test;
ALTER DEFAULT PRIVILEGES FOR ROLE kinergy_migrator IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE, TRUNCATE ON TABLES TO kinergy_test;
ALTER DEFAULT PRIVILEGES FOR ROLE kinergy_migrator IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO kinergy_test;
REVOKE CREATE ON SCHEMA public FROM kinergy_test;

