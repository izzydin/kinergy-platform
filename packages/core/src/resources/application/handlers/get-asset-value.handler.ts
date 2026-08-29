import { QueryHandler } from '../shared/query-handler.interface';
import { ApplicationResult } from '../shared/application-result';
import { GetAssetValueQuery } from '../queries/get-asset-value.query';
import { AssetValuationDTO } from '../dtos/asset-valuation.dto';
import { FixedAssetRepositoryInterface } from '../../domain/assets/repositories/fixed-asset.repository.interface';
import { AssetId } from '../../domain/assets/value-objects/asset-id.vo';

export class GetAssetValueHandler implements QueryHandler<
  GetAssetValueQuery,
  ApplicationResult<AssetValuationDTO>
> {
  constructor(private readonly assetRepository: FixedAssetRepositoryInterface) {}

  async execute(query: GetAssetValueQuery): Promise<ApplicationResult<AssetValuationDTO>> {
    const { input } = query;

    try {
      // 1. Validate and parse AssetId UUID
      let assetId: AssetId;
      try {
        assetId = AssetId.create(input.assetId);
      } catch {
        return ApplicationResult.fail(`Fixed asset with ID '${input.assetId}' was not found.`);
      }

      // 2. Load asset aggregate & enforce tenant isolation
      const asset = await this.assetRepository.findById(assetId);
      if (!asset) {
        return ApplicationResult.fail(`Fixed asset with ID '${input.assetId}' was not found.`);
      }

      if (input.tenantId && asset.tenantId && asset.tenantId !== input.tenantId) {
        return ApplicationResult.fail(`Fixed asset with ID '${input.assetId}' was not found.`);
      }

      const valuationDto: AssetValuationDTO = {
        assetId: asset.id.value,
        assetTag: asset.assetTag,
        name: asset.name,
        category: asset.category,
        status: asset.status,
        condition: asset.condition,
        purchaseDate: asset.purchaseDate,
        purchaseValueAmount: asset.purchaseValue.amount,
        purchaseValueCurrency: asset.purchaseValue.currency,
        currentEstimatedValueAmount: asset.currentEstimatedValue.amount,
        currentEstimatedValueCurrency: asset.currentEstimatedValue.currency,
        lastValuationDate: asset.updatedAt,
      };

      return ApplicationResult.ok(valuationDto);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Failed to retrieve fixed asset valuation';
      return ApplicationResult.fail(message);
    }
  }
}
