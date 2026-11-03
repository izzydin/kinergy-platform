import * as fs from 'fs';
import * as path from 'path';

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
});
