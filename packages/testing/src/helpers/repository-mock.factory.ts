/**
 * Factory helper generating Jest mocked repository interfaces.
 */
export class RepositoryMockFactory {
  /**
   * Generates a generic Jest mocked repository object with common CRUD method mocks.
   */
  public static createMockRepository<T = unknown>() {
    return {
      findById: jest.fn<Promise<T | null>, [string]>(),
      findByEmail: jest.fn<Promise<T | null>, [string]>(),
      create: jest.fn<Promise<void>, [T]>(),
      save: jest.fn<Promise<void>, [T]>(),
      delete: jest.fn<Promise<void>, [string]>(),
      search: jest.fn<
        Promise<{ items: T[]; total: number; page: number; limit: number }>,
        [unknown]
      >(),
    };
  }
}
