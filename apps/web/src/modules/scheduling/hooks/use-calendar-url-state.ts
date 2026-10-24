import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  getTodayFacilityDate,
  navigatePeriod as calcNavigatePeriod,
} from '../utils/calendar-date.utils';

export type CalendarViewMode = 'day' | 'week' | 'month';

export interface CalendarUrlState {
  view: CalendarViewMode;
  date: string; // "YYYY-MM-DD"
  therapistId?: string;
  roomId?: string;
  status?: string;
}

export function useCalendarUrlState() {
  const [searchParams, setSearchParams] = useSearchParams();

  // 1. Resolve View Mode (defaults to 'week')
  const rawView = searchParams.get('view');
  const view: CalendarViewMode = rawView === 'day' || rawView === 'month' ? rawView : 'week';

  // 2. Resolve Reference Date (defaults to today in facility timezone)
  const rawDate = searchParams.get('date');
  const date = rawDate && /^\d{4}-\d{2}-\d{2}$/.test(rawDate) ? rawDate : getTodayFacilityDate();

  // 3. Resolve Filters
  const therapistId = searchParams.get('therapistId') || undefined;
  const roomId = searchParams.get('roomId') || undefined;
  const status = searchParams.get('status') || undefined;

  const isFiltered = Boolean(therapistId || roomId || status);

  // Helper to commit new params to URL
  const updateParams = useCallback(
    (newParams: Partial<CalendarUrlState>) => {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);

          if (newParams.view !== undefined) {
            if (newParams.view === 'week') {
              next.delete('view');
            } else {
              next.set('view', newParams.view);
            }
          }

          if (newParams.date !== undefined) {
            const today = getTodayFacilityDate();
            if (newParams.date === today) {
              next.delete('date');
            } else {
              next.set('date', newParams.date);
            }
          }

          if (newParams.therapistId !== undefined) {
            if (newParams.therapistId) {
              next.set('therapistId', newParams.therapistId);
            } else {
              next.delete('therapistId');
            }
          }

          if (newParams.roomId !== undefined) {
            if (newParams.roomId) {
              next.set('roomId', newParams.roomId);
            } else {
              next.delete('roomId');
            }
          }

          if (newParams.status !== undefined) {
            if (newParams.status) {
              next.set('status', newParams.status);
            } else {
              next.delete('status');
            }
          }

          return next;
        },
        { replace: true },
      );
    },
    [setSearchParams],
  );

  const setView = useCallback(
    (newView: CalendarViewMode) => {
      updateParams({ view: newView });
    },
    [updateParams],
  );

  const setDate = useCallback(
    (newDate: string) => {
      updateParams({ date: newDate });
    },
    [updateParams],
  );

  const navigate = useCallback(
    (direction: 'prev' | 'next') => {
      const nextDate = calcNavigatePeriod(date, direction, view);
      updateParams({ date: nextDate });
    },
    [date, view, updateParams],
  );

  const goToToday = useCallback(() => {
    updateParams({ date: getTodayFacilityDate() });
  }, [updateParams]);

  const setTherapistId = useCallback(
    (id: string | undefined) => {
      updateParams({ therapistId: id || '' });
    },
    [updateParams],
  );

  const setRoomId = useCallback(
    (id: string | undefined) => {
      updateParams({ roomId: id || '' });
    },
    [updateParams],
  );

  const setStatus = useCallback(
    (newStatus: string | undefined) => {
      updateParams({ status: newStatus || '' });
    },
    [updateParams],
  );

  const resetFilters = useCallback(() => {
    updateParams({
      therapistId: '',
      roomId: '',
      status: '',
    });
  }, [updateParams]);

  const state: CalendarUrlState = useMemo(
    () => ({
      view,
      date,
      therapistId,
      roomId,
      status,
    }),
    [view, date, therapistId, roomId, status],
  );

  return {
    state,
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
  };
}
