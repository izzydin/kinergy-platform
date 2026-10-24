import { useMutation, useQueryClient } from '@tanstack/react-query';
import { schedulingApi } from '../api/scheduling-api';
import { schedulingQueryKeys } from '../api/scheduling-query-keys';
import { useNotification } from '../../../app/providers/notification-provider';
import type {
  ActivateRoomInputDTO,
  AddAppointmentNoteInputDTO,
  AppointmentModel,
  CancelAppointmentInputDTO,
  CancelRecurrenceSeriesInputDTO,
  CancelRecurrenceSeriesResponseDTO,
  CreateAppointmentInputDTO,
  CreateRecurrenceSeriesInputDTO,
  CreateRecurrenceSeriesResponseDTO,
  CreateRoomInputDTO,
  DeactivateRoomInputDTO,
  EditFutureOccurrencesInputDTO,
  EditFutureOccurrencesResponseDTO,
  EditRoomInputDTO,
  EditSingleOccurrenceInputDTO,
  MarkNoShowInputDTO,
  RescheduleAppointmentInputDTO,
  RoomModel,
  ScheduleMaintenanceInputDTO,
  SkipOccurrenceInputDTO,
  SkipOccurrenceResponseDTO,
} from '../types/scheduling.types';

// -----------------------------------------------------------------------------
// 1. Appointment Mutations
// -----------------------------------------------------------------------------

export function useCreateAppointmentMutation() {
  const queryClient = useQueryClient();
  const notification = useNotification();

  return useMutation<AppointmentModel, Error, CreateAppointmentInputDTO>({
    mutationFn: (payload) => schedulingApi.createAppointment(payload),
    onSuccess: (newAppt) => {
      queryClient.invalidateQueries({ queryKey: schedulingQueryKeys.appointments() });
      queryClient.invalidateQueries({ queryKey: schedulingQueryKeys.calendar() });
      queryClient.invalidateQueries({ queryKey: schedulingQueryKeys.availability() });
      queryClient.setQueryData(schedulingQueryKeys.appointmentDetail(newAppt.id), newAppt);
      notification.success(
        'Appointment Scheduled',
        'The appointment has been booked successfully.',
      );
    },
  });
}

export function useRescheduleAppointmentMutation() {
  const queryClient = useQueryClient();
  const notification = useNotification();

  return useMutation<
    AppointmentModel,
    Error,
    { id: string; payload: RescheduleAppointmentInputDTO }
  >({
    mutationFn: ({ id, payload }) => schedulingApi.rescheduleAppointment(id, payload),
    onSuccess: (updatedAppt, { id }) => {
      queryClient.setQueryData(schedulingQueryKeys.appointmentDetail(id), updatedAppt);
      queryClient.invalidateQueries({ queryKey: schedulingQueryKeys.appointments() });
      queryClient.invalidateQueries({ queryKey: schedulingQueryKeys.calendar() });
      queryClient.invalidateQueries({ queryKey: schedulingQueryKeys.availability() });
      notification.success(
        'Appointment Rescheduled',
        'The appointment time has been updated successfully.',
      );
    },
  });
}

export function useCancelAppointmentMutation() {
  const queryClient = useQueryClient();
  const notification = useNotification();

  return useMutation<AppointmentModel, Error, { id: string; payload: CancelAppointmentInputDTO }>({
    mutationFn: ({ id, payload }) => schedulingApi.cancelAppointment(id, payload),
    onSuccess: (cancelledAppt, { id }) => {
      queryClient.setQueryData(schedulingQueryKeys.appointmentDetail(id), cancelledAppt);
      queryClient.invalidateQueries({ queryKey: schedulingQueryKeys.appointments() });
      queryClient.invalidateQueries({ queryKey: schedulingQueryKeys.calendar() });
      queryClient.invalidateQueries({ queryKey: schedulingQueryKeys.availability() });
      notification.success('Appointment Cancelled', 'The appointment has been cancelled.');
    },
  });
}

export function useConfirmAppointmentMutation() {
  const queryClient = useQueryClient();
  const notification = useNotification();

  return useMutation<AppointmentModel, Error, string>({
    mutationFn: (id) => schedulingApi.confirmAppointment(id),
    onSuccess: (updatedAppt, id) => {
      queryClient.setQueryData(schedulingQueryKeys.appointmentDetail(id), updatedAppt);
      queryClient.invalidateQueries({ queryKey: schedulingQueryKeys.appointments() });
      queryClient.invalidateQueries({ queryKey: schedulingQueryKeys.calendar() });
      notification.success(
        'Appointment Confirmed',
        'The appointment has been marked as confirmed.',
      );
    },
  });
}

export function useCheckInAppointmentMutation() {
  const queryClient = useQueryClient();
  const notification = useNotification();

  return useMutation<AppointmentModel, Error, string>({
    mutationFn: (id) => schedulingApi.checkInAppointment(id),
    onSuccess: (updatedAppt, id) => {
      queryClient.setQueryData(schedulingQueryKeys.appointmentDetail(id), updatedAppt);
      queryClient.invalidateQueries({ queryKey: schedulingQueryKeys.appointments() });
      queryClient.invalidateQueries({ queryKey: schedulingQueryKeys.calendar() });
      notification.success('Client Checked In', 'The client arrival has been recorded.');
    },
  });
}

export function useStartAppointmentMutation() {
  const queryClient = useQueryClient();
  const notification = useNotification();

  return useMutation<AppointmentModel, Error, string>({
    mutationFn: (id) => schedulingApi.startAppointment(id),
    onSuccess: (updatedAppt, id) => {
      queryClient.setQueryData(schedulingQueryKeys.appointmentDetail(id), updatedAppt);
      queryClient.invalidateQueries({ queryKey: schedulingQueryKeys.appointments() });
      queryClient.invalidateQueries({ queryKey: schedulingQueryKeys.calendar() });
      notification.success('Session Started', 'The appointment status is now in progress.');
    },
  });
}

export function useCompleteAppointmentMutation() {
  const queryClient = useQueryClient();
  const notification = useNotification();

  return useMutation<AppointmentModel, Error, string>({
    mutationFn: (id) => schedulingApi.completeAppointment(id),
    onSuccess: (updatedAppt, id) => {
      queryClient.setQueryData(schedulingQueryKeys.appointmentDetail(id), updatedAppt);
      queryClient.invalidateQueries({ queryKey: schedulingQueryKeys.appointments() });
      queryClient.invalidateQueries({ queryKey: schedulingQueryKeys.calendar() });
      notification.success('Appointment Completed', 'The appointment has been finalized.');
    },
  });
}

export function useMarkNoShowMutation() {
  const queryClient = useQueryClient();
  const notification = useNotification();

  return useMutation<AppointmentModel, Error, { id: string; payload?: MarkNoShowInputDTO }>({
    mutationFn: ({ id, payload }) => schedulingApi.markNoShow(id, payload),
    onSuccess: (updatedAppt, { id }) => {
      queryClient.setQueryData(schedulingQueryKeys.appointmentDetail(id), updatedAppt);
      queryClient.invalidateQueries({ queryKey: schedulingQueryKeys.appointments() });
      queryClient.invalidateQueries({ queryKey: schedulingQueryKeys.calendar() });
      queryClient.invalidateQueries({ queryKey: schedulingQueryKeys.availability() });
      notification.success('Marked as No-Show', 'The appointment has been marked as a no-show.');
    },
  });
}

export function useAddAppointmentNoteMutation() {
  const queryClient = useQueryClient();
  const notification = useNotification();

  return useMutation<AppointmentModel, Error, { id: string; payload: AddAppointmentNoteInputDTO }>({
    mutationFn: ({ id, payload }) => schedulingApi.addAppointmentNote(id, payload),
    onSuccess: (updatedAppt, { id }) => {
      queryClient.setQueryData(schedulingQueryKeys.appointmentDetail(id), updatedAppt);
      notification.success('Note Added', 'Clinical/administrative note attached successfully.');
    },
  });
}

// -----------------------------------------------------------------------------
// 2. Room Mutations
// -----------------------------------------------------------------------------

export function useCreateRoomMutation() {
  const queryClient = useQueryClient();
  const notification = useNotification();

  return useMutation<RoomModel, Error, CreateRoomInputDTO>({
    mutationFn: (payload) => schedulingApi.createRoom(payload),
    onSuccess: (newRoom) => {
      queryClient.invalidateQueries({ queryKey: schedulingQueryKeys.rooms() });
      queryClient.invalidateQueries({ queryKey: schedulingQueryKeys.availability() });
      queryClient.setQueryData(schedulingQueryKeys.roomDetail(newRoom.id), newRoom);
      notification.success('Room Created', `Room "${newRoom.name}" registered successfully.`);
    },
  });
}

export function useEditRoomMutation() {
  const queryClient = useQueryClient();
  const notification = useNotification();

  return useMutation<RoomModel, Error, { id: string; payload: EditRoomInputDTO }>({
    mutationFn: ({ id, payload }) => schedulingApi.editRoom(id, payload),
    onSuccess: (updatedRoom, { id }) => {
      queryClient.setQueryData(schedulingQueryKeys.roomDetail(id), updatedRoom);
      queryClient.invalidateQueries({ queryKey: schedulingQueryKeys.rooms() });
      queryClient.invalidateQueries({ queryKey: schedulingQueryKeys.availability() });
      notification.success('Room Updated', `Room "${updatedRoom.name}" has been updated.`);
    },
  });
}

export function useActivateRoomMutation() {
  const queryClient = useQueryClient();
  const notification = useNotification();

  return useMutation<RoomModel, Error, { id: string; payload: ActivateRoomInputDTO }>({
    mutationFn: ({ id, payload }) => schedulingApi.activateRoom(id, payload),
    onSuccess: (updatedRoom, { id }) => {
      queryClient.setQueryData(schedulingQueryKeys.roomDetail(id), updatedRoom);
      queryClient.invalidateQueries({ queryKey: schedulingQueryKeys.rooms() });
      queryClient.invalidateQueries({ queryKey: schedulingQueryKeys.availability() });
      notification.success(
        'Room Activated',
        `Room "${updatedRoom.name}" is now available for bookings.`,
      );
    },
  });
}

export function useDeactivateRoomMutation() {
  const queryClient = useQueryClient();
  const notification = useNotification();

  return useMutation<RoomModel, Error, { id: string; payload: DeactivateRoomInputDTO }>({
    mutationFn: ({ id, payload }) => schedulingApi.deactivateRoom(id, payload),
    onSuccess: (updatedRoom, { id }) => {
      queryClient.setQueryData(schedulingQueryKeys.roomDetail(id), updatedRoom);
      queryClient.invalidateQueries({ queryKey: schedulingQueryKeys.rooms() });
      queryClient.invalidateQueries({ queryKey: schedulingQueryKeys.availability() });
      notification.success('Room Deactivated', `Room "${updatedRoom.name}" set to unavailable.`);
    },
  });
}

export function useScheduleMaintenanceMutation() {
  const queryClient = useQueryClient();
  const notification = useNotification();

  return useMutation<RoomModel, Error, { id: string; payload: ScheduleMaintenanceInputDTO }>({
    mutationFn: ({ id, payload }) => schedulingApi.scheduleMaintenance(id, payload),
    onSuccess: (updatedRoom, { id }) => {
      queryClient.setQueryData(schedulingQueryKeys.roomDetail(id), updatedRoom);
      queryClient.invalidateQueries({ queryKey: schedulingQueryKeys.rooms() });
      queryClient.invalidateQueries({ queryKey: schedulingQueryKeys.calendar() });
      queryClient.invalidateQueries({ queryKey: schedulingQueryKeys.availability() });
      notification.success('Maintenance Scheduled', 'Maintenance window scheduled successfully.');
    },
  });
}

export function useCancelMaintenanceMutation() {
  const queryClient = useQueryClient();
  const notification = useNotification();

  return useMutation<RoomModel, Error, { id: string; maintenanceId: string }>({
    mutationFn: ({ id, maintenanceId }) => schedulingApi.cancelMaintenance(id, maintenanceId),
    onSuccess: (updatedRoom, { id }) => {
      queryClient.setQueryData(schedulingQueryKeys.roomDetail(id), updatedRoom);
      queryClient.invalidateQueries({ queryKey: schedulingQueryKeys.rooms() });
      queryClient.invalidateQueries({ queryKey: schedulingQueryKeys.calendar() });
      queryClient.invalidateQueries({ queryKey: schedulingQueryKeys.availability() });
      notification.success('Maintenance Cancelled', 'Maintenance window removed.');
    },
  });
}

// -----------------------------------------------------------------------------
// 3. Recurrence Mutations
// -----------------------------------------------------------------------------

export function useCreateRecurrenceSeriesMutation() {
  const queryClient = useQueryClient();
  const notification = useNotification();

  return useMutation<CreateRecurrenceSeriesResponseDTO, Error, CreateRecurrenceSeriesInputDTO>({
    mutationFn: (payload) => schedulingApi.createRecurrenceSeries(payload),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: schedulingQueryKeys.appointments() });
      queryClient.invalidateQueries({ queryKey: schedulingQueryKeys.calendar() });
      queryClient.invalidateQueries({ queryKey: schedulingQueryKeys.recurringSeries() });
      queryClient.invalidateQueries({ queryKey: schedulingQueryKeys.availability() });
      notification.success(
        'Recurring Series Created',
        `Series scheduled (${data.initialGeneration.generatedCount} appointments generated).`,
      );
    },
  });
}

export function useSkipOccurrenceMutation() {
  const queryClient = useQueryClient();
  const notification = useNotification();

  return useMutation<
    SkipOccurrenceResponseDTO,
    Error,
    { seriesId: string; payload: SkipOccurrenceInputDTO }
  >({
    mutationFn: ({ seriesId, payload }) => schedulingApi.skipOccurrence(seriesId, payload),
    onSuccess: (_, { seriesId }) => {
      queryClient.invalidateQueries({ queryKey: schedulingQueryKeys.appointments() });
      queryClient.invalidateQueries({ queryKey: schedulingQueryKeys.calendar() });
      queryClient.invalidateQueries({ queryKey: schedulingQueryKeys.availability() });
      queryClient.invalidateQueries({
        queryKey: schedulingQueryKeys.recurringSeriesDetail(seriesId),
      });
      notification.success('Occurrence Skipped', 'The occurrence slot was skipped.');
    },
  });
}

export function useEditSingleOccurrenceMutation() {
  const queryClient = useQueryClient();
  const notification = useNotification();

  return useMutation<
    AppointmentModel,
    Error,
    { appointmentId: string; payload: EditSingleOccurrenceInputDTO }
  >({
    mutationFn: ({ appointmentId, payload }) =>
      schedulingApi.editSingleOccurrence(appointmentId, payload),
    onSuccess: (detachedAppt, { appointmentId }) => {
      queryClient.setQueryData(schedulingQueryKeys.appointmentDetail(appointmentId), detachedAppt);
      queryClient.invalidateQueries({ queryKey: schedulingQueryKeys.appointments() });
      queryClient.invalidateQueries({ queryKey: schedulingQueryKeys.calendar() });
      queryClient.invalidateQueries({ queryKey: schedulingQueryKeys.availability() });
      notification.success('Occurrence Updated', 'Appointment detached and rescheduled.');
    },
  });
}

export function useEditFutureOccurrencesMutation() {
  const queryClient = useQueryClient();
  const notification = useNotification();

  return useMutation<
    EditFutureOccurrencesResponseDTO,
    Error,
    { seriesId: string; payload: EditFutureOccurrencesInputDTO }
  >({
    mutationFn: ({ seriesId, payload }) => schedulingApi.editFutureOccurrences(seriesId, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: schedulingQueryKeys.appointments() });
      queryClient.invalidateQueries({ queryKey: schedulingQueryKeys.calendar() });
      queryClient.invalidateQueries({ queryKey: schedulingQueryKeys.recurringSeries() });
      queryClient.invalidateQueries({ queryKey: schedulingQueryKeys.availability() });
      notification.success('Future Series Updated', 'Future occurrences branched successfully.');
    },
  });
}

export function useCancelRecurrenceSeriesMutation() {
  const queryClient = useQueryClient();
  const notification = useNotification();

  return useMutation<
    CancelRecurrenceSeriesResponseDTO,
    Error,
    { seriesId: string; payload?: CancelRecurrenceSeriesInputDTO }
  >({
    mutationFn: ({ seriesId, payload }) => schedulingApi.cancelRecurrenceSeries(seriesId, payload),
    onSuccess: (data, { seriesId }) => {
      queryClient.invalidateQueries({ queryKey: schedulingQueryKeys.appointments() });
      queryClient.invalidateQueries({ queryKey: schedulingQueryKeys.calendar() });
      queryClient.invalidateQueries({ queryKey: schedulingQueryKeys.availability() });
      queryClient.invalidateQueries({
        queryKey: schedulingQueryKeys.recurringSeriesDetail(seriesId),
      });
      notification.success(
        'Series Cancelled',
        `${data.cancelledCount} future occurrences cancelled.`,
      );
    },
  });
}
