import { AssetCategory } from '../../domain/assets/enums/asset-category.enum';
import { AssetStatus } from '../../domain/assets/enums/asset-status.enum';
import { AssetCondition } from '../../domain/assets/enums/asset-condition.enum';

export interface AssetValuationDTO {
  assetId: string;
  assetTag: string;
  name: string;
  category: AssetCategory;
  status: AssetStatus;
  condition: AssetCondition;
  purchaseDate: Date;
  purchaseValueAmount: number;
  purchaseValueCurrency: string;
  currentEstimatedValueAmount: number;
  currentEstimatedValueCurrency: string;
  lastValuationDate: Date;
}

export interface FixedAssetCategoryValuationDTO {
  totalCarryingValueAmount: number;
  totalPurchaseValueAmount: number;
  assetCount: number;
}

export interface FixedAssetStatusValuationDTO {
  count: number;
  totalCarryingValueAmount: number;
}

export interface FixedAssetConditionValuationDTO {
  count: number;
  totalCarryingValueAmount: number;
}

export interface FixedAssetValuationSummaryDTO {
  totalCarryingValueAmount: number;
  totalPurchaseValueAmount: number;
  currency: string;
  totalAssetCount: number;
  activeAssetCount: number;
  calculatedAt: string;
  breakdownByCategory: Record<string, FixedAssetCategoryValuationDTO>;
  breakdownByStatus: Record<string, FixedAssetStatusValuationDTO>;
  breakdownByCondition: Record<string, FixedAssetConditionValuationDTO>;
}
