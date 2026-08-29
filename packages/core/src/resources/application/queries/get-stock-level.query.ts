export interface GetStockLevelInput {
  itemId: string;
  tenantId?: string;
}

export class GetStockLevelQuery {
  constructor(public readonly input: GetStockLevelInput) {
    Object.freeze(this);
  }
}
