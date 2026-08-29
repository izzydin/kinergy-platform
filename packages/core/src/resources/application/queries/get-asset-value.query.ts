export interface GetAssetValueInput {
  assetId: string;
  tenantId?: string;
}

export class GetAssetValueQuery {
  constructor(public readonly input: GetAssetValueInput) {
    Object.freeze(this);
  }
}
