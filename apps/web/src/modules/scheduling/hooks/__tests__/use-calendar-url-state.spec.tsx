import React from 'react';
import { renderHook, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { useCalendarUrlState } from '../use-calendar-url-state';
import { getTodayFacilityDate } from '../../utils/calendar-date.utils';

describe('useCalendarUrlState', () => {
  const createWrapper = (initialEntries: string[] = ['/scheduling']) => {
    return ({ children }: { children: React.ReactNode }) => (
      <MemoryRouter initialEntries={initialEntries}>{children}</MemoryRouter>
    );
  };

  it('initializes with default week view and today date when URL is empty', () => {
    const { result } = renderHook(() => useCalendarUrlState(), {
      wrapper: createWrapper(['/scheduling']),
    });

    expect(result.current.view).toBe('week');
    expect(result.current.date).toBe(getTodayFacilityDate());
    expect(result.current.therapistId).toBeUndefined();
    expect(result.current.roomId).toBeUndefined();
    expect(result.current.status).toBeUndefined();
    expect(result.current.isFiltered).toBe(false);
  });

  it('parses valid view and date from URL query parameters', () => {
    const { result } = renderHook(() => useCalendarUrlState(), {
      wrapper: createWrapper(['/scheduling?view=day&date=2026-10-20']),
    });

    expect(result.current.view).toBe('day');
    expect(result.current.date).toBe('2026-10-20');
  });

  it('parses filters from URL query parameters', () => {
    const { result } = renderHook(() => useCalendarUrlState(), {
      wrapper: createWrapper([
        '/scheduling?therapistId=therapist_123&roomId=room_456&status=CONFIRMED',
      ]),
    });

    expect(result.current.therapistId).toBe('therapist_123');
    expect(result.current.roomId).toBe('room_456');
    expect(result.current.status).toBe('CONFIRMED');
    expect(result.current.isFiltered).toBe(true);
  });

  it('updates view mode via setView', () => {
    const { result } = renderHook(() => useCalendarUrlState(), {
      wrapper: createWrapper(['/scheduling']),
    });

    act(() => {
      result.current.setView('month');
    });

    expect(result.current.view).toBe('month');

    act(() => {
      result.current.setView('day');
    });

    expect(result.current.view).toBe('day');
  });

  it('updates date via setDate', () => {
    const { result } = renderHook(() => useCalendarUrlState(), {
      wrapper: createWrapper(['/scheduling']),
    });

    act(() => {
      result.current.setDate('2026-11-01');
    });

    expect(result.current.date).toBe('2026-11-01');
  });

  it('navigates next and previous period according to view mode', () => {
    const { result } = renderHook(() => useCalendarUrlState(), {
      wrapper: createWrapper(['/scheduling?view=day&date=2026-10-24']),
    });

    act(() => {
      result.current.navigate('next');
    });
    expect(result.current.date).toBe('2026-10-25');

    act(() => {
      result.current.navigate('prev');
    });
    expect(result.current.date).toBe('2026-10-24');
  });

  it('returns to today via goToToday', () => {
    const { result } = renderHook(() => useCalendarUrlState(), {
      wrapper: createWrapper(['/scheduling?date=2026-01-01']),
    });

    act(() => {
      result.current.goToToday();
    });

    expect(result.current.date).toBe(getTodayFacilityDate());
  });

  it('updates and clears individual filters', () => {
    const { result } = renderHook(() => useCalendarUrlState(), {
      wrapper: createWrapper(['/scheduling']),
    });

    act(() => {
      result.current.setRoomId('room_A');
    });
    expect(result.current.roomId).toBe('room_A');

    act(() => {
      result.current.setTherapistId('therapist_B');
    });
    expect(result.current.therapistId).toBe('therapist_B');

    act(() => {
      result.current.setStatus('CHECKED_IN');
    });
    expect(result.current.status).toBe('CHECKED_IN');
    expect(result.current.isFiltered).toBe(true);

    act(() => {
      result.current.resetFilters();
    });

    expect(result.current.roomId).toBeUndefined();
    expect(result.current.therapistId).toBeUndefined();
    expect(result.current.status).toBeUndefined();
    expect(result.current.isFiltered).toBe(false);
  });
});
