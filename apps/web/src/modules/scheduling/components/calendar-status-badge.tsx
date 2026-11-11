import React from 'react';
import { Badge } from '@kinergy-platform/ui';
import {
  AlertCircle,
  AlertTriangle,
  Calendar,
  CheckCircle2,
  CheckCheck,
  Clock,
  Play,
  UserCheck,
  Wrench,
  XCircle,
} from 'lucide-react';
import type { AppointmentStatus } from '../types/scheduling.types';

export interface CalendarStatusBadgeProps {
  status: AppointmentStatus | string;
  className?: string;
  size?: 'sm' | 'md';
}

export const CalendarStatusBadge: React.FC<CalendarStatusBadgeProps> = ({
  status,
  className = '',
  size = 'md',
}) => {
  const iconSize = size === 'sm' ? 'h-3 w-3' : 'h-3.5 w-3.5';
  const textSize = size === 'sm' ? 'text-xs px-1.5 py-0.5' : 'text-xs px-2 py-0.5';

  switch (status) {
    case 'CONFIRMED':
      return (
        <Badge
          variant="default"
          className={`inline-flex items-center gap-1 border-status-success-border bg-status-success-surface text-status-success font-medium ${textSize} ${className}`}
          aria-label="Appointment status: Confirmed"
        >
          <CheckCircle2 className={`${iconSize} shrink-0`} aria-hidden="true" />
          <span>Confirmed</span>
        </Badge>
      );

    case 'CHECKED_IN':
      return (
        <Badge
          variant="secondary"
          className={`inline-flex items-center gap-1 border-status-info-border bg-status-info-surface text-status-info font-medium ${textSize} ${className}`}
          aria-label="Appointment status: Checked In"
        >
          <UserCheck className={`${iconSize} shrink-0`} aria-hidden="true" />
          <span>Checked In</span>
        </Badge>
      );

    case 'IN_PROGRESS':
      return (
        <Badge
          variant="default"
          className={`inline-flex items-center gap-1 border-status-info-border bg-status-info-surface text-status-info font-medium animate-pulse ${textSize} ${className}`}
          aria-label="Appointment status: In Progress"
        >
          <Play className={`${iconSize} shrink-0`} aria-hidden="true" />
          <span>In Progress</span>
        </Badge>
      );

    case 'COMPLETED':
      return (
        <Badge
          variant="outline"
          className={`inline-flex items-center gap-1 border-border bg-muted text-muted-foreground font-medium ${textSize} ${className}`}
          aria-label="Appointment status: Completed"
        >
          <CheckCheck className={`${iconSize} shrink-0`} aria-hidden="true" />
          <span>Completed</span>
        </Badge>
      );

    case 'CANCELLED':
      return (
        <Badge
          variant="destructive"
          className={`inline-flex items-center gap-1 font-medium ${textSize} ${className}`}
          aria-label="Appointment status: Cancelled"
        >
          <XCircle className={`${iconSize} shrink-0`} aria-hidden="true" />
          <span>Cancelled</span>
        </Badge>
      );

    case 'NO_SHOW':
      return (
        <Badge
          variant="destructive"
          className={`inline-flex items-center gap-1 border-status-warning-border bg-status-warning-surface text-status-warning font-medium ${textSize} ${className}`}
          aria-label="Appointment status: No Show"
        >
          <AlertTriangle className={`${iconSize} shrink-0`} aria-hidden="true" />
          <span>No Show</span>
        </Badge>
      );

    case 'RESCHEDULED':
      return (
        <Badge
          variant="secondary"
          className={`inline-flex items-center gap-1 border-border bg-muted text-foreground font-medium ${textSize} ${className}`}
          aria-label="Appointment status: Rescheduled"
        >
          <Calendar className={`${iconSize} shrink-0`} aria-hidden="true" />
          <span>Rescheduled</span>
        </Badge>
      );

    case 'MAINTENANCE':
      return (
        <Badge
          variant="secondary"
          className={`inline-flex items-center gap-1 border-status-warning-border bg-status-warning-surface text-status-warning font-medium ${textSize} ${className}`}
          aria-label="Status: Room Maintenance"
        >
          <Wrench className={`${iconSize} shrink-0`} aria-hidden="true" />
          <span>Maintenance</span>
        </Badge>
      );

    case 'SCHEDULED':
    default:
      return (
        <Badge
          variant="outline"
          className={`inline-flex items-center gap-1 border-status-info-border bg-status-info-surface text-status-info font-medium ${textSize} ${className}`}
          aria-label={`Appointment status: ${status || 'Scheduled'}`}
        >
          <Clock className={`${iconSize} shrink-0`} aria-hidden="true" />
          <span>{status === 'SCHEDULED' ? 'Scheduled' : status || 'Scheduled'}</span>
        </Badge>
      );
  }
};

export interface ConflictBadgeProps {
  className?: string;
  size?: 'sm' | 'md';
}

/**
 * Authoritative Conflict Badge.
 * Displayed ONLY when confirmed by backend conflict detection diagnostics.
 * NEVER inferred solely from visual slot overlap.
 */
export const ConflictBadge: React.FC<ConflictBadgeProps> = ({ className = '', size = 'md' }) => {
  const iconSize = size === 'sm' ? 'h-3 w-3' : 'h-3.5 w-3.5';
  const textSize = size === 'sm' ? 'text-xs px-1.5 py-0.5' : 'text-xs px-2 py-0.5';

  return (
    <span
      className={`inline-flex items-center gap-1 rounded font-semibold bg-status-danger text-status-danger-foreground shadow-xs ${textSize} ${className}`}
      role="status"
      aria-label="Schedule conflict detected by system"
    >
      <AlertCircle className={`${iconSize} shrink-0`} aria-hidden="true" />
      <span>Conflict</span>
    </span>
  );
};
