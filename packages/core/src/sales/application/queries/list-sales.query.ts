import { SaleStatus } from '../../domain/enums/sale-status.enum';

export interface ListSalesFilter {
  readonly clientId?: string;
  readonly status?: SaleStatus | string;
  readonly sourceType?: string;
  readonly sourceReferenceId?: string;
  readonly fromDate?: Date | string;
  readonly toDate?: Date | string;
}

export interface ListSalesPagination {
  readonly page?: number;
  readonly limit?: number;
}

export type ListSalesSortField = 'createdAt' | 'total' | 'status';
export type ListSalesSortDirection = 'asc' | 'desc';

export interface ListSalesSort {
  readonly field?: ListSalesSortField | string;
  readonly direction?: ListSalesSortDirection | string;
}

export interface ListSalesInput {
  readonly tenantId?: string;

  // Nested query structures (ADR-0132 Section 4.7)
  readonly filter?: ListSalesFilter;
  readonly pagination?: ListSalesPagination;
  readonly sort?: ListSalesSort;

  // Flat query parameters (DataTable / REST URL state conventions)
  readonly clientId?: string;
  readonly status?: SaleStatus | string;
  readonly sourceType?: string;
  readonly sourceReferenceId?: string;
  readonly fromDate?: Date | string;
  readonly toDate?: Date | string;
  readonly page?: number;
  readonly limit?: number;
  readonly pageSize?: number;
  readonly sortBy?: ListSalesSortField | string;
  readonly sortField?: ListSalesSortField | string;
  readonly sortOrder?: ListSalesSortDirection | string;
  readonly sortDirection?: ListSalesSortDirection | string;
}

/**
 * ListSalesQuery retrieves a paginated, filtered, and deterministically sorted
 * collection of sales summary projections.
 * Classified as a read-only QUERY without side-effects or aggregate mutations.
 */
export class ListSalesQuery {
  constructor(public readonly input: ListSalesInput = {}) {}
}
