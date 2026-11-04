import { PrismaClient } from '@prisma/client';

export interface StagingDbConfig {
  url: string;
  isStagingPort5434: boolean;
  isAvailable: boolean;
}

export class StagingTestHelper {
  private static resolvedUrl: string | null = null;

  public static resetResolvedUrl(): void {
    this.resolvedUrl = null;
  }

  public static getStagingAdminUrl(): string {
    return (
      process.env['STAGING_ADMIN_DATABASE_URL'] ||
      'postgresql://kinergy_staging_admin:kinergy_staging_admin_password@127.0.0.1:5434/kinergy_staging?schema=public'
    );
  }

  public static getStagingMigratorUrl(): string {
    return (
      process.env['STAGING_MIGRATOR_DATABASE_URL'] ||
      'postgresql://kinergy_migrator:kinergy_migrator_secure_password@127.0.0.1:5434/kinergy_staging?schema=public'
    );
  }

  public static getStagingAppUrl(): string {
    return (
      process.env['STAGING_DATABASE_URL'] ||
      'postgresql://kinergy_app:kinergy_app_secure_password@127.0.0.1:5434/kinergy_staging?schema=public'
    );
  }

  public static getStagingTestUrl(): string {
    return (
      process.env['STAGING_TEST_DATABASE_URL'] ||
      'postgresql://kinergy_test:kinergy_test_secure_password@127.0.0.1:5434/kinergy_staging?schema=public'
    );
  }

  /**
   * Deterministically provisions staging roles and permissions if connected to the administrative endpoint.
   * Ensures kinergy_migrator, kinergy_app, and kinergy_test exist with proper RBAC boundaries.
   */
  public static async provisionStagingRolesAndSchema(): Promise<void> {
    const adminUrl = this.getStagingAdminUrl();
    const adminClient = new PrismaClient({
      datasources: { db: { url: adminUrl } },
    });
    try {
      await adminClient.$queryRawUnsafe('SELECT 1');
      const roles = await adminClient.$queryRawUnsafe<Array<{ rolname: string }>>(
        `SELECT rolname FROM pg_catalog.pg_roles WHERE rolname IN ('kinergy_migrator', 'kinergy_app', 'kinergy_test')`,
      );
      if (roles.length < 3) {
        const sqlStatements = [
          `CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`,
          `CREATE EXTENSION IF NOT EXISTS "pgcrypto"`,
          `CREATE EXTENSION IF NOT EXISTS "pg_trgm"`,
          `DO $$ BEGIN IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'kinergy_migrator') THEN CREATE ROLE kinergy_migrator WITH LOGIN PASSWORD 'kinergy_migrator_secure_password'; END IF; END $$`,
          `GRANT kinergy_migrator TO CURRENT_USER`,
          `DO $$ BEGIN IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'kinergy_app') THEN CREATE ROLE kinergy_app WITH LOGIN PASSWORD 'kinergy_app_secure_password'; END IF; END $$`,
          `DO $$ BEGIN IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'kinergy_test') THEN CREATE ROLE kinergy_test WITH LOGIN PASSWORD 'kinergy_test_secure_password'; END IF; END $$`,
          `GRANT ALL ON SCHEMA public TO kinergy_migrator`,
          `GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO kinergy_migrator`,
          `GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO kinergy_migrator`,
          `ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO kinergy_migrator`,
          `ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO kinergy_migrator`,
          `GRANT USAGE ON SCHEMA public TO kinergy_app`,
          `GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO kinergy_app`,
          `GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO kinergy_app`,
          `ALTER DEFAULT PRIVILEGES FOR ROLE kinergy_migrator IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO kinergy_app`,
          `ALTER DEFAULT PRIVILEGES FOR ROLE kinergy_migrator IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO kinergy_app`,
          `ALTER DEFAULT PRIVILEGES FOR ROLE kinergy_staging_admin IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO kinergy_app`,
          `ALTER DEFAULT PRIVILEGES FOR ROLE kinergy_staging_admin IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO kinergy_app`,
          `REVOKE CREATE ON SCHEMA public FROM kinergy_app`,
          `GRANT USAGE ON SCHEMA public TO kinergy_test`,
          `GRANT SELECT, INSERT, UPDATE, DELETE, TRUNCATE ON ALL TABLES IN SCHEMA public TO kinergy_test`,
          `GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO kinergy_test`,
          `ALTER DEFAULT PRIVILEGES FOR ROLE kinergy_migrator IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE, TRUNCATE ON TABLES TO kinergy_test`,
          `ALTER DEFAULT PRIVILEGES FOR ROLE kinergy_migrator IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO kinergy_test`,
          `ALTER DEFAULT PRIVILEGES FOR ROLE kinergy_staging_admin IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE, TRUNCATE ON TABLES TO kinergy_test`,
          `ALTER DEFAULT PRIVILEGES FOR ROLE kinergy_staging_admin IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO kinergy_test`,
          `REVOKE CREATE ON SCHEMA public FROM kinergy_test`,
        ];

        for (const stmt of sqlStatements) {
          await adminClient.$executeRawUnsafe(stmt);
        }
      }
    } catch {
      // If admin connection not available or roles already provisioned, continue
    } finally {
      await adminClient.$disconnect().catch(() => {});
    }
  }

  /**
   * Resolves the active PostgreSQL database URL for integration tests.
   * Priority:
   * 1. STAGING_TEST_DATABASE_URL / port 5434 (kinergy_staging with kinergy_test role)
   * 2. STAGING_MIGRATOR_DATABASE_URL / STAGING_DATABASE_URL
   * 3. DATABASE_URL / port 5433 (kinergy_dev / CI service with kinergy_user)
   */
  public static async resolveActivePostgresUrl(): Promise<string> {
    if (this.resolvedUrl) return this.resolvedUrl;

    // Ensure staging roles exist if staging admin endpoint is available
    await this.provisionStagingRolesAndSchema();

    const candidateUrls = [
      process.env['STAGING_TEST_DATABASE_URL'],
      'postgresql://kinergy_test:kinergy_test_secure_password@127.0.0.1:5434/kinergy_staging?schema=public',
      process.env['STAGING_MIGRATOR_DATABASE_URL'],
      'postgresql://kinergy_migrator:kinergy_migrator_secure_password@127.0.0.1:5434/kinergy_staging?schema=public',
      process.env['STAGING_DATABASE_URL'],
      'postgresql://kinergy_app:kinergy_app_secure_password@127.0.0.1:5434/kinergy_staging?schema=public',
      process.env['STAGING_ADMIN_DATABASE_URL'],
      'postgresql://kinergy_staging_admin:kinergy_staging_admin_password@127.0.0.1:5434/kinergy_staging?schema=public',
      process.env['DATABASE_URL'],
      'postgresql://kinergy_user:kinergy_secure_pass@127.0.0.1:5433/kinergy_dev?schema=public',
    ].filter((u): u is string => !!u);

    for (const url of candidateUrls) {
      const probeClient = new PrismaClient({
        datasources: { db: { url } },
      });
      try {
        await probeClient.$queryRawUnsafe('SELECT 1');
        await probeClient.$disconnect();
        this.resolvedUrl = url;
        return url;
      } catch {
        await probeClient.$disconnect().catch(() => {});
      }
    }

    // Default to staging test URL if neither answered probe immediately
    this.resolvedUrl = this.getStagingTestUrl();
    return this.resolvedUrl;
  }

  public static createClient(customUrl?: string): PrismaClient {
    const url = customUrl || (this.resolvedUrl ?? this.getStagingTestUrl());
    return new PrismaClient({
      datasources: { db: { url } },
    });
  }

  public static generateTestRunPrefix(scope: string): string {
    const timestamp = Date.now().toString(36);
    const rand = Math.random().toString(36).substring(2, 6);
    return `M10_7_${scope}_${timestamp}_${rand}`;
  }

  /**
   * Safely deletes only the records belonging to the test namespace in reverse dependency order.
   */
  public static async cleanupTestNamespace(
    prisma: PrismaClient,
    namespacePrefix: string,
  ): Promise<void> {
    try {
      // 1. Receipts
      await prisma.$executeRawUnsafe(
        `DELETE FROM receipts WHERE receipt_number LIKE $1 OR tenant_id LIKE $1`,
        `${namespacePrefix}%`,
      );

      // 2. Payments
      await prisma.$executeRawUnsafe(
        `DELETE FROM payments WHERE reference LIKE $1 OR tenant_id LIKE $1`,
        `${namespacePrefix}%`,
      );

      // 3. Sale Items & Sales
      await prisma.$executeRawUnsafe(
        `DELETE FROM sale_items WHERE sale_id IN (SELECT id FROM sales WHERE source_id LIKE $1 OR tenant_id LIKE $1)`,
        `${namespacePrefix}%`,
      );
      await prisma.$executeRawUnsafe(
        `DELETE FROM sales WHERE source_id LIKE $1 OR tenant_id LIKE $1`,
        `${namespacePrefix}%`,
      );

      // 4. Receipt Sequences
      await prisma.$executeRawUnsafe(
        `DELETE FROM receipt_sequences WHERE tenant_id LIKE $1`,
        `${namespacePrefix}%`,
      );

      // 5. Stock Movements & Inventory
      await prisma.$executeRawUnsafe(
        `DELETE FROM stock_movements WHERE inventory_item_id IN (SELECT id FROM inventory_items WHERE sku LIKE $1 OR name LIKE $1 OR tenant_id LIKE $1) OR reason LIKE $2 OR reference_id LIKE $2`,
        `${namespacePrefix}%`,
        `%${namespacePrefix}%`,
      );
      await prisma.$executeRawUnsafe(
        `DELETE FROM inventory_items WHERE sku LIKE $1 OR name LIKE $1 OR tenant_id LIKE $1`,
        `${namespacePrefix}%`,
      );

      // 6. Fixed Assets & Events
      await prisma.$executeRawUnsafe(
        `DELETE FROM asset_history_events WHERE asset_id IN (SELECT id FROM fixed_assets WHERE asset_tag LIKE $1)`,
        `${namespacePrefix}%`,
      );
      await prisma.$executeRawUnsafe(
        `DELETE FROM asset_maintenance_records WHERE asset_id IN (SELECT id FROM fixed_assets WHERE asset_tag LIKE $1)`,
        `${namespacePrefix}%`,
      );
      await prisma.$executeRawUnsafe(
        `DELETE FROM fixed_assets WHERE asset_tag LIKE $1 OR name LIKE $1`,
        `${namespacePrefix}%`,
      );

      // 7. Kinesiology Treatment Sessions
      await prisma.$executeRawUnsafe(
        `DELETE FROM treatment_sessions WHERE client_id IN (SELECT id FROM clients WHERE reference_number LIKE $1)`,
        `${namespacePrefix}%`,
      );

      // 8. Scheduling Appointments & Notes & Rooms
      await prisma.$executeRawUnsafe(
        `DELETE FROM appointment_notes WHERE appointment_id IN (SELECT id FROM appointments WHERE client_id IN (SELECT id FROM clients WHERE reference_number LIKE $1))`,
        `${namespacePrefix}%`,
      );
      await prisma.$executeRawUnsafe(
        `DELETE FROM recurrence_exceptions WHERE series_id IN (SELECT series_id FROM appointments WHERE client_id IN (SELECT id FROM clients WHERE reference_number LIKE $1) AND series_id IS NOT NULL)`,
        `${namespacePrefix}%`,
      );
      await prisma.$executeRawUnsafe(
        `DELETE FROM recurrence_series WHERE id IN (SELECT series_id FROM appointments WHERE client_id IN (SELECT id FROM clients WHERE reference_number LIKE $1) AND series_id IS NOT NULL)`,
        `${namespacePrefix}%`,
      );
      await prisma.$executeRawUnsafe(
        `DELETE FROM appointments WHERE client_id IN (SELECT id FROM clients WHERE reference_number LIKE $1)`,
        `${namespacePrefix}%`,
      );
      await prisma.$executeRawUnsafe(
        `DELETE FROM maintenance_windows WHERE room_id IN (SELECT id FROM rooms WHERE name LIKE $1)`,
        `${namespacePrefix}%`,
      );
      await prisma.$executeRawUnsafe(`DELETE FROM rooms WHERE name LIKE $1`, `${namespacePrefix}%`);

      // 9. Gym Attendance & Memberships & Plans
      await prisma.$executeRawUnsafe(
        `DELETE FROM attendance_records WHERE client_id IN (SELECT id FROM clients WHERE reference_number LIKE $1)`,
        `${namespacePrefix}%`,
      );
      await prisma.$executeRawUnsafe(
        `DELETE FROM memberships WHERE client_id IN (SELECT id FROM clients WHERE reference_number LIKE $1)`,
        `${namespacePrefix}%`,
      );
      await prisma.$executeRawUnsafe(
        `DELETE FROM membership_plans WHERE code LIKE $1`,
        `${namespacePrefix}%`,
      );

      // 10. Client Timeline & Clients
      await prisma.$executeRawUnsafe(
        `DELETE FROM client_timeline_entries WHERE client_id IN (SELECT id FROM clients WHERE reference_number LIKE $1)`,
        `${namespacePrefix}%`,
      );
      await prisma.$executeRawUnsafe(
        `DELETE FROM clients WHERE reference_number LIKE $1 OR email LIKE $1`,
        `${namespacePrefix}%`,
      );

      // 11. Users & Refresh Tokens & Roles
      await prisma.$executeRawUnsafe(
        `DELETE FROM refresh_tokens WHERE user_id IN (SELECT id FROM users WHERE email LIKE $1)`,
        `${namespacePrefix}%`,
      );
      await prisma.$executeRawUnsafe(
        `DELETE FROM users WHERE email LIKE $1`,
        `${namespacePrefix}%`,
      );
      await prisma.$executeRawUnsafe(`DELETE FROM roles WHERE name LIKE $1`, `${namespacePrefix}%`);
    } catch (error) {
      console.warn(`[WARN] Cleanup for namespace ${namespacePrefix} encountered an issue:`, error);
    }
  }
}
