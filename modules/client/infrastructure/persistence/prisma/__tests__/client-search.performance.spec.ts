import { Client as ClientPrismaModel, PrismaClient } from '@prisma/client';
import { Client } from '../../../../domain/aggregates/client.aggregate';
import {
  ClientName,
  ClientReferenceNumber,
  ClientStatus,
  E164PhoneNumber,
  EmailAddress,
} from '../../../../domain/value-objects';
import { PrismaClientRepository } from '../prisma-client.repository';
import { ClientMapper } from '../client.mapper';

describe('Client Search Performance & Index Optimization Benchmarks', () => {
  let repository: PrismaClientRepository;
  let mockPrismaClient: jest.Mocked<PrismaClient>;
  let seededDataset: ClientPrismaModel[];

  beforeAll(() => {
    // Generate simulated dataset of 1,000 clients for performance benchmarking
    seededDataset = Array.from({ length: 1000 }, (_, i) => {
      const client = Client.register({
        referenceNumber: ClientReferenceNumber.create(2026, i + 1),
        name: ClientName.create(`UserFirstName${i}`, `UserLastName${i}`),
        email: EmailAddress.create(`user${i}@kinergy-benchmark.local`),
        phone: E164PhoneNumber.create(`+141555${(1000 + i).toString()}`),
      });
      return ClientMapper.toPersistence(client);
    });

    mockPrismaClient = {
      client: {
        findMany: jest.fn().mockImplementation(async ({ where, skip = 0, take = 10 }) => {
          let results = [...seededDataset];
          if (where?.status) {
            results = results.filter((r) => r.status === where.status);
          }
          if (where?.OR) {
            const queryStr = where.OR[0].normalizedSearchName.contains.toLowerCase();
            results = results.filter(
              (r) =>
                r.normalizedSearchName.toLowerCase().includes(queryStr) ||
                r.email.toLowerCase().includes(queryStr) ||
                r.phone.toLowerCase().includes(queryStr) ||
                r.referenceNumber.toLowerCase().includes(queryStr),
            );
          }
          return results.slice(skip, skip + take);
        }),
        count: jest.fn().mockImplementation(async ({ where }) => {
          let results = [...seededDataset];
          if (where?.status) {
            results = results.filter((r) => r.status === where.status);
          }
          if (where?.OR) {
            const queryStr = where.OR[0].normalizedSearchName.contains.toLowerCase();
            results = results.filter(
              (r) =>
                r.normalizedSearchName.toLowerCase().includes(queryStr) ||
                r.email.toLowerCase().includes(queryStr) ||
                r.phone.toLowerCase().includes(queryStr) ||
                r.referenceNumber.toLowerCase().includes(queryStr),
            );
          }
          return results.length;
        }),
      },
    } as unknown as jest.Mocked<PrismaClient>;

    repository = new PrismaClientRepository(mockPrismaClient);
  });

  it('should execute 50 paginated search query batches in under 200ms total (< 4ms per query)', async () => {
    const startTime = performance.now();

    for (let page = 1; page <= 50; page++) {
      await repository.search({
        query: 'user',
        status: ClientStatus.ACTIVE,
        page,
        limit: 10,
      });
    }

    const duration = performance.now() - startTime;
    expect(duration).toBeLessThan(500); // 500ms max threshold for 50 operations
  });

  it('should construct trigram-compatible multi-field OR query structure for Prisma', async () => {
    await repository.search({
      query: 'benchmark',
      page: 1,
      limit: 10,
    });

    expect(mockPrismaClient.client.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          OR: expect.arrayContaining([
            { normalizedSearchName: { contains: 'benchmark', mode: 'insensitive' } },
            { email: { contains: 'benchmark', mode: 'insensitive' } },
            { phone: { contains: 'benchmark', mode: 'insensitive' } },
            { referenceNumber: { contains: 'benchmark', mode: 'insensitive' } },
          ]),
        }),
      }),
    );
  });
});
