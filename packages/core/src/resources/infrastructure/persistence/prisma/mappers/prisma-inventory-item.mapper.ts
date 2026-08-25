import {
  InventoryItem as PrismaInventoryItemModel,
  InventoryCategory as PrismaInventoryCategory,
  UnitOfMeasure as PrismaUnitOfMeasure,
  InventoryItemStatus as PrismaInventoryItemStatus,
  StockMovement as PrismaStockMovementModel,
  Prisma,
} from '@prisma/client';
import { InventoryItem } from '../../../../domain/inventory/inventory-item.aggregate';
import { InventoryItemId } from '../../../../domain/inventory/value-objects/inventory-item-id.vo';
import { SKU } from '../../../../domain/inventory/value-objects/sku.vo';
import { Quantity } from '../../../../domain/inventory/value-objects/quantity.vo';
import { Money } from '../../../../domain/inventory/value-objects/money.vo';
import {
  LocationRef,
  LocationRefProps,
} from '../../../../domain/inventory/value-objects/location-ref.vo';
import { InventoryCategory } from '../../../../domain/inventory/enums/inventory-category.enum';
import { UnitOfMeasure } from '../../../../domain/inventory/enums/unit-of-measure.enum';
import { InventoryItemStatus } from '../../../../domain/inventory/enums/inventory-item-status.enum';
import { PrismaStockMovementMapper } from './prisma-stock-movement.mapper';

export type PrismaInventoryItemWithMovements = PrismaInventoryItemModel & {
  movements?: PrismaStockMovementModel[];
};

export class PrismaInventoryItemMapper {
  public static toDomain(raw: PrismaInventoryItemWithMovements): InventoryItem {
    const locationRef = raw.locationRef
      ? LocationRef.create(raw.locationRef as unknown as LocationRefProps)
      : undefined;

    const movements = raw.movements ? raw.movements.map(PrismaStockMovementMapper.toDomain) : [];

    return InventoryItem.reconstitute({
      id: InventoryItemId.create(raw.id),
      tenantId: raw.tenantId,
      sku: SKU.create(raw.sku),
      name: raw.name,
      description: raw.description,
      category: raw.category as unknown as InventoryCategory,
      unit: raw.unit as unknown as UnitOfMeasure,
      minimumStock: Quantity.of(Number(raw.minimumStock)),
      quantityOnHand: Quantity.of(Number(raw.quantityOnHand)),
      purchaseCost: Money.create(Number(raw.purchaseCostAmount), raw.purchaseCostCurrency),
      sellingPrice: Money.create(Number(raw.sellingPriceAmount), raw.sellingPriceCurrency),
      status: raw.status as unknown as InventoryItemStatus,
      locationRef,
      movements,
      version: raw.version,
      createdAt: raw.createdAt,
      updatedAt: raw.updatedAt,
    });
  }

  public static toPersistence(
    item: InventoryItem,
  ): Omit<PrismaInventoryItemModel, 'createdAt' | 'updatedAt'> {
    return {
      id: item.id.getValue(),
      tenantId: item.tenantId ?? null,
      sku: item.sku.value,
      name: item.name,
      description: item.description ?? null,
      category: item.category as unknown as PrismaInventoryCategory,
      unit: item.unit as unknown as PrismaUnitOfMeasure,
      minimumStock: new Prisma.Decimal(item.minimumStock.value),
      quantityOnHand: new Prisma.Decimal(item.quantityOnHand.value),
      purchaseCostAmount: new Prisma.Decimal(item.purchaseCost.amount),
      purchaseCostCurrency: item.purchaseCost.currency,
      sellingPriceAmount: new Prisma.Decimal(item.sellingPrice.amount),
      sellingPriceCurrency: item.sellingPrice.currency,
      status: item.status as unknown as PrismaInventoryItemStatus,
      locationRef: item.locationRef
        ? (item.locationRef.getValue() as unknown as Prisma.JsonValue)
        : null,
      version: item.version,
    };
  }
}
