import { SalesQueryHandler } from '../shared/sales-query-handler.interface';
import { SalesApplicationResult } from '../shared/sales-application-result';
import { ListPaymentsQuery } from './list-payments.query';
import { PaymentDTO } from '../dtos/payment.dto';
import { PaginatedResultDTO } from '../dtos/paginated-result.dto';
import {
  PaymentRepositoryPort,
  FindPaymentsCriteria,
  FindPaymentsPagination,
  FindPaymentsSort,
  PaymentSortField,
  PaymentSortDirection,
} from '../ports/payment-repository.port';
import { InvalidPaymentQueryException } from '../exceptions/invalid-payment-query.exception';
import { isValidPaymentStatus, PaymentStatus } from '../../domain/enums/payment-status.enum';
import { isValidPaymentMethod, PaymentMethod } from '../../domain/enums/payment-method.enum';
import { checkPaymentAuthorization } from '../shared/payment-authorization';
import { PaymentMapper } from '../mappers/payment.mapper';
import { Payment } from '../../domain/payment.aggregate';

/**
 * ListPaymentsHandler executes the ListPayments query.
 *
 * Responsibilities:
 * 1. Accept and validate query inputs (pagination, sorting, and justified filters).
 * 2. Check authorization ('payments.read').
 * 3. Enforce pagination limits (default 20, max cap 100).
 * 4. Enforce strict sort whitelist ('createdAt', 'paidAt', 'amount', 'status') preventing arbitrary dynamic fields.
 * 5. Coordinate with PaymentRepositoryPort.findMany() without eagerly loading full Sale aggregates (avoiding N+1).
 * 6. Guarantee deterministic secondary sorting (id asc) through the repository contract.
 * 7. Return standard PaginatedResultDTO<PaymentDTO> wrapped in SalesApplicationResult.
 */
export class ListPaymentsHandler implements SalesQueryHandler<
  ListPaymentsQuery,
  SalesApplicationResult<PaginatedResultDTO<PaymentDTO>>
> {
  private static readonly ALLOWED_SORT_FIELDS: ReadonlySet<string> = new Set([
    'createdAt',
    'paidAt',
    'amount',
    'status',
  ]);

  constructor(private readonly paymentRepository: PaymentRepositoryPort) {}

  public async execute(
    query: ListPaymentsQuery,
  ): Promise<SalesApplicationResult<PaginatedResultDTO<PaymentDTO>>> {
    try {
      if (!query || !query.input) {
        return SalesApplicationResult.fail(
          new InvalidPaymentQueryException('Query and input cannot be null or undefined.'),
        );
      }

      const input = query.input;

      // 1. Authorization
      checkPaymentAuthorization(input.currentUser, ['payments.read']);

      // 2. Pagination Validation & Normalization
      const rawPage = input.pagination?.page ?? input.page;
      let page = 1;
      if (rawPage !== undefined) {
        if (typeof rawPage !== 'number' || !Number.isInteger(rawPage) || rawPage < 1) {
          return SalesApplicationResult.fail(
            new InvalidPaymentQueryException(
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
            new InvalidPaymentQueryException(
              `Invalid limit '${String(rawLimit)}'. Limit must be an integer greater than or equal to 1.`,
              'INVALID_PAGINATION',
            ),
          );
        }
        limit = Math.min(100, rawLimit);
      }

      // 3. Sorting Validation & Normalization
      const rawSortField = input.sort?.field ?? input.sortField ?? input.sortBy ?? 'createdAt';
      const normalizedSortField = String(rawSortField).trim();

      if (!ListPaymentsHandler.ALLOWED_SORT_FIELDS.has(normalizedSortField)) {
        return SalesApplicationResult.fail(
          new InvalidPaymentQueryException(
            `Invalid sort field '${normalizedSortField}'. Allowed sort fields are: createdAt, paidAt, amount, status.`,
            'INVALID_SORT_FIELD',
          ),
        );
      }
      const sortField = normalizedSortField as PaymentSortField;

      const rawSortDir = input.sort?.direction ?? input.sortDirection ?? input.sortOrder ?? 'desc';
      const normalizedSortDir = String(rawSortDir).trim().toLowerCase();

      if (normalizedSortDir !== 'asc' && normalizedSortDir !== 'desc') {
        return SalesApplicationResult.fail(
          new InvalidPaymentQueryException(
            `Invalid sort direction '${String(rawSortDir)}'. Allowed directions are 'asc' or 'desc'.`,
            'INVALID_SORT_DIRECTION',
          ),
        );
      }
      const sortDirection: PaymentSortDirection = normalizedSortDir;

      // 4. Filter Validation & Normalization
      const tenantId = input.tenantId?.trim() || undefined;
      const saleId = (input.filter?.saleId ?? input.saleId)?.trim() || undefined;

      // Status filter
      const rawStatus = input.filter?.status ?? input.status;
      let status: PaymentStatus | undefined;
      if (rawStatus !== undefined && rawStatus !== null && String(rawStatus).trim() !== '') {
        const trimmedStatus = String(rawStatus).trim().toUpperCase();
        if (!isValidPaymentStatus(trimmedStatus)) {
          return SalesApplicationResult.fail(
            new InvalidPaymentQueryException(
              `Invalid payment status '${String(rawStatus)}'. Allowed statuses are: PENDING, COMPLETED, FAILED, CANCELLED.`,
              'INVALID_FILTER',
            ),
          );
        }
        status = trimmedStatus;
      }

      // Method filter
      const rawMethod = input.filter?.method ?? input.method;
      let method: PaymentMethod | undefined;
      if (rawMethod !== undefined && rawMethod !== null && String(rawMethod).trim() !== '') {
        const trimmedMethod = String(rawMethod).trim().toUpperCase();
        if (!isValidPaymentMethod(trimmedMethod)) {
          return SalesApplicationResult.fail(
            new InvalidPaymentQueryException(
              `Invalid payment method '${String(rawMethod)}'. Supported methods are: CASH, QR.`,
              'INVALID_FILTER',
            ),
          );
        }
        method = trimmedMethod;
      }

      // createdAt date range validation
      const rawCreatedAtFrom =
        input.filter?.createdAtFrom ??
        input.createdAtFrom ??
        input.filter?.fromDate ??
        input.fromDate;
      const rawCreatedAtTo =
        input.filter?.createdAtTo ?? input.createdAtTo ?? input.filter?.toDate ?? input.toDate;

      let createdAtFrom: Date | undefined;
      let createdAtTo: Date | undefined;

      if (rawCreatedAtFrom !== undefined && rawCreatedAtFrom !== null) {
        createdAtFrom =
          rawCreatedAtFrom instanceof Date ? rawCreatedAtFrom : new Date(rawCreatedAtFrom);
        if (isNaN(createdAtFrom.getTime())) {
          return SalesApplicationResult.fail(
            new InvalidPaymentQueryException(
              `Invalid createdAtFrom format: '${String(rawCreatedAtFrom)}'.`,
              'INVALID_FILTER',
            ),
          );
        }
      }

      if (rawCreatedAtTo !== undefined && rawCreatedAtTo !== null) {
        createdAtTo = rawCreatedAtTo instanceof Date ? rawCreatedAtTo : new Date(rawCreatedAtTo);
        if (isNaN(createdAtTo.getTime())) {
          return SalesApplicationResult.fail(
            new InvalidPaymentQueryException(
              `Invalid createdAtTo format: '${String(rawCreatedAtTo)}'.`,
              'INVALID_FILTER',
            ),
          );
        }
      }

      if (createdAtFrom && createdAtTo && createdAtFrom > createdAtTo) {
        return SalesApplicationResult.fail(
          new InvalidPaymentQueryException(
            `createdAtFrom (${createdAtFrom.toISOString()}) cannot be after createdAtTo (${createdAtTo.toISOString()}).`,
            'INVALID_FILTER',
          ),
        );
      }

      // paidAt date range validation
      const rawPaidAtFrom = input.filter?.paidAtFrom ?? input.paidAtFrom;
      const rawPaidAtTo = input.filter?.paidAtTo ?? input.paidAtTo;

      let paidAtFrom: Date | undefined;
      let paidAtTo: Date | undefined;

      if (rawPaidAtFrom !== undefined && rawPaidAtFrom !== null) {
        paidAtFrom = rawPaidAtFrom instanceof Date ? rawPaidAtFrom : new Date(rawPaidAtFrom);
        if (isNaN(paidAtFrom.getTime())) {
          return SalesApplicationResult.fail(
            new InvalidPaymentQueryException(
              `Invalid paidAtFrom format: '${String(rawPaidAtFrom)}'.`,
              'INVALID_FILTER',
            ),
          );
        }
      }

      if (rawPaidAtTo !== undefined && rawPaidAtTo !== null) {
        paidAtTo = rawPaidAtTo instanceof Date ? rawPaidAtTo : new Date(rawPaidAtTo);
        if (isNaN(paidAtTo.getTime())) {
          return SalesApplicationResult.fail(
            new InvalidPaymentQueryException(
              `Invalid paidAtTo format: '${String(rawPaidAtTo)}'.`,
              'INVALID_FILTER',
            ),
          );
        }
      }

      if (paidAtFrom && paidAtTo && paidAtFrom > paidAtTo) {
        return SalesApplicationResult.fail(
          new InvalidPaymentQueryException(
            `paidAtFrom (${paidAtFrom.toISOString()}) cannot be after paidAtTo (${paidAtTo.toISOString()}).`,
            'INVALID_FILTER',
          ),
        );
      }

      // 5. Delegate to repository
      const listFn = this.paymentRepository.list
        ? this.paymentRepository.list.bind(this.paymentRepository)
        : this.paymentRepository.findMany
          ? this.paymentRepository.findMany.bind(this.paymentRepository)
          : null;

      if (!listFn) {
        return SalesApplicationResult.fail(
          new Error('PaymentRepository does not implement findMany or list operation.'),
        );
      }

      const criteria: FindPaymentsCriteria = {
        tenantId,
        saleId,
        status,
        method,
        createdAtFrom,
        createdAtTo,
        paidAtFrom,
        paidAtTo,
      };

      const pagination: FindPaymentsPagination = {
        page,
        limit,
      };

      const sort: FindPaymentsSort = {
        field: sortField,
        direction: sortDirection,
      };

      const repoResult = await listFn(criteria, pagination, sort);

      const items: PaymentDTO[] = repoResult.items.map((item) =>
        item instanceof Payment ? PaymentMapper.toDTO(item) : item,
      );

      const total = repoResult.total;
      const totalPages = total === 0 ? 0 : Math.ceil(total / limit);

      const result: PaginatedResultDTO<PaymentDTO> = {
        items,
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
