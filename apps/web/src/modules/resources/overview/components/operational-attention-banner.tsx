import * as React from 'react';
import { Link } from 'react-router-dom';
import { Card, CardContent, Badge, Button } from '@kinergy-platform/ui';
import {
  AlertTriangle,
  AlertOctagon,
  Wrench,
  CheckCircle2,
  ArrowRight,
  ShieldCheck,
} from 'lucide-react';
import type { ResourceOverviewVM } from '../types';

export interface OperationalAttentionBannerProps {
  overview: ResourceOverviewVM;
}

/**
 * Operational Attention & Fleet Status Banner
 *
 * Surfaces immediate operational action items from authoritative server counts:
 * - Low-stock consumable products at or below reorder threshold
 * - Damaged capital equipment requiring repair or safety review
 * - Offline assets currently undergoing maintenance
 *
 * When zero items require intervention, displays an affirmative operational health badge.
 */
export const OperationalAttentionBanner: React.FC<OperationalAttentionBannerProps> = ({
  overview,
}) => {
  const { consumableInventory, fixedAssets } = overview;

  const lowStockCount = consumableInventory.lowStockItemCount;
  const damagedCount = fixedAssets.damagedAssetCount;
  const maintenanceCount = fixedAssets.underMaintenanceAssetCount;

  const hasIssues = lowStockCount > 0 || damagedCount > 0 || maintenanceCount > 0;

  if (!hasIssues) {
    return (
      <Card
        className="border-emerald-500/20 bg-emerald-500/5 shadow-sm"
        data-testid="operational-health-healthy"
      >
        <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <div
              className="rounded-full bg-emerald-500/10 p-2 text-emerald-600 dark:text-emerald-400 shrink-0"
              aria-hidden="true"
            >
              <CheckCircle2 className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold text-foreground">
                  Operational Health: All Systems Healthy
                </span>
                <Badge
                  variant="outline"
                  className="border-emerald-500/30 text-emerald-600 dark:text-emerald-400 text-[11px]"
                >
                  <ShieldCheck className="mr-1 h-3 w-3" /> Fully Operational
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                All consumable stock levels are above reorder thresholds, and all capital assets are
                in active service with zero offline equipment.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Button asChild variant="outline" size="sm" className="h-8 text-xs">
              <Link to="/resources/inventory">View Stock</Link>
            </Button>
            <Button asChild variant="outline" size="sm" className="h-8 text-xs">
              <Link to="/resources/assets">View Fleet</Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card
      className="border-amber-500/30 bg-amber-500/5 shadow-sm"
      data-testid="operational-attention-banner"
      role="region"
      aria-label="Immediate operational attention required"
    >
      <CardContent className="space-y-3 p-4">
        <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-400 shrink-0" />
            <span className="text-sm font-semibold text-foreground">
              Immediate Operational Attention Required
            </span>
          </div>
          <span className="text-xs text-muted-foreground">
            Authoritative operational queue from live estate telemetry
          </span>
        </div>

        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3 pt-1">
          {/* Item 1: Low Stock Consumables */}
          {lowStockCount > 0 && (
            <div
              className="flex items-center justify-between rounded-md border border-amber-500/20 bg-background/80 p-3"
              data-testid="attention-item-low-stock"
            >
              <div className="space-y-0.5">
                <div className="flex items-center gap-1.5">
                  <Badge variant="destructive" className="h-5 px-1.5 text-[10px]">
                    {lowStockCount} Reorder
                  </Badge>
                  <span className="text-xs font-semibold text-foreground">Low Stock Supplies</span>
                </div>
                <p className="text-[11px] text-muted-foreground">
                  Products at or below safety reorder threshold
                </p>
              </div>
              <Button asChild variant="outline" size="sm" className="h-7 px-2 text-xs">
                <Link to="/resources/inventory/low-stock">
                  Review <ArrowRight className="ml-1 h-3 w-3" />
                </Link>
              </Button>
            </div>
          )}

          {/* Item 2: Damaged Capital Equipment */}
          {damagedCount > 0 && (
            <div
              className="flex items-center justify-between rounded-md border border-rose-500/20 bg-background/80 p-3"
              data-testid="attention-item-damaged"
            >
              <div className="space-y-0.5">
                <div className="flex items-center gap-1.5">
                  <Badge
                    variant="outline"
                    className="border-rose-500/40 text-rose-600 dark:text-rose-400 h-5 px-1.5 text-[10px]"
                  >
                    <AlertOctagon className="mr-1 h-2.5 w-2.5" />
                    {damagedCount} Damaged
                  </Badge>
                  <span className="text-xs font-semibold text-foreground">Damaged Equipment</span>
                </div>
                <p className="text-[11px] text-muted-foreground">
                  Safety incident or broken down machinery offline
                </p>
              </div>
              <Button asChild variant="outline" size="sm" className="h-7 px-2 text-xs">
                <Link to="/resources/assets?status=DAMAGED">
                  Inspect <ArrowRight className="ml-1 h-3 w-3" />
                </Link>
              </Button>
            </div>
          )}

          {/* Item 3: Assets Under Maintenance */}
          {maintenanceCount > 0 && (
            <div
              className="flex items-center justify-between rounded-md border border-blue-500/20 bg-background/80 p-3"
              data-testid="attention-item-maintenance"
            >
              <div className="space-y-0.5">
                <div className="flex items-center gap-1.5">
                  <Badge
                    variant="outline"
                    className="border-blue-500/40 text-blue-600 dark:text-blue-400 h-5 px-1.5 text-[10px]"
                  >
                    <Wrench className="mr-1 h-2.5 w-2.5" />
                    {maintenanceCount} Servicing
                  </Badge>
                  <span className="text-xs font-semibold text-foreground">Under Maintenance</span>
                </div>
                <p className="text-[11px] text-muted-foreground">
                  Equipment currently undergoing scheduled servicing
                </p>
              </div>
              <Button asChild variant="outline" size="sm" className="h-7 px-2 text-xs">
                <Link to="/resources/assets?status=UNDER_MAINTENANCE">
                  Track <ArrowRight className="ml-1 h-3 w-3" />
                </Link>
              </Button>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
};
