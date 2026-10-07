/**
 * Application Port Interface for Unit of Work and Transaction Management.
 * Guarantees atomic transactional execution across infrastructure persistence operations (ADR-0021, ADR-0125).
 * Preserves Clean Architecture by strictly isolating database transaction drivers to infrastructure.
 */
export interface IUnitOfWork {
  /**
   * Executes a block of asynchronous operations within an atomic database transaction.
   * Automatically commits on success and rolls back on error.
   */
  executeInTransaction<T>(work: () => Promise<T>): Promise<T>;
}

/**
 * Dependency Injection Symbol for NestJS / Platform binding.
 */
export const UNIT_OF_WORK = Symbol('IUnitOfWork');
