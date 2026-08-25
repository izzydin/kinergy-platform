export interface AdjustStockOutInput {
  itemId: string;
  quantity: number;
  reason: string;
  actorId: string;
}

export class AdjustStockOutCommand {
  constructor(public readonly input: AdjustStockOutInput) {
    Object.freeze(this);
  }
}
