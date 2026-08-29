export interface GetMaintenanceHistoryInput {
  assetId: string;
  tenantId?: string;
  performedBy?: string;
  fromDate?: Date | string;
  toDate?: Date | string;
  page?: number;
  pageSize?: number;
  sortBy?: 'serviceDate' | 'createdAt';
  sortOrder?: 'asc' | 'desc';
}

export class GetMaintenanceHistoryQuery {
  constructor(public readonly input: GetMaintenanceHistoryInput) {
    Object.freeze(this);
  }
}
