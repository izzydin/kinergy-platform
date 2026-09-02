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
  Boxes,
  CheckCircle2,
  DollarSign,
  PackagePlus,
  ArrowRight,
} from 'lucide-react';
import { useAuth } from '../../../../app/providers/auth-provider';
import { HasPermission } from '../../../../app/routes/permission-guard';
import { useLowStockItems, useInventoryValuation } from '../hooks';

export interface InventoryOverviewSummaryProps {
  onRegisterProductClick?: () => void;
}

export const InventoryOverviewSummary: React.FC<InventoryOverviewSummaryProps> = ({
  onRegisterProductClick,
}) => {
  const { currentUser } = useAuth();
  const hasValuationPermission = Boolean(
    currentUser?.permissions?.includes('valuation.read') ||
    currentUser?.permissions?.includes('billing.read') ||
    currentUser?.roles?.includes('SUPER_ADMIN') ||
    currentUser?.roles?.includes('OWNER'),
  );

  const {
    data: lowStockItems,
    isLoading: isLowStockLoading,
    isError: isLowStockError,
    refetch: refetchLowStock,
  } = useLowStockItems();

  const {
    data: valuation,
    isLoading: isValuationLoading,
    isError: isValuationError,
    refetch: refetchValuation,
  } = useInventoryValuation();

  const outOfStockCount = lowStockItems?.filter((item) => item.isOutOfStock).length ?? 0;
  const lowStockCount = lowStockItems?.length ?? 0;

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
      {/* 1. Low-Stock & Stock Health Card */}
      <Card className="border-border bg-card">
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <div className="space-y-1">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Stock Reorder Status
            </CardTitle>
            <CardDescription className="text-xs">
              Items at or below minimum threshold
            </CardDescription>
          </div>
          <div
            className={`rounded-full p-2 ${
              lowStockCount > 0
                ? 'bg-amber-100 text-amber-600 dark:bg-amber-950/50 dark:text-amber-400'
                : 'bg-emerald-100 text-emerald-600 dark:bg-emerald-950/50 dark:text-emerald-400'
            }`}
          >
            {lowStockCount > 0 ? (
              <AlertTriangle className="h-4 w-4" />
            ) : (
              <CheckCircle2 className="h-4 w-4" />
            )}
          </div>
        </CardHeader>
        <CardContent>
          {isLowStockLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-8 w-24" />
              <Skeleton className="h-4 w-36" />
            </div>
          ) : isLowStockError ? (
            <div className="space-y-2">
              <span className="text-sm text-destructive">Failed to load stock health</span>
              <Button variant="outline" size="sm" onClick={() => refetchLowStock()}>
                Retry
              </Button>
            </div>
          ) : (
            <div className="space-y-2">
              <div className="flex items-baseline gap-2">
                <span className="text-2xl font-bold text-foreground">{lowStockCount}</span>
                <span className="text-sm text-muted-foreground">items requiring attention</span>
              </div>
              <div className="flex items-center gap-2">
                {outOfStockCount > 0 && (
                  <Badge variant="destructive" size="sm">
                    {outOfStockCount} Out of Stock
                  </Badge>
                )}
                {lowStockCount === 0 ? (
                  <span className="text-xs font-medium text-emerald-600 dark:text-emerald-400">
                    All stock levels healthy
                  </span>
                ) : (
                  <Button asChild variant="link" size="sm" className="h-auto p-0 text-xs">
                    <Link to="/resources/inventory?stockStatus=LOW_STOCK">
                      View low stock catalog <ArrowRight className="ml-1 h-3 w-3" />
                    </Link>
                  </Button>
                )}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* 2. Working Capital Inventory Valuation Card (Permission Sensitive) */}
      <Card className="border-border bg-card">
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <div className="space-y-1">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Inventory Working Capital
            </CardTitle>
            <CardDescription className="text-xs">Total acquisition value on hand</CardDescription>
          </div>
          <div className="rounded-full bg-primary/10 p-2 text-primary">
            <DollarSign className="h-4 w-4" />
          </div>
        </CardHeader>
        <CardContent>
          {!hasValuationPermission ? (
            <div className="space-y-1">
              <span className="text-lg font-semibold text-muted-foreground">
                Financial Access Restricted
              </span>
              <p className="text-xs text-muted-foreground">
                Requires <code className="text-xs">valuation.read</code> or administrative
                permission.
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
            <div className="space-y-2">
              <div className="flex items-baseline gap-2">
                <span className="text-2xl font-bold text-foreground">
                  $
                  {(valuation?.totalValueAmount ?? 0).toLocaleString('en-US', {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}
                </span>
                <span className="text-xs text-muted-foreground">
                  {valuation?.currency ?? 'USD'}
                </span>
              </div>
              <p className="text-xs text-muted-foreground">
                Across {valuation?.totalDistinctItems ?? 0} SKUs (
                {valuation?.totalQuantityUnits ?? 0} total units)
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* 3. Operational Quick Actions Card */}
      <Card className="border-border bg-card">
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <div className="space-y-1">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Operational Actions
            </CardTitle>
            <CardDescription className="text-xs">Quick inventory workflows</CardDescription>
          </div>
          <div className="rounded-full bg-muted p-2 text-muted-foreground">
            <Boxes className="h-4 w-4" />
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col gap-2">
            <HasPermission name="inventory.write">
              <Button
                variant="default"
                size="sm"
                className="w-full justify-start"
                onClick={onRegisterProductClick}
              >
                <PackagePlus className="mr-2 h-4 w-4" /> Register New Product
              </Button>
            </HasPermission>
            <Button asChild variant="outline" size="sm" className="w-full justify-start">
              <Link to="/resources/inventory">
                <Boxes className="mr-2 h-4 w-4" /> Browse Full Catalog
              </Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
