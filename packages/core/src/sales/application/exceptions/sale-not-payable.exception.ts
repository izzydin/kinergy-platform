export class SaleNotPayableException extends Error {
  constructor(saleId: string, status: string) {
    super(
      `Sale with ID '${saleId}' is in status '${status}' and cannot accept payments. Only sales in PENDING_PAYMENT or PARTIALLY_PAID status are payable.`,
    );
    this.name = 'SaleNotPayableException';
    Object.setPrototypeOf(this, new.target.prototype);
  }
}
