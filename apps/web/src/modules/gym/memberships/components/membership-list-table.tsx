import { Button } from '@kinergy-platform/ui';
import type { ColumnDef, OnChangeFn, SortingState } from '@tanstack/react-table';
import { Eye, PauseCircle, PlayCircle, RefreshCw } from 'lucide-react';
import React, { useMemo } from 'react';
import {
  DataTable,
  DataTableColumnHeader,
  DataTableRowActions,
  type DataTableRowAction,
} from '../../../../shared/table';
import type { MembershipVM } from '../types';
import { MembershipStatusBadge } from './membership-status-badge';

export interface MembershipListTableProps {
  readonly memberships: readonly MembershipVM[];
  readonly totalCount?: number;
  readonly page?: number;
  readonly pageSize?: number;
  readonly onPageChange?: (page: number) => void;
  readonly onPageSizeChange?: (pageSize: number) => void;
  readonly sorting?: SortingState;
  readonly onSortingChange?: OnChangeFn<SortingState>;
  readonly isLoading?: boolean;
  readonly isError?: boolean;
  readonly errorMessage?: React.ReactNode;
  readonly onRetry?: () => void;
  readonly isFiltered?: boolean;
  readonly onResetFilters?: () => void;
  readonly toolbar?: React.ReactNode;
  readonly onViewDetails?: (membership: MembershipVM) => void;
  readonly onRenew?: (membership: MembershipVM) => void;
  readonly onFreeze?: (membership: MembershipVM) => void;
  readonly onUnfreeze?: (membership: MembershipVM) => void;
  readonly onCancel?: (membership: MembershipVM) => void;
  readonly isRenewing?: boolean;
  readonly isFreezing?: boolean;
  readonly isUnfreezing?: boolean;
  readonly isCancelling?: boolean;
  readonly canManageMemberships?: boolean;
}

export const MembershipListTable: React.FC<MembershipListTableProps> = ({
  memberships,
  totalCount,
  page,
  pageSize,
  onPageChange,
  onPageSizeChange,
  sorting,
  onSortingChange,
  isLoading = false,
  isError = false,
  errorMessage,
  onRetry,
  isFiltered = false,
  onResetFilters,
  toolbar,
  onViewDetails,
  onRenew,
  onFreeze,
  onUnfreeze,
  onCancel,
  isRenewing = false,
  isFreezing = false,
  isUnfreezing = false,
  isCancelling = false,
  canManageMemberships = true,
}) => {
  const columns = useMemo<ColumnDef<MembershipVM, unknown>[]>(() => {
    return [
      {
        accessorKey: 'clientId',
        header: ({ column }) => <DataTableColumnHeader column={column} title="Client ID" />,
        cell: ({ row }) => {
          const m = row.original;
          return (
            <div className="flex flex-col">
              <span className="font-mono text-xs font-semibold text-foreground">{m.clientId}</span>
              {m.assignedTrainerId && (
                <span className="text-[11px] text-muted-foreground font-mono">
                  Trainer: {m.assignedTrainerId}
                </span>
              )}
            </div>
          );
        },
        enableSorting: true,
        enableHiding: false,
      },
      {
        accessorKey: 'planId',
        header: ({ column }) => <DataTableColumnHeader column={column} title="Plan ID" />,
        cell: ({ row }) => (
          <span className="font-mono text-xs text-muted-foreground">{row.original.planId}</span>
        ),
        enableSorting: true,
        enableHiding: true,
      },
      {
        accessorKey: 'period.startDate',
        header: ({ column }) => <DataTableColumnHeader column={column} title="Validity Period" />,
        cell: ({ row }) => {
          const p = row.original.period;
          const start = new Date(p.startDate).toLocaleDateString();
          const end = new Date(p.endDate).toLocaleDateString();
          return (
            <div className="flex flex-col text-xs">
              <span className="text-foreground font-medium">
                {start} – {end}
              </span>
              <span className="text-muted-foreground text-[11px]">
                {p.durationDays} days validity
              </span>
            </div>
          );
        },
        enableSorting: true,
        enableHiding: false,
      },
      {
        accessorKey: 'status',
        header: ({ column }) => <DataTableColumnHeader column={column} title="Status" />,
        cell: ({ row }) => {
          const m = row.original;
          // Server-derived expiration indicator check
          const now = new Date().getTime();
          const end = new Date(m.period.endDate).getTime();
          const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
          const isExpiringSoon = m.status === 'ACTIVE' && end > now && end - now <= sevenDaysMs;

          return <MembershipStatusBadge status={m.status} isExpiringSoon={isExpiringSoon} />;
        },
        enableSorting: true,
        enableHiding: false,
      },
      {
        id: 'actions',
        header: () => <span className="sr-only">Actions</span>,
        cell: ({ row }) => {
          const m = row.original;
          const isActive = m.status === 'ACTIVE';
          const isFrozen = m.status === 'FROZEN';
          const isExpired = m.status === 'EXPIRED';
          const isCancelled = m.status === 'CANCELLED';

          const rowActions: DataTableRowAction<MembershipVM>[] = [
            {
              id: 'view',
              label: 'View Details',
              onClick: () => onViewDetails?.(m),
            },
            {
              id: 'renew',
              label: 'Renew Agreement',
              onClick: () => onRenew?.(m),
              disabled: isCancelled || isRenewing || !canManageMemberships,
              hidden: isCancelled,
            },
            {
              id: 'freeze',
              label: 'Freeze / Suspend',
              onClick: () => onFreeze?.(m),
              disabled: !isActive || isFreezing || !canManageMemberships,
              hidden: !isActive,
            },
            {
              id: 'unfreeze',
              label: 'Resume / Unfreeze',
              onClick: () => onUnfreeze?.(m),
              disabled: !isFrozen || isUnfreezing || !canManageMemberships,
              hidden: !isFrozen,
            },
            {
              id: 'cancel',
              label: 'Cancel Agreement',
              onClick: () => onCancel?.(m),
              disabled: isCancelled || isExpired || isCancelling || !canManageMemberships,
              hidden: isCancelled || isExpired,
              isDestructive: true,
            },
          ];

          return (
            <div className="flex items-center justify-end gap-1.5 whitespace-nowrap">
              {onViewDetails && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => onViewDetails(m)}
                  aria-label={`View details for membership ${m.id}`}
                  className="hidden sm:inline-flex h-8 px-2 text-xs"
                >
                  <Eye className="mr-1 h-3.5 w-3.5 text-muted-foreground" />
                  View
                </Button>
              )}

              {(isActive || isExpired) && onRenew && canManageMemberships && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={isRenewing}
                  onClick={() => onRenew(m)}
                  aria-label={`Renew membership ${m.id}`}
                  className="hidden md:inline-flex h-8 px-2 text-xs text-primary"
                >
                  <RefreshCw className="mr-1 h-3.5 w-3.5" />
                  Renew
                </Button>
              )}

              {isActive && onFreeze && canManageMemberships && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={isFreezing}
                  onClick={() => onFreeze(m)}
                  aria-label={`Freeze membership ${m.id}`}
                  className="hidden lg:inline-flex h-8 px-2 text-xs text-sky-600 hover:text-sky-700"
                >
                  <PauseCircle className="mr-1 h-3.5 w-3.5" />
                  Freeze
                </Button>
              )}

              {isFrozen && onUnfreeze && canManageMemberships && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={isUnfreezing}
                  onClick={() => onUnfreeze(m)}
                  aria-label={`Resume membership ${m.id}`}
                  className="hidden sm:inline-flex h-8 px-2 text-xs text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50"
                >
                  <PlayCircle className="mr-1 h-3.5 w-3.5" />
                  Resume
                </Button>
              )}

              <DataTableRowActions row={m} actions={rowActions} />
            </div>
          );
        },
        enableHiding: false,
      },
    ];
  }, [
    onViewDetails,
    onRenew,
    onFreeze,
    onUnfreeze,
    onCancel,
    isRenewing,
    isFreezing,
    isUnfreezing,
    isCancelling,
    canManageMemberships,
  ]);

  return (
    <DataTable
      columns={columns}
      data={memberships}
      totalCount={totalCount}
      page={page}
      pageSize={pageSize}
      onPageChange={onPageChange}
      onPageSizeChange={onPageSizeChange}
      sorting={sorting}
      onSortingChange={onSortingChange}
      isLoading={isLoading}
      isError={isError}
      errorMessage={errorMessage}
      onRetry={onRetry}
      isFiltered={isFiltered}
      emptyTitle={
        isFiltered ? 'No memberships matching filter criteria' : 'No membership agreements found'
      }
      emptyDescription={
        isFiltered
          ? 'Try broadening your search query or removing client/status filters.'
          : 'Create a new client membership agreement to begin tracking facility subscriptions.'
      }
      onResetFilters={onResetFilters}
      ariaLabel="Gym Membership Agreements Table"
      toolbar={toolbar}
    />
  );
};

MembershipListTable.displayName = 'MembershipListTable';
