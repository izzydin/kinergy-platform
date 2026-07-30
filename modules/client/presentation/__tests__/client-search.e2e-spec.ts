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
      id: token.includes('admin') ? 'admin-user-id' : 'regular-user-id',
      userId: token.includes('admin') ? 'admin-user-id' : 'regular-user-id',
      roles: token.includes('admin') ? ['ADMIN'] : ['USER'],
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

    if (criteria.query && criteria.query.trim()) {
      const q = criteria.query.trim().toLowerCase();
      items = items.filter(
        (c) =>
          c.name.fullName.toLowerCase().includes(q) ||
          c.email.value.toLowerCase().includes(q) ||
          c.phone.value.toLowerCase().includes(q) ||
          c.referenceNumber.value.toLowerCase().includes(q),
      );
    }

    if (criteria.status) {
      items = items.filter((c) => c.status === criteria.status);
    } else if (!criteria.includeArchived) {
      items = items.filter((c) => c.status === ClientStatus.ACTIVE);
    }

    const page = criteria.page ?? 1;
    const limit = criteria.limit ?? 10;
    const skip = (page - 1) * limit;
    const paginatedItems = items.slice(skip, skip + limit);

    return PaginatedResultDto.create(paginatedItems, items.length, page, limit);
  }

  clear(): void {
    this.clients.clear();
  }
}

describe('Client Search REST API E2E Pipeline', () => {
  let app: INestApplication;
  let clientRepository: InMemoryClientRepository;
  let client1: Client;
  let client2: Client;

  beforeAll(async () => {
    clientRepository = new InMemoryClientRepository();

    const duplicateChecker = new ClientDuplicateCheckerService(clientRepository, clientRepository);
    const registerUseCase = new RegisterClientUseCase(clientRepository, duplicateChecker);
    const linkIdentityUseCase = new LinkIdentityToClientUseCase(clientRepository);
    const getProfileUseCase = new GetClientProfileUseCase(clientRepository);
    const searchClientsUseCase = new SearchClientsUseCase(clientRepository);

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

    client1 = Client.register({
      referenceNumber: ClientReferenceNumber.create(2026, 50001),
      name: ClientName.create('Elena', 'Rostova'),
      email: EmailAddress.create('elena.rostova@example.com'),
      phone: E164PhoneNumber.create('+14155550001'),
      identityId: 'user-elena-50001',
    });

    client2 = Client.register({
      referenceNumber: ClientReferenceNumber.create(2026, 50002),
      name: ClientName.create('Dmitri', 'Volkov'),
      email: EmailAddress.create('dmitri.volkov@example.com'),
      phone: E164PhoneNumber.create('+14155550002'),
    });

    await clientRepository.save(client1);
    await clientRepository.save(client2);
  });

  describe('GET /clients', () => {
    it('should return 200 OK with paginated client profile list when authenticated', async () => {
      const res = await request(app.getHttpServer())
        .get('/clients')
        .set('Authorization', 'Bearer admin-token-123');

      expect(res.status).toBe(HttpStatus.OK);
      expect(res.body.items).toHaveLength(2);
      expect(res.body.total).toBe(2);
      expect(res.body.page).toBe(1);
      expect(res.body.limit).toBe(10);
      expect(res.body.totalPages).toBe(1);
      expect(res.body.hasNextPage).toBe(false);
      expect(res.body.hasPreviousPage).toBe(false);
    });

    it('should filter clients by search query string', async () => {
      const res = await request(app.getHttpServer())
        .get('/clients?query=Elena')
        .set('Authorization', 'Bearer admin-token-123');

      expect(res.status).toBe(HttpStatus.OK);
      expect(res.body.items).toHaveLength(1);
      expect(res.body.items[0]?.fullName).toBe('Elena Rostova');
    });

    it('should return 400 Bad Request when limit exceeds max bound (limit = 500)', async () => {
      const res = await request(app.getHttpServer())
        .get('/clients?limit=500')
        .set('Authorization', 'Bearer admin-token-123');

      expect(res.status).toBe(HttpStatus.BAD_REQUEST);
    });

    it('should return 401 Unauthorized for request missing authorization header', async () => {
      const res = await request(app.getHttpServer()).get('/clients');

      expect([HttpStatus.UNAUTHORIZED, HttpStatus.FORBIDDEN]).toContain(res.status);
    });
  });
});
