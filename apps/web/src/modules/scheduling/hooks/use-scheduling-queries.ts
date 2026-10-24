import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { schedulingApi } from '../api/scheduling-api';
import { schedulingQueryKeys } from '../api/scheduling-query-keys';
import type {
  CalendarAgendaParams,
  CheckConflictInputDTO,
  CheckRoomAvailabilityParams,
  DailyAgendaDTO,
  FindAvailableSlotsParams,
  ListAppointmentsParams,
  ListRoomsParams,
  WeeklyAgendaDTO,
} from '../types/scheduling.types';

/**
 * Query Hook: Lists appointments in a visible range.
 */
export function useAppointmentsList(
  params: ListAppointmentsParams,
  options?: { enabled?: boolean },
) {
  return useQuery({
    queryKey: schedulingQueryKeys.appointmentsList(params),
    queryFn: () => schedulingApi.listAppointments(params),
    enabled: Boolean(params.startDate && params.endDate) && (options?.enabled ?? true),
    staleTime: 30 * 1000,
    placeholderData: keepPreviousData,
  });
}

/**
 * Query Hook: Retrieves single appointment details.
 */
export function useAppointmentDetail(
  appointmentId: string | undefined,
  options?: { enabled?: boolean },
) {
  return useQuery({
    queryKey: schedulingQueryKeys.appointmentDetail(appointmentId ?? ''),
    queryFn: () => schedulingApi.getAppointment(appointmentId!),
    enabled: Boolean(appointmentId) && (options?.enabled ?? true),
    staleTime: 15 * 1000,
  });
}

/**
 * Query Hook: Retrieves daily or weekly calendar agenda projection.
 */
export function useCalendarAgenda(params: CalendarAgendaParams, options?: { enabled?: boolean }) {
  return useQuery<DailyAgendaDTO | WeeklyAgendaDTO>({
    queryKey: schedulingQueryKeys.agenda(params),
    queryFn: () => schedulingApi.getCalendarAgenda(params),
    enabled: Boolean(params.date) && (options?.enabled ?? true),
    staleTime: 15 * 1000,
    placeholderData: keepPreviousData,
  });
}

/**
 * Query Hook: Searches available slots for a target service type & date.
 */
export function useAvailableSlots(
  params: FindAvailableSlotsParams,
  options?: { enabled?: boolean },
) {
  return useQuery({
    queryKey: schedulingQueryKeys.slots(params),
    queryFn: () => schedulingApi.findAvailableSlots(params),
    enabled: Boolean(params.date && params.serviceType) && (options?.enabled ?? true),
    staleTime: 30 * 1000,
  });
}

/**
 * Query Hook: Performs advisory live conflict evaluation for a proposed appointment slot.
 */
export function useLiveConflictCheck(
  params: CheckConflictInputDTO,
  options?: { enabled?: boolean },
) {
  return useQuery({
    queryKey: schedulingQueryKeys.conflictCheck(params),
    queryFn: () => schedulingApi.checkConflict(params),
    enabled:
      Boolean(
        params.therapistId &&
        params.roomId &&
        params.clientId &&
        params.startTime &&
        params.endTime,
      ) &&
      (options?.enabled ?? true),
    staleTime: 10 * 1000,
  });
}

/**
 * Query Hook: Lists registered rooms with optional filters.
 */
export function useRoomsList(params?: ListRoomsParams, options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: schedulingQueryKeys.roomsList(params),
    queryFn: () => schedulingApi.listRooms(params),
    enabled: options?.enabled ?? true,
    staleTime: 60 * 1000,
  });
}

/**
 * Query Hook: Retrieves single room details with active maintenance windows.
 */
export function useRoomDetail(roomId: string | undefined, options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: schedulingQueryKeys.roomDetail(roomId ?? ''),
    queryFn: () => schedulingApi.getRoom(roomId!),
    enabled: Boolean(roomId) && (options?.enabled ?? true),
    staleTime: 30 * 1000,
  });
}

/**
 * Query Hook: Checks room availability for a given time window.
 */
export function useRoomAvailability(
  params: CheckRoomAvailabilityParams,
  options?: { enabled?: boolean },
) {
  return useQuery({
    queryKey: schedulingQueryKeys.roomAvailability(params),
    queryFn: () => schedulingApi.checkRoomAvailability(params),
    enabled: Boolean(params.startTime && params.endTime) && (options?.enabled ?? true),
    staleTime: 20 * 1000,
  });
}

/**
 * Query Hook: Retrieves catalog of bookable service types.
 */
export function useServiceTypes(options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: schedulingQueryKeys.serviceTypes(),
    queryFn: () => schedulingApi.getServiceTypes(),
    enabled: options?.enabled ?? true,
    staleTime: 5 * 60 * 1000, // Service types catalog changes infrequently
  });
}
