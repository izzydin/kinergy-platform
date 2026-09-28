export interface CancelSaleInput {
  saleId: string;
  reason: string;
}

export class CancelSaleCommand {
  constructor(public readonly input: CancelSaleInput) {}
}
