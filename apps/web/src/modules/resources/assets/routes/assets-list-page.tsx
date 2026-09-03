import React from 'react';
import { useNavigate } from 'react-router-dom';
import type { OnChangeFn, SortingState } from '@tanstack/react-table';
import { Badge } from '@kinergy-platform/ui';
import { CrudListHeader, CrudListLayout } from '../../../../shared/crud';
import { useAssetsFilters, useAssetsList } from '../hooks';
import { AssetFilterBar, AssetListTable } from '../components';
import type { FixedAssetVM } from '../types';

export const AssetsListPage: React.FC = () => {
  const navigate = useNavigate();

  const {
    params,
    search,
    category,
    status,
    condition,
    includeDecommissioned,
    isFiltered,
    sortState,
    page: filterPage,
    limit: filterLimit,
    setSearch,
    setCategory,
    setStatus,
    setCondition,
    setIncludeDecommissioned,
    setPage,
    setLimit,
    setSort,
    resetFilters,
  } = useAssetsFilters();

  const { data, isLoading, isError, error, refetch } = useAssetsList(params);

  const assets = data?.items ?? [];
  const totalCount = data?.total ?? 0;
  const page = data?.page ?? filterPage ?? 1;
  const pageSize = data?.limit ?? filterLimit ?? 10;

  const sorting: SortingState = sortState ? [sortState] : [];

  const handleSortingChange: OnChangeFn<SortingState> = (updaterOrValue) => {
    const nextSorting =
      typeof updaterOrValue === 'function' ? updaterOrValue(sorting) : updaterOrValue;
    if (nextSorting.length === 0) {
      setSort(undefined);
    } else {
      const first = nextSorting[0];
      if (first) {
        setSort({ id: first.id, desc: first.desc });
      }
    }
  };

  const handleViewDetails = (asset: FixedAssetVM) => {
    navigate(`/resources/assets/${asset.id}`);
  };

  const handleEdit = (asset: FixedAssetVM) => {
    navigate(`/resources/assets/${asset.id}/edit`);
  };

  const handleTransfer = (asset: FixedAssetVM) => {
    navigate(`/resources/assets/${asset.id}?action=transfer`);
  };

  const handleRecordMaintenance = (asset: FixedAssetVM) => {
    navigate(`/resources/assets/${asset.id}/maintenance`);
  };

  const handleViewHistory = (asset: FixedAssetVM) => {
    navigate(`/resources/assets/${asset.id}/history`);
  };

  const handleCommissionClick = () => {
    navigate('/resources/assets/new');
  };

  return (
    <CrudListLayout
      header={
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <CrudListHeader
              title="Fixed Assets"
              description="Track, audit, service, and balance-sheet value physical equipment and machinery assets."
            />
            <Badge variant="outline" className="hidden sm:inline-flex mt-1">
              Track C DataTable
            </Badge>
          </div>
        </div>
      }
      toolbar={
        <AssetFilterBar
          search={search}
          category={category}
          status={status}
          condition={condition}
          includeDecommissioned={includeDecommissioned}
          isFiltered={isFiltered}
          onSearchChange={setSearch}
          onCategoryChange={setCategory}
          onStatusChange={setStatus}
          onConditionChange={setCondition}
          onIncludeDecommissionedChange={setIncludeDecommissioned}
          onResetFilters={resetFilters}
          onCommissionClick={handleCommissionClick}
        />
      }
    >
      <div data-testid="assets-list-page">
        <AssetListTable
          assets={assets}
          totalCount={totalCount}
          page={page}
          pageSize={pageSize}
          onPageChange={setPage}
          onPageSizeChange={setLimit}
          sorting={sorting}
          onSortingChange={handleSortingChange}
          isLoading={isLoading}
          isError={isError}
          errorMessage={error?.message}
          onRetry={() => refetch()}
          isFiltered={isFiltered}
          onResetFilters={resetFilters}
          onViewDetails={handleViewDetails}
          onEdit={handleEdit}
          onTransfer={handleTransfer}
          onRecordMaintenance={handleRecordMaintenance}
          onViewHistory={handleViewHistory}
          onCommissionClick={handleCommissionClick}
        />
      </div>
    </CrudListLayout>
  );
};
