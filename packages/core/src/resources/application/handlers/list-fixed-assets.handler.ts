import { QueryHandler } from '../shared/query-handler.interface';
import { ApplicationResult } from '../shared/application-result';
import { ListFixedAssetsQuery, FixedAssetSortBy } from '../queries/list-fixed-assets.query';
import { FixedAssetDTO } from '../dtos/fixed-asset.dto';
import { PaginatedResultDTO } from '../dtos/paginated-result.dto';
import {
  FixedAssetRepositoryInterface,
  FixedAssetFilterOptions,
} from '../../domain/assets/repositories/fixed-asset.repository.interface';
import { FixedAssetDtoMapper } from '../mappers/fixed-asset-dto.mapper';

const ALLOWED_SORT_FIELDS: ReadonlySet<FixedAssetSortBy> = new Set<FixedAssetSortBy>([
  'name',
  'assetTag',
  'category',
  'status',
  'condition',
  'purchaseDate',
  'purchaseValueAmount',
  'currentEstimatedValueAmount',
  'createdAt',
  'updatedAt',
]);

export class ListFixedAssetsHandler implements QueryHandler<
  ListFixedAssetsQuery,
  ApplicationResult<PaginatedResultDTO<FixedAssetDTO>>
> {
  constructor(private readonly assetRepository: FixedAssetRepositoryInterface) {}

  async execute(
    query: ListFixedAssetsQuery,
  ): Promise<ApplicationResult<PaginatedResultDTO<FixedAssetDTO>>> {
    const { input } = query;

    try {
      const page = Math.max(1, input.filter?.page ?? 1);
      const limit = Math.min(100, Math.max(1, input.filter?.pageSize ?? 20));
      const offset = (page - 1) * limit;

      let sortBy: FixedAssetSortBy = 'name';
      if (input.filter?.sortBy) {
        if (!ALLOWED_SORT_FIELDS.has(input.filter.sortBy)) {
          return ApplicationResult.fail(
            `Invalid sort field '${input.filter.sortBy}'. Allowed fields are: ${Array.from(
              ALLOWED_SORT_FIELDS,
            ).join(', ')}`,
          );
        }
        sortBy = input.filter.sortBy;
      }

      const sortOrder = input.filter?.sortOrder === 'desc' ? 'desc' : 'asc';

      const repoFilter: FixedAssetFilterOptions = {
        tenantId: input.tenantId,
        category: input.filter?.category,
        status: input.filter?.status,
        condition: input.filter?.condition,
        facilityId: input.filter?.facilityId,
        roomId: input.filter?.roomId,
        includeDecommissioned: input.filter?.includeDecommissioned,
        search: input.filter?.search,
        sortBy,
        sortOrder,
        limit,
        offset,
      };

      const [items, total] = await Promise.all([
        this.assetRepository.findAll(repoFilter),
        this.assetRepository.count(repoFilter),
      ]);

      const totalPages = Math.ceil(total / limit) || 1;

      const result: PaginatedResultDTO<FixedAssetDTO> = {
        items: items.map((item) => FixedAssetDtoMapper.toDTO(item, false)),
        total,
        page,
        limit,
        totalPages,
        hasNextPage: page < totalPages,
        hasPreviousPage: page > 1,
      };

      return ApplicationResult.ok(result);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to list fixed assets';
      return ApplicationResult.fail(message);
    }
  }
}
