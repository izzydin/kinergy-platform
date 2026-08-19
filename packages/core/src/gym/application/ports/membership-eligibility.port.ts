import { MembershipEligibilityResultDTO } from '../dtos/membership-eligibility-result.dto';

/**
 * Authoritative port for evaluating whether a client is currently eligible for gym admission.
 * Consumed by Attendance check-in use cases, reception monitors, and turnstiles.
 */
export interface MembershipEligibilityPort {
  /**
   * Evaluates eligibility for a given client at the specified time instant.
   *
   * @param clientId Master client identifier
   * @param asOf Optional UTC evaluation timestamp (defaults to current clock time)
   */
  evaluateEligibility(clientId: string, asOf?: Date): Promise<MembershipEligibilityResultDTO>;
}
