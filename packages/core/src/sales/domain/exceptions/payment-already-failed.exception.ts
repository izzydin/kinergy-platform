import { InvalidPaymentTransitionException } from './invalid-payment-transition.exception';
import { PaymentStatus } from '../enums/payment-status.enum';

/**
 * Thrown when attempting an invalid transition on a Payment that has already failed.
 * Terminal states have zero permitted outgoing transitions.
 */
export class PaymentAlreadyFailedException extends InvalidPaymentTransitionException {
  public override readonly code: string = 'INVALID_PAYMENT_TRANSITION';
  public readonly subcode: string = 'PAYMENT_ALREADY_FAILED';

  constructor(reason?: string) {
    const detail =
      reason ?? 'Cannot fail a payment that is already FAILED (repeated transition prohibited).';
    super(PaymentStatus.FAILED, PaymentStatus.FAILED, detail);
    this.name = 'PaymentAlreadyFailedException';
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export { PaymentAlreadyFailedException as PaymentAlreadyFailed };
