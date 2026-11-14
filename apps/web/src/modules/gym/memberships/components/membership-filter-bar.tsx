import { Button, Input } from '@kinergy-platform/ui';
import { Loader2, Plus, RotateCcw, Search, X } from 'lucide-react';
import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from '../../../../app/providers/locale-provider';
import { usePlans } from '../../plans/hooks/use-plans';

export interface MembershipFilterBarProps {
  readonly search: string;
  readonly status?: string;
  readonly planId?: string;
  readonly isFiltered: boolean;
  readonly isSearching?: boolean;
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
  isSearching = false,
  onSearchChange,
  onStatusChange,
  onPlanChange,
  onResetFilters,
  onCreateClick,
  canCreate = true,
}) => {
  const { t } = useTranslation();
  const { data: plansData } = usePlans({ limit: 50 });
  const plans = plansData?.items ?? [];

  // Local synchronous input state to prevent character loss or input lag during typing
  const [searchInput, setSearchInput] = useState(search);
  const prevSearchProp = useRef(search);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Synchronize internal state when external search prop changes (e.g. Reset Filters or URL navigation)
  useEffect(() => {
    if (search !== prevSearchProp.current) {
      prevSearchProp.current = search;
      setSearchInput(search);
    }
  }, [search]);

  // Clean up debounce timer on unmount
  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, []);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const nextValue = e.target.value;
    setSearchInput(nextValue);

    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }

    if (nextValue === '') {
      // Immediate cancellation and reset when cleared
      prevSearchProp.current = '';
      onSearchChange('');
      return;
    }

    debounceTimerRef.current = setTimeout(() => {
      const trimmed = nextValue.trim();
      prevSearchProp.current = trimmed;
      onSearchChange(trimmed);
    }, 300);
  };

  const handleClear = () => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }
    setSearchInput('');
    prevSearchProp.current = '';
    onSearchChange('');
    inputRef.current?.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
        debounceTimerRef.current = null;
      }
      const trimmed = searchInput.trim();
      prevSearchProp.current = trimmed;
      onSearchChange(trimmed);
    } else if (e.key === 'Escape') {
      handleClear();
    }
  };

  return (
    <div
      className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3"
      data-testid="membership-filter-bar"
    >
      <div className="flex flex-1 flex-wrap items-center gap-2">
        {/* Search by Client Name or ID */}
        <div className="relative min-w-[220px] max-w-sm flex-1">
          <label htmlFor="membership-search-input" className="sr-only">
            {t('gym.searchClients', 'Search clients')}
          </label>
          <div className="pointer-events-none absolute left-2.5 top-2.5 flex items-center justify-center">
            {isSearching ? (
              <Loader2
                className="h-4 w-4 animate-spin text-primary"
                data-testid="membership-search-loading"
              />
            ) : (
              <Search className="h-4 w-4 text-muted-foreground" />
            )}
          </div>
          <Input
            ref={inputRef}
            id="membership-search-input"
            type="text"
            placeholder={t('gym.searchClientsPlaceholder', 'Search by client name or ID...')}
            aria-label={t('gym.searchClients', 'Search clients')}
            value={searchInput}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            className="pl-8 pr-8 text-sm"
            data-testid="membership-search-input"
            autoComplete="off"
            spellCheck="false"
          />
          {searchInput && (
            <button
              type="button"
              onClick={handleClear}
              aria-label="Clear search"
              className="absolute right-2.5 top-2.5 text-muted-foreground hover:text-foreground focus:outline-none"
              data-testid="membership-search-clear-button"
            >
              <X className="h-4 w-4" />
            </button>
          )}
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
