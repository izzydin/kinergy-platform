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
