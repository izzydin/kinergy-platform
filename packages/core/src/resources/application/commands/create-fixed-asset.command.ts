import { AssetCategory } from '../../domain/assets/enums/asset-category.enum';
import { AssetStatus } from '../../domain/assets/enums/asset-status.enum';
import { AssetCondition } from '../../domain/assets/enums/asset-condition.enum';

export interface CreateFixedAssetInput {
  tenantId?: string;
  assetTag: string;
  name: string;
  description?: string;
  category: AssetCategory;
  purchaseDate: Date;
  purchaseValue: { amount: number; currency: string };
  currentEstimatedValue?: { amount: number; currency: string };
  condition?: AssetCondition;
  status?: AssetStatus;
  location: {
    facilityId: string;
    roomId?: string;
    zone?: string;
    description?: string;
  };
  notes?: string;
  actorId: string;
}

export class CreateFixedAssetCommand {
  constructor(public readonly input: CreateFixedAssetInput) {
    Object.freeze(this);
  }
}
