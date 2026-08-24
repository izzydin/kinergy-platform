import {
  MembershipPlan as PrismaMembershipPlanModel,
  PlanStatus as PrismaPlanStatus,
  Prisma,
} from '@prisma/client';
import { MembershipPlan } from '../../../../domain/plan/membership-plan.aggregate';
import { PlanId } from '../../../../domain/plan/plan-id.vo';
import { PlanCode } from '../../../../domain/plan/plan-code.vo';
import { PlanPrice } from '../../../../domain/plan/plan-price.vo';
import { PlanDuration } from '../../../../domain/plan/plan-duration.vo';
import { PlanStatus } from '../../../../domain/plan/plan-status.enum';
import { VisitQuota } from '../../../../domain/plan/visit-quota.vo';

export class PrismaMembershipPlanMapper {
  public static toDomain(raw: PrismaMembershipPlanModel): MembershipPlan {
    return MembershipPlan.reconstitute({
      id: PlanId.create(raw.id),
      code: PlanCode.create(raw.code),
      name: raw.name,
      description: raw.description ?? undefined,
      duration: PlanDuration.ofDays(raw.durationDays),
      price: PlanPrice.create(Number(raw.priceAmount), raw.priceCurrency),
      visitQuota: raw.visitQuota !== null ? VisitQuota.of(raw.visitQuota) : undefined,
      status: raw.status as unknown as PlanStatus,
      version: raw.version,
      createdAt: raw.createdAt,
      updatedAt: raw.updatedAt,
    });
  }

  public static toPersistence(
    plan: MembershipPlan,
  ): Omit<PrismaMembershipPlanModel, 'createdAt' | 'updatedAt'> {
    return {
      id: plan.id.getValue(),
      code: plan.code.value,
      name: plan.name,
      description: plan.description ?? null,
      durationDays: plan.duration.value,
      priceAmount: new Prisma.Decimal(plan.price.amount),
      priceCurrency: plan.price.currency,
      visitQuota: plan.visitQuota?.value ?? null,
      status: plan.status as unknown as PrismaPlanStatus,
      version: plan.version,
    };
  }
}
