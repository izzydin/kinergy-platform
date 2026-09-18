export interface RemoveSaleItemInput {
  saleId: string;
  itemId: string;
}

export class RemoveSaleItemCommand {
  constructor(public readonly input: RemoveSaleItemInput) {}
}
