import { InventoryDomainEvent } from './inventory-domain.event';
import { InventoryCategory } from '../enums/inventory-category.enum';
import { UnitOfMeasure } from '../enums/unit-of-measure.enum';

export interface InventoryItemCreatedPayload {
  sku: string;
  name: string;
  category: InventoryCategory;
  unit: UnitOfMeasure;
  minimumStock: number;
  initialStock: number;
  purchaseCostAmount: number;
  purchaseCostCurrency: string;
  sellingPriceAmount: number;
  sellingPriceCurrency: string;
  recordedByUserId: string;
}

export class InventoryItemCreatedEvent extends InventoryDomainEvent<InventoryItemCreatedPayload> {
  constructor(
    aggregateId: string,
    aggregateVersion: number,
    payload: InventoryItemCreatedPayload,
    occurredAt?: Date,
  ) {
    super('InventoryItemCreated', aggregateId, aggregateVersion, payload, occurredAt);
  }
}
