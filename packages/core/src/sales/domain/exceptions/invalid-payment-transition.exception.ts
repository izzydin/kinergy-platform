import { PaymentDomainException } from './payment-domain.exception';

/**
 * Thrown when an illegal lifecycle state transition is attempted on a Payment aggregate.
 */
export class InvalidPaymentTransitionException extends PaymentDomainException {
  public override readonly code = 'INVALID_PAYMENT_TRANSITION';

  constructor(
    public readonly currentState: string,
    public readonly targetState: string,
    public readonly reason?: string,
  ) {
    const detail = reason ? ` (${reason})` : '';
    super(
      `Cannot transition Payment from status '${currentState}' to status '${targetState}'${detail}.`,
      'INVALID_PAYMENT_TRANSITION',
    );
    this.name = 'InvalidPaymentTransitionException';
    Object.setPrototypeOf(this, new.target.prototype);
  }
}
