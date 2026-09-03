import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { OnChangeFn, SortingState } from '@tanstack/react-table';
import { Badge } from '@kinergy-platform/ui';
import { CrudListHeader, CrudListLayout } from '../../../../shared/crud';
import { useInventoryFilters, useInventoryList, useActivateProduct } from '../hooks';
import { InventoryFilterBar, InventoryListTable, ArchiveProductDialog } from '../components';
import type { InventoryProductVM } from '../types';

export const InventoryListPage: React.FC = () => {
  const navigate = useNavigate();

  const {
    params,
    search,
    category,
    status,
    stockStatus,
    includeArchived,
    isFiltered,
    sortState,
    setSearch,
    setCategory,
    setStatus,
    setStockStatus,
    setIncludeArchived,
    setPage,
    setLimit,
    setSort,
    resetFilters,
  } = useInventoryFilters();

  const { data, isLoading, isError, error, refetch } = useInventoryList(params);
  const { mutate: activateProduct } = useActivateProduct();

  const products = data?.items ?? [];
  const totalCount = data?.total ?? 0;
  const page = data?.page ?? 1;
  const pageSize = data?.limit ?? 10;

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

  const handleViewDetails = (product: InventoryProductVM) => {
    navigate(`/resources/inventory/${product.id}`);
  };

  const handleEdit = (product: InventoryProductVM) => {
    navigate(`/resources/inventory/${product.id}/edit`);
  };

  const handleReceiveStock = (product: InventoryProductVM) => {
    navigate(`/resources/inventory/${product.id}?action=receive`);
  };

  const handleSellStock = (product: InventoryProductVM) => {
    navigate(`/resources/inventory/${product.id}?action=sell`);
  };

  const handleConsumeStock = (product: InventoryProductVM) => {
    navigate(`/resources/inventory/${product.id}?action=consume`);
  };

  const handleScrapStock = (product: InventoryProductVM) => {
    navigate(`/resources/inventory/${product.id}?action=scrap`);
  };

  const [archiveDialogOpen, setArchiveDialogOpen] = useState(false);
  const [productToArchive, setProductToArchive] = useState<InventoryProductVM | null>(null);

  const handleAdjustStock = (product: InventoryProductVM) => {
    navigate(`/resources/inventory/${product.id}?action=adjust`);
  };

  const handleArchive = (product: InventoryProductVM) => {
    setProductToArchive(product);
    setArchiveDialogOpen(true);
  };

  const handleActivate = (product: InventoryProductVM) => {
    activateProduct(product.id);
  };

  return (
    <CrudListLayout
      header={
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <CrudListHeader
              title="Consumable Inventory"
              description="Live catalog of consumable supplies, retail merchandise, and nutritional products."
            />
            <Badge variant="outline" className="hidden sm:inline-flex mt-1">
              Track C DataTable
            </Badge>
          </div>
        </div>
      }
      toolbar={
        <InventoryFilterBar
          search={search}
          category={category}
          status={status}
          stockStatus={stockStatus}
          includeArchived={includeArchived}
          isFiltered={isFiltered}
          onSearchChange={setSearch}
          onCategoryChange={setCategory}
          onStatusChange={setStatus}
          onStockStatusChange={setStockStatus}
          onIncludeArchivedChange={setIncludeArchived}
          onResetFilters={resetFilters}
          onRegisterClick={() => navigate('/resources/inventory/new')}
        />
      }
    >
      <div data-testid="inventory-list-page">
        <InventoryListTable
          products={products}
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
          onReceiveStock={handleReceiveStock}
          onSellStock={handleSellStock}
          onConsumeStock={handleConsumeStock}
          onScrapStock={handleScrapStock}
          onAdjustStock={handleAdjustStock}
          onArchive={handleArchive}
          onActivate={handleActivate}
          onCreateClick={() => navigate('/resources/inventory/new')}
        />
      </div>

      <ArchiveProductDialog
        product={productToArchive}
        open={archiveDialogOpen}
        onOpenChange={setArchiveDialogOpen}
      />
    </CrudListLayout>
  );
};
