export interface DeactivateInventoryItemInput {
  id: string;
  reason?: string;
  tenantId?: string;
  actorId: string;
}

export class DeactivateInventoryItemCommand {
  constructor(public readonly input: DeactivateInventoryItemInput) {
    Object.freeze(this);
  }
}
