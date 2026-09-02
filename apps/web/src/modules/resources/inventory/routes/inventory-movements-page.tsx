import React from 'react';
import { useParams, Link } from 'react-router-dom';
import { Button, Badge, Skeleton } from '@kinergy-platform/ui';
import { ArrowLeft, History, Boxes, PackageCheck, AlertCircle } from 'lucide-react';
import { useInventoryProduct, useStockMovements, useMovementFilters } from '../hooks';
import {
  MovementHistorySummary,
  MovementHistoryFilterBar,
  MovementHistoryTable,
} from '../components';

export const InventoryMovementsPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();

  const { params, movementType, page, isFiltered, setMovementType, setPage, resetFilters } =
    useMovementFilters();

  // Queries
  const {
    data: product,
    isLoading: isProductLoading,
    isError: isProductError,
    error: productError,
    refetch: refetchProduct,
  } = useInventoryProduct(id);

  const {
    data: movementsData,
    isLoading: isMovementsLoading,
    isError: isMovementsError,
    error: movementsError,
    refetch: refetchMovements,
  } = useStockMovements(id, params);

  // 1. Loading Skeleton
  if (isProductLoading) {
    return (
      <div className="space-y-6 max-w-6xl mx-auto py-2" data-testid="inventory-movements-loading">
        <div className="flex items-center gap-3">
          <Skeleton className="h-8 w-28" />
          <Skeleton className="h-8 w-48" />
        </div>
        <Skeleton className="h-28 w-full" />
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  // 2. Product Not Found / Error
  if (isProductError || !product) {
    return (
      <div
        className="space-y-6 max-w-6xl mx-auto py-4"
        data-testid="inventory-movements-product-error"
      >
        <Button asChild variant="ghost" size="sm">
          <Link to="/resources/inventory">
            <ArrowLeft className="mr-1.5 h-4 w-4" /> Back to Catalog
          </Link>
        </Button>

        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-8 text-center">
          <AlertCircle className="mx-auto h-10 w-10 text-destructive mb-3" />
          <h2 className="text-lg font-semibold text-destructive">Product Not Found</h2>
          <p className="text-xs text-muted-foreground mt-1 max-w-md mx-auto">
            {productError?.message ||
              'The requested consumable product could not be located in the inventory ledger.'}
          </p>
          <Button
            variant="outline"
            size="sm"
            onClick={() => refetchProduct()}
            className="mt-4 text-xs"
          >
            Retry Product Lookup
          </Button>
        </div>
      </div>
    );
  }

  const movements = movementsData?.items ?? [];
  const totalCount = movementsData?.total ?? 0;
  const totalPages = movementsData?.totalPages ?? 1;

  return (
    <div className="space-y-6 max-w-6xl mx-auto py-2" data-testid="inventory-movements-page">
      {/* 1. Header & Navigation Context */}
      <div className="space-y-3">
        {/* Navigation Breadcrumbs / Back Link */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Button asChild variant="ghost" size="sm" className="h-7 px-2 text-xs">
              <Link to={`/resources/inventory/${product.id}`} data-testid="back-to-product-link">
                <ArrowLeft className="mr-1 h-3.5 w-3.5" /> Back to Product
              </Link>
            </Button>
            <span>/</span>
            <Link to="/resources/inventory" className="hover:underline flex items-center gap-1">
              <Boxes className="h-3 w-3" /> Catalog
            </Link>
            <span>/</span>
            <span className="font-mono text-foreground truncate max-w-[160px]">{product.sku}</span>
          </div>

          <Button asChild variant="outline" size="sm" className="h-7 text-xs gap-1">
            <Link to={`/resources/inventory/${product.id}`}>
              <PackageCheck className="h-3.5 w-3.5" /> Product Details
            </Link>
          </Button>
        </div>

        {/* Page Identity Block */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pt-1">
          <div>
            <div className="flex items-center gap-2">
              <History className="h-6 w-6 text-primary" />
              <h1 className="text-2xl font-bold tracking-tight text-foreground">
                Stock Movement Ledger
              </h1>
              <Badge variant="outline" className="font-mono text-xs">
                {product.sku}
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Chronological, immutable audit ledger of all receipts, sales, consumptions, and
              physical cycle count adjustments for{' '}
              <span className="font-semibold text-foreground">{product.name}</span>.
            </p>
          </div>
        </div>
      </div>

      {/* 2. Operational Story Reconstructor Summary */}
      <MovementHistorySummary product={product} movements={movements} />

      {/* 3. Filter Bar (URL-Synchronized) */}
      <MovementHistoryFilterBar
        movementType={movementType}
        isFiltered={isFiltered}
        onMovementTypeChange={setMovementType}
        onResetFilters={resetFilters}
      />

      {/* 4. Movements Ledger Table */}
      <MovementHistoryTable
        movements={movements}
        unitOfMeasure={product.unitOfMeasure}
        isLoading={isMovementsLoading}
        isError={isMovementsError}
        errorMessage={movementsError?.message}
        page={page}
        totalPages={totalPages}
        totalCount={totalCount}
        onPageChange={setPage}
        onRetry={() => refetchMovements()}
        isFiltered={isFiltered}
        onClearFilters={resetFilters}
      />
    </div>
  );
};
