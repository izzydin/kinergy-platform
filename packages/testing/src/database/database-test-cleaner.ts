/**
 * Contract for database cleanup handlers in test environments.
 */
export interface IDatabaseTestCleaner {
  cleanAll(): Promise<void>;
  cleanTables(tableNames: string[]): Promise<void>;
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
}
