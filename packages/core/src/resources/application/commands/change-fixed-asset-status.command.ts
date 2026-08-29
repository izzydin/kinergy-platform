import { AssetStatus } from '../../domain/assets/enums/asset-status.enum';

export interface ChangeFixedAssetStatusInput {
  id: string;
  tenantId?: string;
  status: AssetStatus;
  reason: string;
  actorId: string;
}

export class ChangeFixedAssetStatusCommand {
  constructor(public readonly input: ChangeFixedAssetStatusInput) {
    Object.freeze(this);
  }
}
