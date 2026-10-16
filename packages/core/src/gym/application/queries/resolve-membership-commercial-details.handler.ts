import { QueryHandler } from '../shared/query-handler.interface';
import { ApplicationResult } from '../shared/application-result';
import { ResolveMembershipCommercialDetailsQuery } from './resolve-membership-commercial-details.query';
import { MembershipCommercialDetailsDTO } from '../dtos/membership-commercial-details.dto';
import { MembershipPlanRepository } from '../../domain/repositories/membership-plan.repository';
import { MembershipRepository } from '../../domain/repositories/membership.repository';
import { ClientLookupPort } from '../ports/client-lookup.port';
import { Clock } from '../../domain/shared/clock';
import { MembershipOverlapPolicy } from '../../domain/policies/membership-overlap.policy';
import { PlanStatus } from '../../domain/plan/plan-status.enum';
import { MembershipStatus } from '../../domain/membership/membership-status.enum';
import { MembershipPeriod } from '../../domain/membership/membership-period.vo';

/**
 * Authoritative Application Query Handler resolving client, price, currency,
 * and commercial eligibility for Gym membership purchases and renewals.
 * Adheres strictly to ADR-0058, ADR-0059, ADR-0060, ADR-0061, and ADR-0139 (§3.2).
 */
export class ResolveMembershipCommercialDetailsHandler implements QueryHandler<
  ResolveMembershipCommercialDetailsQuery,
  ApplicationResult<MembershipCommercialDetailsDTO>
> {
  private readonly overlapPolicy: MembershipOverlapPolicy;

  constructor(
    private readonly planRepository: MembershipPlanRepository,
    private readonly membershipRepository: MembershipRepository,
    private readonly clientLookupPort: ClientLookupPort,
    private readonly clock: Clock,
    overlapPolicy?: MembershipOverlapPolicy,
  ) {
    this.overlapPolicy = overlapPolicy ?? new MembershipOverlapPolicy();
  }

  public async execute(
    query: ResolveMembershipCommercialDetailsQuery,
  ): Promise<ApplicationResult<MembershipCommercialDetailsDTO>> {
    const { sourceId, clientId, targetPlanId } = query.input;

    if (!sourceId || sourceId.trim().length === 0) {
      return ApplicationResult.fail('Source ID (planId or membershipId) is required.');
    }

    const trimmedSourceId = sourceId.trim();

    // 1. Determine if sourceId corresponds to an existing Membership (Renewal workflow)
    const existingMembership = await this.membershipRepository.findById(trimmedSourceId);

    if (existingMembership) {
      // --- Renewal Workflow ---
      const effectiveClientId = clientId?.trim() || existingMembership.clientId;

      // Verify client ownership
      if (clientId && clientId.trim() !== existingMembership.clientId) {
        return ApplicationResult.fail(
          `Client '${clientId}' does not own membership '${existingMembership.id.value}'.`,
        );
      }

      // Check external client standing
      const clientExists = await this.clientLookupPort.validateClientExists(effectiveClientId);
      if (!clientExists) {
        return ApplicationResult.ok<MembershipCommercialDetailsDTO>({
          planId: existingMembership.planId,
          planCode: 'UNKNOWN',
          planName: 'Unknown Plan',
          durationDays: 0,
          unitPriceCents: 0,
          currency: 'USD',
          description: 'Membership Renewal',
          clientId: effectiveClientId,
          membershipId: existingMembership.id.value,
          isRenewal: true,
          isEligible: false,
          eligibilityReason: `Client '${effectiveClientId}' does not exist or is not eligible.`,
          planStatus: 'UNKNOWN',
          membershipStatus: existingMembership.status,
        });
      }

      // Check membership lifecycle state for renewal
      if (
        existingMembership.status === MembershipStatus.CANCELLED ||
        existingMembership.status === MembershipStatus.TERMINATED
      ) {
        return ApplicationResult.ok<MembershipCommercialDetailsDTO>({
          planId: existingMembership.planId,
          planCode: 'TERMINAL',
          planName: 'Lapsed Agreement',
          durationDays: 0,
          unitPriceCents: 0,
          currency: 'USD',
          description: `Membership Renewal - ${existingMembership.id.value}`,
          clientId: effectiveClientId,
          membershipId: existingMembership.id.value,
          isRenewal: true,
          isEligible: false,
          eligibilityReason: `Cannot renew membership in '${existingMembership.status}' status.`,
          planStatus: 'ACTIVE',
          membershipStatus: existingMembership.status,
        });
      }

      if (existingMembership.status === MembershipStatus.FROZEN) {
        return ApplicationResult.ok<MembershipCommercialDetailsDTO>({
          planId: existingMembership.planId,
          planCode: 'FROZEN',
          planName: 'Frozen Agreement',
          durationDays: 0,
          unitPriceCents: 0,
          currency: 'USD',
          description: `Membership Renewal - ${existingMembership.id.value}`,
          clientId: effectiveClientId,
          membershipId: existingMembership.id.value,
          isRenewal: true,
          isEligible: false,
          eligibilityReason: `Membership '${existingMembership.id.value}' is currently FROZEN and must be resumed before renewal.`,
          planStatus: 'ACTIVE',
          membershipStatus: existingMembership.status,
        });
      }

      // Resolve target plan (either upgraded/downgraded plan or current plan)
      const planToLoad = targetPlanId?.trim() || existingMembership.planId;
      const plan = await this.planRepository.findById(planToLoad);
      if (!plan) {
        return ApplicationResult.fail(`Membership plan with id '${planToLoad}' not found.`);
      }

      if (plan.status !== PlanStatus.ACTIVE) {
        return ApplicationResult.ok<MembershipCommercialDetailsDTO>({
          planId: plan.id.value,
          planCode: plan.code.value,
          planName: plan.name,
          durationDays: plan.duration.durationInDays,
          unitPriceCents: Math.round(plan.price.amount * 100),
          currency: plan.price.currency,
          description: `Gym Membership Renewal - ${plan.name}`,
          clientId: effectiveClientId,
          membershipId: existingMembership.id.value,
          isRenewal: true,
          isEligible: false,
          eligibilityReason: `Membership plan '${plan.name}' is in '${plan.status}' status. Only ACTIVE plans can be renewed.`,
          planStatus: plan.status,
          membershipStatus: existingMembership.status,
        });
      }

      // Authoritative Price resolution
      const unitPriceCents = Math.round(plan.price.amount * 100);

      return ApplicationResult.ok<MembershipCommercialDetailsDTO>({
        planId: plan.id.value,
        planCode: plan.code.value,
        planName: plan.name,
        durationDays: plan.duration.durationInDays,
        unitPriceCents,
        currency: plan.price.currency,
        description: `Gym Membership Renewal - ${plan.name}`,
        clientId: effectiveClientId,
        membershipId: existingMembership.id.value,
        isRenewal: true,
        isEligible: true,
        eligibilityReason: 'Membership is eligible for commercial renewal.',
        planStatus: plan.status,
        membershipStatus: existingMembership.status,
      });
    }

    // 2. Otherwise, treat sourceId as a MembershipPlan (New Purchase workflow)
    const plan = await this.planRepository.findById(trimmedSourceId);
    if (!plan) {
      return ApplicationResult.fail(
        `Commercial source with ID '${trimmedSourceId}' was not found as a plan or membership.`,
      );
    }

    const unitPriceCents = Math.round(plan.price.amount * 100);

    // If plan is not ACTIVE, it cannot be sold
    if (plan.status !== PlanStatus.ACTIVE) {
      return ApplicationResult.ok<MembershipCommercialDetailsDTO>({
        planId: plan.id.value,
        planCode: plan.code.value,
        planName: plan.name,
        durationDays: plan.duration.durationInDays,
        unitPriceCents,
        currency: plan.price.currency,
        description: `Gym Membership - ${plan.name}`,
        clientId: clientId?.trim() || null,
        membershipId: null,
        isRenewal: false,
        isEligible: false,
        eligibilityReason: `Membership plan '${plan.name}' is in '${plan.status}' status. Only ACTIVE plans can be sold.`,
        planStatus: plan.status,
        membershipStatus: null,
      });
    }

    // Optional client eligibility check if clientId was provided
    if (clientId && clientId.trim().length > 0) {
      const clientTrimmed = clientId.trim();
      const clientExists = await this.clientLookupPort.validateClientExists(clientTrimmed);
      if (!clientExists) {
        return ApplicationResult.ok<MembershipCommercialDetailsDTO>({
          planId: plan.id.value,
          planCode: plan.code.value,
          planName: plan.name,
          durationDays: plan.duration.durationInDays,
          unitPriceCents,
          currency: plan.price.currency,
          description: `Gym Membership - ${plan.name}`,
          clientId: clientTrimmed,
          membershipId: null,
          isRenewal: false,
          isEligible: false,
          eligibilityReason: `Client '${clientTrimmed}' does not exist or is not eligible for gym memberships.`,
          planStatus: plan.status,
          membershipStatus: null,
        });
      }

      // Check overlap policy for candidate period
      const now = this.clock.now();
      const proposedEnd = plan.duration.calculateEndDate(now);
      const proposedPeriod = MembershipPeriod.create(now, proposedEnd);

      const existingClientMemberships =
        await this.membershipRepository.findByClientId(clientTrimmed);
      const overlapResult = this.overlapPolicy.evaluateOverlap(
        existingClientMemberships,
        proposedPeriod,
      );

      if (overlapResult.hasOverlap) {
        return ApplicationResult.ok<MembershipCommercialDetailsDTO>({
          planId: plan.id.value,
          planCode: plan.code.value,
          planName: plan.name,
          durationDays: plan.duration.durationInDays,
          unitPriceCents,
          currency: plan.price.currency,
          description: `Gym Membership - ${plan.name}`,
          clientId: clientTrimmed,
          membershipId: null,
          isRenewal: false,
          isEligible: false,
          eligibilityReason:
            overlapResult.reason ??
            `Client '${clientTrimmed}' already has an active overlapping membership.`,
          planStatus: plan.status,
          membershipStatus: null,
        });
      }
    }

    return ApplicationResult.ok<MembershipCommercialDetailsDTO>({
      planId: plan.id.value,
      planCode: plan.code.value,
      planName: plan.name,
      durationDays: plan.duration.durationInDays,
      unitPriceCents,
      currency: plan.price.currency,
      description: `Gym Membership - ${plan.name}`,
      clientId: clientId?.trim() || null,
      membershipId: null,
      isRenewal: false,
      isEligible: true,
      eligibilityReason: 'Membership plan is eligible for purchase.',
      planStatus: plan.status,
      membershipStatus: null,
    });
  }
}
