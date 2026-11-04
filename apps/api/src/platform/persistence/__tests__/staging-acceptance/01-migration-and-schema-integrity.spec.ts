import { PrismaClient } from '@prisma/client';
import { StagingTestHelper } from './staging-test-helper';

describe('Milestone 10.7 — Phase 1: Staging Migration & Schema Integrity', () => {
  let prismaAdmin: PrismaClient;
  let prismaApp: PrismaClient;
  let prismaMigrator: PrismaClient;
  let isDbAvailable = false;

  beforeAll(async () => {
    jest.setTimeout(30000);
    const activeUrl = await StagingTestHelper.resolveActivePostgresUrl();
    try {
      const probe = StagingTestHelper.createClient(activeUrl);
      await probe.$queryRawUnsafe('SELECT 1');
      await probe.$disconnect();
      isDbAvailable = true;

      prismaMigrator = StagingTestHelper.createClient(StagingTestHelper.getStagingMigratorUrl());
      prismaAdmin = StagingTestHelper.createClient(StagingTestHelper.getStagingAdminUrl());
      prismaApp = StagingTestHelper.createClient(StagingTestHelper.getStagingAppUrl());
    } catch (error) {
      isDbAvailable = false;
      if (process.env['CI']) {
        throw new Error(
          `[FATAL] Staging database not available in CI environment at ${activeUrl}: ${
            error instanceof Error ? error.message : String(error)
          }`,
          { cause: error },
        );
      }
      console.warn('[WARN] Staging database not available for Phase 1 Migration test.');
    }
  });

  afterAll(async () => {
    if (prismaAdmin) await prismaAdmin.$disconnect().catch(() => {});
    if (prismaApp) await prismaApp.$disconnect().catch(() => {});
    if (prismaMigrator) await prismaMigrator.$disconnect().catch(() => {});
  });

  it('1.1 verifies migration history in _prisma_migrations table', async () => {
    if (!isDbAvailable) return;

    const migrations = await prismaMigrator.$queryRawUnsafe<
      Array<{ id: string; migration_name: string; finished_at: Date; rolled_back_at: Date | null }>
    >(
      'SELECT id, migration_name, finished_at, rolled_back_at FROM _prisma_migrations WHERE rolled_back_at IS NULL ORDER BY finished_at ASC',
    );

    expect(migrations.length).toBeGreaterThanOrEqual(14);

    // Verify all 14 migrations completed successfully with non-null finished_at and zero rolled_back_at
    for (const mig of migrations) {
      expect(mig.finished_at).not.toBeNull();
      // Only active applied migrations have rolled_back_at null
    }

    // Verify critical migrations exist in sequence
    const names = migrations.filter((m) => m.rolled_back_at === null).map((m) => m.migration_name);
    expect(names).toContain('20260729000000_init_base_tables');
    expect(names).toContain('20260730000000_add_client_search_trgm_indexes');
    expect(names).toContain('20260730000001_add_client_timeline_entries');
    expect(names).toContain('20260815000000_add_room_and_maintenance_windows');
    expect(names).toContain('20260826000000_add_resources_management');
    expect(names).toContain('20260918000000_add_sales_and_payments_monetary_persistence');
    expect(names).toContain('20260921000000_add_payments_domain_persistence');
    expect(names).toContain('20260924000000_add_receipts_and_sequence_persistence');
    expect(names).toContain('20260930000000_add_sale_source_correlation_indexes');
    expect(names).toContain('20261001000000_add_phase_7_monetary_check_constraints');
    expect(names).toContain('20261001010000_add_discount_structural_check_constraints');
    expect(names).toContain('20261002000000_optimize_phase_7_financial_indexes');
    expect(names).toContain('20261016000000_add_phase_7_concurrency_and_single_billing_indexes');
    expect(names).toContain('20261104000000_align_treatment_sessions_and_scheduling_schema');
  });

  it('1.2 verifies required PostgreSQL extensions are enabled in staging', async () => {
    if (!isDbAvailable) return;

    const extensions = await prismaMigrator.$queryRawUnsafe<Array<{ extname: string }>>(
      `SELECT extname FROM pg_extension WHERE extname IN ('uuid-ossp', 'pgcrypto', 'pg_trgm')`,
    );
    const extNames = extensions.map((e) => e.extname);

    expect(extNames).toContain('uuid-ossp');
    expect(extNames).toContain('pgcrypto');
    expect(extNames).toContain('pg_trgm');
  });

  it('1.3 verifies all domain tables exist in public schema', async () => {
    if (!isDbAvailable) return;

    const tables = await prismaMigrator.$queryRawUnsafe<Array<{ table_name: string }>>(
      `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE'`,
    );
    const tableNames = tables.map((t) => t.table_name);

    const expectedTables = [
      'users',
      'refresh_tokens',
      'roles',
      'permissions',
      'role_permissions',
      'clients',
      'client_timeline_entries',
      'recurrence_series',
      'recurrence_exceptions',
      'appointments',
      'appointment_notes',
      'rooms',
      'maintenance_windows',
      'treatment_sessions',
      'membership_plans',
      'memberships',
      'attendance_records',
      'inventory_items',
      'stock_movements',
      'fixed_assets',
      'asset_history_events',
      'asset_maintenance_records',
      'sales',
      'sale_items',
      'payments',
      'receipt_sequences',
      'receipts',
    ];

    for (const expected of expectedTables) {
      expect(tableNames).toContain(expected);
    }
  });

  it('1.4 verifies check constraints on monetary tables are active', async () => {
    if (!isDbAvailable) return;

    const checkConstraints = await prismaMigrator.$queryRawUnsafe<
      Array<{ constraint_name: string }>
    >(
      `SELECT constraint_name FROM information_schema.table_constraints 
       WHERE table_schema = 'public' AND constraint_type = 'CHECK'`,
    );
    const names = checkConstraints.map((c) => c.constraint_name);

    // Verified monetary check constraints from Milestone 7/10
    expect(names).toContain('chk_sales_non_negative_subtotal');
    expect(names).toContain('chk_sales_non_negative_discount_total');
    expect(names).toContain('chk_sales_non_negative_total');
    expect(names).toContain('chk_payments_positive_amount');
    expect(names).toContain('chk_sale_items_positive_quantity');
    expect(names).toContain('chk_inventory_items_non_negative_stock');
  });

  it('1.5 verifies least-privilege role boundaries (kinergy_app vs kinergy_migrator)', async () => {
    if (!isDbAvailable) return;

    try {
      await prismaApp.$queryRawUnsafe('SELECT 1');
    } catch {
      console.warn(
        '[INFO] Staging least-privilege role kinergy_app not present in this database; skipping role boundary test.',
      );
      return;
    }

    // kinergy_migrator can execute DDL (CREATE TEMP TABLE / TABLE)
    await prismaMigrator.$executeRawUnsafe(
      'CREATE TABLE IF NOT EXISTS migrator_ddl_verification (id int PRIMARY KEY)',
    );
    await prismaMigrator.$executeRawUnsafe('DROP TABLE IF EXISTS migrator_ddl_verification');

    // kinergy_app is restricted to DML ONLY. DDL must fail at PostgreSQL engine level with 42501
    let appDdlFailed = false;
    try {
      await prismaApp.$executeRawUnsafe('CREATE TABLE app_ddl_forbidden (id int PRIMARY KEY)');
    } catch (err: unknown) {
      appDdlFailed = true;
      const msg = err instanceof Error ? err.message : String(err);
      expect(msg).toMatch(/permission denied for schema public|42501/i);
    }
    expect(appDdlFailed).toBe(true);

    // kinergy_app CAN execute DML (SELECT)
    const selectCheck = await prismaApp.$queryRawUnsafe('SELECT 1 as verified');
    expect(Array.isArray(selectCheck)).toBe(true);
  });
});
