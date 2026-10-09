import { InvalidPaymentTransitionException } from './invalid-payment-transition.exception';
import { PaymentStatus } from '../enums/payment-status.enum';

/**
 * Thrown when attempting an invalid transition on a Payment that has already been cancelled.
 * Terminal states have zero permitted outgoing transitions.
 */
export class PaymentAlreadyCancelledException extends InvalidPaymentTransitionException {
  public override readonly code: string = 'INVALID_PAYMENT_TRANSITION';
  public readonly subcode: string = 'PAYMENT_ALREADY_CANCELLED';

  constructor(reason?: string) {
    const detail =
      reason ??
      'Cannot cancel a payment that is already CANCELLED (repeated transition prohibited).';
    super(PaymentStatus.CANCELLED, PaymentStatus.CANCELLED, detail);
    this.name = 'PaymentAlreadyCancelledException';
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export { PaymentAlreadyCancelledException as PaymentAlreadyCancelled };
