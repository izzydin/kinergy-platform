import { Skeleton } from '@kinergy-platform/ui';
import React from 'react';
import { cn } from '../../lib/utils';
import type { DataTableSkeletonProps } from '../types/data-table.types';

/**
 * DataTableSkeleton Component
 *
 * Renders structured table loading skeletons matching headers and rows.
 * Maintains table layout stability during background data fetching.
 */
export function DataTableSkeleton({
  columnCount = 5,
  rowCount = 5,
  className,
}: DataTableSkeletonProps): React.ReactElement {
  const columns = Array.from({ length: columnCount });
  const rows = Array.from({ length: rowCount });

  return (
    <div
      className={cn('w-full overflow-x-auto rounded-lg border border-border bg-card', className)}
      aria-busy="true"
      aria-live="polite"
    >
      <table className="w-full text-left text-sm" aria-label="Loading table data">
        <thead className="border-b border-border bg-muted/50 text-xs uppercase tracking-wider text-muted-foreground">
          <tr>
            {columns.map((_, colIndex) => (
              <th key={`skeleton-header-${colIndex}`} scope="col" className="px-4 py-3.5">
                <Skeleton className="h-4 w-20" />
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {rows.map((_, rowIndex) => (
            <tr key={`skeleton-row-${rowIndex}`}>
              {columns.map((_, colIndex) => (
                <td key={`skeleton-cell-${rowIndex}-${colIndex}`} className="px-4 py-3.5">
                  <Skeleton className="h-5 w-full max-w-[140px]" />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
