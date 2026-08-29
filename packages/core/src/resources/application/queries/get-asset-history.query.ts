import { AssetHistoryEventType } from '../../domain/assets/enums/asset-history-event-type.enum';

export interface GetAssetHistoryInput {
  assetId: string;
  tenantId?: string;
  eventType?: AssetHistoryEventType | AssetHistoryEventType[];
  recordedByUserId?: string;
  fromDate?: Date | string;
  toDate?: Date | string;
  page?: number;
  pageSize?: number;
  sortBy?: 'recordedAt';
  sortOrder?: 'asc' | 'desc';
}

export class GetAssetHistoryQuery {
  constructor(public readonly input: GetAssetHistoryInput) {
    Object.freeze(this);
  }
}
