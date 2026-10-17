import React from 'react';
import { Link } from 'react-router-dom';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Button,
  Badge,
} from '@kinergy-platform/ui';
import {
  ShoppingBag,
  CreditCard,
  Clock,
  CheckCircle2,
  PlusCircle,
  RefreshCw,
  ArrowRight,
  Receipt,
  AlertCircle,
  FileText,
} from 'lucide-react';
import { useSalesOverviewMetrics } from '../hooks/use-sales-queries';
import { HasPermission } from '../../../app/routes/permission-guard';
import { SaleStatusBadge } from '../components/sale-status-badge';
import { MoneyDisplay } from '../components/money-display';
import type { SaleStatus } from '../types/sales-query.types';

export const SalesOverviewPage: React.FC = () => {
  const {
    isLoading,
    isError,
    pendingPaymentsCount,
    draftsCount,
    settledSalesCount,
    recentSales,
    refetchAll,
  } = useSalesOverviewMetrics();

  return (
    <div className="space-y-6" data-testid="sales-overview-page">
      {/* 1. Header Block */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-3xl font-bold tracking-tight text-foreground">
              Sales & Payments Overview
            </h1>
            <Badge variant="outline" className="hidden sm:inline-flex">
              Financial Hub
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            Commercial checkout agreements, order lifecycles, and recent sales activity.
          </p>
        </div>

        {/* Action Controls */}
        <div className="flex flex-wrap items-center gap-2.5">
          <Button
            variant="outline"
            size="sm"
            onClick={() => refetchAll()}
            disabled={isLoading}
            data-testid="refresh-sales-overview-btn"
            className="h-8 text-xs gap-1.5"
            aria-label="Refresh sales overview"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>

          <Button asChild variant="outline" size="sm" className="h-8 text-xs gap-1.5">
            <Link to="/sales/list">
              <ShoppingBag className="h-3.5 w-3.5" /> All Sales
            </Link>
          </Button>

          <Button asChild variant="outline" size="sm" className="h-8 text-xs gap-1.5">
            <Link to="/sales/payments">
              <CreditCard className="h-3.5 w-3.5" /> Payment History
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

      {/* 2. Operational Metrics Cards (Direct counts from backed queries) */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {/* Awaiting Payment Count */}
        <Card className="border-border bg-card">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Awaiting Payment
            </CardTitle>
            <Clock className="h-4 w-4 text-amber-500" />
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="h-8 w-16 animate-pulse rounded bg-muted" />
            ) : (
              <div className="text-2xl font-bold font-mono" data-testid="kpi-pending-payments">
                {pendingPaymentsCount}
              </div>
            )}
            <p className="text-xs text-muted-foreground mt-1">
              Finalized checkout agreements pending payment settlement
            </p>
            <div className="mt-3">
              <Link
                to="/sales/list?status=PENDING_PAYMENT"
                className="text-xs font-medium text-primary hover:underline inline-flex items-center gap-1"
              >
                View pending orders <ArrowRight className="h-3 w-3" />
              </Link>
            </div>
          </CardContent>
        </Card>

        {/* Draft Sessions Count */}
        <Card className="border-border bg-card">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Draft Checkout Sessions
            </CardTitle>
            <FileText className="h-4 w-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="h-8 w-16 animate-pulse rounded bg-muted" />
            ) : (
              <div className="text-2xl font-bold font-mono" data-testid="kpi-draft-sales">
                {draftsCount}
              </div>
            )}
            <p className="text-xs text-muted-foreground mt-1">
              Open carts and checkout drafts in preparation
            </p>
            <div className="mt-3">
              <Link
                to="/sales/list?status=DRAFT"
                className="text-xs font-medium text-primary hover:underline inline-flex items-center gap-1"
              >
                View draft orders <ArrowRight className="h-3 w-3" />
              </Link>
            </div>
          </CardContent>
        </Card>

        {/* Settled / Paid Count */}
        <Card className="border-border bg-card">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Settled Sales
            </CardTitle>
            <CheckCircle2 className="h-4 w-4 text-emerald-500" />
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="h-8 w-16 animate-pulse rounded bg-muted" />
            ) : (
              <div
                className="text-2xl font-bold font-mono text-emerald-600 dark:text-emerald-400"
                data-testid="kpi-settled-sales"
              >
                {settledSalesCount}
              </div>
            )}
            <p className="text-xs text-muted-foreground mt-1">
              Fully tendered sales ready for receipt issuance
            </p>
            <div className="mt-3">
              <Link
                to="/sales/list?status=PAID"
                className="text-xs font-medium text-emerald-600 dark:text-emerald-400 hover:underline inline-flex items-center gap-1"
              >
                View paid orders <ArrowRight className="h-3 w-3" />
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* 3. Financial Integrity Disclosure / Guidance Callout */}
      <div className="rounded-lg border border-border bg-muted/30 p-4 text-xs text-muted-foreground flex items-start gap-3">
        <Receipt className="h-4 w-4 text-primary shrink-0 mt-0.5" />
        <div className="space-y-1">
          <p className="font-semibold text-foreground">
            Authoritative Financial Reporting Disclosure
          </p>
          <p>
            To guarantee zero floating-point drift and adhere to strict accounting standards,
            business-wide gross revenue, tax reporting, and net cash flow are never aggregated from
            paginated sales lists. Individual sales calculate authoritative monetary totals upon
            finalization. For settlement audit logs and payment reconciliation, refer to the{' '}
            <Link to="/sales/payments" className="text-primary underline font-medium">
              Payment History Ledger
            </Link>
            .
          </p>
        </div>
      </div>

      {/* 4. Quick Action Shortcuts */}
      <div className="grid gap-3 sm:grid-cols-3">
        <HasPermission name="sales.create">
          <Link
            to="/sales/new"
            className="flex items-center gap-3 p-3.5 rounded-lg border border-border bg-card hover:border-primary/50 hover:bg-accent/40 transition-colors group"
          >
            <div className="p-2 rounded-md bg-primary/10 text-primary group-hover:bg-primary group-hover:text-primary-foreground transition-colors">
              <PlusCircle className="h-4 w-4" />
            </div>
            <div>
              <div className="text-sm font-semibold text-foreground">Create New Sale</div>
              <div className="text-xs text-muted-foreground">Start commercial checkout</div>
            </div>
          </Link>
        </HasPermission>

        <Link
          to="/sales/list"
          className="flex items-center gap-3 p-3.5 rounded-lg border border-border bg-card hover:border-primary/50 hover:bg-accent/40 transition-colors group"
        >
          <div className="p-2 rounded-md bg-secondary text-secondary-foreground group-hover:bg-primary group-hover:text-primary-foreground transition-colors">
            <ShoppingBag className="h-4 w-4" />
          </div>
          <div>
            <div className="text-sm font-semibold text-foreground">Sales Directory</div>
            <div className="text-xs text-muted-foreground">Search and filter all orders</div>
          </div>
        </Link>

        <Link
          to="/sales/payments"
          className="flex items-center gap-3 p-3.5 rounded-lg border border-border bg-card hover:border-primary/50 hover:bg-accent/40 transition-colors group"
        >
          <div className="p-2 rounded-md bg-secondary text-secondary-foreground group-hover:bg-primary group-hover:text-primary-foreground transition-colors">
            <CreditCard className="h-4 w-4" />
          </div>
          <div>
            <div className="text-sm font-semibold text-foreground">Payment History</div>
            <div className="text-xs text-muted-foreground">Audit payment settlements</div>
          </div>
        </Link>
      </div>

      {/* 5. Recent Sales Agreements Section */}
      <Card className="border-border bg-card">
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-lg">Recent Commercial Agreements</CardTitle>
            <CardDescription>
              Most recently initiated commercial checkouts and orders.
            </CardDescription>
          </div>
          <Button asChild variant="ghost" size="sm" className="text-xs gap-1">
            <Link to="/sales/list">
              <span>View full directory</span>
              <ArrowRight className="h-3 w-3" />
            </Link>
          </Button>
        </CardHeader>
        <CardContent>
          {isError ? (
            <div
              className="flex items-center gap-3 p-4 rounded-md border border-destructive/20 bg-destructive/10 text-destructive text-sm"
              data-testid="sales-overview-error"
            >
              <AlertCircle className="h-5 w-5 shrink-0" />
              <div className="flex-1">
                <span className="font-medium">Failed to retrieve sales records.</span>
                <span className="block text-xs mt-0.5 opacity-90">
                  Please verify your connection and permissions, then try again.
                </span>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => refetchAll()}
                className="h-8 text-xs border-destructive/30 hover:bg-destructive/10"
              >
                Retry
              </Button>
            </div>
          ) : isLoading ? (
            <div className="space-y-3" data-testid="sales-overview-loading">
              {[1, 2, 3, 4, 5].map((idx) => (
                <div
                  key={idx}
                  className="py-3 flex items-center justify-between border-b border-border/50 last:border-b-0 animate-pulse"
                >
                  <div className="space-y-2">
                    <div className="h-4 w-32 bg-muted rounded" />
                    <div className="h-3 w-48 bg-muted rounded" />
                  </div>
                  <div className="h-5 w-20 bg-muted rounded" />
                </div>
              ))}
            </div>
          ) : recentSales.length === 0 ? (
            <div className="py-10 text-center space-y-3" data-testid="sales-overview-empty">
              <ShoppingBag className="h-10 w-10 text-muted-foreground mx-auto stroke-1" />
              <div className="space-y-1">
                <p className="text-sm font-medium text-foreground">No sales recorded yet</p>
                <p className="text-xs text-muted-foreground max-w-sm mx-auto">
                  There are no commercial checkout agreements recorded in this facility.
                </p>
              </div>
              <HasPermission name="sales.create">
                <Button asChild size="sm" className="mt-2 text-xs">
                  <Link to="/sales/new">
                    <PlusCircle className="mr-1.5 h-3.5 w-3.5" /> Create First Sale
                  </Link>
                </Button>
              </HasPermission>
            </div>
          ) : (
            <div className="divide-y divide-border" data-testid="recent-sales-list">
              {recentSales.map((sale) => {
                const source = sale.sourceReference ?? sale.source;
                const sourceType = source?.sourceType ?? source?.type;
                return (
                  <div
                    key={sale.id}
                    className="py-3.5 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between hover:bg-muted/30 px-3 rounded-md transition-colors"
                    data-testid={`recent-sale-row-${sale.id}`}
                  >
                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <Link
                          to={`/sales/${sale.id}`}
                          className="font-mono text-xs font-semibold text-primary hover:underline"
                        >
                          {sale.id}
                        </Link>
                        <SaleStatusBadge status={sale.status as SaleStatus} />
                        {sourceType && (
                          <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                            {sourceType.replace(/_/g, ' ')}
                          </Badge>
                        )}
                      </div>
                      <div className="text-xs text-muted-foreground flex items-center gap-2">
                        <span>
                          {new Date(sale.createdAt).toLocaleDateString(undefined, {
                            year: 'numeric',
                            month: 'short',
                            day: 'numeric',
                          })}
                        </span>
                        <span>·</span>
                        <span>{sale.clientId ? `Client ${sale.clientId}` : 'Walk-in'}</span>
                        <span>·</span>
                        <span>
                          {sale.itemCount} {sale.itemCount === 1 ? 'item' : 'items'}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center justify-between sm:justify-end gap-3 self-end sm:self-auto">
                      <MoneyDisplay value={sale.total} className="text-sm font-semibold" />
                      <Button asChild variant="ghost" size="sm" className="h-8 px-2.5 text-xs">
                        <Link to={`/sales/${sale.id}`}>View</Link>
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};
