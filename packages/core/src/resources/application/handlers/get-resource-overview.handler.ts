import { QueryHandler } from '../shared/query-handler.interface';
import { ApplicationResult } from '../shared/application-result';
import { GetResourceOverviewQuery } from '../queries/get-resource-overview.query';
import { ResourceOverviewDTO } from '../dtos/resource-overview.dto';
import { InventoryItemRepository } from '../../domain/inventory/repositories/inventory-item.repository.interface';
import { FixedAssetRepositoryInterface } from '../../domain/assets/repositories/fixed-asset.repository.interface';
import { GetInventoryValuationHandler } from './get-inventory-valuation.handler';
import { GetFixedAssetValuationSummaryHandler } from './get-fixed-asset-valuation-summary.handler';
import { GetInventoryValuationQuery } from '../queries/get-inventory-valuation.query';
import { GetFixedAssetValuationSummaryQuery } from '../queries/get-fixed-asset-valuation-summary.query';
import { AssetStatus } from '../../domain/assets/enums/asset-status.enum';

/**
 * Use case handler orchestrating the executive Resource Overview Dashboard.
 * Concurrently evaluates Consumable Inventory metrics and Fixed Asset lifecycle telemetry,
 * synthesizing combined resource balance sheet carrying values with integer cents arithmetic.
 * Preserves explicit semantic separation between Consumable Inventory and Fixed Assets (ADR-0081, ADR-0098).
 */
export class GetResourceOverviewHandler implements QueryHandler<
  GetResourceOverviewQuery,
  ApplicationResult<ResourceOverviewDTO>
> {
  private readonly inventoryValuationHandler: GetInventoryValuationHandler;
  private readonly fixedAssetValuationHandler: GetFixedAssetValuationSummaryHandler;

  constructor(
    private readonly inventoryRepository: InventoryItemRepository,
    fixedAssetRepository: FixedAssetRepositoryInterface,
  ) {
    this.inventoryValuationHandler = new GetInventoryValuationHandler(inventoryRepository);
    this.fixedAssetValuationHandler = new GetFixedAssetValuationSummaryHandler(
      fixedAssetRepository,
    );
  }

  public async execute(
    query: GetResourceOverviewQuery,
  ): Promise<ApplicationResult<ResourceOverviewDTO>> {
    const { input } = query;

    try {
      // Concurrently execute domain valuation queries and operational counts
      const [inventoryValuationResult, fixedAssetValuationResult, lowStockCount] =
        await Promise.all([
          this.inventoryValuationHandler.execute(
            new GetInventoryValuationQuery({
              tenantId: input.tenantId,
              includeArchived: input.includeArchived,
            }),
          ),
          this.fixedAssetValuationHandler.execute(
            new GetFixedAssetValuationSummaryQuery({
              tenantId: input.tenantId,
              includeDecommissioned: true, // Required to accurately count retired and sold assets
            }),
          ),
          this.inventoryRepository.count({
            tenantId: input.tenantId,
            lowStockOnly: true,
            includeArchived: input.includeArchived ?? false,
          }),
        ]);

      if (!inventoryValuationResult.isSuccess) {
        return ApplicationResult.fail(inventoryValuationResult.getError());
      }
      if (!fixedAssetValuationResult.isSuccess) {
        return ApplicationResult.fail(fixedAssetValuationResult.getError());
      }

      const inventoryData = inventoryValuationResult.getValue();
      const fixedAssetData = fixedAssetValuationResult.getValue();

      // Integer cents arithmetic for money
      const inventoryCents = Math.round(inventoryData.totalValueAmount * 100);
      const fixedAssetCarryingCents = Math.round(fixedAssetData.totalCarryingValueAmount * 100);
      const combinedValueCents = inventoryCents + fixedAssetCarryingCents;
      const totalCombinedValueAmount = combinedValueCents / 100;

      const activeAssetCount = fixedAssetData.breakdownByStatus[AssetStatus.ACTIVE]?.count ?? 0;
      const underMaintenanceAssetCount =
        fixedAssetData.breakdownByStatus[AssetStatus.UNDER_MAINTENANCE]?.count ?? 0;
      const damagedAssetCount = fixedAssetData.breakdownByStatus[AssetStatus.DAMAGED]?.count ?? 0;
      const retiredAssetCount = fixedAssetData.breakdownByStatus[AssetStatus.RETIRED]?.count ?? 0;

      const dto: ResourceOverviewDTO = {
        consumableInventory: {
          totalValueAmount: inventoryData.totalValueAmount,
          lowStockItemCount: lowStockCount,
          totalDistinctItems: inventoryData.totalDistinctItems,
          totalQuantityUnits: inventoryData.totalQuantityUnits,
        },
        fixedAssets: {
          totalCarryingValueAmount: fixedAssetData.totalCarryingValueAmount,
          activeAssetCount,
          underMaintenanceAssetCount,
          damagedAssetCount,
          retiredAssetCount,
          totalAssetCount: fixedAssetData.totalAssetCount,
        },
        combined: {
          totalCombinedValueAmount,
        },
        currency: inventoryData.currency || fixedAssetData.currency || 'USD',
        calculatedAt: new Date().toISOString(),
      };

      return ApplicationResult.ok(dto);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      return ApplicationResult.fail(message);
    }
  }
}
