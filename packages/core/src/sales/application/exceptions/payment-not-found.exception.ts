export class PaymentNotFoundException extends Error {
  constructor(paymentId: string) {
    super(`Payment with ID '${paymentId}' was not found.`);
    this.name = 'PaymentNotFoundException';
    Object.setPrototypeOf(this, new.target.prototype);
  }
}
