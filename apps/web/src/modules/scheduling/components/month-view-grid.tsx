import React from 'react';
import type { DayDescriptor } from '../utils/calendar-date.utils';
import { AppointmentCard } from './appointment-card';
import type { AppointmentModel, CalendarSlotDTO } from '../types/scheduling.types';

export interface MonthViewGridProps {
  days: DayDescriptor[];
  appointments: (AppointmentModel | CalendarSlotDTO)[];
  onSelectAppointment: (appointment: AppointmentModel | CalendarSlotDTO) => void;
  onSelectDate: (dateString: string) => void;
}

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export const MonthViewGrid: React.FC<MonthViewGridProps> = ({
  days,
  appointments,
  onSelectAppointment,
  onSelectDate,
}) => {
  // Helper to map UTC ISO string to facility YYYY-MM-DD
  const getAppointmentFacilityDate = (isoString: string): string => {
    if (!isoString) return '';
    const date = new Date(isoString);
    if (isNaN(date.getTime())) return '';
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/New_York',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(date);
  };

  // Group appointments by day
  const appointmentsByDay = React.useMemo(() => {
    const map = new Map<string, (AppointmentModel | CalendarSlotDTO)[]>();
    for (const day of days) {
      map.set(day.dateString, []);
    }

    for (const appt of appointments) {
      const apptDateStr = getAppointmentFacilityDate(appt.startTime);
      const list = map.get(apptDateStr);
      if (list) {
        list.push(appt);
      }
    }

    return map;
  }, [days, appointments]);

  return (
    <div
      className="flex flex-col flex-1 border border-border rounded-lg bg-background overflow-hidden shadow-xs select-none"
      role="region"
      aria-label="Monthly appointment calendar grid"
    >
      {/* Weekday headers */}
      <div className="grid grid-cols-7 border-b border-border bg-muted/40">
        {WEEKDAYS.map((name) => (
          <div
            key={name}
            className="p-2 text-center text-xs font-semibold text-muted-foreground uppercase tracking-wider border-r border-border last:border-r-0"
          >
            {name}
          </div>
        ))}
      </div>

      {/* Days Matrix */}
      <div className="grid grid-cols-7 auto-rows-fr flex-1 divide-y divide-border">
        {days.map((day) => {
          const dayAppts = appointmentsByDay.get(day.dateString) || [];
          const visibleAppts = dayAppts.slice(0, 3);
          const hiddenCount = dayAppts.length - visibleAppts.length;

          return (
            <div
              key={day.dateString}
              className={`min-h-[110px] p-1.5 flex flex-col border-r border-border last:border-r-0 transition-colors ${
                day.isToday ? 'bg-primary/5' : 'hover:bg-muted/20'
              }`}
            >
              {/* Day Header with clickable date navigation */}
              <div className="flex items-center justify-between mb-1">
                <button
                  type="button"
                  onClick={() => onSelectDate(day.dateString)}
                  className={`text-xs font-bold px-1.5 py-0.5 rounded-sm transition-colors hover:bg-accent focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-ring ${
                    day.isToday ? 'bg-primary text-primary-foreground' : 'text-foreground'
                  }`}
                  aria-label={`View schedule for ${day.dateString}`}
                >
                  {day.dayNumber}
                </button>
                {dayAppts.length > 0 && (
                  <span className="text-[10px] font-medium text-muted-foreground">
                    {dayAppts.length}
                  </span>
                )}
              </div>

              {/* Day Appointments Chips */}
              <div className="space-y-1 flex-1 overflow-y-auto">
                {visibleAppts.map((appt) => (
                  <AppointmentCard
                    key={appt.id}
                    appointment={appt}
                    onSelect={onSelectAppointment}
                    variant="month-chip"
                  />
                ))}

                {/* More indicator */}
                {hiddenCount > 0 && (
                  <button
                    type="button"
                    onClick={() => onSelectDate(day.dateString)}
                    className="w-full text-left text-[10px] font-semibold text-primary hover:underline px-1 py-0.5"
                    aria-label={`${hiddenCount} more appointments on ${day.dateString}`}
                  >
                    +{hiddenCount} more
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
