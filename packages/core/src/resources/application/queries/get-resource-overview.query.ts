export interface GetResourceOverviewInput {
  tenantId?: string;
  includeArchived?: boolean;
}

export class GetResourceOverviewQuery {
  constructor(public readonly input: GetResourceOverviewInput = {}) {}
}
