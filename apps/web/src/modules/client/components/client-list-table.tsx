import React, { useMemo } from 'react';
import { Link, useLocation } from 'react-router-dom';
import type { ColumnDef, OnChangeFn, SortingState } from '@tanstack/react-table';
import { Button } from '@kinergy-platform/ui';
import { Eye, PlusCircle } from 'lucide-react';
import { DataTable, DataTableColumnHeader } from '../../../shared/table';
import { ClientStatusBadge } from './client-status-badge';
import { HasPermission } from '../../../app/routes/permission-guard';
import type { ClientModel } from '../types/client.types';

export interface ClientListTableProps {
  clients: readonly ClientModel[];
  totalCount?: number;
  page?: number;
  pageSize?: number;
  onPageChange?: (page: number) => void;
  onPageSizeChange?: (pageSize: number) => void;
  sorting?: SortingState;
  onSortingChange?: OnChangeFn<SortingState>;
  isLoading?: boolean;
  isFetching?: boolean;
  isError?: boolean;
  errorMessage?: React.ReactNode;
  onRetry?: () => void;
  isFiltered?: boolean;
  onResetFilters?: () => void;
  toolbar?: React.ReactNode;
  onCreateClick?: () => void;
}

export const ClientListTable: React.FC<ClientListTableProps> = ({
  clients,
  totalCount = 0,
  page = 1,
  pageSize = 10,
  onPageChange,
  onPageSizeChange,
  sorting,
  onSortingChange,
  isLoading = false,
  isFetching = false,
  isError = false,
  errorMessage,
  onRetry,
  isFiltered = false,
  onResetFilters,
  toolbar,
  onCreateClick,
}) => {
  const location = useLocation();

  const columns = useMemo<ColumnDef<ClientModel, unknown>[]>(() => {
    return [
      {
        accessorKey: 'referenceNumber',
        header: 'Reference #',
        cell: ({ row }) => {
          const client = row.original;
          return (
            <Link
              to={`/clients/${client.id}`}
              state={{ from: location.pathname + location.search }}
              className="font-mono text-xs font-semibold text-primary hover:underline"
              data-testid={`client-ref-${client.id}`}
            >
              {client.referenceNumber}
            </Link>
          );
        },
      },
      {
        id: 'name',
        accessorKey: 'fullName',
        header: ({ column }) => <DataTableColumnHeader column={column} title="Client Name" />,
        cell: ({ row }) => {
          const client = row.original;
          const displayName =
            client.fullName || `${client.firstName} ${client.lastName}`.trim() || '—';

          return (
            <div className="flex flex-col">
              <Link
                to={`/clients/${client.id}`}
                state={{ from: location.pathname + location.search }}
                className="font-medium text-foreground hover:text-primary transition-colors hover:underline"
                data-testid={`client-name-${client.id}`}
              >
                {displayName}
              </Link>
              <span className="text-xs text-muted-foreground sm:hidden">{client.email}</span>
            </div>
          );
        },
      },
      {
        accessorKey: 'email',
        header: 'Email',
        cell: ({ row }) => {
          const email = row.original.email;
          return email ? (
            <a
              href={`mailto:${email}`}
              className="text-xs text-muted-foreground hover:text-foreground hover:underline"
            >
              {email}
            </a>
          ) : (
            <span className="text-xs text-muted-foreground">—</span>
          );
        },
      },
      {
        accessorKey: 'phone',
        header: 'Phone',
        cell: ({ row }) => {
          const phone = row.original.phone;
          return phone ? (
            <a
              href={`tel:${phone}`}
              className="font-mono text-xs text-muted-foreground hover:text-foreground"
            >
              {phone}
            </a>
          ) : (
            <span className="text-xs text-muted-foreground">—</span>
          );
        },
      },
      {
        accessorKey: 'status',
        header: 'Status',
        cell: ({ row }) => {
          return <ClientStatusBadge status={row.original.status} />;
        },
      },
      {
        accessorKey: 'createdAt',
        header: ({ column }) => <DataTableColumnHeader column={column} title="Created" />,
        cell: ({ row }) => {
          const dateStr = row.original.createdAt;
          if (!dateStr) return <span className="text-muted-foreground">—</span>;
          const parsed = new Date(dateStr);
          return (
            <div className="flex flex-col text-xs">
              <span className="font-medium text-foreground">
                {parsed.toLocaleDateString(undefined, {
                  year: 'numeric',
                  month: 'short',
                  day: 'numeric',
                })}
              </span>
              <span className="text-muted-foreground">
                {parsed.toLocaleTimeString(undefined, {
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </span>
            </div>
          );
        },
      },
      {
        id: 'actions',
        header: () => <span className="sr-only">Actions</span>,
        cell: ({ row }) => {
          const client = row.original;
          return (
            <div className="flex justify-end">
              <Button asChild variant="ghost" size="sm" className="h-8 px-2 text-xs gap-1.5">
                <Link
                  to={`/clients/${client.id}`}
                  state={{ from: location.pathname + location.search }}
                  aria-label={`View profile for ${client.fullName || client.referenceNumber}`}
                  data-testid={`view-client-${client.id}`}
                >
                  <Eye className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
                  <span>View Profile</span>
                </Link>
              </Button>
            </div>
          );
        },
      },
    ];
  }, [location.pathname, location.search]);

  const emptyAction = (
    <HasPermission name="client:write">
      <Button
        type="button"
        size="sm"
        onClick={onCreateClick}
        className="gap-1.5"
        data-testid="empty-create-client-button"
      >
        <PlusCircle className="h-4 w-4" aria-hidden="true" />
        <span>Create First Client</span>
      </Button>
    </HasPermission>
  );

  return (
    <DataTable
      columns={columns}
      data={clients}
      totalCount={totalCount}
      page={page}
      pageSize={pageSize}
      onPageChange={onPageChange}
      onPageSizeChange={onPageSizeChange}
      pageSizeOptions={[10, 20, 50, 100]}
      sorting={sorting}
      onSortingChange={onSortingChange}
      isLoading={isLoading}
      isFetching={isFetching}
      isError={isError}
      errorMessage={errorMessage}
      onRetry={onRetry}
      isFiltered={isFiltered}
      emptyTitle={isFiltered ? 'No clients found' : 'No clients registered yet'}
      emptyDescription={
        isFiltered
          ? 'No client profiles match your current search and filter criteria. Try clearing or adjusting your search term.'
          : 'Get started by creating your first client record in the platform.'
      }
      onResetFilters={onResetFilters}
      emptyAction={!isFiltered ? emptyAction : undefined}
      toolbar={toolbar}
      ariaLabel="Clients directory table"
    />
  );
};
