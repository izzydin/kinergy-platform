export interface GetFixedAssetByIdInput {
  id: string;
  tenantId?: string;
}

export class GetFixedAssetByIdQuery {
  constructor(public readonly input: GetFixedAssetByIdInput) {
    Object.freeze(this);
  }
}
