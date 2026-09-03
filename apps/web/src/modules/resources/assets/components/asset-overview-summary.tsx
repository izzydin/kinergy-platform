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
  Skeleton,
} from '@kinergy-platform/ui';
import {
  AlertTriangle,
  CheckCircle2,
  DollarSign,
  PlusCircle,
  ArrowRight,
  ShieldAlert,
  Layers,
} from 'lucide-react';
import { useAuth } from '../../../../app/providers/auth-provider';
import { HasPermission } from '../../../../app/routes/permission-guard';
import { useAssetsList, useAssetValuationSummary } from '../hooks';
import { AssetStatus } from '../types';

export interface AssetOverviewSummaryProps {
  onCommissionAssetClick?: () => void;
}

export const AssetOverviewSummary: React.FC<AssetOverviewSummaryProps> = ({
  onCommissionAssetClick,
}) => {
  const { currentUser } = useAuth();

  // Dual-permission gate: capital equipment carrying values are restricted financial data
  const hasValuationPermission = Boolean(
    currentUser?.permissions?.includes('billing.read') ||
    currentUser?.permissions?.includes('valuation.read') ||
    currentUser?.roles?.includes('SUPER_ADMIN') ||
    currentUser?.roles?.includes('OWNER') ||
    currentUser?.roles?.includes('ADMIN'),
  );

  // 1. Authoritative Operational Counts
  const {
    data: activeData,
    isLoading: isActiveLoading,
    isError: isActiveError,
    refetch: refetchActive,
  } = useAssetsList({ status: AssetStatus.ACTIVE, limit: 1 });

  const {
    data: totalData,
    isLoading: isTotalLoading,
    refetch: refetchTotal,
  } = useAssetsList({ limit: 1, includeDecommissioned: true });

  const {
    data: maintenanceData,
    isLoading: isMaintenanceLoading,
    isError: isMaintenanceError,
    refetch: refetchMaintenance,
  } = useAssetsList({ status: AssetStatus.UNDER_MAINTENANCE, limit: 1 });

  const {
    data: damagedData,
    isLoading: isDamagedLoading,
    isError: isDamagedError,
    refetch: refetchDamaged,
  } = useAssetsList({ status: AssetStatus.DAMAGED, limit: 1 });

  // 2. Dual-permission protected valuation summary (disabled if unauthorized to avoid 403s)
  const {
    data: valuation,
    isLoading: isValuationLoading,
    isError: isValuationError,
    refetch: refetchValuation,
  } = useAssetValuationSummary(undefined, { enabled: hasValuationPermission });

  const activeCount = activeData?.total ?? 0;
  const totalCount = totalData?.total ?? 0;
  const maintenanceCount = maintenanceData?.total ?? 0;
  const damagedCount = damagedData?.total ?? 0;
  const attentionCount = maintenanceCount + damagedCount;

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4" data-testid="asset-overview-summary">
      {/* 1. Active In-Service Equipment Card */}
      <Card className="border-border bg-card">
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <div className="space-y-1">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Active In-Service
            </CardTitle>
            <CardDescription className="text-xs">
              Operational physical assets in deployment
            </CardDescription>
          </div>
          <div className="rounded-full bg-emerald-100 p-2 text-emerald-600 dark:bg-emerald-950/50 dark:text-emerald-400">
            <CheckCircle2 className="h-4 w-4" />
          </div>
        </CardHeader>
        <CardContent>
          {isActiveLoading || isTotalLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-8 w-24" />
              <Skeleton className="h-4 w-36" />
            </div>
          ) : isActiveError ? (
            <div className="space-y-2">
              <span className="text-sm text-destructive">Failed to load active count</span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  refetchActive();
                  refetchTotal();
                }}
              >
                Retry
              </Button>
            </div>
          ) : (
            <div className="space-y-2">
              <div className="flex items-baseline gap-2">
                <span className="text-2xl font-bold text-foreground">{activeCount}</span>
                <span className="text-xs text-muted-foreground">of {totalCount} total assets</span>
              </div>
              <div className="flex items-center gap-2">
                <Button asChild variant="link" size="sm" className="h-auto p-0 text-xs">
                  <Link to="/resources/assets?status=ACTIVE">
                    View active catalog <ArrowRight className="ml-1 h-3 w-3" />
                  </Link>
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* 2. Operational Attention & Maintenance Card */}
      <Card className="border-border bg-card">
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <div className="space-y-1">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Needs Attention
            </CardTitle>
            <CardDescription className="text-xs">
              Equipment under servicing or damaged
            </CardDescription>
          </div>
          <div
            className={`rounded-full p-2 ${
              attentionCount > 0
                ? 'bg-amber-100 text-amber-600 dark:bg-amber-950/50 dark:text-amber-400'
                : 'bg-emerald-100 text-emerald-600 dark:bg-emerald-950/50 dark:text-emerald-400'
            }`}
          >
            {attentionCount > 0 ? (
              <AlertTriangle className="h-4 w-4" />
            ) : (
              <CheckCircle2 className="h-4 w-4" />
            )}
          </div>
        </CardHeader>
        <CardContent>
          {isMaintenanceLoading || isDamagedLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-8 w-24" />
              <Skeleton className="h-4 w-36" />
            </div>
          ) : isMaintenanceError || isDamagedError ? (
            <div className="space-y-2">
              <span className="text-sm text-destructive">Failed to load attention metrics</span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  refetchMaintenance();
                  refetchDamaged();
                }}
              >
                Retry
              </Button>
            </div>
          ) : (
            <div className="space-y-2">
              <div className="flex items-baseline gap-2">
                <span className="text-2xl font-bold text-foreground">{attentionCount}</span>
                <span className="text-xs text-muted-foreground">assets offline</span>
              </div>
              <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                {maintenanceCount > 0 && (
                  <Badge
                    variant="outline"
                    className="border-amber-500/30 text-amber-700 dark:text-amber-300 text-[10px] px-1.5 py-0"
                  >
                    {maintenanceCount} In Service
                  </Badge>
                )}
                {damagedCount > 0 && (
                  <Badge variant="destructive" className="text-[10px] px-1.5 py-0">
                    {damagedCount} Damaged
                  </Badge>
                )}
                {attentionCount === 0 && (
                  <span className="text-xs font-medium text-emerald-600 dark:text-emerald-400">
                    All equipment operational
                  </span>
                )}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* 3. Estate Carrying Valuation Card (Permission Sensitive) */}
      <Card className="border-border bg-card">
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <div className="space-y-1">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Estate Carrying Value
            </CardTitle>
            <CardDescription className="text-xs">
              Net balance sheet equipment valuation
            </CardDescription>
          </div>
          <div className="rounded-full bg-primary/10 p-2 text-primary">
            <DollarSign className="h-4 w-4" />
          </div>
        </CardHeader>
        <CardContent>
          {!hasValuationPermission ? (
            <div className="space-y-1" data-testid="valuation-restricted">
              <div className="flex items-center gap-1.5 text-muted-foreground">
                <ShieldAlert className="h-4 w-4 text-amber-500" />
                <span className="text-sm font-semibold">Financial Access Restricted</span>
              </div>
              <p className="text-xs text-muted-foreground">
                Requires <code className="text-xs font-mono">billing.read</code> or executive
                authorization.
              </p>
            </div>
          ) : isValuationLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-8 w-32" />
              <Skeleton className="h-4 w-40" />
            </div>
          ) : isValuationError ? (
            <div className="space-y-2">
              <span className="text-sm text-destructive">Failed to calculate valuation</span>
              <Button variant="outline" size="sm" onClick={() => refetchValuation()}>
                Retry
              </Button>
            </div>
          ) : (
            <div className="space-y-2" data-testid="valuation-authorized">
              <div className="flex items-baseline gap-2">
                <span className="text-2xl font-bold text-foreground">
                  $
                  {(valuation?.totalCarryingValueAmount ?? 0).toLocaleString('en-US', {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}
                </span>
                <span className="text-xs text-muted-foreground">
                  {valuation?.currency ?? 'USD'}
                </span>
              </div>
              <p className="text-xs text-muted-foreground">
                CAPEX Cost: $
                {(valuation?.totalPurchaseValueAmount ?? 0).toLocaleString('en-US', {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* 4. Operational Quick Actions Card */}
      <Card className="border-border bg-card">
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <div className="space-y-1">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Equipment Operations
            </CardTitle>
            <CardDescription className="text-xs">
              Fast-path asset management actions
            </CardDescription>
          </div>
          <div className="rounded-full bg-muted p-2 text-muted-foreground">
            <Layers className="h-4 w-4" />
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col gap-2">
            <HasPermission name="assets.write">
              <Button
                variant="default"
                size="sm"
                className="w-full justify-start text-xs"
                onClick={onCommissionAssetClick}
                asChild={!onCommissionAssetClick}
              >
                {onCommissionAssetClick ? (
                  <>
                    <PlusCircle className="mr-2 h-3.5 w-3.5" /> Commission Asset
                  </>
                ) : (
                  <Link to="/resources/assets/new">
                    <PlusCircle className="mr-2 h-3.5 w-3.5" /> Commission Asset
                  </Link>
                )}
              </Button>
            </HasPermission>
            <Button asChild variant="outline" size="sm" className="w-full justify-start text-xs">
              <Link to="/resources/assets">
                <Layers className="mr-2 h-3.5 w-3.5" /> Full Asset Catalog
              </Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
