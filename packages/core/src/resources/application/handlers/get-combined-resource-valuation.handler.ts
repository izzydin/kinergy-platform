import { QueryHandler } from '../shared/query-handler.interface';
import { ApplicationResult } from '../shared/application-result';
import { GetCombinedResourceValuationQuery } from '../queries/get-combined-resource-valuation.query';
import { ResourceValuationSummaryDTO } from '../dtos/resource-valuation-summary.dto';
import { InventoryItemRepository } from '../../domain/inventory/repositories/inventory-item.repository.interface';
import { FixedAssetRepositoryInterface } from '../../domain/assets/repositories/fixed-asset.repository.interface';
import { GetInventoryValuationHandler } from './get-inventory-valuation.handler';
import { GetFixedAssetValuationSummaryHandler } from './get-fixed-asset-valuation-summary.handler';
import { GetInventoryValuationQuery } from '../queries/get-inventory-valuation.query';
import { GetFixedAssetValuationSummaryQuery } from '../queries/get-fixed-asset-valuation-summary.query';

/**
 * Use case handler orchestrating Combined Resource Valuation across Consumable Inventory and Fixed Assets.
 * Evaluates both domains concurrently without merging domain boundaries (ADR-0098).
 * Derives combined balance sheet carrying value and historical investment metrics.
 */
export class GetCombinedResourceValuationHandler implements QueryHandler<
  GetCombinedResourceValuationQuery,
  ApplicationResult<ResourceValuationSummaryDTO>
> {
  private readonly inventoryHandler: GetInventoryValuationHandler;
  private readonly fixedAssetHandler: GetFixedAssetValuationSummaryHandler;

  constructor(
    inventoryRepository: InventoryItemRepository,
    fixedAssetRepository: FixedAssetRepositoryInterface,
  ) {
    this.inventoryHandler = new GetInventoryValuationHandler(inventoryRepository);
    this.fixedAssetHandler = new GetFixedAssetValuationSummaryHandler(fixedAssetRepository);
  }

  public async execute(
    query: GetCombinedResourceValuationQuery,
  ): Promise<ApplicationResult<ResourceValuationSummaryDTO>> {
    const { input } = query;

    // Concurrently execute both domain queries
    const [inventoryResult, fixedAssetResult] = await Promise.all([
      this.inventoryHandler.execute(
        new GetInventoryValuationQuery({
          tenantId: input.tenantId,
          includeArchived: input.includeArchived,
        }),
      ),
      this.fixedAssetHandler.execute(
        new GetFixedAssetValuationSummaryQuery({
          tenantId: input.tenantId,
          includeDecommissioned: input.includeDecommissioned,
        }),
      ),
    ]);

    if (!inventoryResult.isSuccess) {
      return ApplicationResult.fail(inventoryResult.getError());
    }
    if (!fixedAssetResult.isSuccess) {
      return ApplicationResult.fail(fixedAssetResult.getError());
    }

    const inventoryData = inventoryResult.getValue();
    const fixedAssetData = fixedAssetResult.getValue();

    // Integer cents arithmetic
    const inventoryCents = Math.round(inventoryData.totalValueAmount * 100);
    const fixedAssetCarryingCents = Math.round(fixedAssetData.totalCarryingValueAmount * 100);
    const fixedAssetPurchaseCents = Math.round(fixedAssetData.totalPurchaseValueAmount * 100);

    const combinedValueCents = inventoryCents + fixedAssetCarryingCents;
    const combinedPurchaseValueCents = inventoryCents + fixedAssetPurchaseCents;

    const totalCombinedValueAmount = combinedValueCents / 100;
    const totalCombinedPurchaseValueAmount = combinedPurchaseValueCents / 100;

    // Calculate share percentages safely
    const inventorySharePercentage =
      combinedValueCents > 0 ? Math.round((inventoryCents / combinedValueCents) * 10000) / 100 : 0;
    const fixedAssetSharePercentage =
      combinedValueCents > 0
        ? Math.round((fixedAssetCarryingCents / combinedValueCents) * 10000) / 100
        : 0;

    const dto: ResourceValuationSummaryDTO = {
      totalCombinedValueAmount,
      totalCombinedPurchaseValueAmount,
      currency: inventoryData.currency || fixedAssetData.currency || 'USD',
      inventory: {
        totalValueAmount: inventoryData.totalValueAmount,
        totalDistinctItems: inventoryData.totalDistinctItems,
        totalQuantityUnits: inventoryData.totalQuantityUnits,
        sharePercentage: inventorySharePercentage,
      },
      fixedAssets: {
        totalCarryingValueAmount: fixedAssetData.totalCarryingValueAmount,
        totalPurchaseValueAmount: fixedAssetData.totalPurchaseValueAmount,
        totalAssetCount: fixedAssetData.totalAssetCount,
        activeAssetCount: fixedAssetData.activeAssetCount,
        sharePercentage: fixedAssetSharePercentage,
      },
      calculatedAt: new Date().toISOString(),
    };

    return ApplicationResult.ok(dto);
  }
}
