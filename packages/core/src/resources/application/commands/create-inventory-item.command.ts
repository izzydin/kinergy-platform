import { InventoryCategory } from '../../domain/inventory/enums/inventory-category.enum';
import { UnitOfMeasure } from '../../domain/inventory/enums/unit-of-measure.enum';
import { LocationRefProps } from '../../domain/inventory/value-objects/location-ref.vo';

export interface CreateInventoryItemInput {
  sku: string;
  name: string;
  description?: string;
  category?: InventoryCategory;
  unit?: UnitOfMeasure;
  minimumStock?: number;
  initialStock?: number;
  purchaseCost?: { amount: number; currency?: string };
  sellingPrice?: { amount: number; currency?: string };
  locationRef?: LocationRefProps;
  tenantId?: string;
  actorId: string;
}

export class CreateInventoryItemCommand {
  constructor(public readonly input: CreateInventoryItemInput) {
    Object.freeze(this);
  }
}
