export interface UpdateSaleItemQuantityInput {
  saleId: string;
  itemId: string;
  newQuantity: number;
}

export class UpdateSaleItemQuantityCommand {
  constructor(public readonly input: UpdateSaleItemQuantityInput) {}
}
