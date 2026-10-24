import React from 'react';
import {
  type DayDescriptor,
  calculateSlotPosition,
  formatFacilityDate,
} from '../utils/calendar-date.utils';
import { AppointmentCard } from './appointment-card';
import type { AppointmentModel, CalendarSlotDTO } from '../types/scheduling.types';

export interface WeekViewGridProps {
  days: DayDescriptor[];
  appointments: (AppointmentModel | CalendarSlotDTO)[];
  onSelectAppointment: (appointment: AppointmentModel | CalendarSlotDTO) => void;
  startHour?: number;
  endHour?: number;
}

const HOURS = Array.from({ length: 13 }, (_, i) => i + 8); // 8:00 AM to 8:00 PM (20:00)

export const WeekViewGrid: React.FC<WeekViewGridProps> = ({
  days,
  appointments,
  onSelectAppointment,
  startHour = 8,
  endHour = 20,
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

  // Group appointments by day dateString in facility timezone
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
      } else {
        // In case appointment started on a day not strictly in array or crosses day boundaries
        const matchedDay = days.find((d) => d.dateString === apptDateStr);
        if (matchedDay) {
          map.set(apptDateStr, [appt]);
        }
      }
    }

    return map;
  }, [days, appointments]);

  return (
    <div
      className="flex flex-col flex-1 border border-border rounded-lg bg-background overflow-x-auto shadow-xs select-none"
      role="region"
      aria-label="Weekly appointment calendar grid"
    >
      {/* Week Header Row */}
      <div className="grid grid-cols-[60px_repeat(7,minmax(140px,1fr))] border-b border-border bg-muted/40 sticky top-0 z-10">
        {/* Time gutter corner */}
        <div className="p-2 text-center text-xs font-semibold text-muted-foreground border-r border-border">
          Time
        </div>

        {/* 7 Days Columns Headers */}
        {days.map((day) => (
          <div
            key={day.dateString}
            className={`p-2.5 text-center border-r border-border last:border-r-0 ${
              day.isToday ? 'bg-primary/10' : ''
            }`}
          >
            <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              {day.dayName}
            </div>
            <div
              className={`inline-flex items-center justify-center mt-0.5 text-sm font-bold ${
                day.isToday
                  ? 'h-6 w-6 rounded-full bg-primary text-primary-foreground mx-auto'
                  : 'text-foreground'
              }`}
            >
              {day.dayNumber}
            </div>
          </div>
        ))}
      </div>

      {/* Grid Body: Time slots & Days */}
      <div className="grid grid-cols-[60px_repeat(7,minmax(140px,1fr))] relative min-h-[650px]">
        {/* Time Gutter Column */}
        <div className="border-r border-border bg-muted/20">
          {HOURS.map((hour) => {
            const period = hour >= 12 ? 'PM' : 'AM';
            const displayHour = hour > 12 ? hour - 12 : hour === 0 ? 12 : hour;
            return (
              <div
                key={hour}
                className="h-14 border-b border-border/50 text-[11px] font-medium text-muted-foreground text-center pr-1 pt-1"
              >
                {displayHour} {period}
              </div>
            );
          })}
        </div>

        {/* 7 Day Columns with Appointment Cards */}
        {days.map((day) => {
          const dayAppts = appointmentsByDay.get(day.dateString) || [];

          return (
            <div
              key={day.dateString}
              className={`relative border-r border-border last:border-r-0 ${
                day.isToday ? 'bg-primary/5' : ''
              }`}
              role="gridcell"
              aria-label={`Schedule for ${formatFacilityDate(day.dateString)}`}
            >
              {/* Background hourly guidelines */}
              {HOURS.map((hour) => (
                <div key={hour} className="h-14 border-b border-border/40" />
              ))}

              {/* Positioned Appointments */}
              {dayAppts.map((appt) => {
                const { topPercent, heightPercent } = calculateSlotPosition(
                  appt.startTime,
                  appt.endTime,
                  startHour,
                  endHour,
                );

                return (
                  <div
                    key={appt.id}
                    className="absolute inset-x-1 z-10 transition-transform duration-100 ease-out"
                    style={{
                      top: `${topPercent}%`,
                      height: `${heightPercent}%`,
                      minHeight: '44px',
                    }}
                  >
                    <AppointmentCard
                      appointment={appt}
                      onSelect={onSelectAppointment}
                      variant="compact"
                      className="h-full w-full"
                    />
                  </div>
                );
              })}

              {/* Accessible Empty State if zero appointments */}
              {dayAppts.length === 0 && (
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none opacity-0 focus-within:opacity-100">
                  <span className="text-xs text-muted-foreground sr-only">
                    No appointments scheduled for {day.dayName} {day.dayNumber}
                  </span>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
