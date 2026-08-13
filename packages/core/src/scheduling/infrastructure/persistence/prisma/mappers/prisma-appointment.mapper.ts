import {
  Appointment as PrismaAppointmentModel,
  AppointmentNote as PrismaAppointmentNoteModel,
  AppointmentStatus as PrismaAppointmentStatus,
} from '@prisma/client';
import { Appointment } from '../../../../domain/appointment/appointment.aggregate';
import { AppointmentId } from '../../../../domain/appointment/appointment-id.vo';
import { AppointmentType } from '../../../../domain/value-objects/appointment-type.vo';
import { AppointmentStatus } from '../../../../domain/value-objects/appointment-status.enum';
import { TimeRange } from '../../../../domain/value-objects/time-range.vo';
import { AppointmentNote } from '../../../../domain/appointment/value-objects/appointment-note.vo';

export type PrismaAppointmentWithRelations = PrismaAppointmentModel & {
  notes?: PrismaAppointmentNoteModel[];
};

export class PrismaAppointmentMapper {
  public static toDomain(raw: PrismaAppointmentWithRelations): Appointment {
    const timeRange = TimeRange.create(raw.startTime, raw.endTime);
    const apptType = AppointmentType.create(raw.type);

    const notes = (raw.notes ?? []).map((n) =>
      AppointmentNote.create(n.authorId, n.noteText, n.createdAt, n.id),
    );

    return Appointment.reconstitute({
      id: AppointmentId.create(raw.id),
      clientId: raw.clientId,
      therapistId: raw.therapistId,
      roomId: raw.roomId,
      type: apptType,
      status: raw.status as unknown as AppointmentStatus,
      timeRange,
      seriesId: raw.seriesId ?? undefined,
      occurrenceIndex: raw.occurrenceIndex ?? undefined,
      isDetachedFromSeries: raw.isDetachedFromSeries,
      cancellationReason: raw.cancellationReason ?? undefined,
      notes,
      version: raw.version,
      createdAt: raw.createdAt,
      updatedAt: raw.updatedAt,
    });
  }

  public static toPersistence(
    appointment: Appointment,
  ): Omit<PrismaAppointmentModel, 'createdAt' | 'updatedAt'> {
    return {
      id: appointment.id.getValue(),
      clientId: appointment.clientId,
      therapistId: appointment.therapistId,
      roomId: appointment.roomId,
      type: appointment.type.getValue(),
      status: appointment.status as unknown as PrismaAppointmentStatus,
      startTime: appointment.timeRange.start,
      endTime: appointment.timeRange.end,
      seriesId: appointment.seriesId ?? null,
      occurrenceIndex: appointment.occurrenceIndex ?? null,
      isDetachedFromSeries: appointment.isDetachedFromSeries,
      cancellationReason: appointment.cancellationReason ?? null,
      version: appointment.version,
    };
  }
}
