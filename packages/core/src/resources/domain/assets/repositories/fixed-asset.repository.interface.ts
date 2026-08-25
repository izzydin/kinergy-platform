import { FixedAsset } from '../fixed-asset.aggregate';
import { AssetId } from '../value-objects/asset-id.vo';
import { AssetCategory } from '../enums/asset-category.enum';
import { AssetStatus } from '../enums/asset-status.enum';

export interface FixedAssetFilterOptions {
  tenantId?: string;
  category?: AssetCategory;
  status?: AssetStatus;
  facilityId?: string;
  roomId?: string;
  search?: string;
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
