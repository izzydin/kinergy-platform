export interface CorrectStockInput {
  itemId: string;
  targetCount: number;
  reason: string;
  actorId: string;
  tenantId?: string;
}

export class CorrectStockCommand {
  constructor(public readonly input: CorrectStockInput) {
    Object.freeze(this);
  }
}
