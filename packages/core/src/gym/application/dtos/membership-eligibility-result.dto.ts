import { MembershipEligibilityOutcome } from './membership-eligibility-outcome.enum';

/**
 * Authoritative DTO representing the outcome of a membership eligibility check.
 */
export interface MembershipEligibilityResultDTO {
  /**
   * Boolean flag indicating whether the client is authorized to check in right now.
   */
  readonly isEligible: boolean;

  /**
   * Explicit diagnostic outcome code.
   */
  readonly outcome: MembershipEligibilityOutcome;

  /**
   * The ID of the membership that authorized access or was evaluated (if present).
   */
  readonly membershipId: string | null;

  /**
   * The plan ID of the evaluated membership (if present).
   */
  readonly planId: string | null;

  /**
   * Validity period ISO strings of the evaluated membership (if present).
   */
  readonly period: {
    readonly startDate: string;
    readonly endDate: string;
  } | null;

  /**
   * ISO string of the exact UTC timestamp when eligibility was evaluated.
   */
  readonly evaluatedAt: string;

  /**
   * Human-readable operational explanation suitable for front-desk monitors or logs.
   */
  readonly reason: string;
}
