import React, { useState, useMemo } from 'react';
import { Alert, AlertDescription, AlertTitle, Button } from '@kinergy-platform/ui';
import { AlertCircle, Calendar, RefreshCw } from 'lucide-react';
import { useAuth } from '../../../app/providers/auth-provider';
import { getDayRange, getMonthRange, getWeekRange } from '../utils/calendar-date.utils';

import { useCalendarUrlState } from '../hooks/use-calendar-url-state';
import { useAppointmentsList, useRoomsList } from '../hooks/use-scheduling-queries';
import {
  CalendarHeader,
  WeekViewGrid,
  DayViewGrid,
  MonthViewGrid,
  AppointmentDetailDrawer,
  AppointmentBookingWizard,
} from '../components';

import type { AppointmentModel, CalendarSlotDTO } from '../types/scheduling.types';

export const CalendarPage: React.FC = () => {
  const {
    view,
    date,
    therapistId,
    roomId,
    status,
    isFiltered,
    setView,
    setDate,
    navigate,
    goToToday,
    setTherapistId,
    setRoomId,
    setStatus,
    resetFilters,
  } = useCalendarUrlState();

  const [selectedAppointment, setSelectedAppointment] = useState<
    AppointmentModel | CalendarSlotDTO | null
  >(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [isBookingModalOpen, setIsBookingModalOpen] = useState(false);

  const auth = useAuth();

  const canCreateAppointment = auth?.hasPermission
    ? auth.hasPermission('appointments.create')
    : true;
  const canManageAppointments = auth?.hasPermission
    ? auth.hasPermission('appointments.update')
    : true;

  // 1. Calculate Authoritative Date Range Bounds for the active view
  const rangeData = useMemo(() => {
    if (view === 'day') {
      const dayData = getDayRange(date);
      return {
        startDate: dayData.startDate,
        endDate: dayData.endDate,
        rangeTitle: dayData.rangeTitle,
        isToday: dayData.isToday,
      };
    }

    if (view === 'month') {
      const monthData = getMonthRange(date);
      return {
        startDate: monthData.startDate,
        endDate: monthData.endDate,
        rangeTitle: monthData.rangeTitle,
        monthGridDays: monthData.monthGridDays,
        isToday: false,
      };
    }

    // Default 'week' view
    const weekData = getWeekRange(date);
    return {
      startDate: weekData.startDate,
      endDate: weekData.endDate,
      rangeTitle: weekData.rangeTitle,
      days: weekData.days,
      isToday: weekData.days.some((d) => d.isToday),
    };
  }, [view, date]);

  // 2. Fetch Appointments for the visible bounds and applied filters
  const {
    data: appointments = [],
    isLoading: isAppointmentsLoading,
    isError: isAppointmentsError,
    error: appointmentsError,
    refetch: refetchAppointments,
    isFetching,
  } = useAppointmentsList({
    startDate: rangeData.startDate,
    endDate: rangeData.endDate,
    therapistId,
    roomId,
    status,
  });

  // 3. Fetch Rooms for room filter dropdown
  const { data: rooms = [] } = useRoomsList();

  const handleSelectAppointment = (appointment: AppointmentModel | CalendarSlotDTO) => {
    setSelectedAppointment(appointment);
    setIsDrawerOpen(true);
  };

  const handleCloseDrawer = () => {
    setIsDrawerOpen(false);
    setSelectedAppointment(null);
  };

  const handleStartBooking = () => {
    setIsBookingModalOpen(true);
  };

  return (
    <div
      className="flex flex-col flex-1 h-full min-h-[calc(100vh-4rem)] p-4 sm:p-6 space-y-4 max-w-[1600px] mx-auto w-full"
      id="scheduling-calendar-page"
    >
      {/* Calendar Header with Controls & Filters */}
      <CalendarHeader
        view={view}
        dateRangeTitle={rangeData.rangeTitle}
        isToday={Boolean(rangeData.isToday)}
        rooms={rooms}
        selectedRoomId={roomId}
        selectedTherapistId={therapistId}
        selectedStatus={status}
        isFiltered={isFiltered}
        canCreateAppointment={canCreateAppointment}
        onViewChange={setView}
        onNavigate={navigate}
        onGoToToday={goToToday}
        onRoomChange={setRoomId}
        onTherapistChange={setTherapistId}
        onStatusChange={setStatus}
        onResetFilters={resetFilters}
        onStartBooking={handleStartBooking}
      />

      {/* Recoverable Error State */}
      {isAppointmentsError && (
        <Alert
          variant="destructive"
          className="my-4 border-destructive/50 bg-destructive/10"
          role="alert"
        >
          <AlertCircle className="h-4 w-4" />
          <AlertTitle className="font-semibold">Unable to load calendar appointments</AlertTitle>
          <AlertDescription className="mt-1 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 text-xs">
            <span>
              {appointmentsError?.message ||
                'A network or server error occurred while retrieving appointments for this period.'}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => refetchAppointments()}
              className="inline-flex items-center gap-1.5 shrink-0 self-start sm:self-auto"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              <span>Retry</span>
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {/* Loading Skeleton View */}
      {isAppointmentsLoading && (
        <div
          className="flex-1 flex flex-col items-center justify-center border border-border/70 rounded-lg bg-card/40 p-12 min-h-[500px] animate-pulse space-y-4"
          role="status"
          aria-label="Loading calendar appointments"
        >
          <Calendar className="h-10 w-10 text-muted-foreground/30 animate-spin" />
          <p className="text-sm font-medium text-muted-foreground">
            Loading facility calendar schedule...
          </p>
        </div>
      )}

      {/* Populated Calendar Views */}
      {!isAppointmentsLoading && !isAppointmentsError && (
        <main className="flex flex-col flex-1 relative">
          {/* Subtle background fetching indicator */}
          {isFetching && (
            <div
              className="absolute top-2 right-2 z-20 bg-background/80 backdrop-blur-xs text-[11px] text-muted-foreground px-2 py-0.5 rounded-full border border-border shadow-xs animate-pulse flex items-center gap-1"
              role="status"
            >
              <RefreshCw className="h-3 w-3 animate-spin" />
              <span>Updating...</span>
            </div>
          )}

          {view === 'week' && 'days' in rangeData && rangeData.days && (
            <WeekViewGrid
              days={rangeData.days}
              appointments={appointments}
              onSelectAppointment={handleSelectAppointment}
            />
          )}

          {view === 'day' && (
            <DayViewGrid
              dateString={date}
              appointments={appointments}
              onSelectAppointment={handleSelectAppointment}
            />
          )}

          {view === 'month' && 'monthGridDays' in rangeData && rangeData.monthGridDays && (
            <MonthViewGrid
              days={rangeData.monthGridDays}
              appointments={appointments}
              onSelectAppointment={handleSelectAppointment}
              onSelectDate={(newDate) => {
                setDate(newDate);
                setView('day');
              }}
            />
          )}
        </main>
      )}

      {/* Appointment Detail & Lifecycle Management Drawer */}
      <AppointmentDetailDrawer
        appointment={selectedAppointment}
        isOpen={isDrawerOpen}
        onClose={handleCloseDrawer}
        canManageAppointments={canManageAppointments}
        rooms={rooms}
      />

      {/* Guided Appointment Booking Wizard Modal */}
      <AppointmentBookingWizard
        isOpen={isBookingModalOpen}
        onClose={() => setIsBookingModalOpen(false)}
        initialDate={date}
        initialRoomId={roomId}
        initialTherapistId={therapistId}
      />
    </div>
  );
};
