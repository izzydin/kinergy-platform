export interface AdjustStockInInput {
  itemId: string;
  quantity: number;
  reason: string;
  actorId: string;
}

export class AdjustStockInCommand {
  constructor(public readonly input: AdjustStockInInput) {
    Object.freeze(this);
  }
}
