import { QueryHandler } from '../shared/query-handler.interface';
import { ApplicationResult } from '../shared/application-result';
import { GetFixedAssetValuationSummaryQuery } from '../queries/get-fixed-asset-valuation-summary.query';
import {
  FixedAssetValuationSummaryDTO,
  FixedAssetCategoryValuationDTO,
  FixedAssetStatusValuationDTO,
  FixedAssetConditionValuationDTO,
} from '../dtos/asset-valuation.dto';
import {
  FixedAssetRepositoryInterface,
  FixedAssetFilterOptions,
} from '../../domain/assets/repositories/fixed-asset.repository.interface';
import { AssetStatus } from '../../domain/assets/enums/asset-status.enum';
import { AssetCategory } from '../../domain/assets/enums/asset-category.enum';

/**
 * Use case handler computing aggregate Fixed Asset capital equipment valuation.
 * Evaluates authoritative carrying book value (currentEstimatedValue) and historical CAPEX (purchaseValue).
 * Follows the authoritative Fixed Asset Valuation Policy (ADR-0097):
 * - Included in Active Carrying Value: ACTIVE, UNDER_MAINTENANCE, DAMAGED.
 * - Excluded from Active Carrying Value: RETIRED, SOLD.
 * - Performs integer cents arithmetic to eliminate floating point accumulation error.
 */
export class GetFixedAssetValuationSummaryHandler implements QueryHandler<
  GetFixedAssetValuationSummaryQuery,
  ApplicationResult<FixedAssetValuationSummaryDTO>
> {
  constructor(private readonly assetRepository: FixedAssetRepositoryInterface) {}

  public async execute(
    query: GetFixedAssetValuationSummaryQuery,
  ): Promise<ApplicationResult<FixedAssetValuationSummaryDTO>> {
    const { input } = query;

    const filter: FixedAssetFilterOptions = {
      tenantId: input.tenantId?.trim() || undefined,
      category: input.category ? (input.category as AssetCategory) : undefined,
      includeDecommissioned: input.includeDecommissioned ?? false,
    };

    const assets = await this.assetRepository.findAll(filter);

    let totalCarryingCents = 0;
    let totalPurchaseCents = 0;
    let activeAssetCount = 0;
    const currency = 'USD';

    const breakdownByCategory: Record<string, FixedAssetCategoryValuationDTO> = {};
    const breakdownByStatus: Record<string, FixedAssetStatusValuationDTO> = {};
    const breakdownByCondition: Record<string, FixedAssetConditionValuationDTO> = {};

    for (const asset of assets) {
      const isEligibleForCarryingValue =
        asset.status === AssetStatus.ACTIVE ||
        asset.status === AssetStatus.UNDER_MAINTENANCE ||
        asset.status === AssetStatus.DAMAGED;

      const carryingValueAmount = asset.currentEstimatedValue.amount;
      const purchaseValueAmount = asset.purchaseValue.amount;

      const carryingValueCents = isEligibleForCarryingValue
        ? Math.round(carryingValueAmount * 100)
        : 0;
      const purchaseValueCents = Math.round(purchaseValueAmount * 100);

      if (isEligibleForCarryingValue) {
        totalCarryingCents += carryingValueCents;
        activeAssetCount += 1;
      }
      totalPurchaseCents += purchaseValueCents;

      // Category breakdown
      const categoryKey = asset.category;
      if (!breakdownByCategory[categoryKey]) {
        breakdownByCategory[categoryKey] = {
          totalCarryingValueAmount: 0,
          totalPurchaseValueAmount: 0,
          assetCount: 0,
        };
      }
      const cat = breakdownByCategory[categoryKey]!;
      cat.totalCarryingValueAmount =
        Math.round((cat.totalCarryingValueAmount + carryingValueCents / 100) * 100) / 100;
      cat.totalPurchaseValueAmount =
        Math.round((cat.totalPurchaseValueAmount + purchaseValueCents / 100) * 100) / 100;
      cat.assetCount += 1;

      // Status breakdown
      const statusKey = asset.status;
      if (!breakdownByStatus[statusKey]) {
        breakdownByStatus[statusKey] = {
          count: 0,
          totalCarryingValueAmount: 0,
        };
      }
      const stat = breakdownByStatus[statusKey]!;
      stat.count += 1;
      stat.totalCarryingValueAmount =
        Math.round((stat.totalCarryingValueAmount + carryingValueCents / 100) * 100) / 100;

      // Condition breakdown
      const conditionKey = asset.condition;
      if (!breakdownByCondition[conditionKey]) {
        breakdownByCondition[conditionKey] = {
          count: 0,
          totalCarryingValueAmount: 0,
        };
      }
      const cond = breakdownByCondition[conditionKey]!;
      cond.count += 1;
      cond.totalCarryingValueAmount =
        Math.round((cond.totalCarryingValueAmount + carryingValueCents / 100) * 100) / 100;
    }

    const totalCarryingValueAmount = totalCarryingCents / 100;
    const totalPurchaseValueAmount = totalPurchaseCents / 100;

    const dto: FixedAssetValuationSummaryDTO = {
      totalCarryingValueAmount,
      totalPurchaseValueAmount,
      currency,
      totalAssetCount: assets.length,
      activeAssetCount,
      calculatedAt: new Date().toISOString(),
      breakdownByCategory,
      breakdownByStatus,
      breakdownByCondition,
    };

    return ApplicationResult.ok(dto);
  }
}
