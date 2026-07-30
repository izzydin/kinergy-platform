import { Client as ClientPrismaModel, PrismaClient } from '@prisma/client';
import { Client } from '../../../../domain/aggregates/client.aggregate';
import { ClientConcurrencyException } from '../../../../domain/errors/client-domain.exception';
import {
  ClientName,
  ClientReferenceNumber,
  ClientStatus,
  E164PhoneNumber,
  EmailAddress,
  NormalizedSearchName,
} from '../../../../domain/value-objects';

import { PrismaClientRepository } from '../prisma-client.repository';

describe('PrismaClientRepository Integration Tests', () => {
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
          if (where.id) {
            return clientStore.get(where.id) ?? null;
          }
          if (where.identityId) {
            for (const record of clientStore.values()) {
              if (record.identityId === where.identityId) return record;
            }
          }
          if (where.referenceNumber) {
            for (const record of clientStore.values()) {
              if (record.referenceNumber === where.referenceNumber) return record;
            }
          }
          return null;
        }),
        findFirst: jest.fn().mockImplementation(async ({ where }) => {
          for (const record of clientStore.values()) {
            if (where.normalizedEmail && record.normalizedEmail === where.normalizedEmail) {
              return record;
            }
            if (where.normalizedPhone && record.normalizedPhone === where.normalizedPhone) {
              return record;
            }
          }
          return null;
        }),
        findMany: jest.fn().mockImplementation(async ({ where }) => {
          const results: ClientPrismaModel[] = [];
          for (const record of clientStore.values()) {
            if (where.status && record.status === where.status) {
              results.push(record);
            } else if (
              where.normalizedSearchName &&
              record.normalizedSearchName.includes(where.normalizedSearchName.contains)
            ) {
              results.push(record);
            }
          }
          return results;
        }),
      },
    } as unknown as jest.Mocked<PrismaClient>;

    repository = new PrismaClientRepository(mockPrismaClient);
  });

  describe('1. Save & Rehydration Operations', () => {
    it('should save a new Client aggregate to persistence store (version 1)', async () => {
      const client = Client.register({
        referenceNumber: ClientReferenceNumber.create(2026, 10001),
        name: ClientName.create('Alice', 'Smith'),
        email: EmailAddress.create('alice.smith@example.com'),
        phone: E164PhoneNumber.create('+14155552671'),
      });

      await repository.save(client);

      const saved = await repository.findById(client.clientId);
      expect(saved).not.toBeNull();
      expect(saved?.id).toBe(client.id);
      expect(saved?.referenceNumber.value).toBe('CLI-2026-10001');
      expect(saved?.name.fullName).toBe('Alice Smith');
      expect(saved?.email.value).toBe('alice.smith@example.com');
      expect(saved?.phone.value).toBe('+14155552671');
      expect(saved?.version).toBe(1);
      expect(saved?.status).toBe(ClientStatus.ACTIVE);
    });

    it('should save an updated Client aggregate with incremented version (version 2)', async () => {
      const client = Client.register({
        referenceNumber: ClientReferenceNumber.create(2026, 10002),
        name: ClientName.create('Bob', 'Johnson'),
        email: EmailAddress.create('bob.johnson@example.com'),
        phone: E164PhoneNumber.create('+14155552672'),
      });

      await repository.save(client);

      client.linkIdentity('user-identity-uuid-123');
      await repository.save(client);

      const rehydrated = await repository.findById(client.clientId);
      expect(rehydrated).not.toBeNull();
      expect(rehydrated?.identityId).toBe('user-identity-uuid-123');
      expect(rehydrated?.version).toBe(2);
    });

    it('should throw ClientConcurrencyException when version mismatch occurs', async () => {
      const client = Client.register({
        referenceNumber: ClientReferenceNumber.create(2026, 10003),
        name: ClientName.create('Charlie', 'Brown'),
        email: EmailAddress.create('charlie.brown@example.com'),
        phone: E164PhoneNumber.create('+14155552673'),
      });

      await repository.save(client);

      // Simulate concurrent edit by mutating version in store
      const inStore = clientStore.get(client.id)!;
      inStore.version = 5;

      client.linkIdentity('identity-456');

      await expect(repository.save(client)).rejects.toThrow(ClientConcurrencyException);
    });
  });

  describe('2. Query Operations', () => {
    let client: Client;

    beforeEach(async () => {
      client = Client.register({
        referenceNumber: ClientReferenceNumber.create(2026, 88888),
        name: ClientName.create('Diana', 'Prince'),
        email: EmailAddress.create('diana.prince@example.com'),
        phone: E164PhoneNumber.create('+14155558888'),
        identityId: 'identity-diana-1',
      });
      await repository.save(client);
    });

    it('should query client by email', async () => {
      const found = await repository.findByEmail(EmailAddress.create('diana.prince@example.com'));
      expect(found).not.toBeNull();
      expect(found?.id).toBe(client.id);
    });

    it('should query client by phone', async () => {
      const found = await repository.findByPhone(E164PhoneNumber.create('+14155558888'));
      expect(found).not.toBeNull();
      expect(found?.id).toBe(client.id);
    });

    it('should query client by identityId', async () => {
      const found = await repository.findByIdentityId('identity-diana-1');
      expect(found).not.toBeNull();
      expect(found?.id).toBe(client.id);
    });

    it('should query client by referenceNumber', async () => {
      const found = await repository.findByReferenceNumber(
        ClientReferenceNumber.from('CLI-2026-88888'),
      );
      expect(found).not.toBeNull();
      expect(found?.id).toBe(client.id);
    });

    it('should search clients by normalized search name', async () => {
      const results = await repository.searchByName(NormalizedSearchName.create('diana prince'));
      expect(results).toHaveLength(1);
      expect(results[0]?.id).toBe(client.id);
    });

    it('should search clients by status', async () => {
      const results = await repository.searchByStatus(ClientStatus.ACTIVE);
      expect(results.length).toBeGreaterThanOrEqual(1);
    });
  });
});
