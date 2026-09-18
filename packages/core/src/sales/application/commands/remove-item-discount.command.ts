export interface RemoveItemDiscountInput {
  saleId: string;
  itemId: string;
}

export class RemoveItemDiscountCommand {
  constructor(public readonly input: RemoveItemDiscountInput) {}
}
