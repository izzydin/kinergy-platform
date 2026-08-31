export interface GetCombinedResourceValuationInput {
  tenantId?: string;
  includeArchived?: boolean;
  includeDecommissioned?: boolean;
}

export class GetCombinedResourceValuationQuery {
  constructor(public readonly input: GetCombinedResourceValuationInput = {}) {}
}
