import React, { useMemo } from 'react';
import { Link } from 'react-router-dom';
import type { ColumnDef, OnChangeFn, SortingState } from '@tanstack/react-table';
import { Eye, Edit, ArrowRightLeft, Wrench, History, PlusCircle } from 'lucide-react';
import { Button } from '@kinergy-platform/ui';
import {
  DataTable,
  DataTableColumnHeader,
  DataTableRowActions,
  type DataTableRowAction,
} from '../../../../shared/table';
import { useAuth } from '../../../../app/providers/auth-provider';
import { AssetStatusBadge } from './asset-status-badge';
import { AssetConditionBadge } from './asset-condition-badge';
import { AssetCategoryBadge } from './asset-category-badge';
import { AssetStatus, type FixedAssetVM } from '../types';

export interface AssetListTableProps {
  assets: readonly FixedAssetVM[];
  totalCount?: number;
  page?: number;
  pageSize?: number;
  onPageChange?: (page: number) => void;
  onPageSizeChange?: (pageSize: number) => void;
  sorting?: SortingState;
  onSortingChange?: OnChangeFn<SortingState>;
  isLoading?: boolean;
  isError?: boolean;
  errorMessage?: React.ReactNode;
  onRetry?: () => void;
  isFiltered?: boolean;
  onResetFilters?: () => void;
  toolbar?: React.ReactNode;
  onViewDetails?: (asset: FixedAssetVM) => void;
  onEdit?: (asset: FixedAssetVM) => void;
  onTransfer?: (asset: FixedAssetVM) => void;
  onRecordMaintenance?: (asset: FixedAssetVM) => void;
  onViewHistory?: (asset: FixedAssetVM) => void;
  onCommissionClick?: () => void;
}

export const AssetListTable: React.FC<AssetListTableProps> = ({
  assets,
  totalCount = 0,
  page = 1,
  pageSize = 10,
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
  onEdit,
  onTransfer,
  onRecordMaintenance,
  onViewHistory,
  onCommissionClick,
}) => {
  const { currentUser } = useAuth();

  const canWrite = Boolean(
    currentUser?.permissions?.includes('assets.write') ||
    currentUser?.roles?.includes('ADMIN') ||
    currentUser?.roles?.includes('OWNER') ||
    currentUser?.roles?.includes('SUPER_ADMIN'),
  );

  const hasValuationPermission = Boolean(
    currentUser?.permissions?.includes('billing.read') ||
    currentUser?.permissions?.includes('valuation.read') ||
    currentUser?.roles?.includes('SUPER_ADMIN') ||
    currentUser?.roles?.includes('OWNER') ||
    currentUser?.roles?.includes('ADMIN'),
  );

  const columns = useMemo<ColumnDef<FixedAssetVM, unknown>[]>(() => {
    const cols: ColumnDef<FixedAssetVM, unknown>[] = [
      // 1. Asset Name & Hardware Barcode Tag
      {
        accessorKey: 'name',
        header: ({ column }) => <DataTableColumnHeader column={column} title="Asset Tag / Name" />,
        cell: ({ row }) => {
          const item = row.original;
          const isDecommissioned =
            item.status === AssetStatus.RETIRED || item.status === AssetStatus.SOLD;

          return (
            <div className="flex flex-col">
              <Link
                to={`/resources/assets/${item.id}`}
                className={`font-medium hover:text-primary hover:underline ${
                  isDecommissioned
                    ? 'text-muted-foreground line-through decoration-muted-foreground/50'
                    : 'text-foreground'
                }`}
              >
                {item.name}
              </Link>
              <div className="flex items-center gap-1.5 mt-0.5">
                <span className="font-mono text-xs text-muted-foreground">{item.assetTag}</span>
                {isDecommissioned && (
                  <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground/80 bg-muted px-1 rounded">
                    {item.status}
                  </span>
                )}
              </div>
            </div>
          );
        },
      },
      // 2. Taxonomy Category
      {
        accessorKey: 'category',
        header: ({ column }) => <DataTableColumnHeader column={column} title="Category" />,
        cell: ({ row }) => <AssetCategoryBadge category={row.original.category} />,
      },
      // 3. Physical Facility & Room Location
      {
        id: 'location',
        header: ({ column }) => <DataTableColumnHeader column={column} title="Location" />,
        cell: ({ row }) => {
          const loc = row.original.location;
          return (
            <div className="flex flex-col text-xs text-muted-foreground">
              <span className="font-medium text-foreground">{loc.facilityId}</span>
              {loc.roomId && <span>Room: {loc.roomId}</span>}
              {loc.zone && <span className="text-[11px] text-muted-foreground/80">{loc.zone}</span>}
            </div>
          );
        },
      },
      // 4. Lifecycle Status
      {
        accessorKey: 'status',
        header: ({ column }) => <DataTableColumnHeader column={column} title="Status" />,
        cell: ({ row }) => <AssetStatusBadge status={row.original.status} />,
      },
      // 5. Physical Condition Rating
      {
        accessorKey: 'condition',
        header: ({ column }) => <DataTableColumnHeader column={column} title="Condition" />,
        cell: ({ row }) => <AssetConditionBadge condition={row.original.condition} showRank />,
      },
      // 6. Acquisition Date
      {
        accessorKey: 'purchaseDate',
        header: ({ column }) => <DataTableColumnHeader column={column} title="Acquired" />,
        cell: ({ row }) => {
          const dateStr = row.original.purchaseDate;
          if (!dateStr) return <span className="text-xs text-muted-foreground">—</span>;
          const formatted = new Date(dateStr).toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
          });
          return <span className="text-xs text-muted-foreground">{formatted}</span>;
        },
      },
    ];

    // 7. Balance Sheet Valuation (Strictly gated by billing/valuation permissions)
    if (hasValuationPermission) {
      cols.push({
        id: 'valuation',
        header: ({ column }) => <DataTableColumnHeader column={column} title="Valuation" />,
        cell: ({ row }) => {
          const item = row.original;
          const hasEstimated =
            typeof item.currentEstimatedValueAmount === 'number' &&
            item.currentEstimatedValueCurrency;
          const hasPurchase =
            typeof item.purchaseValueAmount === 'number' && item.purchaseValueCurrency;

          if (!hasEstimated && !hasPurchase) {
            return <span className="text-xs text-muted-foreground">—</span>;
          }

          return (
            <div className="flex flex-col text-xs">
              {hasEstimated ? (
                <span className="font-mono font-medium text-foreground">
                  ${item.currentEstimatedValueAmount?.toFixed(2)}{' '}
                  {item.currentEstimatedValueCurrency}
                </span>
              ) : (
                <span className="font-mono text-muted-foreground">
                  ${item.purchaseValueAmount?.toFixed(2)} {item.purchaseValueCurrency}
                </span>
              )}
              {hasEstimated && hasPurchase && (
                <span className="text-[10px] text-muted-foreground">
                  Cost: ${item.purchaseValueAmount?.toFixed(2)}
                </span>
              )}
            </div>
          );
        },
      });
    }

    // 8. Row Context Actions Menu
    cols.push({
      id: 'actions',
      header: () => <span className="sr-only">Actions</span>,
      cell: ({ row }) => {
        const item = row.original;
        const isDecommissioned =
          item.status === AssetStatus.RETIRED || item.status === AssetStatus.SOLD;

        const rowActions: DataTableRowAction<FixedAssetVM>[] = [
          {
            id: 'view',
            label: 'View Cockpit',
            icon: Eye,
            onClick: (ast) => onViewDetails?.(ast),
          },
          {
            id: 'history',
            label: 'Audit History',
            icon: History,
            onClick: (ast) => onViewHistory?.(ast),
          },
        ];

        if (canWrite) {
          rowActions.push(
            {
              id: 'edit',
              label: 'Edit Metadata',
              icon: Edit,
              onClick: (ast) => onEdit?.(ast),
              disabled: isDecommissioned,
            },
            {
              id: 'transfer',
              label: 'Transfer Location',
              icon: ArrowRightLeft,
              onClick: (ast) => onTransfer?.(ast),
              disabled: isDecommissioned,
            },
            {
              id: 'maintenance',
              label: 'Log Maintenance',
              icon: Wrench,
              onClick: (ast) => onRecordMaintenance?.(ast),
              disabled: isDecommissioned,
            },
          );
        }

        return <DataTableRowActions row={item} actions={rowActions} />;
      },
    });

    return cols;
  }, [
    canWrite,
    hasValuationPermission,
    onViewDetails,
    onViewHistory,
    onEdit,
    onTransfer,
    onRecordMaintenance,
  ]);

  return (
    <div data-testid="asset-list-table">
      <DataTable
        columns={columns}
        data={assets}
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
        onResetFilters={onResetFilters}
        toolbar={toolbar}
        emptyTitle={isFiltered ? 'No matching assets' : 'No fixed assets registered'}
        emptyDescription={
          isFiltered
            ? 'No physical capital equipment matches the current filter criteria. Try resetting or adjusting filters.'
            : 'No physical capital assets have been registered in the estate. Commission your first asset to start tracking.'
        }
        emptyAction={
          !isFiltered && canWrite && onCommissionClick ? (
            <Button variant="default" size="sm" onClick={onCommissionClick}>
              <PlusCircle className="mr-1.5 h-4 w-4" /> Commission First Asset
            </Button>
          ) : undefined
        }
      />
    </div>
  );
};
