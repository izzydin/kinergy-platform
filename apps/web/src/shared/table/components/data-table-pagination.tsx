import { Button } from '@kinergy-platform/ui';
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react';
import React from 'react';
import { cn } from '../../lib/utils';
import type { DataTablePaginationProps } from '../types/data-table.types';

/**
 * DataTablePagination Component
 *
 * Renders accessible pagination controls for server-side paginated data tables.
 * Provides accessible boundary navigation, page size selector, and result range metrics.
 */
export function DataTablePagination({
  page,
  pageSize,
  totalCount,
  onPageChange,
  onPageSizeChange,
  pageSizeOptions = [10, 25, 50, 100],
  selectedCount,
  className,
}: DataTablePaginationProps): React.ReactElement {
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  const currentPage = Math.min(Math.max(1, page), totalPages);

  const startRecord = totalCount === 0 ? 0 : (currentPage - 1) * pageSize + 1;
  const endRecord = Math.min(currentPage * pageSize, totalCount);

  const canGoPrevious = currentPage > 1;
  const canGoNext = currentPage < totalPages;

  return (
    <div
      className={cn(
        'flex flex-col sm:flex-row items-center justify-between gap-4 px-2 py-3 text-sm text-muted-foreground',
        className,
      )}
      aria-label="Table pagination"
    >
      {/* Selected row count or Result Range Summary */}
      <div className="flex items-center text-xs">
        {typeof selectedCount === 'number' && selectedCount > 0 ? (
          <span>
            {selectedCount} of {totalCount} row(s) selected.
          </span>
        ) : (
          <span>
            Showing <strong className="font-semibold text-foreground">{startRecord}</strong> to{' '}
            <strong className="font-semibold text-foreground">{endRecord}</strong> of{' '}
            <strong className="font-semibold text-foreground">{totalCount}</strong> results
          </span>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-4 sm:gap-6">
        {/* Page Size Selector */}
        {onPageSizeChange && (
          <div className="flex items-center space-x-2">
            <label htmlFor="data-table-page-size" className="text-xs font-medium">
              Rows per page
            </label>
            <select
              id="data-table-page-size"
              value={pageSize}
              onChange={(e) => onPageSizeChange(Number(e.target.value))}
              aria-label="Select number of rows per page"
              className="h-8 w-18 rounded-md border border-input bg-card px-2 py-1 text-xs font-medium text-foreground shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {pageSizeOptions.map((size) => (
                <option key={size} value={size}>
                  {size}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Page X of Y Metric */}
        <div className="text-xs font-medium text-foreground">
          Page {currentPage} of {totalPages}
        </div>

        {/* Pagination Buttons */}
        <div className="flex items-center space-x-1">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => onPageChange(1)}
            disabled={!canGoPrevious}
            aria-label="Go to first page"
            className="h-8 w-8 p-0"
          >
            <ChevronsLeft className="h-4 w-4" aria-hidden="true" />
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => onPageChange(currentPage - 1)}
            disabled={!canGoPrevious}
            aria-label="Go to previous page"
            className="h-8 w-8 p-0"
          >
            <ChevronLeft className="h-4 w-4" aria-hidden="true" />
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => onPageChange(currentPage + 1)}
            disabled={!canGoNext}
            aria-label="Go to next page"
            className="h-8 w-8 p-0"
          >
            <ChevronRight className="h-4 w-4" aria-hidden="true" />
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => onPageChange(totalPages)}
            disabled={!canGoNext}
            aria-label="Go to last page"
            className="h-8 w-8 p-0"
          >
            <ChevronsRight className="h-4 w-4" aria-hidden="true" />
          </Button>
        </div>
      </div>
    </div>
  );
}
