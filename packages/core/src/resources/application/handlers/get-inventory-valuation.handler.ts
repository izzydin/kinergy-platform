import { QueryHandler } from '../shared/query-handler.interface';
import { ApplicationResult } from '../shared/application-result';
import { GetInventoryValuationQuery } from '../queries/get-inventory-valuation.query';
import {
  InventoryValuationDTO,
  InventoryValuationItemDTO,
  InventoryValuationCategoryBreakdownDTO,
} from '../dtos/inventory-valuation.dto';
import {
  InventoryItemRepository,
  FindInventoryItemsFilter,
} from '../../domain/inventory/repositories/inventory-item.repository.interface';

/**
 * Use case handler computing aggregate inventory working capital valuation.
 * Valuation Formula: currentStock * purchaseCost (Acquisition cost baseline).
 * Performs exact integer cents arithmetic to eliminate floating point accumulation error.
 */
export class GetInventoryValuationHandler implements QueryHandler<
  GetInventoryValuationQuery,
  ApplicationResult<InventoryValuationDTO>
> {
  constructor(private readonly repository: InventoryItemRepository) {}

  public async execute(
    query: GetInventoryValuationQuery,
  ): Promise<ApplicationResult<InventoryValuationDTO>> {
    const { input } = query;

    const filter: FindInventoryItemsFilter = {
      tenantId: input.tenantId?.trim() || undefined,
      category: input.category,
      includeArchived: input.includeArchived ?? false,
    };

    const items = await this.repository.findMany(filter);

    let totalCents = 0;
    let totalQuantityUnits = 0;
    const valuationItems: InventoryValuationItemDTO[] = [];
    const breakdownByCategory: Record<string, InventoryValuationCategoryBreakdownDTO> = {};
    let currency = 'USD';

    for (const item of items) {
      const qty = item.quantityOnHand.value;
      const unitCostAmount = item.purchaseCost.amount;
      currency = item.purchaseCost.currency || currency;

      // Integer cents calculation: round(qty * unitCost * 100)
      const itemValueCents = Math.round(qty * unitCostAmount * 100);
      const itemValueAmount = itemValueCents / 100;

      totalCents += itemValueCents;
      totalQuantityUnits = Math.round((totalQuantityUnits + qty) * 100) / 100;

      const categoryKey = item.category;
      if (!breakdownByCategory[categoryKey]) {
        breakdownByCategory[categoryKey] = {
          totalValueAmount: 0,
          itemCount: 0,
          totalUnits: 0,
        };
      }

      const cat = breakdownByCategory[categoryKey]!;
      cat.totalValueAmount = Math.round((cat.totalValueAmount + itemValueAmount) * 100) / 100;
      cat.itemCount += 1;
      cat.totalUnits = Math.round((cat.totalUnits + qty) * 100) / 100;

      valuationItems.push({
        itemId: item.id.getValue(),
        sku: item.sku.value,
        name: item.name,
        category: item.category,
        quantityOnHand: qty,
        unit: item.unit,
        unitCostAmount,
        unitCostCurrency: item.purchaseCost.currency,
        totalValueAmount: itemValueAmount,
        totalValueCurrency: item.purchaseCost.currency,
      });
    }

    const totalValueAmount = totalCents / 100;

    const dto: InventoryValuationDTO = {
      totalValueAmount,
      currency,
      totalDistinctItems: items.length,
      totalQuantityUnits,
      calculatedAt: new Date().toISOString(),
      breakdownByCategory,
      items: valuationItems,
    };

    return ApplicationResult.ok(dto);
  }
}
