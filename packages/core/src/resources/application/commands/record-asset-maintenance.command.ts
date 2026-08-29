import { AssetCondition } from '../../domain/assets/enums/asset-condition.enum';

export interface RecordAssetMaintenanceInput {
  assetId: string;
  tenantId?: string;
  serviceDate: Date | string;
  description: string;
  cost: {
    amount: number;
    currency?: string;
  };
  performedBy: string;
  updateConditionTo?: AssetCondition;
  notes?: string;
  actorId: string;
}

export class RecordAssetMaintenanceCommand {
  constructor(public readonly input: RecordAssetMaintenanceInput) {
    Object.freeze(this);
  }
}
