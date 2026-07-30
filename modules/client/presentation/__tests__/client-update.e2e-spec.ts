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
    const items = Array.from(this.clients.values());
    return PaginatedResultDto.create(items, items.length, criteria.page, criteria.limit);
  }

  clear(): void {
    this.clients.clear();
  }
}

describe('Client Update REST API E2E Pipeline', () => {
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
      referenceNumber: ClientReferenceNumber.create(2026, 60001),
      name: ClientName.create('Valeria', 'Rios'),
      email: EmailAddress.create('valeria.rios@example.com'),
      phone: E164PhoneNumber.create('+14155556001'),
    });

    archivedClient = Client.register({
      referenceNumber: ClientReferenceNumber.create(2026, 60002),
      name: ClientName.create('Gonzalo', 'Paredes'),
      email: EmailAddress.create('gonzalo.paredes@example.com'),
      phone: E164PhoneNumber.create('+14155556002'),
    });
    archivedClient.archive();

    await clientRepository.save(activeClient);
    await clientRepository.save(archivedClient);
  });

  describe('PATCH /clients/:id', () => {
    it('should return 200 OK with updated profile and new ETag header when If-Match version matches', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/clients/${activeClient.id}`)
        .set('Authorization', 'Bearer admin-token-123')
        .set('If-Match', '"1"')
        .send({
          firstName: 'Valeria Maria',
          phone: '+14155559999',
        });

      expect(res.status).toBe(HttpStatus.OK);
      expect(res.header.etag).toBe('"2"');
      expect(res.body.firstName).toBe('Valeria Maria');
      expect(res.body.phone).toBe('+14155559999');
      expect(res.body.version).toBe(2);
    });

    it('should return 412 Precondition Failed when If-Match version is outdated', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/clients/${activeClient.id}`)
        .set('Authorization', 'Bearer admin-token-123')
        .set('If-Match', '"99"')
        .send({
          firstName: 'Valeria Outdated',
        });

      expect(res.status).toBe(HttpStatus.PRECONDITION_FAILED);
      expect(res.body.statusCode).toBe(412);
    });

    it('should return 422 Unprocessable Entity when attempting to update an archived client', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/clients/${archivedClient.id}`)
        .set('Authorization', 'Bearer admin-token-123')
        .set('If-Match', '"2"')
        .send({
          firstName: 'Gonzalo Modified',
        });

      expect(res.status).toBe(HttpStatus.UNPROCESSABLE_ENTITY);
      expect(res.body.statusCode).toBe(422);
    });

    it('should return 404 Not Found when client ID does not exist', async () => {
      const nonExistentId = '00000000-0000-4000-8000-000000000000';
      const res = await request(app.getHttpServer())
        .patch(`/clients/${nonExistentId}`)
        .set('Authorization', 'Bearer admin-token-123')
        .set('If-Match', '"1"')
        .send({
          firstName: 'Ghost',
        });

      expect(res.status).toBe(HttpStatus.NOT_FOUND);
    });
  });
});
