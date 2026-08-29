export interface TransferFixedAssetLocationInput {
  id: string;
  tenantId?: string;
  location: {
    facilityId: string;
    roomId?: string;
    zone?: string;
    description?: string;
  };
  reason?: string;
  actorId: string;
}

export class TransferFixedAssetLocationCommand {
  constructor(public readonly input: TransferFixedAssetLocationInput) {
    Object.freeze(this);
  }
}
