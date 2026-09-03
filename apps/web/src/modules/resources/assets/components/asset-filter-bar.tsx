import React from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@kinergy-platform/ui';
import { PlusCircle, RotateCcw, LayoutDashboard, Archive } from 'lucide-react';
import { HasPermission } from '../../../../app/routes/permission-guard';
import {
  DataTableSearch,
  DataTableFacetedFilter,
  type DataTableFilterOption,
} from '../../../../shared/table';
import { AssetCategory, AssetStatus, AssetCondition } from '../types';

export interface AssetFilterBarProps {
  search: string;
  category?: AssetCategory;
  status?: AssetStatus;
  condition?: AssetCondition;
  facilityId?: string;
  includeDecommissioned?: boolean;
  isFiltered: boolean;
  onSearchChange: (search: string) => void;
  onCategoryChange: (category?: AssetCategory) => void;
  onStatusChange: (status?: AssetStatus) => void;
  onConditionChange: (condition?: AssetCondition) => void;
  onFacilityIdChange?: (facilityId?: string) => void;
  onIncludeDecommissionedChange: (includeDecommissioned?: boolean) => void;
  onResetFilters: () => void;
  onCommissionClick?: () => void;
}

const CATEGORY_OPTIONS: DataTableFilterOption[] = Object.values(AssetCategory).map((cat) => ({
  value: cat,
  label: cat.replace(/_/g, ' '),
}));

const STATUS_OPTIONS: DataTableFilterOption[] = [
  { value: AssetStatus.ACTIVE, label: 'Active' },
  { value: AssetStatus.UNDER_MAINTENANCE, label: 'Under Maintenance' },
  { value: AssetStatus.DAMAGED, label: 'Damaged' },
  { value: AssetStatus.RETIRED, label: 'Retired' },
  { value: AssetStatus.SOLD, label: 'Sold' },
];

const CONDITION_OPTIONS: DataTableFilterOption[] = [
  { value: AssetCondition.EXCELLENT, label: 'Rank 1 • Excellent' },
  { value: AssetCondition.GOOD, label: 'Rank 2 • Good' },
  { value: AssetCondition.FAIR, label: 'Rank 3 • Fair' },
  { value: AssetCondition.NEEDS_REPAIR, label: 'Rank 4 • Needs Repair' },
  { value: AssetCondition.OUT_OF_SERVICE, label: 'Rank 5 • Out of Service' },
];

export const AssetFilterBar: React.FC<AssetFilterBarProps> = ({
  search,
  category,
  status,
  condition,
  includeDecommissioned,
  isFiltered,
  onSearchChange,
  onCategoryChange,
  onStatusChange,
  onConditionChange,
  onIncludeDecommissionedChange,
  onResetFilters,
  onCommissionClick,
}) => {
  return (
    <div
      className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"
      data-testid="asset-filter-bar"
    >
      <div className="flex flex-1 flex-wrap items-center gap-2">
        {/* 1. Hardware Tag / Name Search */}
        <DataTableSearch
          placeholder="Search by asset tag, barcode, name..."
          value={search}
          onChange={onSearchChange}
          className="w-full sm:w-64"
        />

        {/* 2. Asset Category Filter */}
        <DataTableFacetedFilter
          title="Category"
          options={CATEGORY_OPTIONS}
          selectedValues={category ? [category] : []}
          onSelect={(values) => onCategoryChange(values?.[0] as AssetCategory | undefined)}
        />

        {/* 3. Lifecycle Status Filter */}
        <DataTableFacetedFilter
          title="Status"
          options={STATUS_OPTIONS}
          selectedValues={status ? [status] : []}
          onSelect={(values) => onStatusChange(values?.[0] as AssetStatus | undefined)}
        />

        {/* 4. Physical Condition Filter */}
        <DataTableFacetedFilter
          title="Condition"
          options={CONDITION_OPTIONS}
          selectedValues={condition ? [condition] : []}
          onSelect={(values) => onConditionChange(values?.[0] as AssetCondition | undefined)}
        />

        {/* 5. Include Decommissioned Toggle */}
        <Button
          variant={includeDecommissioned ? 'secondary' : 'outline'}
          size="sm"
          onClick={() => onIncludeDecommissionedChange(!includeDecommissioned)}
          className={`h-8 px-2.5 text-xs ${
            includeDecommissioned ? 'border-primary/50 text-foreground' : 'text-muted-foreground'
          }`}
          data-testid="toggle-decommissioned"
        >
          <Archive className="mr-1.5 h-3.5 w-3.5" />
          {includeDecommissioned ? 'Decommissioned Included' : 'Include Decommissioned'}
        </Button>

        {/* 6. Reset Filters */}
        {isFiltered && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onResetFilters}
            className="h-8 px-2.5 text-xs text-muted-foreground hover:text-foreground"
            data-testid="reset-filters"
          >
            <RotateCcw className="mr-1.5 h-3.5 w-3.5" /> Reset
          </Button>
        )}
      </div>

      {/* Primary and Secondary Action Links */}
      <div className="flex items-center gap-2">
        <Button asChild variant="outline" size="sm" className="h-8 text-xs">
          <Link to="/resources/assets/overview">
            <LayoutDashboard className="mr-1.5 h-3.5 w-3.5" /> Cockpit Overview
          </Link>
        </Button>

        <HasPermission name="assets.write">
          <Button
            variant="default"
            size="sm"
            className="h-8 text-xs"
            onClick={onCommissionClick}
            asChild={!onCommissionClick}
          >
            {onCommissionClick ? (
              <>
                <PlusCircle className="mr-1.5 h-3.5 w-3.5" /> Commission New Asset
              </>
            ) : (
              <Link to="/resources/assets/new">
                <PlusCircle className="mr-1.5 h-3.5 w-3.5" /> Commission New Asset
              </Link>
            )}
          </Button>
        </HasPermission>
      </div>
    </div>
  );
};
