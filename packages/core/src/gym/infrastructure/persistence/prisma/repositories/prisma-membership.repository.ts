import { PrismaClient, MembershipStatus as PrismaMembershipStatus, Prisma } from '@prisma/client';
import { MembershipRepository } from '../../../../domain/repositories/membership.repository';
import { Membership } from '../../../../domain/membership/membership.aggregate';
import { PrismaMembershipMapper } from '../mappers/prisma-membership.mapper';

export class PrismaMembershipRepository implements MembershipRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async save(membership: Membership): Promise<void> {
    const data = PrismaMembershipMapper.toPersistence(membership);

    await this.prisma.membership.upsert({
      where: { id: data.id },
      create: {
        ...data,
        freezeHistory: data.freezeHistory as Prisma.InputJsonValue,
      },
      update: {
        clientId: data.clientId,
        planId: data.planId,
        status: data.status,
        startDate: data.startDate,
        endDate: data.endDate,
        assignedTrainerId: data.assignedTrainerId,
        freezeHistory: data.freezeHistory as Prisma.InputJsonValue,
        cancellationReason: data.cancellationReason,
        terminationReason: data.terminationReason,
        version: { increment: 1 },
      },
    });
  }

  async findById(id: string): Promise<Membership | null> {
    const raw = await this.prisma.membership.findUnique({
      where: { id },
    });
    return raw ? PrismaMembershipMapper.toDomain(raw) : null;
  }

  async findByClientId(clientId: string): Promise<Membership[]> {
    const list = await this.prisma.membership.findMany({
      where: { clientId },
      orderBy: { createdAt: 'desc' },
    });
    return list.map(PrismaMembershipMapper.toDomain);
  }

  async findAll(): Promise<Membership[]> {
    const list = await this.prisma.membership.findMany({
      orderBy: { createdAt: 'desc' },
    });
    return list.map(PrismaMembershipMapper.toDomain);
  }

  async findExpiringCandidates(asOf: Date): Promise<Membership[]> {
    const list = await this.prisma.membership.findMany({
      where: {
        status: { in: [PrismaMembershipStatus.ACTIVE, PrismaMembershipStatus.FROZEN] },
        endDate: { lte: asOf },
      },
    });
    return list.map(PrismaMembershipMapper.toDomain);
  }

  async findExpiringWithinHorizon(asOf: Date, horizonDays: number): Promise<Membership[]> {
    const horizonEnd = new Date(asOf.getTime() + horizonDays * 24 * 60 * 60 * 1000);
    const list = await this.prisma.membership.findMany({
      where: {
        status: { in: [PrismaMembershipStatus.ACTIVE, PrismaMembershipStatus.FROZEN] },
        endDate: {
          gt: asOf,
          lte: horizonEnd,
        },
      },
      orderBy: { endDate: 'asc' },
    });
    return list.map(PrismaMembershipMapper.toDomain);
  }

  async findByTrainerId(trainerId: string): Promise<Membership[]> {
    const list = await this.prisma.membership.findMany({
      where: { assignedTrainerId: trainerId },
      orderBy: { createdAt: 'desc' },
    });
    return list.map(PrismaMembershipMapper.toDomain);
  }
}
