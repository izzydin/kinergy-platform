import React from 'react';
import { Link } from 'react-router-dom';
import { Button, Badge, Skeleton } from '@kinergy-platform/ui';
import { History, ArrowRight, Clock, User, ShieldCheck } from 'lucide-react';
import { useAssetHistory } from '../hooks';
import { AssetHistoryEventType } from '@kinergy-platform/core';

export interface AssetHistoryPreviewProps {
  readonly assetId: string;
}

const EVENT_TYPE_BADGE_CONFIG: Record<AssetHistoryEventType, { label: string; className: string }> =
  {
    [AssetHistoryEventType.CREATED]: {
      label: 'Commissioned',
      className: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/20',
    },
    [AssetHistoryEventType.UPDATED]: {
      label: 'Metadata Updated',
      className: 'bg-blue-500/10 text-blue-700 dark:text-blue-300 border-blue-500/20',
    },
    [AssetHistoryEventType.TRANSFERRED]: {
      label: 'Relocated',
      className: 'bg-indigo-500/10 text-indigo-700 dark:text-indigo-300 border-indigo-500/20',
    },
    [AssetHistoryEventType.STATUS_CHANGED]: {
      label: 'Status Transition',
      className: 'bg-purple-500/10 text-purple-700 dark:text-purple-300 border-purple-500/20',
    },
    [AssetHistoryEventType.CONDITION_CHANGED]: {
      label: 'Condition Rated',
      className: 'bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/20',
    },
    [AssetHistoryEventType.MAINTENANCE_RECORDED]: {
      label: 'Maintenance Serviced',
      className: 'bg-cyan-500/10 text-cyan-700 dark:text-cyan-300 border-cyan-500/20',
    },
    [AssetHistoryEventType.VALUE_UPDATED]: {
      label: 'Valuation Appraised',
      className: 'bg-teal-500/10 text-teal-700 dark:text-teal-300 border-teal-500/20',
    },
    [AssetHistoryEventType.RETIRED]: {
      label: 'Retired',
      className: 'bg-rose-500/10 text-rose-700 dark:text-rose-300 border-rose-500/20',
    },
    [AssetHistoryEventType.SOLD]: {
      label: 'Realized / Sold',
      className: 'bg-slate-500/10 text-slate-700 dark:text-slate-300 border-slate-500/20',
    },
  };

export const AssetHistoryPreview: React.FC<AssetHistoryPreviewProps> = ({ assetId }) => {
  const { data, isLoading } = useAssetHistory(assetId, { limit: 5 });

  const events = data?.items ?? [];

  if (isLoading) {
    return (
      <div className="space-y-3 p-2" data-testid="history-preview-loading">
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-16 w-full" />
      </div>
    );
  }

  if (events.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground space-y-2">
        <History className="mx-auto h-8 w-8 text-muted-foreground/50" />
        <p className="text-sm font-medium">No lifecycle events recorded</p>
        <p className="text-xs">
          Events will appear here as the asset moves, is serviced, or transitions state.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4" data-testid="asset-history-preview">
      <div className="relative border-l-2 border-border/70 ml-3.5 space-y-4 pb-1">
        {events.map((event) => {
          const badgeConfig = EVENT_TYPE_BADGE_CONFIG[event.eventType] ?? {
            label: event.eventType,
            className: 'bg-muted text-muted-foreground',
          };
          const formattedDate = new Date(event.recordedAt).toLocaleDateString(undefined, {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
          });

          return (
            <div key={event.id} className="relative pl-6 group">
              {/* Dot marker */}
              <div className="absolute -left-[9px] top-1.5 h-4 w-4 rounded-full border-2 border-background bg-primary/80 ring-2 ring-border/50 group-hover:bg-primary transition-colors" />

              <div className="rounded-lg border border-border bg-card/60 p-3.5 space-y-1.5 shadow-sm hover:bg-accent/20 transition-colors">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Badge
                      variant="outline"
                      className={`text-[11px] font-medium ${badgeConfig.className}`}
                    >
                      {badgeConfig.label}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-1 text-xs text-muted-foreground font-mono">
                    <Clock className="h-3 w-3" />
                    <span>{formattedDate}</span>
                  </div>
                </div>

                <p className="text-sm text-foreground">{event.description}</p>

                <div className="flex items-center gap-3 text-xs text-muted-foreground pt-1 border-t border-border/40">
                  <div className="flex items-center gap-1">
                    <User className="h-3 w-3" />
                    <span className="font-mono">{event.recordedByUserId}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <ShieldCheck className="h-3 w-3 text-emerald-500" />
                    <span>Audited</span>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="pt-2 flex justify-end">
        <Button variant="ghost" size="sm" asChild>
          <Link to={`/resources/assets/${encodeURIComponent(assetId)}/history`}>
            View Complete Audit History ({data?.total ?? events.length}){' '}
            <ArrowRight className="ml-1 h-3.5 w-3.5" />
          </Link>
        </Button>
      </div>
    </div>
  );
};
