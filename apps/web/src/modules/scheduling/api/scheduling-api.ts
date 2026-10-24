import { httpClient } from '../../../shared/api/http-client';
import type {
  ActivateRoomInputDTO,
  AddAppointmentNoteInputDTO,
  AppointmentModel,
  AvailableSlotDTO,
  CalendarAgendaParams,
  CancelAppointmentInputDTO,
  CancelRecurrenceSeriesInputDTO,
  CancelRecurrenceSeriesResponseDTO,
  CheckConflictInputDTO,
  CheckRoomAvailabilityParams,
  ConflictCheckResponseDTO,
  CreateAppointmentInputDTO,
  CreateRecurrenceSeriesInputDTO,
  CreateRecurrenceSeriesResponseDTO,
  CreateRoomInputDTO,
  DailyAgendaDTO,
  DeactivateRoomInputDTO,
  EditFutureOccurrencesInputDTO,
  EditFutureOccurrencesResponseDTO,
  EditRoomInputDTO,
  EditSingleOccurrenceInputDTO,
  FindAvailableSlotsParams,
  ListAppointmentsParams,
  ListRoomsParams,
  MarkNoShowInputDTO,
  RescheduleAppointmentInputDTO,
  RoomAvailabilityResponseDTO,
  RoomModel,
  ScheduleMaintenanceInputDTO,
  ServiceTypeOptionDTO,
  SkipOccurrenceInputDTO,
  SkipOccurrenceResponseDTO,
  WeeklyAgendaDTO,
} from '../types/scheduling.types';

/**
 * Standardized Scheduling Management API Client Adapter
 *
 * Encapsulates all transport interactions with Kinergy's scheduling services:
 * - Appointments: /api/v1/scheduling/appointments
 * - Availability & Conflicts: /api/v1/scheduling/availability
 * - Calendar Projections: /api/v1/scheduling/calendar
 * - Rooms & Maintenance: /api/v1/scheduling/rooms
 * - Recurring Series: /api/v1/scheduling/recurring-appointments
 * - Service Types Catalog: /api/v1/scheduling/service-types
 */
export const schedulingApi = {
  // ---------------------------------------------------------------------------
  // 1. Appointments Operations
  // ---------------------------------------------------------------------------

  /**
   * Lists appointments within a specified time range, optionally filtered by therapist, room, client, or status.
   */
  async listAppointments(params: ListAppointmentsParams): Promise<AppointmentModel[]> {
    return httpClient.get<AppointmentModel[]>('/api/v1/scheduling/appointments', {
      params: {
        startDate: params.startDate,
        endDate: params.endDate,
        therapistId: params.therapistId || undefined,
        roomId: params.roomId || undefined,
        clientId: params.clientId || undefined,
        status: params.status || undefined,
      },
    });
  },

  /**
   * Retrieves single appointment details by identifier.
   */
  async getAppointment(id: string): Promise<AppointmentModel> {
    const encodedId = encodeURIComponent((id || '').trim());
    return httpClient.get<AppointmentModel>(`/api/v1/scheduling/appointments/${encodedId}`);
  },

  /**
   * Books and registers a new individual appointment.
   */
  async createAppointment(payload: CreateAppointmentInputDTO): Promise<AppointmentModel> {
    return httpClient.post<AppointmentModel>('/api/v1/scheduling/appointments', {
      clientId: payload.clientId.trim(),
      therapistId: payload.therapistId.trim(),
      roomId: payload.roomId.trim(),
      type: payload.type.trim(),
      startTime: payload.startTime,
      endTime: payload.endTime,
      notes: payload.notes?.trim() || undefined,
    });
  },

  /**
   * Reschedules an existing appointment to a new time range.
   */
  async rescheduleAppointment(
    id: string,
    payload: RescheduleAppointmentInputDTO,
  ): Promise<AppointmentModel> {
    const encodedId = encodeURIComponent((id || '').trim());
    return httpClient.patch<AppointmentModel>(
      `/api/v1/scheduling/appointments/${encodedId}/reschedule`,
      {
        newStartTime: payload.newStartTime,
        newEndTime: payload.newEndTime,
        reason: payload.reason?.trim() || undefined,
      },
    );
  },

  /**
   * Cancels an appointment with a mandatory operational reason.
   */
  async cancelAppointment(
    id: string,
    payload: CancelAppointmentInputDTO,
  ): Promise<AppointmentModel> {
    const encodedId = encodeURIComponent((id || '').trim());
    return httpClient.post<AppointmentModel>(
      `/api/v1/scheduling/appointments/${encodedId}/cancel`,
      {
        reason: payload.reason.trim(),
      },
    );
  },

  /**
   * Confirms a scheduled or rescheduled appointment.
   */
  async confirmAppointment(id: string): Promise<AppointmentModel> {
    const encodedId = encodeURIComponent((id || '').trim());
    return httpClient.post<AppointmentModel>(
      `/api/v1/scheduling/appointments/${encodedId}/confirm`,
      {},
    );
  },

  /**
   * Checks in a confirmed or scheduled appointment.
   */
  async checkInAppointment(id: string): Promise<AppointmentModel> {
    const encodedId = encodeURIComponent((id || '').trim());
    return httpClient.post<AppointmentModel>(
      `/api/v1/scheduling/appointments/${encodedId}/check-in`,
      {},
    );
  },

  /**
   * Starts treatment for a checked-in appointment.
   */
  async startAppointment(id: string): Promise<AppointmentModel> {
    const encodedId = encodeURIComponent((id || '').trim());
    return httpClient.post<AppointmentModel>(
      `/api/v1/scheduling/appointments/${encodedId}/start`,
      {},
    );
  },

  /**
   * Completes an in-progress appointment.
   */
  async completeAppointment(id: string): Promise<AppointmentModel> {
    const encodedId = encodeURIComponent((id || '').trim());
    return httpClient.post<AppointmentModel>(
      `/api/v1/scheduling/appointments/${encodedId}/complete`,
      {},
    );
  },

  /**
   * Marks an appointment as NO_SHOW with optional reason.
   */
  async markNoShow(id: string, payload?: MarkNoShowInputDTO): Promise<AppointmentModel> {
    const encodedId = encodeURIComponent((id || '').trim());
    return httpClient.post<AppointmentModel>(
      `/api/v1/scheduling/appointments/${encodedId}/no-show`,
      {
        reason: payload?.reason?.trim() || undefined,
      },
    );
  },

  /**
   * Appends an immutable note to an existing appointment.
   */
  async addAppointmentNote(
    id: string,
    payload: AddAppointmentNoteInputDTO,
  ): Promise<AppointmentModel> {
    const encodedId = encodeURIComponent((id || '').trim());
    return httpClient.post<AppointmentModel>(`/api/v1/scheduling/appointments/${encodedId}/notes`, {
      content: payload.content.trim(),
    });
  },

  // ---------------------------------------------------------------------------
  // 2. Availability & Calendar Projections
  // ---------------------------------------------------------------------------

  /**
   * Evaluates advisory 4D conflicts (Clinic, Therapist, Room, Client) for a target interval.
   */
  async checkConflict(payload: CheckConflictInputDTO): Promise<ConflictCheckResponseDTO> {
    return httpClient.post<ConflictCheckResponseDTO>(
      '/api/v1/scheduling/availability/check-conflict',
      {
        therapistId: payload.therapistId.trim(),
        roomId: payload.roomId.trim(),
        clientId: payload.clientId.trim(),
        startTime: payload.startTime,
        endTime: payload.endTime,
        appointmentType: payload.appointmentType || undefined,
        excludeAppointmentId: payload.excludeAppointmentId || undefined,
      },
    );
  },

  /**
   * Queries available candidate slots for a target date and service type.
   */
  async findAvailableSlots(params: FindAvailableSlotsParams): Promise<AvailableSlotDTO[]> {
    return httpClient.get<AvailableSlotDTO[]>('/api/v1/scheduling/availability/slots', {
      params: {
        date: params.date,
        serviceType: params.serviceType,
        therapistId: params.therapistId || undefined,
        roomId: params.roomId || undefined,
      },
    });
  },

  /**
   * Retrieves daily or weekly operational calendar agenda projections.
   */
  async getCalendarAgenda(params: CalendarAgendaParams): Promise<DailyAgendaDTO | WeeklyAgendaDTO> {
    return httpClient.get<DailyAgendaDTO | WeeklyAgendaDTO>('/api/v1/scheduling/calendar/agenda', {
      params: {
        view: params.view,
        date: params.date,
        therapistId: params.therapistId || undefined,
        roomId: params.roomId || undefined,
      },
    });
  },

  /**
   * Retrieves catalog of bookable service types with min/max/standard durations.
   */
  async getServiceTypes(): Promise<ServiceTypeOptionDTO[]> {
    return httpClient.get<ServiceTypeOptionDTO[]>('/api/v1/scheduling/service-types');
  },

  // ---------------------------------------------------------------------------
  // 3. Rooms & Schedulable Resources Operations
  // ---------------------------------------------------------------------------

  /**
   * Lists registered facility rooms with optional capacity, feature, or status filtering.
   */
  async listRooms(params?: ListRoomsParams): Promise<RoomModel[]> {
    return httpClient.get<RoomModel[]>('/api/v1/scheduling/rooms', {
      params: {
        status: params?.status || undefined,
        minCapacity: params?.minCapacity || undefined,
        features:
          params?.features && params.features.length > 0 ? params.features.join(',') : undefined,
      },
    });
  },

  /**
   * Retrieves single room details by identifier.
   */
  async getRoom(id: string): Promise<RoomModel> {
    const encodedId = encodeURIComponent((id || '').trim());
    return httpClient.get<RoomModel>(`/api/v1/scheduling/rooms/${encodedId}`);
  },

  /**
   * Creates a new facility room.
   */
  async createRoom(payload: CreateRoomInputDTO): Promise<RoomModel> {
    return httpClient.post<RoomModel>('/api/v1/scheduling/rooms', {
      name: payload.name.trim(),
      capacity: payload.capacity,
      features: payload.features || [],
    });
  },

  /**
   * Edits room metadata with optimistic concurrency protection.
   */
  async editRoom(id: string, payload: EditRoomInputDTO): Promise<RoomModel> {
    const encodedId = encodeURIComponent((id || '').trim());
    return httpClient.patch<RoomModel>(`/api/v1/scheduling/rooms/${encodedId}`, {
      name: payload.name?.trim(),
      capacity: payload.capacity,
      features: payload.features,
      expectedVersion: payload.expectedVersion,
    });
  },

  /**
   * Activates room for scheduling (status -> AVAILABLE).
   */
  async activateRoom(id: string, payload: ActivateRoomInputDTO): Promise<RoomModel> {
    const encodedId = encodeURIComponent((id || '').trim());
    return httpClient.post<RoomModel>(`/api/v1/scheduling/rooms/${encodedId}/activate`, {
      expectedVersion: payload.expectedVersion,
    });
  },

  /**
   * Deactivates room with mandatory operational reason (status -> UNAVAILABLE).
   */
  async deactivateRoom(id: string, payload: DeactivateRoomInputDTO): Promise<RoomModel> {
    const encodedId = encodeURIComponent((id || '').trim());
    return httpClient.post<RoomModel>(`/api/v1/scheduling/rooms/${encodedId}/deactivate`, {
      reason: payload.reason.trim(),
      expectedVersion: payload.expectedVersion,
    });
  },

  /**
   * Schedules a temporal maintenance window on a room.
   */
  async scheduleMaintenance(id: string, payload: ScheduleMaintenanceInputDTO): Promise<RoomModel> {
    const encodedId = encodeURIComponent((id || '').trim());
    return httpClient.post<RoomModel>(`/api/v1/scheduling/rooms/${encodedId}/maintenance`, {
      startTime: payload.startTime,
      endTime: payload.endTime,
      reason: payload.reason.trim(),
      expectedVersion: payload.expectedVersion,
    });
  },

  /**
   * Cancels and removes a scheduled maintenance window.
   */
  async cancelMaintenance(id: string, maintenanceId: string): Promise<RoomModel> {
    const encodedRoomId = encodeURIComponent((id || '').trim());
    const encodedMaintId = encodeURIComponent((maintenanceId || '').trim());
    return httpClient.delete<RoomModel>(
      `/api/v1/scheduling/rooms/${encodedRoomId}/maintenance/${encodedMaintId}`,
    );
  },

  /**
   * Evaluates room availability against maintenance and existing bookings.
   */
  async checkRoomAvailability(
    params: CheckRoomAvailabilityParams,
  ): Promise<RoomAvailabilityResponseDTO> {
    return httpClient.get<RoomAvailabilityResponseDTO>('/api/v1/scheduling/rooms/availability', {
      params: {
        startTime: params.startTime,
        endTime: params.endTime,
        roomId: params.roomId || undefined,
        requiredCapacity: params.requiredCapacity || undefined,
        features:
          params.requiredFeatures && params.requiredFeatures.length > 0
            ? params.requiredFeatures.join(',')
            : undefined,
      },
    });
  },

  // ---------------------------------------------------------------------------
  // 4. Recurring Appointments Operations
  // ---------------------------------------------------------------------------

  /**
   * Instantiates a recurring series and generates initial rolling window occurrences.
   */
  async createRecurrenceSeries(
    payload: CreateRecurrenceSeriesInputDTO,
  ): Promise<CreateRecurrenceSeriesResponseDTO> {
    return httpClient.post<CreateRecurrenceSeriesResponseDTO>(
      '/api/v1/scheduling/recurring-appointments',
      {
        clientId: payload.clientId.trim(),
        therapistId: payload.therapistId.trim(),
        roomId: payload.roomId.trim(),
        serviceType: payload.serviceType.trim(),
        frequency: payload.frequency,
        startDate: payload.startDate,
        endDate: payload.endDate || undefined,
        maxOccurrences: payload.maxOccurrences || undefined,
        localStartTime: payload.localStartTime,
        durationMinutes: payload.durationMinutes,
        timezone: payload.timezone || undefined,
        horizonDays: payload.horizonDays || undefined,
      },
    );
  },

  /**
   * Skips a specific recurrence occurrence slot.
   */
  async skipOccurrence(
    seriesId: string,
    payload: SkipOccurrenceInputDTO,
  ): Promise<SkipOccurrenceResponseDTO> {
    const encodedSeriesId = encodeURIComponent((seriesId || '').trim());
    return httpClient.post<SkipOccurrenceResponseDTO>(
      `/api/v1/scheduling/recurring-appointments/${encodedSeriesId}/skip`,
      {
        occurrenceIndex: payload.occurrenceIndex,
        reason: payload.reason?.trim() || undefined,
      },
    );
  },

  /**
   * Detaches and updates a single materialized recurrence occurrence.
   */
  async editSingleOccurrence(
    appointmentId: string,
    payload: EditSingleOccurrenceInputDTO,
  ): Promise<AppointmentModel> {
    const encodedId = encodeURIComponent((appointmentId || '').trim());
    return httpClient.patch<AppointmentModel>(
      `/api/v1/scheduling/recurring-appointments/occurrences/${encodedId}`,
      {
        newStartTime: payload.newStartTime || undefined,
        newTherapistId: payload.newTherapistId?.trim() || undefined,
        newRoomId: payload.newRoomId?.trim() || undefined,
        rescheduleReason: payload.rescheduleReason?.trim() || undefined,
      },
    );
  },

  /**
   * Cutoff-and-Fork: Terminates existing series at cutoff date and spawns new branched series.
   */
  async editFutureOccurrences(
    seriesId: string,
    payload: EditFutureOccurrencesInputDTO,
  ): Promise<EditFutureOccurrencesResponseDTO> {
    const encodedSeriesId = encodeURIComponent((seriesId || '').trim());
    return httpClient.post<EditFutureOccurrencesResponseDTO>(
      `/api/v1/scheduling/recurring-appointments/${encodedSeriesId}/edit-future`,
      {
        cutoffDate: payload.cutoffDate,
        fromOccurrenceIndex: payload.fromOccurrenceIndex ?? 0,
        newFrequency: payload.newFrequency || undefined,
        newLocalStartTime: payload.newLocalStartTime || undefined,
        newDurationMinutes: payload.newDurationMinutes || undefined,
        newTherapistId: payload.newTherapistId?.trim() || undefined,
        newRoomId: payload.newRoomId?.trim() || undefined,
        newEndDate: payload.newEndDate || undefined,
        newMaxOccurrences: payload.newMaxOccurrences || undefined,
      },
    );
  },

  /**
   * Cancels a recurring series and all future materialized appointments.
   */
  async cancelRecurrenceSeries(
    seriesId: string,
    payload?: CancelRecurrenceSeriesInputDTO,
  ): Promise<CancelRecurrenceSeriesResponseDTO> {
    const encodedSeriesId = encodeURIComponent((seriesId || '').trim());
    return httpClient.post<CancelRecurrenceSeriesResponseDTO>(
      `/api/v1/scheduling/recurring-appointments/${encodedSeriesId}/cancel`,
      {
        reason: payload?.reason?.trim() || undefined,
      },
    );
  },
};
