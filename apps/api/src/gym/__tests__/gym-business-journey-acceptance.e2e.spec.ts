import { Test, TestingModule } from '@nestjs/testing';
import { Global, INestApplication, Module } from '@nestjs/common';
import request from 'supertest';
import * as jwt from 'jsonwebtoken';
import {
  AttendanceRecordRepository,
  Sale,
  SaleId,
  Payment,
  PaymentId,
  Receipt,
  ReceiptId,
  ReceiptNumber,
  SaleRepositoryPort,
  SaleRepositoryInterface,
  PaymentRepositoryPort,
  ReceiptRepositoryPort,
  FindSalesCriteria,
  FindSalesPagination,
  FindSalesSort,
  FindSalesResult,
  SaleMapper,
  IUnitOfWork,
  Clock,
  TestClock,
} from '@kinergy-platform/core';
import { InMemoryReceiptSequenceGenerator } from '@kinergy-platform/core/server';
import { JwtTestFactory, DEFAULT_TEST_JWT_SECRET } from '@kinergy-platform/testing';
import { ClientModule } from '../../../../../modules/client/client.module';
import { PrismaClientRepository } from '../../../../../modules/client/infrastructure/persistence/prisma/prisma-client.repository';
import { PrismaClientTimelineRepository } from '../../../../../modules/client/infrastructure/persistence/prisma/prisma-client-timeline.repository';
import {
  CLIENT_REPOSITORY,
  CLIENT_SEARCH_REPOSITORY,
  CLIENT_TIMELINE_REPOSITORY,
} from '../../../../../modules/client/domain/repositories';
import { Client } from '../../../../../modules/client/domain/aggregates/client.aggregate';
import {
  ClientId,
  ClientReferenceNumber,
  EmailAddress,
  E164PhoneNumber,
  ClientStatus,
  NormalizedSearchName,
} from '../../../../../modules/client/domain/value-objects';
import { ClientRepository } from '../../../../../modules/client/domain/repositories/client.repository';
import { ClientSearchRepository } from '../../../../../modules/client/domain/repositories/client-search.repository';
import { SearchClientsCriteria } from '../../../../../modules/client/domain/repositories/search-clients-criteria.interface';
import { ClientTimelineRepository } from '../../../../../modules/client/domain/repositories/client-timeline.repository';
import { ClientTimelineEntry } from '../../../../../modules/client/domain/read-models/client-timeline-entry.entity';
import { PaginatedResultDto } from '../../../../../modules/client/application/dto/paginated-result.dto';
import {
  GymModule,
  MEMBERSHIP_REPOSITORY_TOKEN,
  MEMBERSHIP_PLAN_REPOSITORY_TOKEN,
  ATTENDANCE_RECORD_REPOSITORY_TOKEN,
  GYM_CLOCK_TOKEN,
  DefaultGymMembershipRepository,
  DefaultGymPlanRepository,
  DefaultGymAttendanceRepository,
} from '../gym.module';
import { SalesModule } from '../../sales/sales.module';
import {
  SALE_REPOSITORY_TOKEN,
  PAYMENT_REPOSITORY_TOKEN,
  RECEIPT_REPOSITORY_TOKEN,
  UNIT_OF_WORK_TOKEN,
} from '../../sales/sales.tokens';
import { PrismaService } from '../../platform/persistence/prisma/prisma.service';
import { DefaultAuthorizationEvaluator } from '../../platform/identity/authorization/default-authorization-evaluator';
import { DefaultPermissionResolver } from '../../platform/identity/authorization/default-permission-resolver';
import { getRolePermissions } from '../../platform/identity/authorization/permissions';
import { PERMISSION_RESOLVER } from '../../platform/identity/authorization/authorization.interface';
import { AUTHORIZATION_EVALUATOR } from '../../platform/identity/authorization/authorization-evaluator.interface';
import {
  ACCESS_TOKEN_SERVICE,
  IAccessTokenService,
} from '../../platform/identity/tokens/access-token.service';
import { IAccessTokenPayload } from '../../platform/identity/tokens/token-payload.interface';
import { IUserRepository, USER_REPOSITORY, User, UserStatus } from '../../platform/identity/domain';
import { GlobalSanitizationValidationPipe } from '../../common/pipes/global-sanitization-validation.pipe';
import { GlobalExceptionFilter } from '../../common/filters/global-exception.filter';

// ============================================================================
// Transactional In-Memory Persistence Backing Stores for Cross-Domain E2E
// ============================================================================

class InMemoryClientStore implements ClientRepository, ClientSearchRepository {
  public readonly clients = new Map<string, Client>();

  async save(client: Client): Promise<void> {
    this.clients.set(client.id, client);
  }

  async findById(id: ClientId): Promise<Client | null> {
    return this.clients.get(id.value) ?? null;
  }

  async findByReferenceNumber(refNumber: ClientReferenceNumber): Promise<Client | null> {
    for (const c of this.clients.values()) {
      if (c.referenceNumber.value === refNumber.value) return c;
    }
    return null;
  }

  async findByEmail(email: EmailAddress): Promise<Client | null> {
    for (const c of this.clients.values()) {
      if (c.email.value.toLowerCase() === email.value.toLowerCase()) return c;
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

  async searchByName(normalizedQuery: NormalizedSearchName): Promise<Client[]> {
    const q = normalizedQuery.value.toLowerCase();
    return Array.from(this.clients.values()).filter((c) =>
      c.name.fullName.toLowerCase().includes(q),
    );
  }

  async searchByStatus(status: ClientStatus): Promise<Client[]> {
    return Array.from(this.clients.values()).filter((c) => c.status === status);
  }

  async search(criteria: SearchClientsCriteria): Promise<PaginatedResultDto<Client>> {
    let items = Array.from(this.clients.values());
    if (!criteria.includeArchived && !criteria.status) {
      items = items.filter((c) => c.status !== ClientStatus.ARCHIVED);
    }
    if (criteria.status) {
      items = items.filter((c) => c.status === criteria.status);
    }
    if (criteria.query) {
      const q = criteria.query.toLowerCase();
      items = items.filter(
        (c) =>
          c.name.fullName.toLowerCase().includes(q) ||
          c.email.value.toLowerCase().includes(q) ||
          c.phone.value.toLowerCase().includes(q) ||
          c.referenceNumber.value.toLowerCase().includes(q),
      );
    }
    const page = criteria.page ?? 1;
    const limit = criteria.limit ?? 20;
    const total = items.length;
    const start = (page - 1) * limit;
    return PaginatedResultDto.create(items.slice(start, start + limit), total, page, limit);
  }
}

class InMemoryClientTimelineStore implements ClientTimelineRepository {
  public readonly entries: ClientTimelineEntry[] = [];

  async save(entry: ClientTimelineEntry): Promise<void> {
    this.entries.push(entry);
  }

  async findByClientId(
    clientId: ClientId,
    page: number,
    limit: number,
  ): Promise<PaginatedResultDto<ClientTimelineEntry>> {
    const filtered = this.entries.filter((e) => e.clientId === clientId.value);
    const start = (page - 1) * limit;
    return PaginatedResultDto.create(
      filtered.slice(start, start + limit),
      filtered.length,
      page,
      limit,
    );
  }
}

class SerializedGymAttendanceStore extends DefaultGymAttendanceRepository {
  private checkInLock: Promise<void> = Promise.resolve();

  async executeSerializedCheckIn<T>(
    _clientId: string,
    work: (repo: AttendanceRecordRepository) => Promise<T>,
  ): Promise<T> {
    const prev = this.checkInLock;
    let release!: () => void;
    this.checkInLock = new Promise<void>((res) => {
      release = res;
    });
    await prev;
    try {
      return await work(this);
    } finally {
      release();
    }
  }
}

class InMemorySaleStore implements SaleRepositoryPort, SaleRepositoryInterface {
  public readonly store = new Map<string, Sale>();

  async findById(id: SaleId | string): Promise<Sale | null> {
    const key = typeof id === 'string' ? id.trim() : id.value;
    return this.store.get(key) ?? null;
  }

  async save(sale: Sale): Promise<void> {
    this.store.set(sale.id.value, sale);
  }

  async findBySourceReference(
    sourceType: string,
    sourceId: string,
    tenantId?: string,
  ): Promise<Sale | null> {
    for (const s of this.store.values()) {
      if (
        s.source.sourceType === sourceType &&
        s.source.sourceId === sourceId &&
        (!tenantId || s.tenantId === tenantId) &&
        s.status !== 'CANCELLED'
      ) {
        return s;
      }
    }
    return null;
  }

  async findBySourceCode(sourceCode: string, tenantId?: string): Promise<Sale | null> {
    for (const s of this.store.values()) {
      if (
        s.source.sourceCode === sourceCode &&
        (!tenantId || s.tenantId === tenantId) &&
        s.status !== 'CANCELLED'
      ) {
        return s;
      }
    }
    return null;
  }

  async findMany(
    criteria: FindSalesCriteria,
    _pagination: FindSalesPagination,
    _sort: FindSalesSort,
  ): Promise<FindSalesResult> {
    let sales = Array.from(this.store.values());
    if (criteria.tenantId) {
      sales = sales.filter((s) => s.tenantId === criteria.tenantId);
    }
    if (criteria.clientId) {
      sales = sales.filter((s) => s.clientId === criteria.clientId);
    }
    if (criteria.status) {
      sales = sales.filter((s) => s.status === criteria.status);
    }
    return {
      items: sales.map((s) => SaleMapper.toSummaryDTO(s)),
      total: sales.length,
    };
  }
}

class InMemoryPaymentStore implements PaymentRepositoryPort {
  public readonly store = new Map<string, Payment>();
  private readonly idempotencyIndex = new Map<string, string>();

  async findById(id: PaymentId | string): Promise<Payment | null> {
    const key = typeof id === 'string' ? id.trim() : id.value;
    return this.store.get(key) ?? null;
  }

  async findBySaleId(saleId: SaleId | string): Promise<Payment[]> {
    const key = typeof saleId === 'string' ? saleId.trim() : saleId.value;
    return Array.from(this.store.values()).filter((p) => p.saleId.value === key);
  }

  async findByIdempotencyKey(idempotencyKey: string): Promise<Payment | null> {
    const paymentId = this.idempotencyIndex.get(idempotencyKey.trim());
    if (!paymentId) return null;
    return this.store.get(paymentId) ?? null;
  }

  async save(payment: Payment): Promise<void> {
    this.store.set(payment.id.value, payment);
    const maybeKey = (payment as unknown as { idempotencyKey?: string }).idempotencyKey;
    if (maybeKey) {
      this.idempotencyIndex.set(maybeKey.trim(), payment.id.value);
    }
  }
}

class InMemoryReceiptStore implements ReceiptRepositoryPort {
  public readonly store = new Map<string, Receipt>();
  private readonly sequenceGenerator = new InMemoryReceiptSequenceGenerator();

  async findById(id: ReceiptId | string): Promise<Receipt | null> {
    const key = typeof id === 'string' ? id.trim() : id.value;
    return this.store.get(key) ?? null;
  }

  async findBySaleId(saleId: SaleId | string, tenantId?: string): Promise<Receipt | null> {
    const key = typeof saleId === 'string' ? saleId.trim() : saleId.value;
    for (const r of this.store.values()) {
      if (r.saleId.value === key && (!tenantId || r.tenantId === tenantId)) {
        return r;
      }
    }
    return null;
  }

  async findByReceiptNumber(receiptNumber: ReceiptNumber | string): Promise<Receipt | null> {
    const key = typeof receiptNumber === 'string' ? receiptNumber.trim() : receiptNumber.value;
    for (const r of this.store.values()) {
      if (r.receiptNumber.value === key) return r;
    }
    return null;
  }

  async save(receipt: Receipt): Promise<void> {
    this.store.set(receipt.id.value, receipt);
  }

  async getNextReceiptNumber(tenantId: string, year: number): Promise<ReceiptNumber> {
    return this.sequenceGenerator.getNextReceiptNumber(tenantId, year);
  }
}

// ============================================================================
// Milestone 9.3: Complete Gym Business Journey Acceptance E2E Suite
// ============================================================================

describe('Milestone 9.3 — Gym Business Journey End-to-End Acceptance (Client → Enrollment → Payment → Receipt → Check-In)', () => {
  let app: INestApplication;
  let clock: TestClock;

  let clientStore: InMemoryClientStore;
  let timelineStore: InMemoryClientTimelineStore;
  let planStore: DefaultGymPlanRepository;
  let membershipStore: DefaultGymMembershipRepository;
  let attendanceStore: SerializedGymAttendanceStore;
  let saleStore: InMemorySaleStore;
  let paymentStore: InMemoryPaymentStore;
  let receiptStore: InMemoryReceiptStore;

  const TENANT_ID = 'tenant_kinergy_gym_e2e';
  let ownerToken: string;
  let receptionistToken: string;
  let trainerToken: string;
  let kitchenToken: string;

  // Shared journey state across sequential business steps
  let activeMonthlyPlanId: string;
  let archivedPlanId: string;
  let draftPlanId: string;
  let enrolledClientId: string;
  let enrolledClientReference: string;
  let createdMembershipId: string;
  let settledSaleId: string;
  let settledPaymentId: string;
  let issuedReceiptId: string;
  let issuedReceiptNumber: string;

  beforeAll(async () => {
    clock = new TestClock(new Date('2026-10-28T10:00:00.000Z'));
    clientStore = new InMemoryClientStore();
    timelineStore = new InMemoryClientTimelineStore();
    planStore = new DefaultGymPlanRepository();
    membershipStore = new DefaultGymMembershipRepository();
    attendanceStore = new SerializedGymAttendanceStore();
    saleStore = new InMemorySaleStore();
    paymentStore = new InMemoryPaymentStore();
    receiptStore = new InMemoryReceiptStore();

    const ownerPerms = ['*'];
    const receptionistPerms = [
      ...getRolePermissions('Receptionist'),
      'memberships.create',
      'memberships.read',
      'memberships.update',
      'attendance.create',
      'attendance.read',
      'plans.read',
    ];
    const trainerPerms = [
      ...getRolePermissions('Trainer'),
      'memberships.read',
      'attendance.read',
      'plans.read',
    ];
    const kitchenPerms = [...getRolePermissions('Kitchen Staff')];

    const users = new Map<string, User>([
      [
        'usr_owner_e2e',
        new User({
          id: 'usr_owner_e2e',
          email: 'owner@kinergy.platform',
          passwordHash: 'hash',
          status: UserStatus.ACTIVE,
          roles: ['Owner'],
          permissions: ownerPerms,
          tenantId: TENANT_ID,
          tokenVersion: 1,
        }),
      ],
      [
        'usr_receptionist_e2e',
        new User({
          id: 'usr_receptionist_e2e',
          email: 'receptionist@kinergy.platform',
          passwordHash: 'hash',
          status: UserStatus.ACTIVE,
          roles: ['Receptionist'],
          permissions: receptionistPerms,
          tenantId: TENANT_ID,
          tokenVersion: 1,
        }),
      ],
      [
        'usr_trainer_e2e',
        new User({
          id: 'usr_trainer_e2e',
          email: 'trainer@kinergy.platform',
          passwordHash: 'hash',
          status: UserStatus.ACTIVE,
          roles: ['Trainer'],
          permissions: trainerPerms,
          tenantId: TENANT_ID,
          tokenVersion: 1,
        }),
      ],
      [
        'usr_kitchen_e2e',
        new User({
          id: 'usr_kitchen_e2e',
          email: 'kitchen@kinergy.platform',
          passwordHash: 'hash',
          status: UserStatus.ACTIVE,
          roles: ['Kitchen Staff'],
          permissions: kitchenPerms,
          tenantId: TENANT_ID,
          tokenVersion: 1,
        }),
      ],
    ]);

    const mockUserRepository: Partial<IUserRepository> = {
      findById: async (id: string) => users.get(id) ?? null,
      findByEmail: async (email: string) =>
        Array.from(users.values()).find((u) => u.email === email) ?? null,
    };

    const mockAccessTokenService: IAccessTokenService = {
      generateToken: async (identity) =>
        JwtTestFactory.createSignedToken({
          sub: identity.userId,
          email: identity.email,
          roles: [...identity.roles],
          permissions: identity.permissions ? [...identity.permissions] : [],
          status: 'ACTIVE',
          tenantId: identity.tenantId ?? null,
          tokenVersion: identity.tokenVersion ?? 1,
        }),
      validateToken: async (token: string): Promise<IAccessTokenPayload | null> => {
        try {
          const decoded = jwt.verify(
            token,
            DEFAULT_TEST_JWT_SECRET,
          ) as unknown as IAccessTokenPayload;
          if (!decoded || !decoded.sub) return null;
          return decoded;
        } catch {
          return null;
        }
      },
    };

    ownerToken = await mockAccessTokenService.generateToken({
      userId: 'usr_owner_e2e',
      email: 'owner@kinergy.platform',
      roles: ['Owner'],
      permissions: ownerPerms,
      tenantId: TENANT_ID,
      tokenVersion: 1,
    });

    receptionistToken = await mockAccessTokenService.generateToken({
      userId: 'usr_receptionist_e2e',
      email: 'receptionist@kinergy.platform',
      roles: ['Receptionist'],
      permissions: receptionistPerms,
      tenantId: TENANT_ID,
      tokenVersion: 1,
    });

    trainerToken = await mockAccessTokenService.generateToken({
      userId: 'usr_trainer_e2e',
      email: 'trainer@kinergy.platform',
      roles: ['Trainer'],
      permissions: trainerPerms,
      tenantId: TENANT_ID,
      tokenVersion: 1,
    });

    kitchenToken = await mockAccessTokenService.generateToken({
      userId: 'usr_kitchen_e2e',
      email: 'kitchen@kinergy.platform',
      roles: ['Kitchen Staff'],
      permissions: kitchenPerms,
      tenantId: TENANT_ID,
      tokenVersion: 1,
    });

    const mockUnitOfWork: IUnitOfWork = {
      executeInTransaction: async <T>(work: () => Promise<T>): Promise<T> => work(),
    };

    @Global()
    @Module({
      imports: [ClientModule],
      providers: [
        {
          provide: PrismaService,
          useValue: {
            auditEvent: { create: jest.fn().mockResolvedValue({}) },
          },
        },
        {
          provide: USER_REPOSITORY,
          useValue: mockUserRepository,
        },
        {
          provide: 'USER_REPOSITORY',
          useValue: mockUserRepository,
        },
        {
          provide: ACCESS_TOKEN_SERVICE,
          useValue: mockAccessTokenService,
        },
        {
          provide: 'ACCESS_TOKEN_SERVICE',
          useValue: mockAccessTokenService,
        },
        {
          provide: PERMISSION_RESOLVER,
          useClass: DefaultPermissionResolver,
        },
        {
          provide: 'PERMISSION_RESOLVER',
          useClass: DefaultPermissionResolver,
        },
        {
          provide: AUTHORIZATION_EVALUATOR,
          useClass: DefaultAuthorizationEvaluator,
        },
      ],
      exports: [
        ClientModule,
        PrismaService,
        USER_REPOSITORY,
        'USER_REPOSITORY',
        ACCESS_TOKEN_SERVICE,
        'ACCESS_TOKEN_SERVICE',
        PERMISSION_RESOLVER,
        'PERMISSION_RESOLVER',
        AUTHORIZATION_EVALUATOR,
      ],
    })
    class TestGlobalPlatformModule {}

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [TestGlobalPlatformModule, GymModule, SalesModule],
    })
      .overrideProvider(PrismaClientRepository)
      .useValue(clientStore)
      .overrideProvider(PrismaClientTimelineRepository)
      .useValue(timelineStore)
      .overrideProvider(CLIENT_REPOSITORY)
      .useValue(clientStore)
      .overrideProvider(CLIENT_SEARCH_REPOSITORY)
      .useValue(clientStore)
      .overrideProvider(CLIENT_TIMELINE_REPOSITORY)
      .useValue(timelineStore)
      .overrideProvider(MEMBERSHIP_PLAN_REPOSITORY_TOKEN)
      .useValue(planStore)
      .overrideProvider(MEMBERSHIP_REPOSITORY_TOKEN)
      .useValue(membershipStore)
      .overrideProvider(ATTENDANCE_RECORD_REPOSITORY_TOKEN)
      .useValue(attendanceStore)
      .overrideProvider(GYM_CLOCK_TOKEN)
      .useValue(clock as Clock)
      .overrideProvider(SALE_REPOSITORY_TOKEN)
      .useValue(saleStore)
      .overrideProvider(PAYMENT_REPOSITORY_TOKEN)
      .useValue(paymentStore)
      .overrideProvider(RECEIPT_REPOSITORY_TOKEN)
      .useValue(receiptStore)
      .overrideProvider(UNIT_OF_WORK_TOKEN)
      .useValue(mockUnitOfWork)
      .compile();

    app = moduleFixture.createNestApplication();
    const globalPrefix = 'api/v1';
    app.setGlobalPrefix(globalPrefix, {
      exclude: [`${globalPrefix}/(.*)`, globalPrefix],
    });
    app.useGlobalFilters(new GlobalExceptionFilter());
    app.useGlobalPipes(new GlobalSanitizationValidationPipe());
    await app.init();
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  // ==========================================================================
  // STEP 1: VALIDATE CLIENT SETUP
  // ==========================================================================
  describe('Step 1: Client Setup (Creation, Validation, Retrieval, Duplicates & RBAC)', () => {
    it('rejects unauthenticated client creation and search with 401 Unauthorized', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/clients')
        .send({
          firstName: 'Unauth',
          lastName: 'User',
          email: 'unauth@kinergy.test',
          phone: '+15550109999',
        })
        .expect(401);

      await request(app.getHttpServer()).get('/api/v1/clients').expect(401);
    });

    it('rejects unauthorized role (Kitchen Staff lacking clients.read / clients.write) with 403 Forbidden', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/clients')
        .set('Authorization', `Bearer ${kitchenToken}`)
        .send({
          firstName: 'Kitchen',
          lastName: 'Attempt',
          email: 'kitchen.attempt@kinergy.test',
          phone: '+15550108888',
        })
        .expect(403);

      await request(app.getHttpServer())
        .get('/api/v1/clients')
        .set('Authorization', `Bearer ${kitchenToken}`)
        .expect(403);
    });

    it('enforces required fields and format validation on POST /api/v1/clients (400 Bad Request)', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/clients')
        .set('Authorization', `Bearer ${receptionistToken}`)
        .send({
          firstName: '',
          lastName: 'Member',
          email: 'not-an-email',
          phone: 'invalid-phone',
        })
        .expect(400);
    });

    it('creates a new client via Receptionist and retrieves the persisted record via API', async () => {
      const createRes = await request(app.getHttpServer())
        .post('/api/v1/clients')
        .set('Authorization', `Bearer ${receptionistToken}`)
        .send({
          firstName: 'Elena',
          lastName: 'Rostova',
          email: 'elena.rostova@kinergy.test',
          phone: '+15550192831',
        })
        .expect(201);

      expect(createRes.body.id).toBeDefined();
      expect(createRes.body.referenceNumber).toMatch(/^CLI-\d{4}-\d{5}$/);
      expect(createRes.body.fullName).toBe('Elena Rostova');
      expect(createRes.body.email).toBe('elena.rostova@kinergy.test');
      expect(createRes.body.phone).toBe('+15550192831');
      expect(createRes.body.status).toBe('ACTIVE');

      enrolledClientId = createRes.body.id;
      enrolledClientReference = createRes.body.referenceNumber;

      // Retrieve persisted client profile by ID
      const getRes = await request(app.getHttpServer())
        .get(`/api/v1/clients/${enrolledClientId}`)
        .set('Authorization', `Bearer ${receptionistToken}`)
        .expect(200);

      expect(getRes.body.id).toBe(enrolledClientId);
      expect(getRes.body.referenceNumber).toBe(enrolledClientReference);
      expect(getRes.body.fullName).toBe('Elena Rostova');
      expect(getRes.body.status).toBe('ACTIVE');

      // Search persisted client via reception lookup
      const searchRes = await request(app.getHttpServer())
        .get('/api/v1/clients?query=Elena')
        .set('Authorization', `Bearer ${receptionistToken}`)
        .expect(200);

      expect(searchRes.body.total).toBe(1);
      expect(searchRes.body.items[0].id).toBe(enrolledClientId);
    });

    it('enforces hard duplicate email/phone rejection (409 Conflict) and soft duplicate detection', async () => {
      // Hard duplicate email
      await request(app.getHttpServer())
        .post('/api/v1/clients')
        .set('Authorization', `Bearer ${receptionistToken}`)
        .send({
          firstName: 'Different',
          lastName: 'Person',
          email: 'elena.rostova@kinergy.test',
          phone: '+15550199999',
        })
        .expect(409);

      // Soft duplicate (identical name with different email/phone, without bypassSoftDuplicates)
      const softDupRes = await request(app.getHttpServer())
        .post('/api/v1/clients')
        .set('Authorization', `Bearer ${receptionistToken}`)
        .send({
          firstName: 'Elena',
          lastName: 'Rostova',
          email: 'elena.rostova.alt@kinergy.test',
          phone: '+15550197777',
          bypassSoftDuplicates: false,
        })
        .expect(409);

      expect(softDupRes.body.potentialMatches).toBeDefined();
      expect(softDupRes.body.potentialMatches.length).toBeGreaterThan(0);
    });
  });

  // ==========================================================================
  // STEP 2: VALIDATE MEMBERSHIP ENROLLMENT
  // ==========================================================================
  describe('Step 2: Membership Plan Catalog & Membership Enrollment', () => {
    it('creates and publishes an authoritative ACTIVE membership plan, plus DRAFT and ARCHIVED plans for negative tests', async () => {
      // Receptionist cannot create plans (403 Forbidden)
      await request(app.getHttpServer())
        .post('/api/v1/gym/membership-plans')
        .set('Authorization', `Bearer ${receptionistToken}`)
        .send({
          code: 'UNAUTHORIZED_PLAN',
          name: 'Unauthorized Plan',
          durationInDays: 30,
          priceAmount: 50,
          priceCurrency: 'USD',
        })
        .expect(403);

      // Owner creates Monthly All-Access Plan (with 10-visit quota)
      const activePlanRes = await request(app.getHttpServer())
        .post('/api/v1/gym/membership-plans')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({
          code: 'GYM_MONTHLY_10',
          name: 'Monthly 10-Pass Gym Membership',
          description: '30-day gym membership with 10 reception check-in visits',
          durationInDays: 30,
          priceAmount: 79.99,
          priceCurrency: 'USD',
          visitQuota: 10,
        })
        .expect(201);

      activeMonthlyPlanId = activePlanRes.body.id;
      expect(activePlanRes.body.status).toBe('DRAFT');

      // Publish the plan so it becomes ACTIVE
      const publishRes = await request(app.getHttpServer())
        .post(`/api/v1/gym/membership-plans/${activeMonthlyPlanId}/publish`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .expect(200);

      expect(publishRes.body.status).toBe('ACTIVE');
      expect(publishRes.body.priceAmount).toBe(79.99);
      expect(publishRes.body.visitQuota).toBe(10);

      // Create a DRAFT plan (leave unpublished)
      const draftPlanRes = await request(app.getHttpServer())
        .post('/api/v1/gym/membership-plans')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({
          code: 'GYM_DRAFT_ONLY',
          name: 'Unpublished Draft Plan',
          durationInDays: 30,
          priceAmount: 49.99,
          priceCurrency: 'USD',
        })
        .expect(201);
      draftPlanId = draftPlanRes.body.id;

      // Create and archive a plan
      const archiveCreateRes = await request(app.getHttpServer())
        .post('/api/v1/gym/membership-plans')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({
          code: 'GYM_LEGACY_ARCHIVED',
          name: 'Legacy Archived Plan',
          durationInDays: 30,
          priceAmount: 39.99,
          priceCurrency: 'USD',
        })
        .expect(201);
      archivedPlanId = archiveCreateRes.body.id;

      await request(app.getHttpServer())
        .post(`/api/v1/gym/membership-plans/${archivedPlanId}/archive`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .expect(200);

      // Receptionist loads authoritative ACTIVE plans
      const listActiveRes = await request(app.getHttpServer())
        .get('/api/v1/gym/membership-plans?status=ACTIVE')
        .set('Authorization', `Bearer ${receptionistToken}`)
        .expect(200);

      expect(listActiveRes.body.items).toHaveLength(1);
      expect(listActiveRes.body.items[0].id).toBe(activeMonthlyPlanId);
      expect(listActiveRes.body.items[0].code).toBe('GYM_MONTHLY_10');
      expect(listActiveRes.body.items[0].priceAmount).toBe(79.99);
    });

    it('rejects enrollment for non-existent client, DRAFT plan, or ARCHIVED plan', async () => {
      // Non-existent client rejected via ClientFacade lookup
      await request(app.getHttpServer())
        .post('/api/v1/gym/memberships')
        .set('Authorization', `Bearer ${receptionistToken}`)
        .send({
          clientId: 'client_does_not_exist_999',
          planId: activeMonthlyPlanId,
        })
        .expect(400);

      // DRAFT plan rejected
      await request(app.getHttpServer())
        .post('/api/v1/gym/memberships')
        .set('Authorization', `Bearer ${receptionistToken}`)
        .send({
          clientId: enrolledClientId,
          planId: draftPlanId,
        })
        .expect(400);

      // ARCHIVED plan rejected
      await request(app.getHttpServer())
        .post('/api/v1/gym/memberships')
        .set('Authorization', `Bearer ${receptionistToken}`)
        .send({
          clientId: enrolledClientId,
          planId: archivedPlanId,
        })
        .expect(400);
    });

    it('enrolls the persisted client in the active plan and retrieves the membership after navigation/refresh', async () => {
      const enrollRes = await request(app.getHttpServer())
        .post('/api/v1/gym/memberships')
        .set('Authorization', `Bearer ${receptionistToken}`)
        .send({
          clientId: enrolledClientId,
          planId: activeMonthlyPlanId,
          assignedTrainerId: 'usr_trainer_e2e',
        })
        .expect(201);

      expect(enrollRes.body.id).toBeDefined();
      expect(enrollRes.body.clientId).toBe(enrolledClientId);
      expect(enrollRes.body.planId).toBe(activeMonthlyPlanId);
      expect(enrollRes.body.status).toBe('ACTIVE');
      expect(enrollRes.body.period.durationDays).toBe(30);
      expect(enrollRes.body.assignedTrainerId).toBe('usr_trainer_e2e');

      createdMembershipId = enrollRes.body.id;

      // Reject overlapping active membership for the same client
      await request(app.getHttpServer())
        .post('/api/v1/gym/memberships')
        .set('Authorization', `Bearer ${receptionistToken}`)
        .send({
          clientId: enrolledClientId,
          planId: activeMonthlyPlanId,
        })
        .expect(400);

      // Retrieve membership by ID (simulating page refresh)
      const getMembershipRes = await request(app.getHttpServer())
        .get(`/api/v1/gym/memberships/${createdMembershipId}`)
        .set('Authorization', `Bearer ${receptionistToken}`)
        .expect(200);

      expect(getMembershipRes.body.id).toBe(createdMembershipId);
      expect(getMembershipRes.body.clientId).toBe(enrolledClientId);
      expect(getMembershipRes.body.status).toBe('ACTIVE');

      // Retrieve membership list filtered by clientId
      const listMembershipsRes = await request(app.getHttpServer())
        .get(`/api/v1/gym/memberships?clientId=${enrolledClientId}`)
        .set('Authorization', `Bearer ${receptionistToken}`)
        .expect(200);

      expect(listMembershipsRes.body.total).toBe(1);
      expect(listMembershipsRes.body.items[0].id).toBe(createdMembershipId);
    });
  });

  // ==========================================================================
  // STEP 3: VALIDATE COMMERCIAL SALE & PAYMENT
  // ==========================================================================
  describe('Step 3: Commercial Sale Creation & Payment Lifecycle', () => {
    it('rejects sale creation for ARCHIVED membership plan or non-existent client', async () => {
      // Archived plan rejected by GymSourceValidatorAdapter
      await request(app.getHttpServer())
        .post('/api/v1/sales')
        .set('Authorization', `Bearer ${receptionistToken}`)
        .send({
          clientId: enrolledClientId,
          currency: 'USD',
          sourceReference: {
            type: 'GYM_MEMBERSHIP',
            referenceId: archivedPlanId,
          },
        })
        .expect(400);

      // Non-existent client rejected by ClientFacade in CreateSaleHandler
      await request(app.getHttpServer())
        .post('/api/v1/sales')
        .set('Authorization', `Bearer ${receptionistToken}`)
        .send({
          clientId: 'client_unknown_404',
          currency: 'USD',
          sourceReference: {
            type: 'GYM_MEMBERSHIP',
            referenceId: activeMonthlyPlanId,
          },
        })
        .expect(404);
    });

    it('creates a GYM_MEMBERSHIP sale with authoritative plan price snapshot, supports idempotent retry, and finalizes to PENDING_PAYMENT', async () => {
      const idempotencyKey = 'idem_gym_sale_elena_001';

      const saleCreateRes = await request(app.getHttpServer())
        .post('/api/v1/sales')
        .set('Authorization', `Bearer ${receptionistToken}`)
        .set('x-idempotency-key', idempotencyKey)
        .send({
          clientId: enrolledClientId,
          currency: 'USD',
          sourceReference: {
            type: 'GYM_MEMBERSHIP',
            referenceId: activeMonthlyPlanId,
            referenceCode: createdMembershipId,
          },
        })
        .expect(201);

      settledSaleId = saleCreateRes.body.id;
      expect(saleCreateRes.body.status).toBe('DRAFT');
      expect(saleCreateRes.body.clientId).toBe(enrolledClientId);
      expect(saleCreateRes.body.subtotalAmount).toBe(79.99);
      expect(saleCreateRes.body.discountTotalAmount).toBe(0);
      expect(saleCreateRes.body.totalAmount).toBe(79.99);
      expect(saleCreateRes.body.items).toHaveLength(1);
      expect(saleCreateRes.body.items[0].description).toBe(
        'Gym Membership - Monthly 10-Pass Gym Membership',
      );
      expect(saleCreateRes.body.items[0].skuOrCode).toBe('GYM_MONTHLY_10');
      expect(saleCreateRes.body.items[0].unitPriceAmount).toBe(79.99);

      // Replaying the exact same request with x-idempotency-key returns the same sale without duplicating
      const replaySaleRes = await request(app.getHttpServer())
        .post('/api/v1/sales')
        .set('Authorization', `Bearer ${receptionistToken}`)
        .set('x-idempotency-key', idempotencyKey)
        .send({
          clientId: enrolledClientId,
          currency: 'USD',
          sourceReference: {
            type: 'GYM_MEMBERSHIP',
            referenceId: activeMonthlyPlanId,
            referenceCode: createdMembershipId,
          },
        })
        .expect(201);

      expect(replaySaleRes.body.id).toBe(settledSaleId);
      expect(saleStore.store.size).toBe(1);

      // Finalize Sale (DRAFT -> PENDING_PAYMENT)
      const finalizeRes = await request(app.getHttpServer())
        .post(`/api/v1/sales/${settledSaleId}/finalize`)
        .set('Authorization', `Bearer ${receptionistToken}`)
        .send({})
        .expect(200);

      expect(finalizeRes.body.status).toBe('PENDING_PAYMENT');
      expect(finalizeRes.body.totalAmount).toBe(79.99);
    });

    it('ensures PENDING and FAILED payments do NOT mark the Sale as settled or allow receipt issuance', async () => {
      // 1. Record a QR payment (initializes as PENDING, not COMPLETED)
      const qrPaymentRes = await request(app.getHttpServer())
        .post(`/api/v1/sales/${settledSaleId}/payments`)
        .set('Authorization', `Bearer ${receptionistToken}`)
        .send({
          method: 'QR',
          amount: 79.99,
          status: 'PENDING',
          reference: 'QR-ATTEMPT-001',
          idempotencyKey: 'idem_qr_attempt_001',
        })
        .expect(201);

      const qrPaymentId = qrPaymentRes.body.id;
      expect(qrPaymentRes.body.status).toBe('PENDING');

      // Sale must still be PENDING_PAYMENT while QR payment is PENDING
      const saleWhilePending = await request(app.getHttpServer())
        .get(`/api/v1/sales/${settledSaleId}`)
        .set('Authorization', `Bearer ${receptionistToken}`)
        .expect(200);
      expect(saleWhilePending.body.status).toBe('PENDING_PAYMENT');

      // Receipt issuance must be rejected (422) while payment is PENDING
      await request(app.getHttpServer())
        .post(`/api/v1/sales/${settledSaleId}/receipt`)
        .set('Authorization', `Bearer ${receptionistToken}`)
        .send({})
        .expect(422);

      // 2. Mark the QR payment as FAILED (e.g. customer QR timeout)
      const failPaymentRes = await request(app.getHttpServer())
        .post(`/api/v1/payments/${qrPaymentId}/fail`)
        .set('Authorization', `Bearer ${receptionistToken}`)
        .send({ reason: 'Customer QR session timed out' })
        .expect(200);

      expect(failPaymentRes.body.status).toBe('FAILED');

      // Sale must still be PENDING_PAYMENT after failed tender
      const saleAfterFailed = await request(app.getHttpServer())
        .get(`/api/v1/sales/${settledSaleId}`)
        .set('Authorization', `Bearer ${receptionistToken}`)
        .expect(200);
      expect(saleAfterFailed.body.status).toBe('PENDING_PAYMENT');
    });

    it('rejects overpayment exceeding remaining balance and settles sale atomically on exact CASH payment with idempotent protection', async () => {
      // Overpayment ($100.00 > $79.99) rejected with 422
      await request(app.getHttpServer())
        .post(`/api/v1/sales/${settledSaleId}/payments`)
        .set('Authorization', `Bearer ${receptionistToken}`)
        .send({
          method: 'CASH',
          amount: 100.0,
          reference: 'CASH-OVERPAY',
        })
        .expect(422);

      // Valid CASH payment ($79.99) settles immediately
      const paymentIdemKey = 'idem_cash_settle_elena_001';
      const cashPaymentRes = await request(app.getHttpServer())
        .post(`/api/v1/sales/${settledSaleId}/payments`)
        .set('Authorization', `Bearer ${receptionistToken}`)
        .send({
          method: 'CASH',
          amount: 79.99,
          reference: 'DRAWER-A-001',
          idempotencyKey: paymentIdemKey,
        })
        .expect(201);

      settledPaymentId = cashPaymentRes.body.id;
      expect(cashPaymentRes.body.status).toBe('COMPLETED');
      expect(cashPaymentRes.body.amountValue).toBe(79.99);
      expect(cashPaymentRes.body.amount.amount).toBe(79.99);
      expect(cashPaymentRes.body.amount.currency).toBe('USD');

      // Repeated payment submission with same idempotencyKey returns the exact same payment
      const replayPaymentRes = await request(app.getHttpServer())
        .post(`/api/v1/sales/${settledSaleId}/payments`)
        .set('Authorization', `Bearer ${receptionistToken}`)
        .send({
          method: 'CASH',
          amount: 79.99,
          reference: 'DRAWER-A-001',
          idempotencyKey: paymentIdemKey,
        })
        .expect(201);

      expect(replayPaymentRes.body.id).toBe(settledPaymentId);

      // Verify Sale is now PAID in backend API
      const paidSaleRes = await request(app.getHttpServer())
        .get(`/api/v1/sales/${settledSaleId}`)
        .set('Authorization', `Bearer ${receptionistToken}`)
        .expect(200);

      expect(paidSaleRes.body.status).toBe('PAID');
      expect(paidSaleRes.body.totalAmount).toBe(79.99);

      // Verify Payment history for the sale contains both the FAILED attempt and COMPLETED settlement
      const salePaymentsRes = await request(app.getHttpServer())
        .get(`/api/v1/sales/${settledSaleId}/payments`)
        .set('Authorization', `Bearer ${receptionistToken}`)
        .expect(200);

      expect(salePaymentsRes.body).toHaveLength(2);
      const completedTenders = salePaymentsRes.body.filter(
        (p: { status: string }) => p.status === 'COMPLETED',
      );
      expect(completedTenders).toHaveLength(1);
      expect(completedTenders[0].id).toBe(settledPaymentId);
    });
  });

  // ==========================================================================
  // STEP 4: VALIDATE RECEIPT
  // ==========================================================================
  describe('Step 4: Receipt Eligibility, Authoritative Snapshots, Idempotency & RBAC', () => {
    it('denies receipt issuance to roles lacking receipts.manage (e.g. Trainer -> 403 Forbidden)', async () => {
      await request(app.getHttpServer())
        .post(`/api/v1/sales/${settledSaleId}/receipt`)
        .set('Authorization', `Bearer ${trainerToken}`)
        .send({})
        .expect(403);
    });

    it('issues an official receipt for the settled sale with authoritative client, item, and payment snapshots', async () => {
      const issueRes = await request(app.getHttpServer())
        .post(`/api/v1/sales/${settledSaleId}/receipt`)
        .set('Authorization', `Bearer ${receptionistToken}`)
        .send({})
        .expect(201);

      issuedReceiptId = issueRes.body.id;
      issuedReceiptNumber = issueRes.body.receiptNumber;

      expect(issuedReceiptId).toBeDefined();
      expect(issuedReceiptNumber).toMatch(/^REC-\d{4}-\d{6}$/);
      expect(issueRes.body.saleId).toBe(settledSaleId);
      expect(issueRes.body.status).toBe('ISSUED');
      expect(issueRes.body.reprintCount).toBe(0);
      expect(issueRes.body.lastReprintedAt).toBeNull();

      // Monetary values match Sale snapshot
      expect(issueRes.body.subtotal.amount).toBe(79.99);
      expect(issueRes.body.discountTotal.amount).toBe(0);
      expect(issueRes.body.total.amount).toBe(79.99);

      // Client snapshot comes from authoritative ClientModule via ClientFacade
      expect(issueRes.body.clientSnapshot).toBeDefined();
      expect(issueRes.body.clientSnapshot.clientId).toBe(enrolledClientId);
      expect(issueRes.body.clientSnapshot.fullName).toBe('Elena Rostova');
      expect(issueRes.body.clientSnapshot.email).toBe('elena.rostova@kinergy.test');

      // Item snapshot & Payment snapshot
      expect(issueRes.body.items).toHaveLength(1);
      expect(issueRes.body.items[0].description).toBe(
        'Gym Membership - Monthly 10-Pass Gym Membership',
      );
      expect(issueRes.body.payments).toHaveLength(1);
      expect(issueRes.body.payments[0].paymentId).toBe(settledPaymentId);
      expect(issueRes.body.payments[0].method).toBe('CASH');
      expect(issueRes.body.payments[0].amount.amount).toBe(79.99);
    });

    it('returns the identical receipt on repeated issuance and tracks reprints accurately', async () => {
      // Idempotent re-POST returns same receipt ID and number
      const duplicateIssueRes = await request(app.getHttpServer())
        .post(`/api/v1/sales/${settledSaleId}/receipt`)
        .set('Authorization', `Bearer ${receptionistToken}`)
        .send({})
        .expect(201);

      expect(duplicateIssueRes.body.id).toBe(issuedReceiptId);
      expect(duplicateIssueRes.body.receiptNumber).toBe(issuedReceiptNumber);
      expect(duplicateIssueRes.body.reprintCount).toBe(0);

      // Retrieve via GET /api/v1/sales/:id/receipt and GET /api/v1/receipts/:id
      const getBySaleRes = await request(app.getHttpServer())
        .get(`/api/v1/sales/${settledSaleId}/receipt`)
        .set('Authorization', `Bearer ${receptionistToken}`)
        .expect(200);
      expect(getBySaleRes.body.id).toBe(issuedReceiptId);

      // Reprint increments reprintCount and sets status to REPRINTED
      const reprintRes = await request(app.getHttpServer())
        .post(`/api/v1/receipts/${issuedReceiptId}/reprint`)
        .set('Authorization', `Bearer ${receptionistToken}`)
        .send({})
        .expect(200);

      expect(reprintRes.body.id).toBe(issuedReceiptId);
      expect(reprintRes.body.reprintCount).toBe(1);
      expect(reprintRes.body.status).toBe('REPRINTED');
      expect(reprintRes.body.lastReprintedAt).toBeTruthy();
    });
  });

  // ==========================================================================
  // STEP 5: VALIDATE RECEPTION CHECK-IN & NEGATIVE/RECOVERY SCENARIOS
  // ==========================================================================
  describe('Step 5: Reception Check-In, Eligibility, Cooldown/Concurrency & Negative Scenarios', () => {
    it('evaluates live eligibility as GRANTED and persists check-in via reception lookup', async () => {
      // 0. Reception searches client via GET /api/v1/clients/search?q=Elena
      const quickSearchRes = await request(app.getHttpServer())
        .get('/api/v1/clients/search?q=Elena')
        .set('Authorization', `Bearer ${receptionistToken}`)
        .expect(200);

      expect(Array.isArray(quickSearchRes.body)).toBe(true);
      expect(quickSearchRes.body).toHaveLength(1);
      expect(quickSearchRes.body[0].id).toBe(enrolledClientId);
      expect(quickSearchRes.body[0].fullName).toBe('Elena Rostova');

      // 1. Check live eligibility via authoritative endpoint
      const eligRes = await request(app.getHttpServer())
        .get(`/api/v1/gym/memberships/eligibility/check?clientId=${enrolledClientId}`)
        .set('Authorization', `Bearer ${receptionistToken}`)
        .expect(200);

      expect(eligRes.body.isEligible).toBe(true);
      expect(['ELIGIBLE', 'GRANTED']).toContain(eligRes.body.outcome);
      expect(eligRes.body.membershipId).toBe(createdMembershipId);
      expect(eligRes.body.planId).toBe(activeMonthlyPlanId);

      // 2. Record reception check-in
      const checkInRes = await request(app.getHttpServer())
        .post('/api/v1/gym/attendance/check-in')
        .set('Authorization', `Bearer ${receptionistToken}`)
        .send({
          clientId: enrolledClientId,
          method: 'MANUAL_RECEPTION',
          notes: 'Day 1 reception check-in',
        })
        .expect(200);

      expect(checkInRes.body.isGranted).toBe(true);
      expect(checkInRes.body.outcome).toBe('GRANTED');
      expect(checkInRes.body.clientId).toBe(enrolledClientId);
      expect(checkInRes.body.membershipId).toBe(createdMembershipId);
      expect(checkInRes.body.attendanceId).toBeDefined();
    });

    it('blocks rapid duplicate check-in within cooldown window with DENIED_DUPLICATE_CHECKIN', async () => {
      // Advance clock by only 2 minutes (cooldown is within same GymDay / cooldown window)
      clock.advanceBy(2 * 60 * 1000);

      const dupCheckInRes = await request(app.getHttpServer())
        .post('/api/v1/gym/attendance/check-in')
        .set('Authorization', `Bearer ${receptionistToken}`)
        .send({
          clientId: enrolledClientId,
          method: 'MANUAL_RECEPTION',
        })
        .expect(200);

      expect(dupCheckInRes.body.isGranted).toBe(false);
      expect(dupCheckInRes.body.outcome).toBe('DENIED_DUPLICATE_CHECKIN');
      expect(dupCheckInRes.body.isDuplicate).toBe(true);
      expect(dupCheckInRes.body.denialReason).toBeTruthy();
    });

    it('handles concurrent check-in requests safely via serialized execution lock (granting 1 and denying 1)', async () => {
      // Advance clock to next GymDay (24 hours) so client is eligible for a fresh daily check-in
      clock.advanceBy(24 * 60 * 60 * 1000);

      const [resA, resB] = await Promise.all([
        request(app.getHttpServer())
          .post('/api/v1/gym/attendance/check-in')
          .set('Authorization', `Bearer ${receptionistToken}`)
          .send({ clientId: enrolledClientId, method: 'MANUAL_RECEPTION' }),
        request(app.getHttpServer())
          .post('/api/v1/gym/attendance/check-in')
          .set('Authorization', `Bearer ${receptionistToken}`)
          .send({ clientId: enrolledClientId, method: 'MANUAL_RECEPTION' }),
      ]);

      expect(resA.status).toBe(200);
      expect(resB.status).toBe(200);

      const outcomes = [resA.body.outcome, resB.body.outcome].sort();
      expect(outcomes).toEqual(['DENIED_DUPLICATE_CHECKIN', 'GRANTED']);
    });

    it('denies check-in with DENIED_FROZEN when membership is frozen and restores GRANTED after unfreezing', async () => {
      // Advance to Day 3
      clock.advanceBy(24 * 60 * 60 * 1000);
      const freezeStart = clock.now().toISOString();
      const freezeEnd = new Date(clock.now().getTime() + 5 * 24 * 60 * 60 * 1000).toISOString();

      // Freeze membership
      const freezeRes = await request(app.getHttpServer())
        .post(`/api/v1/gym/memberships/${createdMembershipId}/freeze`)
        .set('Authorization', `Bearer ${receptionistToken}`)
        .send({
          startDate: freezeStart,
          endDate: freezeEnd,
          reason: 'Client traveling for 5 days',
        })
        .expect(200);
      expect(freezeRes.body.status).toBe('FROZEN');

      // Eligibility endpoint reports ineligible while frozen
      const eligFrozen = await request(app.getHttpServer())
        .get(
          `/api/v1/gym/memberships/eligibility/check?clientId=${enrolledClientId}&asOf=${encodeURIComponent(clock.now().toISOString())}`,
        )
        .set('Authorization', `Bearer ${receptionistToken}`)
        .expect(200);
      expect(eligFrozen.body.isEligible).toBe(false);
      expect(['FROZEN', 'MEMBERSHIP_FROZEN', 'DENIED_FROZEN']).toContain(eligFrozen.body.outcome);

      // Check-in attempt while frozen is denied with DENIED_FROZEN
      const frozenCheckIn = await request(app.getHttpServer())
        .post('/api/v1/gym/attendance/check-in')
        .set('Authorization', `Bearer ${receptionistToken}`)
        .send({ clientId: enrolledClientId, method: 'MANUAL_RECEPTION' })
        .expect(200);
      expect(frozenCheckIn.body.isGranted).toBe(false);
      expect(frozenCheckIn.body.outcome).toBe('DENIED_FROZEN');

      // Advance 6 days (past the 5-day freeze window) and unfreeze membership
      clock.advanceBy(6 * 24 * 60 * 60 * 1000);
      const unfreezeRes = await request(app.getHttpServer())
        .post(`/api/v1/gym/memberships/${createdMembershipId}/unfreeze`)
        .set('Authorization', `Bearer ${receptionistToken}`)
        .expect(200);
      expect(unfreezeRes.body.status).toBe('ACTIVE');

      // Check-in succeeds after unfreeze
      const afterUnfreezeCheckIn = await request(app.getHttpServer())
        .post('/api/v1/gym/attendance/check-in')
        .set('Authorization', `Bearer ${receptionistToken}`)
        .send({ clientId: enrolledClientId, method: 'MANUAL_RECEPTION' })
        .expect(200);
      expect(afterUnfreezeCheckIn.body.isGranted).toBe(true);
      expect(afterUnfreezeCheckIn.body.outcome).toBe('GRANTED');
    });

    it('denies check-in with DENIED_EXPIRED after membership endDate and DENIED_NO_MEMBERSHIP for unenrolled client', async () => {
      // Create a second client with no membership
      const walkInClientRes = await request(app.getHttpServer())
        .post('/api/v1/clients')
        .set('Authorization', `Bearer ${receptionistToken}`)
        .send({
          firstName: 'Marcus',
          lastName: 'Vance',
          email: 'marcus.vance@kinergy.test',
          phone: '+15550194444',
        })
        .expect(201);

      const unenrolledClientId = walkInClientRes.body.id;

      const noMemCheckIn = await request(app.getHttpServer())
        .post('/api/v1/gym/attendance/check-in')
        .set('Authorization', `Bearer ${receptionistToken}`)
        .send({ clientId: unenrolledClientId, method: 'MANUAL_RECEPTION' })
        .expect(200);
      expect(noMemCheckIn.body.isGranted).toBe(false);
      expect(noMemCheckIn.body.outcome).toBe('DENIED_NO_MEMBERSHIP');

      // Advance clock 45 days past Elena's membership expiration date
      clock.advanceBy(45 * 24 * 60 * 60 * 1000);

      const expiredCheckIn = await request(app.getHttpServer())
        .post('/api/v1/gym/attendance/check-in')
        .set('Authorization', `Bearer ${receptionistToken}`)
        .send({ clientId: enrolledClientId, method: 'MANUAL_RECEPTION' })
        .expect(200);

      expect(expiredCheckIn.body.isGranted).toBe(false);
      expect(expiredCheckIn.body.outcome).toBe('DENIED_EXPIRED');
    });

    it('retrieves complete persisted attendance history for the client', async () => {
      const historyRes = await request(app.getHttpServer())
        .get(`/api/v1/gym/attendance/client/${enrolledClientId}`)
        .set('Authorization', `Bearer ${receptionistToken}`)
        .expect(200);

      // Elena had: 1 GRANTED + 1 DENIED_DUPLICATE + (1 GRANTED + 1 DENIED_DUPLICATE from concurrent) + 1 DENIED_FROZEN + 1 GRANTED + 1 DENIED_EXPIRED = 7 records
      expect(historyRes.body.pagination.totalItems).toBe(7);
      const grantedCount = historyRes.body.items.filter(
        (r: { result: string }) => r.result === 'GRANTED',
      ).length;
      expect(grantedCount).toBe(3);
      expect(historyRes.body.clientStats.totalVisits).toBe(3);
    });
  });

  // ==========================================================================
  // STEP 6: VERIFY CROSS-DOMAIN PERSISTED STATE CONSISTENCY
  // ==========================================================================
  describe('Step 6: Cross-Domain Persisted State Consistency Verification', () => {
    it('maintains referential and financial consistency across Client, Membership, Sale, Payment, Receipt, and Attendance stores', async () => {
      // 1. Client persisted state
      const persistedClient = await clientStore.findById(ClientId.create(enrolledClientId));
      expect(persistedClient).not.toBeNull();
      expect(persistedClient!.name.fullName).toBe('Elena Rostova');
      expect(persistedClient!.status).toBe(ClientStatus.ACTIVE);

      // 2. Membership persisted state
      const persistedMembership = await membershipStore.findById(createdMembershipId);
      expect(persistedMembership).not.toBeNull();
      expect(persistedMembership!.clientId).toBe(enrolledClientId);
      expect(persistedMembership!.planId).toBe(activeMonthlyPlanId);
      expect(persistedMembership!.freezeHistory).toHaveLength(1);

      // 3. Sale persisted state
      const persistedSale = await saleStore.findById(settledSaleId);
      expect(persistedSale).not.toBeNull();
      expect(persistedSale!.clientId).toBe(enrolledClientId);
      expect(persistedSale!.status).toBe('PAID');
      expect(persistedSale!.total.amount).toBe(79.99);
      expect(persistedSale!.source.sourceId).toBe(activeMonthlyPlanId);

      // 4. Payment persisted state
      const persistedPayment = await paymentStore.findById(settledPaymentId);
      expect(persistedPayment).not.toBeNull();
      expect(persistedPayment!.saleId.value).toBe(settledSaleId);
      expect(persistedPayment!.status).toBe('COMPLETED');
      expect(persistedPayment!.amount.amount).toBe(79.99);

      // 5. Receipt persisted state
      const persistedReceipt = await receiptStore.findById(issuedReceiptId);
      expect(persistedReceipt).not.toBeNull();
      expect(persistedReceipt!.saleId.value).toBe(settledSaleId);
      expect(persistedReceipt!.receiptNumber.value).toBe(issuedReceiptNumber);
      expect(persistedReceipt!.clientSnapshot?.clientId).toBe(enrolledClientId);
      expect(persistedReceipt!.clientSnapshot?.fullName).toBe('Elena Rostova');
      expect(persistedReceipt!.total.amount).toBe(79.99);
      expect(persistedReceipt!.reprintCount).toBe(1);

      // 6. Attendance persisted state
      const clientAttendance = await attendanceStore.findByClientId(enrolledClientId);
      expect(clientAttendance).toHaveLength(7);
      expect(clientAttendance.every((r) => r.clientId === enrolledClientId)).toBe(true);
    });
  });
});
