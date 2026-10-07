import { IUnitOfWork } from './unit-of-work.port';

/**
 * Port interface for coordinating atomic transactional boundaries across multiple aggregates.
 * Extends canonical IUnitOfWork (ADR-0021, ADR-0125) to preserve backward compatibility.
 * Ensures all repository mutations within the execution block succeed atomically or roll back.
 */
export interface SalesTransactionCoordinatorPort extends IUnitOfWork {
  /**
   * Executes the provided unit of work inside an ACID transaction.
   * If the callback throws an error, all changes within the transaction scope are rolled back.
   * Alias for executeInTransaction.
   */
  runInTransaction<T>(work: () => Promise<T>): Promise<T>;
}
