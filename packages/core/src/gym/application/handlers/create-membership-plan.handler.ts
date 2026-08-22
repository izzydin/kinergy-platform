import { CommandHandler } from '../shared/command-handler.interface';
import { ApplicationResult } from '../shared/application-result';
import { CreateMembershipPlanCommand } from '../commands/create-membership-plan.command';
import { MembershipPlanDTO } from '../dtos/membership-plan.dto';
import { MembershipPlanMapper } from '../mappers/membership-plan.mapper';
import { MembershipPlanRepository } from '../../domain/repositories/membership-plan.repository';
import { GymEventPublisherPort } from '../ports/gym-event-publisher.port';
import { Clock } from '../../domain/shared/clock';
import { MembershipPlan } from '../../domain/plan/membership-plan.aggregate';
import { PlanId } from '../../domain/plan/plan-id.vo';
import { PlanCode } from '../../domain/plan/plan-code.vo';
import { PlanDuration } from '../../domain/plan/plan-duration.vo';
import { PlanPrice } from '../../domain/plan/plan-price.vo';
import { VisitQuota } from '../../domain/plan/visit-quota.vo';

export class CreateMembershipPlanHandler implements CommandHandler<
  CreateMembershipPlanCommand,
  ApplicationResult<MembershipPlanDTO>
> {
  constructor(
    private readonly planRepository: MembershipPlanRepository,
    private readonly clock: Clock,
    private readonly eventPublisher?: GymEventPublisherPort,
  ) {}

  public async execute(
    command: CreateMembershipPlanCommand,
  ): Promise<ApplicationResult<MembershipPlanDTO>> {
    try {
      const { input } = command;

      const codeVo = PlanCode.create(input.code);
      const existingByCode = await this.planRepository.findByCode(codeVo);
      if (existingByCode) {
        return ApplicationResult.fail(`Membership plan with code '${input.code}' already exists.`);
      }

      const planId = input.customId ? PlanId.create(input.customId) : PlanId.create();
      const durationVo = PlanDuration.ofDays(input.durationInDays);
      const priceVo = PlanPrice.create(input.priceAmount, input.priceCurrency ?? 'USD');
      const visitQuotaVo = input.visitQuota ? VisitQuota.of(input.visitQuota) : undefined;

      const plan = MembershipPlan.create(
        {
          id: planId,
          code: codeVo,
          name: input.name,
          description: input.description,
          duration: durationVo,
          price: priceVo,
          visitQuota: visitQuotaVo,
          createdAt: this.clock.now(),
        },
        this.clock.now(),
      );

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
