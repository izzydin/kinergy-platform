import { PrismaClient } from '@prisma/client';
import { ClientTimelineEntry } from '../../../../domain/read-models/client-timeline-entry.entity';
import { ClientId } from '../../../../domain/value-objects/client-id.vo';
import { PrismaClientTimelineRepository } from '../prisma-client-timeline.repository';

type TimelineRow = {
  id: string;
  clientId: string;
  sourceModule: string;
  eventType: string;
  summary: string;
  metadata: Record<string, unknown>;
  occurredAt: Date;
  createdAt: Date;
};

// Valid UUIDs required by ClientId.create()
const CLIENT_UUID = 'a1b2c3d4-e5f6-4789-8012-abcdef123456';
const CLIENT_UUID_2 = 'b2c3d4e5-f6a7-4890-9123-bcdef1234567';
const OTHER_CLIENT_UUID = 'c3d4e5f6-a7b8-4901-a234-cdef12345678';
const UNKNOWN_CLIENT_UUID = 'd4e5f6a7-b8c9-4012-8345-def123456789';

describe('PrismaClientTimelineRepository Integration Tests', () => {
  let repository: PrismaClientTimelineRepository;
  let mockPrismaClient: jest.Mocked<PrismaClient>;
  let timelineStore: TimelineRow[];

  beforeEach(() => {
    timelineStore = [];

    mockPrismaClient = {
      clientTimelineEntry: {
        create: jest.fn().mockImplementation(async ({ data }) => {
          const row: TimelineRow = {
            id: data.id,
            clientId: data.clientId,
            sourceModule: data.sourceModule,
            eventType: data.eventType,
            summary: data.summary,
            metadata: data.metadata ?? {},
            occurredAt: data.occurredAt,
            createdAt: new Date(),
          };
          timelineStore.push(row);
          return row;
        }),
        findMany: jest.fn().mockImplementation(async ({ where, skip, take }) => {
          let results = timelineStore.filter((r) => r.clientId === where.clientId);

          // Sort by occurredAt DESC, id DESC (matching Prisma behaviour)
          results = results.sort((a, b) => {
            const timeDiff = b.occurredAt.getTime() - a.occurredAt.getTime();
            if (timeDiff !== 0) return timeDiff;
            return b.id.localeCompare(a.id);
          });

          return results.slice(skip ?? 0, (skip ?? 0) + (take ?? results.length));
        }),
        count: jest.fn().mockImplementation(async ({ where }) => {
          return timelineStore.filter((r) => r.clientId === where.clientId).length;
        }),
      },
    } as unknown as jest.Mocked<PrismaClient>;

    repository = new PrismaClientTimelineRepository(mockPrismaClient);
  });

  describe('save()', () => {
    it('should insert a new timeline entry into the database', async () => {
      const entry = ClientTimelineEntry.create({
        clientId: CLIENT_UUID,
        sourceModule: 'CLIENT',
        eventType: 'CLIENT_CREATED',
        summary: 'Client account registered',
        metadata: { referenceNumber: 'CLI-2026-00001' },
        occurredAt: new Date('2026-07-30T10:00:00Z'),
      });

      await repository.save(entry);

      expect(mockPrismaClient.clientTimelineEntry.create).toHaveBeenCalledTimes(1);
      expect(timelineStore).toHaveLength(1);
      expect(timelineStore[0]!.eventType).toBe('CLIENT_CREATED');
      expect(timelineStore[0]!.clientId).toBe(CLIENT_UUID);
      expect(timelineStore[0]!.sourceModule).toBe('CLIENT');
    });

    it('should persist metadata as a JSON object', async () => {
      const entry = ClientTimelineEntry.create({
        clientId: CLIENT_UUID_2,
        sourceModule: 'CLIENT',
        eventType: 'CLIENT_UPDATED',
        summary: 'Client details updated',
        metadata: { updatedFields: ['name', 'email'] },
        occurredAt: new Date(),
      });

      await repository.save(entry);

      expect(timelineStore[0]!.metadata).toEqual({ updatedFields: ['name', 'email'] });
    });
  });

  describe('findByClientId()', () => {
    beforeEach(async () => {
      // Seed 3 entries with distinct timestamps in ASCENDING order
      const entries = [
        ClientTimelineEntry.create({
          clientId: CLIENT_UUID,
          sourceModule: 'CLIENT',
          eventType: 'CLIENT_CREATED',
          summary: 'Client account registered',
          occurredAt: new Date('2026-07-30T10:00:00Z'),
        }),
        ClientTimelineEntry.create({
          clientId: CLIENT_UUID,
          sourceModule: 'CLIENT',
          eventType: 'CLIENT_UPDATED',
          summary: 'Client details updated',
          occurredAt: new Date('2026-07-30T11:00:00Z'),
        }),
        ClientTimelineEntry.create({
          clientId: CLIENT_UUID,
          sourceModule: 'CLIENT',
          eventType: 'CLIENT_ARCHIVED',
          summary: 'Client profile archived',
          occurredAt: new Date('2026-07-30T12:00:00Z'),
        }),
      ];

      for (const e of entries) {
        await repository.save(e);
      }
    });

    it('should return entries ordered by occurredAt DESC (most recent first)', async () => {
      const result = await repository.findByClientId(ClientId.create(CLIENT_UUID), 1, 10);

      expect(result.items).toHaveLength(3);
      expect(result.items[0]!.eventType).toBe('CLIENT_ARCHIVED');
      expect(result.items[1]!.eventType).toBe('CLIENT_UPDATED');
      expect(result.items[2]!.eventType).toBe('CLIENT_CREATED');
    });

    it('should return correct pagination metadata', async () => {
      const result = await repository.findByClientId(ClientId.create(CLIENT_UUID), 1, 10);

      expect(result.total).toBe(3);
      expect(result.page).toBe(1);
      expect(result.limit).toBe(10);
      expect(result.totalPages).toBe(1);
    });

    it('should paginate results correctly (page 1, limit 2)', async () => {
      const page1 = await repository.findByClientId(ClientId.create(CLIENT_UUID), 1, 2);

      expect(page1.items).toHaveLength(2);
      expect(page1.total).toBe(3);
      expect(page1.hasNextPage).toBe(true);
    });

    it('should paginate results correctly (page 2, limit 2)', async () => {
      const page2 = await repository.findByClientId(ClientId.create(CLIENT_UUID), 2, 2);

      expect(page2.items).toHaveLength(1);
      expect(page2.hasPreviousPage).toBe(true);
      expect(page2.hasNextPage).toBe(false);
    });

    it('should return empty items for a client with no timeline entries', async () => {
      const result = await repository.findByClientId(ClientId.create(UNKNOWN_CLIENT_UUID), 1, 10);

      expect(result.items).toHaveLength(0);
      expect(result.total).toBe(0);
    });

    it('should only return entries belonging to the queried client', async () => {
      // Insert an entry for a different client
      await repository.save(
        ClientTimelineEntry.create({
          clientId: OTHER_CLIENT_UUID,
          sourceModule: 'CLIENT',
          eventType: 'CLIENT_CREATED',
          summary: 'Other client registered',
          occurredAt: new Date(),
        }),
      );

      const result = await repository.findByClientId(ClientId.create(CLIENT_UUID), 1, 10);

      expect(result.total).toBe(3);
      result.items.forEach((e) => expect(e.clientId).toBe(CLIENT_UUID));
    });

    it('should maintain deterministic ordering using id tie-breaker when occurredAt timestamps are identical', async () => {
      const sameTimestamp = new Date('2026-08-17T12:00:00.000Z');
      const testClientId = '99999999-9999-4999-8999-999999999999';

      await repository.save(
        ClientTimelineEntry.create({
          id: 'entry-aaa',
          clientId: testClientId,
          sourceModule: 'KINESIOLOGY',
          eventType: 'TREATMENT_SESSION_COMPLETED',
          summary: 'Session AAA',
          occurredAt: sameTimestamp,
        }),
      );
      await repository.save(
        ClientTimelineEntry.create({
          id: 'entry-zzz',
          clientId: testClientId,
          sourceModule: 'KINESIOLOGY',
          eventType: 'TREATMENT_SESSION_COMPLETED',
          summary: 'Session ZZZ',
          occurredAt: sameTimestamp,
        }),
      );

      const result = await repository.findByClientId(ClientId.create(testClientId), 1, 10);

      expect(result.items).toHaveLength(2);
      expect(result.items[0]!.id).toBe('entry-zzz');
      expect(result.items[1]!.id).toBe('entry-aaa');
    });
  });
});
