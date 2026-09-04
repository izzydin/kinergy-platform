import React from 'react';
import { Badge } from '@kinergy-platform/ui';
import {
  Clock,
  User,
  ShieldCheck,
  ArrowRight,
  MapPin,
  DollarSign,
  Lock,
  Wrench,
  FileText,
} from 'lucide-react';
import {
  AssetHistoryEventType,
  AssetStatus,
  AssetCondition,
  AssetCategory,
} from '@kinergy-platform/core';
import type { AssetHistoryEventVM } from '../types';
import { AssetStatusBadge } from './asset-status-badge';
import { AssetConditionBadge } from './asset-condition-badge';
import { AssetCategoryBadge } from './asset-category-badge';

export interface AssetHistoryItemProps {
  readonly event: AssetHistoryEventVM;
  readonly canViewFinancials: boolean;
  readonly isLatest?: boolean;
}

export const EVENT_TYPE_BADGE_CONFIG: Record<
  AssetHistoryEventType,
  { label: string; className: string; markerColor: string }
> = {
  [AssetHistoryEventType.CREATED]: {
    label: 'Commissioned',
    className: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/20',
    markerColor: 'bg-emerald-500',
  },
  [AssetHistoryEventType.UPDATED]: {
    label: 'Metadata Updated',
    className: 'bg-blue-500/10 text-blue-700 dark:text-blue-300 border-blue-500/20',
    markerColor: 'bg-blue-500',
  },
  [AssetHistoryEventType.TRANSFERRED]: {
    label: 'Relocated',
    className: 'bg-indigo-500/10 text-indigo-700 dark:text-indigo-300 border-indigo-500/20',
    markerColor: 'bg-indigo-500',
  },
  [AssetHistoryEventType.STATUS_CHANGED]: {
    label: 'Status Transition',
    className: 'bg-purple-500/10 text-purple-700 dark:text-purple-300 border-purple-500/20',
    markerColor: 'bg-purple-500',
  },
  [AssetHistoryEventType.CONDITION_CHANGED]: {
    label: 'Condition Rated',
    className: 'bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/20',
    markerColor: 'bg-amber-500',
  },
  [AssetHistoryEventType.MAINTENANCE_RECORDED]: {
    label: 'Maintenance Serviced',
    className: 'bg-cyan-500/10 text-cyan-700 dark:text-cyan-300 border-cyan-500/20',
    markerColor: 'bg-cyan-500',
  },
  [AssetHistoryEventType.VALUE_UPDATED]: {
    label: 'Valuation Appraised',
    className: 'bg-teal-500/10 text-teal-700 dark:text-teal-300 border-teal-500/20',
    markerColor: 'bg-teal-500',
  },
  [AssetHistoryEventType.RETIRED]: {
    label: 'Decommissioned / Retired',
    className: 'bg-rose-500/10 text-rose-700 dark:text-rose-300 border-rose-500/20',
    markerColor: 'bg-rose-500',
  },
  [AssetHistoryEventType.SOLD]: {
    label: 'Liquidated / Sold',
    className: 'bg-slate-500/10 text-slate-700 dark:text-slate-300 border-slate-500/20',
    markerColor: 'bg-slate-500',
  },
};

function formatMoney(amount: number, currency = 'USD'): string {
  return `${currency === 'USD' ? '$' : `${currency} `}${amount.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export const AssetHistoryItem: React.FC<AssetHistoryItemProps> = ({
  event,
  canViewFinancials,
  isLatest = false,
}) => {
  const badgeConfig = EVENT_TYPE_BADGE_CONFIG[event.eventType] ?? {
    label: event.eventType,
    className: 'bg-muted text-muted-foreground',
    markerColor: 'bg-primary',
  };

  const formattedDate = new Date(event.recordedAt).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  const details = event.details ?? {};
  const reason = (details.reason as string | undefined)?.trim();

  return (
    <div
      className="relative pl-6 group"
      data-testid={`history-item-${event.id}`}
      data-event-type={event.eventType}
    >
      {/* Timeline Node Marker */}
      <div
        className={`absolute -left-[9px] top-1.5 h-4 w-4 rounded-full border-2 border-background ring-2 ring-border/60 transition-transform group-hover:scale-110 ${badgeConfig.markerColor}`}
        aria-hidden="true"
      />

      <div className="rounded-lg border border-border bg-card p-4 space-y-3 shadow-sm hover:border-border/80 hover:bg-muted/10 transition-all">
        {/* Header Bar */}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Badge
              variant="outline"
              className={`text-xs font-medium px-2 py-0.5 ${badgeConfig.className}`}
              data-testid={`event-badge-${event.eventType}`}
            >
              {badgeConfig.label}
            </Badge>
            {isLatest && (
              <Badge
                variant="secondary"
                className="text-[10px] uppercase font-bold tracking-wider bg-primary/10 text-primary border-transparent"
              >
                Latest Event
              </Badge>
            )}
          </div>

          <div className="flex items-center gap-3 text-xs text-muted-foreground font-mono">
            <span className="flex items-center gap-1">
              <Clock className="h-3.5 w-3.5" />
              <span>{formattedDate}</span>
            </span>
            <span>•</span>
            <span className="flex items-center gap-1">
              <User className="h-3.5 w-3.5" />
              <span className="truncate max-w-[140px]">{event.recordedByUserId}</span>
            </span>
          </div>
        </div>

        {/* Aggregate Description */}
        <p className="text-sm text-foreground font-medium">{event.description}</p>

        {/* Contextual Decoders */}
        {renderEventContext(event, canViewFinancials)}

        {/* Explicit Operational Reason */}
        {reason && (
          <div
            className="rounded bg-muted/40 p-2.5 text-xs text-muted-foreground flex items-start gap-2 border border-border/40"
            data-testid="event-reason"
          >
            <FileText className="h-3.5 w-3.5 mt-0.5 text-muted-foreground shrink-0" />
            <div>
              <span className="font-semibold text-foreground/80">Operational Justification: </span>
              <span>{reason}</span>
            </div>
          </div>
        )}

        {/* Footer Verification Stamp */}
        <div className="flex items-center justify-between pt-1 border-t border-border/40 text-[11px] text-muted-foreground">
          <span className="font-mono text-[10px] text-muted-foreground/70">
            Audit ID: {event.id}
          </span>
          <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400 font-medium">
            <ShieldCheck className="h-3.5 w-3.5" /> Authoritative Domain Log
          </span>
        </div>
      </div>
    </div>
  );
};

function renderEventContext(
  event: AssetHistoryEventVM,
  canViewFinancials: boolean,
): React.ReactNode {
  const details = event.details ?? {};

  switch (event.eventType) {
    case AssetHistoryEventType.STATUS_CHANGED:
    case AssetHistoryEventType.RETIRED: {
      const priorStatus = details.priorStatus as AssetStatus | undefined;
      const newStatus = details.newStatus as AssetStatus | undefined;
      if (!priorStatus || !newStatus) return null;

      return (
        <div
          className="flex items-center gap-2 text-xs bg-muted/30 p-2 rounded border border-border/50"
          data-testid="status-transition-context"
        >
          <span className="text-muted-foreground font-medium">Lifecycle Transition:</span>
          <AssetStatusBadge status={priorStatus} />
          <ArrowRight className="h-3 w-3 text-muted-foreground" />
          <AssetStatusBadge status={newStatus} />
        </div>
      );
    }

    case AssetHistoryEventType.CONDITION_CHANGED: {
      const priorCondition = details.priorCondition as AssetCondition | undefined;
      const newCondition = details.newCondition as AssetCondition | undefined;
      if (!priorCondition || !newCondition) return null;

      return (
        <div
          className="flex items-center gap-2 text-xs bg-muted/30 p-2 rounded border border-border/50"
          data-testid="condition-transition-context"
        >
          <span className="text-muted-foreground font-medium">Physical Re-rating:</span>
          <AssetConditionBadge condition={priorCondition} />
          <ArrowRight className="h-3 w-3 text-muted-foreground" />
          <AssetConditionBadge condition={newCondition} />
        </div>
      );
    }

    case AssetHistoryEventType.TRANSFERRED: {
      const priorLoc = details.priorLocation as
        { facilityId?: string; roomId?: string; zone?: string } | undefined;
      const newLoc = details.newLocation as
        { facilityId?: string; roomId?: string; zone?: string } | undefined;

      const formatLoc = (loc?: { facilityId?: string; roomId?: string; zone?: string }) => {
        if (!loc) return 'Unknown';
        const parts = [loc.facilityId, loc.roomId, loc.zone].filter(Boolean);
        return parts.join(' • ') || 'Unspecified';
      };

      return (
        <div
          className="flex items-center gap-2 text-xs bg-muted/30 p-2 rounded border border-border/50 flex-wrap"
          data-testid="transfer-context"
        >
          <span className="flex items-center gap-1 text-muted-foreground font-medium">
            <MapPin className="h-3.5 w-3.5 text-indigo-500" /> Relocation:
          </span>
          <span className="font-mono font-medium text-foreground">{formatLoc(priorLoc)}</span>
          <ArrowRight className="h-3 w-3 text-muted-foreground" />
          <span className="font-mono font-medium text-foreground">{formatLoc(newLoc)}</span>
        </div>
      );
    }

    case AssetHistoryEventType.VALUE_UPDATED: {
      const priorVal = details.priorValue as { amount: number; currency?: string } | undefined;
      const newVal = details.newValue as { amount: number; currency?: string } | undefined;

      return (
        <div
          className="flex items-center gap-2 text-xs bg-muted/30 p-2 rounded border border-border/50"
          data-testid="valuation-context"
        >
          <span className="flex items-center gap-1 text-muted-foreground font-medium">
            <DollarSign className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" /> Valuation
            Adjustment:
          </span>
          {canViewFinancials ? (
            <div className="flex items-center gap-1.5 font-mono font-semibold text-foreground">
              <span>{priorVal ? formatMoney(priorVal.amount, priorVal.currency) : '—'}</span>
              <ArrowRight className="h-3 w-3 text-muted-foreground" />
              <span>{newVal ? formatMoney(newVal.amount, newVal.currency) : '—'}</span>
            </div>
          ) : (
            <Badge
              variant="outline"
              className="bg-muted text-muted-foreground text-[10px] gap-1"
              data-testid="confidential-valuation-badge"
            >
              <Lock className="h-3 w-3" /> Confidential Valuation
            </Badge>
          )}
        </div>
      );
    }

    case AssetHistoryEventType.MAINTENANCE_RECORDED: {
      const cost = details.cost as { amount: number; currency?: string } | undefined;
      const performedBy = details.performedBy as string | undefined;
      const serviceDate = details.serviceDate as string | undefined;

      return (
        <div
          className="flex items-center gap-3 text-xs bg-muted/30 p-2 rounded border border-border/50 flex-wrap"
          data-testid="maintenance-context"
        >
          <span className="flex items-center gap-1 text-muted-foreground font-medium">
            <Wrench className="h-3.5 w-3.5 text-cyan-600 dark:text-cyan-400" /> Servicing Context:
          </span>
          {serviceDate && (
            <span className="text-muted-foreground">
              Date:{' '}
              <strong className="text-foreground">
                {new Date(serviceDate).toLocaleDateString('en-US', {
                  month: 'short',
                  day: 'numeric',
                  year: 'numeric',
                })}
              </strong>
            </span>
          )}
          {performedBy && (
            <span className="text-muted-foreground">
              Vendor/Technician: <strong className="text-foreground">{performedBy}</strong>
            </span>
          )}
          {cost && (
            <div className="flex items-center gap-1">
              <span className="text-muted-foreground">Cost:</span>
              {canViewFinancials ? (
                <span className="font-mono font-semibold text-foreground">
                  {formatMoney(cost.amount, cost.currency)}
                </span>
              ) : (
                <Badge
                  variant="outline"
                  className="bg-muted text-muted-foreground text-[10px] gap-1"
                  data-testid="confidential-cost-badge"
                >
                  <Lock className="h-3 w-3" /> Confidential
                </Badge>
              )}
            </div>
          )}
        </div>
      );
    }

    case AssetHistoryEventType.SOLD: {
      const saleAmount = details.saleAmount as { amount: number; currency?: string } | undefined;
      const priorStatus = details.priorStatus as AssetStatus | undefined;

      return (
        <div
          className="flex items-center gap-2 text-xs bg-muted/30 p-2 rounded border border-border/50 flex-wrap"
          data-testid="sale-context"
        >
          <span className="text-muted-foreground font-medium">Liquidation Transition:</span>
          {priorStatus && (
            <>
              <AssetStatusBadge status={priorStatus} />
              <ArrowRight className="h-3 w-3 text-muted-foreground" />
            </>
          )}
          <AssetStatusBadge status={AssetStatus.SOLD} />
          <span className="text-muted-foreground ml-2">Sale Proceeds:</span>
          {canViewFinancials ? (
            <span className="font-mono font-semibold text-foreground">
              {saleAmount ? formatMoney(saleAmount.amount, saleAmount.currency) : '—'}
            </span>
          ) : (
            <Badge
              variant="outline"
              className="bg-muted text-muted-foreground text-[10px] gap-1"
              data-testid="confidential-valuation-badge"
            >
              <Lock className="h-3 w-3" /> Confidential Valuation
            </Badge>
          )}
        </div>
      );
    }

    case AssetHistoryEventType.UPDATED: {
      const changedFields = details.changedFields as
        Record<string, { from: unknown; to: unknown }> | undefined;
      if (!changedFields || Object.keys(changedFields).length === 0) return null;

      return (
        <div
          className="space-y-1 text-xs bg-muted/30 p-2 rounded border border-border/50"
          data-testid="updated-fields-context"
        >
          <span className="text-muted-foreground font-medium block">Modified Attributes:</span>
          <div className="flex flex-wrap gap-2">
            {Object.entries(changedFields).map(([field, delta]) => (
              <Badge
                key={field}
                variant="outline"
                className="bg-card text-foreground text-[11px] font-mono"
              >
                {field}: {String(delta.from || 'empty')} → {String(delta.to || 'empty')}
              </Badge>
            ))}
          </div>
        </div>
      );
    }

    case AssetHistoryEventType.CREATED: {
      const assetTag = details.assetTag as string | undefined;
      const category = details.category as AssetCategory | undefined;
      const status = details.status as AssetStatus | undefined;
      const condition = details.condition as AssetCondition | undefined;

      return (
        <div
          className="flex items-center gap-2 text-xs bg-muted/30 p-2 rounded border border-border/50 flex-wrap"
          data-testid="commissioned-context"
        >
          <span className="text-muted-foreground font-medium">Initial Baseline:</span>
          {assetTag && (
            <span className="font-mono text-xs bg-muted px-1.5 py-0.5 rounded text-foreground">
              Tag: {assetTag}
            </span>
          )}
          {category && <AssetCategoryBadge category={category} />}
          {status && <AssetStatusBadge status={status} />}
          {condition && <AssetConditionBadge condition={condition} />}
        </div>
      );
    }

    default:
      return null;
  }
}
