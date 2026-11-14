import React from 'react';
import { Link } from 'react-router-dom';
import { Card, CardHeader, CardTitle, CardContent, Badge, Button } from '@kinergy-platform/ui';
import {
  Users,
  AlertTriangle,
  Calendar,
  DollarSign,
  ArrowRight,
  RefreshCw,
  CheckCircle2,
} from 'lucide-react';
import {
  useDashboardAccess,
  useTodayGymCheckIns,
  useLowStockAlerts,
  useTodayAppointments,
  useDailySalesTotal,
} from '../api/operational-dashboard-queries';
import { useTranslation } from '../../../app/providers/locale-provider';

/**
 * 1. Gym Check-ins Today Card (Real-time Operational Indicator)
 */
export const GymCheckInsCard: React.FC = () => {
  const { canViewGymCheckIns } = useDashboardAccess();
  const { data, isLoading, isError, refetch } = useTodayGymCheckIns();
  const { locale, t } = useTranslation();

  if (!canViewGymCheckIns) {
    return null;
  }

  return (
    <Card
      className="flex flex-col justify-between transition-shadow hover:shadow-md border-border"
      data-testid="metric-card-gym-checkins"
    >
      <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
        <CardTitle className="text-sm font-medium text-muted-foreground">
          {locale === 'es'
            ? t('dashboard.metrics.gymCheckInsToday', 'Ingresos al gimnasio hoy')
            : 'Gym Check-ins Today'}
        </CardTitle>
        <div className="p-2 rounded-lg bg-primary/10 text-primary">
          <Users className="w-4 h-4" aria-hidden="true" />
        </div>
      </CardHeader>
      <CardContent className="pt-2 flex flex-col justify-between flex-1 gap-3">
        {isLoading ? (
          <div className="space-y-2 py-1" data-testid="gym-checkins-loading">
            <div className="h-7 w-16 bg-muted animate-pulse rounded" />
            <div className="h-4 w-32 bg-muted animate-pulse rounded" />
          </div>
        ) : isError ? (
          <div className="space-y-2 py-1" data-testid="gym-checkins-error">
            <p className="text-xs text-destructive font-medium">
              {locale === 'es'
                ? 'No se pudo cargar la asistencia de hoy'
                : "Unable to load today's attendance"}
            </p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => void refetch()}
              className="h-7 text-xs gap-1.5"
            >
              <RefreshCw className="w-3 h-3" aria-hidden="true" />{' '}
              {locale === 'es' ? t('common.retry', 'Reintentar') : 'Retry'}
            </Button>
          </div>
        ) : (
          <div>
            <div className="flex items-baseline gap-2">
              <div className="text-2xl font-bold tracking-tight" data-testid="gym-checkins-value">
                {data?.grantedCount ?? 0}
              </div>
              <Badge variant="success" className="text-[11px] px-1.5 py-0 font-normal">
                {locale === 'es' ? 'Autorizados' : 'Granted'}
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {(data?.grantedCount ?? 0) === 0 && (data?.deniedCount ?? 0) === 0
                ? locale === 'es'
                  ? 'Sin ingresos registrados hoy'
                  : 'No check-ins recorded today'
                : locale === 'es'
                  ? `${data?.uniqueClientsCount ?? 0} cliente(s) único(s)${
                      (data?.deniedCount ?? 0) > 0 ? ` · ${data?.deniedCount} denegados` : ''
                    }`
                  : `${data?.uniqueClientsCount ?? 0} unique client(s)${
                      (data?.deniedCount ?? 0) > 0 ? ` · ${data?.deniedCount} denied` : ''
                    }`}
            </p>
          </div>
        )}

        <div className="pt-2 border-t border-border/60 flex items-center justify-between">
          <Link
            to="/gym/attendance"
            className="text-xs font-medium text-primary hover:underline inline-flex items-center gap-1"
            data-testid="gym-checkins-link"
          >
            {locale === 'es' ? 'Abrir registro de ingreso' : 'Open Attendance Log'}{' '}
            <ArrowRight className="w-3 h-3" aria-hidden="true" />
          </Link>
        </div>
      </CardContent>
    </Card>
  );
};

/**
 * 2. Low-Stock Alerts Card (Real-time Operational Indicator)
 */
export const LowStockAlertsCard: React.FC = () => {
  const { canViewLowStock } = useDashboardAccess();
  const { data, isLoading, isError, refetch } = useLowStockAlerts();
  const { locale, t } = useTranslation();

  if (!canViewLowStock) {
    return null;
  }

  const count = data?.count ?? 0;
  const outOfStockCount = data?.outOfStockCount ?? 0;

  return (
    <Card
      className="flex flex-col justify-between transition-shadow hover:shadow-md border-border"
      data-testid="metric-card-low-stock"
    >
      <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
        <CardTitle className="text-sm font-medium text-muted-foreground">
          {locale === 'es'
            ? t('dashboard.metrics.lowStockAlerts', 'Alertas de stock bajo')
            : 'Low-Stock Alerts'}
        </CardTitle>
        <div
          className={`p-2 rounded-lg ${
            count > 0 ? 'bg-warning/15 text-warning-text' : 'bg-success/10 text-success-text'
          }`}
        >
          {count > 0 ? (
            <AlertTriangle className="w-4 h-4" aria-hidden="true" />
          ) : (
            <CheckCircle2 className="w-4 h-4" aria-hidden="true" />
          )}
        </div>
      </CardHeader>
      <CardContent className="pt-2 flex flex-col justify-between flex-1 gap-3">
        {isLoading ? (
          <div className="space-y-2 py-1" data-testid="low-stock-loading">
            <div className="h-7 w-16 bg-muted animate-pulse rounded" />
            <div className="h-4 w-32 bg-muted animate-pulse rounded" />
          </div>
        ) : isError ? (
          <div className="space-y-2 py-1" data-testid="low-stock-error">
            <p className="text-xs text-destructive font-medium">
              {locale === 'es'
                ? 'No se pudieron cargar las alertas de stock'
                : 'Unable to load stock alerts'}
            </p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => void refetch()}
              className="h-7 text-xs gap-1.5"
            >
              <RefreshCw className="w-3 h-3" aria-hidden="true" />{' '}
              {locale === 'es' ? t('common.retry', 'Reintentar') : 'Retry'}
            </Button>
          </div>
        ) : (
          <div>
            <div className="flex items-baseline gap-2">
              <div className="text-2xl font-bold tracking-tight" data-testid="low-stock-value">
                {count}
              </div>
              {count > 0 ? (
                <Badge
                  variant={outOfStockCount > 0 ? 'destructive' : 'warning'}
                  className="text-[11px] px-1.5 py-0 font-normal"
                >
                  {outOfStockCount > 0
                    ? locale === 'es'
                      ? `${outOfStockCount} sin stock`
                      : `${outOfStockCount} Out of Stock`
                    : locale === 'es'
                      ? 'Requiere reposición'
                      : 'Needs Restock'}
                </Badge>
              ) : (
                <Badge variant="success" className="text-[11px] px-1.5 py-0 font-normal">
                  {locale === 'es' ? 'Óptimo' : 'Healthy'}
                </Badge>
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {count === 0
                ? locale === 'es'
                  ? 'Todos los artículos activos tienen stock suficiente'
                  : 'All active inventory items stocked'
                : locale === 'es'
                  ? `${count} artículo(s) activo(s) en o bajo el mínimo`
                  : `${count} active item(s) at or below reorder threshold`}
            </p>
          </div>
        )}

        <div className="pt-2 border-t border-border/60 flex items-center justify-between">
          <Link
            to="/resources/inventory/low-stock"
            className="text-xs font-medium text-primary hover:underline inline-flex items-center gap-1"
            data-testid="low-stock-link"
          >
            {locale === 'es' ? 'Revisar stock bajo' : 'Review Low Stock'}{' '}
            <ArrowRight className="w-3 h-3" aria-hidden="true" />
          </Link>
        </div>
      </CardContent>
    </Card>
  );
};

/**
 * 3. Today's Appointments Card (Connected to Persisted Scheduling Data)
 */
export const TodayAppointmentsCard: React.FC = () => {
  const { canViewAppointments } = useDashboardAccess();
  const { data, isLoading, isError, refetch } = useTodayAppointments();
  const { locale, t } = useTranslation();

  if (!canViewAppointments) {
    return null;
  }

  const activeCount = data?.activeCount ?? 0;
  const breakdown = data?.statusBreakdown;

  const buildBreakdownText = () => {
    if (!breakdown || activeCount === 0) {
      if ((breakdown?.cancelled ?? 0) > 0) {
        return locale === 'es'
          ? `Sin sesiones activas · ${breakdown?.cancelled ?? 0} canceladas`
          : `No active sessions · ${breakdown?.cancelled ?? 0} cancelled`;
      }
      return locale === 'es'
        ? 'No hay citas programadas para hoy'
        : 'No appointments scheduled today';
    }

    const parts: string[] = [];
    const readyOrActive =
      (breakdown.confirmed ?? 0) + (breakdown.checkedIn ?? 0) + (breakdown.inProgress ?? 0);
    if (readyOrActive > 0) {
      parts.push(
        locale === 'es'
          ? `${readyOrActive} confirmadas/en sala`
          : `${readyOrActive} confirmed/in-clinic`,
      );
    }
    if (breakdown.scheduled > 0) {
      parts.push(
        locale === 'es'
          ? `${breakdown.scheduled} sin confirmar`
          : `${breakdown.scheduled} unconfirmed`,
      );
    }
    if (breakdown.completed > 0) {
      parts.push(
        locale === 'es' ? `${breakdown.completed} completadas` : `${breakdown.completed} completed`,
      );
    }
    if (breakdown.cancelled > 0) {
      parts.push(
        locale === 'es' ? `${breakdown.cancelled} canceladas` : `${breakdown.cancelled} cancelled`,
      );
    }
    return (
      parts.join(' · ') ||
      (locale === 'es'
        ? `${activeCount} cita(s) activa(s) hoy`
        : `${activeCount} active appointment(s) today`)
    );
  };

  return (
    <Card
      className="flex flex-col justify-between transition-shadow hover:shadow-md border-border"
      data-testid="metric-card-appointments"
    >
      <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
        <CardTitle className="text-sm font-medium text-muted-foreground">
          {locale === 'es'
            ? t('dashboard.metrics.todaysAppointments', 'Citas de hoy')
            : "Today's Appointments"}
        </CardTitle>
        <div className="p-2 rounded-lg bg-primary/10 text-primary">
          <Calendar className="w-4 h-4" aria-hidden="true" />
        </div>
      </CardHeader>
      <CardContent className="pt-2 flex flex-col justify-between flex-1 gap-3">
        {isLoading ? (
          <div className="space-y-2 py-1" data-testid="appointments-loading">
            <div className="h-7 w-16 bg-muted animate-pulse rounded" />
            <div className="h-4 w-32 bg-muted animate-pulse rounded" />
          </div>
        ) : isError ? (
          <div className="space-y-2 py-1" data-testid="appointments-error">
            <p className="text-xs text-destructive font-medium">
              {locale === 'es'
                ? 'No se pudieron cargar las citas de hoy'
                : "Unable to load today's appointments"}
            </p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => void refetch()}
              className="h-7 text-xs gap-1.5"
            >
              <RefreshCw className="w-3 h-3" aria-hidden="true" />{' '}
              {locale === 'es' ? t('common.retry', 'Reintentar') : 'Retry'}
            </Button>
          </div>
        ) : (
          <div>
            <div className="flex items-baseline gap-2">
              <div className="text-2xl font-bold tracking-tight" data-testid="appointments-value">
                {activeCount}
              </div>
              <Badge
                variant={activeCount > 0 ? 'info' : 'secondary'}
                className="text-[11px] px-1.5 py-0 font-normal"
              >
                {locale === 'es'
                  ? activeCount === 1
                    ? '1 Activa'
                    : `${activeCount} Activas`
                  : activeCount === 1
                    ? '1 Active'
                    : `${activeCount} Active`}
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground mt-1" data-testid="appointments-breakdown">
              {buildBreakdownText()}
            </p>
          </div>
        )}

        <div className="pt-2 border-t border-border/60 flex items-center justify-between">
          <Link
            to="/scheduling"
            className="text-xs font-medium text-primary hover:underline inline-flex items-center gap-1"
            data-testid="appointments-link"
          >
            {locale === 'es' ? 'Abrir agenda' : 'Open Schedule'}{' '}
            <ArrowRight className="w-3 h-3" aria-hidden="true" />
          </Link>
        </div>
      </CardContent>
    </Card>
  );
};

/**
 * 4. Daily Sales Total Card (Connected to Settled Payments Ledger)
 */
export const DailySalesTotalCard: React.FC = () => {
  const { canViewDailySales } = useDashboardAccess();
  const { data, isLoading, isError, refetch } = useDailySalesTotal();
  const { locale, t } = useTranslation();

  if (!canViewDailySales) {
    return null;
  }

  const formattedTotal = data?.formattedTotal ?? '$0.00';
  const completedCount = data?.completedPaymentsCount ?? 0;

  return (
    <Card
      className="flex flex-col justify-between transition-shadow hover:shadow-md border-border"
      data-testid="metric-card-daily-sales"
    >
      <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
        <CardTitle className="text-sm font-medium text-muted-foreground">
          {locale === 'es'
            ? t('dashboard.metrics.dailySalesTotal', 'Total de ventas del día')
            : 'Daily Sales Total'}
        </CardTitle>
        <div className="p-2 rounded-lg bg-primary/10 text-primary">
          <DollarSign className="w-4 h-4" aria-hidden="true" />
        </div>
      </CardHeader>
      <CardContent className="pt-2 flex flex-col justify-between flex-1 gap-3">
        {isLoading ? (
          <div className="space-y-2 py-1" data-testid="daily-sales-loading">
            <div className="h-7 w-24 bg-muted animate-pulse rounded" />
            <div className="h-4 w-32 bg-muted animate-pulse rounded" />
          </div>
        ) : isError ? (
          <div className="space-y-2 py-1" data-testid="daily-sales-error">
            <p className="text-xs text-destructive font-medium">
              {locale === 'es'
                ? 'No se pudo cargar el total de ventas de hoy'
                : "Unable to load today's sales total"}
            </p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => void refetch()}
              className="h-7 text-xs gap-1.5"
            >
              <RefreshCw className="w-3 h-3" aria-hidden="true" />{' '}
              {locale === 'es' ? t('common.retry', 'Reintentar') : 'Retry'}
            </Button>
          </div>
        ) : (
          <div>
            <div className="flex items-baseline gap-2">
              <div className="text-2xl font-bold tracking-tight" data-testid="daily-sales-value">
                {formattedTotal}
              </div>
              <Badge
                variant={completedCount > 0 ? 'success' : 'secondary'}
                className="text-[11px] px-1.5 py-0 font-normal"
              >
                {locale === 'es' ? 'Cobrado' : 'Settled'}
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground mt-1" data-testid="daily-sales-subtitle">
              {completedCount === 0
                ? locale === 'es'
                  ? 'Sin pagos cobrados registrados hoy'
                  : 'No settled payments recorded today'
                : locale === 'es'
                  ? `Recaudado en ${completedCount} pago(s) completado(s) hoy`
                  : `Collected across ${completedCount} completed payment(s) today`}
            </p>
          </div>
        )}

        <div className="pt-2 border-t border-border/60 flex items-center justify-between">
          <Link
            to="/sales/payments"
            className="text-xs font-medium text-primary hover:underline inline-flex items-center gap-1"
            data-testid="daily-sales-link"
          >
            {locale === 'es' ? 'Ver historial de pagos' : 'View Payment Ledger'}{' '}
            <ArrowRight className="w-3 h-3" aria-hidden="true" />
          </Link>
        </div>
      </CardContent>
    </Card>
  );
};

export const OperationalMetricCards: React.FC = () => {
  const { roleProfile } = useDashboardAccess();

  const renderOrderedCards = () => {
    if (roleProfile === 'TRAINER') {
      return (
        <>
          <TodayAppointmentsCard />
          <GymCheckInsCard />
          <LowStockAlertsCard />
          <DailySalesTotalCard />
        </>
      );
    }

    if (roleProfile === 'RECEPTIONIST') {
      return (
        <>
          <TodayAppointmentsCard />
          <GymCheckInsCard />
          <DailySalesTotalCard />
          <LowStockAlertsCard />
        </>
      );
    }

    if (roleProfile === 'INVENTORY') {
      return (
        <>
          <LowStockAlertsCard />
          <GymCheckInsCard />
          <TodayAppointmentsCard />
          <DailySalesTotalCard />
        </>
      );
    }

    return (
      <>
        <GymCheckInsCard />
        <LowStockAlertsCard />
        <TodayAppointmentsCard />
        <DailySalesTotalCard />
      </>
    );
  };

  return (
    <div
      className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4"
      data-testid="operational-metrics-grid"
    >
      {renderOrderedCards()}
    </div>
  );
};
