import React from 'react';
import { renderHook, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  useCreateAppointmentMutation,
  useRescheduleAppointmentMutation,
  useCancelAppointmentMutation,
  useConfirmAppointmentMutation,
  useCreateRoomMutation,
  useScheduleMaintenanceMutation,
  useCreateRecurrenceSeriesMutation,
  useSkipOccurrenceMutation,
  useEditSingleOccurrenceMutation,
} from '../use-scheduling-mutations';
import { schedulingApi } from '../../api/scheduling-api';
import { schedulingQueryKeys } from '../../api/scheduling-query-keys';
import { NotificationProvider } from '../../../../app/providers/notification-provider';

jest.mock('../../api/scheduling-api', () => ({
  schedulingApi: {
    createAppointment: jest.fn(),
    rescheduleAppointment: jest.fn(),
    cancelAppointment: jest.fn(),
    confirmAppointment: jest.fn(),
    createRoom: jest.fn(),
    scheduleMaintenance: jest.fn(),
    createRecurrenceSeries: jest.fn(),
    skipOccurrence: jest.fn(),
    editSingleOccurrence: jest.fn(),
  },
}));

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

  return {
    queryClient,
    wrapper: ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={queryClient}>
        <NotificationProvider>{children}</NotificationProvider>
      </QueryClientProvider>
    ),
  };
}

describe('Scheduling Mutations & Cache Invalidation Behavior Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('1. Appointment Mutations Invalidation', () => {
    it('useCreateAppointmentMutation reconciles detail cache and invalidates appointments, calendar & availability', async () => {
      const createdAppt = {
        id: 'appt-new',
        status: 'SCHEDULED',
        clientId: 'client-1',
        therapistId: 'therapist-1',
        roomId: 'room-1',
        startTime: '2026-10-24T14:00:00.000Z',
        endTime: '2026-10-24T15:00:00.000Z',
      };
      (schedulingApi.createAppointment as jest.Mock).mockResolvedValueOnce(createdAppt);

      const { queryClient, wrapper } = createWrapper();
      const invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries');

      const { result } = renderHook(() => useCreateAppointmentMutation(), { wrapper });

      await act(async () => {
        await result.current.mutateAsync({
          clientId: 'client-1',
          therapistId: 'therapist-1',
          roomId: 'room-1',
          type: 'TREATMENT',
          startTime: '2026-10-24T14:00:00.000Z',
          endTime: '2026-10-24T15:00:00.000Z',
        });
      });

      // 1. Verifies detail cache is populated
      expect(queryClient.getQueryData(schedulingQueryKeys.appointmentDetail('appt-new'))).toEqual(
        createdAppt,
      );

      // 2. Verifies surgical cache invalidations
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: schedulingQueryKeys.appointments() });
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: schedulingQueryKeys.calendar() });
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: schedulingQueryKeys.availability() });

      // 3. Verifies unrelated caches are NOT invalidated
      expect(invalidateSpy).not.toHaveBeenCalledWith({ queryKey: ['clients'] });
      expect(invalidateSpy).not.toHaveBeenCalledWith({ queryKey: ['sales'] });
    });

    it('useRescheduleAppointmentMutation reconciles detail and invalidates calendar', async () => {
      const updatedAppt = {
        id: 'appt-1',
        status: 'RESCHEDULED',
        startTime: '2026-10-25T14:00:00.000Z',
        endTime: '2026-10-25T15:00:00.000Z',
      };
      (schedulingApi.rescheduleAppointment as jest.Mock).mockResolvedValueOnce(updatedAppt);

      const { queryClient, wrapper } = createWrapper();
      const invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries');

      const { result } = renderHook(() => useRescheduleAppointmentMutation(), { wrapper });

      await act(async () => {
        await result.current.mutateAsync({
          id: 'appt-1',
          payload: {
            newStartTime: '2026-10-25T14:00:00.000Z',
            newEndTime: '2026-10-25T15:00:00.000Z',
          },
        });
      });

      expect(queryClient.getQueryData(schedulingQueryKeys.appointmentDetail('appt-1'))).toEqual(
        updatedAppt,
      );
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: schedulingQueryKeys.appointments() });
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: schedulingQueryKeys.calendar() });
    });

    it('useCancelAppointmentMutation updates status and invalidates calendar', async () => {
      const cancelledAppt = { id: 'appt-1', status: 'CANCELLED' };
      (schedulingApi.cancelAppointment as jest.Mock).mockResolvedValueOnce(cancelledAppt);

      const { queryClient, wrapper } = createWrapper();
      const invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries');

      const { result } = renderHook(() => useCancelAppointmentMutation(), { wrapper });

      await act(async () => {
        await result.current.mutateAsync({ id: 'appt-1', payload: { reason: 'Client requested' } });
      });

      expect(queryClient.getQueryData(schedulingQueryKeys.appointmentDetail('appt-1'))).toEqual(
        cancelledAppt,
      );
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: schedulingQueryKeys.calendar() });
    });

    it('useConfirmAppointmentMutation transitions status to CONFIRMED', async () => {
      const confirmedAppt = { id: 'appt-1', status: 'CONFIRMED' };
      (schedulingApi.confirmAppointment as jest.Mock).mockResolvedValueOnce(confirmedAppt);

      const { queryClient, wrapper } = createWrapper();
      const { result } = renderHook(() => useConfirmAppointmentMutation(), { wrapper });

      await act(async () => {
        await result.current.mutateAsync('appt-1');
      });

      expect(queryClient.getQueryData(schedulingQueryKeys.appointmentDetail('appt-1'))).toEqual(
        confirmedAppt,
      );
    });
  });

  describe('2. Room & Maintenance Mutations Invalidation', () => {
    it('useCreateRoomMutation sets detail cache and invalidates rooms query', async () => {
      const newRoom = { id: 'room-10', name: 'Studio C', capacity: 4 };
      (schedulingApi.createRoom as jest.Mock).mockResolvedValueOnce(newRoom);

      const { queryClient, wrapper } = createWrapper();
      const invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries');

      const { result } = renderHook(() => useCreateRoomMutation(), { wrapper });

      await act(async () => {
        await result.current.mutateAsync({ name: 'Studio C', capacity: 4 });
      });

      expect(queryClient.getQueryData(schedulingQueryKeys.roomDetail('room-10'))).toEqual(newRoom);
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: schedulingQueryKeys.rooms() });
    });

    it('useScheduleMaintenanceMutation invalidates both rooms and calendar', async () => {
      const roomWithMaint = { id: 'room-1', name: 'Studio A' };
      (schedulingApi.scheduleMaintenance as jest.Mock).mockResolvedValueOnce(roomWithMaint);

      const { queryClient, wrapper } = createWrapper();
      const invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries');

      const { result } = renderHook(() => useScheduleMaintenanceMutation(), { wrapper });

      await act(async () => {
        await result.current.mutateAsync({
          id: 'room-1',
          payload: {
            startTime: '2026-10-26T08:00:00.000Z',
            endTime: '2026-10-26T12:00:00.000Z',
            reason: 'Cleaning',
            expectedVersion: 1,
          },
        });
      });

      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: schedulingQueryKeys.rooms() });
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: schedulingQueryKeys.calendar() });
    });
  });

  describe('3. Recurrence Mutations Invalidation', () => {
    it('useCreateRecurrenceSeriesMutation invalidates appointments, calendar and recurringSeries', async () => {
      const response = {
        series: { id: 'series-10' },
        initialGeneration: { generatedCount: 8 },
      };
      (schedulingApi.createRecurrenceSeries as jest.Mock).mockResolvedValueOnce(response);

      const { queryClient, wrapper } = createWrapper();
      const invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries');

      const { result } = renderHook(() => useCreateRecurrenceSeriesMutation(), { wrapper });

      await act(async () => {
        await result.current.mutateAsync({
          clientId: 'c-1',
          therapistId: 't-1',
          roomId: 'r-1',
          serviceType: 'TREATMENT',
          frequency: 'WEEKLY',
          startDate: '2026-10-24T00:00:00.000Z',
          localStartTime: '10:00',
          durationMinutes: 60,
        });
      });

      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: schedulingQueryKeys.appointments() });
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: schedulingQueryKeys.calendar() });
      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: schedulingQueryKeys.recurringSeries(),
      });
    });

    it('useSkipOccurrenceMutation invalidates specific series detail and calendar', async () => {
      (schedulingApi.skipOccurrence as jest.Mock).mockResolvedValueOnce({ status: 'SKIPPED' });

      const { queryClient, wrapper } = createWrapper();
      const invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries');

      const { result } = renderHook(() => useSkipOccurrenceMutation(), { wrapper });

      await act(async () => {
        await result.current.mutateAsync({
          seriesId: 'series-10',
          payload: { occurrenceIndex: 2 },
        });
      });

      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: schedulingQueryKeys.recurringSeriesDetail('series-10'),
      });
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: schedulingQueryKeys.calendar() });
    });

    it('useEditSingleOccurrenceMutation detaches occurrence and reconciles appointment detail', async () => {
      const detachedAppt = { id: 'appt-slot-3', isDetachedFromSeries: true };
      (schedulingApi.editSingleOccurrence as jest.Mock).mockResolvedValueOnce(detachedAppt);

      const { queryClient, wrapper } = createWrapper();
      const invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries');

      const { result } = renderHook(() => useEditSingleOccurrenceMutation(), { wrapper });

      await act(async () => {
        await result.current.mutateAsync({
          appointmentId: 'appt-slot-3',
          payload: { newStartTime: '2026-10-28T16:00:00.000Z' },
        });
      });

      expect(
        queryClient.getQueryData(schedulingQueryKeys.appointmentDetail('appt-slot-3')),
      ).toEqual(detachedAppt);
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: schedulingQueryKeys.appointments() });
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: schedulingQueryKeys.calendar() });
    });
  });
});
