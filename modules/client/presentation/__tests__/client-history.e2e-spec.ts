import {
  CanActivate,
  ExecutionContext,
  HttpStatus,
  INestApplication,
  UnauthorizedException,
} from '@nestjs/common';
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
import { CLIENT_TIMELINE_REPOSITORY } from '../../domain/repositories/client-timeline.repository';
import { ClientTimelineRepository } from '../../domain/repositories/client-timeline.repository';
import { ClientTimelineEntry } from '../../domain/read-models/client-timeline-entry.entity';
import { PaginatedResultDto } from '../../application/dto/paginated-result.dto';
import {
  ClientId,
  ClientName,
  ClientReferenceNumber,
  ClientStatus,
  E164PhoneNumber,
  EmailAddress,
  NormalizedSearchName,
} from '../../domain/value-objects';
import { ClientController } from '../controllers/client.controller';
import { RegisterClientUseCase } from '../../application/use-cases/register-client.usecase';
import { LinkIdentityToClientUseCase } from '../../application/use-cases/link-identity-to-client.usecase';
import { GetClientProfileUseCase } from '../../application/use-cases/get-client-profile.usecase';
import { SearchClientsUseCase } from '../../application/use-cases/search-clients.usecase';
import { UpdateClientUseCase } from '../../application/use-cases/update-client.usecase';
import { ArchiveClientUseCase } from '../../application/use-cases/archive-client.usecase';
import { RestoreClientUseCase } from '../../application/use-cases/restore-client.usecase';
import { GetClientHistoryUseCase } from '../../application/use-cases/get-client-history.usecase';
import { ClientDuplicateCheckerService } from '../../domain/services/client-duplicate-checker.service';

// ---------------------------------------------------------------------------
// Auth guard test double
// ---------------------------------------------------------------------------
class E2ETestAuthGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest();
    const authHeader = req.headers?.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new UnauthorizedException('Authentication token required.');
    }
    const token = authHeader.replace('Bearer ', '');
    if (token === 'invalid-token') {
      throw new UnauthorizedException('Invalid token.');
    }
    req.user = {
      id: 'user-id',
      userId: 'user-id',
      roles: ['USER'],
      permissions: [],
    };
    return true;
  }
}

// ---------------------------------------------------------------------------
// In-memory Client repository double
// ---------------------------------------------------------------------------
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
    return Array.from(this.clients.values()).filter((c) =>
      c.normalizedSearchName.value.includes(normalizedQuery.value),
    );
  }

  async searchByStatus(status: ClientStatus): Promise<Client[]> {
    return Array.from(this.clients.values()).filter((c) => c.status === status);
  }

  async search(criteria: SearchClientsCriteria): Promise<PaginatedResultDto<Client>> {
    const items = Array.from(this.clients.values());
    return PaginatedResultDto.create(items, items.length, criteria.page ?? 1, criteria.limit ?? 10);
  }

  clear(): void {
    this.clients.clear();
  }
}

// ---------------------------------------------------------------------------
// In-memory Timeline repository double
// ---------------------------------------------------------------------------
class InMemoryClientTimelineRepository implements ClientTimelineRepository {
  private entries = new Map<string, ClientTimelineEntry[]>();

  async save(entry: ClientTimelineEntry): Promise<void> {
    const existing = this.entries.get(entry.clientId) ?? [];
    existing.push(entry);
    this.entries.set(entry.clientId, existing);
  }

  async findByClientId(
    clientId: ClientId,
    page: number,
    limit: number,
  ): Promise<PaginatedResultDto<ClientTimelineEntry>> {
    const all = (this.entries.get(clientId.value) ?? []).slice().reverse();
    const safePage = Math.max(1, page);
    const safeLimit = Math.max(1, limit);
    const skip = (safePage - 1) * safeLimit;
    const items = all.slice(skip, skip + safeLimit);
    return PaginatedResultDto.create(items, all.length, safePage, safeLimit);
  }

  seedEntries(clientId: string, entries: ClientTimelineEntry[]): void {
    this.entries.set(clientId, entries);
  }

  clear(): void {
    this.entries.clear();
  }
}

// ---------------------------------------------------------------------------
// Test Suite
// ---------------------------------------------------------------------------
describe('Client Activity Feed REST API E2E Pipeline', () => {
  let app: INestApplication;
  let clientRepository: InMemoryClientRepository;
  let timelineRepository: InMemoryClientTimelineRepository;
  let sampleClient: Client;

  beforeAll(async () => {
    clientRepository = new InMemoryClientRepository();
    timelineRepository = new InMemoryClientTimelineRepository();

    const duplicateChecker = new ClientDuplicateCheckerService(clientRepository, clientRepository);
    const registerUseCase = new RegisterClientUseCase(clientRepository, duplicateChecker);
    const linkIdentityUseCase = new LinkIdentityToClientUseCase(clientRepository);
    const getProfileUseCase = new GetClientProfileUseCase(clientRepository);
    const searchUseCase = new SearchClientsUseCase(clientRepository);
    const updateUseCase = new UpdateClientUseCase(clientRepository, duplicateChecker);
    const archiveUseCase = new ArchiveClientUseCase(clientRepository);
    const restoreUseCase = new RestoreClientUseCase(clientRepository);
    const getHistoryUseCase = new GetClientHistoryUseCase(clientRepository, timelineRepository);

    const moduleRef: TestingModule = await Test.createTestingModule({
      controllers: [ClientController],
      providers: [
        { provide: CLIENT_REPOSITORY, useValue: clientRepository },
        { provide: CLIENT_SEARCH_REPOSITORY, useValue: clientRepository },
        { provide: CLIENT_TIMELINE_REPOSITORY, useValue: timelineRepository },
        { provide: ClientDuplicateCheckerService, useValue: duplicateChecker },
        { provide: RegisterClientUseCase, useValue: registerUseCase },
        { provide: LinkIdentityToClientUseCase, useValue: linkIdentityUseCase },
        { provide: GetClientProfileUseCase, useValue: getProfileUseCase },
        { provide: SearchClientsUseCase, useValue: searchUseCase },
        { provide: UpdateClientUseCase, useValue: updateUseCase },
        { provide: ArchiveClientUseCase, useValue: archiveUseCase },
        { provide: RestoreClientUseCase, useValue: restoreUseCase },
        { provide: GetClientHistoryUseCase, useValue: getHistoryUseCase },
      ],
    })
      .overrideGuard(E2ETestAuthGuard)
      .useValue(new E2ETestAuthGuard())
      .compile();

    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    if (app) await app.close();
  });

  beforeEach(async () => {
    clientRepository.clear();
    timelineRepository.clear();

    sampleClient = Client.register({
      referenceNumber: ClientReferenceNumber.create(2026, 77777),
      name: ClientName.create('Valentina', 'Cruz'),
      email: EmailAddress.create('valentina.cruz@kinergy.local'),
      phone: E164PhoneNumber.create('+14155557777'),
    });
    await clientRepository.save(sampleClient);

    // Seed two timeline entries for the client
    timelineRepository.seedEntries(sampleClient.id, [
      ClientTimelineEntry.create({
        clientId: sampleClient.id,
        sourceModule: 'CLIENT',
        eventType: 'CLIENT_CREATED',
        summary: 'Client account registered',
        occurredAt: new Date('2026-07-30T10:00:00Z'),
      }),
      ClientTimelineEntry.create({
        clientId: sampleClient.id,
        sourceModule: 'CLIENT',
        eventType: 'CLIENT_UPDATED',
        summary: 'Client details updated',
        occurredAt: new Date('2026-07-30T11:00:00Z'),
      }),
    ]);
  });

  describe('GET /clients/:id/history', () => {
    it('should return 200 OK with paginated timeline entries', async () => {
      const res = await request(app.getHttpServer())
        .get(`/clients/${sampleClient.id}/history`)
        .set('Authorization', 'Bearer user-token-123');

      expect(res.status).toBe(HttpStatus.OK);
      expect(res.body.items).toBeInstanceOf(Array);
      expect(res.body.items).toHaveLength(2);
      expect(res.body.total).toBe(2);
      expect(res.body.page).toBe(1);

      const types = res.body.items.map((e: { eventType: string }) => e.eventType);
      expect(types).toContain('CLIENT_CREATED');
      expect(types).toContain('CLIENT_UPDATED');
    });

    it('should return correct shape for each timeline entry', async () => {
      const res = await request(app.getHttpServer())
        .get(`/clients/${sampleClient.id}/history`)
        .set('Authorization', 'Bearer user-token-123');

      const entry = res.body.items[0];
      expect(entry).toHaveProperty('id');
      expect(entry).toHaveProperty('clientId', sampleClient.id);
      expect(entry).toHaveProperty('sourceModule');
      expect(entry).toHaveProperty('eventType');
      expect(entry).toHaveProperty('summary');
      expect(entry).toHaveProperty('metadata');
      expect(entry).toHaveProperty('occurredAt');
    });

    it('should support pagination via query params', async () => {
      const res = await request(app.getHttpServer())
        .get(`/clients/${sampleClient.id}/history?page=1&limit=1`)
        .set('Authorization', 'Bearer user-token-123');

      expect(res.status).toBe(HttpStatus.OK);
      expect(res.body.items).toHaveLength(1);
      expect(res.body.total).toBe(2);
      expect(res.body.limit).toBe(1);
    });

    it('should return 404 Not Found for non-existent client ID', async () => {
      const nonExistentId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

      const res = await request(app.getHttpServer())
        .get(`/clients/${nonExistentId}/history`)
        .set('Authorization', 'Bearer user-token-123');

      expect(res.status).toBe(HttpStatus.NOT_FOUND);
    });

    it('should return 401 Unauthorized for missing bearer token', async () => {
      const res = await request(app.getHttpServer()).get(`/clients/${sampleClient.id}/history`);

      expect(res.status).toBe(HttpStatus.UNAUTHORIZED);
    });

    it('should strictly isolate timeline entries between different clients', async () => {
      const clientB = Client.register({
        referenceNumber: ClientReferenceNumber.create(2026, 77777),
        name: ClientName.create('Client', 'B'),
        email: EmailAddress.create('client.b@kinergy.local'),
        phone: E164PhoneNumber.create('+14155557777'),
      });
      await clientRepository.save(clientB);

      const entryB = ClientTimelineEntry.create({
        clientId: clientB.id,
        sourceModule: 'CLIENT',
        eventType: 'CLIENT_CREATED',
        summary: 'Client B created',
        occurredAt: new Date(),
      });
      await timelineRepository.save(entryB);

      // Query Client A history
      const resA = await request(app.getHttpServer())
        .get(`/clients/${sampleClient.id}/history`)
        .set('Authorization', 'Bearer user-token-123');

      expect(resA.status).toBe(HttpStatus.OK);
      resA.body.items.forEach((item: { clientId: string }) => {
        expect(item.clientId).toBe(sampleClient.id);
        expect(item.clientId).not.toBe(clientB.id);
      });

      // Query Client B history
      const resB = await request(app.getHttpServer())
        .get(`/clients/${clientB.id}/history`)
        .set('Authorization', 'Bearer user-token-123');

      expect(resB.status).toBe(HttpStatus.OK);
      expect(resB.body.items).toHaveLength(1);
      expect(resB.body.items[0].clientId).toBe(clientB.id);
    });

    it('should safely bound tampered pagination parameters (negative or excessive values)', async () => {
      const res = await request(app.getHttpServer())
        .get(`/clients/${sampleClient.id}/history?page=-5&limit=9999`)
        .set('Authorization', 'Bearer user-token-123');

      expect(res.status).toBe(HttpStatus.OK);
      expect(res.body.page).toBe(1);
      expect(res.body.limit).toBeLessThanOrEqual(100);
    });

    it('should reject invalid non-UUID client ID format with 400 or 404', async () => {
      const res = await request(app.getHttpServer())
        .get('/clients/invalid-non-uuid-format/history')
        .set('Authorization', 'Bearer user-token-123');

      expect([HttpStatus.BAD_REQUEST, HttpStatus.NOT_FOUND]).toContain(res.status);
    });

    it('should return empty items array with total 0 when client has no history', async () => {
      const emptyClient = Client.register({
        referenceNumber: ClientReferenceNumber.create(2026, 88888),
        name: ClientName.create('Jorge', 'Torres'),
        email: EmailAddress.create('jorge.torres@kinergy.local'),
        phone: E164PhoneNumber.create('+14155558888'),
      });
      await clientRepository.save(emptyClient);

      const res = await request(app.getHttpServer())
        .get(`/clients/${emptyClient.id}/history`)
        .set('Authorization', 'Bearer user-token-123');

      expect(res.status).toBe(HttpStatus.OK);
      expect(res.body.items).toHaveLength(0);
      expect(res.body.total).toBe(0);
    });
  });
});
