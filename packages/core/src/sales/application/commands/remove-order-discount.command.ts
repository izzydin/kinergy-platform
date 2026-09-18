export interface RemoveOrderDiscountInput {
  saleId: string;
}

export class RemoveOrderDiscountCommand {
  constructor(public readonly input: RemoveOrderDiscountInput) {}
}
