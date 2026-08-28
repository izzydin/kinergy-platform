export interface ActivateInventoryItemInput {
  id: string;
  tenantId?: string;
  actorId: string;
}

export class ActivateInventoryItemCommand {
  constructor(public readonly input: ActivateInventoryItemInput) {
    Object.freeze(this);
  }
}
