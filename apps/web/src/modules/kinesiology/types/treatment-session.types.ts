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

/**
 * Authoritative billing details for a kinesiology treatment session.
 */
export interface SessionBillingInfo {
  readonly sessionId: string;
  readonly appointmentId: string;
  readonly clientId: string;
  readonly clientFullName: string;
  readonly therapistId: string;
  readonly sessionStatus: string;
  readonly serviceType: string;
  readonly serviceDescription: string;
  readonly price: {
    readonly amount: number;
    readonly currency: string;
    readonly formatted: string;
  };
  readonly isAlreadyPaid: boolean;
  readonly paymentStatus: 'PAID' | 'UNPAID' | 'PARTIALLY_PAID' | 'PENDING';
  readonly existingSaleId?: string;
  readonly existingPaymentId?: string;
  readonly existingPaymentMethod?: string;
  readonly existingReceiptId?: string;
  readonly existingReceiptNumber?: string;
}

/**
 * Request payload for integrated treatment session completion and financial checkout.
 */
export interface CompleteAndCheckoutPayload {
  readonly flowOption: 'COLLECT_PAYMENT' | 'ALREADY_PAID';
  readonly paymentMethod?: 'CASH' | 'QR';
  readonly paymentReference?: string;
  readonly idempotencyKey?: string;
}

/**
 * Authoritative result from completing and checking out a treatment session.
 */
export interface CompleteAndCheckoutResult {
  readonly success: boolean;
  readonly sessionId: string;
  readonly sessionStatus: string;
  readonly saleId?: string;
  readonly saleStatus?: string;
  readonly paymentId?: string;
  readonly paymentStatus?: string;
  readonly paymentMethod?: string;
  readonly receiptId?: string | null;
  readonly receiptNumber?: string | null;
  readonly amount: number;
  readonly currency: string;
  readonly clientFullName: string;
  readonly paidAt: string;
}
