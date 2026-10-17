import React, { useMemo } from 'react';
import { Link } from 'react-router-dom';
import type { ColumnDef, OnChangeFn, SortingState } from '@tanstack/react-table';
import { Badge, Button } from '@kinergy-platform/ui';
import { Eye, PlusCircle } from 'lucide-react';
import { DataTable, DataTableColumnHeader } from '../../../shared/table';
import { SaleStatusBadge } from './sale-status-badge';
import { MoneyDisplay } from './money-display';
import { HasPermission } from '../../../app/routes/permission-guard';
import type { SaleSummaryDTO } from '../types/sales.types';
import type { SaleStatus } from '../types/sales-query.types';

export interface SalesListTableProps {
  sales: readonly SaleSummaryDTO[];
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

export const SalesListTable: React.FC<SalesListTableProps> = ({
  sales,
  totalCount = 0,
  page = 1,
  pageSize = 20,
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
  const columns = useMemo<ColumnDef<SaleSummaryDTO, unknown>[]>(() => {
    return [
      {
        accessorKey: 'createdAt',
        header: ({ column }) => <DataTableColumnHeader column={column} title="Date & Time" />,
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
        accessorKey: 'id',
        header: 'Sale ID',
        cell: ({ row }) => {
          const id = row.original.id;
          return (
            <Link
              to={`/sales/${id}`}
              className="font-mono text-xs font-semibold text-primary hover:underline"
              data-testid={`sale-row-id-${id}`}
            >
              {id}
            </Link>
          );
        },
      },
      {
        accessorKey: 'clientId',
        header: 'Client',
        cell: ({ row }) => {
          const clientId = row.original.clientId;
          return clientId ? (
            <span className="font-mono text-xs text-foreground">{clientId}</span>
          ) : (
            <span className="text-xs text-muted-foreground italic">Walk-in</span>
          );
        },
      },
      {
        id: 'source',
        header: 'Source',
        cell: ({ row }) => {
          const source = row.original.sourceReference ?? row.original.source;
          const sourceType = source?.sourceType ?? source?.type;
          const sourceCode = source?.sourceCode ?? source?.referenceCode;
          if (!sourceType) {
            return <span className="text-xs text-muted-foreground">DIRECT</span>;
          }
          return (
            <div className="flex flex-col gap-0.5">
              <Badge variant="outline" className="w-fit text-[10px] px-1.5 py-0">
                {sourceType.replace(/_/g, ' ')}
              </Badge>
              {sourceCode && (
                <span className="font-mono text-[10px] text-muted-foreground">{sourceCode}</span>
              )}
            </div>
          );
        },
      },
      {
        accessorKey: 'status',
        header: ({ column }) => <DataTableColumnHeader column={column} title="Status" />,
        cell: ({ row }) => {
          return <SaleStatusBadge status={row.original.status as SaleStatus} />;
        },
      },
      {
        accessorKey: 'itemCount',
        header: 'Items',
        cell: ({ row }) => {
          return <span className="font-mono text-xs">{row.original.itemCount ?? 0}</span>;
        },
      },
      {
        accessorKey: 'total',
        header: ({ column }) => (
          <div className="text-right">
            <DataTableColumnHeader column={column} title="Total" />
          </div>
        ),
        cell: ({ row }) => {
          return (
            <div className="text-right">
              <MoneyDisplay value={row.original.total} className="text-xs font-semibold" />
            </div>
          );
        },
      },
      {
        id: 'actions',
        header: () => <span className="sr-only">Actions</span>,
        cell: ({ row }) => {
          const id = row.original.id;
          return (
            <div className="flex justify-end">
              <Button asChild variant="ghost" size="sm" className="h-8 px-2 text-xs gap-1">
                <Link to={`/sales/${id}`} aria-label={`View sale ${id}`}>
                  <Eye className="h-3.5 w-3.5 text-muted-foreground" />
                  <span>View</span>
                </Link>
              </Button>
            </div>
          );
        },
      },
    ];
  }, []);

  const emptyAction = (
    <HasPermission name="sales.create">
      <Button
        type="button"
        size="sm"
        onClick={onCreateClick}
        asChild={!onCreateClick}
        className="gap-1.5"
      >
        {onCreateClick ? (
          <>
            <PlusCircle className="h-4 w-4" /> Create Sale
          </>
        ) : (
          <Link to="/sales/new">
            <PlusCircle className="h-4 w-4" /> Create Sale
          </Link>
        )}
      </Button>
    </HasPermission>
  );

  return (
    <DataTable
      columns={columns}
      data={sales}
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
      emptyTitle={isFiltered ? 'No sales found' : 'No sales orders yet'}
      emptyDescription={
        isFiltered
          ? 'No commercial sales match the specified filter criteria. Try resetting or adjusting your search filters.'
          : 'Start by creating your first commercial sale agreement.'
      }
      onResetFilters={onResetFilters}
      emptyAction={!isFiltered ? emptyAction : undefined}
      toolbar={toolbar}
      ariaLabel="Sales orders table"
    />
  );
};
