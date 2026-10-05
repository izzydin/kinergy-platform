import { SalesQueryHandler } from '../shared/sales-query-handler.interface';
import { SalesApplicationResult } from '../shared/sales-application-result';
import { ListSalesQuery } from './list-sales.query';
import { SaleSummaryDTO } from '../dtos/sale.dto';
import { PaginatedResultDTO } from '../dtos/paginated-result.dto';
import {
  SaleRepositoryPort,
  FindSalesCriteria,
  FindSalesPagination,
  FindSalesSort,
  SaleSortField,
  SaleSortDirection,
} from '../ports/sale-repository.port';
import { InvalidSaleQueryException } from '../exceptions/invalid-sale-query.exception';
import { isValidSaleStatus, SaleStatus } from '../../domain/enums/sale-status.enum';

/**
 * ListSalesHandler executes the ListSales query.
 *
 * Responsibilities:
 * 1. Accept and validate query inputs (pagination, sorting, and justified filters).
 * 2. Enforce pagination limits (default 20, max cap 100).
 * 3. Enforce strict sort whitelist ('createdAt', 'total', 'status') to prevent arbitrary SQL/ORM injections.
 * 4. Coordinate with SaleRepositoryPort.findMany() without loading full Sale aggregate trees.
 * 5. Provide deterministic secondary sorting (id asc) through the repository contract.
 * 6. Return standard PaginatedResultDTO<SaleSummaryDTO> wrapped in SalesApplicationResult.
 */
export class ListSalesHandler implements SalesQueryHandler<
  ListSalesQuery,
  SalesApplicationResult<PaginatedResultDTO<SaleSummaryDTO>>
> {
  private static readonly ALLOWED_SORT_FIELDS: ReadonlySet<string> = new Set([
    'createdAt',
    'total',
    'totalAmount',
    'status',
  ]);

  constructor(private readonly saleRepository: SaleRepositoryPort) {}

  public async execute(
    query: ListSalesQuery,
  ): Promise<SalesApplicationResult<PaginatedResultDTO<SaleSummaryDTO>>> {
    try {
      if (!query || !query.input) {
        return SalesApplicationResult.fail(
          new InvalidSaleQueryException('Query and input cannot be null or undefined.'),
        );
      }

      const input = query.input;

      // 1. Pagination Validation & Normalization
      const rawPage = input.pagination?.page ?? input.page;
      let page = 1;
      if (rawPage !== undefined) {
        if (typeof rawPage !== 'number' || !Number.isInteger(rawPage) || rawPage < 1) {
          return SalesApplicationResult.fail(
            new InvalidSaleQueryException(
              `Invalid page '${String(rawPage)}'. Page must be an integer greater than or equal to 1.`,
              'INVALID_PAGINATION',
            ),
          );
        }
        page = rawPage;
      }

      const rawLimit = input.pagination?.limit ?? input.limit ?? input.pageSize;
      let limit = 20;
      if (rawLimit !== undefined) {
        if (typeof rawLimit !== 'number' || !Number.isInteger(rawLimit) || rawLimit < 1) {
          return SalesApplicationResult.fail(
            new InvalidSaleQueryException(
              `Invalid limit '${String(rawLimit)}'. Limit must be an integer greater than or equal to 1.`,
              'INVALID_PAGINATION',
            ),
          );
        }
        limit = Math.min(100, rawLimit);
      }

      // 2. Sorting Validation & Normalization
      const rawSortField = input.sort?.field ?? input.sortField ?? input.sortBy ?? 'createdAt';
      const normalizedSortField = String(rawSortField).trim();

      if (!ListSalesHandler.ALLOWED_SORT_FIELDS.has(normalizedSortField)) {
        return SalesApplicationResult.fail(
          new InvalidSaleQueryException(
            `Invalid sort field '${normalizedSortField}'. Allowed sort fields are: createdAt, total, status.`,
            'INVALID_SORT_FIELD',
          ),
        );
      }

      const sortField: SaleSortField =
        normalizedSortField === 'totalAmount' ? 'total' : (normalizedSortField as SaleSortField);

      const rawSortDir = input.sort?.direction ?? input.sortDirection ?? input.sortOrder ?? 'desc';
      const normalizedSortDir = String(rawSortDir).trim().toLowerCase();

      if (normalizedSortDir !== 'asc' && normalizedSortDir !== 'desc') {
        return SalesApplicationResult.fail(
          new InvalidSaleQueryException(
            `Invalid sort direction '${String(rawSortDir)}'. Allowed directions are 'asc' or 'desc'.`,
            'INVALID_SORT_DIRECTION',
          ),
        );
      }
      const sortDirection: SaleSortDirection = normalizedSortDir;

      // 3. Filter Validation & Normalization
      const tenantId = input.tenantId?.trim() || undefined;
      const clientId = (input.filter?.clientId ?? input.clientId)?.trim() || undefined;
      const sourceType = (input.filter?.sourceType ?? input.sourceType)?.trim() || undefined;
      const sourceReferenceId =
        (input.filter?.sourceReferenceId ?? input.sourceReferenceId)?.trim() || undefined;

      // Status validation
      const rawStatus = input.filter?.status ?? input.status;
      let status: SaleStatus | undefined;
      if (rawStatus !== undefined && rawStatus !== null && String(rawStatus).trim() !== '') {
        const trimmedStatus = String(rawStatus).trim().toUpperCase();
        if (!isValidSaleStatus(trimmedStatus)) {
          return SalesApplicationResult.fail(
            new InvalidSaleQueryException(
              `Invalid sale status '${String(rawStatus)}'.`,
              'INVALID_FILTER',
            ),
          );
        }
        status = trimmedStatus;
      }

      // Date range validation
      const rawFrom = input.filter?.fromDate ?? input.fromDate;
      const rawTo = input.filter?.toDate ?? input.toDate;
      let fromDate: Date | undefined;
      let toDate: Date | undefined;

      if (rawFrom !== undefined && rawFrom !== null) {
        fromDate = rawFrom instanceof Date ? rawFrom : new Date(rawFrom);
        if (isNaN(fromDate.getTime())) {
          return SalesApplicationResult.fail(
            new InvalidSaleQueryException(
              `Invalid fromDate format: '${String(rawFrom)}'.`,
              'INVALID_FILTER',
            ),
          );
        }
      }

      if (rawTo !== undefined && rawTo !== null) {
        toDate = rawTo instanceof Date ? rawTo : new Date(rawTo);
        if (isNaN(toDate.getTime())) {
          return SalesApplicationResult.fail(
            new InvalidSaleQueryException(
              `Invalid toDate format: '${String(rawTo)}'.`,
              'INVALID_FILTER',
            ),
          );
        }
      }

      if (fromDate && toDate && fromDate > toDate) {
        return SalesApplicationResult.fail(
          new InvalidSaleQueryException(
            `fromDate (${fromDate.toISOString()}) cannot be after toDate (${toDate.toISOString()}).`,
            'INVALID_FILTER',
          ),
        );
      }

      // 4. Delegate to repository (prefers domain-oriented list, falls back to findMany)
      const listFn = this.saleRepository.list
        ? this.saleRepository.list.bind(this.saleRepository)
        : this.saleRepository.findMany
          ? this.saleRepository.findMany.bind(this.saleRepository)
          : null;

      if (!listFn) {
        return SalesApplicationResult.fail(
          new Error('SaleRepository does not implement findMany operation.'),
        );
      }

      const criteria: FindSalesCriteria = {
        tenantId,
        clientId,
        status,
        sourceType,
        sourceReferenceId,
        fromDate,
        toDate,
      };

      const pagination: FindSalesPagination = {
        page,
        limit,
      };

      const sort: FindSalesSort = {
        field: sortField,
        direction: sortDirection,
      };

      const repoResult = await listFn(criteria, pagination, sort);

      const total = repoResult.total;
      const totalPages = total === 0 ? 0 : Math.ceil(total / limit);

      const result: PaginatedResultDTO<SaleSummaryDTO> = {
        items: repoResult.items,
        total,
        page,
        limit,
        totalPages,
        hasNextPage: page < totalPages,
        hasPreviousPage: page > 1,
      };

      return SalesApplicationResult.ok(result);
    } catch (err: unknown) {
      const error = err instanceof Error ? err : new Error(String(err));
      return SalesApplicationResult.fail(error);
    }
  }
}
