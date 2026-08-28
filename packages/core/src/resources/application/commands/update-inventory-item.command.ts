import { InventoryCategory } from '../../domain/inventory/enums/inventory-category.enum';
import { UnitOfMeasure } from '../../domain/inventory/enums/unit-of-measure.enum';
import { LocationRefProps } from '../../domain/inventory/value-objects/location-ref.vo';

export interface UpdateInventoryItemInput {
  id: string;
  name?: string;
  description?: string;
  category?: InventoryCategory;
  unit?: UnitOfMeasure;
  minimumStock?: number;
  purchaseCost?: { amount: number; currency?: string };
  sellingPrice?: { amount: number; currency?: string };
  locationRef?: LocationRefProps | null;
  tenantId?: string;
  actorId: string;
}

export class UpdateInventoryItemCommand {
  constructor(public readonly input: UpdateInventoryItemInput) {
    Object.freeze(this);
  }
}
