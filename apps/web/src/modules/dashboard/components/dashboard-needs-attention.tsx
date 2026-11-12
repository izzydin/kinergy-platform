import React from 'react';
import { Link } from 'react-router-dom';
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  Badge,
  Button,
} from '@kinergy-platform/ui';
import {
  AlertTriangle,
  CheckCircle2,
  Package,
  CalendarClock,
  CreditCard,
  ArrowRight,
  RefreshCw,
} from 'lucide-react';
import {
  useDashboardAccess,
  useLowStockAlerts,
  useTodayAppointments,
  usePendingSalesFollowUp,
  formatMinorUnitsAsCurrency,
} from '../api/operational-dashboard-queries';
import type { SaleSummaryDTO } from '../../sales/types';

function formatSaleAmount(sale: SaleSummaryDTO): string {
  if (sale.total?.formatted) {
    return sale.total.formatted;
  }
  if (typeof sale.total?.cents === 'number') {
    return formatMinorUnitsAsCurrency(sale.total.cents, sale.currency || 'USD');
  }
  const amount = sale.total?.amount ?? sale.totalAmount ?? 0;
  const cents = Math.round(Number(amount) * 100);
  return formatMinorUnitsAsCurrency(cents, sale.currency || 'USD');
}

/**
 * Needs Attention Operational Alerts Section
 *
 * Surfaces actionable operational issues backed strictly by real persisted domain data:
 * 1. Critical out-of-stock and low-stock inventory items requiring replenishment.
 * 2. Appointments today requiring confirmation or clinic check-in follow-up.
 * 3. Finalized sales in PENDING_PAYMENT status requiring settlement.
 */
export const DashboardNeedsAttention: React.FC = () => {
  const { canViewLowStock, canViewAppointments, canViewPendingSales } = useDashboardAccess();

  const lowStockQuery = useLowStockAlerts();
  const appointmentsQuery = useTodayAppointments();
  const pendingSalesQuery = usePendingSalesFollowUp();

  const criticalInventoryItems = canViewLowStock
    ? (lowStockQuery.data?.items ?? []).slice(0, 4)
    : [];
  const totalLowStockCount = canViewLowStock ? (lowStockQuery.data?.count ?? 0) : 0;

  const actionableAppointments = canViewAppointments
    ? (appointmentsQuery.data?.needsAttentionItems ?? []).slice(0, 3)
    : [];

  const pendingSales = canViewPendingSales ? (pendingSalesQuery.data?.items ?? []).slice(0, 3) : [];
  const totalPendingSalesCount = canViewPendingSales ? (pendingSalesQuery.data?.count ?? 0) : 0;

  const isLoadingAny =
    (canViewLowStock && lowStockQuery.isLoading) ||
    (canViewAppointments && appointmentsQuery.isLoading) ||
    (canViewPendingSales && pendingSalesQuery.isLoading);

  const hasErrorAny =
    (canViewLowStock && lowStockQuery.isError) ||
    (canViewAppointments && appointmentsQuery.isError) ||
    (canViewPendingSales && pendingSalesQuery.isError);

  const totalActionableCount =
    criticalInventoryItems.length + actionableAppointments.length + pendingSales.length;

  const handleRetryAll = () => {
    if (canViewLowStock && lowStockQuery.isError) void lowStockQuery.refetch();
    if (canViewAppointments && appointmentsQuery.isError) void appointmentsQuery.refetch();
    if (canViewPendingSales && pendingSalesQuery.isError) void pendingSalesQuery.refetch();
  };

  return (
    <Card className="border-border flex flex-col" data-testid="dashboard-needs-attention">
      <CardHeader className="flex flex-row items-center justify-between gap-2 pb-3 border-b border-border/60">
        <div>
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-warning-text" aria-hidden="true" />
            <span>Needs Attention</span>
          </CardTitle>
          <CardDescription className="text-xs mt-0.5">
            Actionable stock, scheduling, and payment items requiring staff follow-up
          </CardDescription>
        </div>
        {!isLoadingAny && totalActionableCount > 0 && (
          <Badge variant="warning" className="text-xs font-medium shrink-0">
            {totalLowStockCount + actionableAppointments.length + totalPendingSalesCount} Open
          </Badge>
        )}
      </CardHeader>

      <CardContent className="pt-4 space-y-4 flex-1">
        {isLoadingAny && totalActionableCount === 0 ? (
          <div className="space-y-2.5" data-testid="needs-attention-loading">
            {[1, 2].map((idx) => (
              <div
                key={idx}
                className="h-14 rounded-lg border border-border/60 bg-muted/20 animate-pulse"
              />
            ))}
          </div>
        ) : totalActionableCount === 0 && !hasErrorAny ? (
          <div
            className="flex flex-col items-center justify-center text-center py-6 px-4 rounded-lg border border-dashed border-border bg-muted/10"
            data-testid="needs-attention-empty"
          >
            <div className="p-2 rounded-full bg-success/10 text-success-text mb-2">
              <CheckCircle2 className="w-5 h-5" aria-hidden="true" />
            </div>
            <p className="text-sm font-medium text-foreground">
              All clear — no operational issues require immediate attention
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              Inventory thresholds, today&apos;s appointments, and payment settlements are up to
              date.
            </p>
          </div>
        ) : (
          <div className="space-y-4" data-testid="needs-attention-list">
            {/* 1. Critical Low-Stock / Out-of-Stock Items */}
            {criticalInventoryItems.length > 0 && (
              <div className="space-y-2" data-testid="attention-group-inventory">
                <div className="flex items-center justify-between text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  <span className="inline-flex items-center gap-1.5">
                    <Package className="w-3.5 h-3.5 text-warning-text" aria-hidden="true" />
                    <span>Inventory Replenishment ({totalLowStockCount})</span>
                  </span>
                  <Link
                    to="/resources/inventory/low-stock"
                    className="text-primary hover:underline normal-case font-medium inline-flex items-center gap-1"
                  >
                    Restock queue <ArrowRight className="w-3 h-3" aria-hidden="true" />
                  </Link>
                </div>

                <div className="divide-y divide-border rounded-lg border border-border overflow-hidden">
                  {criticalInventoryItems.map((item) => (
                    <div
                      key={item.id}
                      className="flex items-center justify-between gap-2 p-2.5 bg-card hover:bg-muted/30 transition-colors"
                      data-testid={`attention-inventory-item-${item.id}`}
                    >
                      <div className="min-w-0">
                        <Link
                          to={`/resources/inventory/${encodeURIComponent(item.id)}`}
                          className="text-xs font-semibold text-foreground hover:text-primary hover:underline truncate block"
                        >
                          {item.name}
                        </Link>
                        <p className="text-[11px] text-muted-foreground">
                          SKU: {item.sku} · On hand:{' '}
                          <span className="font-medium text-foreground">
                            {item.currentStock} {item.unitOfMeasure}
                          </span>{' '}
                          (min {item.reorderThreshold})
                        </p>
                      </div>
                      <Badge
                        variant={item.isOutOfStock ? 'destructive' : 'warning'}
                        className="text-[10px] shrink-0"
                      >
                        {item.isOutOfStock ? 'Out of Stock' : 'Low Stock'}
                      </Badge>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* 2. Appointments Requiring Action Today */}
            {actionableAppointments.length > 0 && (
              <div className="space-y-2" data-testid="attention-group-appointments">
                <div className="flex items-center justify-between text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  <span className="inline-flex items-center gap-1.5">
                    <CalendarClock className="w-3.5 h-3.5 text-primary" aria-hidden="true" />
                    <span>Appointments Awaiting Action ({actionableAppointments.length})</span>
                  </span>
                  <Link
                    to="/scheduling"
                    className="text-primary hover:underline normal-case font-medium inline-flex items-center gap-1"
                  >
                    Manage schedule <ArrowRight className="w-3 h-3" aria-hidden="true" />
                  </Link>
                </div>

                <div className="divide-y divide-border rounded-lg border border-border overflow-hidden">
                  {actionableAppointments.map((appt) => (
                    <div
                      key={appt.id}
                      className="flex items-center justify-between gap-2 p-2.5 bg-card hover:bg-muted/30 transition-colors"
                      data-testid={`attention-appointment-item-${appt.id}`}
                    >
                      <div className="min-w-0">
                        <p className="text-xs font-semibold text-foreground truncate">
                          {appt.formattedStartTime} · {appt.clientName}
                        </p>
                        <p className="text-[11px] text-muted-foreground truncate">
                          {appt.actionReason} ({appt.serviceLabel})
                        </p>
                      </div>
                      <Badge
                        variant={appt.status === 'CHECKED_IN' ? 'warning' : 'secondary'}
                        className="text-[10px] shrink-0"
                      >
                        {appt.status === 'CHECKED_IN' ? 'Ready to Start' : 'Unconfirmed'}
                      </Badge>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* 3. Sales Awaiting Payment Settlement */}
            {pendingSales.length > 0 && (
              <div className="space-y-2" data-testid="attention-group-sales">
                <div className="flex items-center justify-between text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  <span className="inline-flex items-center gap-1.5">
                    <CreditCard className="w-3.5 h-3.5 text-warning-text" aria-hidden="true" />
                    <span>Pending Payment Orders ({totalPendingSalesCount})</span>
                  </span>
                  <Link
                    to="/sales/list?status=PENDING_PAYMENT"
                    className="text-primary hover:underline normal-case font-medium inline-flex items-center gap-1"
                  >
                    Open orders <ArrowRight className="w-3 h-3" aria-hidden="true" />
                  </Link>
                </div>

                <div className="divide-y divide-border rounded-lg border border-border overflow-hidden">
                  {pendingSales.map((sale) => (
                    <div
                      key={sale.id}
                      className="flex items-center justify-between gap-2 p-2.5 bg-card hover:bg-muted/30 transition-colors"
                      data-testid={`attention-sale-item-${sale.id}`}
                    >
                      <div className="min-w-0">
                        <Link
                          to={`/sales/${encodeURIComponent(sale.id)}`}
                          className="text-xs font-semibold text-foreground hover:text-primary hover:underline truncate block"
                        >
                          Order #{sale.id.slice(0, 8)} · {formatSaleAmount(sale)}
                        </Link>
                        <p className="text-[11px] text-muted-foreground">
                          {sale.itemCount} item(s) · Finalized awaiting payment settlement
                        </p>
                      </div>
                      <Badge variant="warning" className="text-[10px] shrink-0">
                        Pending Payment
                      </Badge>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {hasErrorAny && (
          <div
            className="flex items-center justify-between gap-2 p-2.5 rounded-lg border border-destructive/30 bg-destructive/5 text-xs"
            data-testid="needs-attention-error"
          >
            <span className="text-destructive font-medium">
              Some operational alerts could not be refreshed.
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={handleRetryAll}
              className="h-7 text-xs gap-1"
            >
              <RefreshCw className="w-3 h-3" aria-hidden="true" /> Retry
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
};
