import React, { useMemo } from 'react';
import { Link } from 'react-router-dom';
import type { ColumnDef, OnChangeFn, SortingState } from '@tanstack/react-table';
import {
  Archive,
  ArchiveRestore,
  Edit,
  Eye,
  PackageCheck,
  PackageMinus,
  PackagePlus,
  ShoppingCart,
  Sliders,
  Trash2,
} from 'lucide-react';
import { Button } from '@kinergy-platform/ui';
import {
  DataTable,
  DataTableColumnHeader,
  DataTableRowActions,
  type DataTableRowAction,
} from '../../../../shared/table';
import { useAuth } from '../../../../app/providers/auth-provider';
import { InventoryStatusBadge } from './inventory-status-badge';
import { StockLevelGauge } from './stock-level-gauge';
import { InventoryItemStatus, type InventoryProductVM } from '../types';

export interface InventoryListTableProps {
  products: readonly InventoryProductVM[];
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
  onViewDetails?: (product: InventoryProductVM) => void;
  onEdit?: (product: InventoryProductVM) => void;
  onReceiveStock?: (product: InventoryProductVM) => void;
  onSellStock?: (product: InventoryProductVM) => void;
  onConsumeStock?: (product: InventoryProductVM) => void;
  onScrapStock?: (product: InventoryProductVM) => void;
  onAdjustStock?: (product: InventoryProductVM) => void;
  onArchive?: (product: InventoryProductVM) => void;
  onActivate?: (product: InventoryProductVM) => void;
  onCreateClick?: () => void;
}

export const InventoryListTable: React.FC<InventoryListTableProps> = ({
  products,
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
  onReceiveStock,
  onSellStock,
  onConsumeStock,
  onScrapStock,
  onAdjustStock,
  onArchive,
  onActivate,
  onCreateClick,
}) => {
  const { currentUser } = useAuth();
  const canWrite = Boolean(
    currentUser?.permissions?.includes('inventory.write') ||
    currentUser?.roles?.includes('ADMIN') ||
    currentUser?.roles?.includes('OWNER') ||
    currentUser?.roles?.includes('SUPER_ADMIN'),
  );

  const hasValuationPermission = Boolean(
    currentUser?.permissions?.includes('valuation.read') ||
    currentUser?.permissions?.includes('billing.read') ||
    currentUser?.roles?.includes('SUPER_ADMIN') ||
    currentUser?.roles?.includes('OWNER'),
  );

  const columns = useMemo<ColumnDef<InventoryProductVM, unknown>[]>(() => {
    const cols: ColumnDef<InventoryProductVM, unknown>[] = [
      {
        accessorKey: 'name',
        header: ({ column }) => <DataTableColumnHeader column={column} title="Product / SKU" />,
        cell: ({ row }) => {
          const item = row.original;
          return (
            <div className="flex flex-col">
              <Link
                to={`/resources/inventory/${item.id}`}
                className="font-medium text-foreground hover:text-primary hover:underline"
              >
                {item.name}
              </Link>
              <span className="font-mono text-xs text-muted-foreground">{item.sku}</span>
            </div>
          );
        },
      },
      {
        accessorKey: 'category',
        header: ({ column }) => <DataTableColumnHeader column={column} title="Category" />,
        cell: ({ row }) => {
          const item = row.original;
          return (
            <span className="text-sm text-muted-foreground">
              {item.category.replace(/_/g, ' ')}
            </span>
          );
        },
      },
      {
        accessorKey: 'currentStock',
        header: ({ column }) => <DataTableColumnHeader column={column} title="Stock on Hand" />,
        cell: ({ row }) => {
          const item = row.original;
          return (
            <StockLevelGauge
              currentStock={item.currentStock}
              reorderThreshold={item.reorderThreshold}
              unit={item.unitOfMeasure}
              isLowStock={item.isLowStock}
              isOutOfStock={item.isOutOfStock}
            />
          );
        },
      },
      {
        accessorKey: 'sellingPrice',
        header: ({ column }) => <DataTableColumnHeader column={column} title="Retail Price" />,
        cell: ({ row }) => {
          const item = row.original;
          return (
            <span className="font-mono text-sm text-foreground">
              ${(item.sellingPrice?.amount ?? 0).toFixed(2)}
            </span>
          );
        },
      },
    ];

    // Conditionally include purchase unit cost only for authorized users
    if (hasValuationPermission) {
      cols.push({
        accessorKey: 'unitCost',
        header: ({ column }) => <DataTableColumnHeader column={column} title="Unit Cost" />,
        cell: ({ row }) => {
          const item = row.original;
          return (
            <span className="font-mono text-sm text-muted-foreground">
              ${(item.unitCost?.amount ?? 0).toFixed(2)}
            </span>
          );
        },
      });
    }

    cols.push(
      {
        accessorKey: 'status',
        header: ({ column }) => <DataTableColumnHeader column={column} title="Status" />,
        cell: ({ row }) => {
          const item = row.original;
          return <InventoryStatusBadge status={item.status} />;
        },
      },
      {
        id: 'actions',
        header: () => <span className="sr-only">Actions</span>,
        cell: ({ row }) => {
          const item = row.original;
          const isArchived = item.status === InventoryItemStatus.ARCHIVED;

          const rowActions: DataTableRowAction<InventoryProductVM>[] = [
            {
              id: 'view',
              label: 'View Details',
              icon: Eye,
              onClick: (prod) => onViewDetails?.(prod),
            },
          ];

          if (canWrite && !isArchived) {
            rowActions.push(
              {
                id: 'edit',
                label: 'Edit Metadata',
                icon: Edit,
                onClick: (prod) => onEdit?.(prod),
              },
              {
                id: 'receive',
                label: 'Receive Stock (+)',
                icon: PackageCheck,
                onClick: (prod) => onReceiveStock?.(prod),
              },
              {
                id: 'sell',
                label: 'Record Sale (-)',
                icon: ShoppingCart,
                onClick: (prod) => onSellStock?.(prod),
              },
              {
                id: 'consume',
                label: 'Clinical Consumption (-)',
                icon: PackageMinus,
                onClick: (prod) => onConsumeStock?.(prod),
              },
              {
                id: 'adjust',
                label: 'Physical Adjustment (±)',
                icon: Sliders,
                onClick: (prod) => onAdjustStock?.(prod),
              },
              {
                id: 'scrap',
                label: 'Scrap Damaged Stock',
                icon: Trash2,
                onClick: (prod) => onScrapStock?.(prod),
                isDestructive: true,
              },
              {
                id: 'archive',
                label: 'Archive Product',
                icon: Archive,
                onClick: (prod) => onArchive?.(prod),
                isDestructive: true,
              },
            );
          } else if (canWrite && isArchived) {
            rowActions.push({
              id: 'activate',
              label: 'Reactivate Product',
              icon: ArchiveRestore,
              onClick: (prod) => onActivate?.(prod),
            });
          }

          return <DataTableRowActions row={item} actions={rowActions} />;
        },
      },
    );

    return cols;
  }, [
    canWrite,
    hasValuationPermission,
    onViewDetails,
    onEdit,
    onReceiveStock,
    onSellStock,
    onConsumeStock,
    onAdjustStock,
    onScrapStock,
    onArchive,
    onActivate,
  ]);

  return (
    <DataTable
      columns={columns}
      data={products}
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
      emptyTitle="No products in catalog"
      emptyDescription="No consumable inventory products match the active criteria or none have been registered."
      emptyAction={
        canWrite && onCreateClick ? (
          <Button variant="default" size="sm" onClick={onCreateClick}>
            <PackagePlus className="mr-1.5 h-4 w-4" /> Register First Product
          </Button>
        ) : undefined
      }
    />
  );
};
