import { MembershipPlan } from '../../domain/plan/membership-plan.aggregate';
import { MembershipPlanDTO } from '../dtos/membership-plan.dto';

export class MembershipPlanMapper {
  public static toDTO(plan: MembershipPlan): MembershipPlanDTO {
    return {
      id: plan.id.value,
      code: plan.code.value,
      name: plan.name,
      description: plan.description,
      durationInDays: plan.duration.durationInDays,
      priceAmount: plan.price.amount,
      priceCurrency: plan.price.currency,
      visitQuota: plan.visitQuota?.maxVisits,
      status: plan.status,
      version: plan.version,
      createdAt: plan.createdAt.toISOString(),
      updatedAt: plan.updatedAt.toISOString(),
    };
  }
}
