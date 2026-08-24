import { Button, Input } from '@kinergy-platform/ui';
import { Plus, RotateCcw, Search } from 'lucide-react';
import React from 'react';

export interface PlanFilterBarProps {
  readonly search: string;
  readonly status?: string;
  readonly activeOnly?: boolean;
  readonly isFiltered: boolean;
  readonly onSearchChange: (query: string) => void;
  readonly onStatusChange: (status?: string) => void;
  readonly onActiveOnlyChange?: (activeOnly?: boolean) => void;
  readonly onResetFilters: () => void;
  readonly onCreateClick?: () => void;
  readonly canCreate?: boolean;
}

export const PlanFilterBar: React.FC<PlanFilterBarProps> = ({
  search,
  status,
  activeOnly,
  isFiltered,
  onSearchChange,
  onStatusChange,
  onActiveOnlyChange,
  onResetFilters,
  onCreateClick,
  canCreate = true,
}) => {
  return (
    <div
      className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3"
      data-testid="plan-filter-bar"
    >
      <div className="flex flex-1 flex-wrap items-center gap-2">
        {/* Search Input */}
        <div className="relative min-w-[200px] max-w-sm flex-1">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            type="text"
            placeholder="Search plans by code or name..."
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            className="pl-8 text-sm"
            data-testid="plan-search-input"
          />
        </div>

        {/* Status Select */}
        <select
          value={status ?? ''}
          onChange={(e) => onStatusChange(e.target.value || undefined)}
          className="h-9 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          data-testid="plan-status-filter"
          aria-label="Filter by plan status"
        >
          <option value="">All Statuses</option>
          <option value="DRAFT">Draft</option>
          <option value="ACTIVE">Active</option>
          <option value="ARCHIVED">Archived</option>
        </select>

        {/* Active Only Filter Option */}
        {onActiveOnlyChange && (
          <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer select-none">
            <input
              type="checkbox"
              checked={Boolean(activeOnly)}
              onChange={(e) => onActiveOnlyChange(e.target.checked || undefined)}
              className="rounded border-input text-primary focus:ring-ring"
              data-testid="plan-active-only-toggle"
            />
            <span>Active only</span>
          </label>
        )}

        {/* Reset Filter Button */}
        {isFiltered && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onResetFilters}
            className="h-9 px-2 text-xs text-muted-foreground hover:text-foreground"
            data-testid="plan-reset-filters-button"
          >
            <RotateCcw className="mr-1 h-3.5 w-3.5" />
            Reset
          </Button>
        )}
      </div>

      {/* New Plan Action */}
      {onCreateClick && canCreate && (
        <Button
          type="button"
          onClick={onCreateClick}
          className="h-9 gap-1 text-sm font-medium"
          data-testid="create-plan-button"
        >
          <Plus className="h-4 w-4" />
          <span>New Plan</span>
        </Button>
      )}
    </div>
  );
};

PlanFilterBar.displayName = 'PlanFilterBar';
