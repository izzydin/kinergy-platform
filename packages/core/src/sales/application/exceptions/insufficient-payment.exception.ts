export class InsufficientPaymentException extends Error {
  constructor(message: string = 'Payment amount is insufficient to settle the Sale.') {
    super(message);
    this.name = 'InsufficientPaymentException';
    Object.setPrototypeOf(this, new.target.prototype);
  }
}
