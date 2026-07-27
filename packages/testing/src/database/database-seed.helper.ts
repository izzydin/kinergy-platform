export interface TestSeedRole {
  name: string;
  permissions: string[];
}

/**
 * Standard Seed Helper for populating initial test data sets.
 */
export class DatabaseSeedHelper {
  public static getStandardRoles(): TestSeedRole[] {
    return [
      {
        name: 'SUPER_ADMIN',
        permissions: ['*'],
      },
      {
        name: 'ADMIN',
        permissions: ['read:all', 'write:all', 'delete:all'],
      },
      {
        name: 'USER',
        permissions: ['read:own', 'write:own'],
      },
    ];
  }
}
