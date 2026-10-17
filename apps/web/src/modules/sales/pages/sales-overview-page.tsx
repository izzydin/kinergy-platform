import React from 'react';
import { Link } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle, Button, Badge } from '@kinergy-platform/ui';
import { ShoppingBag, CreditCard, Clock, CheckCircle2, PlusCircle, RefreshCw } from 'lucide-react';
import { useSalesOverviewMetrics } from '../hooks/use-sales-queries';
import { HasPermission } from '../../../app/routes/permission-guard';
import { SaleStatusBadge } from '../components/sale-status-badge';
import { MoneyDisplay } from '../components/money-display';

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
      {/* 1. Page Header Block */}
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
            Real-time commercial sales agreements, pending tenders, and checkout operations.
          </p>
        </div>

        {/* Header Action Buttons */}
        <div className="flex items-center gap-2.5">
          <Button
            variant="outline"
            size="sm"
            onClick={() => refetchAll()}
            disabled={isLoading}
            data-testid="refresh-sales-overview-btn"
            className="h-8 text-xs gap-1.5"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>

          <Button asChild variant="outline" size="sm">
            <Link to="/sales/list">
              <ShoppingBag className="mr-1.5 h-4 w-4" /> All Sales
            </Link>
          </Button>

          <Button asChild variant="outline" size="sm">
            <Link to="/sales/payments">
              <CreditCard className="mr-1.5 h-4 w-4" /> Payments History
            </Link>
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

      {/* 2. Operational KPI Cards */}
      <div className="grid gap-4 md:grid-cols-3">
        {/* Pending Payment Count */}
        <Card className="border-border bg-card">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Awaiting Payment
            </CardTitle>
            <Clock className="h-4 w-4 text-amber-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="kpi-pending-payments">
              {isLoading ? '...' : pendingPaymentsCount}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Finalized orders awaiting settlement tender
            </p>
          </CardContent>
        </Card>

        {/* Draft Sessions Count */}
        <Card className="border-border bg-card">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Draft Sessions
            </CardTitle>
            <ShoppingBag className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="kpi-draft-sales">
              {isLoading ? '...' : draftsCount}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Active open carts and draft checkout orders
            </p>
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
            <div
              className="text-2xl font-bold text-emerald-600 dark:text-emerald-400"
              data-testid="kpi-settled-sales"
            >
              {isLoading ? '...' : settledSalesCount}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Fully paid orders ready for receipt issuance
            </p>
          </CardContent>
        </Card>
      </div>

      {/* 3. Recent Sales Activity */}
      <Card className="border-border bg-card">
        <CardHeader>
          <CardTitle className="text-lg">Recent Sales Agreements</CardTitle>
        </CardHeader>
        <CardContent>
          {isError ? (
            <div className="p-4 text-sm text-destructive bg-destructive/10 rounded-md">
              Failed to load recent sales agreements.
            </div>
          ) : recentSales.length === 0 && !isLoading ? (
            <div className="p-6 text-center text-sm text-muted-foreground">
              No sales orders recorded yet.
            </div>
          ) : (
            <div className="divide-y divide-border">
              {recentSales.map((sale) => (
                <div
                  key={sale.id}
                  className="py-3 flex items-center justify-between hover:bg-muted/30 px-2 rounded-md transition-colors"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <Link
                        to={`/sales/${sale.id}`}
                        className="font-mono text-sm font-medium hover:underline text-primary"
                      >
                        {sale.id}
                      </Link>
                      <SaleStatusBadge status={sale.status} />
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {new Date(sale.createdAt).toLocaleString()} · {sale.itemCount} items
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <MoneyDisplay value={sale.total} className="text-sm font-semibold" />
                    <Button asChild variant="ghost" size="sm">
                      <Link to={`/sales/${sale.id}`}>View</Link>
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};
