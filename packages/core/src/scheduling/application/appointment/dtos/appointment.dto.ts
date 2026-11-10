import { AppointmentNoteDTO } from './appointment-note.dto';

/**
 * Lightweight client summary DTO attached to Appointment read models.
 */
export interface AppointmentClientSummaryDTO {
  readonly id: string;
  readonly firstName?: string;
  readonly lastName?: string;
  readonly fullName: string;
}

/**
 * Read model DTO representation of an Appointment entity.
 */
export interface AppointmentDTO {
  readonly id: string;
  readonly status: string;
  readonly type: string;
  readonly clientId: string;
  readonly client?: AppointmentClientSummaryDTO;
  readonly clientName?: string;
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
