import { HttpStatus, INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { Client } from '../../domain/aggregates/client.aggregate';
import {
  CLIENT_REPOSITORY,
  CLIENT_SEARCH_REPOSITORY,
  ClientRepository,
  ClientSearchRepository,
  SearchClientsCriteria,
} from '../../domain/repositories';

import {
  ClientId,
  ClientName,
  ClientReferenceNumber,
  ClientStatus,
  E164PhoneNumber,
  EmailAddress,
  NormalizedSearchName,
} from '../../domain/value-objects';
import { PaginatedResultDto } from '../../application/dto/paginated-result.dto';
import { ClientController } from '../controllers/client.controller';
import { RegisterClientUseCase } from '../../application/use-cases/register-client.usecase';
import { LinkIdentityToClientUseCase } from '../../application/use-cases/link-identity-to-client.usecase';
import { ClientDuplicateCheckerService } from '../../domain/services/client-duplicate-checker.service';

class InMemoryClientRepository implements ClientRepository, ClientSearchRepository {
  private clients = new Map<string, Client>();

  async save(client: Client): Promise<void> {
    this.clients.set(client.id, client);
  }

  async findById(id: ClientId): Promise<Client | null> {
    return this.clients.get(id.value) ?? null;
  }

  async findByEmail(email: EmailAddress): Promise<Client | null> {
    for (const c of this.clients.values()) {
      if (c.email.value === email.value) return c;
    }
    return null;
  }

  async findByPhone(phone: E164PhoneNumber): Promise<Client | null> {
    for (const c of this.clients.values()) {
      if (c.phone.value === phone.value) return c;
    }
    return null;
  }

  async findByIdentityId(identityId: string): Promise<Client | null> {
    for (const c of this.clients.values()) {
      if (c.identityId === identityId) return c;
    }
    return null;
  }

  async findByReferenceNumber(ref: ClientReferenceNumber): Promise<Client | null> {
    for (const c of this.clients.values()) {
      if (c.referenceNumber.value === ref.value) return c;
    }
    return null;
  }

  async searchByName(normalizedQuery: NormalizedSearchName): Promise<Client[]> {
    const results: Client[] = [];
    for (const c of this.clients.values()) {
      if (c.normalizedSearchName.value.includes(normalizedQuery.value)) {
        results.push(c);
      }
    }
    return results;
  }

  async searchByStatus(status: ClientStatus): Promise<Client[]> {
    const results: Client[] = [];
    for (const c of this.clients.values()) {
      if (c.status === status) {
        results.push(c);
      }
    }
    return results;
  }

  async search(criteria: SearchClientsCriteria): Promise<PaginatedResultDto<Client>> {
    const items = Array.from(this.clients.values());
    return PaginatedResultDto.create(items, items.length, criteria.page, criteria.limit);
  }

  clear(): void {
    this.clients.clear();
  }
}

describe('Client Registration REST API E2E Pipeline', () => {
  let app: INestApplication;
  let clientRepository: InMemoryClientRepository;

  beforeAll(async () => {
    clientRepository = new InMemoryClientRepository();

    const duplicateChecker = new ClientDuplicateCheckerService(clientRepository, clientRepository);
    const registerUseCase = new RegisterClientUseCase(clientRepository, duplicateChecker);
    const linkIdentityUseCase = new LinkIdentityToClientUseCase(clientRepository);

    const moduleRef: TestingModule = await Test.createTestingModule({
      controllers: [ClientController],
      providers: [
        { provide: CLIENT_REPOSITORY, useValue: clientRepository },
        { provide: CLIENT_SEARCH_REPOSITORY, useValue: clientRepository },
        { provide: ClientDuplicateCheckerService, useValue: duplicateChecker },
        { provide: RegisterClientUseCase, useValue: registerUseCase },
        { provide: LinkIdentityToClientUseCase, useValue: linkIdentityUseCase },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  beforeEach(() => {
    clientRepository.clear();
  });

  describe('1. POST /clients (Client Registration)', () => {
    it('should register a new walk-in client profile returning 201 Created', async () => {
      const res = await request(app.getHttpServer()).post('/clients').send({
        firstName: 'Carlos',
        lastName: 'Santana',
        email: 'carlos.santana@kinergy.local',
        phone: '+14155551111',
      });

      expect(res.status).toBe(HttpStatus.CREATED);
      expect(res.body.id).toBeDefined();
      expect(res.body.referenceNumber).toMatch(/^CLI-\d{4}-\d{5}$/);
      expect(res.body.firstName).toBe('Carlos');
      expect(res.body.lastName).toBe('Santana');
      expect(res.body.email).toBe('carlos.santana@kinergy.local');
      expect(res.body.phone).toBe('+14155551111');
      expect(res.body.status).toBe('ACTIVE');
      expect(res.body.version).toBe(1);
    });

    it('should reject hard duplicate registration returning 409 Conflict', async () => {
      // Pre-seed active client
      const existingClient = Client.register({
        referenceNumber: ClientReferenceNumber.create(2026, 99999),
        name: ClientName.create('Carlos', 'Santana'),
        email: EmailAddress.create('carlos.santana@kinergy.local'),
        phone: E164PhoneNumber.create('+14155551111'),
      });
      await clientRepository.save(existingClient);

      const res = await request(app.getHttpServer()).post('/clients').send({
        firstName: 'Carlos',
        lastName: 'Santana',
        email: 'carlos.santana@kinergy.local',
        phone: '+14155552222',
      });

      expect(res.status).toBe(HttpStatus.CONFLICT);
      expect(res.body.error).toBe('Conflict');
      expect(res.body.message).toContain('Hard Duplicate Rejection');
    });

    it('should return 409 Conflict with potential matches payload when soft duplicate is detected', async () => {
      // Pre-seed client with same phone or name
      const existingClient = Client.register({
        referenceNumber: ClientReferenceNumber.create(2026, 88888),
        name: ClientName.create('Maria', 'Gomez'),
        email: EmailAddress.create('maria.gomez@kinergy.local'),
        phone: E164PhoneNumber.create('+14155559999'),
      });
      await clientRepository.save(existingClient);

      // Attempt registration with same phone but different email
      const res = await request(app.getHttpServer()).post('/clients').send({
        firstName: 'Maria',
        lastName: 'Gomez',
        email: 'new.maria@kinergy.local',
        phone: '+14155559999',
      });

      expect(res.status).toBe(HttpStatus.CONFLICT);
      expect(res.body.status).toBe('POTENTIAL_DUPLICATES_FOUND');
      expect(res.body.potentialMatches).toBeDefined();
      expect(res.body.potentialMatches.length).toBeGreaterThan(0);
      expect(res.body.potentialMatches[0].clientId).toBe(existingClient.id);
    });

    it('should bypass soft duplicate check when bypassSoftDuplicates is true returning 201 Created', async () => {
      const existingClient = Client.register({
        referenceNumber: ClientReferenceNumber.create(2026, 77777),
        name: ClientName.create('Elena', 'Torres'),
        email: EmailAddress.create('elena.torres@kinergy.local'),
        phone: E164PhoneNumber.create('+14155557777'),
      });
      await clientRepository.save(existingClient);

      const res = await request(app.getHttpServer()).post('/clients').send({
        firstName: 'Elena',
        lastName: 'Torres',
        email: 'elena.torres.2@kinergy.local',
        phone: '+14155557778',
        bypassSoftDuplicates: true,
      });

      expect(res.status).toBe(HttpStatus.CREATED);
      expect(res.body.email).toBe('elena.torres.2@kinergy.local');
    });
  });

  describe('2. POST /clients/:id/link-identity (Identity Link Flow)', () => {
    it('should link identity to existing client profile returning 200 OK', async () => {
      const client = Client.register({
        referenceNumber: ClientReferenceNumber.create(2026, 55555),
        name: ClientName.create('Mateo', 'Silva'),
        email: EmailAddress.create('mateo.silva@kinergy.local'),
        phone: E164PhoneNumber.create('+14155555555'),
      });
      await clientRepository.save(client);

      const targetIdentityId = '550e8400-e29b-41d4-a716-446655440000';

      const res = await request(app.getHttpServer())
        .post(`/clients/${client.id}/link-identity`)
        .send({ identityId: targetIdentityId });

      expect(res.status).toBe(HttpStatus.OK);
      expect(res.body.id).toBe(client.id);
      expect(res.body.identityId).toBe(targetIdentityId);
      expect(res.body.version).toBe(2);
    });

    it('should return 409 Conflict if client is already linked to an identity', async () => {
      const client = Client.register({
        referenceNumber: ClientReferenceNumber.create(2026, 44444),
        name: ClientName.create('Sofia', 'Rios'),
        email: EmailAddress.create('sofia.rios@kinergy.local'),
        phone: E164PhoneNumber.create('+14155554444'),
        identityId: 'already-linked-identity-id',
      });
      await clientRepository.save(client);

      const res = await request(app.getHttpServer())
        .post(`/clients/${client.id}/link-identity`)
        .send({ identityId: 'new-identity-id' });

      expect(res.status).toBe(HttpStatus.CONFLICT);
      expect(res.body.error).toBe('Conflict');
      expect(res.body.message).toContain('already linked');
    });

    it('should return 404 Not Found for non-existent client ID', async () => {
      const nonExistentId = '11111111-2222-3333-4444-555555555555';

      const res = await request(app.getHttpServer())
        .post(`/clients/${nonExistentId}/link-identity`)
        .send({ identityId: 'identity-123' });

      expect(res.status).toBe(HttpStatus.NOT_FOUND);
      expect(res.body.error).toBe('Not Found');
    });
  });
});
