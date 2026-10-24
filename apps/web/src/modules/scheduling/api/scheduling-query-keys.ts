import type {
  CalendarAgendaParams,
  CheckConflictInputDTO,
  CheckRoomAvailabilityParams,
  FindAvailableSlotsParams,
  ListAppointmentsParams,
  ListRoomsParams,
} from '../types/scheduling.types';

/**
 * Standardized Query Key Factory for Scheduling Domain
 *
 * Implements Kinergy TanStack Query hierarchical key conventions:
 * - Deterministic serialization of parameters ensures cache hit consistency.
 * - Granular namespace scoping enables surgical invalidations post-mutations.
 */
export const schedulingQueryKeys = {
  all: ['scheduling'] as const,

  // Appointments
  appointments: () => [...schedulingQueryKeys.all, 'appointments'] as const,
  appointmentsList: (params?: ListAppointmentsParams) =>
    [...schedulingQueryKeys.appointments(), 'list', params ?? {}] as const,
  appointmentDetail: (id: string) => [...schedulingQueryKeys.appointments(), 'detail', id] as const,

  // Calendar Projections & Agenda
  calendar: () => [...schedulingQueryKeys.all, 'calendar'] as const,
  agenda: (params: CalendarAgendaParams) =>
    [...schedulingQueryKeys.calendar(), 'agenda', params] as const,

  // Availability & Conflicts
  availability: () => [...schedulingQueryKeys.all, 'availability'] as const,
  slots: (params: FindAvailableSlotsParams) =>
    [...schedulingQueryKeys.availability(), 'slots', params] as const,
  conflictCheck: (params: CheckConflictInputDTO) =>
    [...schedulingQueryKeys.availability(), 'conflict-check', params] as const,

  // Rooms & Spatial Resources
  rooms: () => [...schedulingQueryKeys.all, 'rooms'] as const,
  roomsList: (params?: ListRoomsParams) =>
    [...schedulingQueryKeys.rooms(), 'list', params ?? {}] as const,
  roomDetail: (id: string) => [...schedulingQueryKeys.rooms(), 'detail', id] as const,
  roomAvailability: (params: CheckRoomAvailabilityParams) =>
    [...schedulingQueryKeys.rooms(), 'availability', params] as const,

  // Bookable Service Types Catalog
  serviceTypes: () => [...schedulingQueryKeys.all, 'service-types'] as const,

  // Recurring Series
  recurringSeries: () => [...schedulingQueryKeys.all, 'recurring-series'] as const,
  recurringSeriesDetail: (seriesId: string) =>
    [...schedulingQueryKeys.recurringSeries(), 'detail', seriesId] as const,
};
