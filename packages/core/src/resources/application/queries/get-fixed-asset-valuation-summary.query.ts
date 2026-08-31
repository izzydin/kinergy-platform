export interface GetFixedAssetValuationSummaryInput {
  tenantId?: string;
  category?: string;
  includeDecommissioned?: boolean;
}

export class GetFixedAssetValuationSummaryQuery {
  constructor(public readonly input: GetFixedAssetValuationSummaryInput = {}) {}
}
