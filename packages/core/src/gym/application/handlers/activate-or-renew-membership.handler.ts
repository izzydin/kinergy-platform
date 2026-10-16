import { CommandHandler } from '../shared/command-handler.interface';
import { ApplicationResult } from '../shared/application-result';
import { ActivateOrRenewMembershipCommand } from '../commands/activate-or-renew-membership.command';
import {
  ActivateOrRenewMembershipInput,
  ActivateOrRenewMembershipResult,
  GymMembershipActivationPort,
} from '../ports/gym-membership-activation.port';
import {
  GymFulfillmentStorePort,
  InMemoryGymFulfillmentStore,
} from '../ports/gym-fulfillment-store.port';
import { MembershipRepository } from '../../domain/repositories/membership.repository';
import { MembershipPlanRepository } from '../../domain/repositories/membership-plan.repository';
import { ClientLookupPort } from '../ports/client-lookup.port';
import { GymEventPublisherPort } from '../ports/gym-event-publisher.port';
import { Clock } from '../../domain/shared/clock';
import { MembershipOverlapPolicy } from '../../domain/policies/membership-overlap.policy';
import { Membership } from '../../domain/membership/membership.aggregate';
import { MembershipId } from '../../domain/membership/membership-id.vo';
import { MembershipPeriod } from '../../domain/membership/membership-period.vo';
import { MembershipStatus } from '../../domain/membership/membership-status.enum';
import { TrainerAssignment } from '../../domain/membership/trainer-assignment.vo';
import { MembershipMapper } from '../mappers/membership.mapper';
import { PlanStatus } from '../../domain/plan/plan-status.enum';

/**
 * Authoritative Commercial Orchestrator and Capability Port implementation
 * fulfilling Gym Membership purchases and renewals initiated by the Sales bounded context.
 *
 * Requirements Guarantee:
 * 1. Billable Identity: Idempotency is keyed on commercial paymentRef (Sale ID).
 * 2. Deduplication vs. Re-renewal: Retrying with the same paymentRef returns the previous result (wasReplay: true)
 *    without double date extension or duplicate events. Subsequent legitimate renewals use a new paymentRef.
 * 3. Contract Decoupling: Never assumes membershipId alone identifies a sale.
 * 4. Lifecycle Integrity: Enforces domain rules for ACTIVE, EXPIRED, FROZEN, CANCELLED, and TERMINATED states.
 */
export class ActivateOrRenewMembershipHandler
  implements
    CommandHandler<
      ActivateOrRenewMembershipCommand,
      ApplicationResult<ActivateOrRenewMembershipResult>
    >,
    GymMembershipActivationPort
{
  private readonly overlapPolicy: MembershipOverlapPolicy;
  private readonly fulfillmentStore: GymFulfillmentStorePort;

  constructor(
    private readonly membershipRepository: MembershipRepository,
    private readonly membershipPlanRepository: MembershipPlanRepository,
    private readonly clientLookupPort: ClientLookupPort,
    private readonly clock: Clock,
    private readonly eventPublisher?: GymEventPublisherPort,
    fulfillmentStore?: GymFulfillmentStorePort,
    overlapPolicy?: MembershipOverlapPolicy,
  ) {
    this.fulfillmentStore = fulfillmentStore ?? new InMemoryGymFulfillmentStore();
    this.overlapPolicy = overlapPolicy ?? new MembershipOverlapPolicy();
  }

  /**
   * Implements the GymMembershipActivationPort interface for in-process Sales fulfillment.
   */
  public async activateOrRenew(
    input: ActivateOrRenewMembershipInput,
  ): Promise<ActivateOrRenewMembershipResult> {
    const command = new ActivateOrRenewMembershipCommand(input);
    const result = await this.execute(command);
    if (result.isFailure) {
      return {
        isSuccess: false,
        isFailure: true,
        errorMessage: result.getError(),
      };
    }
    return result.getValue();
  }

  /**
   * Executes commercial fulfillment orchestration.
   */
  public async execute(
    command: ActivateOrRenewMembershipCommand,
  ): Promise<ApplicationResult<ActivateOrRenewMembershipResult>> {
    try {
      const { input } = command;

      // 1. Validate mandatory commercial inputs
      const paymentRef = input.paymentRef?.trim();
      const clientId = input.clientId?.trim();
      const planId = input.planId?.trim();

      if (!paymentRef) {
        return ApplicationResult.fail('Commercial payment reference (paymentRef) is required.');
      }
      if (!clientId) {
        return ApplicationResult.fail('Client ID is required.');
      }
      if (!planId) {
        return ApplicationResult.fail('Plan ID is required.');
      }

      // 2. Idempotency Check: Distinguish retry of same transaction from new renewal
      const existingFulfillment = await this.fulfillmentStore.findByPaymentRef(paymentRef);
      if (existingFulfillment) {
        return ApplicationResult.ok<ActivateOrRenewMembershipResult>({
          isSuccess: true,
          isFailure: false,
          wasReplay: true,
          action: existingFulfillment.action,
          membership: existingFulfillment.snapshotDTO,
        });
      }

      // 3. Client Validation via External Port
      const clientExists = await this.clientLookupPort.validateClientExists(clientId);
      if (!clientExists) {
        return ApplicationResult.fail(
          `Client '${clientId}' does not exist or is not eligible for gym memberships.`,
        );
      }

      // 4. Commercial Plan Resolution
      const plan = await this.membershipPlanRepository.findById(planId);
      if (!plan) {
        return ApplicationResult.fail(`Membership plan with id '${planId}' not found.`);
      }

      if (plan.status !== PlanStatus.ACTIVE) {
        return ApplicationResult.fail(
          `Membership plan '${plan.code.value}' is not active or available for sale (status: ${plan.status}).`,
        );
      }

      const now = input.effectiveDate
        ? input.effectiveDate instanceof Date
          ? input.effectiveDate
          : new Date(input.effectiveDate)
        : this.clock.now();

      if (isNaN(now.getTime())) {
        return ApplicationResult.fail(`Invalid effectiveDate '${String(input.effectiveDate)}'.`);
      }

      // 5. Determine whether this is a Renewal or Initial Purchase
      let targetMembership: Membership | null = null;

      if (input.membershipId && input.membershipId.trim().length > 0) {
        // Explicit renewal target provided
        const memId = input.membershipId.trim();
        targetMembership = await this.membershipRepository.findById(memId);
        if (!targetMembership) {
          return ApplicationResult.fail(`Membership with id '${memId}' not found.`);
        }
        if (targetMembership.clientId !== clientId) {
          return ApplicationResult.fail(`Client '${clientId}' does not own membership '${memId}'.`);
        }
      } else {
        // Check if client has an existing renewable membership (ACTIVE or EXPIRED) for this plan
        const clientMemberships = await this.membershipRepository.findByClientId(clientId);
        const renewable = clientMemberships.find(
          (m) =>
            m.planId === plan.id.value &&
            (m.status === MembershipStatus.ACTIVE || m.status === MembershipStatus.EXPIRED),
        );
        if (renewable) {
          targetMembership = renewable;
        }
      }

      if (targetMembership) {
        // --- Execute Renewal Workflow ---
        if (
          targetMembership.status === MembershipStatus.CANCELLED ||
          targetMembership.status === MembershipStatus.TERMINATED
        ) {
          return ApplicationResult.fail(
            `Cannot renew membership '${targetMembership.id.value}' in '${targetMembership.status}' terminal status.`,
          );
        }

        if (targetMembership.status === MembershipStatus.FROZEN) {
          return ApplicationResult.fail(
            `Cannot renew membership '${targetMembership.id.value}' in FROZEN status. Membership must be resumed before renewal.`,
          );
        }

        if (
          targetMembership.status !== MembershipStatus.ACTIVE &&
          targetMembership.status !== MembershipStatus.EXPIRED
        ) {
          return ApplicationResult.fail(
            `Only ACTIVE or EXPIRED memberships can be renewed (current: ${targetMembership.status}).`,
          );
        }

        // Calculate renewal period based on ADR-0061 semantics
        let renewalPeriod: MembershipPeriod;
        if (
          targetMembership.status === MembershipStatus.ACTIVE &&
          now.getTime() <= targetMembership.period.endDate.getTime()
        ) {
          // On-time or early renewal: extend gaplessly from existing endDate
          const additionalStart = targetMembership.period.endDate;
          const additionalEnd = plan.duration.calculateEndDate(additionalStart);
          renewalPeriod = MembershipPeriod.create(additionalStart, additionalEnd);
        } else {
          // Lapsed or post-expiration renewal: reset start from effective payment instant
          const renewalStart = now;
          const renewalEnd = plan.duration.calculateEndDate(renewalStart);
          renewalPeriod = MembershipPeriod.create(renewalStart, renewalEnd);
        }

        // Overlap verification across client's other agreements
        const allClientMemberships = await this.membershipRepository.findByClientId(clientId);
        const otherMemberships = allClientMemberships.filter(
          (m) => !m.id.equals(targetMembership!.id),
        );

        // Project new full period after renewal
        const projectedFullPeriod =
          targetMembership.status === MembershipStatus.ACTIVE &&
          now.getTime() <= targetMembership.period.endDate.getTime()
            ? MembershipPeriod.create(targetMembership.period.startDate, renewalPeriod.endDate)
            : renewalPeriod;

        const overlapResult = this.overlapPolicy.evaluateOverlap(
          otherMemberships,
          projectedFullPeriod,
        );
        if (overlapResult.hasOverlap) {
          return ApplicationResult.fail(
            overlapResult.reason ??
              `Renewal creates an overlap with another membership of client '${clientId}'.`,
          );
        }

        // Domain Mutation: In-place renewal
        targetMembership.renew(renewalPeriod, this.clock, plan.id.value);

        // Atomic Persistence
        await this.membershipRepository.save(targetMembership);

        // Event Dispatching
        if (this.eventPublisher) {
          const events = targetMembership.pullEvents();
          if (events.length > 0) {
            await this.eventPublisher.publish(events);
          }
        }

        const dto = MembershipMapper.toDTO(targetMembership);

        // Record Fulfillment Idempotency
        await this.fulfillmentStore.recordFulfillment({
          paymentRef,
          membershipId: targetMembership.id.value,
          clientId,
          planId: plan.id.value,
          action: 'RENEWED',
          membershipVersion: targetMembership.version,
          periodStart: targetMembership.period.startDate.toISOString(),
          periodEnd: targetMembership.period.endDate.toISOString(),
          processedAt: now,
          snapshotDTO: dto,
        });

        return ApplicationResult.ok<ActivateOrRenewMembershipResult>({
          isSuccess: true,
          isFailure: false,
          wasReplay: false,
          action: 'RENEWED',
          membership: dto,
        });
      }

      // --- Execute Initial Purchase Workflow ---
      const startDate = now;
      const endDate = plan.duration.calculateEndDate(startDate);
      const period = MembershipPeriod.create(startDate, endDate);

      // Overlap evaluation
      const existingMemberships = await this.membershipRepository.findByClientId(clientId);
      const overlapResult = this.overlapPolicy.evaluateOverlap(existingMemberships, period);
      if (overlapResult.hasOverlap) {
        return ApplicationResult.fail(
          overlapResult.reason ??
            `Client '${clientId}' already has an active or overlapping membership for this period.`,
        );
      }

      // Domain Aggregate Instantiation
      const membershipId = input.customId
        ? MembershipId.create(input.customId)
        : MembershipId.create();

      const trainerAssignment = input.assignedTrainerId
        ? TrainerAssignment.create(input.assignedTrainerId, startDate)
        : null;

      const newMembership = Membership.create({
        id: membershipId,
        clientId,
        planId: plan.id.value,
        period,
        trainerAssignment,
        status: MembershipStatus.ACTIVE,
      });

      // Atomic Persistence
      await this.membershipRepository.save(newMembership);

      // Event Dispatching
      if (this.eventPublisher) {
        const events = newMembership.pullEvents();
        if (events.length > 0) {
          await this.eventPublisher.publish(events);
        }
      }

      const dto = MembershipMapper.toDTO(newMembership);

      // Record Fulfillment Idempotency
      await this.fulfillmentStore.recordFulfillment({
        paymentRef,
        membershipId: newMembership.id.value,
        clientId,
        planId: plan.id.value,
        action: 'PURCHASED',
        membershipVersion: newMembership.version,
        periodStart: newMembership.period.startDate.toISOString(),
        periodEnd: newMembership.period.endDate.toISOString(),
        processedAt: now,
        snapshotDTO: dto,
      });

      return ApplicationResult.ok<ActivateOrRenewMembershipResult>({
        isSuccess: true,
        isFailure: false,
        wasReplay: false,
        action: 'PURCHASED',
        membership: dto,
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return ApplicationResult.fail(message);
    }
  }
}
