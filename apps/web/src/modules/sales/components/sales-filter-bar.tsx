import React from 'react';
import { Button, Input } from '@kinergy-platform/ui';
import { RefreshCw, RotateCcw, Calendar, User } from 'lucide-react';
import {
  DataTableSearch,
  DataTableFacetedFilter,
  type DataTableFilterOption,
} from '../../../shared/table';
import { VALID_SALE_STATUSES, type SaleStatus } from '../types/sales-query.types';
import { VALID_SALE_SOURCE_TYPES, type SaleSourceType } from '../types/sales.types';

export interface SalesFilterBarProps {
  search: string;
  status?: SaleStatus;
  sourceType?: string;
  clientId?: string;
  fromDate?: string;
  toDate?: string;
  isFiltered: boolean;
  onSearchChange: (search: string) => void;
  onStatusChange: (status?: SaleStatus) => void;
  onSourceTypeChange: (sourceType?: string) => void;
  onClientIdChange: (clientId?: string) => void;
  onDateRangeChange: (fromDate?: string, toDate?: string) => void;
  onResetFilters: () => void;
  onRefresh?: () => void;
  isRefreshing?: boolean;
}

const STATUS_OPTIONS: DataTableFilterOption[] = VALID_SALE_STATUSES.map((status) => ({
  value: status,
  label: status.replace(/_/g, ' '),
}));

const SOURCE_TYPE_OPTIONS: DataTableFilterOption[] = VALID_SALE_SOURCE_TYPES.map((source) => ({
  value: source,
  label: source.replace(/_/g, ' '),
}));

export const SalesFilterBar: React.FC<SalesFilterBarProps> = ({
  search,
  status,
  sourceType,
  clientId,
  fromDate,
  toDate,
  isFiltered,
  onSearchChange,
  onStatusChange,
  onSourceTypeChange,
  onClientIdChange,
  onDateRangeChange,
  onResetFilters,
  onRefresh,
  isRefreshing = false,
}) => {
  const [showAdvancedFilters, setShowAdvancedFilters] = React.useState(
    Boolean(clientId || fromDate || toDate),
  );

  return (
    <div className="space-y-2.5" data-testid="sales-filter-bar">
      <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-1 flex-wrap items-center gap-2">
          {/* Search Input */}
          <DataTableSearch
            placeholder="Search sale ID, source code..."
            value={search}
            onChange={onSearchChange}
            className="w-full sm:w-64"
          />

          {/* Status Faceted Filter */}
          <DataTableFacetedFilter
            title="Status"
            options={STATUS_OPTIONS}
            selectedValues={status ? [status] : []}
            onSelect={(values) => onStatusChange(values?.[0] as SaleStatus | undefined)}
          />

          {/* Source Type Faceted Filter */}
          <DataTableFacetedFilter
            title="Source"
            options={SOURCE_TYPE_OPTIONS}
            selectedValues={sourceType ? [sourceType] : []}
            onSelect={(values) => onSourceTypeChange(values?.[0] as SaleSourceType | undefined)}
          />

          {/* Toggle Advanced Filters (Client & Date Range) */}
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setShowAdvancedFilters(!showAdvancedFilters)}
            className={`h-8 text-xs font-medium gap-1.5 ${
              clientId || fromDate || toDate ? 'border-primary bg-primary/5 text-primary' : ''
            }`}
            data-testid="toggle-advanced-filters-btn"
          >
            <Calendar className="h-3.5 w-3.5" />
            <span>Dates & Client</span>
            {(clientId || fromDate || toDate) && (
              <span className="flex h-1.5 w-1.5 rounded-full bg-primary" />
            )}
          </Button>

          {/* Reset Active Filters */}
          {isFiltered && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={onResetFilters}
              className="h-8 px-2.5 text-xs text-muted-foreground hover:text-foreground"
              data-testid="sales-reset-filters-btn"
            >
              <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
              Reset Filters
            </Button>
          )}
        </div>

        {/* Toolbar Refresh Button */}
        {onRefresh && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onRefresh}
            disabled={isRefreshing}
            className="h-8 px-2.5 text-xs gap-1.5 self-end sm:self-auto"
            data-testid="sales-toolbar-refresh-btn"
            aria-label="Refresh sales records"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </Button>
        )}
      </div>

      {/* Advanced Filter Drawer / Row (Client ID & Date Range) */}
      {showAdvancedFilters && (
        <div
          className="flex flex-wrap items-center gap-3 p-3 rounded-lg border border-border bg-muted/20 text-xs"
          data-testid="sales-advanced-filters-row"
        >
          {/* Client ID Filter */}
          <div className="flex items-center gap-1.5">
            <User className="h-3.5 w-3.5 text-muted-foreground" />
            <label htmlFor="sales-client-id-input" className="font-medium text-muted-foreground">
              Client ID:
            </label>
            <Input
              type="text"
              id="sales-client-id-input"
              aria-label="Filter by client identifier"
              placeholder="e.g. client_123"
              value={clientId || ''}
              onChange={(e) => onClientIdChange(e.target.value || undefined)}
              className="h-7 w-36 text-xs px-2"
              data-testid="sales-client-id-input"
            />
          </div>

          <div className="h-4 w-px bg-border hidden sm:block" />

          {/* From Date Filter */}
          <div className="flex items-center gap-1.5">
            <label htmlFor="sales-from-date-input" className="font-medium text-muted-foreground">
              From:
            </label>
            <Input
              type="date"
              id="sales-from-date-input"
              aria-label="Filter from date"
              value={fromDate ? fromDate.slice(0, 10) : ''}
              onChange={(e) => {
                const val = e.target.value ? new Date(e.target.value).toISOString() : undefined;
                onDateRangeChange(val, toDate);
              }}
              className="h-7 w-36 text-xs px-2"
              data-testid="sales-from-date-input"
            />
          </div>

          {/* To Date Filter */}
          <div className="flex items-center gap-1.5">
            <label htmlFor="sales-to-date-input" className="font-medium text-muted-foreground">
              To:
            </label>
            <Input
              type="date"
              id="sales-to-date-input"
              aria-label="Filter to date"
              value={toDate ? toDate.slice(0, 10) : ''}
              onChange={(e) => {
                const val = e.target.value
                  ? new Date(`${e.target.value}T23:59:59.999Z`).toISOString()
                  : undefined;
                onDateRangeChange(fromDate, val);
              }}
              className="h-7 w-36 text-xs px-2"
              data-testid="sales-to-date-input"
            />
          </div>

          {(clientId || fromDate || toDate) && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                onClientIdChange(undefined);
                onDateRangeChange(undefined, undefined);
              }}
              className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground"
            >
              Clear Dates & Client
            </Button>
          )}
        </div>
      )}
    </div>
  );
};
