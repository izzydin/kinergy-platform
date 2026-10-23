import React from 'react';
import { Button } from '@kinergy-platform/ui';
import { PlusCircle, RefreshCw } from 'lucide-react';
import { DataTableSearch, DataTableFacetedFilter, DataTableToolbar } from '../../../shared/table';
import { HasPermission } from '../../../app/routes/permission-guard';
import type { ClientStatus } from '../types/client.types';

export interface ClientTableToolbarProps {
  search: string;
  status?: ClientStatus;
  isFiltered: boolean;
  onSearchChange: (query: string) => void;
  onStatusChange: (status?: ClientStatus) => void;
  onResetFilters: () => void;
  onRefresh?: () => void;
  isRefreshing?: boolean;
  onCreateClick?: () => void;
}

const STATUS_OPTIONS: { label: string; value: ClientStatus }[] = [
  { label: 'Active', value: 'ACTIVE' },
  { label: 'Archived', value: 'ARCHIVED' },
];

export const ClientTableToolbar: React.FC<ClientTableToolbarProps> = ({
  search,
  status,
  isFiltered,
  onSearchChange,
  onStatusChange,
  onResetFilters,
  onRefresh,
  isRefreshing = false,
  onCreateClick,
}) => {
  return (
    <DataTableToolbar
      isFiltered={isFiltered}
      onResetFilters={onResetFilters}
      search={
        <DataTableSearch
          value={search}
          onChange={onSearchChange}
          placeholder="Search by name, email, phone, reference..."
          ariaLabel="Search client profiles"
        />
      }
      filters={
        <div className="flex items-center gap-2">
          <DataTableFacetedFilter<ClientStatus>
            title="Status"
            options={STATUS_OPTIONS}
            selectedValues={status}
            onSelect={(selected) => {
              if (Array.isArray(selected)) {
                onStatusChange(selected[0]);
              } else {
                onStatusChange(selected);
              }
            }}
            multiSelect={false}
          />
        </div>
      }
      actions={
        <div className="flex items-center gap-2">
          {onRefresh && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onRefresh}
              disabled={isRefreshing}
              aria-label="Refresh client list"
              className="h-8 px-2.5 text-xs text-muted-foreground hover:text-foreground"
            >
              <RefreshCw
                className={`h-3.5 w-3.5 ${isRefreshing ? 'animate-spin' : ''}`}
                aria-hidden="true"
              />
              <span className="sr-only">Refresh</span>
            </Button>
          )}

          <HasPermission name="client:write">
            <Button
              type="button"
              variant="default"
              size="sm"
              onClick={onCreateClick}
              className="h-8 gap-1.5 text-xs font-medium"
              data-testid="create-client-button"
            >
              <PlusCircle className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Create Client</span>
            </Button>
          </HasPermission>
        </div>
      }
    />
  );
};
