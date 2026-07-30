import { Injectable } from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma/client';
import { ClientTimelineRepository } from '../../../domain/repositories/client-timeline.repository';
import { ClientTimelineEntry } from '../../../domain/read-models/client-timeline-entry.entity';
import { ClientId } from '../../../domain/value-objects/client-id.vo';
import { PaginatedResultDto } from '../../../application/dto/paginated-result.dto';

interface PrismaClientProvider {
  getClient?: () => PrismaClient;
}

@Injectable()
export class PrismaClientTimelineRepository implements ClientTimelineRepository {
  constructor(private readonly prisma: PrismaClient) {}

  private get db(): PrismaClient {
    const provider = this.prisma as unknown as PrismaClientProvider;
    if (typeof provider.getClient === 'function') {
      return provider.getClient() as PrismaClient;
    }
    return this.prisma;
  }

  async save(entry: ClientTimelineEntry): Promise<void> {
    await this.db.clientTimelineEntry.create({
      data: {
        id: entry.id,
        clientId: entry.clientId,
        sourceModule: entry.sourceModule,
        eventType: entry.eventType,
        summary: entry.summary,
        metadata: entry.metadata as Prisma.InputJsonValue,
        occurredAt: entry.occurredAt,
      },
    });
  }

  async findByClientId(
    clientId: ClientId,
    page: number,
    limit: number,
  ): Promise<PaginatedResultDto<ClientTimelineEntry>> {
    const safePage = Math.max(1, page ?? 1);
    const safeLimit = Math.max(1, Math.min(100, limit ?? 20));
    const skip = (safePage - 1) * safeLimit;

    const [records, total] = await Promise.all([
      this.db.clientTimelineEntry.findMany({
        where: { clientId: clientId.value },
        orderBy: { occurredAt: 'desc' },
        skip,
        take: safeLimit,
      }),
      this.db.clientTimelineEntry.count({
        where: { clientId: clientId.value },
      }),
    ]);

    const entries = records.map(
      (r) =>
        new ClientTimelineEntry({
          id: r.id,
          clientId: r.clientId,
          sourceModule: r.sourceModule,
          eventType: r.eventType,
          summary: r.summary,
          metadata: (r.metadata ?? {}) as Record<string, unknown>,
          occurredAt: r.occurredAt,
        }),
    );

    return PaginatedResultDto.create(entries, total, safePage, safeLimit);
  }
}
