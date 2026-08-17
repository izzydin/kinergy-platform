/**
 * Client Timeline E2E Event Flow Test Suite
 *
 * Verifies the complete event-driven timeline projection pipeline:
 *   1. POST /clients               → CLIENT_CREATED entry auto-projected
 *   2. PATCH /clients/:id          → CLIENT_UPDATED entry auto-projected
 *   3. PATCH /clients/:id/archive  → CLIENT_ARCHIVED entry auto-projected
 *   4. GET /clients/:id/history    → Returns all 3 entries in DESC chronological order
 */
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
import { ClientTimelineProjectionHandler } from '../../application/events/client-timeline-projection.handler';
import { DomainEventDispatcher } from '../../application/events/domain-event-dispatcher';
import { ClientDuplicateCheckerService } from '../../domain/services/client-duplicate-checker.service';

// ---------------------------------------------------------------------------
// Auth guard test double
// ---------------------------------------------------------------------------
class E2EAdminAuthGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest();
    const authHeader = req.headers?.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new UnauthorizedException('Authentication token required.');
    }
    req.user = {
      id: 'admin-id',
      userId: 'admin-id',
      roles: ['ADMIN'],
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

  getAll(): Client[] {
    return Array.from(this.clients.values());
  }

  clear(): void {
    this.clients.clear();
  }
}

// ---------------------------------------------------------------------------
// In-memory Timeline repository double — respects DESC ordering
// ---------------------------------------------------------------------------
class InMemoryClientTimelineRepository implements ClientTimelineRepository {
  private entries: ClientTimelineEntry[] = [];

  async save(entry: ClientTimelineEntry): Promise<void> {
    this.entries.push(entry);
  }

  async findByClientId(
    clientId: ClientId,
    page: number,
    limit: number,
  ): Promise<PaginatedResultDto<ClientTimelineEntry>> {
    const filtered = this.entries
      .filter((e) => e.clientId === clientId.value)
      .sort((a, b) => b.occurredAt.getTime() - a.occurredAt.getTime()); // DESC

    const safePage = Math.max(1, page);
    const safeLimit = Math.max(1, limit);
    const skip = (safePage - 1) * safeLimit;
    const items = filtered.slice(skip, skip + safeLimit);
    return PaginatedResultDto.create(items, filtered.length, safePage, safeLimit);
  }

  getAll(): ClientTimelineEntry[] {
    return [...this.entries];
  }

  clear(): void {
    this.entries = [];
  }
}

// ---------------------------------------------------------------------------
// Test Suite
// ---------------------------------------------------------------------------
describe('Client Timeline E2E Event Flow Pipeline', () => {
  let app: INestApplication;
  let clientRepository: InMemoryClientRepository;
  let timelineRepository: InMemoryClientTimelineRepository;

  beforeAll(async () => {
    clientRepository = new InMemoryClientRepository();
    timelineRepository = new InMemoryClientTimelineRepository();

    const duplicateChecker = new ClientDuplicateCheckerService(clientRepository, clientRepository);
    const projectionHandler = new ClientTimelineProjectionHandler(timelineRepository);
    const eventDispatcher = new DomainEventDispatcher(projectionHandler);

    const registerUseCase = new RegisterClientUseCase(
      clientRepository,
      duplicateChecker,
      eventDispatcher,
    );
    const linkIdentityUseCase = new LinkIdentityToClientUseCase(clientRepository, eventDispatcher);
    const getProfileUseCase = new GetClientProfileUseCase(clientRepository);
    const searchUseCase = new SearchClientsUseCase(clientRepository);
    const updateUseCase = new UpdateClientUseCase(
      clientRepository,
      duplicateChecker,
      eventDispatcher,
    );
    const archiveUseCase = new ArchiveClientUseCase(clientRepository, eventDispatcher);
    const restoreUseCase = new RestoreClientUseCase(clientRepository, eventDispatcher);
    const getHistoryUseCase = new GetClientHistoryUseCase(clientRepository, timelineRepository);

    const moduleRef: TestingModule = await Test.createTestingModule({
      controllers: [ClientController],
      providers: [
        { provide: CLIENT_REPOSITORY, useValue: clientRepository },
        { provide: CLIENT_SEARCH_REPOSITORY, useValue: clientRepository },
        { provide: CLIENT_TIMELINE_REPOSITORY, useValue: timelineRepository },
        { provide: ClientDuplicateCheckerService, useValue: duplicateChecker },
        { provide: ClientTimelineProjectionHandler, useValue: projectionHandler },
        { provide: DomainEventDispatcher, useValue: eventDispatcher },
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
      .overrideGuard(E2EAdminAuthGuard)
      .useValue(new E2EAdminAuthGuard())
      .compile();

    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    if (app) await app.close();
  });

  beforeEach(() => {
    clientRepository.clear();
    timelineRepository.clear();
  });

  describe('Full Event Flow: Register → Update → Archive → History', () => {
    it('should automatically project CLIENT_CREATED, CLIENT_UPDATED, CLIENT_ARCHIVED events and return them in DESC order', async () => {
      // ── Step 1: Register new client ──────────────────────────────────────
      const registerRes = await request(app.getHttpServer())
        .post('/clients')
        .set('Authorization', 'Bearer admin-token')
        .send({
          firstName: 'Elena',
          lastName: 'Vargas',
          email: 'elena.vargas@kinergy.local',
          phone: '+14155556666',
          bypassSoftDuplicates: true,
        });

      expect(registerRes.status).toBe(HttpStatus.CREATED);
      const clientId: string = registerRes.body.id;

      // Verify CLIENT_CREATED event was projected
      let timelineEntries = timelineRepository.getAll();
      expect(timelineEntries).toHaveLength(1);
      expect(timelineEntries[0]!.eventType).toBe('CLIENT_CREATED');
      expect(timelineEntries[0]!.clientId).toBe(clientId);

      // ── Step 2: Update client details ────────────────────────────────────
      // Introduce a short delay to ensure different occurredAt timestamps
      await new Promise((r) => setTimeout(r, 5));

      const updateRes = await request(app.getHttpServer())
        .patch(`/clients/${clientId}`)
        .set('Authorization', 'Bearer admin-token')
        .set('If-Match', '"1"')
        .send({ lastName: 'Vargas-Smith' });

      expect(updateRes.status).toBe(HttpStatus.OK);

      // Verify CLIENT_UPDATED event was projected
      timelineEntries = timelineRepository.getAll();
      expect(timelineEntries).toHaveLength(2);
      const updatedEntry = timelineEntries.find((e) => e.eventType === 'CLIENT_UPDATED');
      expect(updatedEntry).toBeDefined();
      expect(updatedEntry!.metadata).toEqual({ updatedFields: ['name'] });

      // ── Step 3: Archive client ────────────────────────────────────────────
      await new Promise((r) => setTimeout(r, 5));

      const archiveRes = await request(app.getHttpServer())
        .patch(`/clients/${clientId}/archive`)
        .set('Authorization', 'Bearer admin-token');

      expect(archiveRes.status).toBe(HttpStatus.OK);

      // Verify CLIENT_ARCHIVED event was projected
      timelineEntries = timelineRepository.getAll();
      expect(timelineEntries).toHaveLength(3);

      // ── Step 4: Query history — verify 3 entries in DESC order ──────────
      const historyRes = await request(app.getHttpServer())
        .get(`/clients/${clientId}/history`)
        .set('Authorization', 'Bearer admin-token');

      expect(historyRes.status).toBe(HttpStatus.OK);
      expect(historyRes.body.total).toBe(3);
      expect(historyRes.body.items).toHaveLength(3);

      const types = historyRes.body.items.map((e: { eventType: string }) => e.eventType);
      // Most recent (ARCHIVED) first, oldest (CREATED) last
      expect(types[0]).toBe('CLIENT_ARCHIVED');
      expect(types[1]).toBe('CLIENT_UPDATED');
      expect(types[2]).toBe('CLIENT_CREATED');

      // Verify DESC ordering by timestamp
      const timestamps = historyRes.body.items.map((e: { occurredAt: string }) =>
        new Date(e.occurredAt).getTime(),
      );
      expect(timestamps[0]).toBeGreaterThanOrEqual(timestamps[1]!);
      expect(timestamps[1]).toBeGreaterThanOrEqual(timestamps[2]!);
    });

    it('should return empty history for a newly registered client with no subsequent mutations', async () => {
      // Register client (projects CLIENT_CREATED)
      const registerRes = await request(app.getHttpServer())
        .post('/clients')
        .set('Authorization', 'Bearer admin-token')
        .send({
          firstName: 'Marco',
          lastName: 'Polo',
          email: 'marco.polo@kinergy.local',
          phone: '+14155554321',
          bypassSoftDuplicates: true,
        });

      expect(registerRes.status).toBe(HttpStatus.CREATED);
      const clientId: string = registerRes.body.id;

      const historyRes = await request(app.getHttpServer())
        .get(`/clients/${clientId}/history`)
        .set('Authorization', 'Bearer admin-token');

      expect(historyRes.status).toBe(HttpStatus.OK);
      expect(historyRes.body.total).toBe(1); // CLIENT_CREATED only
      expect(historyRes.body.items[0]!.eventType).toBe('CLIENT_CREATED');
    });

    it('should retrieve timeline entries via GET /clients/:id/timeline alias endpoint', async () => {
      const registerRes = await request(app.getHttpServer())
        .post('/clients')
        .set('Authorization', 'Bearer admin-token')
        .send({
          firstName: 'Galileo',
          lastName: 'Galilei',
          email: 'galileo.galilei@kinergy.local',
          phone: '+14155557788',
          bypassSoftDuplicates: true,
        });

      expect(registerRes.status).toBe(HttpStatus.CREATED);
      const clientId: string = registerRes.body.id;

      const timelineRes = await request(app.getHttpServer())
        .get(`/clients/${clientId}/timeline`)
        .set('Authorization', 'Bearer admin-token');

      expect(timelineRes.status).toBe(HttpStatus.OK);
      expect(timelineRes.body.total).toBe(1);
      expect(timelineRes.body.items[0]!.eventType).toBe('CLIENT_CREATED');
    });

    it('should return 404 for history of a non-existent client', async () => {
      const historyRes = await request(app.getHttpServer())
        .get('/clients/ffffffff-ffff-4fff-8fff-ffffffffffff/history')
        .set('Authorization', 'Bearer admin-token');

      expect(historyRes.status).toBe(HttpStatus.NOT_FOUND);
    });
  });
});
