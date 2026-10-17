import React from 'react';
import { Link } from 'react-router-dom';
import { Button, Badge } from '@kinergy-platform/ui';
import { RefreshCw, X, ShoppingBag } from 'lucide-react';
import { usePaymentFilters } from '../hooks/use-payment-filters';
import { usePaymentsList } from '../hooks/use-sales-queries';
import { PaymentStatusBadge } from '../components/payment-status-badge';
import { PaymentMethodBadge } from '../components/payment-method-badge';
import { MoneyDisplay } from '../components/money-display';
import {
  VALID_PAYMENT_METHODS,
  VALID_PAYMENT_STATUSES,
  type PaymentMethod,
  type PaymentStatus,
} from '../types/payments.types';

export const PaymentHistoryPage: React.FC = () => {
  const { params, page, status, method, isFiltered, setPage, setStatus, setMethod, resetFilters } =
    usePaymentFilters();

  const { data, isLoading, isError, refetch } = usePaymentsList(params);

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
            <Link to="/sales/list">
              <ShoppingBag className="mr-1.5 h-4 w-4" /> View Sales Orders
            </Link>
          </Button>
        </div>
      </div>

      {/* Filter Controls */}
      <div className="flex flex-wrap gap-3 items-center justify-between">
        <div className="flex items-center gap-2">
          {/* Status Filter */}
          <select
            value={status || 'ALL'}
            onChange={(e) => setStatus(e.target.value as PaymentStatus | 'ALL')}
            className="h-9 rounded-md border border-input bg-background px-3 py-1 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
            data-testid="payment-status-filter"
          >
            <option value="ALL">All Statuses</option>
            {VALID_PAYMENT_STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>

          {/* Method Filter */}
          <select
            value={method || 'ALL'}
            onChange={(e) => setMethod(e.target.value as PaymentMethod | 'ALL')}
            className="h-9 rounded-md border border-input bg-background px-3 py-1 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
            data-testid="payment-method-filter"
          >
            <option value="ALL">All Tender Methods</option>
            {VALID_PAYMENT_METHODS.map((m) => (
              <option key={m} value={m}>
                {m}
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

      {/* Table */}
      <div className="rounded-md border border-border bg-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-muted/40 text-xs font-medium text-muted-foreground uppercase border-b border-border">
              <tr>
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3">Payment ID</th>
                <th className="px-4 py-3">Sale ID</th>
                <th className="px-4 py-3">Method</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Amount</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {isLoading ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">
                    Loading payments history...
                  </td>
                </tr>
              ) : isError ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-destructive">
                    Failed to load payments history.
                  </td>
                </tr>
              ) : data?.items.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">
                    No payment tenders found matching criteria.
                  </td>
                </tr>
              ) : (
                data?.items.map((payment) => (
                  <tr key={payment.id} className="hover:bg-muted/30 transition-colors">
                    <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">
                      {new Date(payment.createdAt).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs">
                      <Link
                        to={`/sales/payments/${payment.id}`}
                        className="hover:underline text-primary"
                      >
                        {payment.id}
                      </Link>
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-muted-foreground">
                      <Link to={`/sales/${payment.saleId}`} className="hover:underline">
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
                      <Button asChild variant="ghost" size="sm">
                        <Link to={`/sales/payments/${payment.id}`}>Inspect</Link>
                      </Button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {data && data.totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-border text-xs text-muted-foreground">
            <div>
              Page {data.page} of {data.totalPages} ({data.total} payments)
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
