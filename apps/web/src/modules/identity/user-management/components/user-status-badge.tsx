import { Badge } from '@kinergy-platform/ui';
import React from 'react';
import type { UserStatus } from '../domain/user.types';

export interface UserStatusBadgeProps {
  readonly status: UserStatus;
  readonly className?: string;
}

/**
 * UserStatusBadge Component
 *
 * Renders a theme-aware semantic badge for Identity User statuses.
 * Includes accessibility text so status information is not communicated by color alone.
 */
export const UserStatusBadge: React.FC<UserStatusBadgeProps> = ({ status, className }) => {
  switch (status) {
    case 'ACTIVE':
      return (
        <Badge
          variant="default"
          className={`bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border border-emerald-500/30 hover:bg-emerald-500/25 ${className ?? ''}`}
        >
          <span
            className="mr-1.5 inline-block h-1.5 w-1.5 rounded-full bg-emerald-500"
            aria-hidden="true"
          />
          Active
        </Badge>
      );
    case 'INACTIVE':
      return (
        <Badge variant="secondary" className={className}>
          <span
            className="mr-1.5 inline-block h-1.5 w-1.5 rounded-full bg-muted-foreground"
            aria-hidden="true"
          />
          Inactive
        </Badge>
      );
    case 'PENDING':
      return (
        <Badge
          variant="outline"
          className={`bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/30 ${className ?? ''}`}
        >
          <span
            className="mr-1.5 inline-block h-1.5 w-1.5 rounded-full bg-amber-500"
            aria-hidden="true"
          />
          Pending
        </Badge>
      );
    case 'BLOCKED':
      return (
        <Badge variant="destructive" className={className}>
          <span
            className="mr-1.5 inline-block h-1.5 w-1.5 rounded-full bg-destructive-foreground"
            aria-hidden="true"
          />
          Blocked
        </Badge>
      );
    default:
      return (
        <Badge variant="outline" className={className}>
          {status}
        </Badge>
      );
  }
};

UserStatusBadge.displayName = 'UserStatusBadge';
