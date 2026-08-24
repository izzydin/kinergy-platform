import { Badge } from '@kinergy-platform/ui';
import { AlertCircle, CheckCircle2, PauseCircle, XCircle } from 'lucide-react';
import React from 'react';

export type MembershipStatus = 'ACTIVE' | 'FROZEN' | 'EXPIRED' | 'CANCELLED';

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
          case 'ACTIVE':
            return (
              <Badge
                variant="outline"
                className={`bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-400 dark:border-emerald-800 ${className ?? ''}`}
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
                className={`bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-950/30 dark:text-sky-400 dark:border-sky-800 ${className ?? ''}`}
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
                className={`bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-800/40 dark:text-slate-400 dark:border-slate-700 ${className ?? ''}`}
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
                className={`bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/30 dark:text-rose-400 dark:border-rose-800 ${className ?? ''}`}
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
          className="bg-amber-50 text-amber-800 border-amber-300 text-[10px] px-1.5 py-0 animate-pulse dark:bg-amber-950/40 dark:text-amber-300"
          data-testid="membership-expiring-indicator"
        >
          Expiring Soon
        </Badge>
      )}
    </div>
  );
};

MembershipStatusBadge.displayName = 'MembershipStatusBadge';
