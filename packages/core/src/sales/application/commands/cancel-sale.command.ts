export interface CancelSaleInput {
  saleId: string;
  reason: string;
  tenantId?: string;
}

export class CancelSaleCommand {
  constructor(public readonly input: CancelSaleInput) {}
}
