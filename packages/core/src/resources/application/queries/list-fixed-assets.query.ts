import { AssetCategory } from '../../domain/assets/enums/asset-category.enum';
import { AssetStatus } from '../../domain/assets/enums/asset-status.enum';
import { AssetCondition } from '../../domain/assets/enums/asset-condition.enum';

export type FixedAssetSortBy =
  | 'name'
  | 'assetTag'
  | 'category'
  | 'status'
  | 'condition'
  | 'purchaseDate'
  | 'purchaseValueAmount'
  | 'currentEstimatedValueAmount'
  | 'createdAt'
  | 'updatedAt';

export interface ListFixedAssetsFilter {
  search?: string;
  category?: AssetCategory | AssetCategory[];
  status?: AssetStatus | AssetStatus[];
  condition?: AssetCondition | AssetCondition[];
  facilityId?: string;
  roomId?: string;
  includeDecommissioned?: boolean;
  page?: number;
  pageSize?: number;
  sortBy?: FixedAssetSortBy;
  sortOrder?: 'asc' | 'desc';
}

export interface ListFixedAssetsInput {
  tenantId: string;
  filter?: ListFixedAssetsFilter;
}

export class ListFixedAssetsQuery {
  constructor(public readonly input: ListFixedAssetsInput) {
    Object.freeze(this);
  }
}
