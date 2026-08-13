import { AppointmentDTO } from '../../appointment/dtos/appointment.dto';

export interface ConflictingOccurrenceDiagnostic {
  readonly occurrenceIndex: number;
  readonly timeRange: {
    readonly start: string;
    readonly end: string;
  };
  readonly conflicts: Array<{
    readonly conflictType: string;
    readonly message: string;
    readonly conflictingEntityId?: string;
  }>;
}

export interface OccurrenceGenerationResultDTO {
  readonly seriesId: string;
  readonly requestedWindow: {
    readonly start: string;
    readonly end: string;
  };
  readonly generatedCount: number;
  readonly skippedCount: number;
  readonly conflictCount: number;
  readonly existingCount: number;
  readonly isSeriesCompleted: boolean;
  readonly generatedAppointments: AppointmentDTO[];
  readonly conflictingOccurrences: ConflictingOccurrenceDiagnostic[];
}
