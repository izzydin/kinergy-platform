import { SaleDomainException } from './sale-domain.exception';

/**
 * Thrown when a discount configuration is mathematically invalid or lacks required business justification.
 */
export class InvalidDiscountException extends SaleDomainException {
  public override readonly code = 'INVALID_DISCOUNT';

  constructor(message: string) {
    super(message, 'INVALID_DISCOUNT');
    this.name = 'InvalidDiscountException';
  }
}
