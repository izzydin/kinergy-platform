import { QueryHandler } from '../shared/query-handler.interface';
import { ApplicationResult } from '../shared/application-result';
import { GetMaintenanceHistoryQuery } from '../queries/get-maintenance-history.query';
import { AssetMaintenanceRecordDTO } from '../dtos/asset-maintenance-record.dto';
import { PaginatedResultDTO } from '../dtos/paginated-result.dto';
import { FixedAssetRepositoryInterface } from '../../domain/assets/repositories/fixed-asset.repository.interface';
import { AssetId } from '../../domain/assets/value-objects/asset-id.vo';
import { FixedAssetDtoMapper } from '../mappers/fixed-asset-dto.mapper';

export class GetMaintenanceHistoryHandler implements QueryHandler<
  GetMaintenanceHistoryQuery,
  ApplicationResult<PaginatedResultDTO<AssetMaintenanceRecordDTO>>
> {
  constructor(private readonly assetRepository: FixedAssetRepositoryInterface) {}

  async execute(
    query: GetMaintenanceHistoryQuery,
  ): Promise<ApplicationResult<PaginatedResultDTO<AssetMaintenanceRecordDTO>>> {
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

      // 3. Date boundary validation & parsing
      let fromDate: Date | undefined;
      let toDate: Date | undefined;

      if (input.fromDate) {
        fromDate = typeof input.fromDate === 'string' ? new Date(input.fromDate) : input.fromDate;
        if (isNaN(fromDate.getTime())) {
          return ApplicationResult.fail(`Invalid fromDate provided: '${input.fromDate}'.`);
        }
      }

      if (input.toDate) {
        if (typeof input.toDate === 'string') {
          if (/^\d{4}-\d{2}-\d{2}$/.test(input.toDate.trim())) {
            toDate = new Date(`${input.toDate.trim()}T23:59:59.999Z`);
          } else {
            toDate = new Date(input.toDate);
          }
        } else {
          toDate = input.toDate;
        }

        if (isNaN(toDate.getTime())) {
          return ApplicationResult.fail(`Invalid toDate provided: '${input.toDate}'.`);
        }
      }

      if (fromDate && toDate && fromDate.getTime() > toDate.getTime()) {
        return ApplicationResult.fail('fromDate cannot be after toDate.');
      }

      // 4. Filter maintenance records
      let records = [...asset.maintenanceRecords];

      if (input.performedBy) {
        const queryTerm = input.performedBy.trim().toLowerCase();
        records = records.filter((r) => r.performedBy.toLowerCase().includes(queryTerm));
      }

      if (fromDate) {
        records = records.filter((r) => r.serviceDate.getTime() >= fromDate!.getTime());
      }

      if (toDate) {
        records = records.filter((r) => r.serviceDate.getTime() <= toDate!.getTime());
      }

      // 5. Deterministic sorting (default newest-first: serviceDate desc, insertion sequence tie-breaker)
      const sortBy = input.sortBy ?? 'serviceDate';
      const sortOrder = input.sortOrder ?? 'desc';

      const recordsWithIndex = records.map((record, index) => ({ record, index }));
      recordsWithIndex.sort((a, b) => {
        const timeA =
          sortBy === 'createdAt' ? a.record.createdAt.getTime() : a.record.serviceDate.getTime();
        const timeB =
          sortBy === 'createdAt' ? b.record.createdAt.getTime() : b.record.serviceDate.getTime();
        const timeDiff = timeA - timeB;
        if (timeDiff !== 0) {
          return sortOrder === 'asc' ? timeDiff : -timeDiff;
        }
        return sortOrder === 'asc' ? a.index - b.index : b.index - a.index;
      });
      const sortedRecords = recordsWithIndex.map((r) => r.record);

      // 6. Pagination bounds
      const page = Math.max(1, input.page ?? 1);
      const limit = Math.min(100, Math.max(1, input.pageSize ?? 20));
      const total = sortedRecords.length;
      const totalPages = total > 0 ? Math.ceil(total / limit) : 0;
      const offset = (page - 1) * limit;
      const paginatedSlice = sortedRecords.slice(offset, offset + limit);

      const items = paginatedSlice.map(FixedAssetDtoMapper.toMaintenanceDTO);

      return ApplicationResult.ok({
        items,
        total,
        page,
        limit,
        totalPages,
        hasNextPage: page < totalPages,
        hasPreviousPage: page > 1 && total > 0,
      });
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : 'Failed to retrieve fixed asset maintenance history';
      return ApplicationResult.fail(message);
    }
  }
}
