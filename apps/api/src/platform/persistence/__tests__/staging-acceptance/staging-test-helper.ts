import { PrismaClient } from '@prisma/client';

export interface StagingDbConfig {
  url: string;
  isStagingPort5434: boolean;
  isAvailable: boolean;
}

export class StagingTestHelper {
  private static resolvedUrl: string | null = null;

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
   * Resolves the active PostgreSQL database URL for integration tests.
   * Priority:
   * 1. STAGING_DATABASE_URL / STAGING_TEST_DATABASE_URL if defined
   * 2. Port 5434 (kinergy_staging with kinergy_test role)
   * 3. Port 5433 (kinergy_dev / CI service with kinergy_user)
   */
  public static async resolveActivePostgresUrl(): Promise<string> {
    if (this.resolvedUrl) return this.resolvedUrl;

    const candidateUrls = [
      process.env['STAGING_TEST_DATABASE_URL'],
      process.env['STAGING_DATABASE_URL'],
      'postgresql://kinergy_test:kinergy_test_secure_password@127.0.0.1:5434/kinergy_staging?schema=public',
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
