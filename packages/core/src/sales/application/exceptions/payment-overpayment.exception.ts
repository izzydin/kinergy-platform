import { PaymentSaleConsistencyException } from './payment-sale-consistency.exception';

export class PaymentOverpaymentException extends PaymentSaleConsistencyException {
  constructor(paymentAmount: string, remainingBalance: string, currency: string) {
    super(
      `Payment amount ${paymentAmount} ${currency} exceeds the remaining sale balance of ${remainingBalance} ${currency}.`,
      'PAYMENT_OVERPAYMENT',
    );
    this.name = 'PaymentOverpaymentException';
    Object.setPrototypeOf(this, new.target.prototype);
  }
}
