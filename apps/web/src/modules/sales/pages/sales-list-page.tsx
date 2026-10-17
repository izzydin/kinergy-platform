import React, { useCallback, useEffect, useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import type { OnChangeFn, SortingState } from '@tanstack/react-table';
import { Button, Badge } from '@kinergy-platform/ui';
import { PlusCircle, LayoutDashboard, CreditCard } from 'lucide-react';
import { useSalesFilters } from '../hooks/use-sales-filters';
import { useSalesList } from '../hooks/use-sales-queries';
import { SalesFilterBar } from '../components/sales-filter-bar';
import { SalesListTable } from '../components/sales-list-table';
import { HasPermission } from '../../../app/routes/permission-guard';
import type { SaleSortField, SaleStatus } from '../types/sales-query.types';

export const SalesListPage: React.FC = () => {
  const navigate = useNavigate();
  const {
    params,
    q,
    page,
    limit,
    filters,
    sortState,
    isFiltered,
    setSearch,
    setPage,
    setLimit,
    setSort,
    setStatus,
    setSourceType,
    setClientId,
    setDateRange,
    resetFilters,
  } = useSalesFilters();

  const { data, isLoading, isFetching, isError, error, refetch } = useSalesList(params);

  // Requirement 4: Reset or adjust pagination when filter changes make current page invalid
  useEffect(() => {
    if (data && data.totalPages > 0 && page > data.totalPages) {
      setPage(data.totalPages);
    }
  }, [data, page, setPage]);

  // Adapt TanStack table sorting changes to useSalesFilters setSort
  const handleSortingChange: OnChangeFn<SortingState> = useCallback(
    (updaterOrValue) => {
      const nextSorting =
        typeof updaterOrValue === 'function' ? updaterOrValue(sortState) : updaterOrValue;

      if (!nextSorting || nextSorting.length === 0 || !nextSorting[0]) {
        setSort(undefined);
      } else {
        const primary = nextSorting[0];
        const field = primary.id as SaleSortField;
        const direction = primary.desc ? 'desc' : 'asc';
        setSort(`${field}.${direction}`);
      }
    },
    [sortState, setSort],
  );

  const toolbar = useMemo(
    () => (
      <SalesFilterBar
        search={q}
        status={filters.status}
        sourceType={filters.sourceType}
        clientId={filters.clientId}
        fromDate={filters.fromDate}
        toDate={filters.toDate}
        isFiltered={isFiltered}
        onSearchChange={(query) => setSearch(query)}
        onStatusChange={(newStatus?: SaleStatus) => setStatus(newStatus ?? 'ALL')}
        onSourceTypeChange={(newSource?: string) => setSourceType(newSource)}
        onClientIdChange={(newClient?: string) => setClientId(newClient)}
        onDateRangeChange={(from?: string, to?: string) => setDateRange(from, to)}
        onResetFilters={resetFilters}
        onRefresh={() => refetch()}
        isRefreshing={isFetching}
      />
    ),
    [
      q,
      filters.status,
      filters.sourceType,
      filters.clientId,
      filters.fromDate,
      filters.toDate,
      isFiltered,
      setSearch,
      setStatus,
      setSourceType,
      setClientId,
      setDateRange,
      resetFilters,
      refetch,
      isFetching,
    ],
  );

  return (
    <div className="space-y-6" data-testid="sales-list-page">
      {/* 1. Header Bar */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-3xl font-bold tracking-tight text-foreground">Sales Directory</h1>
            <Badge variant="outline" className="hidden sm:inline-flex">
              Orders Log
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            Browse, search, and audit commercial sales agreements with real-time status tracking.
          </p>
        </div>

        {/* Global Navigation and Action Buttons */}
        <div className="flex flex-wrap items-center gap-2.5">
          <Button asChild variant="outline" size="sm" className="h-8 text-xs gap-1.5">
            <Link to="/sales">
              <LayoutDashboard className="h-3.5 w-3.5" /> Overview
            </Link>
          </Button>

          <Button asChild variant="outline" size="sm" className="h-8 text-xs gap-1.5">
            <Link to="/sales/payments">
              <CreditCard className="h-3.5 w-3.5" /> Payments
            </Link>
          </Button>

          <HasPermission name="sales.create">
            <Button asChild variant="default" size="sm" className="h-8 text-xs gap-1.5">
              <Link to="/sales/new">
                <PlusCircle className="h-3.5 w-3.5" /> Create Sale
              </Link>
            </Button>
          </HasPermission>
        </div>
      </div>

      {/* 2. Accessible, Filterable DataTable */}
      <SalesListTable
        sales={data?.items ?? []}
        totalCount={data?.total ?? 0}
        page={page}
        pageSize={limit}
        onPageChange={setPage}
        onPageSizeChange={setLimit}
        sorting={sortState}
        onSortingChange={handleSortingChange}
        isLoading={isLoading}
        isFetching={isFetching}
        isError={isError}
        errorMessage={error instanceof Error ? error.message : undefined}
        onRetry={() => refetch()}
        isFiltered={isFiltered}
        onResetFilters={resetFilters}
        toolbar={toolbar}
        onCreateClick={() => navigate('/sales/new')}
      />
    </div>
  );
};
