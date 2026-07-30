import {
  CanActivate,
  ExecutionContext,
  HttpStatus,
  INestApplication,
  ValidationPipe,
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
import { GetClientProfileUseCase } from '../../application/use-cases/get-client-profile.usecase';
import { SearchClientsUseCase } from '../../application/use-cases/search-clients.usecase';
import { UpdateClientUseCase } from '../../application/use-cases/update-client.usecase';
import { ArchiveClientUseCase } from '../../application/use-cases/archive-client.usecase';
import { RestoreClientUseCase } from '../../application/use-cases/restore-client.usecase';
import { ClientDuplicateCheckerService } from '../../domain/services/client-duplicate-checker.service';

class E2ETestAuthGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest();
    const authHeader = req.headers?.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return false;
    }

    const token = authHeader.replace('Bearer ', '');
    req.user = {
      id: token.includes('admin') || token.includes('staff') ? 'staff-user-id' : 'regular-user-id',
      userId:
        token.includes('admin') || token.includes('staff') ? 'staff-user-id' : 'regular-user-id',
      roles: token.includes('admin') ? ['ADMIN'] : token.includes('staff') ? ['STAFF'] : ['CLIENT'],
      permissions: [],
    };

    return true;
  }
}

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
    let items = Array.from(this.clients.values());
    if (!criteria.includeArchived) {
      items = items.filter((c) => c.status !== ClientStatus.ARCHIVED);
    }
    return PaginatedResultDto.create(items, items.length, criteria.page, criteria.limit);
  }

  getStoreCount(): number {
    return this.clients.size;
  }

  clear(): void {
    this.clients.clear();
  }
}

describe('Client Archive & Restore REST API E2E Pipeline', () => {
  let app: INestApplication;
  let clientRepository: InMemoryClientRepository;
  let activeClient: Client;
  let archivedClient: Client;

  beforeAll(async () => {
    clientRepository = new InMemoryClientRepository();

    const duplicateChecker = new ClientDuplicateCheckerService(clientRepository, clientRepository);
    const registerUseCase = new RegisterClientUseCase(clientRepository, duplicateChecker);
    const linkIdentityUseCase = new LinkIdentityToClientUseCase(clientRepository);
    const getProfileUseCase = new GetClientProfileUseCase(clientRepository);
    const searchClientsUseCase = new SearchClientsUseCase(clientRepository);
    const updateClientUseCase = new UpdateClientUseCase(clientRepository, duplicateChecker);
    const archiveClientUseCase = new ArchiveClientUseCase(clientRepository);
    const restoreClientUseCase = new RestoreClientUseCase(clientRepository);

    const moduleRef: TestingModule = await Test.createTestingModule({
      controllers: [ClientController],
      providers: [
        { provide: CLIENT_REPOSITORY, useValue: clientRepository },
        { provide: CLIENT_SEARCH_REPOSITORY, useValue: clientRepository },
        { provide: ClientDuplicateCheckerService, useValue: duplicateChecker },
        { provide: RegisterClientUseCase, useValue: registerUseCase },
        { provide: LinkIdentityToClientUseCase, useValue: linkIdentityUseCase },
        { provide: GetClientProfileUseCase, useValue: getProfileUseCase },
        { provide: SearchClientsUseCase, useValue: searchClientsUseCase },
        { provide: UpdateClientUseCase, useValue: updateClientUseCase },
        { provide: ArchiveClientUseCase, useValue: archiveClientUseCase },
        { provide: RestoreClientUseCase, useValue: restoreClientUseCase },
      ],
    })
      .overrideGuard(E2ETestAuthGuard)
      .useValue(new E2ETestAuthGuard())
      .compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        transform: true,
        whitelist: true,
        forbidNonWhitelisted: true,
      }),
    );
    await app.init();
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  beforeEach(async () => {
    clientRepository.clear();

    activeClient = Client.register({
      referenceNumber: ClientReferenceNumber.create(2026, 70001),
      name: ClientName.create('Fernando', 'Ríos'),
      email: EmailAddress.create('fernando.rios@example.com'),
      phone: E164PhoneNumber.create('+14155557001'),
    });

    archivedClient = Client.register({
      referenceNumber: ClientReferenceNumber.create(2026, 70002),
      name: ClientName.create('Elena', 'Silva'),
      email: EmailAddress.create('elena.silva@example.com'),
      phone: E164PhoneNumber.create('+14155557002'),
    });
    archivedClient.archive();

    await clientRepository.save(activeClient);
    await clientRepository.save(archivedClient);
  });

  describe('PATCH /clients/:id/archive', () => {
    it('should archive an active client, increment version, return 200 OK and set ETag header', async () => {
      const initialCount = clientRepository.getStoreCount();

      const res = await request(app.getHttpServer())
        .patch(`/clients/${activeClient.id}/archive`)
        .set('Authorization', 'Bearer admin-token-123')
        .set('If-Match', '"1"');

      expect(res.status).toBe(HttpStatus.OK);
      expect(res.header.etag).toBe('"2"');
      expect(res.body.status).toBe('ARCHIVED');
      expect(res.body.version).toBe(2);

      // Verify soft delete: total row count in store remains identical
      expect(clientRepository.getStoreCount()).toBe(initialCount);
    });

    it('should return 409 Conflict when archiving an already archived client', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/clients/${archivedClient.id}/archive`)
        .set('Authorization', 'Bearer staff-token-123');

      expect(res.status).toBe(HttpStatus.CONFLICT);
      expect(res.body.statusCode).toBe(409);
    });

    it('should return 403 Forbidden when requested by non-administrative client role', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/clients/${activeClient.id}/archive`)
        .set('Authorization', 'Bearer client-user-token');

      expect(res.status).toBe(HttpStatus.FORBIDDEN);
    });
  });

  describe('PATCH /clients/:id/restore', () => {
    it('should restore an archived client to ACTIVE status, increment version, return 200 OK and set ETag header', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/clients/${archivedClient.id}/restore`)
        .set('Authorization', 'Bearer admin-token-123')
        .set('If-Match', '"2"');

      expect(res.status).toBe(HttpStatus.OK);
      expect(res.header.etag).toBe('"3"');
      expect(res.body.status).toBe('ACTIVE');
      expect(res.body.version).toBe(3);
    });

    it('should return 409 Conflict when restoring an already active client', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/clients/${activeClient.id}/restore`)
        .set('Authorization', 'Bearer staff-token-123');

      expect(res.status).toBe(HttpStatus.CONFLICT);
      expect(res.body.statusCode).toBe(409);
    });
  });

  describe('Searchability Preservation', () => {
    it('should exclude archived clients from GET /clients by default but include them when includeArchived=true', async () => {
      const resDefault = await request(app.getHttpServer())
        .get('/clients')
        .set('Authorization', 'Bearer admin-token-123');

      expect(resDefault.status).toBe(HttpStatus.OK);
      expect(resDefault.body.items).toHaveLength(1);
      expect(resDefault.body.items[0].id).toBe(activeClient.id);

      const resWithArchived = await request(app.getHttpServer())
        .get('/clients?includeArchived=true')
        .set('Authorization', 'Bearer admin-token-123');

      expect(resWithArchived.status).toBe(HttpStatus.OK);
      expect(resWithArchived.body.items).toHaveLength(2);
    });
  });
});
