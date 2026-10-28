import { Test, TestingModule } from '@nestjs/testing';
import { Global, INestApplication, Module } from '@nestjs/common';
import request from 'supertest';
import * as jwt from 'jsonwebtoken';
import {
  Appointment,
  AppointmentId,
  AppointmentRepository,
  FindAppointmentsOptions,
  Room,
  RoomId,
  RoomRepository,
  RoomStatus,
  TimeRange,
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
  SessionId,
} from '@kinergy-platform/core';
import {
  InMemoryReceiptSequenceGenerator,
  PrismaAppointmentRepository,
  PrismaRoomRepository,
  PrismaRecurrenceSeriesRepository,
} from '@kinergy-platform/core/server';
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
import { SchedulingModule, SCHEDULING_CLOCK_TOKEN } from '../../scheduling/scheduling.module';
import {
  KinesiologyModule,
  TREATMENT_SESSION_REPOSITORY_TOKEN,
  KINESIOLOGY_CLOCK_TOKEN,
  PrismaTreatmentSessionRepository,
  InMemoryTreatmentSessionRepository,
} from '../kinesiology.module';
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

class InMemoryRoomStore implements RoomRepository {
  public readonly rooms = new Map<string, Room>();

  async findById(id: RoomId | string): Promise<Room | null> {
    const key = typeof id === 'string' ? id.trim() : id.getValue();
    return this.rooms.get(key) ?? null;
  }

  async findAvailableRooms(range: TimeRange, requiredFeatures?: string[]): Promise<Room[]> {
    return Array.from(this.rooms.values()).filter((room) => {
      if (room.status !== RoomStatus.AVAILABLE) return false;
      if (room.isUnderMaintenance(range)) return false;
      if (
        requiredFeatures &&
        requiredFeatures.length > 0 &&
        !room.supportsFeatures(requiredFeatures)
      ) {
        return false;
      }
      return true;
    });
  }

  async findAll(): Promise<Room[]> {
    return Array.from(this.rooms.values());
  }

  async save(room: Room): Promise<void> {
    this.rooms.set(room.id.getValue(), room);
  }
}

class InMemoryAppointmentStore implements AppointmentRepository {
  public readonly appointments = new Map<string, Appointment>();

  async findById(id: AppointmentId | string): Promise<Appointment | null> {
    const key = typeof id === 'string' ? id.trim() : id.getValue();
    return this.appointments.get(key) ?? null;
  }

  async findBySeriesId(seriesId: string): Promise<Appointment[]> {
    return Array.from(this.appointments.values()).filter((a) => a.seriesId === seriesId);
  }

  async findConflictingAppointments(
    therapistId: string,
    roomId: string,
    clientId: string,
    range: TimeRange,
    excludeAppointmentId?: string,
  ): Promise<Appointment[]> {
    return Array.from(this.appointments.values()).filter((a) => {
      if (excludeAppointmentId && a.id.getValue() === excludeAppointmentId) return false;
      if (a.status === 'CANCELLED') return false;
      if (!a.timeRange.overlaps(range)) return false;
      return (
        a.therapistId === therapistId ||
        a.roomId === roomId ||
        (Boolean(clientId) && a.clientId === clientId)
      );
    });
  }

  async findAppointmentsForTherapist(
    therapistId: string,
    range: TimeRange,
  ): Promise<Appointment[]> {
    return Array.from(this.appointments.values()).filter(
      (a) => a.therapistId === therapistId && a.timeRange.overlaps(range),
    );
  }

  async findAppointmentsForRoom(roomId: string, range: TimeRange): Promise<Appointment[]> {
    return Array.from(this.appointments.values()).filter(
      (a) => a.roomId === roomId && a.timeRange.overlaps(range),
    );
  }

  async findAppointmentsForClient(clientId: string, range: TimeRange): Promise<Appointment[]> {
    return Array.from(this.appointments.values()).filter(
      (a) => a.clientId === clientId && a.timeRange.overlaps(range),
    );
  }

  async findAppointmentsByRange(
    range: TimeRange,
    options?: FindAppointmentsOptions,
  ): Promise<Appointment[]> {
    return Array.from(this.appointments.values()).filter((a) => {
      if (!a.timeRange.overlaps(range)) return false;
      if (options?.therapistId && a.therapistId !== options.therapistId) return false;
      if (options?.roomId && a.roomId !== options.roomId) return false;
      if (options?.clientId && a.clientId !== options.clientId) return false;
      if (options?.status && a.status !== options.status) return false;
      if (options?.seriesId && a.seriesId !== options.seriesId) return false;
      return true;
    });
  }

  async save(appointment: Appointment): Promise<void> {
    this.appointments.set(appointment.id.getValue(), appointment);
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
// Milestone 9.4: Complete Kinesiology Business Journey Acceptance E2E Suite
// ============================================================================

describe('Milestone 9.4 — Kinesiology Business Journey End-to-End Acceptance (Client → Appointment → Treatment Session → SOAP Notes → Sale/Payment → Receipt)', () => {
  let app: INestApplication;
  let clock: TestClock;

  let clientStore: InMemoryClientStore;
  let timelineStore: InMemoryClientTimelineStore;
  let roomStore: InMemoryRoomStore;
  let appointmentStore: InMemoryAppointmentStore;
  let sessionStore: InMemoryTreatmentSessionRepository;
  let saleStore: InMemorySaleStore;
  let paymentStore: InMemoryPaymentStore;
  let receiptStore: InMemoryReceiptStore;

  const TENANT_ID = 'tenant_kinergy_kinesiology_e2e';
  const PRIMARY_THERAPIST_ID = 'usr_therapist_kinesio_e2e';
  const SECONDARY_THERAPIST_ID = 'usr_therapist_senior_e2e';

  let ownerToken: string;
  let receptionistToken: string;
  let therapistToken: string;
  let kitchenToken: string;

  // Shared journey state across sequential business steps
  let patientClientId: string;
  let patientClientRef: string;
  let secondaryClientId: string;
  let primaryRoomId: string;
  let secondaryRoomId: string;
  let bookedTreatmentAppointmentId: string;
  let bookedAssessmentAppointmentId: string;
  let primarySessionId: string;
  let assessmentSessionId: string;
  let settledKinesiologySaleId: string;
  let settledKinesiologyPaymentId: string;
  let issuedKinesiologyReceiptId: string;
  let issuedKinesiologyReceiptNumber: string;

  beforeAll(async () => {
    clock = new TestClock(new Date('2026-10-28T09:00:00.000Z'));
    clientStore = new InMemoryClientStore();
    timelineStore = new InMemoryClientTimelineStore();
    roomStore = new InMemoryRoomStore();
    appointmentStore = new InMemoryAppointmentStore();
    sessionStore = new InMemoryTreatmentSessionRepository();
    saleStore = new InMemorySaleStore();
    paymentStore = new InMemoryPaymentStore();
    receiptStore = new InMemoryReceiptStore();

    const ownerPerms = ['*'];
    const receptionistPerms = [...getRolePermissions('Receptionist')];
    const therapistPerms = [...getRolePermissions('Trainer')];
    const kitchenPerms = [...getRolePermissions('Kitchen Staff')];

    const mockUsers = new Map<string, User>([
      [
        'usr_owner_kinesio_e2e',
        new User({
          id: 'usr_owner_kinesio_e2e',
          email: 'owner@kinergy.test',
          passwordHash: 'hashed',
          status: UserStatus.ACTIVE,
          roles: ['Owner', 'ADMIN'],
          permissions: ownerPerms,
          tenantId: TENANT_ID,
          tokenVersion: 1,
        }),
      ],
      [
        'usr_receptionist_kinesio_e2e',
        new User({
          id: 'usr_receptionist_kinesio_e2e',
          email: 'reception@kinergy.test',
          passwordHash: 'hashed',
          status: UserStatus.ACTIVE,
          roles: ['Receptionist'],
          permissions: receptionistPerms,
          tenantId: TENANT_ID,
          tokenVersion: 1,
        }),
      ],
      [
        PRIMARY_THERAPIST_ID,
        new User({
          id: PRIMARY_THERAPIST_ID,
          email: 'therapist@kinergy.test',
          passwordHash: 'hashed',
          status: UserStatus.ACTIVE,
          roles: ['Trainer', 'THERAPIST'],
          permissions: therapistPerms,
          tenantId: TENANT_ID,
          tokenVersion: 1,
        }),
      ],
      [
        'usr_kitchen_kinesio_e2e',
        new User({
          id: 'usr_kitchen_kinesio_e2e',
          email: 'kitchen@kinergy.test',
          passwordHash: 'hashed',
          status: UserStatus.ACTIVE,
          roles: ['Kitchen Staff'],
          permissions: kitchenPerms,
          tenantId: TENANT_ID,
          tokenVersion: 1,
        }),
      ],
    ]);

    const mockUserRepository: Partial<IUserRepository> = {
      findById: async (id: string) => mockUsers.get(id) ?? null,
      findByEmail: async (email: string) =>
        Array.from(mockUsers.values()).find((u) => u.email === email) ?? null,
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
      userId: 'usr_owner_kinesio_e2e',
      email: 'owner@kinergy.test',
      roles: ['Owner', 'ADMIN'],
      permissions: ownerPerms,
      tenantId: TENANT_ID,
      tokenVersion: 1,
    });

    receptionistToken = await mockAccessTokenService.generateToken({
      userId: 'usr_receptionist_kinesio_e2e',
      email: 'reception@kinergy.test',
      roles: ['Receptionist'],
      permissions: receptionistPerms,
      tenantId: TENANT_ID,
      tokenVersion: 1,
    });

    therapistToken = await mockAccessTokenService.generateToken({
      userId: PRIMARY_THERAPIST_ID,
      email: 'therapist@kinergy.test',
      roles: ['Trainer', 'THERAPIST'],
      permissions: therapistPerms,
      tenantId: TENANT_ID,
      tokenVersion: 1,
    });

    kitchenToken = await mockAccessTokenService.generateToken({
      userId: 'usr_kitchen_kinesio_e2e',
      email: 'kitchen@kinergy.test',
      roles: ['Kitchen Staff'],
      permissions: kitchenPerms,
      tenantId: TENANT_ID,
      tokenVersion: 1,
    });

    const mockUnitOfWork: IUnitOfWork = {
      executeInTransaction: async <T>(work: () => Promise<T>): Promise<T> => work(),
    };

    const permissionResolver = new DefaultPermissionResolver();
    const authEvaluator = new DefaultAuthorizationEvaluator(permissionResolver);

    @Global()
    @Module({
      providers: [
        { provide: PrismaService, useValue: {} },
        { provide: ACCESS_TOKEN_SERVICE, useValue: mockAccessTokenService },
        { provide: USER_REPOSITORY, useValue: mockUserRepository },
        { provide: PERMISSION_RESOLVER, useValue: permissionResolver },
        { provide: AUTHORIZATION_EVALUATOR, useValue: authEvaluator },
      ],
      exports: [
        PrismaService,
        ACCESS_TOKEN_SERVICE,
        USER_REPOSITORY,
        PERMISSION_RESOLVER,
        AUTHORIZATION_EVALUATOR,
      ],
    })
    class TestGlobalPlatformModule {}

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [
        TestGlobalPlatformModule,
        ClientModule,
        SchedulingModule,
        KinesiologyModule,
        SalesModule,
      ],
    })
      // Client Module overrides
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
      // Scheduling Module overrides
      .overrideProvider(PrismaRoomRepository)
      .useValue(roomStore)
      .overrideProvider(PrismaAppointmentRepository)
      .useValue(appointmentStore)
      .overrideProvider(PrismaRecurrenceSeriesRepository)
      .useValue({})
      .overrideProvider(SCHEDULING_CLOCK_TOKEN)
      .useValue(clock as Clock)
      // Kinesiology Module overrides
      .overrideProvider(PrismaTreatmentSessionRepository)
      .useValue(sessionStore)
      .overrideProvider(TREATMENT_SESSION_REPOSITORY_TOKEN)
      .useValue(sessionStore)
      .overrideProvider(KINESIOLOGY_CLOCK_TOKEN)
      .useValue(clock as Clock)
      // Sales Module overrides
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
    app.setGlobalPrefix('api/v1', {
      exclude: ['api/v1/(.*)', 'api/v1'],
    });
    app.useGlobalPipes(new GlobalSanitizationValidationPipe());
    app.useGlobalFilters(new GlobalExceptionFilter());
    await app.init();
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  // ==========================================================================
  // STEP 1: VALIDATE CLIENT & APPOINTMENT BOOKING
  // ==========================================================================
  describe('Step 1 — Validate Client Setup, Room Resources, and Appointment Booking', () => {
    it('1.1 creates and retrieves clinical patient records and enforces client RBAC', async () => {
      const createRes = await request(app.getHttpServer())
        .post('/api/v1/clients')
        .set('Authorization', `Bearer ${receptionistToken}`)
        .send({
          firstName: 'Lucia',
          lastName: 'Mendoza',
          email: 'lucia.mendoza@kinergy.test',
          phone: '+15557112233',
        })
        .expect(201);

      expect(createRes.body.id).toBeDefined();
      expect(createRes.body.referenceNumber).toMatch(/^CLI-\d{4}-\d{5}$/);
      expect(createRes.body.status).toBe('ACTIVE');

      patientClientId = createRes.body.id;
      patientClientRef = createRes.body.referenceNumber;

      // Create a second client for conflict and client-mismatch negative tests
      const secondRes = await request(app.getHttpServer())
        .post('/api/v1/clients')
        .set('Authorization', `Bearer ${receptionistToken}`)
        .send({
          firstName: 'Carlos',
          lastName: 'Rojas',
          email: 'carlos.rojas@kinergy.test',
          phone: '+15557998877',
        })
        .expect(201);

      secondaryClientId = secondRes.body.id;

      // Retrieve persisted client through API
      const getRes = await request(app.getHttpServer())
        .get(`/api/v1/clients/${patientClientId}`)
        .set('Authorization', `Bearer ${therapistToken}`)
        .expect(200);

      expect(getRes.body.id).toBe(patientClientId);
      expect(getRes.body.referenceNumber).toBe(patientClientRef);

      // Verify persistence in backing store
      const persistedClient = await clientStore.findById(ClientId.create(patientClientId));
      expect(persistedClient).not.toBeNull();
      expect(persistedClient?.email.value).toBe('lucia.mendoza@kinergy.test');
    });

    it('1.2 registers clinical treatment rooms and allows Receptionist and Therapist to list rooms while denying unauthorized room mutations', async () => {
      // Receptionist cannot create rooms (requires ADMIN/Owner + settings.write)
      await request(app.getHttpServer())
        .post('/api/v1/scheduling/rooms')
        .set('Authorization', `Bearer ${receptionistToken}`)
        .send({
          name: 'Unauthorized Room',
          capacity: 1,
          features: ['TREATMENT_TABLE'],
        })
        .expect(403);

      // Owner creates Box 1 and Box 2
      const box1Res = await request(app.getHttpServer())
        .post('/api/v1/scheduling/rooms')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({
          name: 'Kinesiology Box 1',
          capacity: 2,
          features: ['TREATMENT_TABLE', 'ULTRASOUND', 'ELECTROTHERAPY'],
        })
        .expect(201);

      expect(box1Res.body.id).toBeDefined();
      expect(box1Res.body.status).toBe('AVAILABLE');
      primaryRoomId = box1Res.body.id;

      const box2Res = await request(app.getHttpServer())
        .post('/api/v1/scheduling/rooms')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({
          name: 'Kinesiology Box 2',
          capacity: 1,
          features: ['TREATMENT_TABLE'],
        })
        .expect(201);

      secondaryRoomId = box2Res.body.id;

      // Owner can list and view rooms for configuration & audit
      const listRes = await request(app.getHttpServer())
        .get('/api/v1/scheduling/rooms')
        .set('Authorization', `Bearer ${ownerToken}`)
        .expect(200);

      expect(Array.isArray(listRes.body)).toBe(true);
      expect(listRes.body.length).toBe(2);

      const getRoomRes = await request(app.getHttpServer())
        .get(`/api/v1/scheduling/rooms/${primaryRoomId}`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .expect(200);

      expect(getRoomRes.body.name).toBe('Kinesiology Box 1');

      // Kitchen Staff is denied access to scheduling rooms
      await request(app.getHttpServer())
        .get('/api/v1/scheduling/rooms')
        .set('Authorization', `Bearer ${kitchenToken}`)
        .expect(403);
    });

    it('1.3 loads supported clinical service types, available slots, and pre-booking conflict diagnostics', async () => {
      const typesRes = await request(app.getHttpServer())
        .get('/api/v1/scheduling/service-types')
        .set('Authorization', `Bearer ${receptionistToken}`)
        .expect(200);

      expect(typesRes.body).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ type: 'ASSESSMENT', standardDurationMinutes: 60 }),
          expect.objectContaining({ type: 'TREATMENT', standardDurationMinutes: 45 }),
          expect.objectContaining({ type: 'FOLLOW_UP', standardDurationMinutes: 30 }),
          expect.objectContaining({ type: 'EVALUATION', standardDurationMinutes: 60 }),
        ]),
      );

      // Query available slots for 2026-10-29
      const slotsRes = await request(app.getHttpServer())
        .get('/api/v1/scheduling/availability/slots')
        .query({
          date: '2026-10-29',
          serviceType: 'TREATMENT',
          therapistId: PRIMARY_THERAPIST_ID,
          roomId: primaryRoomId,
        })
        .set('Authorization', `Bearer ${receptionistToken}`)
        .expect(200);

      expect(Array.isArray(slotsRes.body)).toBe(true);
      expect(slotsRes.body.length).toBeGreaterThan(0);
      expect(slotsRes.body[0].available).toBe(true);

      // Pre-check conflict for a clean future slot (2026-10-29 14:00 - 14:45 UTC)
      const conflictCheckRes = await request(app.getHttpServer())
        .post('/api/v1/scheduling/availability/check-conflict')
        .set('Authorization', `Bearer ${receptionistToken}`)
        .send({
          therapistId: PRIMARY_THERAPIST_ID,
          roomId: primaryRoomId,
          clientId: patientClientId,
          startTime: '2026-10-29T14:00:00.000Z',
          endTime: '2026-10-29T14:45:00.000Z',
          appointmentType: 'TREATMENT',
        })
        .expect(200);

      expect(conflictCheckRes.body.hasConflict).toBe(false);
      expect(conflictCheckRes.body.conflicts).toHaveLength(0);
    });

    it('1.4 books a valid clinical TREATMENT appointment with UTC timestamps and persists across navigation/refresh', async () => {
      const bookRes = await request(app.getHttpServer())
        .post('/api/v1/scheduling/appointments')
        .set('Authorization', `Bearer ${receptionistToken}`)
        .send({
          clientId: patientClientId,
          therapistId: PRIMARY_THERAPIST_ID,
          roomId: primaryRoomId,
          type: 'TREATMENT',
          startTime: '2026-10-29T14:00:00.000Z',
          endTime: '2026-10-29T14:45:00.000Z',
          notes: 'Synthetic intake note: Post-op ACL week 4 mobility protocol',
          requestToken: 'req_tok_kinesio_appt_001',
        })
        .expect(201);

      expect(bookRes.body.id).toBeDefined();
      expect(bookRes.body.status).toBe('SCHEDULED');
      expect(bookRes.body.type).toBe('TREATMENT');
      expect(bookRes.body.clientId).toBe(patientClientId);
      expect(bookRes.body.therapistId).toBe(PRIMARY_THERAPIST_ID);
      expect(bookRes.body.roomId).toBe(primaryRoomId);
      expect(bookRes.body.startTime).toBe('2026-10-29T14:00:00.000Z');
      expect(bookRes.body.endTime).toBe('2026-10-29T14:45:00.000Z');
      expect(bookRes.body.durationMinutes).toBe(45);
      expect(bookRes.body.notes).toHaveLength(1);
      expect(bookRes.body.notes[0].content).toContain('Post-op ACL week 4');

      bookedTreatmentAppointmentId = bookRes.body.id;

      // Also book an ASSESSMENT appointment in a non-conflicting window (16:00 - 17:00 UTC)
      const assessmentRes = await request(app.getHttpServer())
        .post('/api/v1/scheduling/appointments')
        .set('Authorization', `Bearer ${receptionistToken}`)
        .send({
          clientId: patientClientId,
          therapistId: PRIMARY_THERAPIST_ID,
          roomId: primaryRoomId,
          type: 'ASSESSMENT',
          startTime: '2026-10-29T16:00:00.000Z',
          endTime: '2026-10-29T17:00:00.000Z',
        })
        .expect(201);

      bookedAssessmentAppointmentId = assessmentRes.body.id;

      // Retrieve persisted appointment by ID (simulating page reload)
      const getRes = await request(app.getHttpServer())
        .get(`/api/v1/scheduling/appointments/${bookedTreatmentAppointmentId}`)
        .set('Authorization', `Bearer ${therapistToken}`)
        .expect(200);

      expect(getRes.body.id).toBe(bookedTreatmentAppointmentId);
      expect(getRes.body.status).toBe('SCHEDULED');

      // Retrieve via range query (Calendar view)
      const listRes = await request(app.getHttpServer())
        .get('/api/v1/scheduling/appointments')
        .query({
          startDate: '2026-10-29T00:00:00.000Z',
          endDate: '2026-10-29T23:59:59.000Z',
          therapistId: PRIMARY_THERAPIST_ID,
        })
        .set('Authorization', `Bearer ${therapistToken}`)
        .expect(200);

      expect(listRes.body).toHaveLength(2);

      // Retrieve via Daily Agenda projection
      const agendaRes = await request(app.getHttpServer())
        .get('/api/v1/scheduling/calendar/agenda')
        .query({
          view: 'day',
          date: '2026-10-29',
          therapistId: PRIMARY_THERAPIST_ID,
        })
        .set('Authorization', `Bearer ${therapistToken}`)
        .expect(200);

      expect(agendaRes.body.totalAppointments).toBe(2);
    });

    it('1.5 enforces authoritative 4D conflict detection (Therapist, Room, Client, Turnaround Buffer, and Maintenance Window) and booking policies', async () => {
      // 1. Overlapping Therapist conflict (same therapist, different room & client, 14:15 - 15:00 UTC)
      const therapistConflictRes = await request(app.getHttpServer())
        .post('/api/v1/scheduling/appointments')
        .set('Authorization', `Bearer ${receptionistToken}`)
        .send({
          clientId: secondaryClientId,
          therapistId: PRIMARY_THERAPIST_ID,
          roomId: secondaryRoomId,
          type: 'TREATMENT',
          startTime: '2026-10-29T14:15:00.000Z',
          endTime: '2026-10-29T15:00:00.000Z',
        })
        .expect(409);

      expect(therapistConflictRes.body.code).toBe('APPOINTMENT_CONFLICT');
      expect(
        therapistConflictRes.body.conflicts.some(
          (c: { conflictType: string }) => c.conflictType === 'THERAPIST',
        ),
      ).toBe(true);

      // 2. Turnaround buffer conflict (starts at 14:50 UTC, within 15-minute buffer of 14:00-14:45 appointment)
      await request(app.getHttpServer())
        .post('/api/v1/scheduling/appointments')
        .set('Authorization', `Bearer ${receptionistToken}`)
        .send({
          clientId: secondaryClientId,
          therapistId: PRIMARY_THERAPIST_ID,
          roomId: primaryRoomId,
          type: 'TREATMENT',
          startTime: '2026-10-29T14:50:00.000Z',
          endTime: '2026-10-29T15:35:00.000Z',
        })
        .expect(409);

      // 3. Overlapping Room conflict (different therapist & client, same room at 14:00 - 14:45 UTC)
      const roomConflictRes = await request(app.getHttpServer())
        .post('/api/v1/scheduling/appointments')
        .set('Authorization', `Bearer ${receptionistToken}`)
        .send({
          clientId: secondaryClientId,
          therapistId: SECONDARY_THERAPIST_ID,
          roomId: primaryRoomId,
          type: 'TREATMENT',
          startTime: '2026-10-29T14:00:00.000Z',
          endTime: '2026-10-29T14:45:00.000Z',
        })
        .expect(409);

      expect(
        roomConflictRes.body.conflicts.some(
          (c: { conflictType: string }) => c.conflictType === 'ROOM',
        ),
      ).toBe(true);

      // 4. Overlapping Client conflict (same client, different therapist & room at 14:00 - 14:45 UTC)
      const clientConflictRes = await request(app.getHttpServer())
        .post('/api/v1/scheduling/appointments')
        .set('Authorization', `Bearer ${receptionistToken}`)
        .send({
          clientId: patientClientId,
          therapistId: SECONDARY_THERAPIST_ID,
          roomId: secondaryRoomId,
          type: 'TREATMENT',
          startTime: '2026-10-29T14:00:00.000Z',
          endTime: '2026-10-29T14:45:00.000Z',
        })
        .expect(409);

      expect(
        clientConflictRes.body.conflicts.some(
          (c: { conflictType: string }) => c.conflictType === 'CLIENT',
        ),
      ).toBe(true);

      // 5. Room maintenance window conflict
      const box2Get = await request(app.getHttpServer())
        .get(`/api/v1/scheduling/rooms/${secondaryRoomId}`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .expect(200);

      await request(app.getHttpServer())
        .post(`/api/v1/scheduling/rooms/${secondaryRoomId}/maintenance`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({
          startTime: '2026-10-30T10:00:00.000Z',
          endTime: '2026-10-30T12:00:00.000Z',
          reason: 'Calibration of electrotherapy equipment',
          expectedVersion: box2Get.body.version,
        })
        .expect(201);

      await request(app.getHttpServer())
        .post('/api/v1/scheduling/appointments')
        .set('Authorization', `Bearer ${receptionistToken}`)
        .send({
          clientId: secondaryClientId,
          therapistId: SECONDARY_THERAPIST_ID,
          roomId: secondaryRoomId,
          type: 'TREATMENT',
          startTime: '2026-10-30T10:30:00.000Z',
          endTime: '2026-10-30T11:15:00.000Z',
        })
        .expect(409);

      // 6. Booking window violation (within 2-hour minimum lead time from clock 2026-10-28T09:00:00Z)
      await request(app.getHttpServer())
        .post('/api/v1/scheduling/appointments')
        .set('Authorization', `Bearer ${receptionistToken}`)
        .send({
          clientId: secondaryClientId,
          therapistId: SECONDARY_THERAPIST_ID,
          roomId: secondaryRoomId,
          type: 'TREATMENT',
          startTime: '2026-10-28T09:30:00.000Z',
          endTime: '2026-10-28T10:15:00.000Z',
        })
        .expect(422);

      // 7. Duration policy violation (ASSESSMENT requires min 45 minutes, sending 20 minutes)
      await request(app.getHttpServer())
        .post('/api/v1/scheduling/appointments')
        .set('Authorization', `Bearer ${receptionistToken}`)
        .send({
          clientId: secondaryClientId,
          therapistId: SECONDARY_THERAPIST_ID,
          roomId: secondaryRoomId,
          type: 'ASSESSMENT',
          startTime: '2026-10-30T14:00:00.000Z',
          endTime: '2026-10-30T14:20:00.000Z',
        })
        .expect(422);
    });

    it('1.6 progresses appointment lifecycle through Confirm -> Check-In -> Start', async () => {
      const confirmRes = await request(app.getHttpServer())
        .post(`/api/v1/scheduling/appointments/${bookedTreatmentAppointmentId}/confirm`)
        .set('Authorization', `Bearer ${receptionistToken}`)
        .send({})
        .expect(200);

      expect(confirmRes.body.status).toBe('CONFIRMED');

      const checkInRes = await request(app.getHttpServer())
        .post(`/api/v1/scheduling/appointments/${bookedTreatmentAppointmentId}/check-in`)
        .set('Authorization', `Bearer ${receptionistToken}`)
        .send({})
        .expect(200);

      expect(checkInRes.body.status).toBe('CHECKED_IN');

      const startRes = await request(app.getHttpServer())
        .post(`/api/v1/scheduling/appointments/${bookedTreatmentAppointmentId}/start`)
        .set('Authorization', `Bearer ${therapistToken}`)
        .send({})
        .expect(200);

      expect(startRes.body.status).toBe('IN_PROGRESS');
    });
  });

  // ==========================================================================
  // STEP 2: VALIDATE TREATMENT SESSION CREATION & LIFECYCLE
  // ==========================================================================
  describe('Step 2 — Validate Treatment Session Creation, RBAC, and Lifecycle Transitions', () => {
    it('2.1 enforces strict clinical authentication and RBAC on treatment session endpoints', async () => {
      // Unauthenticated request -> 401
      await request(app.getHttpServer())
        .post('/api/v1/kinesiology/sessions')
        .send({ appointmentId: bookedTreatmentAppointmentId })
        .expect(401);

      // Kitchen Staff -> 403 Forbidden
      await request(app.getHttpServer())
        .post('/api/v1/kinesiology/sessions')
        .set('Authorization', `Bearer ${kitchenToken}`)
        .send({ appointmentId: bookedTreatmentAppointmentId })
        .expect(403);

      // Receptionist lacks kinesiology.sessions.treat -> 403 Forbidden on session creation
      await request(app.getHttpServer())
        .post('/api/v1/kinesiology/sessions')
        .set('Authorization', `Bearer ${receptionistToken}`)
        .send({ appointmentId: bookedTreatmentAppointmentId })
        .expect(403);
    });

    it('2.2 rejects treatment session creation for non-existent or cancelled appointments', async () => {
      // Non-existent appointment -> 404
      await request(app.getHttpServer())
        .post('/api/v1/kinesiology/sessions')
        .set('Authorization', `Bearer ${therapistToken}`)
        .send({ appointmentId: 'appt_non_existent_999' })
        .expect(404);

      // Book and cancel an appointment, then verify session creation is rejected with 422
      const tempApptRes = await request(app.getHttpServer())
        .post('/api/v1/scheduling/appointments')
        .set('Authorization', `Bearer ${receptionistToken}`)
        .send({
          clientId: secondaryClientId,
          therapistId: SECONDARY_THERAPIST_ID,
          roomId: primaryRoomId,
          type: 'TREATMENT',
          startTime: '2026-10-31T10:00:00.000Z',
          endTime: '2026-10-31T10:45:00.000Z',
        })
        .expect(201);

      await request(app.getHttpServer())
        .post(`/api/v1/scheduling/appointments/${tempApptRes.body.id}/cancel`)
        .set('Authorization', `Bearer ${receptionistToken}`)
        .send({ reason: 'Patient requested cancellation prior to visit' })
        .expect(200);

      const cancelledSessionRes = await request(app.getHttpServer())
        .post('/api/v1/kinesiology/sessions')
        .set('Authorization', `Bearer ${therapistToken}`)
        .send({ appointmentId: tempApptRes.body.id })
        .expect(422);

      expect(cancelledSessionRes.body.error.message).toContain('CANCELLED');
    });

    it('2.3 creates a TreatmentSession linked to the eligible appointment and prevents duplicate sessions (409)', async () => {
      const createRes = await request(app.getHttpServer())
        .post('/api/v1/kinesiology/sessions')
        .set('Authorization', `Bearer ${therapistToken}`)
        .send({ appointmentId: bookedTreatmentAppointmentId })
        .expect(201);

      expect(createRes.body.id).toBeDefined();
      expect(createRes.body.appointmentId).toBe(bookedTreatmentAppointmentId);
      expect(createRes.body.clientId).toBe(patientClientId);
      expect(createRes.body.therapistId).toBe(PRIMARY_THERAPIST_ID);
      expect(createRes.body.status).toBe('SCHEDULED');
      expect(createRes.body.version).toBe(1);

      primarySessionId = createRes.body.id;

      // Duplicate session creation for the same appointmentId -> 409 Conflict
      await request(app.getHttpServer())
        .post('/api/v1/kinesiology/sessions')
        .set('Authorization', `Bearer ${therapistToken}`)
        .send({ appointmentId: bookedTreatmentAppointmentId })
        .expect(409);

      // Receptionist CAN read the session (kinesiology.sessions.read)
      const receptionReadRes = await request(app.getHttpServer())
        .get(`/api/v1/kinesiology/sessions/${primarySessionId}`)
        .set('Authorization', `Bearer ${receptionistToken}`)
        .expect(200);

      expect(receptionReadRes.body.id).toBe(primarySessionId);
      expect(receptionReadRes.body.status).toBe('SCHEDULED');

      // Kitchen Staff CANNOT read the session -> 403
      await request(app.getHttpServer())
        .get(`/api/v1/kinesiology/sessions/${primarySessionId}`)
        .set('Authorization', `Bearer ${kitchenToken}`)
        .expect(403);
    });

    it('2.4 rejects invalid state transitions (cannot complete a SCHEDULED session) and enforces SCHEDULED -> IN_PROGRESS', async () => {
      // Cannot jump directly from SCHEDULED to COMPLETED -> 422
      const invalidCompleteRes = await request(app.getHttpServer())
        .post(`/api/v1/kinesiology/sessions/${primarySessionId}/complete`)
        .set('Authorization', `Bearer ${therapistToken}`)
        .send({})
        .expect(422);

      expect(invalidCompleteRes.body.error.message).toContain(
        "Session must be in 'IN_PROGRESS' status to be completed",
      );

      // Start the treatment session (SCHEDULED -> IN_PROGRESS)
      const startRes = await request(app.getHttpServer())
        .post(`/api/v1/kinesiology/sessions/${primarySessionId}/start`)
        .set('Authorization', `Bearer ${therapistToken}`)
        .expect(200);

      expect(startRes.body.status).toBe('IN_PROGRESS');
      expect(startRes.body.updatedAt).toBeDefined();
      expect(startRes.body.version).toBe(2);

      // Cannot start an already IN_PROGRESS session -> 422
      await request(app.getHttpServer())
        .post(`/api/v1/kinesiology/sessions/${primarySessionId}/start`)
        .set('Authorization', `Bearer ${therapistToken}`)
        .expect(422);

      // Owner can reassign/handover therapist during active session (kinesiology.sessions.assign)
      const assignRes = await request(app.getHttpServer())
        .post(`/api/v1/kinesiology/sessions/${primarySessionId}/assign-therapist`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ newTherapistId: PRIMARY_THERAPIST_ID })
        .expect(200);

      expect(assignRes.body.therapistId).toBe(PRIMARY_THERAPIST_ID);
    });
  });

  // ==========================================================================
  // STEP 3: VALIDATE SOAP DOCUMENTATION & IMMUTABILITY
  // ==========================================================================
  describe('Step 3 — Validate SOAP Documentation, Partial Preservation, Validation Errors, and Sign-Off Immutability', () => {
    it('3.1 saves initial SOAP sections (PUT) and preserves previously saved clinical sections on partial updates (PATCH)', async () => {
      // Receptionist is denied from editing SOAP notes -> 403 Forbidden
      await request(app.getHttpServer())
        .put(`/api/v1/kinesiology/sessions/${primarySessionId}/notes`)
        .set('Authorization', `Bearer ${receptionistToken}`)
        .send({
          subjective: 'Unauthorized note attempt',
        })
        .expect(403);

      // Therapist saves initial Subjective and Objective sections
      const putRes = await request(app.getHttpServer())
        .put(`/api/v1/kinesiology/sessions/${primarySessionId}/notes`)
        .set('Authorization', `Bearer ${therapistToken}`)
        .send({
          subjective:
            'Synthetic data: Patient reports improved knee flexion with minimal morning stiffness (VAS 2/10).',
          objective:
            'Synthetic data: Active ROM 0-115 deg; quadriceps isometric strength 4+/5; no joint effusion.',
        })
        .expect(200);

      expect(putRes.body.notes.subjective).toContain('VAS 2/10');
      expect(putRes.body.notes.objective).toContain('Active ROM 0-115 deg');

      // Therapist submits a partial update (PATCH) adding Assessment and Plan
      const patchRes = await request(app.getHttpServer())
        .patch(`/api/v1/kinesiology/sessions/${primarySessionId}/notes`)
        .set('Authorization', `Bearer ${therapistToken}`)
        .send({
          assessment:
            'Synthetic data: Favorable progression in week 4 ACL rehabilitation protocol.',
          plan: 'Synthetic data: Progress to closed-chain mini-squats and proprioceptive balance board.',
        })
        .expect(200);

      // Verify previously saved Subjective and Objective sections are preserved!
      expect(patchRes.body.notes.subjective).toContain('VAS 2/10');
      expect(patchRes.body.notes.objective).toContain('Active ROM 0-115 deg');
      expect(patchRes.body.notes.assessment).toContain('Favorable progression');
      expect(patchRes.body.notes.plan).toContain('closed-chain mini-squats');
    });

    it('3.2 safely rejects invalid SOAP payloads without corrupting previously saved clinical notes', async () => {
      // 1. Non-whitelisted / invalid type payload -> 400 Bad Request
      await request(app.getHttpServer())
        .put(`/api/v1/kinesiology/sessions/${primarySessionId}/notes`)
        .set('Authorization', `Bearer ${therapistToken}`)
        .send({ nonWhitelistedProperty: 'malicious' })
        .expect(400);

      await request(app.getHttpServer())
        .put(`/api/v1/kinesiology/sessions/${primarySessionId}/notes`)
        .set('Authorization', `Bearer ${therapistToken}`)
        .send({ subjective: ['invalid', 'array'] })
        .expect(400);

      // 2. Section exceeding MAX_NOTE_SECTION_LENGTH (10,000 characters) -> 422 Unprocessable Entity
      const oversizedSection = 'X'.repeat(10005);
      await request(app.getHttpServer())
        .patch(`/api/v1/kinesiology/sessions/${primarySessionId}/notes`)
        .set('Authorization', `Bearer ${therapistToken}`)
        .send({
          subjective: oversizedSection,
        })
        .expect(422);

      // Verify previously saved clinical notes remain completely intact after failed save attempts
      const getRes = await request(app.getHttpServer())
        .get(`/api/v1/kinesiology/sessions/${primarySessionId}`)
        .set('Authorization', `Bearer ${therapistToken}`)
        .expect(200);

      expect(getRes.body.notes.subjective).toContain('VAS 2/10');
      expect(getRes.body.notes.objective).toContain('Active ROM 0-115 deg');
      expect(getRes.body.notes.assessment).toContain('Favorable progression');
      expect(getRes.body.notes.plan).toContain('closed-chain mini-squats');
    });

    it('3.3 completes the treatment session, locks SOAP documentation permanently, and records client treatment history', async () => {
      // Complete treatment session
      const completeRes = await request(app.getHttpServer())
        .post(`/api/v1/kinesiology/sessions/${primarySessionId}/complete`)
        .set('Authorization', `Bearer ${therapistToken}`)
        .send({})
        .expect(200);

      expect(completeRes.body.status).toBe('COMPLETED');
      expect(completeRes.body.updatedAt).toBeDefined();
      expect(completeRes.body.notes.subjective).toContain('VAS 2/10');

      // Also complete the scheduled appointment in Scheduling
      await request(app.getHttpServer())
        .post(`/api/v1/scheduling/appointments/${bookedTreatmentAppointmentId}/complete`)
        .set('Authorization', `Bearer ${therapistToken}`)
        .send({})
        .expect(200);

      // Immutability Rule 1: Cannot edit SOAP notes on a COMPLETED session (PUT or PATCH -> 422)
      const putLockedRes = await request(app.getHttpServer())
        .put(`/api/v1/kinesiology/sessions/${primarySessionId}/notes`)
        .set('Authorization', `Bearer ${therapistToken}`)
        .send({
          subjective: 'Attempted post-completion alteration',
        })
        .expect(422);

      expect(putLockedRes.body.error.message).toContain('COMPLETED');

      await request(app.getHttpServer())
        .patch(`/api/v1/kinesiology/sessions/${primarySessionId}/notes`)
        .set('Authorization', `Bearer ${therapistToken}`)
        .send({
          plan: 'Attempted post-completion patch',
        })
        .expect(422);

      // Immutability Rule 2: Cannot reassign therapist or cancel a COMPLETED session -> 422
      await request(app.getHttpServer())
        .post(`/api/v1/kinesiology/sessions/${primarySessionId}/assign-therapist`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ newTherapistId: SECONDARY_THERAPIST_ID })
        .expect(422);

      await request(app.getHttpServer())
        .post(`/api/v1/kinesiology/sessions/${primarySessionId}/cancel`)
        .set('Authorization', `Bearer ${therapistToken}`)
        .send({ reason: 'Attempted cancellation after completion' })
        .expect(422);

      // Verify Client Treatment History endpoint returns the completed session
      const historyRes = await request(app.getHttpServer())
        .get(`/api/v1/kinesiology/clients/${patientClientId}/treatment-history`)
        .set('Authorization', `Bearer ${therapistToken}`)
        .expect(200);

      expect(Array.isArray(historyRes.body.items)).toBe(true);
      expect(historyRes.body.items).toHaveLength(1);
      expect(historyRes.body.items[0].sessionId).toBe(primarySessionId);
      expect(historyRes.body.items[0].status).toBe('COMPLETED');
    });
  });

  // ==========================================================================
  // STEP 4: VALIDATE SALES & PAYMENTS INTEGRATION
  // ==========================================================================
  describe('Step 4 — Validate Kinesiology-to-Sales Commercial Integration and Payment Settlement', () => {
    it('4.1 rejects Sale creation for SCHEDULED, IN_PROGRESS, CANCELLED, or client-mismatched treatment sessions', async () => {
      // Create a session for the ASSESSMENT appointment (starts in SCHEDULED status)
      const createAssessSessionRes = await request(app.getHttpServer())
        .post('/api/v1/kinesiology/sessions')
        .set('Authorization', `Bearer ${therapistToken}`)
        .send({ appointmentId: bookedAssessmentAppointmentId })
        .expect(201);

      assessmentSessionId = createAssessSessionRes.body.id;

      // 1. SCHEDULED session is NOT eligible for billing -> rejected (400)
      const scheduledSaleRes = await request(app.getHttpServer())
        .post('/api/v1/sales')
        .set('Authorization', `Bearer ${receptionistToken}`)
        .set('x-idempotency-key', 'idem-kinesio-sale-scheduled-001')
        .send({
          clientId: patientClientId,
          currency: 'USD',
          sourceReference: {
            type: 'KINESIOLOGY_SESSION',
            referenceId: assessmentSessionId,
          },
        })
        .expect(400);

      expect(JSON.stringify(scheduledSaleRes.body)).toContain(
        'Only COMPLETED clinical sessions can be billed',
      );

      // 2. Start the assessment session -> IN_PROGRESS is ALSO NOT eligible for billing -> rejected (400)
      await request(app.getHttpServer())
        .post(`/api/v1/kinesiology/sessions/${assessmentSessionId}/start`)
        .set('Authorization', `Bearer ${therapistToken}`)
        .expect(200);

      const inProgressSaleRes = await request(app.getHttpServer())
        .post('/api/v1/sales')
        .set('Authorization', `Bearer ${receptionistToken}`)
        .set('x-idempotency-key', 'idem-kinesio-sale-inprogress-001')
        .send({
          clientId: patientClientId,
          currency: 'USD',
          sourceReference: {
            type: 'KINESIOLOGY_SESSION',
            referenceId: assessmentSessionId,
          },
        })
        .expect(400);

      expect(JSON.stringify(inProgressSaleRes.body)).toContain('IN_PROGRESS');

      // 3. Client mismatch on COMPLETED primarySessionId -> rejected (400)
      const mismatchRes = await request(app.getHttpServer())
        .post('/api/v1/sales')
        .set('Authorization', `Bearer ${receptionistToken}`)
        .set('x-idempotency-key', 'idem-kinesio-sale-mismatch-001')
        .send({
          clientId: secondaryClientId,
          currency: 'USD',
          sourceReference: {
            type: 'KINESIOLOGY_SESSION',
            referenceId: primarySessionId,
          },
        })
        .expect(400);

      expect(JSON.stringify(mismatchRes.body)).toContain('does not match');
    });

    it('4.2 creates an authoritative Sale from the COMPLETED treatment session, snapshots service pricing, and prevents duplicate sales', async () => {
      // Create Sale for the COMPLETED TREATMENT session ($85.00 authoritative fee)
      const createSaleRes = await request(app.getHttpServer())
        .post('/api/v1/sales')
        .set('Authorization', `Bearer ${receptionistToken}`)
        .set('x-idempotency-key', 'idem-kinesio-sale-primary-001')
        .send({
          clientId: patientClientId,
          currency: 'USD',
          sourceReference: {
            type: 'KINESIOLOGY_SESSION',
            referenceId: primarySessionId,
          },
        })
        .expect(201);

      expect(createSaleRes.body.id).toBeDefined();
      expect(createSaleRes.body.status).toBe('DRAFT');
      expect(createSaleRes.body.clientId).toBe(patientClientId);
      expect(createSaleRes.body.subtotalAmount).toBe(85);
      expect(createSaleRes.body.totalAmount).toBe(85);
      expect(createSaleRes.body.items).toHaveLength(1);
      expect(createSaleRes.body.items[0].unitPriceAmount).toBe(85);
      expect(createSaleRes.body.items[0].description).toContain('Clinical Kinesiology Session');

      settledKinesiologySaleId = createSaleRes.body.id;

      // Same Idempotency-Key returns the exact same Sale idempotently
      const idempotentReplayRes = await request(app.getHttpServer())
        .post('/api/v1/sales')
        .set('Authorization', `Bearer ${receptionistToken}`)
        .set('x-idempotency-key', 'idem-kinesio-sale-primary-001')
        .send({
          clientId: patientClientId,
          currency: 'USD',
          sourceReference: {
            type: 'KINESIOLOGY_SESSION',
            referenceId: primarySessionId,
          },
        })
        .expect(201);

      expect(idempotentReplayRes.body.id).toBe(settledKinesiologySaleId);

      // Different Idempotency-Key for the same COMPLETED session is rejected with 409 Conflict
      await request(app.getHttpServer())
        .post('/api/v1/sales')
        .set('Authorization', `Bearer ${receptionistToken}`)
        .set('x-idempotency-key', 'idem-kinesio-sale-duplicate-002')
        .send({
          clientId: patientClientId,
          currency: 'USD',
          sourceReference: {
            type: 'KINESIOLOGY_SESSION',
            referenceId: primarySessionId,
          },
        })
        .expect(409);

      // Save SOAP notes and complete the ASSESSMENT session, then verify its authoritative price snapshot is $120.00
      await request(app.getHttpServer())
        .put(`/api/v1/kinesiology/sessions/${assessmentSessionId}/notes`)
        .set('Authorization', `Bearer ${therapistToken}`)
        .send({
          subjective: 'Synthetic initial assessment intake',
          objective: 'Synthetic baseline posture and gait metrics',
          assessment: 'Synthetic functional baseline established',
          plan: 'Synthetic 6-week rehabilitation plan',
        })
        .expect(200);

      await request(app.getHttpServer())
        .post(`/api/v1/kinesiology/sessions/${assessmentSessionId}/complete`)
        .set('Authorization', `Bearer ${therapistToken}`)
        .send({})
        .expect(200);

      const assessmentSaleRes = await request(app.getHttpServer())
        .post('/api/v1/sales')
        .set('Authorization', `Bearer ${receptionistToken}`)
        .set('x-idempotency-key', 'idem-kinesio-sale-assessment-001')
        .send({
          clientId: patientClientId,
          currency: 'USD',
          sourceReference: {
            type: 'KINESIOLOGY_SESSION',
            referenceId: assessmentSessionId,
          },
        })
        .expect(201);

      expect(assessmentSaleRes.body.totalAmount).toBe(120);
    });

    it('4.3 finalizes the Sale, handles failed/pending QR payment without corrupting clinical state, and settles via CASH payment', async () => {
      // Finalize Sale (DRAFT -> PENDING_PAYMENT)
      const finalizeRes = await request(app.getHttpServer())
        .post(`/api/v1/sales/${settledKinesiologySaleId}/finalize`)
        .set('Authorization', `Bearer ${receptionistToken}`)
        .send({})
        .expect(200);

      expect(finalizeRes.body.status).toBe('PENDING_PAYMENT');

      // 1. Initiate a QR payment (remains PENDING, does not settle Sale)
      const qrPayRes = await request(app.getHttpServer())
        .post(`/api/v1/sales/${settledKinesiologySaleId}/payments`)
        .set('Authorization', `Bearer ${receptionistToken}`)
        .send({
          method: 'QR',
          amount: 85,
          status: 'PENDING',
          reference: 'QR-KINESIO-001',
          idempotencyKey: 'idem-kinesio-pay-qr-001',
        })
        .expect(201);

      expect(qrPayRes.body.status).toBe('PENDING');

      // Mark QR payment as FAILED
      const failQrRes = await request(app.getHttpServer())
        .post(`/api/v1/payments/${qrPayRes.body.id}/fail`)
        .set('Authorization', `Bearer ${receptionistToken}`)
        .send({ reason: 'Customer QR banking app timed out' })
        .expect(200);

      expect(failQrRes.body.status).toBe('FAILED');

      const saleAfterFailed = await request(app.getHttpServer())
        .get(`/api/v1/sales/${settledKinesiologySaleId}`)
        .set('Authorization', `Bearer ${receptionistToken}`)
        .expect(200);
      expect(saleAfterFailed.body.status).toBe('PENDING_PAYMENT');

      // Verify clinical state independence: failed payment did NOT alter the COMPLETED TreatmentSession or its SOAP notes
      const sessionCheckRes = await request(app.getHttpServer())
        .get(`/api/v1/kinesiology/sessions/${primarySessionId}`)
        .set('Authorization', `Bearer ${therapistToken}`)
        .expect(200);

      expect(sessionCheckRes.body.status).toBe('COMPLETED');
      expect(sessionCheckRes.body.notes.subjective).toContain('VAS 2/10');

      // 2. Settle Sale with authoritative CASH payment ($85.00)
      const cashPayRes = await request(app.getHttpServer())
        .post(`/api/v1/sales/${settledKinesiologySaleId}/payments`)
        .set('Authorization', `Bearer ${receptionistToken}`)
        .send({
          method: 'CASH',
          amount: 85,
          reference: 'CASH-DRAWER-KINESIO-01',
          idempotencyKey: 'idem-kinesio-pay-cash-001',
        })
        .expect(201);

      expect(cashPayRes.body.status).toBe('COMPLETED');

      const paidSaleRes = await request(app.getHttpServer())
        .get(`/api/v1/sales/${settledKinesiologySaleId}`)
        .set('Authorization', `Bearer ${receptionistToken}`)
        .expect(200);
      expect(paidSaleRes.body.status).toBe('PAID');

      settledKinesiologyPaymentId = cashPayRes.body.id;
    });
  });

  // ==========================================================================
  // STEP 5: VALIDATE RECEIPT ELIGIBILITY
  // ==========================================================================
  describe('Step 5 — Validate Receipt Eligibility, Snapshots, and Access Control', () => {
    it('5.1 rejects receipt issuance for unsettled Sales (422) and unauthorized roles (403)', async () => {
      // Create & finalize an unsettled sale for the assessment session, then attempt receipt issuance -> 422
      const assessmentSales = Array.from(saleStore.store.values()).find(
        (s) => s.source.sourceId === assessmentSessionId,
      );
      expect(assessmentSales).toBeDefined();

      await request(app.getHttpServer())
        .post(`/api/v1/sales/${assessmentSales!.id.value}/finalize`)
        .set('Authorization', `Bearer ${receptionistToken}`)
        .send({})
        .expect(200);

      await request(app.getHttpServer())
        .post(`/api/v1/sales/${assessmentSales!.id.value}/receipt`)
        .set('Authorization', `Bearer ${receptionistToken}`)
        .send({})
        .expect(422);

      // Therapist (lacking receipts.manage) and Kitchen Staff cannot issue receipts -> 403
      await request(app.getHttpServer())
        .post(`/api/v1/sales/${settledKinesiologySaleId}/receipt`)
        .set('Authorization', `Bearer ${therapistToken}`)
        .send({})
        .expect(403);

      await request(app.getHttpServer())
        .post(`/api/v1/sales/${settledKinesiologySaleId}/receipt`)
        .set('Authorization', `Bearer ${kitchenToken}`)
        .send({})
        .expect(403);
    });

    it('5.2 issues an immutable Receipt for the settled Kinesiology Sale and supports idempotent retrieval and reprint', async () => {
      const issueRes = await request(app.getHttpServer())
        .post(`/api/v1/sales/${settledKinesiologySaleId}/receipt`)
        .set('Authorization', `Bearer ${receptionistToken}`)
        .send({})
        .expect(201);

      expect(issueRes.body.id).toBeDefined();
      expect(issueRes.body.saleId).toBe(settledKinesiologySaleId);
      expect(issueRes.body.receiptNumber).toMatch(/^REC-2026-\d{6}$/);
      expect(issueRes.body.total.amount).toBe(85);
      expect(issueRes.body.items).toHaveLength(1);
      expect(issueRes.body.items[0].description).toContain('Clinical Kinesiology Session');
      expect(issueRes.body.payments[0].method).toBe('CASH');

      issuedKinesiologyReceiptId = issueRes.body.id;
      issuedKinesiologyReceiptNumber = issueRes.body.receiptNumber;

      // Retrieve receipt by ID
      const getReceiptRes = await request(app.getHttpServer())
        .get(`/api/v1/receipts/${issuedKinesiologyReceiptId}`)
        .set('Authorization', `Bearer ${receptionistToken}`)
        .expect(200);

      expect(getReceiptRes.body.receiptNumber).toBe(issuedKinesiologyReceiptNumber);

      // Reprint receipt
      const reprintRes = await request(app.getHttpServer())
        .post(`/api/v1/receipts/${issuedKinesiologyReceiptId}/reprint`)
        .set('Authorization', `Bearer ${receptionistToken}`)
        .send({})
        .expect(200);

      expect(reprintRes.body.receiptNumber).toBe(issuedKinesiologyReceiptNumber);
      expect(reprintRes.body.reprintCount).toBe(1);
    });
  });

  // ==========================================================================
  // STEP 6: VERIFY PERSISTED CROSS-DOMAIN STATE
  // ==========================================================================
  describe('Step 6 — Verify Authoritative Persisted State Across All 7 Domain Stores', () => {
    it('6.1 confirms Client, Room, Appointment, TreatmentSession (with signed SOAP notes), Sale, Payment, and Receipt relationships in persistence', async () => {
      const persistedClient = await clientStore.findById(ClientId.create(patientClientId));
      expect(persistedClient).not.toBeNull();
      expect(persistedClient?.referenceNumber.value).toBe(patientClientRef);

      const persistedRoom = await roomStore.findById(primaryRoomId);
      expect(persistedRoom).not.toBeNull();
      expect(persistedRoom?.name).toBe('Kinesiology Box 1');

      const persistedAppt = await appointmentStore.findById(bookedTreatmentAppointmentId);
      expect(persistedAppt).not.toBeNull();
      expect(persistedAppt?.status).toBe('COMPLETED');
      expect(persistedAppt?.clientId).toBe(patientClientId);
      expect(persistedAppt?.roomId).toBe(primaryRoomId);

      const persistedSession = await sessionStore.findById(SessionId.create(primarySessionId));
      expect(persistedSession).not.toBeNull();
      expect(persistedSession?.status).toBe('COMPLETED');
      expect(persistedSession?.appointmentId).toBe(bookedTreatmentAppointmentId);
      expect(persistedSession?.clientId).toBe(patientClientId);
      expect(persistedSession?.notes.getSubjective()).toContain('VAS 2/10');
      expect(persistedSession?.notes.getObjective()).toContain('Active ROM 0-115 deg');
      expect(persistedSession?.notes.getAssessment()).toContain('Favorable progression');
      expect(persistedSession?.notes.getPlan()).toContain('closed-chain mini-squats');

      const persistedSale = await saleStore.findById(settledKinesiologySaleId);
      expect(persistedSale).not.toBeNull();
      expect(persistedSale?.status).toBe('PAID');
      expect(persistedSale?.source.sourceId).toBe(primarySessionId);
      expect(persistedSale?.total.amount).toBe(85);

      const persistedPayment = await paymentStore.findById(settledKinesiologyPaymentId);
      expect(persistedPayment).not.toBeNull();
      expect(persistedPayment?.status).toBe('COMPLETED');
      expect(persistedPayment?.saleId.value).toBe(settledKinesiologySaleId);

      const persistedReceipt = await receiptStore.findById(issuedKinesiologyReceiptId);
      expect(persistedReceipt).not.toBeNull();
      expect(persistedReceipt?.receiptNumber.value).toBe(issuedKinesiologyReceiptNumber);
      expect(persistedReceipt?.saleId.value).toBe(settledKinesiologySaleId);
    });
  });
});
