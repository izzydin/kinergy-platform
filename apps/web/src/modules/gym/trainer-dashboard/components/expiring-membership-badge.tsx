import React from 'react';
import { Badge } from '@kinergy-platform/ui';

interface ExpiringMembershipBadgeProps {
  readonly daysRemaining: number;
  readonly isExpiringSoon: boolean;
  readonly isExpired: boolean;
}

export const ExpiringMembershipBadge: React.FC<ExpiringMembershipBadgeProps> = ({
  daysRemaining,
  isExpiringSoon,
  isExpired,
}) => {
  if (isExpired) {
    return (
      <Badge
        variant="destructive"
        className="text-[11px] font-semibold px-2 py-0.5"
        data-testid="badge-membership-expired"
      >
        EXPIRED
      </Badge>
    );
  }

  if (isExpiringSoon) {
    return (
      <Badge
        variant="secondary"
        className="bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30 text-[11px] font-semibold px-2 py-0.5 animate-pulse"
        data-testid="badge-expiring-soon"
      >
        ⚠️ Expiring in {daysRemaining} {daysRemaining === 1 ? 'day' : 'days'}
      </Badge>
    );
  }

  return (
    <Badge
      variant="outline"
      className="text-muted-foreground text-[11px] font-medium px-2 py-0.5"
      data-testid="badge-days-remaining"
    >
      {daysRemaining} {daysRemaining === 1 ? 'day' : 'days'} left
    </Badge>
  );
};
