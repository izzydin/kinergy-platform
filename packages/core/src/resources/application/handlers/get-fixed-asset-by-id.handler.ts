import { QueryHandler } from '../shared/query-handler.interface';
import { ApplicationResult } from '../shared/application-result';
import { GetFixedAssetByIdQuery } from '../queries/get-fixed-asset-by-id.query';
import { FixedAssetDTO } from '../dtos/fixed-asset.dto';
import { FixedAssetRepositoryInterface } from '../../domain/assets/repositories/fixed-asset.repository.interface';
import { AssetId } from '../../domain/assets/value-objects/asset-id.vo';
import { FixedAssetDtoMapper } from '../mappers/fixed-asset-dto.mapper';

export class GetFixedAssetByIdHandler implements QueryHandler<
  GetFixedAssetByIdQuery,
  ApplicationResult<FixedAssetDTO>
> {
  constructor(private readonly assetRepository: FixedAssetRepositoryInterface) {}

  async execute(query: GetFixedAssetByIdQuery): Promise<ApplicationResult<FixedAssetDTO>> {
    const { input } = query;

    try {
      let assetId: AssetId;
      try {
        assetId = AssetId.create(input.id);
      } catch {
        return ApplicationResult.fail(`Fixed asset with ID '${input.id}' was not found.`);
      }

      const asset = await this.assetRepository.findById(assetId);

      if (!asset) {
        return ApplicationResult.fail(`Fixed asset with ID '${input.id}' was not found.`);
      }

      if (input.tenantId && asset.tenantId && asset.tenantId !== input.tenantId) {
        return ApplicationResult.fail(`Fixed asset with ID '${input.id}' was not found.`);
      }

      return ApplicationResult.ok(FixedAssetDtoMapper.toDTO(asset));
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Failed to retrieve fixed asset by ID';
      return ApplicationResult.fail(message);
    }
  }
}
