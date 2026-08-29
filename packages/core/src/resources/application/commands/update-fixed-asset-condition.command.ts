import { AssetCondition } from '../../domain/assets/enums/asset-condition.enum';

export interface UpdateFixedAssetConditionInput {
  id: string;
  tenantId?: string;
  condition: AssetCondition;
  reason?: string;
  actorId: string;
}

export class UpdateFixedAssetConditionCommand {
  constructor(public readonly input: UpdateFixedAssetConditionInput) {
    Object.freeze(this);
  }
}
