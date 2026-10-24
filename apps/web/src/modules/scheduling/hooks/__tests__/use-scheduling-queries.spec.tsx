import React from 'react';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  useAppointmentsList,
  useAppointmentDetail,
  useCalendarAgenda,
  useAvailableSlots,
  useLiveConflictCheck,
  useRoomsList,
  useRoomDetail,
  useRoomAvailability,
  useServiceTypes,
} from '../use-scheduling-queries';
import { schedulingApi } from '../../api/scheduling-api';
import { schedulingQueryKeys } from '../../api/scheduling-query-keys';

jest.mock('../../api/scheduling-api', () => ({
  schedulingApi: {
    listAppointments: jest.fn(),
    getAppointment: jest.fn(),
    getCalendarAgenda: jest.fn(),
    findAvailableSlots: jest.fn(),
    checkConflict: jest.fn(),
    listRooms: jest.fn(),
    getRoom: jest.fn(),
    checkRoomAvailability: jest.fn(),
    getServiceTypes: jest.fn(),
  },
}));

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  });

  return {
    queryClient,
    wrapper: ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    ),
  };
}

describe('Scheduling Queries Hooks & Cache Key Stability Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('1. Query Key Stability & Formatting', () => {
    it('produces stable, distinct keys for different parameter combinations', () => {
      const key1 = schedulingQueryKeys.appointmentsList({
        startDate: '2026-10-24T00:00:00.000Z',
        endDate: '2026-10-24T23:59:59.999Z',
      });
      const key2 = schedulingQueryKeys.appointmentsList({
        startDate: '2026-10-25T00:00:00.000Z',
        endDate: '2026-10-25T23:59:59.999Z',
      });
      const key3 = schedulingQueryKeys.appointmentsList({
        startDate: '2026-10-24T00:00:00.000Z',
        endDate: '2026-10-24T23:59:59.999Z',
        therapistId: 'therapist-1',
      });

      expect(key1).not.toEqual(key2);
      expect(key1).not.toEqual(key3);
      expect(key1[0]).toBe('scheduling');
      expect(key1[1]).toBe('appointments');
    });

    it('produces stable agenda keys for day and week projections', () => {
      const dayKey = schedulingQueryKeys.agenda({ view: 'day', date: '2026-10-24' });
      const weekKey = schedulingQueryKeys.agenda({ view: 'week', date: '2026-10-24' });

      expect(dayKey).not.toEqual(weekKey);
      expect(dayKey[2]).toBe('agenda');
    });
  });

  describe('2. Query Hooks Execution & Enabled Conditions', () => {
    it('useAppointmentsList fetches appointments when dates provided', async () => {
      (schedulingApi.listAppointments as jest.Mock).mockResolvedValueOnce([
        { id: 'appt-1', status: 'SCHEDULED' },
      ]);

      const { wrapper } = createWrapper();
      const params = {
        startDate: '2026-10-24T00:00:00.000Z',
        endDate: '2026-10-24T23:59:59.999Z',
      };

      const { result } = renderHook(() => useAppointmentsList(params), { wrapper });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(schedulingApi.listAppointments).toHaveBeenCalledWith(params);
      expect(result.current.data).toHaveLength(1);
    });

    it('useAppointmentsList is disabled when startDate or endDate is missing', () => {
      const { wrapper } = createWrapper();
      const { result } = renderHook(() => useAppointmentsList({ startDate: '', endDate: '' }), {
        wrapper,
      });

      expect(result.current.fetchStatus).toBe('idle');
      expect(schedulingApi.listAppointments).not.toHaveBeenCalled();
    });

    it('useAppointmentDetail is disabled when id is missing or undefined', () => {
      const { wrapper } = createWrapper();
      const { result } = renderHook(() => useAppointmentDetail(undefined), { wrapper });

      expect(result.current.fetchStatus).toBe('idle');
      expect(schedulingApi.getAppointment).not.toHaveBeenCalled();
    });

    it('useAppointmentDetail fetches single appointment details by ID', async () => {
      (schedulingApi.getAppointment as jest.Mock).mockResolvedValueOnce({
        id: 'appt-100',
        status: 'CONFIRMED',
      });

      const { wrapper } = createWrapper();
      const { result } = renderHook(() => useAppointmentDetail('appt-100'), { wrapper });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(schedulingApi.getAppointment).toHaveBeenCalledWith('appt-100');
      expect(result.current.data?.status).toBe('CONFIRMED');
    });

    it('useCalendarAgenda fetches agenda projection for target date', async () => {
      (schedulingApi.getCalendarAgenda as jest.Mock).mockResolvedValueOnce({
        date: '2026-10-24',
        totalAppointments: 2,
      });

      const { wrapper } = createWrapper();
      const { result } = renderHook(() => useCalendarAgenda({ view: 'day', date: '2026-10-24' }), {
        wrapper,
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(schedulingApi.getCalendarAgenda).toHaveBeenCalledWith({
        view: 'day',
        date: '2026-10-24',
      });
    });

    it('useLiveConflictCheck is disabled when required vectors are incomplete', () => {
      const { wrapper } = createWrapper();
      const { result } = renderHook(
        () =>
          useLiveConflictCheck({
            therapistId: '',
            roomId: '',
            clientId: '',
            startTime: '',
            endTime: '',
          }),
        { wrapper },
      );

      expect(result.current.fetchStatus).toBe('idle');
      expect(schedulingApi.checkConflict).not.toHaveBeenCalled();
    });

    it('useLiveConflictCheck executes advisory conflict check when vectors present', async () => {
      (schedulingApi.checkConflict as jest.Mock).mockResolvedValueOnce({
        hasConflict: false,
        conflicts: [],
      });

      const { wrapper } = createWrapper();
      const params = {
        therapistId: 't-1',
        roomId: 'r-1',
        clientId: 'c-1',
        startTime: '2026-10-24T14:00:00.000Z',
        endTime: '2026-10-24T15:00:00.000Z',
      };

      const { result } = renderHook(() => useLiveConflictCheck(params), { wrapper });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(schedulingApi.checkConflict).toHaveBeenCalledWith(params);
      expect(result.current.data?.hasConflict).toBe(false);
    });

    it('useRoomsList fetches rooms collection', async () => {
      (schedulingApi.listRooms as jest.Mock).mockResolvedValueOnce([
        { id: 'r-1', name: 'Studio A', status: 'AVAILABLE' },
      ]);

      const { wrapper } = createWrapper();
      const { result } = renderHook(() => useRoomsList({ status: 'AVAILABLE' }), { wrapper });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(schedulingApi.listRooms).toHaveBeenCalledWith({ status: 'AVAILABLE' });
      expect(result.current.data).toHaveLength(1);
    });

    it('useAvailableSlots fetches candidate slots for target service and date', async () => {
      (schedulingApi.findAvailableSlots as jest.Mock).mockResolvedValueOnce([
        {
          startTime: '2026-10-24T14:00:00.000Z',
          endTime: '2026-10-24T15:00:00.000Z',
          available: true,
        },
      ]);

      const { wrapper } = createWrapper();
      const { result } = renderHook(
        () => useAvailableSlots({ date: '2026-10-24', serviceType: 'ASSESSMENT' }),
        { wrapper },
      );

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(schedulingApi.findAvailableSlots).toHaveBeenCalledWith({
        date: '2026-10-24',
        serviceType: 'ASSESSMENT',
      });
      expect(result.current.data).toHaveLength(1);
    });

    it('useRoomDetail fetches single room details by identifier', async () => {
      (schedulingApi.getRoom as jest.Mock).mockResolvedValueOnce({
        id: 'r-1',
        name: 'Studio A',
      });

      const { wrapper } = createWrapper();
      const { result } = renderHook(() => useRoomDetail('r-1'), { wrapper });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(schedulingApi.getRoom).toHaveBeenCalledWith('r-1');
      expect(result.current.data?.name).toBe('Studio A');
    });

    it('useRoomAvailability checks availability for target window', async () => {
      (schedulingApi.checkRoomAvailability as jest.Mock).mockResolvedValueOnce({
        isAvailable: true,
      });

      const { wrapper } = createWrapper();
      const { result } = renderHook(
        () =>
          useRoomAvailability({
            startTime: '2026-10-24T14:00:00.000Z',
            endTime: '2026-10-24T15:00:00.000Z',
          }),
        { wrapper },
      );

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(schedulingApi.checkRoomAvailability).toHaveBeenCalledWith({
        startTime: '2026-10-24T14:00:00.000Z',
        endTime: '2026-10-24T15:00:00.000Z',
      });
      expect(result.current.data?.isAvailable).toBe(true);
    });

    it('useServiceTypes retrieves bookable service catalog', async () => {
      (schedulingApi.getServiceTypes as jest.Mock).mockResolvedValueOnce([
        { type: 'ASSESSMENT', standardDurationMinutes: 60 },
      ]);

      const { wrapper } = createWrapper();
      const { result } = renderHook(() => useServiceTypes(), { wrapper });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(schedulingApi.getServiceTypes).toHaveBeenCalled();
      expect(result.current.data).toHaveLength(1);
    });
  });
});
