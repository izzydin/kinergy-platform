export interface ArchiveInventoryItemInput {
  id: string;
  reason?: string;
  tenantId?: string;
  actorId: string;
}

export class ArchiveInventoryItemCommand {
  constructor(public readonly input: ArchiveInventoryItemInput) {
    Object.freeze(this);
  }
}
