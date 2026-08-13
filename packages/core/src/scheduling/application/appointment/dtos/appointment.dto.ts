import { AppointmentNoteDTO } from './appointment-note.dto';

/**
 * Read model DTO representation of an Appointment entity.
 */
export interface AppointmentDTO {
  readonly id: string;
  readonly status: string;
  readonly type: string;
  readonly clientId: string;
  readonly therapistId: string;
  readonly roomId: string;
  readonly startTime: string;
  readonly endTime: string;
  readonly durationMinutes: number;
  readonly cancellationReason?: string;
  readonly seriesId?: string;
  readonly occurrenceIndex?: number;
  readonly isDetachedFromSeries?: boolean;
  readonly notes?: ReadonlyArray<AppointmentNoteDTO>;
  readonly version: number;
  readonly createdAt: string;
  readonly updatedAt: string;
}
