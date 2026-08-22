import { CommandHandler } from '../shared/command-handler.interface';
import { ApplicationResult } from '../shared/application-result';
import { UpdateMembershipPlanPricingCommand } from '../commands/update-membership-plan-pricing.command';
import { MembershipPlanDTO } from '../dtos/membership-plan.dto';
import { MembershipPlanMapper } from '../mappers/membership-plan.mapper';
import { MembershipPlanRepository } from '../../domain/repositories/membership-plan.repository';
import { GymEventPublisherPort } from '../ports/gym-event-publisher.port';
import { Clock } from '../../domain/shared/clock';
import { PlanPrice } from '../../domain/plan/plan-price.vo';

export class UpdateMembershipPlanPricingHandler implements CommandHandler<
  UpdateMembershipPlanPricingCommand,
  ApplicationResult<MembershipPlanDTO>
> {
  constructor(
    private readonly planRepository: MembershipPlanRepository,
    private readonly clock: Clock,
    private readonly eventPublisher?: GymEventPublisherPort,
  ) {}

  public async execute(
    command: UpdateMembershipPlanPricingCommand,
  ): Promise<ApplicationResult<MembershipPlanDTO>> {
    try {
      const { input } = command;
      if (!input.planId || input.planId.trim().length === 0) {
        return ApplicationResult.fail('Plan ID cannot be empty.');
      }

      const plan = await this.planRepository.findById(input.planId.trim());
      if (!plan) {
        return ApplicationResult.fail(`Membership plan with ID '${input.planId}' not found.`);
      }

      const newPrice = PlanPrice.create(
        input.newPriceAmount,
        input.currency ?? plan.price.currency,
      );
      plan.updatePricing(newPrice, this.clock.now());

      await this.planRepository.save(plan);

      const events = plan.getUncommittedEvents();
      if (this.eventPublisher && events.length > 0) {
        await this.eventPublisher.publish(events);
      }
      plan.clearEvents();

      return ApplicationResult.ok(MembershipPlanMapper.toDTO(plan));
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return ApplicationResult.fail(message);
    }
  }
}
