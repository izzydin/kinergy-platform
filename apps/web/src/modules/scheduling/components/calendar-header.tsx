import React from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@kinergy-platform/ui';
import {
  Calendar as CalendarIcon,
  ChevronLeft,
  ChevronRight,
  Clock,
  DoorClosed,
  FilterX,
  Plus,
} from 'lucide-react';
import { FACILITY_TIMEZONE } from '../utils/calendar-date.utils';
import type { CalendarViewMode } from '../hooks/use-calendar-url-state';
import type { RoomModel } from '../types/scheduling.types';
import { APPOINTMENT_STATUSES } from '../types/scheduling.types';

export interface CalendarHeaderProps {
  view: CalendarViewMode;
  dateRangeTitle: string;
  isToday: boolean;
  rooms?: RoomModel[];
  selectedRoomId?: string;
  selectedTherapistId?: string;
  selectedStatus?: string;
  isFiltered: boolean;
  canCreateAppointment?: boolean;
  onViewChange: (view: CalendarViewMode) => void;
  onNavigate: (direction: 'prev' | 'next') => void;
  onGoToToday: () => void;
  onRoomChange: (roomId?: string) => void;
  onTherapistChange: (therapistId?: string) => void;
  onStatusChange: (status?: string) => void;
  onResetFilters: () => void;
  onStartBooking?: () => void;
}

export const CalendarHeader: React.FC<CalendarHeaderProps> = ({
  view,
  dateRangeTitle,
  isToday,
  rooms = [],
  selectedRoomId,
  selectedTherapistId,
  selectedStatus,
  isFiltered,
  canCreateAppointment = true,
  onViewChange,
  onNavigate,
  onGoToToday,
  onRoomChange,
  onTherapistChange,
  onStatusChange,
  onResetFilters,
  onStartBooking,
}) => {
  return (
    <header className="space-y-3 pb-3 border-b border-border">
      {/* Top Bar: Navigation, Date Title, Timezone, View Switcher & Booking Action */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        {/* Navigation & Date Title */}
        <div className="flex items-center gap-2 flex-wrap">
          <div className="inline-flex items-center rounded-md border border-input bg-background p-0.5 shadow-xs">
            <button
              type="button"
              onClick={() => onNavigate('prev')}
              className="inline-flex h-8 w-8 items-center justify-center rounded-sm text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring"
              aria-label="Previous period"
            >
              <ChevronLeft className="h-4 w-4" aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={onGoToToday}
              disabled={isToday}
              className={`px-2.5 h-8 text-xs font-medium rounded-sm transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring ${
                isToday ? 'opacity-50 cursor-not-allowed' : ''
              }`}
              aria-label="Jump to current date"
            >
              Today
            </button>
            <button
              type="button"
              onClick={() => onNavigate('next')}
              className="inline-flex h-8 w-8 items-center justify-center rounded-sm text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring"
              aria-label="Next period"
            >
              <ChevronRight className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>

          <h1 className="text-xl font-bold tracking-tight text-foreground flex items-center gap-2">
            <CalendarIcon className="h-5 w-5 text-primary shrink-0" aria-hidden="true" />
            <span>{dateRangeTitle}</span>
          </h1>

          {/* Facility Timezone Indicator */}
          <div
            className="inline-flex items-center gap-1 rounded-full bg-slate-100 dark:bg-slate-800 px-2.5 py-0.5 text-xs font-medium text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700"
            title={`Authoritative Facility Timezone: ${FACILITY_TIMEZONE}. All schedule slots correspond to clinic operational hours.`}
            role="status"
            aria-label={`Facility timezone: ${FACILITY_TIMEZONE}`}
          >
            <Clock className="h-3 w-3 shrink-0" aria-hidden="true" />
            <span>{FACILITY_TIMEZONE}</span>
          </div>
        </div>

        {/* View Switcher & Actions */}
        <div className="flex items-center gap-2 self-end sm:self-auto">
          {/* View Mode Segmented Control */}
          <div
            role="tablist"
            aria-label="Calendar view selector"
            className="inline-flex h-9 items-center justify-center rounded-lg bg-muted p-1 text-muted-foreground"
          >
            <button
              type="button"
              role="tab"
              aria-selected={view === 'day'}
              onClick={() => onViewChange('day')}
              className={`inline-flex items-center justify-center whitespace-nowrap rounded-md px-3 py-1 text-xs font-medium ring-offset-background transition-all focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${
                view === 'day' ? 'bg-background text-foreground shadow-xs' : 'hover:text-foreground'
              }`}
            >
              Day
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={view === 'week'}
              onClick={() => onViewChange('week')}
              className={`inline-flex items-center justify-center whitespace-nowrap rounded-md px-3 py-1 text-xs font-medium ring-offset-background transition-all focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${
                view === 'week'
                  ? 'bg-background text-foreground shadow-xs'
                  : 'hover:text-foreground'
              }`}
            >
              Week
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={view === 'month'}
              onClick={() => onViewChange('month')}
              className={`inline-flex items-center justify-center whitespace-nowrap rounded-md px-3 py-1 text-xs font-medium ring-offset-background transition-all focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${
                view === 'month'
                  ? 'bg-background text-foreground shadow-xs'
                  : 'hover:text-foreground'
              }`}
            >
              Month
            </button>
          </div>

          {/* Rooms Directory Link */}
          <Link to="/rooms">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="inline-flex items-center gap-1.5 shadow-xs text-xs"
              aria-label="View room directory"
            >
              <DoorClosed className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Rooms</span>
            </Button>
          </Link>

          {/* Book Appointment Action */}
          {canCreateAppointment && (
            <Button
              onClick={onStartBooking}
              size="sm"
              className="inline-flex items-center gap-1.5 shadow-xs"
              aria-label="Book new appointment"
            >
              <Plus className="h-4 w-4" aria-hidden="true" />
              <span>Book Appointment</span>
            </Button>
          )}
        </div>
      </div>

      {/* Filter Row: Room, Therapist, Status, and Reset */}
      <div className="flex flex-wrap items-center gap-2 pt-1 text-xs">
        {/* Room Filter */}
        <div className="flex items-center gap-1">
          <label htmlFor="filter-room" className="font-medium text-muted-foreground shrink-0">
            Room:
          </label>
          <select
            id="filter-room"
            value={selectedRoomId || ''}
            onChange={(e) => onRoomChange(e.target.value || undefined)}
            className="h-8 rounded-md border border-input bg-background px-2 py-1 text-xs shadow-xs focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-ring"
            aria-label="Filter calendar by room"
          >
            <option value="">All Rooms</option>
            {rooms.map((room) => (
              <option key={room.id} value={room.id}>
                {room.name} {room.status === 'UNAVAILABLE' ? '(Unavailable)' : ''}
              </option>
            ))}
          </select>
        </div>

        {/* Therapist Filter */}
        <div className="flex items-center gap-1">
          <label htmlFor="filter-therapist" className="font-medium text-muted-foreground shrink-0">
            Therapist:
          </label>
          <input
            id="filter-therapist"
            type="text"
            placeholder="Therapist ID..."
            value={selectedTherapistId || ''}
            onChange={(e) => onTherapistChange(e.target.value.trim() || undefined)}
            className="h-8 w-32 rounded-md border border-input bg-background px-2 py-1 text-xs shadow-xs focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-ring"
            aria-label="Filter calendar by therapist ID"
          />
        </div>

        {/* Status Filter */}
        <div className="flex items-center gap-1">
          <label htmlFor="filter-status" className="font-medium text-muted-foreground shrink-0">
            Status:
          </label>
          <select
            id="filter-status"
            value={selectedStatus || ''}
            onChange={(e) => onStatusChange(e.target.value || undefined)}
            className="h-8 rounded-md border border-input bg-background px-2 py-1 text-xs shadow-xs focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-ring"
            aria-label="Filter calendar by appointment status"
          >
            <option value="">All Statuses</option>
            {APPOINTMENT_STATUSES.map((status) => (
              <option key={status} value={status}>
                {status}
              </option>
            ))}
          </select>
        </div>

        {/* Reset Filter Button */}
        {isFiltered && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onResetFilters}
            className="h-8 px-2 text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
            aria-label="Clear all calendar filters"
          >
            <FilterX className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Clear Filters</span>
          </Button>
        )}
      </div>
    </header>
  );
};
