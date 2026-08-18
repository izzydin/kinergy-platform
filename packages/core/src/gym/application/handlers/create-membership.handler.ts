import { CommandHandler } from '../shared/command-handler.interface';
import { ApplicationResult } from '../shared/application-result';
import { CreateMembershipCommand } from '../commands/create-membership.command';
import { MembershipDTO } from '../dtos/membership.dto';
import { MembershipMapper } from '../mappers/membership.mapper';
import { MembershipRepository } from '../../domain/repositories/membership.repository';
import { MembershipPlanRepository } from '../../domain/repositories/membership-plan.repository';
import { ClientLookupPort } from '../ports/client-lookup.port';
import { GymEventPublisherPort } from '../ports/gym-event-publisher.port';
import { Clock } from '../../domain/shared/clock';
import { Membership } from '../../domain/membership/membership.aggregate';
import { MembershipId } from '../../domain/membership/membership-id.vo';
import { MembershipPeriod } from '../../domain/membership/membership-period.vo';
import { MembershipStatus } from '../../domain/membership/membership-status.enum';
import { TrainerAssignment } from '../../domain/membership/trainer-assignment.vo';

/**
 * Use case handler orchestrating the creation of a new gym Membership for a validated Client.
 *
 * Responsibilities:
 * 1. Validates external client reference via ClientLookupPort (zero cross-context coupling).
 * 2. Loads MembershipPlan and verifies commercial catalog availability.
 * 3. Authoritatively calculates MembershipPeriod from plan duration.
 * 4. Instantiates Membership aggregate root with domain invariant enforcement.
 * 5. Atomically persists membership and dispatches domain events.
 */
export class CreateMembershipHandler implements CommandHandler<
  CreateMembershipCommand,
  ApplicationResult<MembershipDTO>
> {
  constructor(
    private readonly membershipRepository: MembershipRepository,
    private readonly membershipPlanRepository: MembershipPlanRepository,
    private readonly clientLookupPort: ClientLookupPort,
    private readonly clock: Clock,
    private readonly eventPublisher?: GymEventPublisherPort,
  ) {}

  public async execute(
    command: CreateMembershipCommand,
  ): Promise<ApplicationResult<MembershipDTO>> {
    try {
      const { input } = command;

      // 1. Basic input integrity check
      const clientId = input.clientId?.trim();
      const planId = input.planId?.trim();

      if (!clientId) {
        return ApplicationResult.fail('Client ID is required.');
      }
      if (!planId) {
        return ApplicationResult.fail('Plan ID is required.');
      }

      // 2. Validate client existence via Port
      const clientExists = await this.clientLookupPort.validateClientExists(clientId);
      if (!clientExists) {
        return ApplicationResult.fail(
          `Client with id '${clientId}' does not exist or is not eligible for gym membership.`,
        );
      }

      // 3. Load and validate commercial MembershipPlan
      const plan = await this.membershipPlanRepository.findById(planId);
      if (!plan) {
        return ApplicationResult.fail(`Membership plan with id '${planId}' not found.`);
      }

      if (!plan.isAvailableForPurchase()) {
        return ApplicationResult.fail(
          `Membership plan '${plan.code.value}' is not active or available for new memberships (status: ${plan.status}).`,
        );
      }

      // 4. Calculate MembershipPeriod deterministically
      let startDate: Date;
      if (input.startDate) {
        startDate = input.startDate instanceof Date ? input.startDate : new Date(input.startDate);
        if (isNaN(startDate.getTime())) {
          return ApplicationResult.fail(`Invalid startDate '${String(input.startDate)}'.`);
        }
      } else {
        startDate = this.clock.now();
      }

      const endDate = plan.duration.calculateEndDate(startDate);
      const period = MembershipPeriod.create(startDate, endDate);

      // 5. Construct Aggregate Root
      const membershipId = input.customId ? MembershipId.create(input.customId) : undefined;
      const status = input.status ? (input.status as MembershipStatus) : undefined;
      const trainerAssignment = input.assignedTrainerId
        ? TrainerAssignment.create(input.assignedTrainerId, startDate)
        : undefined;

      const membership = Membership.create({
        id: membershipId,
        clientId,
        planId: plan.id.value,
        period,
        trainerAssignment,
        status,
      });

      // 6. Atomic Persistence
      await this.membershipRepository.save(membership);

      // 7. Publish uncommitted domain events
      if (this.eventPublisher) {
        const events = membership.getUncommittedEvents();
        if (events.length > 0) {
          await this.eventPublisher.publish(events);
          membership.clearEvents();
        }
      }

      // 8. Return mapped DTO
      return ApplicationResult.ok(MembershipMapper.toDTO(membership));
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return ApplicationResult.fail(message);
    }
  }
}
