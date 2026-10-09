import { InvalidPaymentTransitionException } from './invalid-payment-transition.exception';
import { PaymentStatus } from '../enums/payment-status.enum';

/**
 * Thrown when attempting to transition or mutate a Payment that has already been completed.
 * Completed payments are permanently immutable.
 */
export class PaymentAlreadyCompletedException extends InvalidPaymentTransitionException {
  public override readonly code: string = 'INVALID_PAYMENT_TRANSITION';
  public readonly subcode: string = 'PAYMENT_ALREADY_COMPLETED';

  constructor(reason?: string) {
    const detail = reason ?? 'Payment has already been completed and is permanently immutable.';
    super(PaymentStatus.COMPLETED, PaymentStatus.COMPLETED, detail);
    this.name = 'PaymentAlreadyCompletedException';
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export { PaymentAlreadyCompletedException as PaymentAlreadyCompleted };
