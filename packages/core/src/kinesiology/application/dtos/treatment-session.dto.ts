import { SessionStatus } from '../../domain/treatment-session/session-status.enum';

/**
 * Data Transfer Object representing a TreatmentSession for application and API boundaries.
 */
export interface TreatmentSessionDTO {
  readonly id: string;
  readonly version: number;
  readonly status: SessionStatus;
  readonly clientId: string;
  readonly therapistId: string;
  readonly appointmentId: string;
  readonly cancellationReason?: string;
  readonly notes: {
    readonly subjective?: string;
    readonly objective?: string;
    readonly assessment?: string;
    readonly plan?: string;
    readonly rawText?: string;
  };
  readonly createdAt: string;
  readonly updatedAt: string;
}
