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
          className={`bg-status-success-surface text-status-success border-status-success-border ${className ?? ''}`}
          data-testid="plan-status-badge-active"
        >
          Active
        </Badge>
      );
    case 'DRAFT':
      return (
        <Badge
          variant="outline"
          className={`bg-status-warning-surface text-status-warning border-status-warning-border ${className ?? ''}`}
          data-testid="plan-status-badge-draft"
        >
          Draft
        </Badge>
      );
    case 'ARCHIVED':
      return (
        <Badge
          variant="outline"
          className={`bg-muted text-muted-foreground border-border ${className ?? ''}`}
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
