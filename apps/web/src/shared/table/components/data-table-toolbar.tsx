import { Button } from '@kinergy-platform/ui';
import { X } from 'lucide-react';
import React from 'react';
import { cn } from '../../lib/utils';
import type { DataTableToolbarProps } from '../types/data-table-toolbar.types';

/**
 * DataTableToolbar Component
 *
 * Implements the standard list interaction toolbar above the data table.
 * Composes search, filters, reset actions, column visibility, and custom action buttons.
 */
export function DataTableToolbar({
  search,
  filters,
  isFiltered = false,
  onResetFilters,
  viewOptions,
  actions,
  className,
}: DataTableToolbarProps): React.ReactElement {
  return (
    <div
      className={cn(
        'flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2.5 py-1',
        className,
      )}
    >
      {/* Left section: Search + Facet Filters + Clear button */}
      <div className="flex flex-1 flex-wrap items-center gap-2">
        {search}
        {filters}
        {isFiltered && onResetFilters && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onResetFilters}
            className="h-8 px-2 text-xs text-muted-foreground hover:text-foreground lg:px-3"
          >
            Reset
            <X className="ml-1.5 h-3.5 w-3.5" aria-hidden="true" />
          </Button>
        )}
      </div>

      {/* Right section: View Options + Custom Action buttons */}
      <div className="flex items-center gap-2">
        {viewOptions}
        {actions}
      </div>
    </div>
  );
}
