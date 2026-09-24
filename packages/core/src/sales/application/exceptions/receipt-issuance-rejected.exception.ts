export class ReceiptIssuanceRejectedException extends Error {
  constructor(reason: string) {
    super(`Receipt issuance rejected: ${reason}`);
    this.name = 'ReceiptIssuanceRejectedException';
    Object.setPrototypeOf(this, new.target.prototype);
  }
}
