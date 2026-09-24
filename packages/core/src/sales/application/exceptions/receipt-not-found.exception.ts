export class ReceiptNotFoundException extends Error {
  constructor(receiptIdentifier: string) {
    super(`Receipt with identifier '${receiptIdentifier}' was not found.`);
    this.name = 'ReceiptNotFoundException';
    Object.setPrototypeOf(this, new.target.prototype);
  }
}
