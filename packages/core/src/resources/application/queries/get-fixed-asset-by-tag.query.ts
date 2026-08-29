export interface GetFixedAssetByTagInput {
  assetTag: string;
  tenantId?: string;
}

export class GetFixedAssetByTagQuery {
  constructor(public readonly input: GetFixedAssetByTagInput) {
    Object.freeze(this);
  }
}
