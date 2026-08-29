export interface UpdateFixedAssetValuationInput {
  id: string;
  tenantId?: string;
  estimatedValue: {
    amount: number;
    currency?: string;
  };
  reason?: string;
  actorId: string;
}

export class UpdateFixedAssetValuationCommand {
  constructor(public readonly input: UpdateFixedAssetValuationInput) {
    Object.freeze(this);
  }
}
