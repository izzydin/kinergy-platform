export class PaymentOverpaymentException extends Error {
  constructor(paymentAmount: string, remainingBalance: string, currency: string) {
    super(
      `Payment amount ${paymentAmount} ${currency} exceeds the remaining sale balance of ${remainingBalance} ${currency}.`,
    );
    this.name = 'PaymentOverpaymentException';
    Object.setPrototypeOf(this, new.target.prototype);
  }
}
