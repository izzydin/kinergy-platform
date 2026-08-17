/**
 * Read-only projection representing an appointment reference for session creation.
 * Owned by Kinesiology Application Layer as an Anti-Corruption Layer (ACL) DTO.
 */
export interface AppointmentReferenceDTO {
  readonly appointmentId: string;
  readonly clientId: string;
  readonly therapistId: string;
  readonly scheduledAt: Date;
  readonly isEligibleForSession: boolean;
  readonly ineligibilityReason?: string;
}
