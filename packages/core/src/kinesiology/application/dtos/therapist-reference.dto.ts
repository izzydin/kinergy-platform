/**
 * Read-only projection DTO representing a practitioner's identity and clinical eligibility.
 * Crossed via Anti-Corruption Layer port without importing Identity domain models.
 */
export interface TherapistReferenceDTO {
  /** The unique scalar identifier of the therapist */
  readonly therapistId: string;
  /** Active status of the therapist account */
  readonly status: string;
  /** Roles assigned to the user */
  readonly roles: ReadonlyArray<string>;
  /** True if user is ACTIVE and holds clinical therapeutic permissions */
  readonly isEligible: boolean;
  /** Explicit reason why practitioner is ineligible, if applicable */
  readonly ineligibilityReason?: string;
}
