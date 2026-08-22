import { CommandHandler } from '../shared/command-handler.interface';
import { ApplicationResult } from '../shared/application-result';
import { FreezeMembershipCommand } from '../commands/freeze-membership.command';
import { MembershipDTO } from '../dtos/membership.dto';
import { MembershipMapper } from '../mappers/membership.mapper';
import { MembershipRepository } from '../../domain/repositories/membership.repository';
import { GymEventPublisherPort } from '../ports/gym-event-publisher.port';
import { Clock } from '../../domain/shared/clock';
import { FreezeWindow } from '../../domain/membership/freeze-window.vo';

export class FreezeMembershipHandler implements CommandHandler<
  FreezeMembershipCommand,
  ApplicationResult<MembershipDTO>
> {
  constructor(
    private readonly membershipRepository: MembershipRepository,
    private readonly clock: Clock,
    private readonly eventPublisher?: GymEventPublisherPort,
  ) {}

  public async execute(
    command: FreezeMembershipCommand,
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

      const startDate =
        input.startDate instanceof Date ? input.startDate : new Date(input.startDate);
      const endDate = input.endDate instanceof Date ? input.endDate : new Date(input.endDate);

      if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
        return ApplicationResult.fail('Invalid freeze window dates provided.');
      }

      const freezeWindow = FreezeWindow.create(startDate, endDate, input.reason);
      membership.freeze(freezeWindow, this.clock);

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
