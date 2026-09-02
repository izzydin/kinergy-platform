import React from 'react';
import { Card, CardContent, Badge } from '@kinergy-platform/ui';
import {
  TrendingUp,
  TrendingDown,
  Scale,
  Package,
  AlertTriangle,
  CheckCircle2,
} from 'lucide-react';
import type { InventoryProductVM, StockMovementVM } from '../types';

export interface MovementHistorySummaryProps {
  readonly product: InventoryProductVM;
  readonly movements: StockMovementVM[];
}

export const MovementHistorySummary: React.FC<MovementHistorySummaryProps> = ({
  product,
  movements,
}) => {
  // Compute operational aggregates across the movements on record
  const inboundTotal = movements.reduce((acc, m) => {
    if (m.type === 'PURCHASE' || m.type === 'ADJUSTMENT_IN') {
      return acc + m.quantity;
    }
    return acc;
  }, 0);

  const outboundTotal = movements.reduce((acc, m) => {
    if (m.type === 'SALE' || m.type === 'CONSUMPTION') {
      return acc + m.quantity;
    }
    return acc;
  }, 0);

  const shrinkageTotal = movements.reduce((acc, m) => {
    if (m.type === 'SCRAP' || m.type === 'ADJUSTMENT_OUT') {
      return acc + m.quantity;
    }
    return acc;
  }, 0);

  return (
    <Card className="border bg-card shadow-xs" data-testid="movement-history-summary">
      <CardContent className="p-4 sm:p-5 space-y-4">
        {/* Operational Story KPI Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {/* 1. Inbound Receipts */}
          <div className="p-3 rounded-lg bg-muted/40 border border-border/60">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
              <TrendingUp className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
              <span>Inbound Receipts</span>
            </div>
            <div className="text-xl font-bold font-mono text-emerald-600 dark:text-emerald-400">
              +{inboundTotal}{' '}
              <span className="text-xs font-sans font-normal text-muted-foreground">
                {product.unitOfMeasure}
              </span>
            </div>
          </div>

          {/* 2. Outbound Operations */}
          <div className="p-3 rounded-lg bg-muted/40 border border-border/60">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
              <TrendingDown className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400" />
              <span>Outbound Dispatches</span>
            </div>
            <div className="text-xl font-bold font-mono text-blue-600 dark:text-blue-400">
              -{outboundTotal}{' '}
              <span className="text-xs font-sans font-normal text-muted-foreground">
                {product.unitOfMeasure}
              </span>
            </div>
          </div>

          {/* 3. Shrinkage & Disposal */}
          <div className="p-3 rounded-lg bg-muted/40 border border-border/60">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
              <Scale className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" />
              <span>Audit / Scrap Losses</span>
            </div>
            <div className="text-xl font-bold font-mono text-amber-600 dark:text-amber-400">
              -{shrinkageTotal}{' '}
              <span className="text-xs font-sans font-normal text-muted-foreground">
                {product.unitOfMeasure}
              </span>
            </div>
          </div>

          {/* 4. Current Available Balance */}
          <div className="p-3 rounded-lg bg-muted/40 border border-border/60">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
              <Package className="h-3.5 w-3.5 text-primary" />
              <span>Current Stock on Hand</span>
            </div>
            <div
              className={`text-xl font-bold font-mono ${
                product.isOutOfStock
                  ? 'text-destructive'
                  : product.isLowStock
                    ? 'text-amber-600 dark:text-amber-400'
                    : 'text-foreground'
              }`}
            >
              {product.currentStock}{' '}
              <span className="text-xs font-sans font-normal text-muted-foreground">
                {product.unitOfMeasure}
              </span>
            </div>
          </div>
        </div>

        {/* Narrative Reconstructor Banner */}
        <div className="flex items-center justify-between text-xs px-3 py-2 rounded-md bg-muted/30 border border-border/50">
          <div className="flex items-center gap-2">
            {product.isOutOfStock ? (
              <AlertTriangle className="h-4 w-4 text-destructive shrink-0" />
            ) : product.isLowStock ? (
              <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0" />
            ) : (
              <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
            )}
            <span className="text-foreground">
              {product.isOutOfStock ? (
                <>
                  <span className="font-semibold text-destructive">Depletion Story:</span> Outbound
                  retail sales, clinical treatments, or physical write-offs have completely
                  exhausted available stock.
                </>
              ) : product.isLowStock ? (
                <>
                  <span className="font-semibold text-amber-600 dark:text-amber-400">
                    Attention:
                  </span>{' '}
                  Current balance has dropped to or below the reorder threshold (
                  {product.reorderThreshold} {product.unitOfMeasure}).
                </>
              ) : (
                <>
                  <span className="font-semibold text-emerald-600 dark:text-emerald-400">
                    Ledger Balanced:
                  </span>{' '}
                  Stock levels remain comfortably above the minimum reorder threshold.
                </>
              )}
            </span>
          </div>

          <Badge
            variant={
              product.isOutOfStock ? 'destructive' : product.isLowStock ? 'outline' : 'secondary'
            }
          >
            {product.isOutOfStock ? 'Out of Stock' : product.isLowStock ? 'Low Stock' : 'Optimal'}
          </Badge>
        </div>
      </CardContent>
    </Card>
  );
};
