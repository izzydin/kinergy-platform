/**
 * Authoritative table truncation order for Phase 7 financial tables.
 * Must be truncated in reverse dependency order to respect RESTRICT foreign keys.
 */
export const PHASE_7_FINANCIAL_TABLES_CLEANUP_ORDER: readonly string[] = Object.freeze([
  'receipts', // References sales(id) ON DELETE RESTRICT
  'payments', // References sales(id) ON DELETE RESTRICT
  'sale_items', // References sales(id) ON DELETE CASCADE
  'sales', // Parent Aggregate Root
  'receipt_sequences', // Monotonic counter table
]);

/**
 * Contract for database cleanup handlers in test environments.
 */
export interface IDatabaseTestCleaner {
  cleanAll(): Promise<void>;
  cleanTables(tableNames: string[]): Promise<void>;
  cleanFinancialTables(): Promise<void>;
}

/**
 * In-memory Mock Database Cleaner for unit and integration testing without database connections.
 */
export class MockDatabaseTestCleaner implements IDatabaseTestCleaner {
  public cleanedTables: string[] = [];

  public async cleanAll(): Promise<void> {
    this.cleanedTables.push('*');
  }

  public async cleanTables(tableNames: string[]): Promise<void> {
    this.cleanedTables.push(...tableNames);
  }

  public async cleanFinancialTables(): Promise<void> {
    await this.cleanTables([...PHASE_7_FINANCIAL_TABLES_CLEANUP_ORDER]);
  }
}
