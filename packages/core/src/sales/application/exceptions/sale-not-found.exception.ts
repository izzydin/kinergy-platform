export class SaleNotFoundException extends Error {
  constructor(saleId: string) {
    super(`Sale with ID '${saleId}' was not found.`);
    this.name = 'SaleNotFoundException';
  }
}

export { SaleNotFoundException as SaleNotFound };
