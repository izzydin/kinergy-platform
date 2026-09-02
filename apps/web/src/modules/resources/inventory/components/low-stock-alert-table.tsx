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
import { AlertCircle, CheckCircle2, PackageCheck, ArrowRight } from 'lucide-react';
import { useLowStockItems } from '../hooks';
import { StockLevelGauge } from './stock-level-gauge';
import { InventoryStatusBadge } from './inventory-status-badge';
import type { InventoryProductVM } from '../types';

export interface LowStockAlertTableProps {
  onReceiveStockClick?: (product: InventoryProductVM) => void;
}

export const LowStockAlertTable: React.FC<LowStockAlertTableProps> = ({ onReceiveStockClick }) => {
  const { data: items, isLoading, isError, refetch } = useLowStockItems();

  return (
    <Card className="border-border bg-card">
      <CardHeader className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <CardTitle className="flex items-center gap-2 text-lg">
            <span>Low-Stock Attention Queue</span>
            {items && items.length > 0 && (
              <Badge variant="destructive" size="sm">
                {items.length} Needs Reorder
              </Badge>
            )}
          </CardTitle>
          <CardDescription>
            Products with inventory levels at or below configured reorder thresholds.
          </CardDescription>
        </div>
        <Button asChild variant="outline" size="sm">
          <Link to="/resources/inventory/low-stock">
            View Full Queue <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
          </Link>
        </Button>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-3">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
          </div>
        ) : isError ? (
          <div className="flex flex-col items-center justify-center p-6 text-center space-y-3">
            <AlertCircle className="h-8 w-8 text-destructive" />
            <div className="space-y-1">
              <p className="font-semibold text-foreground">Failed to load low-stock items</p>
              <p className="text-sm text-muted-foreground">
                An error occurred while fetching inventory health data.
              </p>
            </div>
            <Button variant="outline" size="sm" onClick={() => refetch()}>
              Try Again
            </Button>
          </div>
        ) : !items || items.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-8 text-center space-y-3 bg-muted/20 rounded-lg border border-dashed border-border">
            <CheckCircle2 className="h-10 w-10 text-emerald-600 dark:text-emerald-400" />
            <div className="space-y-1">
              <p className="font-semibold text-foreground">All Inventory Stocks Healthy</p>
              <p className="text-sm text-muted-foreground">
                No products currently fall below their reorder threshold quantities.
              </p>
            </div>
            <Button asChild variant="outline" size="sm">
              <Link to="/resources/inventory">Browse Full Catalog</Link>
            </Button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-border bg-muted/40 text-xs font-semibold text-muted-foreground uppercase">
                <tr>
                  <th className="py-3 px-4">SKU / Product</th>
                  <th className="py-3 px-4">Category</th>
                  <th className="py-3 px-4">Stock on Hand</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {items.map((item) => (
                  <tr key={item.id} className="hover:bg-muted/30 transition-colors">
                    <td className="py-3 px-4">
                      <div className="font-medium text-foreground">
                        <Link
                          to={`/resources/inventory/${item.id}`}
                          className="hover:underline text-primary"
                        >
                          {item.name}
                        </Link>
                      </div>
                      <div className="text-xs text-muted-foreground font-mono">{item.sku}</div>
                    </td>
                    <td className="py-3 px-4 text-muted-foreground">
                      {item.category.replace(/_/g, ' ')}
                    </td>
                    <td className="py-3 px-4">
                      <StockLevelGauge
                        currentStock={item.currentStock}
                        reorderThreshold={item.reorderThreshold}
                        unit={item.unitOfMeasure}
                        isLowStock={item.isLowStock}
                        isOutOfStock={item.isOutOfStock}
                      />
                    </td>
                    <td className="py-3 px-4">
                      <InventoryStatusBadge status={item.status} />
                    </td>
                    <td className="py-3 px-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        {onReceiveStockClick && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => onReceiveStockClick(item)}
                          >
                            <PackageCheck className="mr-1.5 h-3.5 w-3.5" /> Receive Stock
                          </Button>
                        )}
                        <Button asChild variant="ghost" size="sm">
                          <Link to={`/resources/inventory/${item.id}`}>Details</Link>
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
};
