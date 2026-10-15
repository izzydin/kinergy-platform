import 'reflect-metadata';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import * as jwt from 'jsonwebtoken';
import {
  Payment,
  PaymentId,
  Sale,
  SaleId,
  Money,
  SaleSource,
  SaleSourceType,
  PaymentMethod,
  PaymentStatus,
  SaleStatus,
  PaymentRepositoryPort,
  SaleRepositoryPort,
  IUnitOfWork,
  RecordPaymentHandler,
  CreatePaymentHandler,
  GetPaymentByIdHandler,
  GetPaymentsBySaleIdHandler,
  GetSalePaymentHistoryHandler,
  CompletePaymentHandler,
  FailPaymentHandler,
  CancelPaymentHandler,
  ListPaymentsHandler,
  Clock,
  PaymentOptimisticLockException,
  SaleOptimisticLockException,
} from '@kinergy-platform/core';
import {
  PaymentsController,
  PAYMENT_REPOSITORY_TOKEN,
  UNIT_OF_WORK_TOKEN,
} from '../controllers/payments.controller';
import { SALE_REPOSITORY_TOKEN } from '../sales.tokens';
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

class TestClock implements Clock {
  constructor(private currentTime: Date) {}
  now(): Date {
    return new Date(this.currentTime.getTime());
  }
  today(): Date {
    const d = new Date(this.currentTime.getTime());
    d.setUTCHours(0, 0, 0, 0);
    return d;
  }
  timezone(): string {
    return 'UTC';
  }
  advanceMinutes(mins: number): void {
    this.currentTime = new Date(this.currentTime.getTime() + mins * 60000);
  }
}

/**
 * High-Fidelity Transactional In-Memory Payment Repository with OCC.
 */
class InMemoryIntegrationPaymentRepository implements PaymentRepositoryPort {
  public store = new Map<string, Payment>();
  public saveCount = 0;
  public shouldFailSave = false;

  public clonePayment(payment: Payment): Payment {
    return Payment.reconstitute({
      id: payment.id,
      tenantId: payment.tenantId,
      saleId: payment.saleId,
      method: payment.method,
      amount: payment.amount,
      status: payment.status,
      reference: payment.reference,
      paidAt: payment.paidAt,
      createdAt: payment.createdAt,
      updatedAt: payment.updatedAt,
      version: payment.version,
    });
  }

  async findById(id: PaymentId | string): Promise<Payment | null> {
    const key = typeof id === 'string' ? id.trim() : id.value;
    const payment = this.store.get(key);
    if (!payment) return null;
    return this.clonePayment(payment);
  }

  async findBySaleId(saleId: SaleId | string): Promise<Payment[]> {
    const key = typeof saleId === 'string' ? saleId.trim() : saleId.value;
    return Array.from(this.store.values())
      .filter((p) => p.saleId.value === key)
      .map((p) => this.clonePayment(p));
  }

  async save(payment: Payment): Promise<void> {
    if (this.shouldFailSave) {
      throw new Error('Database disk I/O error during Payment persistence.');
    }
    const existing = this.store.get(payment.id.value);
    if (existing && existing !== payment && existing.version >= payment.version) {
      throw new PaymentOptimisticLockException(payment.id.value, existing.version);
    }
    this.saveCount++;
    this.store.set(payment.id.value, this.clonePayment(payment));
  }

  clear(): void {
    this.store.clear();
    this.saveCount = 0;
    this.shouldFailSave = false;
  }
}

/**
 * High-Fidelity Transactional In-Memory Sale Repository with OCC.
 */
class InMemoryIntegrationSaleRepository implements SaleRepositoryPort {
  public store = new Map<string, Sale>();
  public saveCount = 0;
  public shouldFailSave = false;

  public cloneSale(sale: Sale): Sale {
    return Sale.reconstitute({
      id: sale.id,
      tenantId: sale.tenantId,
      clientId: sale.clientId,
      currency: sale.currency,
      source: sale.source,
      status: sale.status,
      orderDiscount: sale.orderDiscount,
      items: [...sale.items],
      subtotal: sale.subtotal,
      discountTotal: sale.discountTotal,
      total: sale.total,
      completedAt: sale.completedAt,
      cancelledAt: sale.cancelledAt,
      cancellationReason: sale.cancellationReason,
      refundedAt: sale.refundedAt,
      createdAt: sale.createdAt,
      updatedAt: sale.updatedAt,
      version: sale.version,
    });
  }

  async findById(id: SaleId | string): Promise<Sale | null> {
    const key = typeof id === 'string' ? id.trim() : id.value;
    const sale = this.store.get(key);
    if (!sale) return null;
    return this.cloneSale(sale);
  }

  async save(sale: Sale): Promise<void> {
    if (this.shouldFailSave) {
      throw new Error('Database disk I/O error during Sale persistence.');
    }
    const existing = this.store.get(sale.id.value);
    if (existing && existing !== sale && existing.version >= sale.version) {
      throw new SaleOptimisticLockException('Sale', sale.id.value, existing.version);
    }
    this.saveCount++;
    this.store.set(sale.id.value, this.cloneSale(sale));
  }

  clear(): void {
    this.store.clear();
    this.saveCount = 0;
    this.shouldFailSave = false;
  }
}

/**
 * Unit of Work with rollback capabilities simulating PostgreSQL ACID transactions.
 */
class TransactionalIntegrationUnitOfWork implements IUnitOfWork {
  public transactionExecuted = false;

  constructor(
    private readonly paymentRepo: InMemoryIntegrationPaymentRepository,
    private readonly saleRepo: InMemoryIntegrationSaleRepository,
  ) {}

  async executeInTransaction<T>(work: () => Promise<T>): Promise<T> {
    this.transactionExecuted = true;
    const paymentSnapshot = new Map(this.paymentRepo.store);
    const saleSnapshot = new Map(this.saleRepo.store);

    try {
      return await work();
    } catch (error) {
      this.paymentRepo.store = paymentSnapshot;
      this.saleRepo.store = saleSnapshot;
      throw error;
    }
  }

  reset(): void {
    this.transactionExecuted = false;
  }
}

describe('Payment API Complete HTTP Integration Test Suite', () => {
  let app: INestApplication;
  let paymentRepo: InMemoryIntegrationPaymentRepository;
  let saleRepo: InMemoryIntegrationSaleRepository;
  let unitOfWork: TransactionalIntegrationUnitOfWork;
  const userStore = new Map<string, User>();

  const tenantMain = 'tenant_kinergy_main';
  const tenantCompetitor = 'tenant_competitor';
  const baseTime = new Date('2026-10-15T12:00:00.000Z');
  let clock: TestClock;

  // Personas matching Phase 1 IAM Matrix
  const ownerUser = new User({
    id: 'usr_owner_pos',
    email: 'owner@kinergy.platform',
    passwordHash: 'dummy',
    status: UserStatus.ACTIVE,
    roles: ['Owner'],
    permissions: ['*'],
    tenantId: tenantMain,
    tokenVersion: 1,
  });

  const managerUser = new User({
    id: 'usr_manager_pos',
    email: 'manager@kinergy.platform',
    passwordHash: 'dummy',
    status: UserStatus.ACTIVE,
    roles: ['Manager'],
    permissions: ['payments.manage', 'payments.create', 'payments.read'],
    tenantId: tenantMain,
    tokenVersion: 1,
  });

  const receptionistUser = new User({
    id: 'usr_recept_pos',
    email: 'receptionist@kinergy.platform',
    passwordHash: 'dummy',
    status: UserStatus.ACTIVE,
    roles: ['Receptionist'],
    permissions: ['payments.create', 'payments.read', 'payments.manage'], // Manage for settlement, not cancel
    tenantId: tenantMain,
    tokenVersion: 1,
  });

  const kitchenStaffUser = new User({
    id: 'usr_kitchen_pos',
    email: 'kitchen@kinergy.platform',
    passwordHash: 'dummy',
    status: UserStatus.ACTIVE,
    roles: ['Kitchen Staff'],
    permissions: ['payments.create'], // POS collection only
    tenantId: tenantMain,
    tokenVersion: 1,
  });

  const trainerUser = new User({
    id: 'usr_trainer_pos',
    email: 'trainer@kinergy.platform',
    passwordHash: 'dummy',
    status: UserStatus.ACTIVE,
    roles: ['Trainer'],
    permissions: ['sales.read', 'reports.read'], // No payment permissions
    tenantId: tenantMain,
    tokenVersion: 1,
  });

  const clientUser = new User({
    id: 'usr_client_pos',
    email: 'client@example.com',
    passwordHash: 'dummy',
    status: UserStatus.ACTIVE,
    roles: ['Client'],
    permissions: ['client.portal.read'],
    tenantId: tenantMain,
    tokenVersion: 1,
  });

  const competitorManagerUser = new User({
    id: 'usr_rival_manager',
    email: 'rival@competitor.com',
    passwordHash: 'dummy',
    status: UserStatus.ACTIVE,
    roles: ['Manager'],
    permissions: ['payments.manage', 'payments.create', 'payments.read'],
    tenantId: tenantCompetitor,
    tokenVersion: 1,
  });

  const createTokenForUser = (user: User): string => {
    return JwtTestFactory.createSignedToken({
      sub: user.id,
      email: user.email,
      roles: user.roles,
      permissions: user.permissions,
      tenantId: user.tenantId,
      tokenVersion: user.tokenVersion,
    });
  };

  let ownerToken: string;
  let managerToken: string;
  let receptionistToken: string;
  let kitchenToken: string;
  let trainerToken: string;
  let clientToken: string;
  let competitorToken: string;

  beforeAll(async () => {
    [
      ownerUser,
      managerUser,
      receptionistUser,
      kitchenStaffUser,
      trainerUser,
      clientUser,
      competitorManagerUser,
    ].forEach((u) => userStore.set(u.id, u));

    ownerToken = createTokenForUser(ownerUser);
    managerToken = createTokenForUser(managerUser);
    receptionistToken = createTokenForUser(receptionistUser);
    kitchenToken = createTokenForUser(kitchenStaffUser);
    trainerToken = createTokenForUser(trainerUser);
    clientToken = createTokenForUser(clientUser);
    competitorToken = createTokenForUser(competitorManagerUser);

    clock = new TestClock(baseTime);
    paymentRepo = new InMemoryIntegrationPaymentRepository();
    saleRepo = new InMemoryIntegrationSaleRepository();
    unitOfWork = new TransactionalIntegrationUnitOfWork(paymentRepo, saleRepo);

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

    const mockUserRepository: Partial<IUserRepository> = {
      findById: async (id: string) => userStore.get(id) ?? null,
      findByEmail: async (email: string) =>
        Array.from(userStore.values()).find((u) => u.email === email) ?? null,
    };

    const moduleFixture: TestingModule = await Test.createTestingModule({
      controllers: [PaymentsController],
      providers: [
        { provide: PAYMENT_REPOSITORY_TOKEN, useValue: paymentRepo },
        { provide: SALE_REPOSITORY_TOKEN, useValue: saleRepo },
        { provide: UNIT_OF_WORK_TOKEN, useValue: unitOfWork },
        { provide: ACCESS_TOKEN_SERVICE, useValue: mockAccessTokenService },
        { provide: USER_REPOSITORY, useValue: mockUserRepository },
        {
          provide: PERMISSION_RESOLVER,
          useValue: {
            resolvePermissions: async (_userId: string, _roles: string[], directPerms?: string[]) =>
              directPerms ?? [],
          },
        },
        {
          provide: AUTHORIZATION_EVALUATOR,
          useClass: DefaultAuthorizationEvaluator,
        },
        AuthenticationGuard,
        AuthorizationGuard,
        {
          provide: CreatePaymentHandler,
          useFactory: () =>
            new CreatePaymentHandler(paymentRepo, saleRepo, clock, undefined, unitOfWork),
        },
        {
          provide: RecordPaymentHandler,
          useExisting: CreatePaymentHandler,
        },
        {
          provide: CompletePaymentHandler,
          useFactory: () =>
            new CompletePaymentHandler(paymentRepo, saleRepo, clock, undefined, unitOfWork),
        },
        {
          provide: FailPaymentHandler,
          useFactory: () => new FailPaymentHandler(paymentRepo, saleRepo, clock),
        },
        {
          provide: CancelPaymentHandler,
          useFactory: () => new CancelPaymentHandler(paymentRepo, saleRepo, clock),
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
          provide: ListPaymentsHandler,
          useFactory: () => new ListPaymentsHandler(paymentRepo),
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
    clock = new TestClock(new Date(baseTime.getTime()));
    paymentRepo.clear();
    saleRepo.clear();
    unitOfWork.reset();
  });

  const seedPayableSale = (saleId = 'sale_int_001', amount = 100.0, tenant = tenantMain): Sale => {
    const sale = Sale.create(
      {
        id: SaleId.create(saleId),
        currency: 'USD',
        tenantId: tenant,
        source: SaleSource.create(SaleSourceType.FOOD, 'snack-01'),
      },
      clock,
    );
    sale.addItem({
      source: SaleSource.create(SaleSourceType.FOOD, 'snack-01'),
      description: 'Protein Shake Large',
      quantity: 1,
      unitPrice: Money.create(amount, 'USD'),
    });
    sale.finalize(clock);
    saleRepo.store.set(sale.id.value, saleRepo.cloneSale(sale));
    return sale;
  };

  const seedPendingPayment = (paymentId = 'pay_int_001', sale: Sale, amount = 100.0): Payment => {
    const payment = Payment.createPending(
      {
        id: PaymentId.create(paymentId),
        saleId: sale.id,
        tenantId: sale.tenantId,
        method: PaymentMethod.CASH,
        amount: Money.create(amount, sale.currency),
      },
      clock,
    );
    paymentRepo.store.set(payment.id.value, paymentRepo.clonePayment(payment));
    return payment;
  };

  // =========================================================================
  // ROUTE 1: POST /api/v1/sales/:saleId/payments (Create Payment for a Sale)
  // =========================================================================
  describe('ROUTE 1: POST /api/v1/sales/:saleId/payments (Create Payment)', () => {
    it('rejects unauthenticated request with 401 Unauthorized', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/sales/sale_int_001/payments')
        .send({ method: 'CASH', amount: 50.0 });

      expect(res.status).toBe(401);
      expect(paymentRepo.saveCount).toBe(0);
    });

    it('rejects caller missing payments.create (e.g. Trainer or Client) with 403 Forbidden', async () => {
      seedPayableSale('sale_int_001', 100.0);

      const resTrainer = await request(app.getHttpServer())
        .post('/api/v1/sales/sale_int_001/payments')
        .set('Authorization', `Bearer ${trainerToken}`)
        .send({ method: 'CASH', amount: 50.0 });

      expect(resTrainer.status).toBe(403);

      const resClient = await request(app.getHttpServer())
        .post('/api/v1/sales/sale_int_001/payments')
        .set('Authorization', `Bearer ${clientToken}`)
        .send({ method: 'CASH', amount: 50.0 });

      expect(resClient.status).toBe(403);
      expect(paymentRepo.saveCount).toBe(0);
    });

    it('rejects invalid DTO input (amount <= 0 or missing method) with 400 Bad Request', async () => {
      seedPayableSale('sale_int_001', 100.0);

      const resNegative = await request(app.getHttpServer())
        .post('/api/v1/sales/sale_int_001/payments')
        .set('Authorization', `Bearer ${receptionistToken}`)
        .send({ method: 'CASH', amount: -10.0 });

      expect(resNegative.status).toBe(400);

      const resMissingMethod = await request(app.getHttpServer())
        .post('/api/v1/sales/sale_int_001/payments')
        .set('Authorization', `Bearer ${receptionistToken}`)
        .send({ amount: 50.0 });

      expect(resMissingMethod.status).toBe(400);
      expect(paymentRepo.saveCount).toBe(0);
    });

    it('returns 404 Not Found when target Sale does not exist or belongs to another tenant', async () => {
      // Missing sale
      const res404 = await request(app.getHttpServer())
        .post('/api/v1/sales/sale_ghost_999/payments')
        .set('Authorization', `Bearer ${receptionistToken}`)
        .send({ method: 'CASH', amount: 50.0 });

      expect(res404.status).toBe(404);

      // Cross-tenant probe (forbidden boundary violation)
      seedPayableSale('sale_competitor_001', 100.0, tenantCompetitor);
      const resCrossTenant = await request(app.getHttpServer())
        .post('/api/v1/sales/sale_competitor_001/payments')
        .set('Authorization', `Bearer ${receptionistToken}`)
        .send({ method: 'CASH', amount: 50.0 });

      expect(resCrossTenant.status).toBe(403);

      // Foreign competitor manager attempting target tenant sale
      seedPayableSale('sale_int_001', 100.0, tenantMain);
      const resForeignAttempt = await request(app.getHttpServer())
        .post('/api/v1/sales/sale_int_001/payments')
        .set('Authorization', `Bearer ${competitorToken}`)
        .send({ method: 'CASH', amount: 50.0 });

      expect(resForeignAttempt.status).toBe(403);
      expect(paymentRepo.saveCount).toBe(0);
    });

    it('rejects overpayment exceeding remaining balance with 422 Unprocessable Entity', async () => {
      seedPayableSale('sale_int_001', 100.0);

      const res = await request(app.getHttpServer())
        .post('/api/v1/sales/sale_int_001/payments')
        .set('Authorization', `Bearer ${receptionistToken}`)
        .send({ method: 'CASH', amount: 150.0 });

      expect(res.status).toBe(422);
      expect(paymentRepo.saveCount).toBe(0);
    });

    it('rejects duplicate payment reference for the same Sale with 409 Conflict', async () => {
      seedPayableSale('sale_int_001', 100.0);

      const firstRes = await request(app.getHttpServer())
        .post('/api/v1/sales/sale_int_001/payments')
        .set('Authorization', `Bearer ${receptionistToken}`)
        .send({ method: 'CASH', amount: 30.0, reference: 'REF-IDEM-001' });

      expect(firstRes.status).toBe(201);

      const dupRes = await request(app.getHttpServer())
        .post('/api/v1/sales/sale_int_001/payments')
        .set('Authorization', `Bearer ${receptionistToken}`)
        .send({ method: 'CASH', amount: 30.0, reference: 'REF-IDEM-001' });

      expect(dupRes.status).toBe(409);
      expect(paymentRepo.store.size).toBe(1);
    });

    it('successfully records cash payment and advances Sale status to PAID (201 Created)', async () => {
      const sale = seedPayableSale('sale_int_001', 100.0);

      const res = await request(app.getHttpServer())
        .post('/api/v1/sales/sale_int_001/payments')
        .set('Authorization', `Bearer ${kitchenToken}`)
        .send({ method: 'CASH', amount: 100.0, reference: 'CASH-REC-100' });

      expect(res.status).toBe(201);
      expect(res.body.status).toBe(PaymentStatus.COMPLETED);
      expect(res.body.amount.formatted).toBe('100.00');
      expect(res.body.reference).toBe('CASH-REC-100');

      // Assert database persistence
      const savedSale = await saleRepo.findById(sale.id);
      expect(savedSale?.status).toBe(SaleStatus.PAID);
    });

    it('successfully initiates PENDING electronic payment leaving Sale in PENDING_PAYMENT (201 Created)', async () => {
      const sale = seedPayableSale('sale_int_002', 100.0);

      const res = await request(app.getHttpServer())
        .post('/api/v1/sales/sale_int_002/payments')
        .set('Authorization', `Bearer ${receptionistToken}`)
        .send({ method: 'QR', amount: 100.0, status: 'PENDING', reference: 'QR-TRACE-1' });

      expect(res.status).toBe(201);
      expect(res.body.status).toBe(PaymentStatus.PENDING);
      expect(res.body.paidAt).toBeNull();

      const savedSale = await saleRepo.findById(sale.id);
      expect(savedSale?.status).toBe(SaleStatus.PENDING_PAYMENT);
    });
  });

  // =========================================================================
  // ROUTE 2: GET /api/v1/sales/:saleId/payments (List Payments for a Sale)
  // =========================================================================
  describe('ROUTE 2: GET /api/v1/sales/:saleId/payments (List Payments for Sale)', () => {
    it('rejects unauthenticated request with 401 Unauthorized', async () => {
      const res = await request(app.getHttpServer()).get('/api/v1/sales/sale_int_001/payments');
      expect(res.status).toBe(401);
    });

    it('rejects Kitchen Staff (lacks payments.read) with 403 Forbidden', async () => {
      seedPayableSale('sale_int_001', 100.0);

      const res = await request(app.getHttpServer())
        .get('/api/v1/sales/sale_int_001/payments')
        .set('Authorization', `Bearer ${kitchenToken}`);

      expect(res.status).toBe(403);
    });

    it('returns 403 Forbidden for cross-tenant sale history request', async () => {
      seedPayableSale('sale_rival_001', 100.0, tenantCompetitor);

      const res = await request(app.getHttpServer())
        .get('/api/v1/sales/sale_rival_001/payments')
        .set('Authorization', `Bearer ${receptionistToken}`);

      expect(res.status).toBe(403);
    });

    it('returns chronological payments array with exact monetary serialization (200 OK)', async () => {
      const sale = seedPayableSale('sale_int_001', 100.0);
      seedPendingPayment('pay_1', sale, 40.0);
      seedPendingPayment('pay_2', sale, 60.0);

      const res = await request(app.getHttpServer())
        .get('/api/v1/sales/sale_int_001/payments')
        .set('Authorization', `Bearer ${receptionistToken}`);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body).toHaveLength(2);
      expect(res.body[0].saleId).toBe('sale_int_001');
      expect(res.body[0].amount.formatted).toBe('40.00');
      expect(res.body[1].amount.formatted).toBe('60.00');
    });
  });

  // =========================================================================
  // ROUTE 3: GET /api/v1/payments/:id (Retrieve Payment by Identifier)
  // =========================================================================
  describe('ROUTE 3: GET /api/v1/payments/:id (Retrieve Payment)', () => {
    it('rejects unauthenticated request with 401 Unauthorized', async () => {
      const res = await request(app.getHttpServer()).get('/api/v1/payments/pay_int_001');
      expect(res.status).toBe(401);
    });

    it('returns 404 Not Found for non-existent payment identifier', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/payments/pay_ghost_999')
        .set('Authorization', `Bearer ${receptionistToken}`);

      expect(res.status).toBe(404);
    });

    it('returns 403 Forbidden for cross-tenant payment identifier retrieval', async () => {
      const rivalSale = seedPayableSale('sale_rival_payment', 100.0, tenantCompetitor);
      const rivalPayment = seedPendingPayment('pay_rival_001', rivalSale, 100.0);

      const res = await request(app.getHttpServer())
        .get(`/api/v1/payments/${rivalPayment.id.value}`)
        .set('Authorization', `Bearer ${receptionistToken}`);

      expect(res.status).toBe(403);
    });

    it('returns detailed payment schema for authorized caller (200 OK)', async () => {
      const sale = seedPayableSale('sale_int_001', 100.0);
      const payment = seedPendingPayment('pay_int_001', sale, 100.0);

      const res = await request(app.getHttpServer())
        .get(`/api/v1/payments/${payment.id.value}`)
        .set('Authorization', `Bearer ${receptionistToken}`);

      expect(res.status).toBe(200);
      expect(res.body.id).toBe('pay_int_001');
      expect(res.body.saleId).toBe('sale_int_001');
      expect(res.body.status).toBe(PaymentStatus.PENDING);
      expect(res.body.amount.cents).toBe(10000);
      expect(res.body.amount.currency).toBe('USD');
    });
  });

  // =========================================================================
  // ROUTE 4: POST /api/v1/payments/:id/complete (Complete Payment)
  // =========================================================================
  describe('ROUTE 4: POST /api/v1/payments/:id/complete (Complete Payment)', () => {
    it('rejects unauthenticated caller with 401 Unauthorized', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/payments/pay_int_001/complete')
        .send({});

      expect(res.status).toBe(401);
    });

    it('rejects caller missing payments.manage (e.g. Kitchen Staff) with 403 Forbidden', async () => {
      const sale = seedPayableSale('sale_int_001', 100.0);
      const payment = seedPendingPayment('pay_int_001', sale, 100.0);

      const res = await request(app.getHttpServer())
        .post(`/api/v1/payments/${payment.id.value}/complete`)
        .set('Authorization', `Bearer ${kitchenToken}`)
        .send({});

      expect(res.status).toBe(403);
    });

    it('successfully completes PENDING payment and transitions Sale to PAID (200 OK)', async () => {
      const sale = seedPayableSale('sale_int_001', 100.0);
      const payment = seedPendingPayment('pay_int_001', sale, 100.0);

      const res = await request(app.getHttpServer())
        .post(`/api/v1/payments/${payment.id.value}/complete`)
        .set('Authorization', `Bearer ${managerToken}`)
        .send({ reference: 'TRACE-SETTLE-OK' });

      expect(res.status).toBe(200);
      expect(res.body.status).toBe(PaymentStatus.COMPLETED);
      expect(res.body.reference).toBe('TRACE-SETTLE-OK');
      expect(res.body.paidAt).toBeDefined();

      const savedPayment = await paymentRepo.findById(payment.id);
      expect(savedPayment?.status).toBe(PaymentStatus.COMPLETED);

      const savedSale = await saleRepo.findById(sale.id);
      expect(savedSale?.status).toBe(SaleStatus.PAID);
      expect(unitOfWork.transactionExecuted).toBe(true);
    });

    it('rejects completing already COMPLETED payment with 422 Unprocessable Entity', async () => {
      const sale = seedPayableSale('sale_int_001', 100.0);
      const payment = seedPendingPayment('pay_int_001', sale, 100.0);

      // First completion
      await request(app.getHttpServer())
        .post(`/api/v1/payments/${payment.id.value}/complete`)
        .set('Authorization', `Bearer ${managerToken}`)
        .send({});

      // Repeated completion
      const repeatRes = await request(app.getHttpServer())
        .post(`/api/v1/payments/${payment.id.value}/complete`)
        .set('Authorization', `Bearer ${managerToken}`)
        .send({});

      expect(repeatRes.status).toBe(422);
    });

    it('rolls back Payment changes if atomic persistence encounters database failure', async () => {
      const sale = seedPayableSale('sale_int_001', 100.0);
      const payment = seedPendingPayment('pay_int_001', sale, 100.0);

      // Fault injection on Sale persistence
      saleRepo.shouldFailSave = true;

      const res = await request(app.getHttpServer())
        .post(`/api/v1/payments/${payment.id.value}/complete`)
        .set('Authorization', `Bearer ${managerToken}`)
        .send({});

      expect(res.status).toBe(500);

      // Atomic consistency check: Payment remains PENDING in repository
      const reloadedPayment = await paymentRepo.findById(payment.id);
      expect(reloadedPayment?.status).toBe(PaymentStatus.PENDING);
      expect(reloadedPayment?.paidAt).toBeNull();
    });
  });

  // =========================================================================
  // ROUTE 5: POST /api/v1/payments/:id/fail (Fail Payment)
  // =========================================================================
  describe('ROUTE 5: POST /api/v1/payments/:id/fail (Fail Payment)', () => {
    it('rejects unauthenticated caller with 401 Unauthorized', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/payments/pay_int_001/fail')
        .send({});
      expect(res.status).toBe(401);
    });

    it('marks PENDING payment as FAILED without mutating parent Sale (200 OK)', async () => {
      const sale = seedPayableSale('sale_int_001', 100.0);
      const payment = seedPendingPayment('pay_int_001', sale, 100.0);

      const res = await request(app.getHttpServer())
        .post(`/api/v1/payments/${payment.id.value}/fail`)
        .set('Authorization', `Bearer ${receptionistToken}`)
        .send({ reason: 'Bank card declined by gateway' });

      expect(res.status).toBe(200);
      expect(res.body.status).toBe(PaymentStatus.FAILED);
      expect(res.body.paidAt).toBeNull();

      const savedPayment = await paymentRepo.findById(payment.id);
      expect(savedPayment?.status).toBe(PaymentStatus.FAILED);

      // Sale remains unmutated in PENDING_PAYMENT
      const savedSale = await saleRepo.findById(sale.id);
      expect(savedSale?.status).toBe(SaleStatus.PENDING_PAYMENT);
    });

    it('rejects failing an already COMPLETED payment with 422 Unprocessable Entity', async () => {
      const sale = seedPayableSale('sale_int_001', 100.0);
      const payment = seedPendingPayment('pay_int_001', sale, 100.0);

      // Settle first
      payment.complete({ clock });
      await paymentRepo.save(payment);

      const res = await request(app.getHttpServer())
        .post(`/api/v1/payments/${payment.id.value}/fail`)
        .set('Authorization', `Bearer ${receptionistToken}`)
        .send({ reason: 'Attempting to fail settled payment' });

      expect(res.status).toBe(422);

      const current = await paymentRepo.findById(payment.id);
      expect(current?.status).toBe(PaymentStatus.COMPLETED);
    });
  });

  // =========================================================================
  // ROUTE 6: POST /api/v1/payments/:id/cancel (Cancel Payment)
  // =========================================================================
  describe('ROUTE 6: POST /api/v1/payments/:id/cancel (Cancel Payment)', () => {
    it('rejects unauthenticated caller with 401 Unauthorized', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/payments/pay_int_001/cancel')
        .send({});
      expect(res.status).toBe(401);
    });

    it('strictly denies Receptionist (requires elevated Owner/Manager role) with 403 Forbidden', async () => {
      const sale = seedPayableSale('sale_int_001', 100.0);
      const payment = seedPendingPayment('pay_int_001', sale, 100.0);

      const res = await request(app.getHttpServer())
        .post(`/api/v1/payments/${payment.id.value}/cancel`)
        .set('Authorization', `Bearer ${receptionistToken}`)
        .send({ reason: 'Customer changed mind' });

      expect(res.status).toBe(403);
    });

    it('authorizes Manager to cancel PENDING payment (200 OK)', async () => {
      const sale = seedPayableSale('sale_int_001', 100.0);
      const payment = seedPendingPayment('pay_int_001', sale, 100.0);

      const res = await request(app.getHttpServer())
        .post(`/api/v1/payments/${payment.id.value}/cancel`)
        .set('Authorization', `Bearer ${managerToken}`)
        .send({ reason: 'Counter order voided' });

      expect(res.status).toBe(200);
      expect(res.body.status).toBe(PaymentStatus.CANCELLED);

      const savedPayment = await paymentRepo.findById(payment.id);
      expect(savedPayment?.status).toBe(PaymentStatus.CANCELLED);

      // Sale remains intact in PENDING_PAYMENT
      const savedSale = await saleRepo.findById(sale.id);
      expect(savedSale?.status).toBe(SaleStatus.PENDING_PAYMENT);
    });

    it('rejects cancelling a settled COMPLETED payment with 422 Unprocessable Entity', async () => {
      const sale = seedPayableSale('sale_int_001', 100.0);
      const payment = seedPendingPayment('pay_int_001', sale, 100.0);

      // Settle first
      payment.complete({ clock });
      await paymentRepo.save(payment);

      const res = await request(app.getHttpServer())
        .post(`/api/v1/payments/${payment.id.value}/cancel`)
        .set('Authorization', `Bearer ${managerToken}`)
        .send({ reason: 'Attempting to void settled payment' });

      expect(res.status).toBe(422);

      const current = await paymentRepo.findById(payment.id);
      expect(current?.status).toBe(PaymentStatus.COMPLETED);
    });
  });

  // =========================================================================
  // STATE MACHINE & TRANSITION MATRIX VERIFICATION
  // =========================================================================
  describe('Payment Lifecycle State Machine Transition Matrix', () => {
    it.each([
      ['COMPLETED', 'complete', 422],
      ['COMPLETED', 'fail', 422],
      ['COMPLETED', 'cancel', 422],
      ['FAILED', 'complete', 422],
      ['FAILED', 'fail', 422],
      ['FAILED', 'cancel', 422],
      ['CANCELLED', 'complete', 422],
      ['CANCELLED', 'fail', 422],
      ['CANCELLED', 'cancel', 422],
    ] as const)(
      'rejects transition from terminal state %s via %s with HTTP %d',
      async (initialStatus, operation, expectedStatus) => {
        const sale = seedPayableSale(`sale_${initialStatus}_${operation}`, 100.0);
        const payment = seedPendingPayment(`pay_${initialStatus}_${operation}`, sale, 100.0);

        if (initialStatus === 'COMPLETED') {
          payment.complete({ clock });
        } else if (initialStatus === 'FAILED') {
          payment.fail('init fail', clock);
        } else if (initialStatus === 'CANCELLED') {
          payment.cancel('init cancel', clock);
        }
        await paymentRepo.save(payment);

        const res = await request(app.getHttpServer())
          .post(`/api/v1/payments/${payment.id.value}/${operation}`)
          .set('Authorization', `Bearer ${ownerToken}`)
          .send({});

        expect(res.status).toBe(expectedStatus);

        // State remains pristine
        const unchanged = await paymentRepo.findById(payment.id);
        expect(unchanged?.status).toBe(initialStatus);
      },
    );
  });
});
