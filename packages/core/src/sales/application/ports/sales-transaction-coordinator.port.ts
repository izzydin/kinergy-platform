/**
 * Port interface for coordinating atomic transactional boundaries across multiple aggregates.
 * Ensures all repository mutations within the execution block succeed atomically or roll back.
 */
export interface SalesTransactionCoordinatorPort {
  /**
   * Executes the provided unit of work inside an ACID transaction.
   * If the callback throws an error, all changes within the transaction scope are rolled back.
   */
  runInTransaction<T>(work: () => Promise<T>): Promise<T>;
}
