import * as React from 'react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Badge,
} from '@kinergy-platform/ui';
import { Coins, Package, Landmark, Clock, ArrowUpRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { ResourceOverviewVM } from '../types';

export interface OverallResourceValueCardProps {
  overview: ResourceOverviewVM;
}

export function formatCurrency(amount: number, currency = 'USD'): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

/**
 * Area 1: Overall Resource Value Component
 *
 * Visualizes the consolidated enterprise balance sheet resource position.
 *
 * MANDATORY ARCHITECTURAL RULES:
 * 1. Must be clearly and explicitly labeled as "Combined Resource Value".
 * 2. Must NEVER be labeled as "Inventory" or "Inventory Value".
 * 3. Must NOT visually erase the distinction between Consumable Inventory and Fixed Assets.
 * 4. Displays clear attribution to both domains with respective working capital and carrying values.
 */
export const OverallResourceValueCard: React.FC<OverallResourceValueCardProps> = ({ overview }) => {
  const { combined, consumableInventory, fixedAssets, currency, calculatedAt } = overview;

  const totalCombined = combined.totalCombinedValueAmount;
  const inventoryValue = consumableInventory.totalValueAmount;
  const fixedAssetValue = fixedAssets.totalCarryingValueAmount;

  const inventoryPercent = totalCombined > 0 ? (inventoryValue / totalCombined) * 100 : 0;
  const fixedAssetPercent = totalCombined > 0 ? (fixedAssetValue / totalCombined) * 100 : 0;

  const formattedCalculatedAt = React.useMemo(() => {
    try {
      return new Date(calculatedAt).toLocaleString('en-US', {
        dateStyle: 'medium',
        timeStyle: 'short',
      });
    } catch {
      return calculatedAt;
    }
  }, [calculatedAt]);

  return (
    <section aria-labelledby="overall-resource-value-heading" className="space-y-3">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2
            id="overall-resource-value-heading"
            className="text-lg font-semibold tracking-tight text-foreground"
          >
            Executive Balance Sheet Summary
          </h2>
          <p className="text-xs text-muted-foreground">
            Aggregate working capital and capital equipment valuation
          </p>
        </div>
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Clock className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
          <span>Calculated: {formattedCalculatedAt}</span>
        </div>
      </div>

      <Card
        className="border-primary/20 bg-gradient-to-br from-card via-card to-primary/5 shadow-sm"
        data-testid="overall-resource-value-card"
      >
        <CardHeader className="pb-3">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="space-y-1">
              {/* STRICT REQUIREMENT: Clearly labeled "Combined Resource Value", NEVER "Inventory" */}
              <div className="flex items-center gap-2">
                <CardTitle
                  as="h3"
                  className="text-base font-semibold uppercase tracking-wider text-muted-foreground"
                >
                  Combined Resource Value
                </CardTitle>
                <Badge
                  variant="outline"
                  className="border-primary/30 text-primary font-mono text-[11px]"
                >
                  {currency}
                </Badge>
              </div>
              <CardDescription className="text-xs">
                Total synthesized resource balance (Working Capital + Capital Assets)
              </CardDescription>
            </div>
            <div
              className="rounded-full bg-primary/10 p-3 text-primary self-start sm:self-auto"
              aria-hidden="true"
            >
              <Coins className="h-6 w-6" />
            </div>
          </div>
        </CardHeader>

        <CardContent className="space-y-6">
          {/* Prominent Combined Total Value */}
          <div className="space-y-1">
            <div
              className="text-4xl sm:text-5xl font-extrabold tracking-tight text-foreground"
              aria-label={`Combined Resource Value: ${formatCurrency(totalCombined, currency)}`}
            >
              {formatCurrency(totalCombined, currency)}
            </div>
            <p className="text-xs text-muted-foreground">
              Consolidated enterprise resource allocation across active physical domains
            </p>
          </div>

          {/* Visual Ratio Distribution Bar */}
          <div className="space-y-1.5" aria-hidden="true">
            <div className="flex justify-between text-xs font-medium text-muted-foreground">
              <span>Domain Distribution</span>
              <span>
                {inventoryPercent.toFixed(1)}% Inventory / {fixedAssetPercent.toFixed(1)}% Assets
              </span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-muted flex">
              <div
                className="bg-blue-600 dark:bg-blue-500 transition-all duration-500"
                style={{ width: `${inventoryPercent}%` }}
                title={`Consumable Inventory: ${inventoryPercent.toFixed(1)}%`}
              />
              <div
                className="bg-emerald-600 dark:bg-emerald-500 transition-all duration-500"
                style={{ width: `${fixedAssetPercent}%` }}
                title={`Fixed Assets: ${fixedAssetPercent.toFixed(1)}%`}
              />
            </div>
          </div>

          {/* Explicit Two-Domain Attribution Breakdown (Preserves Domain Distinction) */}
          <div className="grid gap-3 sm:grid-cols-2 pt-1">
            {/* Domain A Contribution Pillar */}
            <div
              className="rounded-lg border border-border/80 bg-background/60 p-4 transition-colors hover:border-blue-500/40"
              data-testid="combined-breakdown-inventory"
            >
              <div className="flex items-center justify-between pb-2">
                <div className="flex items-center gap-2">
                  <div className="rounded-md bg-blue-500/10 p-1.5 text-blue-600 dark:text-blue-400">
                    <Package className="h-4 w-4" aria-hidden="true" />
                  </div>
                  <div>
                    <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      Consumable Inventory
                    </div>
                    <div className="text-[11px] text-muted-foreground">
                      Working capital for sale / consumption
                    </div>
                  </div>
                </div>
                <Badge variant="secondary" className="font-mono text-[11px]">
                  {inventoryPercent.toFixed(1)}%
                </Badge>
              </div>
              <div className="pt-1 flex items-baseline justify-between">
                <span className="text-xl font-bold text-foreground">
                  {formatCurrency(inventoryValue, currency)}
                </span>
                <Link
                  to="/resources/inventory"
                  className="inline-flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700 dark:text-blue-400"
                  aria-label="View consumable inventory details"
                >
                  View Details <ArrowUpRight className="h-3 w-3" />
                </Link>
              </div>
            </div>

            {/* Domain B Contribution Pillar */}
            <div
              className="rounded-lg border border-border/80 bg-background/60 p-4 transition-colors hover:border-emerald-500/40"
              data-testid="combined-breakdown-assets"
            >
              <div className="flex items-center justify-between pb-2">
                <div className="flex items-center gap-2">
                  <div className="rounded-md bg-emerald-500/10 p-1.5 text-emerald-600 dark:text-emerald-400">
                    <Landmark className="h-4 w-4" aria-hidden="true" />
                  </div>
                  <div>
                    <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      Fixed Assets
                    </div>
                    <div className="text-[11px] text-muted-foreground">
                      Capital equipment owned by business
                    </div>
                  </div>
                </div>
                <Badge variant="secondary" className="font-mono text-[11px]">
                  {fixedAssetPercent.toFixed(1)}%
                </Badge>
              </div>
              <div className="pt-1 flex items-baseline justify-between">
                <span className="text-xl font-bold text-foreground">
                  {formatCurrency(fixedAssetValue, currency)}
                </span>
                <Link
                  to="/resources/assets"
                  className="inline-flex items-center gap-1 text-xs text-emerald-600 hover:text-emerald-700 dark:text-emerald-400"
                  aria-label="View fixed assets details"
                >
                  View Details <ArrowUpRight className="h-3 w-3" />
                </Link>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </section>
  );
};
