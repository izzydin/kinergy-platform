export interface SellStockInput {
  itemId: string;
  quantity: number;
  sellingPrice?: { amount: number; currency?: string };
  referenceId?: string;
  reason: string;
  actorId: string;
  tenantId?: string;
}

export class SellStockCommand {
  constructor(public readonly input: SellStockInput) {
    Object.freeze(this);
  }
}
