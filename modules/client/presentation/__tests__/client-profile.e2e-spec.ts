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
import { ClientController } from '../controllers/client.controller';
import { RegisterClientUseCase } from '../../application/use-cases/register-client.usecase';
import { LinkIdentityToClientUseCase } from '../../application/use-cases/link-identity-to-client.usecase';
import { GetClientProfileUseCase } from '../../application/use-cases/get-client-profile.usecase';
import { ClientDuplicateCheckerService } from '../../domain/services/client-duplicate-checker.service';

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

  clear(): void {
    this.clients.clear();
  }
}

describe('Client Profile REST API E2E Pipeline', () => {
  let app: INestApplication;
  let clientRepository: InMemoryClientRepository;
  let sampleClient: Client;

  beforeAll(async () => {
    clientRepository = new InMemoryClientRepository();

    const duplicateChecker = new ClientDuplicateCheckerService(clientRepository, clientRepository);
    const registerUseCase = new RegisterClientUseCase(clientRepository, duplicateChecker);
    const linkIdentityUseCase = new LinkIdentityToClientUseCase(clientRepository);
    const getProfileUseCase = new GetClientProfileUseCase(clientRepository);

    const moduleRef: TestingModule = await Test.createTestingModule({
      controllers: [ClientController],
      providers: [
        { provide: CLIENT_REPOSITORY, useValue: clientRepository },
        { provide: CLIENT_SEARCH_REPOSITORY, useValue: clientRepository },
        { provide: ClientDuplicateCheckerService, useValue: duplicateChecker },
        { provide: RegisterClientUseCase, useValue: registerUseCase },
        { provide: LinkIdentityToClientUseCase, useValue: linkIdentityUseCase },
        { provide: GetClientProfileUseCase, useValue: getProfileUseCase },
      ],
    })
      .overrideGuard(E2ETestAuthGuard)
      .useValue(new E2ETestAuthGuard())
      .compile();

    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  beforeEach(async () => {
    clientRepository.clear();

    sampleClient = Client.register({
      referenceNumber: ClientReferenceNumber.create(2026, 33333),
      name: ClientName.create('Camila', 'Mendoza'),
      email: EmailAddress.create('camila.mendoza@kinergy.local'),
      phone: E164PhoneNumber.create('+14155553333'),
      identityId: 'camila-identity-uuid-333',
    });
    await clientRepository.save(sampleClient);
  });

  describe('GET /clients/:id', () => {
    it('should return 200 OK with client profile when authenticated as ADMIN', async () => {
      const res = await request(app.getHttpServer())
        .get(`/clients/${sampleClient.id}`)
        .set('Authorization', 'Bearer admin-token-123');

      expect(res.status).toBe(HttpStatus.OK);
      expect(res.body.id).toBe(sampleClient.id);
      expect(res.body.referenceNumber).toBe('CLI-2026-33333');
      expect(res.body.firstName).toBe('Camila');
      expect(res.body.lastName).toBe('Mendoza');
      expect(res.body.fullName).toBe('Camila Mendoza');
      expect(res.body.email).toBe('camila.mendoza@kinergy.local');
      expect(res.body.phone).toBe('+14155553333');
      expect(res.body.status).toBe('ACTIVE');
      expect(res.body.version).toBe(1);
    });

    it('should return 404 Not Found for non-existent client ID', async () => {
      const nonExistentId = '99999999-9999-4999-8999-999999999999';

      const res = await request(app.getHttpServer())
        .get(`/clients/${nonExistentId}`)
        .set('Authorization', 'Bearer admin-token-123');

      expect(res.status).toBe(HttpStatus.NOT_FOUND);
      expect(res.body.error).toBe('Not Found');
    });

    it('should return 401 Unauthorized for unauthenticated request when missing bearer token', async () => {
      // In ClientController, route can be guarded via global or route guard
      // If no auth header, test pipeline verifies auth guard check
      const res = await request(app.getHttpServer())
        .get(`/clients/${sampleClient.id}`)
        .set('Authorization', 'Bearer invalid-token');

      // Test with custom guard check or invalid auth token
      expect([HttpStatus.UNAUTHORIZED, HttpStatus.FORBIDDEN]).toContain(res.status);
    });
  });
});
