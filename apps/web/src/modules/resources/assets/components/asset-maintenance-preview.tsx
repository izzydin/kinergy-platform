import React from 'react';
import { Link } from 'react-router-dom';
import { Button, Badge, Skeleton } from '@kinergy-platform/ui';
import { Wrench, ArrowRight, Calendar, DollarSign, UserCheck } from 'lucide-react';
import { useAssetMaintenanceHistory } from '../hooks';

export interface AssetMaintenancePreviewProps {
  readonly assetId: string;
}

export const AssetMaintenancePreview: React.FC<AssetMaintenancePreviewProps> = ({ assetId }) => {
  const { data, isLoading } = useAssetMaintenanceHistory(assetId, { limit: 5 });

  const records = data?.items ?? [];

  if (isLoading) {
    return (
      <div className="space-y-3 p-2" data-testid="maintenance-preview-loading">
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-16 w-full" />
      </div>
    );
  }

  if (records.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground space-y-2">
        <Wrench className="mx-auto h-8 w-8 text-muted-foreground/50" />
        <p className="text-sm font-medium">No maintenance records logged</p>
        <p className="text-xs">
          Equipment has not required recorded corrective or preventative servicing.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3" data-testid="asset-maintenance-preview">
      <div className="grid grid-cols-1 gap-3">
        {records.map((rec) => {
          const formattedDate = new Date(rec.serviceDate).toLocaleDateString(undefined, {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
          });

          return (
            <div
              key={rec.id}
              className="rounded-lg border border-border bg-card/60 p-4 space-y-2 shadow-sm hover:bg-accent/20 transition-colors"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Badge
                    variant="outline"
                    className="bg-cyan-500/10 text-cyan-700 dark:text-cyan-300 border-cyan-500/20 text-xs"
                  >
                    Work Order
                  </Badge>
                  <span className="font-semibold text-sm text-foreground">{rec.description}</span>
                </div>
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Calendar className="h-3.5 w-3.5" />
                  <span>{formattedDate}</span>
                </div>
              </div>

              {rec.notes && <p className="text-xs text-muted-foreground">{rec.notes}</p>}

              <div className="flex items-center justify-between pt-1 border-t border-border/40 text-xs">
                <div className="flex items-center gap-1.5 text-muted-foreground">
                  <UserCheck className="h-3.5 w-3.5" />
                  <span>
                    Technician: <strong>{rec.performedBy}</strong>
                  </span>
                </div>
                <div className="flex items-center gap-1 font-mono font-medium text-foreground">
                  <DollarSign className="h-3.5 w-3.5 text-emerald-600" />
                  <span>
                    $
                    {rec.cost.amount.toLocaleString('en-US', {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}
                  </span>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="pt-2 flex justify-end">
        <Button variant="ghost" size="sm" asChild>
          <Link to={`/resources/assets/${encodeURIComponent(assetId)}/maintenance`}>
            View Full Maintenance Ledger ({data?.total ?? records.length}){' '}
            <ArrowRight className="ml-1 h-3.5 w-3.5" />
          </Link>
        </Button>
      </div>
    </div>
  );
};
