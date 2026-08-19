import { Clock } from '../../domain/shared/clock';
import { MembershipStatus } from '../../domain/membership/membership-status.enum';
import { MembershipRepository } from '../../domain/repositories/membership.repository';
import { ClientLookupPort } from '../ports/client-lookup.port';
import { GymLoggerPort } from '../ports/gym-logger.port';
import { MembershipEligibilityPort } from '../ports/membership-eligibility.port';
import { MembershipEligibilityOutcome } from '../dtos/membership-eligibility-outcome.enum';
import { MembershipEligibilityResultDTO } from '../dtos/membership-eligibility-result.dto';
import { CheckMembershipEligibilityQuery } from './check-membership-eligibility.query';
import { ApplicationResult } from '../shared/application-result';

/**
 * Authoritative Application Service & Query Handler for evaluating client gym admission eligibility.
 * Encapsulates all membership status, period validity, freeze window, and multi-membership resolution rules.
 */
export class CheckMembershipEligibilityHandler implements MembershipEligibilityPort {
  constructor(
    private readonly membershipRepo: MembershipRepository,
    private readonly clientLookupPort: ClientLookupPort,
    private readonly clock: Clock,
    private readonly logger?: GymLoggerPort,
  ) {}

  /**
   * Implements MembershipEligibilityPort for direct consumption by Attendance and domain services.
   */
  public async evaluateEligibility(
    clientId: string,
    asOf?: Date,
  ): Promise<MembershipEligibilityResultDTO> {
    const query = new CheckMembershipEligibilityQuery(clientId, asOf);
    const result = await this.execute(query);
    return result.getValue();
  }

  /**
   * CQRS Query execution handling.
   */
  public async execute(
    query: CheckMembershipEligibilityQuery,
  ): Promise<ApplicationResult<MembershipEligibilityResultDTO>> {
    const evalDate = query.asOf ? new Date(query.asOf.getTime()) : this.clock.now();
    const evaluatedAtIso = evalDate.toISOString();

    if (!query.clientId || query.clientId.trim() === '') {
      return ApplicationResult.ok<MembershipEligibilityResultDTO>({
        isEligible: false,
        outcome: MembershipEligibilityOutcome.INACTIVE_CLIENT,
        membershipId: null,
        planId: null,
        period: null,
        evaluatedAt: evaluatedAtIso,
        reason: 'Client identifier is missing or invalid.',
      });
    }

    // 1. Cross-Context Validation: Verify Client exists and has active standing
    const clientExists = await this.clientLookupPort.validateClientExists(query.clientId);
    if (!clientExists) {
      this.logger?.warn('Membership eligibility evaluation failed: Client not found or inactive', {
        clientId: query.clientId,
      });

      return ApplicationResult.ok<MembershipEligibilityResultDTO>({
        isEligible: false,
        outcome: MembershipEligibilityOutcome.INACTIVE_CLIENT,
        membershipId: null,
        planId: null,
        period: null,
        evaluatedAt: evaluatedAtIso,
        reason: 'Client record was not found or is in an inactive standing in Client Management.',
      });
    }

    // 2. Query all historical and active memberships for the client
    const memberships = await this.membershipRepo.findByClientId(query.clientId);

    if (memberships.length === 0) {
      return ApplicationResult.ok<MembershipEligibilityResultDTO>({
        isEligible: false,
        outcome: MembershipEligibilityOutcome.NO_MEMBERSHIP,
        membershipId: null,
        planId: null,
        period: null,
        evaluatedAt: evaluatedAtIso,
        reason: 'Client does not have any membership records on file.',
      });
    }

    // 3. Evaluate active eligibility across candidate memberships
    const eligibleMembership = memberships.find(
      (m) => m.isEligibleForAttendance(evalDate) && evalDate.getTime() < m.period.endDate.getTime(),
    );

    if (eligibleMembership) {
      return ApplicationResult.ok<MembershipEligibilityResultDTO>({
        isEligible: true,
        outcome: MembershipEligibilityOutcome.ELIGIBLE,
        membershipId: eligibleMembership.id.value,
        planId: eligibleMembership.planId,
        period: {
          startDate: eligibleMembership.period.startDate.toISOString(),
          endDate: eligibleMembership.period.endDate.toISOString(),
        },
        evaluatedAt: evaluatedAtIso,
        reason: 'Client has an active and valid membership.',
      });
    }

    // 4. Ineligible Diagnosis: Order memberships by end date descending to analyze latest agreement
    const sorted = [...memberships].sort(
      (a, b) => b.period.endDate.getTime() - a.period.endDate.getTime(),
    );
    const latest = sorted[0]!;

    // Check for FROZEN agreement encompassing current time
    const frozenMembership = memberships.find(
      (m) => m.status === MembershipStatus.FROZEN && m.period.contains(evalDate),
    );
    if (frozenMembership) {
      return ApplicationResult.ok<MembershipEligibilityResultDTO>({
        isEligible: false,
        outcome: MembershipEligibilityOutcome.FROZEN,
        membershipId: frozenMembership.id.value,
        planId: frozenMembership.planId,
        period: {
          startDate: frozenMembership.period.startDate.toISOString(),
          endDate: frozenMembership.period.endDate.toISOString(),
        },
        evaluatedAt: evaluatedAtIso,
        reason: 'Membership is currently frozen and access is suspended.',
      });
    }

    // Check for PENDING / future agreement
    const pendingMembership = memberships.find(
      (m) =>
        m.status === MembershipStatus.PENDING || evalDate.getTime() < m.period.startDate.getTime(),
    );
    if (pendingMembership && evalDate.getTime() < pendingMembership.period.startDate.getTime()) {
      return ApplicationResult.ok<MembershipEligibilityResultDTO>({
        isEligible: false,
        outcome: MembershipEligibilityOutcome.NOT_YET_ACTIVE,
        membershipId: pendingMembership.id.value,
        planId: pendingMembership.planId,
        period: {
          startDate: pendingMembership.period.startDate.toISOString(),
          endDate: pendingMembership.period.endDate.toISOString(),
        },
        evaluatedAt: evaluatedAtIso,
        reason: `Membership period has not started yet (valid from ${pendingMembership.period.startDate.toISOString()}).`,
      });
    }

    // Check for EXPIRED agreement
    if (
      latest.status === MembershipStatus.EXPIRED ||
      evalDate.getTime() >= latest.period.endDate.getTime()
    ) {
      return ApplicationResult.ok<MembershipEligibilityResultDTO>({
        isEligible: false,
        outcome: MembershipEligibilityOutcome.EXPIRED,
        membershipId: latest.id.value,
        planId: latest.planId,
        period: {
          startDate: latest.period.startDate.toISOString(),
          endDate: latest.period.endDate.toISOString(),
        },
        evaluatedAt: evaluatedAtIso,
        reason: `Membership expired on ${latest.period.endDate.toISOString()}.`,
      });
    }

    // Check for CANCELLED agreement
    if (latest.status === MembershipStatus.CANCELLED) {
      return ApplicationResult.ok<MembershipEligibilityResultDTO>({
        isEligible: false,
        outcome: MembershipEligibilityOutcome.CANCELLED,
        membershipId: latest.id.value,
        planId: latest.planId,
        period: {
          startDate: latest.period.startDate.toISOString(),
          endDate: latest.period.endDate.toISOString(),
        },
        evaluatedAt: evaluatedAtIso,
        reason: 'Membership was cancelled prior to expiration.',
      });
    }

    // Check for TERMINATED agreement
    if (latest.status === MembershipStatus.TERMINATED) {
      return ApplicationResult.ok<MembershipEligibilityResultDTO>({
        isEligible: false,
        outcome: MembershipEligibilityOutcome.TERMINATED,
        membershipId: latest.id.value,
        planId: latest.planId,
        period: {
          startDate: latest.period.startDate.toISOString(),
          endDate: latest.period.endDate.toISOString(),
        },
        evaluatedAt: evaluatedAtIso,
        reason: 'Membership was terminated due to administrative or policy revocation.',
      });
    }

    return ApplicationResult.ok<MembershipEligibilityResultDTO>({
      isEligible: false,
      outcome: MembershipEligibilityOutcome.NO_MEMBERSHIP,
      membershipId: latest.id.value,
      planId: latest.planId,
      period: {
        startDate: latest.period.startDate.toISOString(),
        endDate: latest.period.endDate.toISOString(),
      },
      evaluatedAt: evaluatedAtIso,
      reason: 'No active or valid membership found for client.',
    });
  }
}
