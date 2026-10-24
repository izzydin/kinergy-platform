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
          className={`inline-flex items-center gap-1 border-emerald-500/30 bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 font-medium ${textSize} ${className}`}
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
          className={`inline-flex items-center gap-1 border-blue-500/30 bg-blue-500/15 text-blue-700 dark:text-blue-400 font-medium ${textSize} ${className}`}
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
          className={`inline-flex items-center gap-1 border-indigo-500/30 bg-indigo-500/15 text-indigo-700 dark:text-indigo-400 font-medium animate-pulse ${textSize} ${className}`}
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
          className={`inline-flex items-center gap-1 border-slate-300 bg-slate-100 text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 font-medium ${textSize} ${className}`}
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
          className={`inline-flex items-center gap-1 border-rose-500/30 bg-rose-500/15 text-rose-700 dark:text-rose-400 font-medium ${textSize} ${className}`}
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
          className={`inline-flex items-center gap-1 border-amber-600/30 bg-amber-600/15 text-amber-800 dark:text-amber-400 font-medium ${textSize} ${className}`}
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
          className={`inline-flex items-center gap-1 border-purple-500/30 bg-purple-500/15 text-purple-700 dark:text-purple-400 font-medium ${textSize} ${className}`}
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
          className={`inline-flex items-center gap-1 border-orange-500/30 bg-orange-500/15 text-orange-700 dark:text-orange-400 font-medium ${textSize} ${className}`}
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
          className={`inline-flex items-center gap-1 border-cyan-500/30 bg-cyan-500/15 text-cyan-800 dark:text-cyan-300 font-medium ${textSize} ${className}`}
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
      className={`inline-flex items-center gap-1 rounded font-semibold bg-red-600 text-white shadow-xs ${textSize} ${className}`}
      role="status"
      aria-label="Schedule conflict detected by system"
    >
      <AlertCircle className={`${iconSize} shrink-0`} aria-hidden="true" />
      <span>Conflict</span>
    </span>
  );
};
