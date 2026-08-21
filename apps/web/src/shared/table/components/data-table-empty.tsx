import { Button } from '@kinergy-platform/ui';
import { Inbox, SearchX } from 'lucide-react';
import React from 'react';
import { cn } from '../../lib/utils';
import type { DataTableEmptyProps } from '../types/data-table.types';

/**
 * DataTableEmpty Component
 *
 * Renders an accessible empty state view inside or beneath a table.
 * Accurately distinguishes between an empty database and no results matching active filters.
 */
export function DataTableEmpty({
  isFiltered = false,
  title,
  description,
  onResetFilters,
  action,
  className,
}: DataTableEmptyProps): React.ReactElement {
  const defaultTitle = isFiltered ? 'No matching records found' : 'No records available';
  const defaultDescription = isFiltered
    ? 'Try adjusting your search terms or clearing active filters to view available records.'
    : 'There are currently no items registered in this section.';

  const resolvedTitle = title ?? defaultTitle;
  const resolvedDescription = description ?? defaultDescription;

  const IconComponent = isFiltered ? SearchX : Inbox;

  return (
    <div
      className={cn(
        'flex min-h-[280px] w-full flex-col items-center justify-center rounded-lg border border-dashed border-border bg-card/50 p-8 text-center',
        className,
      )}
      role="status"
    >
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
        <IconComponent className="h-6 w-6" aria-hidden="true" />
      </div>
      <h3 className="mt-4 text-base font-semibold text-foreground">{resolvedTitle}</h3>
      <p className="mt-1 max-w-sm text-sm text-muted-foreground">{resolvedDescription}</p>

      <div className="mt-6 flex items-center gap-3">
        {action}
        {isFiltered && onResetFilters && (
          <Button type="button" variant="outline" size="sm" onClick={onResetFilters}>
            Reset Filters
          </Button>
        )}
      </div>
    </div>
  );
}
