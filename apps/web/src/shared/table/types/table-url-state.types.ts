/**
 * Table URL State & Query Parameter Types
 *
 * Enforces Track C — Step C2.0 / C2.1 DataTable Architecture:
 * Strictly establishes browser URLSearchParams as the single source of truth
 * for table search, filtering, sorting, and pagination.
 */

export type SortDirection = 'asc' | 'desc';

export interface SortState {
  readonly id: string;
  readonly desc: boolean;
}

export type FilterParser<T = unknown> = (raw: string | null) => T | undefined;
export type FilterSerializer<T = unknown> = (value: T) => string | null | undefined;

export type FilterParserMap<TFilters extends object> = {
  readonly [K in keyof TFilters]?: FilterParser<TFilters[K]>;
};

export type FilterSerializerMap<TFilters extends object> = {
  readonly [K in keyof TFilters]?: FilterSerializer<TFilters[K]>;
};

export interface TableParamNames {
  readonly q?: string;
  readonly page?: string;
  readonly limit?: string;
  readonly sort?: string;
}

export interface TableUrlParamsConfig<TFilters extends object = Record<string, unknown>> {
  /** Default 1-based page index (defaults to 1) */
  readonly defaultPage?: number;
  /** Default items per page limit (defaults to 10) */
  readonly defaultLimit?: number;
  /** Optional allowed page limits (e.g. [10, 25, 50, 100]) */
  readonly allowedLimits?: readonly number[];
  /** Default sort state (e.g. 'createdAt.desc' or { id: 'createdAt', desc: true }) */
  readonly defaultSort?: string | SortState;
  /** Custom URL query parameter keys (defaults to q, page, limit, sort) */
  readonly paramNames?: TableParamNames;
  /** Parsers converting raw URL string values to typed filter values */
  readonly filterParsers?: FilterParserMap<TFilters>;
  /** Serializers converting typed filter values to URL strings */
  readonly filterSerializers?: FilterSerializerMap<TFilters>;
  /** Search debouncing delay in milliseconds (defaults to 300ms) */
  readonly debounceMs?: number;
  /** Navigation method when writing to history (defaults to 'replace') */
  readonly navigationMethod?: 'replace' | 'push';
}

export interface TableUrlState<TFilters extends object = Record<string, unknown>> {
  /** Current free-text search query */
  readonly q: string;
  /** Current 1-based page index */
  readonly page: number;
  /** Current page size limit */
  readonly limit: number;
  /** Serialized sort parameter string (e.g. 'name.asc') */
  readonly sort?: string;
  /** Parsed sort state for table header bindings */
  readonly sortState?: SortState;
  /** Strongly-typed active filter facets */
  readonly filters: TFilters;
  /** Whether any search query or domain filters are actively applied */
  readonly isFiltered: boolean;
}

export interface TableUrlActions<TFilters extends object = Record<string, unknown>> {
  /** Update search query (debounced by default, resets page to 1) */
  readonly setQ: (query: string, options?: { immediate?: boolean }) => void;
  /** Set 1-based page index */
  readonly setPage: (page: number) => void;
  /** Set page size limit (resets page to 1) */
  readonly setLimit: (limit: number) => void;
  /** Set sort state (e.g. 'email.asc', { id: 'email', desc: false }, or undefined to clear) */
  readonly setSort: (sort: string | SortState | undefined) => void;
  /** Toggle sort state for a column: none -> asc -> desc -> none */
  readonly toggleSort: (columnId: string) => void;
  /** Set a single filter facet (resets page to 1) */
  readonly setFilter: <K extends keyof TFilters>(key: K, value: TFilters[K] | undefined) => void;
  /** Set multiple filter facets simultaneously (resets page to 1) */
  readonly setFilters: (filters: Partial<TFilters>) => void;
  /** Clear a single filter facet (resets page to 1) */
  readonly clearFilter: (key: keyof TFilters) => void;
  /** Reset all search queries and filter facets (resets page to 1) */
  readonly resetFilters: (options?: { preserveSort?: boolean; preserveLimit?: boolean }) => void;
  /** Reset entire table state back to initial configuration defaults */
  readonly resetAll: () => void;
}

export interface UseTableUrlStateReturn<TFilters extends object = Record<string, unknown>> {
  readonly state: TableUrlState<TFilters>;
  readonly actions: TableUrlActions<TFilters>;
}
