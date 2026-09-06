import * as React from 'react';
import { Link } from 'react-router-dom';
import { Badge, Button } from '@kinergy-platform/ui';
import {
  Boxes,
  AlertTriangle,
  CheckCircle2,
  Package,
  Layers,
  ArrowRight,
  DollarSign,
} from 'lucide-react';
import { ResourceMetricCard } from './resource-metric-card';
import { formatCurrency } from './overall-resource-value-card';
import type { ConsumableInventoryOverviewVM } from '../types';

export interface ConsumableInventorySectionProps {
  inventory: ConsumableInventoryOverviewVM;
  currency: string;
}

/**
 * Domain A: Consumable Inventory Dashboard Section
 *
 * Core Concept: "What we have available for sale or consumption"
 * Visualizes working capital investment and immediate reorder risk telemetry.
 */
export const ConsumableInventorySection: React.FC<ConsumableInventorySectionProps> = ({
  inventory,
  currency,
}) => {
  const { totalValueAmount, lowStockItemCount, totalDistinctItems, totalQuantityUnits } = inventory;

  const hasLowStock = lowStockItemCount > 0;

  return (
    <section
      aria-labelledby="domain-a-heading"
      className="space-y-4"
      data-testid="consumable-inventory-section"
    >
      {/* Section Header with Domain Concept Statement */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between border-b border-border/60 pb-3">
        <div>
          <div className="flex items-center gap-2">
            <h2 id="domain-a-heading" className="text-xl font-bold tracking-tight text-foreground">
              Consumable Inventory
            </h2>
            <Badge
              variant="outline"
              className="border-blue-500/30 text-blue-600 dark:text-blue-400"
            >
              Domain A
            </Badge>
          </div>
          {/* Explicit Concept Hierarchy as required by architecture */}
          <p className="text-sm font-medium text-muted-foreground mt-0.5">
            &ldquo;What we have available for sale or consumption&rdquo;
          </p>
        </div>

        {/* Quick Navigation Actions */}
        <div className="flex items-center gap-2">
          <Button asChild variant="outline" size="sm" className="h-8 text-xs">
            <Link to="/resources/inventory">
              <Boxes className="mr-1.5 h-3.5 w-3.5" /> Full Catalog
            </Link>
          </Button>
          {hasLowStock && (
            <Button asChild variant="default" size="sm" className="h-8 text-xs">
              <Link to="/resources/inventory/low-stock">
                <AlertTriangle className="mr-1.5 h-3.5 w-3.5" /> Reorder Queue ({lowStockItemCount})
              </Link>
            </Button>
          )}
        </div>
      </div>

      {/* Responsive Metric Grid */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {/* 1. Consumable Inventory Value */}
        <ResourceMetricCard
          title="Consumable Inventory Value"
          value={formatCurrency(totalValueAmount, currency)}
          description="Total acquisition cost of stock on hand"
          icon={<DollarSign className="h-5 w-5" />}
          iconContainerClassName="bg-blue-500/10 text-blue-600 dark:text-blue-400"
          dataTestId="metric-inventory-value"
          footer={
            <div className="flex items-center justify-between">
              <span>Working capital</span>
              <span className="font-mono text-[11px] text-foreground">{currency}</span>
            </div>
          }
        />

        {/* 2. Low Stock Items */}
        <ResourceMetricCard
          title="Low Stock Items"
          value={lowStockItemCount}
          description="Products at or below reorder threshold"
          icon={
            hasLowStock ? (
              <AlertTriangle className="h-5 w-5" />
            ) : (
              <CheckCircle2 className="h-5 w-5" />
            )
          }
          iconContainerClassName={
            hasLowStock
              ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400'
              : 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
          }
          dataTestId="metric-low-stock"
          badge={
            hasLowStock ? (
              <Badge variant="destructive" className="flex items-center gap-1 text-[11px]">
                <AlertTriangle className="h-3 w-3" aria-hidden="true" />
                <span>Reorder Required</span>
              </Badge>
            ) : (
              <Badge
                variant="outline"
                className="border-emerald-500/30 text-emerald-600 dark:text-emerald-400 flex items-center gap-1 text-[11px]"
              >
                <CheckCircle2 className="h-3 w-3" aria-hidden="true" />
                <span>Stock Healthy</span>
              </Badge>
            )
          }
          footer={
            hasLowStock ? (
              <Link
                to="/resources/inventory/low-stock"
                className="inline-flex items-center gap-1 text-amber-600 hover:text-amber-700 dark:text-amber-400 font-medium"
              >
                Review reorder queue <ArrowRight className="h-3 w-3" />
              </Link>
            ) : (
              <span>No immediate purchase orders needed</span>
            )
          }
        />

        {/* 3. Distinct Inventory Items / SKUs */}
        <ResourceMetricCard
          title="Distinct Products"
          value={totalDistinctItems}
          description="Active catalog product SKUs"
          icon={<Package className="h-5 w-5" />}
          iconContainerClassName="bg-indigo-500/10 text-indigo-600 dark:text-indigo-400"
          dataTestId="metric-distinct-items"
          footer={
            <Link
              to="/resources/inventory"
              className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground"
            >
              Browse catalog <ArrowRight className="h-3 w-3" />
            </Link>
          }
        />

        {/* 4. Total Physical Units */}
        <ResourceMetricCard
          title="Total Physical Units"
          value={totalQuantityUnits.toLocaleString('en-US')}
          description="Total aggregated units on hand"
          icon={<Layers className="h-5 w-5" />}
          iconContainerClassName="bg-cyan-500/10 text-cyan-600 dark:text-cyan-400"
          dataTestId="metric-total-units"
          footer={<span>Across all active catalog categories</span>}
        />
      </div>
    </section>
  );
};
