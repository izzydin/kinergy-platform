import * as fs from 'fs';
import * as path from 'path';
import { PrismaClient } from '@prisma/client';
import { StagingTestHelper } from './staging-acceptance/staging-test-helper';

describe('Milestone 10.6 — Staging PostgreSQL Provisioning and Validation Specification', () => {
  const rootDir = process.cwd();
  const prismaDir = path.join(rootDir, 'prisma');
  const migrationsDir = path.join(prismaDir, 'migrations');
  const infraDockerDir = path.join(rootDir, 'infrastructure/docker');
  const infraScriptsDir = path.join(rootDir, 'infrastructure/scripts');
  const stagingComposePath = path.join(rootDir, 'docker-compose.staging.yml');

  // ==========================================================================
  // 1. Staging Database Infrastructure & Role RBAC
  // ==========================================================================
  describe('1. Staging Infrastructure & Least-Privilege RBAC Definitions', () => {
    it('verifies init-staging-roles.sql defines separate migrator and runtime identities', () => {
      const initRolesSqlPath = path.join(infraDockerDir, 'init-staging-roles.sql');
      expect(fs.existsSync(initRolesSqlPath)).toBe(true);

      const sql = fs.readFileSync(initRolesSqlPath, 'utf8');

      // Verify required PostgreSQL extensions
      expect(sql).toContain('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"');
      expect(sql).toContain('CREATE EXTENSION IF NOT EXISTS "pgcrypto"');
      expect(sql).toContain('CREATE EXTENSION IF NOT EXISTS "pg_trgm"');

      // Verify migration identity (DDL + DML)
      expect(sql).toContain("rolname = 'kinergy_migrator'");
      expect(sql).toContain('GRANT ALL ON SCHEMA public TO kinergy_migrator');

      // Verify application runtime identity (DML only)
      expect(sql).toContain("rolname = 'kinergy_app'");
      expect(sql).toContain(
        'GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO kinergy_app',
      );
      expect(sql).toContain('GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO kinergy_app');

      // Verify defense-in-depth: explicit revocation of CREATE from app runtime
      expect(sql).toContain('REVOKE CREATE ON SCHEMA public FROM kinergy_app');

      // Verify test identity
      expect(sql).toContain("rolname = 'kinergy_test'");
      expect(sql).toContain(
        'GRANT SELECT, INSERT, UPDATE, DELETE, TRUNCATE ON ALL TABLES IN SCHEMA public TO kinergy_test',
      );
    });

    it('verifies docker-compose.staging.yml configures an isolated environment', () => {
      expect(fs.existsSync(stagingComposePath)).toBe(true);

      const composeContent = fs.readFileSync(stagingComposePath, 'utf8');

      // Verify pinned PostgreSQL version
      expect(composeContent).toContain('image: postgres:16-alpine');

      // Verify isolated staging network and volume
      expect(composeContent).toContain('kinergy_staging_network');
      expect(composeContent).toContain('kinergy_staging_postgres_data');

      // Verify non-colliding host port
      expect(composeContent).toContain('${STAGING_POSTGRES_PORT:-5434}:5432');

      // Verify initialization script mount
      expect(composeContent).toContain('init-staging-roles.sql');

      // Verify API runtime connects as least-privilege kinergy_app
      expect(composeContent).toContain('kinergy_app');
      expect(composeContent).toContain('connection_limit=10');
    });
  });

  // ==========================================================================
  // 2. Backup & Restore Automation Scripts
  // ==========================================================================
  describe('2. Backup Baseline & Disaster Recovery Scripts', () => {
    it('verifies non-destructive, compressed backup scripts exist for bash and powershell', () => {
      const bashBackup = path.join(infraScriptsDir, 'backup-staging-db.sh');
      const psBackup = path.join(infraScriptsDir, 'backup-staging-db.ps1');

      expect(fs.existsSync(bashBackup)).toBe(true);
      expect(fs.existsSync(psBackup)).toBe(true);

      const bashContent = fs.readFileSync(bashBackup, 'utf8');
      expect(bashContent).toContain('pg_dump');
      expect(bashContent).toContain('--format=custom');
      expect(bashContent).toContain('sha256');

      const psContent = fs.readFileSync(psBackup, 'utf8');
      expect(psContent).toContain('pg_dump');
      expect(psContent).toContain('SHA256');
    });

    it('verifies restore scripts exist and enforce checksum verification', () => {
      const bashRestore = path.join(infraScriptsDir, 'restore-staging-db.sh');
      const psRestore = path.join(infraScriptsDir, 'restore-staging-db.ps1');

      expect(fs.existsSync(bashRestore)).toBe(true);
      expect(fs.existsSync(psRestore)).toBe(true);

      const bashContent = fs.readFileSync(bashRestore, 'utf8');
      expect(bashContent).toContain('pg_restore');
      expect(bashContent).toContain('--clean');

      const psContent = fs.readFileSync(psRestore, 'utf8');
      expect(psContent).toContain('pg_restore');
      expect(psContent).toContain('Get-FileHash');
    });
  });

  // ==========================================================================
  // 3. Prisma Schema & Migration Baseline
  // ==========================================================================
  describe('3. Prisma Schema & Migration Baseline Integrity', () => {
    it('verifies datasource provider is postgresql in schema.prisma', () => {
      const schemaFile = path.join(prismaDir, 'schema.prisma');
      const schema = fs.readFileSync(schemaFile, 'utf8');
      expect(schema).toContain('provider = "postgresql"');
    });

    it('verifies migration_lock.toml specifies postgresql provider', () => {
      const lockFile = path.join(migrationsDir, 'migration_lock.toml');
      expect(fs.existsSync(lockFile)).toBe(true);
      const lockContent = fs.readFileSync(lockFile, 'utf8');
      expect(lockContent).toContain('provider = "postgresql"');
    });

    it('verifies package.json provides safe prisma:migrate:deploy target for staging', () => {
      const pkgJsonPath = path.join(rootDir, 'package.json');
      const pkgJson = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf8'));
      expect(pkgJson.scripts['prisma:migrate:deploy']).toBe('prisma migrate deploy');
      expect(pkgJson.scripts['prisma:migrate:status']).toBe('prisma migrate status');
    });
  });

  // ==========================================================================
  // 4. Staging Connection Parameters & URL Validation
  // ==========================================================================
  describe('4. Connection Pool & SSL Parameter Extraction', () => {
    it('correctly parses connection limit and pool timeout from staging connection strings', () => {
      const stagingUrl =
        'postgresql://kinergy_app:secret@db.staging.internal:5432/kinergy_staging?schema=public&sslmode=require&connection_limit=15&pool_timeout=25';

      const parsed = new URL(stagingUrl);
      expect(parsed.protocol).toBe('postgresql:');
      expect(parsed.hostname).toBe('db.staging.internal');
      expect(parsed.port).toBe('5432');
      expect(parsed.username).toBe('kinergy_app');
      expect(parsed.password).toBe('secret');
      expect(parsed.pathname).toBe('/kinergy_staging');
      expect(parsed.searchParams.get('sslmode')).toBe('require');
      expect(parsed.searchParams.get('connection_limit')).toBe('15');
      expect(parsed.searchParams.get('pool_timeout')).toBe('25');
    });
  });

  // ==========================================================================
  // 5. Staging PostgreSQL Live Connectivity & Role Isolation Probe
  // ==========================================================================
  describe('5. Live Staging Database Probe & Least-Privilege Role Validation', () => {
    it('successfully connects as kinergy_app and verifies table existence and DDL prevention', async () => {
      const stagingUrl =
        process.env['STAGING_DATABASE_URL'] ||
        'postgresql://kinergy_app:kinergy_app_secure_password@localhost:5434/kinergy_staging?schema=public';

      const prisma = new PrismaClient({
        datasources: { db: { url: stagingUrl } },
      });

      try {
        const ping = await prisma.$queryRawUnsafe('SELECT 1 as result');
        expect(Array.isArray(ping)).toBe(true);

        // Verify DDL rejection (defense-in-depth: kinergy_app cannot create tables)
        await expect(
          prisma.$executeRawUnsafe('CREATE TABLE probe_violation (id text)'),
        ).rejects.toThrow();
      } catch (err: unknown) {
        // If staging container is not running (e.g. offline CI without docker), skip gracefully
        if (err instanceof Error && err.message.includes("Can't reach database server")) {
          console.warn('[WARN] Staging database not running on port 5434; skipping live probe.');
          return;
        }
        throw err;
      } finally {
        await prisma.$disconnect();
      }
    });
  });

  // ==========================================================================
  // 6. Staging & CI Shared Infrastructure, RBAC Isolation & Port Consistency
  // ==========================================================================
  describe('6. Staging & CI Shared Infrastructure, RBAC Isolation & Port Consistency', () => {
    const originalEnv = { ...process.env };

    afterEach(() => {
      process.env = { ...originalEnv };
      StagingTestHelper.resetResolvedUrl();
    });

    it('verifies CI workflow configures dedicated staging-postgres service on port 5434 alongside dev postgres on port 5433', () => {
      const ciYmlPath = path.join(rootDir, '.github/workflows/ci.yml');
      expect(fs.existsSync(ciYmlPath)).toBe(true);
      const ciContent = fs.readFileSync(ciYmlPath, 'utf8');

      // Development PostgreSQL service on port 5433
      expect(ciContent).toContain('- 5433:5432');
      expect(ciContent).toContain(':5433/kinergy_dev');
      expect(ciContent).toContain('DATABASE_URL:');

      // Staging PostgreSQL service on port 5434
      expect(ciContent).toContain('- 5434:5432');
      expect(ciContent).toContain(':5434/kinergy_staging');
      expect(ciContent).toContain('STAGING_ADMIN_DATABASE_URL:');
      expect(ciContent).toContain('STAGING_MIGRATOR_DATABASE_URL:');
      expect(ciContent).toContain('STAGING_DATABASE_URL:');
      expect(ciContent).toContain('STAGING_TEST_DATABASE_URL:');

      // Provisioning and migration deployment steps
      expect(ciContent).toContain('init-staging-roles.sql');
      expect(ciContent).toContain('STAGING_MIGRATOR_DATABASE_URL');
    });

    it('verifies staging role URLs maintain strict RBAC isolation without conflation or silent dev fallback', () => {
      delete process.env['STAGING_ADMIN_DATABASE_URL'];
      delete process.env['STAGING_MIGRATOR_DATABASE_URL'];
      delete process.env['STAGING_DATABASE_URL'];
      delete process.env['STAGING_TEST_DATABASE_URL'];
      StagingTestHelper.resetResolvedUrl();

      const adminUrl = StagingTestHelper.getStagingAdminUrl();
      const migratorUrl = StagingTestHelper.getStagingMigratorUrl();
      const appUrl = StagingTestHelper.getStagingAppUrl();
      const testUrl = StagingTestHelper.getStagingTestUrl();

      // All target dedicated staging port 5434
      expect(adminUrl).toContain('127.0.0.1:5434/kinergy_staging');
      expect(migratorUrl).toContain('127.0.0.1:5434/kinergy_staging');
      expect(appUrl).toContain('127.0.0.1:5434/kinergy_staging');
      expect(testUrl).toContain('127.0.0.1:5434/kinergy_staging');

      // Distinct identities without role conflation
      expect(adminUrl).toContain('kinergy_staging_admin');
      expect(migratorUrl).toContain('kinergy_migrator');
      expect(appUrl).toContain('kinergy_app');
      expect(testUrl).toContain('kinergy_test');

      // Never silently fall back to development superuser
      expect(adminUrl).not.toContain('kinergy_user');
      expect(migratorUrl).not.toContain('kinergy_user');
      expect(appUrl).not.toContain('kinergy_user');
      expect(testUrl).not.toContain('kinergy_user');
      expect(appUrl).not.toContain(':5433');
    });

    it('verifies explicit environment variable overrides take precedence per identity', () => {
      process.env['STAGING_MIGRATOR_DATABASE_URL'] =
        'postgresql://custom_migrator:custom_pass@127.0.0.1:5434/custom_staging?schema=public';
      process.env['STAGING_DATABASE_URL'] =
        'postgresql://custom_app:custom_pass@127.0.0.1:5434/custom_staging?schema=public';

      expect(StagingTestHelper.getStagingMigratorUrl()).toBe(
        'postgresql://custom_migrator:custom_pass@127.0.0.1:5434/custom_staging?schema=public',
      );
      expect(StagingTestHelper.getStagingAppUrl()).toBe(
        'postgresql://custom_app:custom_pass@127.0.0.1:5434/custom_staging?schema=public',
      );
    });

    it('verifies security test assertions distinguish permission-denied errors from connection failures', () => {
      const permissionRegex = /permission denied for schema public|42501/i;

      // Genuine PostgreSQL 42501 permission error must match
      const genuineDdlDenial = 'ERROR: permission denied for schema public (SQLSTATE 42501)';
      expect(permissionRegex.test(genuineDdlDenial)).toBe(true);

      // Connection failures must NOT match and cannot be mistaken for permission denial
      const connectionError =
        "PrismaClientInitializationError: Can't reach database server at 127.0.0.1:5434";
      expect(permissionRegex.test(connectionError)).toBe(false);
    });
  });
});
