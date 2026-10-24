import React from 'react';
import { formatFacilityTime } from '../utils/calendar-date.utils';
import { CalendarStatusBadge, ConflictBadge } from './calendar-status-badge';
import type { AppointmentModel, CalendarSlotDTO } from '../types/scheduling.types';
import { MapPin, User, Stethoscope } from 'lucide-react';

export interface AppointmentCardProps {
  appointment: AppointmentModel | CalendarSlotDTO;
  onSelect?: (appointment: AppointmentModel | CalendarSlotDTO) => void;
  className?: string;
  variant?: 'compact' | 'detailed' | 'month-chip';
  style?: React.CSSProperties;
}

export const AppointmentCard: React.FC<AppointmentCardProps> = ({
  appointment,
  onSelect,
  className = '',
  variant = 'detailed',
  style,
}) => {
  const startTimeLabel = formatFacilityTime(appointment.startTime);
  const endTimeLabel = formatFacilityTime(appointment.endTime);
  const timeDisplay = `${startTimeLabel} – ${endTimeLabel}`;

  const clientTitle =
    'clientName' in appointment && appointment.clientName
      ? appointment.clientName
      : appointment.clientId
        ? `Client: ${appointment.clientId.slice(0, 8)}`
        : 'Unspecified Client';

  const serviceLabel =
    'serviceType' in appointment && appointment.serviceType
      ? appointment.serviceType
      : 'type' in appointment && appointment.type
        ? appointment.type
        : 'Standard Session';

  const hasConflict = Boolean('hasConflict' in appointment && appointment.hasConflict);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if ((e.key === 'Enter' || e.key === ' ') && onSelect) {
      e.preventDefault();
      onSelect(appointment);
    }
  };

  // Month-view compact chip
  if (variant === 'month-chip') {
    return (
      <button
        type="button"
        onClick={() => onSelect?.(appointment)}
        onKeyDown={handleKeyDown}
        style={style}
        className={`w-full text-left rounded px-1.5 py-0.5 text-xs font-medium transition-colors flex items-center justify-between gap-1 overflow-hidden truncate focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring ${
          hasConflict
            ? 'bg-rose-100 text-rose-900 border border-rose-300 dark:bg-rose-950/40 dark:text-rose-200'
            : 'bg-primary/10 text-primary-900 dark:text-primary-100 hover:bg-primary/20 border border-primary/20'
        } ${className}`}
        aria-label={`${timeDisplay}, ${serviceLabel}, ${clientTitle}, Status: ${appointment.status}`}
      >
        <span className="truncate font-semibold shrink-0">{startTimeLabel}</span>
        <span className="truncate">{serviceLabel}</span>
        {hasConflict && <ConflictBadge size="sm" className="ml-auto" />}
      </button>
    );
  }

  // Week & Day Grid Card
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onSelect?.(appointment)}
      onKeyDown={handleKeyDown}
      style={style}
      className={`group relative rounded-md border text-left transition-all shadow-xs cursor-pointer focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 select-none overflow-hidden ${
        hasConflict
          ? 'border-rose-400 bg-rose-50/90 text-rose-950 dark:bg-rose-950/30 dark:border-rose-700/60 dark:text-rose-100'
          : 'border-slate-200 bg-white/95 text-slate-900 dark:border-slate-800 dark:bg-slate-900/90 dark:text-slate-100 hover:border-primary/50 hover:shadow-md'
      } ${variant === 'compact' ? 'p-1.5 text-xs' : 'p-2.5 text-xs'} ${className}`}
      aria-label={`Appointment: ${serviceLabel} for ${clientTitle} at ${timeDisplay}. Status: ${appointment.status}`}
    >
      {/* Top Header: Time & Badges */}
      <div className="flex items-center justify-between gap-1 mb-1">
        <span className="font-semibold text-slate-800 dark:text-slate-200 tracking-tight">
          {timeDisplay}
        </span>
        <div className="flex items-center gap-1 shrink-0">
          {hasConflict && <ConflictBadge size="sm" />}
          <CalendarStatusBadge status={appointment.status} size="sm" />
        </div>
      </div>

      {/* Service Type & Client */}
      <div className="font-semibold text-slate-900 dark:text-white truncate text-xs mb-1">
        {serviceLabel}
      </div>

      {/* Metadata items */}
      <div className="space-y-0.5 text-muted-foreground text-[11px]">
        <div className="flex items-center gap-1 truncate">
          <User className="h-3 w-3 shrink-0 text-slate-400" aria-hidden="true" />
          <span className="truncate">{clientTitle}</span>
        </div>

        {appointment.therapistId && (
          <div className="flex items-center gap-1 truncate">
            <Stethoscope className="h-3 w-3 shrink-0 text-slate-400" aria-hidden="true" />
            <span className="truncate">Therapist: {appointment.therapistId.slice(0, 8)}</span>
          </div>
        )}

        {appointment.roomId && (
          <div className="flex items-center gap-1 truncate">
            <MapPin className="h-3 w-3 shrink-0 text-slate-400" aria-hidden="true" />
            <span className="truncate">Room: {appointment.roomId}</span>
          </div>
        )}
      </div>
    </div>
  );
};
