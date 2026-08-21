import type {
  Column,
  ColumnDef,
  OnChangeFn,
  RowSelectionState,
  SortingState,
  Table,
  VisibilityState,
} from '@tanstack/react-table';
import type React from 'react';

/**
 * DataTable Core Presentation Types
 *
 * Enforces Track C — Step C2.0 / C2.2 DataTable Architecture:
 * Strict separation of presentation from data fetching and domain business logic.
 */

export interface DataTableProps<TData, TValue = unknown> {
  /** Column definitions conforming to TanStack Table ColumnDef */
  readonly columns: ColumnDef<TData, TValue>[];
  /** Populated data array */
  readonly data: readonly TData[];
  /** Custom row ID extractor (defaults to (row) => row.id if available) */
  readonly getRowId?: (row: TData, index: number) => string;
  /** Total item count across all pages (for server-side pagination) */
  readonly totalCount?: number;
  /** Current 1-based page index */
  readonly page?: number;
  /** Current page size limit */
  readonly pageSize?: number;
  /** Page change callback */
  readonly onPageChange?: (page: number) => void;
  /** Page size change callback */
  readonly onPageSizeChange?: (pageSize: number) => void;
  /** Page size options (default: [10, 25, 50, 100]) */
  readonly pageSizeOptions?: readonly number[];
  /** Controlled sorting state */
  readonly sorting?: SortingState;
  /** Sorting change callback */
  readonly onSortingChange?: OnChangeFn<SortingState>;
  /** Controlled column visibility state */
  readonly columnVisibility?: VisibilityState;
  /** Column visibility change callback */
  readonly onColumnVisibilityChange?: OnChangeFn<VisibilityState>;
  /** Controlled row selection state */
  readonly rowSelection?: RowSelectionState;
  /** Row selection change callback */
  readonly onRowSelectionChange?: OnChangeFn<RowSelectionState>;
  /** Loading state */
  readonly isLoading?: boolean;
  /** Number of skeleton rows to display while loading (default: 5) */
  readonly skeletonRowCount?: number;
  /** Background refetching state */
  readonly isFetching?: boolean;
  /** Error state */
  readonly isError?: boolean;
  /** Error message or node */
  readonly errorMessage?: React.ReactNode;
  /** Retry callback */
  readonly onRetry?: () => void;
  /** Whether filters/search are active (for empty state messaging) */
  readonly isFiltered?: boolean;
  /** Empty state title */
  readonly emptyTitle?: string;
  /** Empty state description */
  readonly emptyDescription?: string;
  /** Reset filters callback */
  readonly onResetFilters?: () => void;
  /** Empty state custom action button */
  readonly emptyAction?: React.ReactNode;
  /** Accessible table label */
  readonly ariaLabel?: string;
  /** Optional toolbar node rendered above table */
  readonly toolbar?: React.ReactNode;
  /** Custom table container className */
  readonly className?: string;
  /** Whether to show the bottom pagination bar (default: true) */
  readonly showPagination?: boolean;
}

export interface DataTableColumnHeaderProps<TData, TValue> {
  readonly column: Column<TData, TValue>;
  readonly title: string;
  readonly className?: string;
}

export interface DataTablePaginationProps {
  /** Current 1-based page index */
  readonly page: number;
  /** Current page size limit */
  readonly pageSize: number;
  /** Total item count across all pages */
  readonly totalCount: number;
  /** Page change callback */
  readonly onPageChange: (page: number) => void;
  /** Page size change callback */
  readonly onPageSizeChange?: (pageSize: number) => void;
  /** Page size options (default: [10, 25, 50, 100]) */
  readonly pageSizeOptions?: readonly number[];
  /** Optional selected row count */
  readonly selectedCount?: number;
  /** Custom className */
  readonly className?: string;
}

export interface DataTableEmptyProps {
  readonly isFiltered?: boolean;
  readonly title?: string;
  readonly description?: string;
  readonly onResetFilters?: () => void;
  readonly action?: React.ReactNode;
  readonly className?: string;
}

export interface DataTableSkeletonProps {
  readonly columnCount?: number;
  readonly rowCount?: number;
  readonly className?: string;
}

export interface DataTableErrorProps {
  readonly errorMessage?: React.ReactNode;
  readonly onRetry?: () => void;
  readonly className?: string;
}

export interface DataTableViewOptionsProps<TData> {
  readonly table: Table<TData>;
  readonly className?: string;
}
