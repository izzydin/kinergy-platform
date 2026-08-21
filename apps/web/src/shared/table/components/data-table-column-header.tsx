import { Button } from '@kinergy-platform/ui';
import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react';
import React from 'react';
import { cn } from '../../lib/utils';
import type { DataTableColumnHeaderProps } from '../types/data-table.types';

/**
 * DataTableColumnHeader Component
 *
 * Renders an accessible column header cell with integrated sort triggers and direction icons.
 * Adheres to WAI-ARIA sortable table column semantics.
 */
export function DataTableColumnHeader<TData, TValue>({
  column,
  title,
  className,
}: DataTableColumnHeaderProps<TData, TValue>): React.ReactElement {
  if (!column.getCanSort()) {
    return (
      <div className={cn('text-xs font-semibold uppercase tracking-wider', className)}>{title}</div>
    );
  }

  const isSorted = column.getIsSorted();

  const sortIcon =
    isSorted === 'desc' ? (
      <ArrowDown className="ml-1.5 h-3.5 w-3.5" aria-hidden="true" />
    ) : isSorted === 'asc' ? (
      <ArrowUp className="ml-1.5 h-3.5 w-3.5" aria-hidden="true" />
    ) : (
      <ArrowUpDown className="ml-1.5 h-3.5 w-3.5 opacity-50" aria-hidden="true" />
    );

  const ariaSort = isSorted === 'asc' ? 'ascending' : isSorted === 'desc' ? 'descending' : 'none';

  return (
    <div className={cn('flex items-center space-x-2', className)}>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
        aria-sort={ariaSort}
        aria-label={`Sort by ${title}, currently ${isSorted ? ariaSort : 'unsorted'}`}
        className="-ml-3 h-8 text-xs font-semibold uppercase tracking-wider text-muted-foreground hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
      >
        <span>{title}</span>
        {sortIcon}
      </Button>
    </div>
  );
}
