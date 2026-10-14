/**
 * Sales URL State & Query Parameter Types
 *
 * Adheres strictly to Track C DataTable URL State Architecture and ADR-0136:
 * Browser URLSearchParams is the single authoritative source of truth for sales
 * table search, filtering, sorting, and pagination.
 */

export type SaleStatus =
  'DRAFT' | 'PENDING_PAYMENT' | 'PARTIALLY_PAID' | 'PAID' | 'COMPLETED' | 'CANCELLED' | 'REFUNDED';

export const VALID_SALE_STATUSES: readonly SaleStatus[] = [
  'DRAFT',
  'PENDING_PAYMENT',
  'PARTIALLY_PAID',
  'PAID',
  'COMPLETED',
  'CANCELLED',
  'REFUNDED',
] as const;

export type SaleSortField = 'createdAt' | 'total' | 'totalAmount' | 'status';
export type SaleSortDirection = 'asc' | 'desc';

/**
 * Filter facets parsed from URLSearchParams for Sales
 */
export interface SalesFilters {
  readonly status?: SaleStatus;
  readonly clientId?: string;
  readonly sourceType?: string;
  readonly sourceReferenceId?: string;
  readonly fromDate?: string;
  readonly toDate?: string;
}

/**
 * Standard API Query Parameters payload adhering to ListSalesQueryDto
 */
export interface ListSalesQueryParams {
  readonly q?: string;
  readonly search?: string;
  readonly page: number;
  readonly limit: number;
  readonly sort?: string;
  readonly sortField?: SaleSortField;
  readonly sortDirection?: SaleSortDirection;
  readonly clientId?: string;
  readonly status?: SaleStatus;
  readonly sourceType?: string;
  readonly sourceReferenceId?: string;
  readonly fromDate?: string;
  readonly toDate?: string;
}

/**
 * Return signature of useSalesFilters hook
 */
export interface UseSalesFiltersReturn {
  /** Clean parameters object ready to be passed to TanStack useQuery / API client */
  readonly params: ListSalesQueryParams;
  /** Individual filter facets */
  readonly filters: SalesFilters;
  /** Free-text search query string */
  readonly q: string;
  /** Current 1-based page index */
  readonly page: number;
  /** Current items-per-page limit */
  readonly limit: number;
  /** Serialized sort parameter (e.g. 'createdAt.desc') */
  readonly sort?: string;
  /** Unpacked sort state for TanStack table column headers */
  readonly sortState: Array<{ id: string; desc: boolean }>;
  /** True if any search term or domain filter is active */
  readonly isFiltered: boolean;

  // Actions updating URL state (single source of truth)
  readonly setSearch: (q: string, options?: { immediate?: boolean }) => void;
  readonly setPage: (page: number) => void;
  readonly setLimit: (limit: number) => void;
  readonly setSort: (sort?: string) => void;
  readonly toggleSort: (field: SaleSortField) => void;
  readonly setStatus: (status?: SaleStatus | 'ALL') => void;
  readonly setClientId: (clientId?: string) => void;
  readonly setSourceType: (sourceType?: string) => void;
  readonly setSourceReferenceId: (id?: string) => void;
  readonly setDateRange: (fromDate?: string, toDate?: string) => void;
  readonly resetFilters: () => void;
  readonly resetAll: () => void;
}
