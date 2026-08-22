import { CommandHandler } from '../shared/command-handler.interface';
import { ApplicationResult } from '../shared/application-result';
import { UnfreezeMembershipCommand } from '../commands/unfreeze-membership.command';
import { MembershipDTO } from '../dtos/membership.dto';
import { MembershipMapper } from '../mappers/membership.mapper';
import { MembershipRepository } from '../../domain/repositories/membership.repository';
import { GymEventPublisherPort } from '../ports/gym-event-publisher.port';
import { Clock } from '../../domain/shared/clock';

export class UnfreezeMembershipHandler implements CommandHandler<
  UnfreezeMembershipCommand,
  ApplicationResult<MembershipDTO>
> {
  constructor(
    private readonly membershipRepository: MembershipRepository,
    private readonly clock: Clock,
    private readonly eventPublisher?: GymEventPublisherPort,
  ) {}

  public async execute(
    command: UnfreezeMembershipCommand,
  ): Promise<ApplicationResult<MembershipDTO>> {
    try {
      const { input } = command;
      if (!input.membershipId || input.membershipId.trim().length === 0) {
        return ApplicationResult.fail('Membership ID cannot be empty.');
      }

      const membership = await this.membershipRepository.findById(input.membershipId.trim());
      if (!membership) {
        return ApplicationResult.fail(`Membership with ID '${input.membershipId}' not found.`);
      }

      membership.unfreeze(this.clock);

      await this.membershipRepository.save(membership);

      const events = membership.getUncommittedEvents();
      if (this.eventPublisher && events.length > 0) {
        await this.eventPublisher.publish(events);
      }
      membership.clearEvents();

      return ApplicationResult.ok(MembershipMapper.toDTO(membership));
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return ApplicationResult.fail(message);
    }
  }
}
