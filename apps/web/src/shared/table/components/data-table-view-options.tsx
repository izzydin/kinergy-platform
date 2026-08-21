import { Button } from '@kinergy-platform/ui';
import { SlidersHorizontal } from 'lucide-react';
import React, { useState } from 'react';
import { cn } from '../../lib/utils';
import type { DataTableViewOptionsProps } from '../types/data-table.types';

/**
 * DataTableViewOptions Component
 *
 * Renders an accessible column visibility manager allowing users to toggle visible table columns.
 * Excludes non-hideable / mandatory columns (e.g. `enableHiding: false` or action columns).
 */
export function DataTableViewOptions<TData>({
  table,
  className,
}: DataTableViewOptionsProps<TData>): React.ReactElement | null {
  const [isOpen, setIsOpen] = useState(false);

  const hideableColumns = table
    .getAllColumns()
    .filter((column) => typeof column.accessorFn !== 'undefined' && column.getCanHide());

  if (hideableColumns.length === 0) {
    return null;
  }

  const formatColumnTitle = (columnId: string, headerDef: unknown): string => {
    if (typeof headerDef === 'string' && headerDef.trim().length > 0) {
      return headerDef;
    }
    // Convert camelCase or snake_case to readable words
    return columnId
      .replace(/([A-Z])/g, ' $1')
      .replace(/_/g, ' ')
      .trim();
  };

  return (
    <div className={cn('relative inline-block text-left', className)}>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => setIsOpen(!isOpen)}
        aria-expanded={isOpen}
        aria-haspopup="true"
        aria-label="Toggle visible columns"
        className="h-8 gap-1.5 text-xs font-medium"
      >
        <SlidersHorizontal className="h-3.5 w-3.5" aria-hidden="true" />
        <span>View</span>
      </Button>

      {isOpen && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setIsOpen(false)} aria-hidden="true" />
          <div
            role="menu"
            aria-label="Toggle column visibility"
            className="absolute right-0 z-50 mt-2 w-48 rounded-md border border-border bg-card p-2 shadow-lg ring-1 ring-black/5 focus:outline-none"
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                e.preventDefault();
                setIsOpen(false);
              }
            }}
          >
            <div className="px-2 py-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Toggle columns
            </div>
            <div className="mt-1 space-y-0.5">
              {hideableColumns.map((column) => {
                const title = formatColumnTitle(column.id, column.columnDef.header);
                return (
                  <label
                    key={column.id}
                    className="flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-xs font-medium capitalize text-foreground hover:bg-muted"
                  >
                    <input
                      type="checkbox"
                      checked={column.getIsVisible()}
                      onChange={(event) => column.toggleVisibility(event.target.checked)}
                      className="h-3.5 w-3.5 rounded-xs border-input text-primary focus:ring-primary"
                    />
                    <span>{title}</span>
                  </label>
                );
              })}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
