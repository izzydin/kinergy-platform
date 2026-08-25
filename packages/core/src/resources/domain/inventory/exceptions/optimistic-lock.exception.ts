import { InventoryDomainException } from './inventory-domain.exception';

export class InventoryOptimisticLockException extends InventoryDomainException {
  constructor(
    public readonly entityName: string,
    public readonly entityId: string,
    public readonly expectedVersion: number,
  ) {
    super(
      `Optimistic lock conflict on ${entityName} [${entityId}]: expected version ${expectedVersion}, but entity was modified concurrently.`,
    );
    this.name = 'InventoryOptimisticLockException';
  }
}

export { InventoryOptimisticLockException as OptimisticLockException };
