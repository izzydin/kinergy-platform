import React from 'react';
import { Button } from '@kinergy-platform/ui';
import { PackagePlus, RotateCcw } from 'lucide-react';
import { HasPermission } from '../../../../app/routes/permission-guard';
import {
  DataTableSearch,
  DataTableFacetedFilter,
  type DataTableFilterOption,
} from '../../../../shared/table';
import { InventoryCategory, InventoryItemStatus } from '../types';

export interface InventoryFilterBarProps {
  search: string;
  category?: InventoryCategory;
  status?: InventoryItemStatus;
  stockStatus?: 'ALL' | 'IN_STOCK' | 'LOW_STOCK' | 'OUT_OF_STOCK';
  includeArchived?: boolean;
  isFiltered: boolean;
  onSearchChange: (search: string) => void;
  onCategoryChange: (category?: InventoryCategory) => void;
  onStatusChange: (status?: InventoryItemStatus) => void;
  onStockStatusChange: (stockStatus?: 'ALL' | 'IN_STOCK' | 'LOW_STOCK' | 'OUT_OF_STOCK') => void;
  onIncludeArchivedChange?: (includeArchived?: boolean) => void;
  onResetFilters: () => void;
  onRegisterClick?: () => void;
}

const CATEGORY_OPTIONS: DataTableFilterOption[] = Object.values(InventoryCategory).map((cat) => ({
  value: cat,
  label: cat.replace(/_/g, ' '),
}));

const STOCK_STATUS_OPTIONS: DataTableFilterOption[] = [
  { value: 'IN_STOCK', label: 'In Stock' },
  { value: 'LOW_STOCK', label: 'Low Stock' },
  { value: 'OUT_OF_STOCK', label: 'Out of Stock' },
];

const STATUS_OPTIONS: DataTableFilterOption[] = [
  { value: InventoryItemStatus.ACTIVE, label: 'Active' },
  { value: InventoryItemStatus.INACTIVE, label: 'Suspended' },
  { value: InventoryItemStatus.ARCHIVED, label: 'Archived' },
];

export const InventoryFilterBar: React.FC<InventoryFilterBarProps> = ({
  search,
  category,
  status,
  stockStatus,
  includeArchived: _includeArchived,
  isFiltered,
  onSearchChange,
  onCategoryChange,
  onStatusChange,
  onStockStatusChange,
  onIncludeArchivedChange: _onIncludeArchivedChange,
  onResetFilters,
  onRegisterClick,
}) => {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex flex-1 flex-wrap items-center gap-2">
        {/* Search Input */}
        <DataTableSearch
          placeholder="Search by SKU, product name..."
          value={search}
          onChange={onSearchChange}
          className="w-full sm:w-64"
        />

        {/* Category Faceted Filter */}
        <DataTableFacetedFilter
          title="Category"
          options={CATEGORY_OPTIONS}
          selectedValues={category ? [category] : []}
          onSelect={(values) => onCategoryChange(values?.[0] as InventoryCategory | undefined)}
        />

        {/* Stock Status Filter */}
        <DataTableFacetedFilter
          title="Stock Level"
          options={STOCK_STATUS_OPTIONS}
          selectedValues={stockStatus && stockStatus !== 'ALL' ? [stockStatus] : []}
          onSelect={(values) =>
            onStockStatusChange(
              (values?.[0] as 'ALL' | 'IN_STOCK' | 'LOW_STOCK' | 'OUT_OF_STOCK') || undefined,
            )
          }
        />

        {/* Lifecycle Status Filter */}
        <DataTableFacetedFilter
          title="Status"
          options={STATUS_OPTIONS}
          selectedValues={status ? [status] : []}
          onSelect={(values) => onStatusChange(values?.[0] as InventoryItemStatus | undefined)}
        />

        {/* Reset Active Filters Button */}
        {isFiltered && (
          <Button variant="ghost" size="sm" onClick={onResetFilters} className="h-8 px-2.5">
            <RotateCcw className="mr-1.5 h-3.5 w-3.5" /> Reset
          </Button>
        )}
      </div>

      {/* Primary Action Button */}
      {onRegisterClick && (
        <HasPermission name="inventory.write">
          <Button variant="default" size="sm" onClick={onRegisterClick}>
            <PackagePlus className="mr-1.5 h-4 w-4" /> Register Product
          </Button>
        </HasPermission>
      )}
    </div>
  );
};
