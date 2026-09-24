import { SaleDomainException } from './sale-domain.exception';

export class SaleOptimisticLockException extends SaleDomainException {
  constructor(aggregate: string, id: string, expectedVersion: number) {
    super(
      `Optimistic lock failure: ${aggregate} with ID '${id}' was modified concurrently (expected version: ${expectedVersion}).`,
      'OPTIMISTIC_LOCK_ERROR',
    );
  }
}

export class PaymentOptimisticLockException extends SaleOptimisticLockException {
  constructor(id: string, expectedVersion: number) {
    super('Payment', id, expectedVersion);
    this.name = 'PaymentOptimisticLockException';
  }
}
