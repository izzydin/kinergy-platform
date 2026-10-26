import { SessionStatus, type TreatmentSessionDTO } from '@kinergy-platform/core';

export { SessionStatus };

/**
 * Authoritative session lifecycle status enum re-exported from canonical core.
 */
export type SessionStatusType =
  SessionStatus | 'SCHEDULED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED' | 'NO_SHOW';

/**
 * Structured SOAP clinical progress notes payload shape.
 */
export type SoapNotesData = TreatmentSessionDTO['notes'];

/**
 * Canonical treatment session presentation model (1-to-1 with TreatmentSessionDTO).
 */
export type TreatmentSessionModel = TreatmentSessionDTO;

/**
 * Request payload for creating a TreatmentSession from an active Appointment.
 */
export interface CreateSessionPayload {
  readonly appointmentId: string;
  readonly initialNotes?: string;
  readonly autoStart?: boolean;
}

/**
 * Request payload for practitioner assignment / clinical handover.
 */
export interface AssignTherapistPayload {
  readonly newTherapistId: string;
}

/**
 * Request payload for updating clinical SOAP notes.
 */
export interface UpdateNotesPayload {
  readonly subjective?: string;
  readonly objective?: string;
  readonly assessment?: string;
  readonly plan?: string;
  readonly rawText?: string;
  readonly expectedVersion?: number;
}

/**
 * Request payload for cancelling a scheduled treatment session.
 */
export interface CancelSessionPayload {
  readonly reason: string;
}
