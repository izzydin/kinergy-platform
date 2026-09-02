import React from 'react';
import { Link } from 'react-router-dom';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
  Button,
  Badge,
  Skeleton,
} from '@kinergy-platform/ui';
import {
  AlertTriangle,
  PackageX,
  AlertCircle,
  TrendingDown,
  CheckCircle2,
  PackagePlus,
  ArrowRight,
  RefreshCw,
} from 'lucide-react';
import { HasPermission } from '../../../../app/routes/permission-guard';
import { StockLevelGauge } from './stock-level-gauge';
import type { InventoryProductVM } from '../types';

export interface LowStockAttentionQueueProps {
  readonly items?: InventoryProductVM[];
  readonly isLoading: boolean;
  readonly isError: boolean;
  readonly errorMessage?: string;
  readonly onRetry: () => void;
  readonly onReceiveStock: (product: InventoryProductVM) => void;
}

export const LowStockAttentionQueue: React.FC<LowStockAttentionQueueProps> = ({
  items = [],
  isLoading,
  isError,
  errorMessage,
  onRetry,
  onReceiveStock,
}) => {
  // Compute operational triage metrics
  const outOfStockItems = items.filter((item) => item.currentStock === 0);
  const lowStockItems = items.filter(
    (item) => item.currentStock > 0 && item.currentStock <= item.reorderThreshold,
  );
  const totalDeficitUnits = items.reduce(
    (sum, item) => sum + Math.max(0, item.reorderThreshold - item.currentStock),
    0,
  );

  return (
    <div className="space-y-6" data-testid="low-stock-attention-queue">
      {/* 1. Operational Attention Metrics Bar */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="border-border bg-card">
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Attention Required
            </CardTitle>
            <AlertTriangle className="h-4 w-4 text-amber-500" />
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-8 w-16" />
            ) : (
              <div
                className="text-2xl font-bold text-foreground"
                data-testid="metric-total-attention"
              >
                {items.length}
              </div>
            )}
            <p className="text-xs text-muted-foreground mt-1">
              Products at or below minimum threshold
            </p>
          </CardContent>
        </Card>

        <Card className="border-border bg-card">
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Critical Out of Stock
            </CardTitle>
            <PackageX className="h-4 w-4 text-destructive" />
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-8 w-16" />
            ) : (
              <div
                className="text-2xl font-bold text-destructive"
                data-testid="metric-out-of-stock"
              >
                {outOfStockItems.length}
              </div>
            )}
            <p className="text-xs text-muted-foreground mt-1">
              Zero units on hand (exhausted stock)
            </p>
          </CardContent>
        </Card>

        <Card className="border-border bg-card">
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Low Stock Warnings
            </CardTitle>
            <AlertCircle className="h-4 w-4 text-amber-500" />
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-8 w-16" />
            ) : (
              <div
                className="text-2xl font-bold text-amber-600 dark:text-amber-400"
                data-testid="metric-low-stock"
              >
                {lowStockItems.length}
              </div>
            )}
            <p className="text-xs text-muted-foreground mt-1">Stock on hand ≤ reorder minimum</p>
          </CardContent>
        </Card>

        <Card className="border-border bg-card">
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Reorder Deficit
            </CardTitle>
            <TrendingDown className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-8 w-16" />
            ) : (
              <div
                className="text-2xl font-bold text-foreground"
                data-testid="metric-total-deficit"
              >
                +{totalDeficitUnits.toLocaleString()}
              </div>
            )}
            <p className="text-xs text-muted-foreground mt-1">
              Units needed to restore safety thresholds
            </p>
          </CardContent>
        </Card>
      </div>

      {/* 2. Main Attention Queue Card */}
      <Card className="border-border bg-card">
        <CardHeader className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between border-b border-border/50 pb-4">
          <div>
            <CardTitle className="flex items-center gap-2 text-lg">
              <span>Operational Reorder Queue</span>
              {items.length > 0 && (
                <Badge variant="destructive" size="sm">
                  {items.length} Needing Replenishment
                </Badge>
              )}
            </CardTitle>
            <CardDescription>
              Prioritized list of consumable inventory where stock balance is at or below minimum
              threshold.
            </CardDescription>
          </div>
          <Button asChild variant="outline" size="sm">
            <Link to="/resources/inventory">
              Full Catalog <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
            </Link>
          </Button>
        </CardHeader>

        <CardContent className="pt-6">
          {isLoading ? (
            <div className="space-y-4" data-testid="low-stock-loading">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-16 w-full" />
            </div>
          ) : isError ? (
            <div
              className="flex flex-col items-center justify-center p-8 text-center space-y-3 bg-destructive/10 rounded-lg border border-destructive/20"
              data-testid="low-stock-error"
            >
              <AlertCircle className="h-10 w-10 text-destructive" />
              <div className="space-y-1">
                <p className="font-semibold text-foreground">
                  Failed to load low-stock attention queue
                </p>
                <p className="text-sm text-muted-foreground">
                  {errorMessage || 'Unable to retrieve inventory attention items from the server.'}
                </p>
              </div>
              <Button variant="outline" size="sm" onClick={onRetry}>
                <RefreshCw className="mr-1.5 h-3.5 w-3.5" /> Retry Query
              </Button>
            </div>
          ) : items.length === 0 ? (
            <div
              className="flex flex-col items-center justify-center p-12 text-center space-y-4 bg-muted/20 rounded-xl border border-dashed border-border"
              data-testid="low-stock-empty-healthy"
            >
              <div className="p-3 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 rounded-full">
                <CheckCircle2 className="h-12 w-12" />
              </div>
              <div className="space-y-1.5 max-w-md">
                <h3 className="text-lg font-semibold text-foreground">
                  All Inventory Stocks Healthy
                </h3>
                <p className="text-sm text-muted-foreground">
                  No products currently fall at or below configured reorder thresholds. All
                  consumable stock meets or exceeds required operational safety baselines.
                </p>
              </div>
              <Button asChild variant="outline" size="sm">
                <Link to="/resources/inventory">Browse Full Catalog</Link>
              </Button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm" data-testid="low-stock-table">
                <thead className="border-b border-border bg-muted/40 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  <tr>
                    <th className="py-3 px-4">Product / SKU</th>
                    <th className="py-3 px-4">Category</th>
                    <th className="py-3 px-4">Stock Level vs Minimum</th>
                    <th className="py-3 px-4">Urgency & Deficit</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {items.map((product) => {
                    const deficit = Math.max(0, product.reorderThreshold - product.currentStock);
                    const isZero = product.currentStock === 0;

                    return (
                      <tr
                        key={product.id}
                        className="hover:bg-muted/30 transition-colors"
                        data-testid={`low-stock-row-${product.id}`}
                      >
                        {/* Product & SKU */}
                        <td className="py-3.5 px-4">
                          <div className="font-semibold text-foreground">
                            <Link
                              to={`/resources/inventory/${product.id}`}
                              className="hover:underline text-primary"
                            >
                              {product.name}
                            </Link>
                          </div>
                          <div className="text-xs text-muted-foreground font-mono mt-0.5">
                            {product.sku}
                          </div>
                        </td>

                        {/* Category */}
                        <td className="py-3.5 px-4 text-muted-foreground">
                          <Badge variant="secondary" size="sm">
                            {product.category.replace(/_/g, ' ')}
                          </Badge>
                        </td>

                        {/* Stock Gauge */}
                        <td className="py-3.5 px-4 min-w-[180px]">
                          <StockLevelGauge
                            currentStock={product.currentStock}
                            reorderThreshold={product.reorderThreshold}
                            unit={product.unitOfMeasure}
                            isLowStock={product.isLowStock}
                            isOutOfStock={product.isOutOfStock}
                          />
                        </td>

                        {/* Urgency & Deficit */}
                        <td className="py-3.5 px-4">
                          <div className="flex flex-col gap-1 items-start">
                            {isZero ? (
                              <Badge variant="destructive" size="sm">
                                OUT OF STOCK
                              </Badge>
                            ) : (
                              <Badge
                                variant="outline"
                                size="sm"
                                className="border-amber-500/40 text-amber-600 dark:text-amber-400 bg-amber-500/10"
                              >
                                LOW STOCK
                              </Badge>
                            )}
                            <span className="text-xs font-medium text-muted-foreground">
                              Deficit: <strong className="text-foreground">+{deficit}</strong>{' '}
                              {product.unitOfMeasure}
                            </span>
                          </div>
                        </td>

                        {/* Authorized Actions */}
                        <td className="py-3.5 px-4 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <HasPermission name="inventory.write">
                              <Button
                                variant="default"
                                size="sm"
                                onClick={() => onReceiveStock(product)}
                                data-testid={`receive-stock-btn-${product.id}`}
                              >
                                <PackagePlus className="mr-1.5 h-3.5 w-3.5" /> Receive Stock
                              </Button>
                            </HasPermission>
                            <Button asChild variant="ghost" size="sm">
                              <Link to={`/resources/inventory/${product.id}`}>Details</Link>
                            </Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};
