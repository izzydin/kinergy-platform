import { QueryHandler } from '../shared/query-handler.interface';
import { ApplicationResult } from '../shared/application-result';
import { GetFixedAssetByTagQuery } from '../queries/get-fixed-asset-by-tag.query';
import { FixedAssetDTO } from '../dtos/fixed-asset.dto';
import { FixedAssetRepositoryInterface } from '../../domain/assets/repositories/fixed-asset.repository.interface';
import { FixedAssetDtoMapper } from '../mappers/fixed-asset-dto.mapper';

export class GetFixedAssetByTagHandler implements QueryHandler<
  GetFixedAssetByTagQuery,
  ApplicationResult<FixedAssetDTO>
> {
  constructor(private readonly assetRepository: FixedAssetRepositoryInterface) {}

  async execute(query: GetFixedAssetByTagQuery): Promise<ApplicationResult<FixedAssetDTO>> {
    const { input } = query;

    try {
      const normalizedTag = input.assetTag.trim().toUpperCase();
      const asset = await this.assetRepository.findByAssetTag(normalizedTag, input.tenantId);

      if (!asset) {
        return ApplicationResult.fail(
          `Fixed asset with asset tag '${normalizedTag}' was not found.`,
        );
      }

      return ApplicationResult.ok(FixedAssetDtoMapper.toDTO(asset));
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Failed to retrieve fixed asset by asset tag';
      return ApplicationResult.fail(message);
    }
  }
}
