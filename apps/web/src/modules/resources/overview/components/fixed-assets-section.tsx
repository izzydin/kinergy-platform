import * as React from 'react';
import { Link } from 'react-router-dom';
import { Badge, Button } from '@kinergy-platform/ui';
import {
  Landmark,
  CheckCircle2,
  Wrench,
  AlertOctagon,
  Archive,
  Layers,
  ArrowRight,
} from 'lucide-react';
import { ResourceMetricCard } from './resource-metric-card';
import { formatCurrency } from './overall-resource-value-card';
import type { FixedAssetsOverviewVM } from '../types';

export interface FixedAssetsSectionProps {
  fixedAssets: FixedAssetsOverviewVM;
  currency: string;
}

/**
 * Domain B: Fixed Assets Dashboard Section
 *
 * Core Concept: "What the business owns as fixed assets"
 * Visualizes balance sheet capital equipment book value and operational lifecycle telemetry.
 */
export const FixedAssetsSection: React.FC<FixedAssetsSectionProps> = ({
  fixedAssets,
  currency,
}) => {
  const {
    totalCarryingValueAmount,
    activeAssetCount,
    underMaintenanceAssetCount,
    damagedAssetCount,
    retiredAssetCount,
    totalAssetCount,
  } = fixedAssets;

  const hasMaintenance = underMaintenanceAssetCount > 0;
  const hasDamaged = damagedAssetCount > 0;

  return (
    <section
      aria-labelledby="domain-b-heading"
      className="space-y-4"
      data-testid="fixed-assets-section"
    >
      {/* Section Header with Domain Concept Statement */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between border-b border-border/60 pb-3">
        <div>
          <div className="flex items-center gap-2">
            <h2 id="domain-b-heading" className="text-xl font-bold tracking-tight text-foreground">
              Fixed Assets
            </h2>
          </div>
          {/* Explicit Concept Hierarchy as required by architecture */}
          <p className="text-sm font-medium text-muted-foreground mt-0.5">
            &ldquo;What the business owns as fixed assets&rdquo;
          </p>
        </div>

        {/* Quick Navigation Actions */}
        <div className="flex items-center gap-2">
          <div className="text-xs text-muted-foreground hidden md:inline-block">
            Total registered assets:{' '}
            <span className="font-semibold text-foreground">{totalAssetCount}</span>
          </div>
          <Button asChild variant="outline" size="sm" className="h-8 text-xs">
            <Link to="/resources/assets">
              <Layers className="mr-1.5 h-3.5 w-3.5" /> Full Asset Catalog
            </Link>
          </Button>
        </div>
      </div>

      {/* Responsive Metric Grid */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        {/* 1. Fixed Asset Value */}
        <ResourceMetricCard
          title="Fixed Asset Value"
          value={formatCurrency(totalCarryingValueAmount, currency)}
          description="Net carrying book balance"
          icon={<Landmark className="h-5 w-5" />}
          iconContainerClassName="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
          dataTestId="metric-fixed-asset-value"
          footer={
            <div className="flex items-center justify-between">
              <span>Capital balance sheet</span>
              <span className="font-mono text-[11px] text-foreground">{currency}</span>
            </div>
          }
        />

        {/* 2. Active Assets */}
        <ResourceMetricCard
          title="Active Assets"
          value={activeAssetCount}
          description="Operational in deployment"
          icon={<CheckCircle2 className="h-5 w-5" />}
          iconContainerClassName="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
          dataTestId="metric-active-assets"
          badge={
            totalAssetCount === 0 ? (
              <Badge variant="outline" className="text-muted-foreground text-[11px]">
                No Assets
              </Badge>
            ) : (
              <Badge
                variant="outline"
                className="border-emerald-500/30 text-emerald-600 dark:text-emerald-400 flex items-center gap-1 text-[11px]"
              >
                <CheckCircle2 className="h-3 w-3" aria-hidden="true" />
                <span>In Service</span>
              </Badge>
            )
          }
          footer={
            totalAssetCount === 0 ? (
              <span>No equipment registered</span>
            ) : (
              <Link
                to="/resources/assets?status=ACTIVE"
                className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground"
              >
                View active assets <ArrowRight className="h-3 w-3" />
              </Link>
            )
          }
        />

        {/* 3. Assets Under Maintenance */}
        <ResourceMetricCard
          title="Under Maintenance"
          value={underMaintenanceAssetCount}
          description="Undergoing service or repair"
          icon={<Wrench className="h-5 w-5" />}
          iconContainerClassName={
            hasMaintenance
              ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400'
              : 'bg-muted text-muted-foreground'
          }
          dataTestId="metric-maintenance-assets"
          badge={
            totalAssetCount === 0 ? (
              <Badge variant="outline" className="text-muted-foreground text-[11px]">
                No Assets
              </Badge>
            ) : hasMaintenance ? (
              <Badge
                variant="outline"
                className="border-amber-500/40 text-amber-700 dark:text-amber-300 flex items-center gap-1 text-[11px]"
              >
                <Wrench className="h-3 w-3" aria-hidden="true" />
                <span>Servicing</span>
              </Badge>
            ) : (
              <Badge variant="outline" className="text-muted-foreground text-[11px]">
                Zero Offline
              </Badge>
            )
          }
          footer={
            totalAssetCount === 0 ? (
              <span>No equipment registered</span>
            ) : hasMaintenance ? (
              <Link
                to="/resources/assets?status=UNDER_MAINTENANCE"
                className="inline-flex items-center gap-1 text-amber-600 hover:text-amber-700 dark:text-amber-400 font-medium"
              >
                Servicing work orders <ArrowRight className="h-3 w-3" />
              </Link>
            ) : (
              <span>All equipment running smoothly</span>
            )
          }
        />

        {/* 4. Damaged Assets */}
        <ResourceMetricCard
          title="Damaged Assets"
          value={damagedAssetCount}
          description="Awaiting repair or disposal"
          icon={<AlertOctagon className="h-5 w-5" />}
          iconContainerClassName={
            hasDamaged
              ? 'bg-rose-500/10 text-rose-600 dark:text-rose-400'
              : 'bg-muted text-muted-foreground'
          }
          dataTestId="metric-damaged-assets"
          badge={
            totalAssetCount === 0 ? (
              <Badge variant="outline" className="text-muted-foreground text-[11px]">
                No Assets
              </Badge>
            ) : hasDamaged ? (
              <Badge variant="destructive" className="flex items-center gap-1 text-[11px]">
                <AlertOctagon className="h-3 w-3" aria-hidden="true" />
                <span>Needs Action</span>
              </Badge>
            ) : (
              <Badge variant="outline" className="text-muted-foreground text-[11px]">
                None Reported
              </Badge>
            )
          }
          footer={
            totalAssetCount === 0 ? (
              <span>No equipment registered</span>
            ) : hasDamaged ? (
              <Link
                to="/resources/assets?status=DAMAGED"
                className="inline-flex items-center gap-1 text-rose-600 hover:text-rose-700 dark:text-rose-400 font-medium"
              >
                View damaged equipment <ArrowRight className="h-3 w-3" />
              </Link>
            ) : (
              <span>Zero damaged assets</span>
            )
          }
        />

        {/* 5. Retired Assets */}
        <ResourceMetricCard
          title="Retired Assets"
          value={retiredAssetCount}
          description="Decommissioned or salvaged"
          icon={<Archive className="h-5 w-5" />}
          iconContainerClassName="bg-muted text-muted-foreground"
          dataTestId="metric-retired-assets"
          badge={
            <Badge variant="secondary" className="text-[11px]">
              Decommissioned
            </Badge>
          }
          footer={
            <Link
              to="/resources/assets?status=DECOMMISSIONED"
              className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground"
            >
              View archives <ArrowRight className="h-3 w-3" />
            </Link>
          }
        />
      </div>
    </section>
  );
};
