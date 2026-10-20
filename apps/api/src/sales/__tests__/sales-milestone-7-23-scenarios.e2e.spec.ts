import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import * as jwt from 'jsonwebtoken';
import {
  Sale,
  SaleId,
  Payment,
  PaymentId,
  PaymentMethod,
  PaymentStatus,
  Receipt,
  ReceiptId,
  ReceiptNumber,
  ReceiptStatus,
  SaleRepositoryPort,
  SaleRepositoryInterface,
  PaymentRepositoryPort,
  ReceiptRepositoryPort,
  FindSalesCriteria,
  FindSalesPagination,
  FindSalesSort,
  FindSalesResult,
  SaleMapper,
  CreateSaleHandler,
  GetSaleByIdHandler,
  AddSaleItemHandler,
  FinalizeSaleHandler,
  CalculateSaleHandler,
  ListSalesHandler,
  CancelSaleHandler,
  RecordPaymentHandler,
  CreatePaymentHandler,
  CompletePaymentHandler,
  GetPaymentByIdHandler,
  GetPaymentsBySaleIdHandler,
  GetSalePaymentHistoryHandler,
  IssueReceiptHandler,
  GetReceiptHandler,
  GetReceiptBySaleHandler,
  IUnitOfWork,
} from '@kinergy-platform/core';
import { InMemoryReceiptSequenceGenerator } from '@kinergy-platform/core/server';
import {
  TreatmentSession,
  SessionId,
  SessionStatus,
  SessionNotes,
  ITreatmentSessionRepository,
  GetTreatmentSessionByIdHandler,
  ISchedulingAppointmentLookupPort,
  AppointmentReferenceDTO,
} from '@kinergy-platform/core';
import { SalesController, SALE_REPOSITORY_TOKEN } from '../controllers/sales.controller';
import { PaymentsController, PAYMENT_REPOSITORY_TOKEN } from '../controllers/payments.controller';
import { ReceiptsController, RECEIPT_REPOSITORY_TOKEN } from '../controllers/receipts.controller';
import { UNIT_OF_WORK_TOKEN, SALE_SOURCE_VALIDATOR_TOKEN } from '../sales.tokens';
import { AuthenticationGuard } from '../../platform/identity/guards/authentication.guard';
import { AuthorizationGuard } from '../../platform/identity/authorization/authorization.guard';
import { DefaultAuthorizationEvaluator } from '../../platform/identity/authorization/default-authorization-evaluator';
import {
  ACCESS_TOKEN_SERVICE,
  IAccessTokenService,
} from '../../platform/identity/tokens/access-token.service';
import { IAccessTokenPayload } from '../../platform/identity/tokens/token-payload.interface';
import { IUserRepository, USER_REPOSITORY, User, UserStatus } from '../../platform/identity/domain';
import { PERMISSION_RESOLVER } from '../../platform/identity/authorization/authorization.interface';
import { AUTHORIZATION_EVALUATOR } from '../../platform/identity/authorization/authorization-evaluator.interface';
import { GlobalSanitizationValidationPipe } from '../../common/pipes/global-sanitization-validation.pipe';
import { SalesExceptionFilter } from '../filters/sales-exception.filter';
import { JwtTestFactory, DEFAULT_TEST_JWT_SECRET } from '@kinergy-platform/testing';
import {
  KinesiologySourceValidatorAdapter,
  CompositeSaleSourceValidatorAdapter,
  DefaultKinesiologyFeeScheduleResolver,
} from '../infrastructure/adapters';
import { SalesAuditEventPublisher } from '../infrastructure/sales-audit-event-publisher';

// ============================================================================
// Deterministic In-Memory Integration Repositories
// ============================================================================

class InMemoryIntegrationSaleRepository implements SaleRepositoryPort, SaleRepositoryInterface {
  public store = new Map<string, Sale>();
  public saveCount = 0;

  async findById(id: SaleId | string): Promise<Sale | null> {
    const key = typeof id === 'string' ? id.trim() : id.value;
    return this.store.get(key) ?? null;
  }

  async save(sale: Sale): Promise<void> {
    this.saveCount++;
    this.store.set(sale.id.value, sale);
  }

  async findBySourceReference(
    sourceType: string,
    sourceId: string,
    tenantId?: string,
  ): Promise<Sale | null> {
    for (const sale of this.store.values()) {
      if (
        sale.source.sourceType === sourceType &&
        sale.source.sourceId === sourceId &&
        (!tenantId || sale.tenantId === tenantId) &&
        sale.status !== 'CANCELLED'
      ) {
        return sale;
      }
    }
    return null;
  }

  async findBySourceCode(sourceCode: string, tenantId?: string): Promise<Sale | null> {
    for (const sale of this.store.values()) {
      if (
        sale.source.sourceCode === sourceCode &&
        (!tenantId || sale.tenantId === tenantId) &&
        sale.status !== 'CANCELLED'
      ) {
        return sale;
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
    if (criteria.status) {
      sales = sales.filter((s) => s.status === criteria.status);
    }
    return {
      items: sales.map((s) => SaleMapper.toSummaryDTO(s)),
      total: sales.length,
    };
  }

  clear(): void {
    this.store.clear();
    this.saveCount = 0;
  }
}

class InMemoryIntegrationPaymentRepository implements PaymentRepositoryPort {
  public store = new Map<string, Payment>();
  public saveCount = 0;

  async findById(id: PaymentId | string): Promise<Payment | null> {
    const key = typeof id === 'string' ? id.trim() : id.value;
    return this.store.get(key) ?? null;
  }

  async findBySaleId(saleId: SaleId | string): Promise<Payment[]> {
    const key = typeof saleId === 'string' ? saleId.trim() : saleId.value;
    return Array.from(this.store.values()).filter((p) => p.saleId.value === key);
  }

  async save(payment: Payment): Promise<void> {
    this.saveCount++;
    this.store.set(payment.id.value, payment);
  }

  clear(): void {
    this.store.clear();
    this.saveCount = 0;
  }
}

class InMemoryIntegrationReceiptRepository implements ReceiptRepositoryPort {
  public store = new Map<string, Receipt>();
  public saveCount = 0;
  private readonly sequenceGenerator = new InMemoryReceiptSequenceGenerator();

  async findById(id: ReceiptId | string): Promise<Receipt | null> {
    const key = typeof id === 'string' ? id.trim() : id.value;
    return this.store.get(key) ?? null;
  }

  async findBySaleId(saleId: SaleId | string, tenantId?: string): Promise<Receipt | null> {
    const key = typeof saleId === 'string' ? saleId.trim() : saleId.value;
    for (const receipt of this.store.values()) {
      if (receipt.saleId.value === key) {
        if (tenantId && receipt.tenantId !== tenantId) {
          continue;
        }
        return receipt;
      }
    }
    return null;
  }

  async findByReceiptNumber(receiptNumber: ReceiptNumber | string): Promise<Receipt | null> {
    const key = typeof receiptNumber === 'string' ? receiptNumber.trim() : receiptNumber.value;
    for (const receipt of this.store.values()) {
      if (receipt.receiptNumber.value === key) {
        return receipt;
      }
    }
    return null;
  }

  async save(receipt: Receipt): Promise<void> {
    this.saveCount++;
    this.store.set(receipt.id.value, receipt);
  }

  async getNextReceiptNumber(tenantId: string, year: number): Promise<ReceiptNumber> {
    return this.sequenceGenerator.getNextReceiptNumber(tenantId, year);
  }

  clear(): void {
    this.store.clear();
    this.saveCount = 0;
  }
}

class InMemoryTreatmentSessionRepository implements ITreatmentSessionRepository {
  public sessions = new Map<string, TreatmentSession>();

  async findById(id: SessionId): Promise<TreatmentSession | null> {
    return this.sessions.get(id.getValue()) ?? null;
  }

  async findByAppointmentId(appointmentId: string): Promise<TreatmentSession | null> {
    for (const session of this.sessions.values()) {
      if (session.appointmentId === appointmentId) return session;
    }
    return null;
  }

  async save(session: TreatmentSession): Promise<void> {
    this.sessions.set(session.id.getValue(), session);
  }

  async findHistoryByClientId(): Promise<never> {
    throw new Error('Not used in test.');
  }

  clear(): void {
    this.sessions.clear();
  }
}

// ============================================================================
// Test Suite: Milestone 7.23 Scenario 1
// Treatment Session → Create Sale → Add Kinesiology Item → Calculate Total
// → Cash Payment → Complete Payment → Sale PAID → Receipt Available
// ============================================================================

describe('Milestone 7.23 Scenario 1: Kinesiology Treatment Session to Paid Cash Sale and Accessible Receipt', () => {
  let app: INestApplication;
  let saleRepo: InMemoryIntegrationSaleRepository;
  let paymentRepo: InMemoryIntegrationPaymentRepository;
  let receiptRepo: InMemoryIntegrationReceiptRepository;
  let sessionRepo: InMemoryTreatmentSessionRepository;
  let mockAppointmentLookup: jest.Mocked<ISchedulingAppointmentLookupPort>;

  const defaultTenantId = 'tenant_kinergy_main';
  const competitorTenantId = 'tenant_kinergy_rival';

  // Users for IAM Authorization
  const managerUser = new User({
    id: 'usr_mgr_s1',
    email: 'manager@kinergy.platform',
    passwordHash: 'dummy_hash',
    status: UserStatus.ACTIVE,
    roles: ['Manager'],
    permissions: [
      'sales.create',
      'sales.read',
      'sales.cancel',
      'payments.create',
      'payments.read',
      'payments.manage',
      'receipts.manage',
      'receipts.read',
    ],
    tenantId: defaultTenantId,
    tokenVersion: 1,
  });

  const receptionistUser = new User({
    id: 'usr_recep_s1',
    email: 'receptionist@kinergy.platform',
    passwordHash: 'dummy_hash',
    status: UserStatus.ACTIVE,
    roles: ['Receptionist'],
    permissions: [
      'sales.create',
      'sales.read',
      'payments.create',
      'payments.read',
      'receipts.manage',
      'receipts.read',
    ],
    tenantId: defaultTenantId,
    tokenVersion: 1,
  });

  const trainerUser = new User({
    id: 'usr_trainer_s1',
    email: 'trainer@kinergy.platform',
    passwordHash: 'dummy_hash',
    status: UserStatus.ACTIVE,
    roles: ['Trainer'],
    permissions: ['sales.read'], // Read-only, lacks sales.create & payments.create
    tenantId: defaultTenantId,
    tokenVersion: 1,
  });

  const clientUser = new User({
    id: 'usr_client_pt_001',
    email: 'client001@example.com',
    passwordHash: 'dummy_hash',
    status: UserStatus.ACTIVE,
    roles: ['Client'],
    permissions: ['sales.read', 'receipts.read'],
    tenantId: defaultTenantId,
    tokenVersion: 1,
  });

  const competitorUser = new User({
    id: 'usr_rival_mgr',
    email: 'rival@competitor.com',
    passwordHash: 'dummy_hash',
    status: UserStatus.ACTIVE,
    roles: ['Manager'],
    permissions: ['sales.create', 'sales.read', 'payments.create', 'receipts.read'],
    tenantId: competitorTenantId,
    tokenVersion: 1,
  });

  const userStore = new Map<string, User>();
  [managerUser, receptionistUser, trainerUser, clientUser, competitorUser].forEach((u) =>
    userStore.set(u.id, u),
  );

  const mockUserRepository: Partial<IUserRepository> = {
    findById: async (id: string) => userStore.get(id) ?? null,
    findByEmail: async (email: string) =>
      Array.from(userStore.values()).find((u) => u.email === email) ?? null,
  };

  const mockAccessTokenService: IAccessTokenService = {
    generateToken: async (identity) =>
      JwtTestFactory.createSignedToken({
        sub: identity.userId,
        email: identity.email,
        roles: identity.roles,
        permissions: identity.permissions,
        tenantId: identity.tenantId,
      }),
    validateToken: async (token: string) => {
      try {
        return jwt.verify(token, DEFAULT_TEST_JWT_SECRET) as unknown as IAccessTokenPayload;
      } catch {
        return null;
      }
    },
  };

  const createToken = (u: User): string =>
    JwtTestFactory.createSignedToken({
      sub: u.id,
      email: u.email,
      roles: u.roles,
      permissions: u.permissions,
      tenantId: u.tenantId,
      tokenVersion: u.tokenVersion,
    });

  let managerToken: string;
  let receptionistToken: string;
  let trainerToken: string;
  let clientToken: string;
  let competitorToken: string;

  beforeAll(async () => {
    managerToken = createToken(managerUser);
    receptionistToken = createToken(receptionistUser);
    trainerToken = createToken(trainerUser);
    clientToken = createToken(clientUser);
    competitorToken = createToken(competitorUser);

    saleRepo = new InMemoryIntegrationSaleRepository();
    paymentRepo = new InMemoryIntegrationPaymentRepository();
    receiptRepo = new InMemoryIntegrationReceiptRepository();
    sessionRepo = new InMemoryTreatmentSessionRepository();

    mockAppointmentLookup = {
      getAppointmentReference: jest.fn(),
    };

    const getSessionByIdHandler = new GetTreatmentSessionByIdHandler(sessionRepo);
    const kinesiologyAdapter = new KinesiologySourceValidatorAdapter(
      getSessionByIdHandler,
      mockAppointmentLookup,
      new DefaultKinesiologyFeeScheduleResolver(),
    );
    const compositeValidator = new CompositeSaleSourceValidatorAdapter(kinesiologyAdapter);

    const mockUnitOfWork: IUnitOfWork = {
      executeInTransaction: jest.fn(async <T>(fn: () => Promise<T>): Promise<T> => fn()),
    };

    const auditPublisher = new SalesAuditEventPublisher();

    const moduleFixture: TestingModule = await Test.createTestingModule({
      controllers: [SalesController, PaymentsController, ReceiptsController],
      providers: [
        { provide: SALE_REPOSITORY_TOKEN, useValue: saleRepo },
        { provide: PAYMENT_REPOSITORY_TOKEN, useValue: paymentRepo },
        { provide: RECEIPT_REPOSITORY_TOKEN, useValue: receiptRepo },
        { provide: UNIT_OF_WORK_TOKEN, useValue: mockUnitOfWork },
        { provide: SALE_SOURCE_VALIDATOR_TOKEN, useValue: compositeValidator },
        { provide: ACCESS_TOKEN_SERVICE, useValue: mockAccessTokenService },
        { provide: USER_REPOSITORY, useValue: mockUserRepository },
        {
          provide: PERMISSION_RESOLVER,
          useValue: {
            resolvePermissions: async (_userId: string, _roles: string[], directPerms?: string[]) =>
              directPerms ?? [],
          },
        },
        { provide: AUTHORIZATION_EVALUATOR, useClass: DefaultAuthorizationEvaluator },
        AuthenticationGuard,
        AuthorizationGuard,
        {
          provide: CreateSaleHandler,
          useFactory: (repo: SaleRepositoryPort) =>
            new CreateSaleHandler(repo, undefined, undefined, compositeValidator),
          inject: [SALE_REPOSITORY_TOKEN],
        },
        {
          provide: GetSaleByIdHandler,
          useFactory: (repo: SaleRepositoryPort) => new GetSaleByIdHandler(repo),
          inject: [SALE_REPOSITORY_TOKEN],
        },
        {
          provide: AddSaleItemHandler,
          useFactory: (repo: SaleRepositoryPort) => new AddSaleItemHandler(repo),
          inject: [SALE_REPOSITORY_TOKEN],
        },
        {
          provide: FinalizeSaleHandler,
          useFactory: (repo: SaleRepositoryPort) =>
            new FinalizeSaleHandler(repo, undefined, auditPublisher),
          inject: [SALE_REPOSITORY_TOKEN],
        },
        {
          provide: CalculateSaleHandler,
          useFactory: (repo: SaleRepositoryPort) => new CalculateSaleHandler(repo),
          inject: [SALE_REPOSITORY_TOKEN],
        },
        {
          provide: ListSalesHandler,
          useFactory: (repo: SaleRepositoryPort) => new ListSalesHandler(repo),
          inject: [SALE_REPOSITORY_TOKEN],
        },
        {
          provide: CancelSaleHandler,
          useFactory: (repo: SaleRepositoryPort) =>
            new CancelSaleHandler(repo, undefined, auditPublisher, paymentRepo, mockUnitOfWork),
          inject: [SALE_REPOSITORY_TOKEN],
        },
        {
          provide: RecordPaymentHandler,
          useFactory: () =>
            new RecordPaymentHandler(
              paymentRepo,
              saleRepo,
              undefined,
              auditPublisher,
              mockUnitOfWork,
            ),
        },
        {
          provide: CreatePaymentHandler,
          useExisting: RecordPaymentHandler,
        },
        {
          provide: CompletePaymentHandler,
          useFactory: () =>
            new CompletePaymentHandler(
              paymentRepo,
              saleRepo,
              undefined,
              auditPublisher,
              mockUnitOfWork,
            ),
        },
        {
          provide: GetPaymentByIdHandler,
          useFactory: () => new GetPaymentByIdHandler(paymentRepo, saleRepo),
        },
        {
          provide: GetPaymentsBySaleIdHandler,
          useFactory: () => new GetPaymentsBySaleIdHandler(paymentRepo, saleRepo),
        },
        {
          provide: GetSalePaymentHistoryHandler,
          useFactory: () => new GetSalePaymentHistoryHandler(paymentRepo, saleRepo),
        },
        {
          provide: IssueReceiptHandler,
          useFactory: () =>
            new IssueReceiptHandler(
              receiptRepo,
              saleRepo,
              paymentRepo,
              undefined,
              undefined,
              auditPublisher,
            ),
        },
        {
          provide: GetReceiptHandler,
          useFactory: () => new GetReceiptHandler(receiptRepo),
        },
        {
          provide: GetReceiptBySaleHandler,
          useFactory: () => new GetReceiptBySaleHandler(receiptRepo, saleRepo),
        },
      ],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalFilters(new SalesExceptionFilter());
    app.useGlobalPipes(new GlobalSanitizationValidationPipe());
    await app.init();
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  beforeEach(() => {
    saleRepo.clear();
    paymentRepo.clear();
    receiptRepo.clear();
    sessionRepo.clear();
    jest.clearAllMocks();
  });

  // Helper to seed a valid COMPLETED treatment session
  function seedClinicalSession(
    sessionId = 'sess-kine-s1-001',
    status = SessionStatus.COMPLETED,
    clientId = 'usr_client_pt_001',
    appointmentId = 'appt-kine-s1-999',
  ): TreatmentSession {
    const session = TreatmentSession.reconstitute({
      id: SessionId.create(sessionId),
      version: 2,
      status,
      clientId,
      therapistId: 'therapist-dr-jones',
      appointmentId,
      notes: SessionNotes.create({
        subjective: 'Lumbar spine extension test normalized. Patient fully ambulatory.',
        plan: 'Discharge with home rehabilitation protocol.',
      }),
      createdAt: new Date('2026-10-19T09:00:00.000Z'),
      updatedAt: new Date('2026-10-19T10:00:00.000Z'),
    });
    sessionRepo.sessions.set(session.id.getValue(), session);
    return session;
  }

  // ==========================================================================
  // Primary Business Journey: Scenario 1
  // ==========================================================================
  describe('Primary Business Journey: Treatment Session → Sale → Cash Payment → Sale PAID → Receipt', () => {
    it('executes the full legitimate kinesiology checkout journey end-to-end and validates persisted invariants', async () => {
      // ----------------------------------------------------------------------
      // Step 1: Upstream Billable Source Setup
      // ----------------------------------------------------------------------
      const sessionId = 'sess-kine-s1-001';
      const clientId = 'usr_client_pt_001';
      const appointmentId = 'appt-kine-s1-999';

      seedClinicalSession(sessionId, SessionStatus.COMPLETED, clientId, appointmentId);

      const apptRef: AppointmentReferenceDTO = {
        appointmentId,
        clientId,
        therapistId: 'therapist-dr-jones',
        scheduledAt: new Date('2026-10-19T09:00:00.000Z'),
        isEligibleForSession: true,
      };
      mockAppointmentLookup.getAppointmentReference.mockResolvedValue(apptRef);

      // ----------------------------------------------------------------------
      // Step 2: Create Commercial Sale from Kinesiology Session (POST /sales)
      // ----------------------------------------------------------------------
      const createSaleRes = await request(app.getHttpServer())
        .post('/api/v1/sales')
        .set('Authorization', `Bearer ${managerToken}`)
        .send({
          sourceReference: {
            type: 'KINESIOLOGY_SESSION',
            referenceId: sessionId,
          },
          clientId,
          currency: 'USD',
        });

      expect(createSaleRes.status).toBe(201);
      const saleId = createSaleRes.body.id;
      expect(saleId).toBeDefined();
      expect(createSaleRes.body.status).toBe('DRAFT');
      expect(createSaleRes.body.currency).toBe('USD');
      expect(createSaleRes.body.clientId).toBe(clientId);
      expect(createSaleRes.body.tenantId).toBe(defaultTenantId);

      // Verify authoritative price and line item auto-population from clinical details
      // Rate for TREATMENT = 8500 cents = $85.00
      expect(createSaleRes.body.subtotalAmount).toBe(85.0);
      expect(createSaleRes.body.totalAmount).toBe(85.0);
      expect(createSaleRes.body.total.cents).toBe(8500);
      expect(createSaleRes.body.itemCount).toBe(1);
      expect(createSaleRes.body.items).toHaveLength(1);
      expect(createSaleRes.body.items[0].description).toContain('Clinical Kinesiology Session');
      expect(createSaleRes.body.items[0].unitPriceAmount).toBe(85.0);
      expect(createSaleRes.body.items[0].quantity).toBe(1);

      // ----------------------------------------------------------------------
      // Step 3: Calculate / Verify Authoritative Total (GET /sales/:id/calculate)
      // ----------------------------------------------------------------------
      const calcRes = await request(app.getHttpServer())
        .get(`/api/v1/sales/${saleId}/calculate`)
        .set('Authorization', `Bearer ${managerToken}`);

      expect(calcRes.status).toBe(200);
      expect(calcRes.body.totalAmount).toBe(85.0);
      expect(calcRes.body.total.cents).toBe(8500);

      // ----------------------------------------------------------------------
      // Step 4: Finalize Sale (POST /sales/:id/finalize) -> PENDING_PAYMENT
      // ----------------------------------------------------------------------
      const finalizeRes = await request(app.getHttpServer())
        .post(`/api/v1/sales/${saleId}/finalize`)
        .set('Authorization', `Bearer ${receptionistToken}`)
        .send();

      expect(finalizeRes.status).toBe(200);
      expect(finalizeRes.body.id).toBe(saleId);
      expect(finalizeRes.body.status).toBe('PENDING_PAYMENT');
      expect(finalizeRes.body.totalAmount).toBe(85.0);

      // ----------------------------------------------------------------------
      // Step 5: Tendering CASH Payment (POST /sales/:saleId/payments)
      // ----------------------------------------------------------------------
      const paymentRes = await request(app.getHttpServer())
        .post(`/api/v1/sales/${saleId}/payments`)
        .set('Authorization', `Bearer ${receptionistToken}`)
        .send({
          method: 'CASH',
          amount: 85.0,
          currency: 'USD',
          status: 'COMPLETED',
          reference: 'POS-CASH-DRAWER-01',
        });

      expect(paymentRes.status).toBe(201);
      const paymentId = paymentRes.body.id;
      expect(paymentId).toBeDefined();
      expect(paymentRes.body.saleId).toBe(saleId);
      expect(paymentRes.body.method).toBe('CASH');
      expect(paymentRes.body.amountValue).toBe(85.0);
      expect(paymentRes.body.amount.amount).toBe(85.0);
      expect(paymentRes.body.amount.cents).toBe(8500);
      expect(paymentRes.body.status).toBe('COMPLETED');

      // Verify Sale status transitioned to PAID immediately after full payment completion
      const saleAfterPaymentRes = await request(app.getHttpServer())
        .get(`/api/v1/sales/${saleId}`)
        .set('Authorization', `Bearer ${managerToken}`);

      expect(saleAfterPaymentRes.status).toBe(200);
      expect(saleAfterPaymentRes.body.status).toBe('PAID');
      expect(saleAfterPaymentRes.body.totalAmount).toBe(85.0);

      // ----------------------------------------------------------------------
      // Step 6: Issue Receipt Voucher (POST /sales/:saleId/receipt)
      // ----------------------------------------------------------------------
      const issueReceiptRes = await request(app.getHttpServer())
        .post(`/api/v1/sales/${saleId}/receipt`)
        .set('Authorization', `Bearer ${receptionistToken}`)
        .send();

      expect(issueReceiptRes.status).toBe(201);
      const receiptId = issueReceiptRes.body.id;
      const receiptNumber = issueReceiptRes.body.receiptNumber;

      expect(receiptId).toBeDefined();
      expect(receiptNumber).toMatch(/^REC-\d{4}-\d{6}$/);
      expect(issueReceiptRes.body.saleId).toBe(saleId);
      expect(issueReceiptRes.body.status).toBe('ISSUED');
      expect(issueReceiptRes.body.paymentMethod).toBe('CASH');
      expect(issueReceiptRes.body.paymentStatus).toBe('COMPLETED');
      expect(issueReceiptRes.body.total.amount).toBe(85.0);
      expect(issueReceiptRes.body.total.cents).toBe(8500);

      // Verify frozen point-in-time snapshots
      expect(issueReceiptRes.body.clientSnapshot.clientId).toBe(clientId);
      expect(issueReceiptRes.body.items).toHaveLength(1);
      expect(issueReceiptRes.body.items[0].unitPrice.amount).toBe(85.0);
      expect(issueReceiptRes.body.payments).toHaveLength(1);
      expect(issueReceiptRes.body.payments[0].method).toBe('CASH');
      expect(issueReceiptRes.body.payments[0].amount.amount).toBe(85.0);

      // ----------------------------------------------------------------------
      // Step 7: Retrieve Receipt via Receipt Query Contract (GET /sales/:saleId/receipt)
      // ----------------------------------------------------------------------
      const getReceiptRes = await request(app.getHttpServer())
        .get(`/api/v1/sales/${saleId}/receipt`)
        .set('Authorization', `Bearer ${clientToken}`);

      expect(getReceiptRes.status).toBe(200);
      expect(getReceiptRes.body.id).toBe(receiptId);
      expect(getReceiptRes.body.receiptNumber).toBe(receiptNumber);
      expect(getReceiptRes.body.status).toBe('ISSUED');
      expect(getReceiptRes.body.total.amount).toBe(85.0);
      expect(getReceiptRes.body.total.cents).toBe(8500);
      expect(getReceiptRes.body.paymentMethod).toBe('CASH');

      // Idempotent re-issuance returns identical voucher without creating duplicate
      const duplicateIssueRes = await request(app.getHttpServer())
        .post(`/api/v1/sales/${saleId}/receipt`)
        .set('Authorization', `Bearer ${managerToken}`)
        .send();

      expect(duplicateIssueRes.status).toBe(201);
      expect(duplicateIssueRes.body.id).toBe(receiptId);
      expect(duplicateIssueRes.body.receiptNumber).toBe(receiptNumber);

      // ----------------------------------------------------------------------
      // Step 8: Strict Reload of Persisted Database State & Invariant Auditing
      // ----------------------------------------------------------------------
      // A. Exactly one Sale exists in persistence for this clinical source
      const persistedSale = await saleRepo.findById(saleId);
      expect(persistedSale).not.toBeNull();
      expect(persistedSale!.id.value).toBe(saleId);
      expect(persistedSale!.source.sourceType).toBe('KINESIOLOGY_SESSION');
      expect(persistedSale!.source.sourceId).toBe(sessionId);
      expect(persistedSale!.status).toBe('PAID');
      expect(persistedSale!.total.amount).toBe(85.0);
      expect(persistedSale!.total.cents).toBe(8500);
      expect(persistedSale!.items).toHaveLength(1);

      // Confirm findBySourceReference returns this exact sale
      const refCheck = await saleRepo.findBySourceReference('KINESIOLOGY_SESSION', sessionId);
      expect(refCheck).not.toBeNull();
      expect(refCheck!.id.value).toBe(saleId);

      // B. Exactly one Payment exists for this scenario, and it is completed CASH
      const persistedPayments = await paymentRepo.findBySaleId(saleId);
      expect(persistedPayments).toHaveLength(1);
      const persistedPayment = persistedPayments[0]!;
      expect(persistedPayment.id.value).toBe(paymentId);
      expect(persistedPayment.method).toBe(PaymentMethod.CASH);
      expect(persistedPayment.status).toBe(PaymentStatus.COMPLETED);
      expect(persistedPayment.amount.amount).toBe(85.0);
      expect(persistedPayment.amount.cents).toBe(8500);

      // C. Exactly one Receipt exists for this sale
      const persistedReceipt = await receiptRepo.findBySaleId(saleId);
      expect(persistedReceipt).not.toBeNull();
      expect(persistedReceipt!.id.value).toBe(receiptId);
      expect(persistedReceipt!.receiptNumber.value).toBe(receiptNumber);
      expect(persistedReceipt!.status).toBe(ReceiptStatus.ISSUED);
      expect(persistedReceipt!.total.amount).toBe(85.0);

      // D. TreatmentSession in Kinesiology repository is unmutated
      const persistedSession = await sessionRepo.findById(SessionId.create(sessionId));
      expect(persistedSession).not.toBeNull();
      expect(persistedSession!.status).toBe(SessionStatus.COMPLETED);
      expect(persistedSession!.notes.getSubjective()).toContain('Patient fully ambulatory');
    });
  });

  // ==========================================================================
  // Invariant & Safety Guard Suites (Negative & Boundary Cases)
  // ==========================================================================
  describe('Invariant & Safety Guard Enforcement for Scenario 1', () => {
    it('Invariant 1: Rejects duplicate sale creation for an already-billed clinical session (Single-Billing Invariant)', async () => {
      const sessionId = 'sess-kine-dup-01';
      seedClinicalSession(sessionId, SessionStatus.COMPLETED);

      // First sale creation -> 201 Created
      const firstRes = await request(app.getHttpServer())
        .post('/api/v1/sales')
        .set('Authorization', `Bearer ${managerToken}`)
        .send({
          sourceReference: { type: 'KINESIOLOGY_SESSION', referenceId: sessionId },
          clientId: 'usr_client_pt_001',
        });
      expect(firstRes.status).toBe(201);
      const originalSaleId = firstRes.body.id;

      // Second sale creation attempt with different caller or ID -> 409 Conflict
      const secondRes = await request(app.getHttpServer())
        .post('/api/v1/sales')
        .set('Authorization', `Bearer ${managerToken}`)
        .send({
          id: 'sale-attempted-duplicate-002',
          sourceReference: { type: 'KINESIOLOGY_SESSION', referenceId: sessionId },
          clientId: 'usr_client_pt_001',
        });

      expect(secondRes.status).toBe(409);
      expect(secondRes.body.message).toContain('already exists for KINESIOLOGY_SESSION');
      expect(secondRes.body.message).toContain('Duplicate sale creation is prohibited');

      // Assert persistence contains exactly 1 sale for this session
      expect(saleRepo.store.size).toBe(1);
      expect(saleRepo.store.has(originalSaleId)).toBe(true);
    });

    it('Invariant 2: Rejects billing an ineligible clinical session (IN_PROGRESS) with zero partial writes', async () => {
      const sessionId = 'sess-kine-in-progress';
      seedClinicalSession(sessionId, SessionStatus.IN_PROGRESS);

      const res = await request(app.getHttpServer())
        .post('/api/v1/sales')
        .set('Authorization', `Bearer ${managerToken}`)
        .send({
          sourceReference: { type: 'KINESIOLOGY_SESSION', referenceId: sessionId },
        });

      expect(res.status).toBe(400);
      expect(res.body.message).toContain('Only COMPLETED clinical sessions can be billed');

      // Zero sales created
      expect(saleRepo.store.size).toBe(0);

      // TreatmentSession remains in IN_PROGRESS state without corruption
      const session = await sessionRepo.findById(SessionId.create(sessionId));
      expect(session?.status).toBe(SessionStatus.IN_PROGRESS);
    });

    it('Invariant 3: Rejects client mismatch between requested client and authoritative session client', async () => {
      const sessionId = 'sess-kine-mismatch';
      seedClinicalSession(sessionId, SessionStatus.COMPLETED, 'usr_client_pt_001');

      const res = await request(app.getHttpServer())
        .post('/api/v1/sales')
        .set('Authorization', `Bearer ${managerToken}`)
        .send({
          sourceReference: { type: 'KINESIOLOGY_SESSION', referenceId: sessionId },
          clientId: 'usr_client_attacker_999', // Mismatched client!
        });

      expect(res.status).toBe(400);
      expect(res.body.message).toContain('Client mismatch');
      expect(saleRepo.store.size).toBe(0);
    });

    it('Invariant 4: Rejects recording payment on a DRAFT sale before finalization', async () => {
      const sessionId = 'sess-kine-draft-pay';
      seedClinicalSession(sessionId, SessionStatus.COMPLETED);

      const createRes = await request(app.getHttpServer())
        .post('/api/v1/sales')
        .set('Authorization', `Bearer ${managerToken}`)
        .send({
          sourceReference: { type: 'KINESIOLOGY_SESSION', referenceId: sessionId },
        });
      const saleId = createRes.body.id;

      // Attempt payment directly while sale is still DRAFT
      const payRes = await request(app.getHttpServer())
        .post(`/api/v1/sales/${saleId}/payments`)
        .set('Authorization', `Bearer ${receptionistToken}`)
        .send({
          method: 'CASH',
          amount: 80.0,
          status: 'COMPLETED',
        });

      expect(payRes.status).toBe(422);
      expect(payRes.body.message).toContain('payable');

      // Assert zero payments recorded
      expect(paymentRepo.store.size).toBe(0);
    });

    it('Invariant 5: Rejects cash overpayment exceeding remaining sale balance', async () => {
      const sessionId = 'sess-kine-overpay';
      seedClinicalSession(sessionId, SessionStatus.COMPLETED);

      // Create and finalize sale ($80.00 rate default)
      const createRes = await request(app.getHttpServer())
        .post('/api/v1/sales')
        .set('Authorization', `Bearer ${managerToken}`)
        .send({
          sourceReference: { type: 'KINESIOLOGY_SESSION', referenceId: sessionId },
        });
      const saleId = createRes.body.id;

      await request(app.getHttpServer())
        .post(`/api/v1/sales/${saleId}/finalize`)
        .set('Authorization', `Bearer ${managerToken}`)
        .send();

      // Attempt overpayment: $120.00 against $80.00 total
      const overpayRes = await request(app.getHttpServer())
        .post(`/api/v1/sales/${saleId}/payments`)
        .set('Authorization', `Bearer ${receptionistToken}`)
        .send({
          method: 'CASH',
          amount: 120.0,
          status: 'COMPLETED',
        });

      expect(overpayRes.status).toBe(422);
      expect(overpayRes.body.message).toContain('exceeds');

      // Sale status remains PENDING_PAYMENT
      const sale = await saleRepo.findById(saleId);
      expect(sale?.status).toBe('PENDING_PAYMENT');
      expect(paymentRepo.store.size).toBe(0);
    });

    it('Invariant 6: Rejects receipt issuance when sale is not in PAID status', async () => {
      const sessionId = 'sess-kine-premature-rec';
      seedClinicalSession(sessionId, SessionStatus.COMPLETED);

      const createRes = await request(app.getHttpServer())
        .post('/api/v1/sales')
        .set('Authorization', `Bearer ${managerToken}`)
        .send({
          sourceReference: { type: 'KINESIOLOGY_SESSION', referenceId: sessionId },
        });
      const saleId = createRes.body.id;

      // Attempt to issue receipt while sale is DRAFT
      const res = await request(app.getHttpServer())
        .post(`/api/v1/sales/${saleId}/receipt`)
        .set('Authorization', `Bearer ${managerToken}`)
        .send();

      expect(res.status).toBe(422);
      expect(res.body.message).toContain('PAID or COMPLETED');
      expect(receiptRepo.store.size).toBe(0);
    });

    it('Invariant 7: Enforces strict IAM authorization and tenant isolation across all endpoints', async () => {
      const sessionId = 'sess-kine-auth';
      seedClinicalSession(sessionId, SessionStatus.COMPLETED);

      // Unauthenticated request -> 401 Unauthorized
      const unauthRes = await request(app.getHttpServer())
        .post('/api/v1/sales')
        .send({
          sourceReference: { type: 'KINESIOLOGY_SESSION', referenceId: sessionId },
        });
      expect(unauthRes.status).toBe(401);

      // Unauthorized role (Trainer lacks sales.create) -> 403 Forbidden
      const trainerRes = await request(app.getHttpServer())
        .post('/api/v1/sales')
        .set('Authorization', `Bearer ${trainerToken}`)
        .send({
          sourceReference: { type: 'KINESIOLOGY_SESSION', referenceId: sessionId },
        });
      expect(trainerRes.status).toBe(403);

      // Create sale as Manager
      const createRes = await request(app.getHttpServer())
        .post('/api/v1/sales')
        .set('Authorization', `Bearer ${managerToken}`)
        .send({
          sourceReference: { type: 'KINESIOLOGY_SESSION', referenceId: sessionId },
        });
      const saleId = createRes.body.id;

      // Cross-tenant probe by competitor manager -> 404 Not Found (tenant-isolated)
      const crossTenantRes = await request(app.getHttpServer())
        .get(`/api/v1/sales/${saleId}`)
        .set('Authorization', `Bearer ${competitorToken}`);
      expect(crossTenantRes.status).toBe(404);
    });
  });
});
