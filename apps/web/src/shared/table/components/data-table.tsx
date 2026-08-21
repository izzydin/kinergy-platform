import {
  flexRender,
  getCoreRowModel,
  useReactTable,
  type VisibilityState,
} from '@tanstack/react-table';
import React, { useState } from 'react';
import { cn } from '../../lib/utils';
import type { DataTableProps } from '../types/data-table.types';
import { DataTableEmpty } from './data-table-empty';
import { DataTableError } from './data-table-error';
import { DataTablePagination } from './data-table-pagination';
import { DataTableSkeleton } from './data-table-skeleton';

/**
 * DataTable Core Component
 *
 * Implements Track C — Step C2.2 Core DataTable Presentation Framework.
 * A domain-agnostic, accessible, and high-performance data table powered by TanStack Table.
 *
 * Separation of Concerns:
 * - Does NOT own TanStack Query, network fetching, or domain business logic.
 * - Presentation-only engine managing table state, accessible HTML table semantics,
 *   4-state UI rendering (loading, error, empty, populated), and pagination controls.
 */
export function DataTable<TData, TValue = unknown>({
  columns,
  data,
  getRowId,
  totalCount,
  page,
  pageSize,
  onPageChange,
  onPageSizeChange,
  pageSizeOptions = [10, 25, 50, 100],
  sorting,
  onSortingChange,
  columnVisibility: controlledVisibility,
  onColumnVisibilityChange: controlledOnVisibilityChange,
  rowSelection,
  onRowSelectionChange,
  isLoading = false,
  skeletonRowCount = 5,
  isFetching = false,
  isError = false,
  errorMessage,
  onRetry,
  isFiltered = false,
  emptyTitle,
  emptyDescription,
  onResetFilters,
  emptyAction,
  ariaLabel = 'Data table',
  toolbar,
  className,
  showPagination = true,
}: DataTableProps<TData, TValue>): React.ReactElement {
  // Local fallback for column visibility if not controlled by parent
  const [internalVisibility, setInternalVisibility] = useState<VisibilityState>({});

  const columnVisibility = controlledVisibility ?? internalVisibility;
  const onColumnVisibilityChange = controlledOnVisibilityChange ?? setInternalVisibility;

  // Resolve stable row ID
  const resolveRowId =
    getRowId ??
    ((row: TData, index: number) => {
      if (
        row &&
        typeof row === 'object' &&
        'id' in row &&
        typeof (row as { id: unknown }).id === 'string'
      ) {
        return (row as { id: string }).id;
      }
      return String(index);
    });

  // Initialize TanStack Table instance
  const table = useReactTable({
    data: data as TData[],
    columns,
    state: {
      sorting,
      columnVisibility,
      rowSelection: rowSelection ?? {},
    },
    onSortingChange,
    onColumnVisibilityChange,
    onRowSelectionChange,
    getCoreRowModel: getCoreRowModel(),
    getRowId: resolveRowId,
    manualSorting: true,
    manualPagination: true,
  });

  // 1. Error State
  if (isError) {
    return (
      <div className="w-full space-y-3">
        {toolbar && <div className="flex items-center justify-between gap-4">{toolbar}</div>}
        <DataTableError errorMessage={errorMessage} onRetry={onRetry} />
      </div>
    );
  }

  // 2. Loading State (Full Skeleton)
  if (isLoading) {
    return (
      <div className="w-full space-y-3">
        {toolbar && <div className="flex items-center justify-between gap-4">{toolbar}</div>}
        <DataTableSkeleton columnCount={columns.length} rowCount={skeletonRowCount} />
      </div>
    );
  }

  const rows = table.getRowModel().rows;
  const isEmpty = rows.length === 0;

  // 3. Empty State (when populated rows is 0)
  if (isEmpty) {
    return (
      <div className="w-full space-y-3">
        {toolbar && <div className="flex items-center justify-between gap-4">{toolbar}</div>}
        <DataTableEmpty
          isFiltered={isFiltered}
          title={emptyTitle}
          description={emptyDescription}
          onResetFilters={onResetFilters}
          action={emptyAction}
        />
      </div>
    );
  }

  // 4. Populated Table State
  return (
    <div className="w-full space-y-3">
      {/* Optional Toolbar Header */}
      {toolbar && <div className="flex items-center justify-between gap-4">{toolbar}</div>}

      {/* Table Container with Horizontal Scroll Barrier */}
      <div
        className={cn(
          'relative w-full overflow-x-auto rounded-lg border border-border bg-card shadow-xs transition-opacity duration-150',
          isFetching && 'opacity-70',
          className,
        )}
      >
        <table className="w-full text-left text-sm" aria-label={ariaLabel}>
          <thead className="border-b border-border bg-muted/50 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {table.getHeaderGroups().map((headerGroup) => (
              <tr key={headerGroup.id}>
                {headerGroup.headers.map((header) => {
                  return (
                    <th
                      key={header.id}
                      scope="col"
                      colSpan={header.colSpan}
                      className="px-4 py-3.5"
                    >
                      {header.isPlaceholder
                        ? null
                        : flexRender(header.column.columnDef.header, header.getContext())}
                    </th>
                  );
                })}
              </tr>
            ))}
          </thead>
          <tbody className="divide-y divide-border font-medium">
            {rows.map((row) => (
              <tr
                key={row.id}
                data-state={row.getIsSelected() ? 'selected' : undefined}
                className={cn(
                  'transition-colors hover:bg-muted/40 focus-within:bg-muted/40',
                  row.getIsSelected() && 'bg-muted/60',
                )}
              >
                {row.getVisibleCells().map((cell, cellIndex) => (
                  <td key={cell.id} className={cn('px-4 py-3.5', cellIndex === 0 && 'font-normal')}>
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Accessible Server-Side Pagination Bar */}
      {showPagination &&
        typeof totalCount === 'number' &&
        typeof page === 'number' &&
        typeof pageSize === 'number' &&
        onPageChange && (
          <DataTablePagination
            page={page}
            pageSize={pageSize}
            totalCount={totalCount}
            onPageChange={onPageChange}
            onPageSizeChange={onPageSizeChange}
            pageSizeOptions={pageSizeOptions}
            selectedCount={
              rowSelection
                ? Object.keys(rowSelection).filter((k) => rowSelection[k]).length
                : undefined
            }
          />
        )}
    </div>
  );
}
