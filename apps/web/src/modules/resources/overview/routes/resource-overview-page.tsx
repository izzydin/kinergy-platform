import * as React from 'react';
import { Link } from 'react-router-dom';
import { Badge, Button, Card, CardContent, Skeleton } from '@kinergy-platform/ui';
import {
  AlertCircle,
  Boxes,
  Inbox,
  Landmark,
  PackagePlus,
  PlusCircle,
  RefreshCw,
  ShieldAlert,
} from 'lucide-react';
import { useAuth } from '../../../../app/providers/auth-provider';
import { useResourceOverview } from '../hooks';
import {
  OverallResourceValueCard,
  ConsumableInventorySection,
  FixedAssetsSection,
} from '../components';

export const ResourceOverviewPage: React.FC = () => {
  const { currentUser, hasPermission, hasRole } = useAuth();
  const [includeArchived, setIncludeArchived] = React.useState(false);

  // Administrative or composed permission check aligned with NestJS ResourceOverviewController:
  // Requires ('inventory.read', 'assets.read', 'billing.read') OR ('ADMIN', 'SUPER_ADMIN', 'OWNER')
  const isAuthorized = React.useMemo(() => {
    if (!currentUser) return false;
    const hasAdminRole = hasRole('ADMIN') || hasRole('SUPER_ADMIN') || hasRole('OWNER');
    if (hasAdminRole) return true;

    const hasInventory = hasPermission('inventory.read');
    const hasAssets = hasPermission('assets.read');
    const hasBillingOrValuation = hasPermission('billing.read') || hasPermission('valuation.read');

    return hasInventory && hasAssets && hasBillingOrValuation;
  }, [currentUser, hasPermission, hasRole]);

  const {
    data: overview,
    isLoading,
    isError,
    error,
    refetch,
    isFetching,
  } = useResourceOverview({ includeArchived }, { enabled: isAuthorized });

  // 1. Permission Gate (Access Denied View)
  if (!isAuthorized) {
    return (
      <div className="space-y-6" data-testid="resource-overview-forbidden">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">Resource Overview</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Enterprise resource governance and valuation dashboard.
          </p>
        </div>

        <Card className="border-destructive/30 bg-destructive/5">
          <CardContent className="flex flex-col items-center justify-center p-8 text-center space-y-4">
            <div className="rounded-full bg-destructive/10 p-3 text-destructive" aria-hidden="true">
              <ShieldAlert className="h-8 w-8" />
            </div>
            <div className="space-y-1 max-w-md">
              <h2 className="text-lg font-semibold text-foreground">
                Access Denied: Composed Permissions Required
              </h2>
              <p className="text-sm text-muted-foreground">
                The Resource Overview synthesizes confidential balance sheet working capital and
                capital asset carrying values. You must possess{' '}
                <code className="text-xs font-mono font-semibold">inventory.read</code>,{' '}
                <code className="text-xs font-mono font-semibold">assets.read</code>, and{' '}
                <code className="text-xs font-mono font-semibold">billing.read</code> permissions or
                hold an executive role.
              </p>
            </div>
            <div className="flex items-center gap-3 pt-2">
              <Button asChild variant="outline" size="sm">
                <Link to="/resources/inventory">
                  <Boxes className="mr-1.5 h-4 w-4" /> View Inventory
                </Link>
              </Button>
              <Button asChild variant="outline" size="sm">
                <Link to="/resources/assets">
                  <Landmark className="mr-1.5 h-4 w-4" /> View Assets
                </Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // 2. Loading State (Skeleton Representation)
  if (isLoading) {
    return (
      <div
        className="space-y-8"
        data-testid="resource-overview-loading"
        aria-busy="true"
        aria-label="Loading resource overview"
      >
        {/* Header Skeleton */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-2">
            <Skeleton className="h-9 w-64" />
            <Skeleton className="h-4 w-96" />
          </div>
          <div className="flex items-center gap-2">
            <Skeleton className="h-9 w-28" />
            <Skeleton className="h-9 w-28" />
          </div>
        </div>

        {/* Overall Value Skeleton */}
        <div className="space-y-3">
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-48 w-full rounded-lg" />
        </div>

        {/* Consumable Inventory Skeleton */}
        <div className="space-y-3">
          <Skeleton className="h-6 w-56" />
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <Skeleton className="h-28 rounded-lg" />
            <Skeleton className="h-28 rounded-lg" />
            <Skeleton className="h-28 rounded-lg" />
            <Skeleton className="h-28 rounded-lg" />
          </div>
        </div>

        {/* Fixed Assets Skeleton */}
        <div className="space-y-3">
          <Skeleton className="h-6 w-48" />
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
            <Skeleton className="h-28 rounded-lg" />
            <Skeleton className="h-28 rounded-lg" />
            <Skeleton className="h-28 rounded-lg" />
            <Skeleton className="h-28 rounded-lg" />
            <Skeleton className="h-28 rounded-lg" />
          </div>
        </div>
      </div>
    );
  }

  // 3. Error State
  if (isError) {
    return (
      <div className="space-y-6" data-testid="resource-overview-error">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">Resource Overview</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Enterprise resource governance and valuation dashboard.
          </p>
        </div>

        <Card className="border-destructive/30 bg-destructive/5">
          <CardContent className="flex flex-col items-center justify-center p-8 text-center space-y-4">
            <div className="rounded-full bg-destructive/10 p-3 text-destructive" aria-hidden="true">
              <AlertCircle className="h-8 w-8" />
            </div>
            <div className="space-y-1 max-w-md">
              <h2 className="text-lg font-semibold text-foreground">
                Unable to Load Resource Overview
              </h2>
              <p className="text-sm text-muted-foreground">
                {error?.message ||
                  'A network or server error occurred while retrieving enterprise overview metrics.'}
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => void refetch()}
              className="border-destructive/30 text-destructive hover:bg-destructive/10"
            >
              <RefreshCw className="mr-2 h-4 w-4" /> Try Again
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Check for zero-data / empty estate state
  const isEstateEmpty =
    overview &&
    overview.combined.totalCombinedValueAmount === 0 &&
    overview.consumableInventory.totalDistinctItems === 0 &&
    overview.fixedAssets.totalAssetCount === 0;

  const canWriteInventory =
    hasRole('ADMIN') ||
    hasRole('SUPER_ADMIN') ||
    hasRole('OWNER') ||
    hasPermission('inventory.write');

  const canWriteAssets =
    hasRole('ADMIN') || hasRole('SUPER_ADMIN') || hasRole('OWNER') || hasPermission('assets.write');

  return (
    <div className="space-y-8" data-testid="resource-overview-page">
      {/* 1. Page Header Block */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-3xl font-bold tracking-tight text-foreground">Resource Overview</h1>
            <Badge
              variant="outline"
              className="hidden sm:inline-flex border-primary/40 text-primary"
            >
              Enterprise Dashboard
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            Synthesized operational telemetry and balance sheet valuation across consumable
            inventory and fixed assets.
          </p>
        </div>

        {/* Dashboard Actions and Filters */}
        <div className="flex flex-wrap items-center gap-2.5">
          <label className="flex items-center gap-2 text-xs font-medium text-muted-foreground bg-muted/50 px-2.5 py-1.5 rounded-md border border-border cursor-pointer select-none">
            <input
              type="checkbox"
              checked={includeArchived}
              onChange={(e) => setIncludeArchived(e.target.checked)}
              className="h-3.5 w-3.5 rounded border-border text-primary focus:ring-primary"
              aria-label="Include soft-archived and retired items in overview"
            />
            <span>Include Archived</span>
          </label>

          <Button
            variant="outline"
            size="sm"
            onClick={() => void refetch()}
            disabled={isFetching}
            title="Refresh overview metrics"
            className="h-8 text-xs"
          >
            <RefreshCw className={`mr-1.5 h-3.5 w-3.5 ${isFetching ? 'animate-spin' : ''}`} />
            Refresh
          </Button>

          <Button asChild variant="outline" size="sm" className="h-8 text-xs">
            <Link to="/resources/inventory">
              <Boxes className="mr-1.5 h-3.5 w-3.5" /> Inventory
            </Link>
          </Button>

          <Button asChild variant="outline" size="sm" className="h-8 text-xs">
            <Link to="/resources/assets">
              <Landmark className="mr-1.5 h-3.5 w-3.5" /> Fixed Assets
            </Link>
          </Button>
        </div>
      </div>

      {/* 2. Empty / Zero Data State */}
      {isEstateEmpty ? (
        <Card
          className="border-dashed border-border bg-card/50"
          data-testid="resource-overview-empty"
        >
          <CardContent className="flex flex-col items-center justify-center p-12 text-center space-y-4">
            <div className="rounded-full bg-muted p-4 text-muted-foreground" aria-hidden="true">
              <Inbox className="h-8 w-8" />
            </div>
            <div className="space-y-1.5 max-w-md">
              <h2 className="text-lg font-semibold text-foreground">
                No Resource Records Initialized
              </h2>
              <p className="text-sm text-muted-foreground">
                Your enterprise resource ledger currently has no consumable inventory products or
                fixed equipment commissioned. Register inventory stock or commission fixed capital
                equipment to begin telemetry tracking.
              </p>
            </div>
            <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
              {canWriteInventory && (
                <Button asChild variant="default" size="sm">
                  <Link to="/resources/inventory/new">
                    <PackagePlus className="mr-1.5 h-4 w-4" /> Register Product
                  </Link>
                </Button>
              )}
              {canWriteAssets && (
                <Button asChild variant="outline" size="sm">
                  <Link to="/resources/assets/new">
                    <PlusCircle className="mr-1.5 h-4 w-4" /> Commission Fixed Asset
                  </Link>
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      ) : overview ? (
        /* 3. Populated State (The 3 Conceptual Areas) */
        <div className="space-y-8">
          {/* Conceptual Area 1: Overall Resource Value */}
          <OverallResourceValueCard overview={overview} />

          {/* Conceptual Area 2: Consumable Inventory (Domain A) */}
          <ConsumableInventorySection
            inventory={overview.consumableInventory}
            currency={overview.currency}
          />

          {/* Conceptual Area 3: Fixed Assets (Domain B) */}
          <FixedAssetsSection fixedAssets={overview.fixedAssets} currency={overview.currency} />
        </div>
      ) : null}
    </div>
  );
};
