import React from 'react';
import { Badge } from '@kinergy-platform/ui';
import { SessionStatusType } from '../types';

interface SessionStatusBadgeProps {
  status: SessionStatusType;
  className?: string;
}

export const SessionStatusBadge: React.FC<SessionStatusBadgeProps> = ({ status, className }) => {
  switch (status) {
    case 'SCHEDULED':
      return (
        <Badge variant="outline" className={className}>
          Scheduled
        </Badge>
      );
    case 'IN_PROGRESS':
      return (
        <Badge variant="default" className={className}>
          In Progress
        </Badge>
      );
    case 'COMPLETED':
      return (
        <Badge variant="secondary" className={className}>
          Completed
        </Badge>
      );
    case 'CANCELLED':
      return (
        <Badge variant="destructive" className={className}>
          Cancelled
        </Badge>
      );
    case 'NO_SHOW':
      return (
        <Badge variant="outline" className={className}>
          No Show
        </Badge>
      );
    default:
      return (
        <Badge variant="default" className={className}>
          {status}
        </Badge>
      );
  }
};
