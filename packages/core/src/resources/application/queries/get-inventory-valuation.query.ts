import { InventoryCategory } from '../../domain/inventory/enums/inventory-category.enum';

export interface GetInventoryValuationInput {
  tenantId?: string;
  category?: InventoryCategory | InventoryCategory[];
  includeArchived?: boolean;
}

export class GetInventoryValuationQuery {
  constructor(public readonly input: GetInventoryValuationInput = {}) {
    Object.freeze(this);
  }
}
