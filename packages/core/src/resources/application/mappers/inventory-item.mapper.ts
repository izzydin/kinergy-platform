import { InventoryItem } from '../../domain/inventory/inventory-item.aggregate';
import { StockMovement } from '../../domain/inventory/entities/stock-movement.entity';
import { InventoryItemDTO } from '../dtos/inventory-item.dto';
import { StockMovementDTO } from '../dtos/stock-movement.dto';

export class InventoryItemMapper {
  public static toDTO(item: InventoryItem): InventoryItemDTO {
    return {
      id: item.id.getValue(),
      tenantId: item.tenantId,
      sku: item.sku.value,
      name: item.name,
      description: item.description,
      category: item.category,
      unit: item.unit,
      minimumStock: item.minimumStock.value,
      quantityOnHand: item.quantityOnHand.value,
      purchaseCostAmount: item.purchaseCost.amount,
      purchaseCostCurrency: item.purchaseCost.currency,
      sellingPriceAmount: item.sellingPrice.amount,
      sellingPriceCurrency: item.sellingPrice.currency,
      status: item.status,
      locationRef: item.locationRef?.getValue(),
      version: item.version,
      createdAt: item.createdAt.toISOString(),
      updatedAt: item.updatedAt.toISOString(),
    };
  }

  public static toMovementDTO(movement: StockMovement): StockMovementDTO {
    return {
      id: movement.id.getValue(),
      inventoryItemId: movement.inventoryItemId.getValue(),
      movementType: movement.movementType,
      quantityDelta: movement.quantityDelta.value,
      balanceAfter: movement.balanceAfter.value,
      unitCostAmount: movement.unitCost.amount,
      unitCostCurrency: movement.unitCost.currency,
      reason: movement.reason,
      recordedByUserId: movement.recordedByUserId,
      referenceId: movement.referenceId,
      recordedAt: movement.recordedAt.toISOString(),
    };
  }
}
