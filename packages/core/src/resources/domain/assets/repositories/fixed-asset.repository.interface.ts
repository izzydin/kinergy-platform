import { FixedAsset } from '../fixed-asset.aggregate';
import { AssetId } from '../value-objects/asset-id.vo';
import { AssetCategory } from '../enums/asset-category.enum';
import { AssetStatus } from '../enums/asset-status.enum';
import { AssetCondition } from '../enums/asset-condition.enum';

export type FixedAssetSortField =
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

export interface FixedAssetFilterOptions {
  tenantId?: string;
  category?: AssetCategory | AssetCategory[];
  status?: AssetStatus | AssetStatus[];
  condition?: AssetCondition | AssetCondition[];
  facilityId?: string;
  roomId?: string;
  includeDecommissioned?: boolean;
  search?: string;
  sortBy?: FixedAssetSortField;
  sortOrder?: 'asc' | 'desc';
  limit?: number;
  offset?: number;
}

export interface FixedAssetRepositoryInterface {
  findById(id: AssetId): Promise<FixedAsset | null>;
  findByAssetTag(assetTag: string, tenantId?: string): Promise<FixedAsset | null>;
  findAll(filter?: FixedAssetFilterOptions): Promise<FixedAsset[]>;
  count(filter?: FixedAssetFilterOptions): Promise<number>;
  save(asset: FixedAsset): Promise<void>;
  delete(id: AssetId): Promise<void>;
}
