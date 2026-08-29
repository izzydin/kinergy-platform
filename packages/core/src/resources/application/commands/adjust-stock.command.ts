export type AdjustStockType = 'ADJUSTMENT_IN' | 'ADJUSTMENT_OUT';

export interface AdjustStockInput {
  itemId: string;
  type: AdjustStockType;
  quantity: number;
  reason: string;
  actorId: string;
  tenantId?: string;
}

export class AdjustStockCommand {
  constructor(public readonly input: AdjustStockInput) {
    Object.freeze(this);
  }
}
