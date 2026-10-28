import React, { useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Button, Badge, Input } from '@kinergy-platform/ui';
import { RefreshCw, X, ShoppingBag, AlertCircle, Calendar, Hash } from 'lucide-react';
import { usePaymentFilters } from '../hooks/use-payment-filters';
import { usePaymentsList } from '../hooks/use-sales-queries';
import { PaymentStatusBadge } from '../components/payment-status-badge';
import { PaymentMethodBadge } from '../components/payment-method-badge';
import { MoneyDisplay } from '../components/money-display';
import { useAuth } from '../../../app/providers/auth-provider';
import { ForbiddenView } from '../../../app/routes/fallback-views';
import { SALES_ROUTES } from '../routes/sales-routes';
import {
  VALID_PAYMENT_METHODS,
  VALID_PAYMENT_STATUSES,
  type PaymentMethod,
  type PaymentStatus,
} from '../types/payments.types';

export const PaymentHistoryPage: React.FC = () => {
  const auth = useAuth();
  const location = useLocation();

  // Permission verification: payments.read (or payments.manage)
  const canRead = Boolean(
    typeof auth.hasPermission === 'function'
      ? auth.hasPermission('payments.read')
      : auth.currentUser?.permissions?.includes('payments.read'),
  );

  const {
    params,
    page,
    status,
    method,
    saleId,
    fromDate,
    toDate,
    isFiltered,
    setPage,
    setStatus,
    setMethod,
    setSaleId,
    setDateRange,
    resetFilters,
  } = usePaymentFilters();

  const { data, isLoading, isError, error, refetch } = usePaymentsList(params, {
    enabled: canRead,
  });

  // Clamp pagination when filter changes make current page exceed totalPages
  useEffect(() => {
    if (data && data.totalPages > 0 && page > data.totalPages) {
      setPage(data.totalPages);
    }
  }, [data, page, setPage]);

  if (!canRead) {
    return (
      <ForbiddenView message="Access Denied: Missing required permission 'payments.read' to view payment tenders." />
    );
  }

  return (
    <div className="space-y-6" data-testid="payment-history-page">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-3xl font-bold tracking-tight text-foreground">
              Payment Tenders History
            </h1>
            <Badge variant="outline" className="hidden sm:inline-flex">
              Financial Audit
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            Chronological audit log of all payment tenders registered across sales orders.
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

          <Button asChild variant="outline" size="sm">
            <Link to={SALES_ROUTES.list()}>
              <ShoppingBag className="mr-1.5 h-4 w-4" /> View Sales Orders
            </Link>
          </Button>
        </div>
      </div>

      {/* Accounting Notice */}
      <div className="rounded-md border border-border/80 bg-muted/30 px-3.5 py-2.5 text-xs text-muted-foreground flex items-center gap-2">
        <span className="font-semibold text-foreground uppercase tracking-wider text-[11px]">
          Accounting Notice:
        </span>
        <span>
          Payment records reflect individual settlement tenders. Pending, failed, or cancelled
          tenders do not represent collected cash or recognized revenue.
        </span>
      </div>

      {/* Filter Controls Bar */}
      <div className="rounded-lg border border-border bg-card p-3 space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          {/* Status Filter */}
          <div className="flex items-center gap-1.5">
            <span className="text-xs font-medium text-muted-foreground">Status:</span>
            <select
              id="payment-status-filter"
              aria-label="Filter by payment status"
              value={status || 'ALL'}
              onChange={(e) => setStatus(e.target.value as PaymentStatus | 'ALL')}
              className="h-8 rounded-md border border-input bg-background px-2.5 py-1 text-xs ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
              data-testid="payment-status-filter"
            >
              <option value="ALL">All Statuses</option>
              {VALID_PAYMENT_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>

          {/* Method Filter */}
          <div className="flex items-center gap-1.5">
            <span className="text-xs font-medium text-muted-foreground">Method:</span>
            <select
              id="payment-method-filter"
              aria-label="Filter by payment tender method"
              value={method || 'ALL'}
              onChange={(e) => setMethod(e.target.value as PaymentMethod | 'ALL')}
              className="h-8 rounded-md border border-input bg-background px-2.5 py-1 text-xs ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
              data-testid="payment-method-filter"
            >
              <option value="ALL">All Tender Methods</option>
              {VALID_PAYMENT_METHODS.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </div>

          <div className="h-4 w-px bg-border hidden sm:block" />

          {/* Sale ID Filter */}
          <div className="flex items-center gap-1.5">
            <Hash className="h-3.5 w-3.5 text-muted-foreground" />
            <Input
              type="text"
              id="payment-sale-id-filter"
              aria-label="Filter by Sale ID"
              placeholder="Filter by Sale ID..."
              value={saleId || ''}
              onChange={(e) => setSaleId(e.target.value || undefined)}
              className="h-8 w-44 text-xs px-2.5"
              data-testid="payment-sale-id-filter"
            />
          </div>

          <div className="h-4 w-px bg-border hidden sm:block" />

          {/* Date Range: From */}
          <div className="flex items-center gap-1.5">
            <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="text-xs text-muted-foreground">From:</span>
            <Input
              type="date"
              id="payment-from-date-filter"
              aria-label="Filter from date"
              value={fromDate ? fromDate.slice(0, 10) : ''}
              onChange={(e) => {
                const val = e.target.value ? new Date(e.target.value).toISOString() : undefined;
                setDateRange(val, toDate);
              }}
              className="h-8 w-36 text-xs px-2"
              data-testid="payment-from-date-filter"
            />
          </div>

          {/* Date Range: To */}
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-muted-foreground">To:</span>
            <Input
              type="date"
              id="payment-to-date-filter"
              aria-label="Filter to date"
              value={toDate ? toDate.slice(0, 10) : ''}
              onChange={(e) => {
                const val = e.target.value
                  ? new Date(`${e.target.value}T23:59:59.999Z`).toISOString()
                  : undefined;
                setDateRange(fromDate, val);
              }}
              className="h-8 w-36 text-xs px-2"
              data-testid="payment-to-date-filter"
            />
          </div>

          {/* Clear Filters Button */}
          {isFiltered && (
            <Button
              variant="ghost"
              size="sm"
              onClick={resetFilters}
              className="h-8 px-2.5 text-xs gap-1 ml-auto"
              data-testid="payment-clear-filters"
            >
              <X className="h-3.5 w-3.5" /> Clear Filters
            </Button>
          )}
        </div>
      </div>

      {/* Tenders Table */}
      <div className="rounded-md border border-border bg-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left" aria-label="Payment tenders history">
            <thead className="bg-muted/40 text-xs font-medium text-muted-foreground uppercase border-b border-border">
              <tr>
                <th scope="col" className="px-4 py-3">
                  Date & Time
                </th>
                <th scope="col" className="px-4 py-3">
                  Payment ID
                </th>
                <th scope="col" className="px-4 py-3">
                  Sale ID
                </th>
                <th scope="col" className="px-4 py-3">
                  Method
                </th>
                <th scope="col" className="px-4 py-3">
                  Status
                </th>
                <th scope="col" className="px-4 py-3 text-right">
                  Amount
                </th>
                <th scope="col" className="px-4 py-3 text-right">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {isLoading ? (
                <tr>
                  <td
                    colSpan={7}
                    className="px-4 py-12 text-center text-muted-foreground"
                    data-testid="payment-history-loading"
                  >
                    <RefreshCw className="h-5 w-5 animate-spin mx-auto mb-2 text-primary" />
                    Loading payment tenders history...
                  </td>
                </tr>
              ) : isError ? (
                <tr>
                  <td
                    colSpan={7}
                    className="px-4 py-8 text-center text-destructive"
                    data-testid="payment-history-error"
                  >
                    <AlertCircle className="h-5 w-5 mx-auto mb-1.5 text-destructive" />
                    <p className="font-medium">Failed to load payments history.</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {error?.message || 'Server error occurred while retrieving payments.'}
                    </p>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => refetch()}
                      className="mt-3 text-xs"
                    >
                      Retry
                    </Button>
                  </td>
                </tr>
              ) : data?.items.length === 0 ? (
                <tr>
                  <td
                    colSpan={7}
                    className="px-4 py-8 text-center text-muted-foreground"
                    data-testid={
                      isFiltered ? 'payment-history-filtered-empty' : 'payment-history-empty'
                    }
                  >
                    <p className="font-medium text-foreground">
                      {isFiltered
                        ? 'No payment tenders match the selected criteria.'
                        : 'No payment tenders recorded yet.'}
                    </p>
                    {isFiltered ? (
                      <p className="text-xs mt-1">Try modifying or clearing your search filters.</p>
                    ) : (
                      <p className="text-xs mt-1">
                        Payments will appear here once registered against commercial orders.
                      </p>
                    )}
                    {isFiltered && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={resetFilters}
                        className="mt-3 text-xs"
                      >
                        Clear Filters
                      </Button>
                    )}
                  </td>
                </tr>
              ) : (
                data?.items.map((payment) => (
                  <tr key={payment.id} className="hover:bg-muted/30 transition-colors">
                    <td className="px-4 py-3 text-muted-foreground whitespace-nowrap text-xs">
                      {new Date(payment.createdAt).toLocaleString()}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs">
                      <Link
                        to={SALES_ROUTES.paymentDetail(payment.id)}
                        state={{ from: location.pathname + location.search }}
                        className="hover:underline text-primary font-medium"
                      >
                        {payment.id}
                      </Link>
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-muted-foreground">
                      <Link
                        to={SALES_ROUTES.detail(payment.saleId)}
                        state={{ from: location.pathname + location.search }}
                        className="hover:underline hover:text-foreground"
                      >
                        {payment.saleId}
                      </Link>
                    </td>
                    <td className="px-4 py-3">
                      <PaymentMethodBadge method={payment.method} />
                    </td>
                    <td className="px-4 py-3">
                      <PaymentStatusBadge status={payment.status} />
                    </td>
                    <td className="px-4 py-3 text-right font-medium">
                      <MoneyDisplay value={payment.amount} />
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Button asChild variant="ghost" size="sm" className="h-7 text-xs">
                        <Link
                          to={SALES_ROUTES.paymentDetail(payment.id)}
                          state={{ from: location.pathname + location.search }}
                          aria-label={`Inspect payment tender ${payment.id}`}
                        >
                          Inspect
                        </Link>
                      </Button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Controls */}
        {data && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-border text-xs text-muted-foreground">
            <div>
              Page {data.page} of {data.totalPages || 1} ({data.total}{' '}
              {data.total === 1 ? 'tender' : 'tenders'} total)
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage(page - 1)}
                disabled={!data.hasPreviousPage}
                className="h-7 text-xs"
                data-testid="payment-pagination-prev"
              >
                Previous
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage(page + 1)}
                disabled={!data.hasNextPage}
                className="h-7 text-xs"
                data-testid="payment-pagination-next"
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
