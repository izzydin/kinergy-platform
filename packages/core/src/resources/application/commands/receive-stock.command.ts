export interface ReceiveStockInput {
  itemId: string;
  quantity: number;
  unitCost?: { amount: number; currency?: string };
  referenceId?: string;
  reason: string;
  actorId: string;
  tenantId?: string;
}

export class ReceiveStockCommand {
  constructor(public readonly input: ReceiveStockInput) {
    Object.freeze(this);
  }
}
