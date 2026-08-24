import { Button } from '@kinergy-platform/ui';
import type { ColumnDef, OnChangeFn, SortingState } from '@tanstack/react-table';
import { Eye, DollarSign, Upload, Archive } from 'lucide-react';
import React, { useMemo } from 'react';
import {
  DataTable,
  DataTableColumnHeader,
  DataTableRowActions,
  type DataTableRowAction,
} from '../../../../shared/table';
import type { MembershipPlanVM } from '../types';
import { PlanStatusBadge } from './plan-status-badge';

export interface PlanListTableProps {
  readonly plans: readonly MembershipPlanVM[];
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
  readonly onViewDetails?: (plan: MembershipPlanVM) => void;
  readonly onEditPricing?: (plan: MembershipPlanVM) => void;
  readonly onPublish?: (plan: MembershipPlanVM) => void;
  readonly onArchive?: (plan: MembershipPlanVM) => void;
  readonly isPublishing?: boolean;
  readonly isArchiving?: boolean;
  readonly canManagePlans?: boolean;
}

export const PlanListTable: React.FC<PlanListTableProps> = ({
  plans,
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
  onEditPricing,
  onPublish,
  onArchive,
  isPublishing = false,
  isArchiving = false,
  canManagePlans = true,
}) => {
  const columns = useMemo<ColumnDef<MembershipPlanVM, unknown>[]>(() => {
    return [
      {
        accessorKey: 'name',
        header: ({ column }) => <DataTableColumnHeader column={column} title="Plan Name / Code" />,
        cell: ({ row }) => {
          const plan = row.original;
          return (
            <div className="flex flex-col">
              <span className="font-semibold text-foreground">{plan.name}</span>
              <span className="font-mono text-xs text-muted-foreground">{plan.code}</span>
              {plan.description && (
                <span className="text-xs text-muted-foreground line-clamp-1 mt-0.5">
                  {plan.description}
                </span>
              )}
            </div>
          );
        },
        enableSorting: true,
        enableHiding: false,
      },
      {
        accessorKey: 'priceAmount',
        header: ({ column }) => <DataTableColumnHeader column={column} title="Price" />,
        cell: ({ row }) => {
          const plan = row.original;
          return (
            <div className="font-mono font-medium text-sm text-foreground">
              ${(plan.priceAmount / 100).toFixed(2)}{' '}
              <span className="text-xs text-muted-foreground">{plan.priceCurrency}</span>
            </div>
          );
        },
        enableSorting: true,
        enableHiding: true,
      },
      {
        accessorKey: 'durationInDays',
        header: ({ column }) => <DataTableColumnHeader column={column} title="Duration" />,
        cell: ({ row }) => (
          <span className="text-xs font-medium text-muted-foreground">
            {row.original.durationInDays} days
          </span>
        ),
        enableSorting: true,
        enableHiding: true,
      },
      {
        accessorKey: 'visitQuota',
        header: 'Visit Quota',
        cell: ({ row }) => {
          const quota = row.original.visitQuota;
          return (
            <span className="text-xs text-muted-foreground">
              {quota ? `${quota} visits` : 'Unlimited'}
            </span>
          );
        },
        enableSorting: false,
        enableHiding: true,
      },
      {
        accessorKey: 'status',
        header: ({ column }) => <DataTableColumnHeader column={column} title="Status" />,
        cell: ({ row }) => <PlanStatusBadge status={row.original.status} />,
        enableSorting: true,
        enableHiding: false,
      },
      {
        id: 'actions',
        header: () => <span className="sr-only">Actions</span>,
        cell: ({ row }) => {
          const plan = row.original;
          const isDraft = plan.status === 'DRAFT';
          const isActive = plan.status === 'ACTIVE';
          const isArchived = plan.status === 'ARCHIVED';

          const rowActions: DataTableRowAction<MembershipPlanVM>[] = [
            {
              id: 'view',
              label: 'View Details',
              onClick: () => onViewDetails?.(plan),
            },
            {
              id: 'edit-pricing',
              label: 'Update Pricing',
              onClick: () => onEditPricing?.(plan),
              disabled: isArchived || !canManagePlans,
              hidden: isArchived,
            },
            {
              id: 'publish',
              label: 'Publish Plan',
              onClick: () => onPublish?.(plan),
              disabled: isPublishing || !canManagePlans,
              hidden: !isDraft,
            },
            {
              id: 'archive',
              label: 'Archive Plan',
              onClick: () => onArchive?.(plan),
              disabled: isArchiving || !canManagePlans,
              hidden: !isActive,
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
                  onClick={() => onViewDetails(plan)}
                  aria-label={`View details for ${plan.name}`}
                  className="hidden sm:inline-flex h-8 px-2 text-xs"
                >
                  <Eye className="mr-1 h-3.5 w-3.5 text-muted-foreground" />
                  View
                </Button>
              )}

              {isActive && onEditPricing && canManagePlans && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => onEditPricing(plan)}
                  aria-label={`Update pricing for ${plan.name}`}
                  className="hidden md:inline-flex h-8 px-2 text-xs"
                >
                  <DollarSign className="mr-1 h-3.5 w-3.5 text-muted-foreground" />
                  Price
                </Button>
              )}

              {isDraft && onPublish && canManagePlans && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={isPublishing}
                  onClick={() => onPublish(plan)}
                  aria-label={`Publish ${plan.name}`}
                  className="hidden sm:inline-flex h-8 px-2 text-xs text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 dark:hover:bg-emerald-950/30"
                >
                  <Upload className="mr-1 h-3.5 w-3.5" />
                  Publish
                </Button>
              )}

              {isActive && onArchive && canManagePlans && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={isArchiving}
                  onClick={() => onArchive(plan)}
                  aria-label={`Archive ${plan.name}`}
                  className="hidden lg:inline-flex h-8 px-2 text-xs text-destructive hover:text-destructive hover:bg-destructive/10"
                >
                  <Archive className="mr-1 h-3.5 w-3.5" />
                  Archive
                </Button>
              )}

              <DataTableRowActions row={plan} actions={rowActions} />
            </div>
          );
        },
        enableHiding: false,
      },
    ];
  }, [
    onViewDetails,
    onEditPricing,
    onPublish,
    onArchive,
    isPublishing,
    isArchiving,
    canManagePlans,
  ]);

  return (
    <DataTable
      columns={columns}
      data={plans}
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
        isFiltered ? 'No plans matching search criteria' : 'No membership plans cataloged'
      }
      emptyDescription={
        isFiltered
          ? 'Try broadening your search query or removing active status filters.'
          : 'Create a new draft commercial plan to begin building your membership catalog.'
      }
      onResetFilters={onResetFilters}
      ariaLabel="Membership Plans Catalog Table"
      toolbar={toolbar}
    />
  );
};

PlanListTable.displayName = 'PlanListTable';
