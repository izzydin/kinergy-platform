import { Client as ClientPrismaModel, PrismaClient } from '@prisma/client';
import { Client } from '../../../../domain/aggregates/client.aggregate';
import { OptimisticLockException } from '../../../../domain/errors/client-domain.exception';
import {
  ClientName,
  ClientReferenceNumber,
  E164PhoneNumber,
  EmailAddress,
} from '../../../../domain/value-objects';
import { PrismaClientRepository } from '../prisma-client.repository';

describe('PrismaClientRepository Concurrency & Update Integration Tests', () => {
  let repository: PrismaClientRepository;
  let mockPrismaClient: jest.Mocked<PrismaClient>;
  let clientStore: Map<string, ClientPrismaModel>;

  beforeEach(() => {
    clientStore = new Map<string, ClientPrismaModel>();

    mockPrismaClient = {
      client: {
        upsert: jest.fn().mockImplementation(async ({ where, create, update }) => {
          const existing = clientStore.get(where.id);
          const dataToSave = existing ? { ...existing, ...update } : { ...create };
          clientStore.set(where.id, dataToSave as ClientPrismaModel);
          return dataToSave as ClientPrismaModel;
        }),
        updateMany: jest.fn().mockImplementation(async ({ where, data }) => {
          const existing = clientStore.get(where.id);
          if (existing && existing.version === where.version) {
            const updated = { ...existing, ...data };
            clientStore.set(where.id, updated as ClientPrismaModel);
            return { count: 1 };
          }
          return { count: 0 };
        }),
        findUnique: jest.fn().mockImplementation(async ({ where }) => {
          return clientStore.get(where.id) ?? null;
        }),
      },
    } as unknown as jest.Mocked<PrismaClient>;

    repository = new PrismaClientRepository(mockPrismaClient);
  });

  it('should save initial aggregate (version 1) and allow valid update (version 2)', async () => {
    const client = Client.register({
      referenceNumber: ClientReferenceNumber.create(2026, 90001),
      name: ClientName.create('Hugo', 'Torres'),
      email: EmailAddress.create('hugo.torres@example.com'),
      phone: E164PhoneNumber.create('+14155559001'),
    });

    await repository.save(client);

    client.updateDetails({
      name: ClientName.create('Hugo E.', 'Torres'),
      expectedVersion: 1,
    });

    await repository.save(client);

    const rehydrated = await repository.findById(client.clientId);
    expect(rehydrated).not.toBeNull();
    expect(rehydrated?.version).toBe(2);
    expect(rehydrated?.name.fullName).toBe('Hugo E. Torres');
  });

  it('should throw OptimisticLockException when concurrent update modifies version in store', async () => {
    const client = Client.register({
      referenceNumber: ClientReferenceNumber.create(2026, 90002),
      name: ClientName.create('Luciana', 'Molina'),
      email: EmailAddress.create('luciana.molina@example.com'),
      phone: E164PhoneNumber.create('+14155559002'),
    });

    await repository.save(client);

    // Simulate concurrent update modifying store version to 2 before this write commits
    const inStore = clientStore.get(client.id)!;
    inStore.version = 2;

    client.updateDetails({
      name: ClientName.create('Luciana S.', 'Molina'),
      expectedVersion: 1,
    });

    await expect(repository.save(client)).rejects.toThrow(OptimisticLockException);
  });
});
