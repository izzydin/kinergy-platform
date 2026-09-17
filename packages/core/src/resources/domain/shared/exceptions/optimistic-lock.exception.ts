import { ResourcesDomainException } from './resources-domain.exception';

/**
 * Thrown when an aggregate optimistic concurrency check fails because the version in storage
 * does not match the version expected by the mutation transaction.
 */
export class OptimisticLockException extends ResourcesDomainException {
  constructor(
    public readonly entityName: string,
    public readonly entityId: string,
    public readonly expectedVersion: number,
  ) {
    super(
      `Optimistic lock conflict on ${entityName} [${entityId}]: expected version ${expectedVersion}, but entity was modified concurrently.`,
    );
    this.name = 'OptimisticLockException';
  }
}
