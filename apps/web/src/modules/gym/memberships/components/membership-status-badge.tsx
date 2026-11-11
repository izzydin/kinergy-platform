import { Badge } from '@kinergy-platform/ui';
import { AlertCircle, CheckCircle2, Clock, PauseCircle, XCircle } from 'lucide-react';
import React from 'react';

export type MembershipStatus =
  'PENDING' | 'ACTIVE' | 'FROZEN' | 'EXPIRED' | 'CANCELLED' | 'TERMINATED';

export interface MembershipStatusBadgeProps {
  readonly status: MembershipStatus | string;
  readonly isExpiringSoon?: boolean;
  readonly className?: string;
}

export const MembershipStatusBadge: React.FC<MembershipStatusBadgeProps> = ({
  status,
  isExpiringSoon = false,
  className,
}) => {
  const normalized = (status ?? '').toUpperCase() as MembershipStatus;

  return (
    <div className="inline-flex items-center gap-1.5" data-testid="membership-status-container">
      {(() => {
        switch (normalized) {
          case 'PENDING':
            return (
              <Badge
                variant="outline"
                className={`bg-status-warning-surface text-status-warning border-status-warning-border ${className ?? ''}`}
                data-testid="membership-status-badge-pending"
              >
                <Clock className="mr-1 h-3 w-3 inline" />
                Pending
              </Badge>
            );
          case 'ACTIVE':
            return (
              <Badge
                variant="outline"
                className={`bg-status-success-surface text-status-success border-status-success-border ${className ?? ''}`}
                data-testid="membership-status-badge-active"
              >
                <CheckCircle2 className="mr-1 h-3 w-3 inline" />
                Active
              </Badge>
            );
          case 'FROZEN':
            return (
              <Badge
                variant="outline"
                className={`bg-status-info-surface text-status-info border-status-info-border ${className ?? ''}`}
                data-testid="membership-status-badge-frozen"
              >
                <PauseCircle className="mr-1 h-3 w-3 inline" />
                Suspended / Frozen
              </Badge>
            );
          case 'EXPIRED':
            return (
              <Badge
                variant="outline"
                className={`bg-muted text-muted-foreground border-border ${className ?? ''}`}
                data-testid="membership-status-badge-expired"
              >
                <AlertCircle className="mr-1 h-3 w-3 inline" />
                Expired
              </Badge>
            );
          case 'CANCELLED':
            return (
              <Badge
                variant="outline"
                className={`bg-status-danger-surface text-status-danger border-status-danger-border ${className ?? ''}`}
                data-testid="membership-status-badge-cancelled"
              >
                <XCircle className="mr-1 h-3 w-3 inline" />
                Cancelled
              </Badge>
            );
          default:
            return (
              <Badge
                variant="outline"
                className={className}
                data-testid="membership-status-badge-unknown"
              >
                {status}
              </Badge>
            );
        }
      })()}

      {isExpiringSoon && normalized === 'ACTIVE' && (
        <Badge
          variant="outline"
          className="bg-status-warning-surface text-status-warning border-status-warning-border text-[10px] px-1.5 py-0 animate-pulse"
          data-testid="membership-expiring-indicator"
        >
          Expiring Soon
        </Badge>
      )}
    </div>
  );
};

MembershipStatusBadge.displayName = 'MembershipStatusBadge';
