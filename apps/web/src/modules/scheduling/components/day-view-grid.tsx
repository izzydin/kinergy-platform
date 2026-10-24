import React from 'react';
import { calculateSlotPosition, formatFacilityDate } from '../utils/calendar-date.utils';
import { AppointmentCard } from './appointment-card';
import type { AppointmentModel, CalendarSlotDTO } from '../types/scheduling.types';
import { Calendar } from 'lucide-react';

export interface DayViewGridProps {
  dateString: string;
  appointments: (AppointmentModel | CalendarSlotDTO)[];
  onSelectAppointment: (appointment: AppointmentModel | CalendarSlotDTO) => void;
  startHour?: number;
  endHour?: number;
}

const HOURS = Array.from({ length: 13 }, (_, i) => i + 8); // 8:00 AM to 8:00 PM

export const DayViewGrid: React.FC<DayViewGridProps> = ({
  dateString,
  appointments,
  onSelectAppointment,
  startHour = 8,
  endHour = 20,
}) => {
  const formattedDayTitle = formatFacilityDate(dateString, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });

  return (
    <div
      className="flex flex-col flex-1 border border-border rounded-lg bg-background overflow-hidden shadow-xs"
      role="region"
      aria-label={`Daily schedule for ${formattedDayTitle}`}
    >
      {/* Day Header Banner */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-muted/40">
        <div>
          <h2 className="text-base font-semibold text-foreground">{formattedDayTitle}</h2>
          <p className="text-xs text-muted-foreground">
            {appointments.length} {appointments.length === 1 ? 'appointment' : 'appointments'}{' '}
            scheduled
          </p>
        </div>
      </div>

      {/* Grid Container */}
      <div className="grid grid-cols-[80px_1fr] relative min-h-[700px] overflow-y-auto">
        {/* Time Gutter */}
        <div className="border-r border-border bg-muted/20 select-none">
          {HOURS.map((hour) => {
            const period = hour >= 12 ? 'PM' : 'AM';
            const displayHour = hour > 12 ? hour - 12 : hour === 0 ? 12 : hour;
            return (
              <div
                key={hour}
                className="h-16 border-b border-border/50 text-xs font-medium text-muted-foreground text-center pr-2 pt-2"
              >
                {displayHour}:00 {period}
              </div>
            );
          })}
        </div>

        {/* Schedule Lane */}
        <div className="relative" role="gridcell" aria-label={`Timeline for ${formattedDayTitle}`}>
          {/* Background hour guidelines */}
          {HOURS.map((hour) => (
            <div key={hour} className="h-16 border-b border-border/40" />
          ))}

          {/* Positioned Appointments */}
          {appointments.map((appt) => {
            const { topPercent, heightPercent } = calculateSlotPosition(
              appt.startTime,
              appt.endTime,
              startHour,
              endHour,
            );

            return (
              <div
                key={appt.id}
                className="absolute inset-x-3 z-10 transition-transform duration-100 ease-out"
                style={{
                  top: `${topPercent}%`,
                  height: `${heightPercent}%`,
                  minHeight: '52px',
                }}
              >
                <AppointmentCard
                  appointment={appt}
                  onSelect={onSelectAppointment}
                  variant="detailed"
                  className="h-full w-full"
                />
              </div>
            );
          })}

          {/* Empty state when zero appointments */}
          {appointments.length === 0 && (
            <div className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center">
              <Calendar className="h-10 w-10 text-muted-foreground/40 mb-2" aria-hidden="true" />
              <p className="text-sm font-medium text-foreground">No appointments today</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                There are no scheduled sessions for this day matching your current filters.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
