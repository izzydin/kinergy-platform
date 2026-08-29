export interface UpdateFixedAssetDetailsInput {
  id: string;
  tenantId?: string;
  name?: string;
  description?: string;
  notes?: string;
  reason?: string;
  actorId: string;
}

export class UpdateFixedAssetDetailsCommand {
  constructor(public readonly input: UpdateFixedAssetDetailsInput) {
    Object.freeze(this);
  }
}
