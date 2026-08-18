import { CommandHandler } from '../shared/command-handler.interface';
import { ApplicationResult } from '../shared/application-result';
import { RenewMembershipCommand } from '../commands/renew-membership.command';
import { MembershipDTO } from '../dtos/membership.dto';
import { MembershipMapper } from '../mappers/membership.mapper';
import { MembershipRepository } from '../../domain/repositories/membership.repository';
import { MembershipPlanRepository } from '../../domain/repositories/membership-plan.repository';
import { GymEventPublisherPort } from '../ports/gym-event-publisher.port';
import { Clock } from '../../domain/shared/clock';
import { MembershipPeriod } from '../../domain/membership/membership-period.vo';
import { MembershipStatus } from '../../domain/membership/membership-status.enum';
import { MembershipOverlapPolicy } from '../../domain/policies/membership-overlap.policy';

/**
 * Use case handler orchestrating the commercial renewal of an existing gym Membership.
 *
 * Responsibilities:
 * 1. Loads Membership aggregate root and verifies existence.
 * 2. Loads selected MembershipPlan (current plan or new upgrade/downgrade plan) and validates availability.
 * 3. Authoritatively obtains current time via Clock and computes renewal period.
 * 4. Invokes domain renewal behavior on aggregate root.
 * 5. Evaluates MembershipOverlapPolicy across other memberships of the client.
 * 6. Atomically persists renewed aggregate and publishes domain events.
 * 7. Returns resulting MembershipDTO.
 */
export class RenewMembershipHandler implements CommandHandler<
  RenewMembershipCommand,
  ApplicationResult<MembershipDTO>
> {
  private readonly overlapPolicy: MembershipOverlapPolicy;

  constructor(
    private readonly membershipRepository: MembershipRepository,
    private readonly membershipPlanRepository: MembershipPlanRepository,
    private readonly clock: Clock,
    private readonly eventPublisher?: GymEventPublisherPort,
    overlapPolicy?: MembershipOverlapPolicy,
  ) {
    this.overlapPolicy = overlapPolicy ?? new MembershipOverlapPolicy();
  }

  public async execute(command: RenewMembershipCommand): Promise<ApplicationResult<MembershipDTO>> {
    try {
      const { input } = command;

      // 1. Basic input integrity check
      const membershipId = input.membershipId?.trim();
      if (!membershipId) {
        return ApplicationResult.fail('Membership ID is required.');
      }

      // 2. Load and validate Membership existence
      const membership = await this.membershipRepository.findById(membershipId);
      if (!membership) {
        return ApplicationResult.fail(`Membership with id '${membershipId}' not found.`);
      }

      // 3. Load and validate target MembershipPlan
      const targetPlanId = input.newPlanId?.trim() || membership.planId;
      const plan = await this.membershipPlanRepository.findById(targetPlanId);
      if (!plan) {
        return ApplicationResult.fail(`Membership plan with id '${targetPlanId}' not found.`);
      }

      if (!plan.isAvailableForPurchase()) {
        return ApplicationResult.fail(
          `Membership plan '${plan.code.value}' is not active or available for renewal (status: ${plan.status}).`,
        );
      }

      // 4. Determine authoritative current time
      let now: Date;
      if (input.effectiveDate) {
        now =
          input.effectiveDate instanceof Date ? input.effectiveDate : new Date(input.effectiveDate);
        if (isNaN(now.getTime())) {
          return ApplicationResult.fail(`Invalid effectiveDate '${String(input.effectiveDate)}'.`);
        }
      } else {
        now = this.clock.now();
      }

      // 5. Calculate additional renewal period based on ADR-0061 semantics
      let renewalPeriod: MembershipPeriod;
      if (
        membership.status === MembershipStatus.ACTIVE &&
        now.getTime() <= membership.period.endDate.getTime()
      ) {
        // Early or boundary renewal: extend from existing endDate
        const additionalStart = membership.period.endDate;
        const additionalEnd = plan.duration.calculateEndDate(additionalStart);
        renewalPeriod = MembershipPeriod.create(additionalStart, additionalEnd);
      } else {
        // Lapsed or post-expiration renewal: start from effective now
        const renewalStart = now;
        const renewalEnd = plan.duration.calculateEndDate(renewalStart);
        renewalPeriod = MembershipPeriod.create(renewalStart, renewalEnd);
      }

      // 6. Execute Domain Renewal Behavior
      membership.renew(renewalPeriod, this.clock, input.newPlanId);

      // 7. Enforce Cross-Membership Overlap Invariants (Phase 5.3-E)
      const clientMemberships = await this.membershipRepository.findByClientId(membership.clientId);
      const otherMemberships = clientMemberships.filter((m) => !m.id.equals(membership.id));
      const overlapResult = this.overlapPolicy.evaluateOverlap(otherMemberships, membership.period);

      if (overlapResult.hasOverlap) {
        return ApplicationResult.fail(
          overlapResult.reason ??
            `Renewed membership overlaps with another active membership for client '${membership.clientId}'.`,
        );
      }

      // 8. Atomic Persistence
      await this.membershipRepository.save(membership);

      // 9. Dispatch uncommitted domain events
      if (this.eventPublisher) {
        const events = membership.pullEvents();
        if (events.length > 0) {
          await this.eventPublisher.publish(events);
        }
      }

      // 10. Return mapped DTO
      return ApplicationResult.ok(MembershipMapper.toDTO(membership));
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return ApplicationResult.fail(message);
    }
  }
}
