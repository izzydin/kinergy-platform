import React from 'react';
import type { RoomStatus } from '../../types/scheduling.types';

export interface RoomStatusBadgeProps {
  status: RoomStatus;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
  hasActiveMaintenance?: boolean;
}

export const RoomStatusBadge: React.FC<RoomStatusBadgeProps> = ({
  status,
  size = 'md',
  className = '',
  hasActiveMaintenance = false,
}) => {
  const effectiveStatus = hasActiveMaintenance ? 'MAINTENANCE' : status;

  const sizeClasses = {
    sm: 'text-[10px] px-1.5 py-0.5 gap-1',
    md: 'text-xs px-2 py-0.5 gap-1.5',
    lg: 'text-sm px-2.5 py-1 gap-2',
  }[size];

  const config = {
    AVAILABLE: {
      label: 'Available',
      bgClass:
        'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800',
      dotClass: 'bg-emerald-500',
    },
    UNAVAILABLE: {
      label: 'Unavailable',
      bgClass: 'bg-muted text-muted-foreground border-border',
      dotClass: 'bg-muted-foreground',
    },
    MAINTENANCE: {
      label: 'In Maintenance',
      bgClass:
        'bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800',
      dotClass: 'bg-amber-500 animate-pulse',
    },
  }[effectiveStatus] || {
    label: effectiveStatus,
    bgClass: 'bg-muted text-foreground border-border',
    dotClass: 'bg-foreground',
  };

  return (
    <span
      className={`inline-flex items-center font-medium rounded-full border ${config.bgClass} ${sizeClasses} ${className}`}
      role="status"
      aria-label={`Room status: ${config.label}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${config.dotClass}`} aria-hidden="true" />
      <span>{config.label}</span>
    </span>
  );
};
