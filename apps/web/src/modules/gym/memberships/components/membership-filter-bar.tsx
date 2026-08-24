import { Button, Input } from '@kinergy-platform/ui';
import { Plus, RotateCcw, Search } from 'lucide-react';
import React from 'react';
import { usePlans } from '../../plans/hooks/use-plans';

export interface MembershipFilterBarProps {
  readonly search: string;
  readonly status?: string;
  readonly planId?: string;
  readonly isFiltered: boolean;
  readonly onSearchChange: (query: string) => void;
  readonly onStatusChange: (status?: string) => void;
  readonly onPlanChange: (planId?: string) => void;
  readonly onResetFilters: () => void;
  readonly onCreateClick?: () => void;
  readonly canCreate?: boolean;
}

export const MembershipFilterBar: React.FC<MembershipFilterBarProps> = ({
  search,
  status,
  planId,
  isFiltered,
  onSearchChange,
  onStatusChange,
  onPlanChange,
  onResetFilters,
  onCreateClick,
  canCreate = true,
}) => {
  const { data: plansData } = usePlans({ limit: 50 });
  const plans = plansData?.items ?? [];

  return (
    <div
      className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3"
      data-testid="membership-filter-bar"
    >
      <div className="flex flex-1 flex-wrap items-center gap-2">
        {/* Search by Client ID */}
        <div className="relative min-w-[200px] max-w-xs flex-1">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            type="text"
            placeholder="Search by Client ID..."
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            className="pl-8 text-sm"
            data-testid="membership-search-input"
          />
        </div>

        {/* Status Filter */}
        <select
          value={status ?? ''}
          onChange={(e) => onStatusChange(e.target.value || undefined)}
          className="h-9 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          data-testid="membership-status-filter"
          aria-label="Filter by membership status"
        >
          <option value="">All Statuses</option>
          <option value="ACTIVE">Active</option>
          <option value="FROZEN">Frozen / Suspended</option>
          <option value="EXPIRED">Expired</option>
          <option value="CANCELLED">Cancelled</option>
        </select>

        {/* Plan Filter */}
        <select
          value={planId ?? ''}
          onChange={(e) => onPlanChange(e.target.value || undefined)}
          className="h-9 max-w-[180px] rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          data-testid="membership-plan-filter"
          aria-label="Filter by membership plan"
        >
          <option value="">All Plans</option>
          {plans.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>

        {/* Reset Filter Button */}
        {isFiltered && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onResetFilters}
            className="h-9 px-2 text-xs text-muted-foreground hover:text-foreground"
            data-testid="membership-reset-filters-button"
          >
            <RotateCcw className="mr-1 h-3.5 w-3.5" />
            Reset
          </Button>
        )}
      </div>

      {/* New Membership Action */}
      {onCreateClick && canCreate && (
        <Button
          type="button"
          onClick={onCreateClick}
          className="h-9 gap-1 text-sm font-medium"
          data-testid="create-membership-button"
        >
          <Plus className="h-4 w-4" />
          <span>New Agreement</span>
        </Button>
      )}
    </div>
  );
};

MembershipFilterBar.displayName = 'MembershipFilterBar';
