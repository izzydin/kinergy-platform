import {
  StockMovement as PrismaStockMovementModel,
  StockMovementType as PrismaStockMovementType,
  Prisma,
} from '@prisma/client';
import { StockMovement } from '../../../../domain/inventory/entities/stock-movement.entity';
import { StockMovementId } from '../../../../domain/inventory/value-objects/stock-movement-id.vo';
import { InventoryItemId } from '../../../../domain/inventory/value-objects/inventory-item-id.vo';
import { Quantity } from '../../../../domain/inventory/value-objects/quantity.vo';
import { Money } from '../../../../domain/inventory/value-objects/money.vo';
import { StockMovementType } from '../../../../domain/inventory/enums/stock-movement-type.enum';

export class PrismaStockMovementMapper {
  public static toDomain(raw: PrismaStockMovementModel): StockMovement {
    return StockMovement.reconstitute({
      id: StockMovementId.create(raw.id),
      inventoryItemId: InventoryItemId.create(raw.inventoryItemId),
      movementType: raw.movementType as unknown as StockMovementType,
      quantityDelta: Quantity.ofDelta(Number(raw.quantityDelta)),
      balanceAfter: Quantity.of(Number(raw.balanceAfter)),
      unitCost: Money.create(Number(raw.unitCostAmount), raw.unitCostCurrency),
      reason: raw.reason,
      recordedByUserId: raw.recordedByUserId,
      referenceId: raw.referenceId ?? undefined,
      recordedAt: raw.recordedAt,
    });
  }

  public static toPersistence(movement: StockMovement): PrismaStockMovementModel {
    return {
      id: movement.id.getValue(),
      inventoryItemId: movement.inventoryItemId.getValue(),
      movementType: movement.movementType as unknown as PrismaStockMovementType,
      quantityDelta: new Prisma.Decimal(movement.quantityDelta.value),
      balanceAfter: new Prisma.Decimal(movement.balanceAfter.value),
      unitCostAmount: new Prisma.Decimal(movement.unitCost.amount),
      unitCostCurrency: movement.unitCost.currency,
      reason: movement.reason,
      recordedByUserId: movement.recordedByUserId,
      referenceId: movement.referenceId ?? null,
      recordedAt: movement.recordedAt,
    };
  }
}
