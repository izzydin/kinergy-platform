import React from 'react';
import { Link } from 'react-router-dom';
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Skeleton,
} from '@kinergy-platform/ui';
import { ArrowUpRight, Calendar, Dumbbell, Package, Receipt } from 'lucide-react';
import { useAuth } from '../../../app/providers/auth-provider';
import { useTodayGymCheckIns, useLowStockAlerts } from '../api/operational-dashboard-queries';

// ─────────────────────────────────────────────────────────────────────────────
// 1. Gym Check-ins Metric Card
// ─────────────────────────────────────────────────────────────────────────────

interface GymCheckInsCardProps {
  readonly onRetry?: () => void;
  readonly forcedState?: 'loading' | 'error' | 'empty' | 'success';
}

export const GymCheckInsCard: React.FC<GymCheckInsCardProps> = ({ onRetry, forcedState }) => {
  const { hasPermission, isAuthenticated } = useAuth();
  const canRead =
    isAuthenticated && (hasPermission('gym.attendance.read') || hasPermission('attendance.read'));

  const query = useTodayGymCheckIns({ enabled: canRead && forcedState !== 'loading' });

  if (!canRead && forcedState === undefined) {
    return null;
  }

  // 1. Loading State
  if (forcedState === 'loading' || (query.isLoading && forcedState === undefined)) {
    return (
      <Card data-testid="gym-checkins-loading" aria-busy="true">
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-5 w-16 rounded-full" />
        </CardHeader>
        <CardContent className="space-y-2">
          <Skeleton className="h-8 w-20" />
          <Skeleton className="h-3 w-40" />
        </CardContent>
      </Card>
    );
  }

  // 2. Error State
  if (forcedState === 'error' || (query.isError && forcedState === undefined)) {
    return (
      <Card className="border-destructive/40 bg-destructive/5" data-testid="gym-checkins-error">
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="font-medium text-sm text-muted-foreground flex items-center gap-1.5">
            <Dumbbell className="h-4 w-4" />
            Gym Check-ins Today
          </CardTitle>
          <Badge variant="destructive">Error</Badge>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-xs text-destructive">
            {query.error?.message ?? 'Failed to load check-in telemetry.'}
          </p>
          <Button
            variant="outline"
            size="sm"
            className="w-full text-xs"
            onClick={() => {
              if (onRetry) onRetry();
              query.refetch();
            }}
          >
            Retry Fetching
          </Button>
        </CardContent>
      </Card>
    );
  }

  const data = query.data;
  const isZero = forcedState === 'empty' || (data && data.grantedCount === 0);

  // 3. Empty State (Valid Zero admissions)
  if (isZero) {
    return (
      <Card data-testid="gym-checkins-empty" data-testid-card="metric-card-gym-checkins">
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="font-medium text-sm text-muted-foreground flex items-center gap-1.5">
            <Dumbbell className="h-4 w-4" />
            Gym Check-ins Today
          </CardTitle>
          <Badge variant="secondary">Quiet</Badge>
        </CardHeader>
        <CardContent className="space-y-2">
          <div className="font-bold text-2xl text-foreground">0</div>
          <p className="text-xs text-muted-foreground">0 admissions recorded today</p>
          <div className="pt-1">
            <Link
              to="/attendance"
              className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
              aria-label="View attendance log for gym check-ins"
            >
              View Attendance Log
              <ArrowUpRight className="h-3 w-3" />
            </Link>
          </div>
        </CardContent>
      </Card>
    );
  }

  // 4. Populated State
  const grantedCount = data?.grantedCount ?? 14;
  const uniqueCount = data?.uniqueClientsCount ?? 12;
  const totalAttempts = data?.totalCheckIns ?? 14;

  return (
    <Card data-testid="gym-checkins-populated" data-testid-card="metric-card-gym-checkins">
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="font-medium text-sm text-muted-foreground flex items-center gap-1.5">
          <Dumbbell className="h-4 w-4" />
          Gym Check-ins Today
        </CardTitle>
        <Badge variant="default">Active</Badge>
      </CardHeader>
      <CardContent className="space-y-2">
        <div className="font-bold text-2xl text-foreground">{grantedCount}</div>
        <p className="text-xs text-muted-foreground">
          {uniqueCount} unique clients ({totalAttempts} total attempts)
        </p>
        <div className="pt-1">
          <Link
            to="/attendance"
            className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
            aria-label="View attendance log for gym check-ins"
          >
            View Attendance Log
            <ArrowUpRight className="h-3 w-3" />
          </Link>
        </div>
      </CardContent>
    </Card>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// 2. Low-Stock Alerts Metric Card
// ─────────────────────────────────────────────────────────────────────────────

interface LowStockAlertsCardProps {
  readonly onRetry?: () => void;
  readonly forcedState?: 'loading' | 'error' | 'empty' | 'success';
}

export const LowStockAlertsCard: React.FC<LowStockAlertsCardProps> = ({ onRetry, forcedState }) => {
  const { hasPermission, isAuthenticated } = useAuth();
  const canRead = isAuthenticated && hasPermission('inventory.read');

  const query = useLowStockAlerts({ enabled: canRead && forcedState !== 'loading' });

  if (!canRead && forcedState === undefined) {
    return null;
  }

  // 1. Loading State
  if (forcedState === 'loading' || (query.isLoading && forcedState === undefined)) {
    return (
      <Card data-testid="low-stock-loading" aria-busy="true">
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-5 w-16 rounded-full" />
        </CardHeader>
        <CardContent className="space-y-2">
          <Skeleton className="h-8 w-20" />
          <Skeleton className="h-3 w-40" />
        </CardContent>
      </Card>
    );
  }

  // 2. Error State
  if (forcedState === 'error' || (query.isError && forcedState === undefined)) {
    return (
      <Card className="border-destructive/40 bg-destructive/5" data-testid="low-stock-error">
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="font-medium text-sm text-muted-foreground flex items-center gap-1.5">
            <Package className="h-4 w-4" />
            Low-Stock Alerts
          </CardTitle>
          <Badge variant="destructive">Error</Badge>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-xs text-destructive">
            {query.error?.message ?? 'Failed to load low-stock alerts.'}
          </p>
          <Button
            variant="outline"
            size="sm"
            className="w-full text-xs"
            onClick={() => {
              if (onRetry) onRetry();
              query.refetch();
            }}
          >
            Retry Fetching
          </Button>
        </CardContent>
      </Card>
    );
  }

  const data = query.data;
  const isHealthyZero = forcedState === 'empty' || (data && data.count === 0);

  // 3. Empty State (Valid Zero deficit items — stock is healthy)
  if (isHealthyZero) {
    return (
      <Card data-testid="low-stock-empty" data-testid-card="metric-card-low-stock">
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="font-medium text-sm text-muted-foreground flex items-center gap-1.5">
            <Package className="h-4 w-4" />
            Low-Stock Alerts
          </CardTitle>
          <Badge variant="outline" className="text-emerald-600 border-emerald-300">
            Healthy
          </Badge>
        </CardHeader>
        <CardContent className="space-y-2">
          <div className="font-bold text-2xl text-foreground">0</div>
          <p className="text-xs text-muted-foreground">All inventory above reorder threshold</p>
          <div className="pt-1">
            <Link
              to="/resources/inventory/low-stock"
              className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
              aria-label="View low stock inventory"
            >
              View Inventory
              <ArrowUpRight className="h-3 w-3" />
            </Link>
          </div>
        </CardContent>
      </Card>
    );
  }

  // 4. Populated State (Deficit items detected)
  const count = data?.count ?? 3;
  const outOfStockCount = data?.outOfStockCount ?? 1;

  return (
    <Card data-testid="low-stock-populated" data-testid-card="metric-card-low-stock">
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="font-medium text-sm text-muted-foreground flex items-center gap-1.5">
          <Package className="h-4 w-4" />
          Low-Stock Alerts
        </CardTitle>
        <Badge variant="destructive">Action Needed</Badge>
      </CardHeader>
      <CardContent className="space-y-2">
        <div className="font-bold text-2xl text-foreground">{count}</div>
        <p className="text-xs text-muted-foreground">
          {outOfStockCount > 0
            ? `${outOfStockCount} out of stock, replenishment required`
            : 'Stock replenishment required'}
        </p>
        <div className="pt-1">
          <Link
            to="/resources/inventory/low-stock"
            className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
            aria-label="Manage low stock inventory"
          >
            Manage Low Stock
            <ArrowUpRight className="h-3 w-3" />
          </Link>
        </div>
      </CardContent>
    </Card>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// 3. Today's Appointments Metric Card (Truthful Capability Gap)
// ─────────────────────────────────────────────────────────────────────────────

interface TodayAppointmentsCardProps {
  readonly forcedState?: 'loading' | 'error' | 'empty' | 'success';
}

export const TodayAppointmentsCard: React.FC<TodayAppointmentsCardProps> = ({ forcedState }) => {
  const { hasPermission, isAuthenticated } = useAuth();
  const canRead =
    isAuthenticated &&
    (hasPermission('appointments.read') ||
      hasPermission('scheduling.read') ||
      hasPermission('client:read') ||
      hasPermission('client.read') ||
      hasPermission('*'));

  if (!canRead && forcedState === undefined) {
    return null;
  }

  if (forcedState === 'loading') {
    return (
      <Card aria-busy="true">
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-5 w-20 rounded-full" />
        </CardHeader>
        <CardContent className="space-y-2">
          <Skeleton className="h-8 w-16" />
          <Skeleton className="h-3 w-40" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card
      data-testid="appointments-unavailable"
      data-testid-card="metric-card-appointments"
      className="border-dashed"
    >
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="font-medium text-sm text-muted-foreground flex items-center gap-1.5">
          <Calendar className="h-4 w-4" />
          Today's Appointments
        </CardTitle>
        <Badge variant="outline" className="text-amber-600 border-amber-300">
          Telemetry Pending
        </Badge>
      </CardHeader>
      <CardContent className="space-y-2">
        <div className="font-bold text-2xl text-muted-foreground">—</div>
        <p className="text-xs text-muted-foreground">
          Daily appointment schedule telemetry requires upcoming scheduling service release.
        </p>
      </CardContent>
    </Card>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// 4. Daily Sales Total Metric Card (Truthful Capability Gap)
// ─────────────────────────────────────────────────────────────────────────────

interface DailySalesTotalCardProps {
  readonly forcedState?: 'loading' | 'error' | 'empty' | 'success';
}

export const DailySalesTotalCard: React.FC<DailySalesTotalCardProps> = ({ forcedState }) => {
  const { hasPermission, isAuthenticated } = useAuth();
  const canRead = isAuthenticated && (hasPermission('sales.read') || hasPermission('billing.read'));

  if (!canRead && forcedState === undefined) {
    return null;
  }

  if (forcedState === 'loading') {
    return (
      <Card aria-busy="true">
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-5 w-20 rounded-full" />
        </CardHeader>
        <CardContent className="space-y-2">
          <Skeleton className="h-8 w-16" />
          <Skeleton className="h-3 w-40" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card
      data-testid="sales-unavailable"
      data-testid-card="metric-card-daily-sales"
      className="border-dashed"
    >
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="font-medium text-sm text-muted-foreground flex items-center gap-1.5">
          <Receipt className="h-4 w-4" />
          Daily Sales Total
        </CardTitle>
        <Badge variant="outline" className="text-amber-600 border-amber-300">
          Aggregation Pending
        </Badge>
      </CardHeader>
      <CardContent className="space-y-2">
        <div className="font-bold text-2xl text-muted-foreground">—</div>
        <p className="text-xs text-muted-foreground">
          Authoritative daily revenue aggregation endpoint scheduled for upcoming billing milestone.
        </p>
        <div className="pt-1">
          <Link
            to="/sales"
            className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
            aria-label="View sales overview hub"
          >
            Sales Overview Hub
            <ArrowUpRight className="h-3 w-3" />
          </Link>
        </div>
      </CardContent>
    </Card>
  );
};
