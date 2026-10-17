import React from 'react';
import { Link } from 'react-router-dom';
import { Button, Input, Badge } from '@kinergy-platform/ui';
import { PlusCircle, Search, RefreshCw, X, ArrowUpDown } from 'lucide-react';
import { useSalesFilters } from '../hooks/use-sales-filters';
import { useSalesList } from '../hooks/use-sales-queries';
import { SaleStatusBadge } from '../components/sale-status-badge';
import { MoneyDisplay } from '../components/money-display';
import { HasPermission } from '../../../app/routes/permission-guard';
import { VALID_SALE_STATUSES, type SaleStatus } from '../types/sales-query.types';

export const SalesListPage: React.FC = () => {
  const {
    params,
    q,
    page,
    filters,
    isFiltered,
    setSearch,
    setPage,
    setStatus,
    toggleSort,
    resetFilters,
  } = useSalesFilters();

  const { data, isLoading, isError, refetch } = useSalesList(params);

  return (
    <div className="space-y-6" data-testid="sales-list-page">
      {/* 1. Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-3xl font-bold tracking-tight text-foreground">Sales Orders</h1>
            <Badge variant="outline" className="hidden sm:inline-flex">
              Orders Directory
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            Browse, search, and manage all commercial checkout agreements.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <Button
            variant="outline"
            size="sm"
            onClick={() => refetch()}
            disabled={isLoading}
            className="h-8 text-xs gap-1.5"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>

          <HasPermission name="sales.create">
            <Button asChild variant="default" size="sm">
              <Link to="/sales/new">
                <PlusCircle className="mr-1.5 h-4 w-4" /> Create Sale
              </Link>
            </Button>
          </HasPermission>
        </div>
      </div>

      {/* 2. Filters Toolbar */}
      <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between">
        <div className="flex flex-1 items-center gap-2 max-w-sm">
          <div className="relative w-full">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              type="text"
              placeholder="Search by sale ID or source..."
              value={q}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 h-9 text-sm"
              data-testid="sales-search-input"
            />
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Status Filter */}
          <select
            value={filters.status || 'ALL'}
            onChange={(e) => setStatus(e.target.value as SaleStatus | 'ALL')}
            className="h-9 rounded-md border border-input bg-background px-3 py-1 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
            data-testid="sales-status-filter"
          >
            <option value="ALL">All Statuses</option>
            {VALID_SALE_STATUSES.map((status) => (
              <option key={status} value={status}>
                {status}
              </option>
            ))}
          </select>

          {isFiltered && (
            <Button
              variant="ghost"
              size="sm"
              onClick={resetFilters}
              className="h-9 px-2 text-xs gap-1"
            >
              <X className="h-3.5 w-3.5" /> Clear Filters
            </Button>
          )}
        </div>
      </div>

      {/* 3. Sales Table */}
      <div className="rounded-md border border-border bg-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-muted/40 text-xs font-medium text-muted-foreground uppercase border-b border-border">
              <tr>
                <th
                  className="px-4 py-3 cursor-pointer select-none"
                  onClick={() => toggleSort('createdAt')}
                >
                  <div className="flex items-center gap-1">
                    Date <ArrowUpDown className="h-3 w-3" />
                  </div>
                </th>
                <th className="px-4 py-3">Sale ID</th>
                <th className="px-4 py-3">Client</th>
                <th
                  className="px-4 py-3 cursor-pointer select-none"
                  onClick={() => toggleSort('status')}
                >
                  <div className="flex items-center gap-1">
                    Status <ArrowUpDown className="h-3 w-3" />
                  </div>
                </th>
                <th className="px-4 py-3">Items</th>
                <th
                  className="px-4 py-3 cursor-pointer select-none text-right"
                  onClick={() => toggleSort('total')}
                >
                  <div className="flex items-center justify-end gap-1">
                    Total Amount <ArrowUpDown className="h-3 w-3" />
                  </div>
                </th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {isLoading ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">
                    Loading sales records...
                  </td>
                </tr>
              ) : isError ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-destructive">
                    Failed to load sales list.
                  </td>
                </tr>
              ) : data?.items.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">
                    No sales matching current criteria.
                  </td>
                </tr>
              ) : (
                data?.items.map((sale) => (
                  <tr key={sale.id} className="hover:bg-muted/30 transition-colors">
                    <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">
                      {new Date(sale.createdAt).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3 font-mono font-medium text-primary">
                      <Link to={`/sales/${sale.id}`} className="hover:underline">
                        {sale.id}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {sale.clientId || 'Walk-in'}
                    </td>
                    <td className="px-4 py-3">
                      <SaleStatusBadge status={sale.status} />
                    </td>
                    <td className="px-4 py-3 font-mono">{sale.itemCount}</td>
                    <td className="px-4 py-3 text-right font-medium">
                      <MoneyDisplay value={sale.total} />
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Button asChild variant="ghost" size="sm">
                        <Link to={`/sales/${sale.id}`}>View</Link>
                      </Button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Bar */}
        {data && data.totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-border text-xs text-muted-foreground">
            <div>
              Page {data.page} of {data.totalPages} ({data.total} orders)
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage(page - 1)}
                disabled={!data.hasPreviousPage}
                className="h-7 text-xs"
              >
                Previous
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage(page + 1)}
                disabled={!data.hasNextPage}
                className="h-7 text-xs"
              >
                Next
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
