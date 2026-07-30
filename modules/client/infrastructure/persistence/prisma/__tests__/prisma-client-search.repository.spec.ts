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

describe('PrismaClientSearchRepository Integration Tests', () => {
  let repository: PrismaClientRepository;
  let mockPrismaClient: jest.Mocked<PrismaClient>;
  let recordsStore: ClientPrismaModel[];

  beforeEach(() => {
    const client1 = Client.register({
      referenceNumber: ClientReferenceNumber.create(2026, 1001),
      name: ClientName.create('Sofia', 'Alvarez'),
      email: EmailAddress.create('sofia.alvarez@example.com'),
      phone: E164PhoneNumber.create('+14155551001'),
    });

    const client2 = Client.register({
      referenceNumber: ClientReferenceNumber.create(2026, 1002),
      name: ClientName.create('Mateo', 'Alvarez'),
      email: EmailAddress.create('mateo.alvarez@example.com'),
      phone: E164PhoneNumber.create('+14155551002'),
    });

    recordsStore = [ClientMapper.toPersistence(client1), ClientMapper.toPersistence(client2)];

    mockPrismaClient = {
      client: {
        findMany: jest.fn().mockImplementation(async ({ where, skip = 0, take = 10 }) => {
          let filtered = [...recordsStore];
          if (where?.status) {
            filtered = filtered.filter((r) => r.status === where.status);
          }
          if (where?.OR) {
            filtered = filtered.filter((r) => {
              return where.OR.some((clause: Record<string, { contains: string }>) => {
                if (clause.normalizedSearchName) {
                  return r.normalizedSearchName
                    .toLowerCase()
                    .includes(clause.normalizedSearchName.contains.toLowerCase());
                }
                if (clause.email) {
                  return r.email.toLowerCase().includes(clause.email.contains.toLowerCase());
                }
                if (clause.phone) {
                  return r.phone.toLowerCase().includes(clause.phone.contains.toLowerCase());
                }
                if (clause.referenceNumber) {
                  return r.referenceNumber
                    .toLowerCase()
                    .includes(clause.referenceNumber.contains.toLowerCase());
                }
                return false;
              });
            });
          }
          return filtered.slice(skip, skip + take);
        }),
        count: jest.fn().mockImplementation(async ({ where }) => {
          let filtered = [...recordsStore];
          if (where?.status) {
            filtered = filtered.filter((r) => r.status === where.status);
          }
          if (where?.OR) {
            filtered = filtered.filter((r) => {
              return where.OR.some((clause: Record<string, { contains: string }>) => {
                if (clause.normalizedSearchName) {
                  return r.normalizedSearchName
                    .toLowerCase()
                    .includes(clause.normalizedSearchName.contains.toLowerCase());
                }
                if (clause.email) {
                  return r.email.toLowerCase().includes(clause.email.contains.toLowerCase());
                }
                if (clause.phone) {
                  return r.phone.toLowerCase().includes(clause.phone.contains.toLowerCase());
                }
                if (clause.referenceNumber) {
                  return r.referenceNumber
                    .toLowerCase()
                    .includes(clause.referenceNumber.contains.toLowerCase());
                }
                return false;
              });
            });
          }
          return filtered.length;
        }),
      },
    } as unknown as jest.Mocked<PrismaClient>;

    repository = new PrismaClientRepository(mockPrismaClient);
  });

  it('should search by partial name and return matching records', async () => {
    const result = await repository.search({
      query: 'sofia',
      page: 1,
      limit: 10,
    });

    expect(result.items).toHaveLength(1);
    expect(result.items[0]?.name.fullName).toBe('Sofia Alvarez');
  });

  it('should search by partial email and return matching records', async () => {
    const result = await repository.search({
      query: 'mateo.alvarez',
      page: 1,
      limit: 10,
    });

    expect(result.items).toHaveLength(1);
    expect(result.items[0]?.name.fullName).toBe('Mateo Alvarez');
  });

  it('should search by partial phone and return matching records', async () => {
    const result = await repository.search({
      query: '5551001',
      page: 1,
      limit: 10,
    });

    expect(result.items).toHaveLength(1);
    expect(result.items[0]?.phone.value).toBe('+14155551001');
  });

  it('should search by exact reference number', async () => {
    const result = await repository.search({
      query: 'CLI-2026-01002',
      page: 1,
      limit: 10,
    });

    expect(result.items).toHaveLength(1);
    expect(result.items[0]?.referenceNumber.value).toBe('CLI-2026-01002');
  });

  it('should filter by ClientStatus.ACTIVE by default when includeArchived is false', async () => {
    const result = await repository.search({
      includeArchived: false,
      page: 1,
      limit: 10,
    });

    expect(result.items.every((c) => c.status === ClientStatus.ACTIVE)).toBe(true);
  });

  it('should compute accurate pagination metadata', async () => {
    const result = await repository.search({
      page: 1,
      limit: 1,
    });

    expect(result.page).toBe(1);
    expect(result.limit).toBe(1);
    expect(result.total).toBe(2);
    expect(result.totalPages).toBe(2);
    expect(result.hasNextPage).toBe(true);
    expect(result.hasPreviousPage).toBe(false);
  });
});
