import { SaleDomainException } from './sale-domain.exception';

/**
 * Thrown when a monetary value, currency, precision, or arithmetic violates domain invariants.
 */
export class InvalidMoneyException extends SaleDomainException {
  public override readonly code = 'INVALID_MONEY';

  constructor(message: string) {
    super(message, 'INVALID_MONEY');
    this.name = 'InvalidMoneyException';
  }
}
