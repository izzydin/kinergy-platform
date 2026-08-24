import { Badge } from '@kinergy-platform/ui';
import React from 'react';

export type PlanStatus = 'DRAFT' | 'ACTIVE' | 'ARCHIVED';

export interface PlanStatusBadgeProps {
  readonly status: PlanStatus | string;
  readonly className?: string;
}

export const PlanStatusBadge: React.FC<PlanStatusBadgeProps> = ({ status, className }) => {
  const normalized = (status ?? '').toUpperCase() as PlanStatus;

  switch (normalized) {
    case 'ACTIVE':
      return (
        <Badge
          variant="outline"
          className={`bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-400 dark:border-emerald-800 ${className ?? ''}`}
          data-testid="plan-status-badge-active"
        >
          Active
        </Badge>
      );
    case 'DRAFT':
      return (
        <Badge
          variant="outline"
          className={`bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/30 dark:text-amber-400 dark:border-amber-800 ${className ?? ''}`}
          data-testid="plan-status-badge-draft"
        >
          Draft
        </Badge>
      );
    case 'ARCHIVED':
      return (
        <Badge
          variant="outline"
          className={`bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-800/40 dark:text-slate-400 dark:border-slate-700 ${className ?? ''}`}
          data-testid="plan-status-badge-archived"
        >
          Archived
        </Badge>
      );
    default:
      return (
        <Badge variant="outline" className={className} data-testid="plan-status-badge-unknown">
          {status}
        </Badge>
      );
  }
};

PlanStatusBadge.displayName = 'PlanStatusBadge';
