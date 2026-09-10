import React from 'react';
import { Badge } from '@kinergy-platform/ui';

export interface StockLevelGaugeProps {
  currentStock: number;
  reorderThreshold: number;
  unit: string;
  isLowStock: boolean;
  isOutOfStock: boolean;
  className?: string;
}

export const StockLevelGauge: React.FC<StockLevelGaugeProps> = ({
  currentStock,
  reorderThreshold,
  unit,
  isLowStock,
  isOutOfStock,
  className,
}) => {
  if (isOutOfStock) {
    return (
      <div
        role="status"
        aria-label={`Stock level: 0 ${unit}, Out of Stock (Reorder threshold: ${reorderThreshold})`}
        className={`inline-flex items-center gap-1.5 font-medium ${className ?? ''}`}
      >
        <span className="text-destructive font-bold">0 {unit}</span>
        <Badge variant="destructive" size="sm">
          Out of Stock
        </Badge>
      </div>
    );
  }

  if (isLowStock) {
    return (
      <div
        role="status"
        aria-label={`Stock level: ${currentStock} ${unit}, Low Stock, at or below threshold of ${reorderThreshold} ${unit}`}
        className={`inline-flex items-center gap-1.5 font-medium ${className ?? ''}`}
      >
        <span className="text-amber-600 dark:text-amber-400 font-semibold">
          {currentStock} {unit}
        </span>
        <Badge variant="outline" size="sm" className="border-amber-500 text-amber-600">
          Low Stock (&le; {reorderThreshold})
        </Badge>
      </div>
    );
  }

  return (
    <div
      role="status"
      aria-label={`Stock level: ${currentStock} ${unit}, Adequate Stock (Reorder threshold: ${reorderThreshold})`}
      className={`inline-flex items-center gap-1.5 ${className ?? ''}`}
    >
      <span className="text-foreground font-medium">
        {currentStock} {unit}
      </span>
      <span className="text-muted-foreground text-xs">(Min: {reorderThreshold})</span>
    </div>
  );
};
