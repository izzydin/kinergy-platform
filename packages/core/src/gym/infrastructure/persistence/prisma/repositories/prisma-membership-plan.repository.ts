import { PrismaClient, PlanStatus as PrismaPlanStatus } from '@prisma/client';
import { MembershipPlanRepository } from '../../../../domain/repositories/membership-plan.repository';
import { MembershipPlan } from '../../../../domain/plan/membership-plan.aggregate';
import { PrismaMembershipPlanMapper } from '../mappers/prisma-membership-plan.mapper';

export class PrismaMembershipPlanRepository implements MembershipPlanRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async save(plan: MembershipPlan): Promise<void> {
    const data = PrismaMembershipPlanMapper.toPersistence(plan);

    await this.prisma.membershipPlan.upsert({
      where: { id: data.id },
      create: {
        ...data,
      },
      update: {
        code: data.code,
        name: data.name,
        description: data.description,
        durationDays: data.durationDays,
        priceAmount: data.priceAmount,
        priceCurrency: data.priceCurrency,
        visitQuota: data.visitQuota,
        status: data.status,
        version: { increment: 1 },
      },
    });
  }

  async findById(id: string): Promise<MembershipPlan | null> {
    const raw = await this.prisma.membershipPlan.findUnique({
      where: { id },
    });
    return raw ? PrismaMembershipPlanMapper.toDomain(raw) : null;
  }

  async findByCode(code: string): Promise<MembershipPlan | null> {
    const raw = await this.prisma.membershipPlan.findUnique({
      where: { code },
    });
    return raw ? PrismaMembershipPlanMapper.toDomain(raw) : null;
  }

  async findAll(): Promise<MembershipPlan[]> {
    const list = await this.prisma.membershipPlan.findMany({
      orderBy: { createdAt: 'desc' },
    });
    return list.map(PrismaMembershipPlanMapper.toDomain);
  }

  async findActive(): Promise<MembershipPlan[]> {
    const list = await this.prisma.membershipPlan.findMany({
      where: { status: PrismaPlanStatus.ACTIVE },
      orderBy: { name: 'asc' },
    });
    return list.map(PrismaMembershipPlanMapper.toDomain);
  }
}
