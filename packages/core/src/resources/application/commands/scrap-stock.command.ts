export interface ScrapStockInput {
  itemId: string;
  quantity: number;
  reason: string;
  actorId: string;
  tenantId?: string;
}

export class ScrapStockCommand {
  constructor(public readonly input: ScrapStockInput) {
    Object.freeze(this);
  }
}
