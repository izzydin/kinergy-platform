export class PaymentNotCompletedException extends Error {
  constructor(paymentId: string, status: string) {
    super(
      `Payment with ID '${paymentId}' is in status '${status}'. Sale settlement requires a valid COMPLETED payment.`,
    );
    this.name = 'PaymentNotCompletedException';
    Object.setPrototypeOf(this, new.target.prototype);
  }
}
