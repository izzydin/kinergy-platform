import { PrismaClient, MembershipStatus as PrismaMembershipStatus, Prisma } from '@prisma/client';
import { MembershipRepository } from '../../../../domain/repositories/membership.repository';
import { Membership } from '../../../../domain/membership/membership.aggregate';
import { PrismaMembershipMapper } from '../mappers/prisma-membership.mapper';

function normalizeSearchText(text: string): string {
  return (text || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

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

  async search(query: string): Promise<Membership[]> {
    const trimmed = query.trim();
    if (!trimmed) {
      return this.findAll();
    }

    const normalizedQuery = normalizeSearchText(trimmed);
    const terms = trimmed.split(/\s+/).filter(Boolean);

    // Look up client candidates matching UUID, reference number, multi-term name, or accent-normalized name
    const matchingClients = await this.prisma.client.findMany({
      where: {
        OR: [
          { id: { contains: trimmed, mode: 'insensitive' } },
          { referenceNumber: { contains: trimmed, mode: 'insensitive' } },
          { normalizedSearchName: { contains: normalizedQuery } },
          {
            AND: terms.map((term) => {
              const normTerm = normalizeSearchText(term);
              return {
                OR: [
                  { firstName: { contains: term, mode: 'insensitive' } },
                  { firstName: { contains: normTerm, mode: 'insensitive' } },
                  { lastName: { contains: term, mode: 'insensitive' } },
                  { lastName: { contains: normTerm, mode: 'insensitive' } },
                  { referenceNumber: { contains: term, mode: 'insensitive' } },
                  { normalizedSearchName: { contains: normTerm } },
                ],
              };
            }),
          },
        ],
      },
      select: { id: true },
      take: 100,
    });

    const clientIds = matchingClients.map((c) => c.id);

    const list = await this.prisma.membership.findMany({
      where: {
        OR: [
          ...(clientIds.length > 0 ? [{ clientId: { in: clientIds } }] : []),
          { clientId: { contains: trimmed, mode: 'insensitive' } },
          { id: { contains: trimmed, mode: 'insensitive' } },
        ],
      },
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
