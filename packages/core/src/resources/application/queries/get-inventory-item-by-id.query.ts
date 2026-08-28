export interface GetInventoryItemByIdInput {
  id: string;
  tenantId?: string;
  includeArchived?: boolean;
}

export class GetInventoryItemByIdQuery {
  constructor(public readonly input: GetInventoryItemByIdInput) {
    Object.freeze(this);
  }
}
