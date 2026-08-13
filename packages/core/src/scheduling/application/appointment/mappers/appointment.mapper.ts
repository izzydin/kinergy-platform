import { Appointment } from '../../../domain/appointment/appointment.aggregate';
import { AppointmentDTO } from '../dtos/appointment.dto';

/**
 * Pure mapping utility converting between domain Appointment Aggregate Roots and read model DTOs.
 */
export class AppointmentMapper {
  /**
   * Converts an Appointment Aggregate Root instance into a read-only AppointmentDTO.
   *
   * @param appointment Domain Appointment aggregate root
   * @returns Pure read-only AppointmentDTO DTO
   */
  public static toDTO(appointment: Appointment): AppointmentDTO {
    return {
      id: appointment.id.getValue(),
      status: appointment.status,
      type: appointment.type.getValue(),
      clientId: appointment.clientId,
      therapistId: appointment.therapistId,
      roomId: appointment.roomId,
      startTime: appointment.timeRange.start.toISOString(),
      endTime: appointment.timeRange.end.toISOString(),
      durationMinutes: appointment.timeRange.duration().toMinutes(),
      cancellationReason: appointment.cancellationReason,
      seriesId: appointment.seriesId,
      occurrenceIndex: appointment.occurrenceIndex,
      isDetachedFromSeries: appointment.isDetachedFromSeries,
      notes: appointment.notes.map((note) => ({
        id: note.id,
        noteText: note.noteText,
        authorId: note.authorId,
        createdAt: note.createdAt.toISOString(),
      })),
      version: appointment.version,
      createdAt: appointment.createdAt.toISOString(),
      updatedAt: appointment.updatedAt.toISOString(),
    };
  }

  /**
   * Converts a list/collection of Appointment aggregates into an array of AppointmentDTOs.
   *
   * @param appointments Iterable collection of Appointment aggregates
   * @returns Array of AppointmentDTO read models
   */
  public static toDTOList(appointments: Iterable<Appointment>): AppointmentDTO[] {
    return Array.from(appointments).map((appt) => AppointmentMapper.toDTO(appt));
  }
}
