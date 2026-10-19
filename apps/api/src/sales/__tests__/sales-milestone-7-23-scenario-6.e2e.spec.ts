import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import * as jwt from 'jsonwebtoken';
import {
  Sale,
  SaleId,
  Payment,
  PaymentId,
  PaymentStatus,
  SaleStatus,
  PaymentRepositoryPort,
  SaleRepositoryPort,
  SaleSourceValidatorPort,
  CreateSaleHandler,
  GetSaleByIdHandler,
  AddSaleItemHandler,
  FinalizeSaleHandler,
  CancelSaleHandler,
  CalculateSaleHandler,
  RecordPaymentHandler,
  CreatePaymentHandler,
  CompletePaymentHandler,
  GetPaymentByIdHandler,
  GetPaymentsBySaleIdHandler,
  GetSalePaymentHistoryHandler,
  FindSalesCriteria,
  FindSalesPagination,
  FindSalesSort,
  FindSalesResult,
  SaleMapper,
  IUnitOfWork,
} from '@kinergy-platform/core';

import { SalesController, SALE_REPOSITORY_TOKEN } from '../controllers/sales.controller';
import { PaymentsController, PAYMENT_REPOSITORY_TOKEN } from '../controllers/payments.controller';
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
import { SalesAuditEventPublisher } from '../infrastructure/sales-audit-event-publisher';

// ============================================================================
// Deterministic Synchronization Barrier for Concurrency Testing (ADR-0140)
// ============================================================================

export class DeterministicSynchronizationBarrier {
  private waiters: Array<() => void> = [];

  constructor(private readonly partiesCount: number) {}

  public async arriveAndWait(): Promise<void> {
    if (this.partiesCount <= 1) return;
    return new Promise<void>((resolve) => {
      this.waiters.push(resolve);
      if (this.waiters.length >= this.partiesCount) {
        const waiting = [...this.waiters];
        this.waiters = [];
        for (const w of waiting) {
          w();
        }
      }
    });
  }
}

// ============================================================================
// In-Memory Persistence Test Double with Optimistic Concurrency Control
// ============================================================================

class InMemoryIntegrationSaleRepository implements SaleRepositoryPort {
  public store = new Map<string, Sale>();
  public saveBarrier: DeterministicSynchronizationBarrier | null = null;

  async findById(id: SaleId | string): Promise<Sale | null> {
    if (!id) return null;
    const key = typeof id === 'string' ? id.trim() : id?.value;
    if (!key) return null;
    const sale = this.store.get(key);
    return sale ? this.clone(sale) : null;
  }

  async save(sale: Sale): Promise<void> {
    if (this.saveBarrier) {
      await this.saveBarrier.arriveAndWait();
    }

    const current = this.store.get(sale.id.value);
    if (current && current.version >= sale.version && current.status !== sale.status) {
      // Emulate OCC conflict if database version has advanced ahead
      const err = new Error(
        `Optimistic lock failure on Sale ${sale.id.value}: current version ${current.version} >= target version ${sale.version}`,
      );
      (err as unknown as { code: string }).code = 'P2034';
      throw err;
    }

    this.store.set(sale.id.value, this.clone(sale));
  }

  async findBySourceReference(
    sourceType: string,
    sourceId: string,
    tenantId?: string,
  ): Promise<Sale | null> {
    for (const s of this.store.values()) {
      if (s.source.sourceType === sourceType && s.source.sourceId === sourceId) {
        if (tenantId && s.tenantId !== tenantId) continue;
        return this.clone(s);
      }
    }
    return null;
  }

  async findByTenantId(tenantId: string): Promise<Sale[]> {
    const list: Sale[] = [];
    for (const s of this.store.values()) {
      if (s.tenantId === tenantId) list.push(this.clone(s));
    }
    return list;
  }

  async count(_criteria: unknown, tenantId?: string): Promise<number> {
    let count = 0;
    for (const s of this.store.values()) {
      if (tenantId && s.tenantId !== tenantId) continue;
      count++;
    }
    return count;
  }

  async findMany(
    criteria: FindSalesCriteria,
    _pagination: FindSalesPagination,
    _sort: FindSalesSort,
  ): Promise<FindSalesResult> {
    const sales = await this.findByTenantId(criteria.tenantId ?? '');
    return { items: sales.map((s) => SaleMapper.toSummaryDTO(s)), total: sales.length };
  }

  private clone(sale: Sale): Sale {
    return Object.assign(Object.create(Object.getPrototypeOf(sale)), sale);
  }
}

class InMemoryIntegrationPaymentRepository implements PaymentRepositoryPort {
  public store = new Map<string, Payment>();

  async findById(id: PaymentId | string): Promise<Payment | null> {
    if (!id) return null;
    const key = typeof id === 'string' ? id.trim() : id?.value;
    if (!key) return null;
    const payment = this.store.get(key);
    return payment ? this.clone(payment) : null;
  }

  async findBySaleId(saleId: SaleId | string): Promise<Payment[]> {
    const key = typeof saleId === 'string' ? saleId.trim() : saleId.value;
    const result: Payment[] = [];
    for (const p of this.store.values()) {
      if (p.saleId.value === key) {
        result.push(this.clone(p));
      }
    }
    return result;
  }

  async save(payment: Payment): Promise<void> {
    this.store.set(payment.id.value, this.clone(payment));
  }

  async findByTenantId(tenantId: string): Promise<Payment[]> {
    const result: Payment[] = [];
    for (const p of this.store.values()) {
      if (p.tenantId === tenantId) {
        result.push(this.clone(p));
      }
    }
    return result;
  }

  private clone(payment: Payment): Payment {
    return Object.assign(Object.create(Object.getPrototypeOf(payment)), payment);
  }
}

class TransactionalUnitOfWork implements IUnitOfWork {
  constructor(
    public readonly saleRepo?: InMemoryIntegrationSaleRepository,
    public readonly paymentRepo?: InMemoryIntegrationPaymentRepository,
  ) {}

  async executeInTransaction<T>(work: () => Promise<T>): Promise<T> {
    return await work();
  }
}

// ============================================================================
// Scenario 6 Test Suite: Sale Cancellation & Audit Lifecycle Integrity
// ============================================================================

describe('Milestone 7.23 - Scenario 6: Sale Cancellation, Auditability & Financial Lifecycle Integrity', () => {
  let app: INestApplication;
  let saleRepo: InMemoryIntegrationSaleRepository;
  let paymentRepo: InMemoryIntegrationPaymentRepository;
  let unitOfWork: TransactionalUnitOfWork;

  const TENANT_ALPHA = 'tenant_chile_s6_alpha';
  const TENANT_BETA = 'tenant_chile_s6_beta';

  let cashierTokenAlpha: string;
  let managerTokenAlpha: string;
  let trainerTokenAlpha: string;
  let managerTokenBeta: string;

  beforeAll(async () => {
    saleRepo = new InMemoryIntegrationSaleRepository();
    paymentRepo = new InMemoryIntegrationPaymentRepository();
    unitOfWork = new TransactionalUnitOfWork(saleRepo, paymentRepo);

    const mockAccessTokenService: IAccessTokenService = {
      generateToken: async (identity) =>
        JwtTestFactory.createSignedToken({
          sub: identity.userId,
          email: identity.email,
          roles: identity.roles,
          permissions: identity.permissions,
          tenantId: identity.tenantId ?? TENANT_ALPHA,
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
      findById: jest.fn(async (id: string) => {
        if (id === 'usr_cashier_alpha') {
          return {
            id: 'usr_cashier_alpha',
            email: 'cashier@alpha.cl',
            status: UserStatus.ACTIVE,
            tenantId: TENANT_ALPHA,
            roles: ['Receptionist'],
            permissions: [
              'sales.create',
              'sales.read',
              'sales.cancel',
              'payments.create',
              'payments.read',
            ],
            tokenVersion: 1,
          } as unknown as User;
        }
        if (id === 'usr_manager_alpha') {
          return {
            id: 'usr_manager_alpha',
            email: 'manager@alpha.cl',
            status: UserStatus.ACTIVE,
            tenantId: TENANT_ALPHA,
            roles: ['Manager'],
            permissions: [
              'sales.create',
              'sales.read',
              'sales.cancel',
              'payments.create',
              'payments.read',
              'payments.complete',
            ],
            tokenVersion: 1,
          } as unknown as User;
        }
        if (id === 'usr_trainer_alpha') {
          return {
            id: 'usr_trainer_alpha',
            email: 'trainer@alpha.cl',
            status: UserStatus.ACTIVE,
            tenantId: TENANT_ALPHA,
            roles: ['Trainer'],
            permissions: ['sales.read'], // Lacks sales.cancel and sales.create
            tokenVersion: 1,
          } as unknown as User;
        }
        if (id === 'usr_manager_beta') {
          return {
            id: 'usr_manager_beta',
            email: 'manager@beta.cl',
            status: UserStatus.ACTIVE,
            tenantId: TENANT_BETA,
            roles: ['Manager'],
            permissions: ['sales.create', 'sales.read', 'sales.cancel'],
            tokenVersion: 1,
          } as unknown as User;
        }
        return null;
      }),
      findByEmail: jest.fn(),
      save: jest.fn(),
    };

    const mockSaleSourceValidator: SaleSourceValidatorPort = {
      validateSource: jest.fn(async () => ({
        isValid: true,
        exists: true,
        actualContext: 'Kinesiology',
        belongsToContext: true,
      })),
    };

    const moduleFixture: TestingModule = await Test.createTestingModule({
      controllers: [SalesController, PaymentsController],
      providers: [
        { provide: SALE_REPOSITORY_TOKEN, useValue: saleRepo },
        { provide: PAYMENT_REPOSITORY_TOKEN, useValue: paymentRepo },
        { provide: UNIT_OF_WORK_TOKEN, useValue: unitOfWork },
        { provide: SALE_SOURCE_VALIDATOR_TOKEN, useValue: mockSaleSourceValidator },
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
        {
          provide: SalesAuditEventPublisher,
          useValue: { publish: jest.fn() },
        },
        AuthenticationGuard,
        AuthorizationGuard,
        {
          provide: CreateSaleHandler,
          useFactory: (repo: SaleRepositoryPort, validator: SaleSourceValidatorPort) =>
            new CreateSaleHandler(repo, undefined, undefined, validator),
          inject: [SALE_REPOSITORY_TOKEN, SALE_SOURCE_VALIDATOR_TOKEN],
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
          useFactory: (repo: SaleRepositoryPort, audit: SalesAuditEventPublisher) =>
            new FinalizeSaleHandler(repo, undefined, audit),
          inject: [SALE_REPOSITORY_TOKEN, SalesAuditEventPublisher],
        },
        {
          provide: CancelSaleHandler,
          useFactory: (
            repo: SaleRepositoryPort,
            audit: SalesAuditEventPublisher,
            paymentR: PaymentRepositoryPort,
            uow: IUnitOfWork,
          ) => new CancelSaleHandler(repo, undefined, audit, paymentR, uow),
          inject: [
            SALE_REPOSITORY_TOKEN,
            SalesAuditEventPublisher,
            PAYMENT_REPOSITORY_TOKEN,
            UNIT_OF_WORK_TOKEN,
          ],
        },
        {
          provide: CalculateSaleHandler,
          useFactory: (repo: SaleRepositoryPort) => new CalculateSaleHandler(repo),
          inject: [SALE_REPOSITORY_TOKEN],
        },
        {
          provide: CreatePaymentHandler,
          useFactory: (
            paymentR: PaymentRepositoryPort,
            saleR: SaleRepositoryPort,
            audit: SalesAuditEventPublisher,
            uow: IUnitOfWork,
          ) => new CreatePaymentHandler(paymentR, saleR, undefined, audit, uow),
          inject: [
            PAYMENT_REPOSITORY_TOKEN,
            SALE_REPOSITORY_TOKEN,
            SalesAuditEventPublisher,
            UNIT_OF_WORK_TOKEN,
          ],
        },
        {
          provide: RecordPaymentHandler,
          useFactory: (
            paymentR: PaymentRepositoryPort,
            saleR: SaleRepositoryPort,
            audit: SalesAuditEventPublisher,
            uow: IUnitOfWork,
          ) => new RecordPaymentHandler(paymentR, saleR, undefined, audit, uow),
          inject: [
            PAYMENT_REPOSITORY_TOKEN,
            SALE_REPOSITORY_TOKEN,
            SalesAuditEventPublisher,
            UNIT_OF_WORK_TOKEN,
          ],
        },
        {
          provide: CompletePaymentHandler,
          useFactory: (
            paymentR: PaymentRepositoryPort,
            saleR: SaleRepositoryPort,
            audit: SalesAuditEventPublisher,
            uow: IUnitOfWork,
          ) => new CompletePaymentHandler(paymentR, saleR, undefined, audit, uow),
          inject: [
            PAYMENT_REPOSITORY_TOKEN,
            SALE_REPOSITORY_TOKEN,
            SalesAuditEventPublisher,
            UNIT_OF_WORK_TOKEN,
          ],
        },
        {
          provide: GetPaymentByIdHandler,
          useFactory: (paymentR: PaymentRepositoryPort) => new GetPaymentByIdHandler(paymentR),
          inject: [PAYMENT_REPOSITORY_TOKEN],
        },
        {
          provide: GetPaymentsBySaleIdHandler,
          useFactory: (paymentR: PaymentRepositoryPort) => new GetPaymentsBySaleIdHandler(paymentR),
          inject: [PAYMENT_REPOSITORY_TOKEN],
        },
        {
          provide: GetSalePaymentHistoryHandler,
          useFactory: (saleR: SaleRepositoryPort, paymentR: PaymentRepositoryPort) =>
            new GetSalePaymentHistoryHandler(paymentR, saleR),
          inject: [SALE_REPOSITORY_TOKEN, PAYMENT_REPOSITORY_TOKEN],
        },
      ],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new GlobalSanitizationValidationPipe());
    app.useGlobalFilters(new SalesExceptionFilter());
    await app.init();

    cashierTokenAlpha = JwtTestFactory.createSignedToken({
      sub: 'usr_cashier_alpha',
      email: 'cashier@alpha.cl',
      roles: ['Receptionist'],
      permissions: [
        'sales.create',
        'sales.read',
        'sales.cancel',
        'payments.create',
        'payments.read',
      ],
      tenantId: TENANT_ALPHA,
    });

    managerTokenAlpha = JwtTestFactory.createSignedToken({
      sub: 'usr_manager_alpha',
      email: 'manager@alpha.cl',
      roles: ['Manager'],
      permissions: [
        'sales.create',
        'sales.read',
        'sales.cancel',
        'payments.create',
        'payments.read',
        'payments.complete',
      ],
      tenantId: TENANT_ALPHA,
    });

    trainerTokenAlpha = JwtTestFactory.createSignedToken({
      sub: 'usr_trainer_alpha',
      email: 'trainer@alpha.cl',
      roles: ['Trainer'],
      permissions: ['sales.read'],
      tenantId: TENANT_ALPHA,
    });

    managerTokenBeta = JwtTestFactory.createSignedToken({
      sub: 'usr_manager_beta',
      email: 'manager@beta.cl',
      roles: ['Manager'],
      permissions: ['sales.create', 'sales.read', 'sales.cancel'],
      tenantId: TENANT_BETA,
    });
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    saleRepo.store.clear();
    paymentRepo.store.clear();
    saleRepo.saveBarrier = null;
  });

  // ==========================================================================
  // 1. DRAFT Sale Cancellation & Non-Destructive Preservation
  // ==========================================================================

  it('[S6-E2E-1] Cancelling a DRAFT Sale changes lifecycle status to CANCELLED without physically deleting the Sale or its line items', async () => {
    // 1. Create a representative Sale with line items (Total: 100.00 USD)
    const createRes = await request(app.getHttpServer())
      .post('/api/v1/sales')
      .set('Authorization', `Bearer ${cashierTokenAlpha}`)
      .send({
        currency: 'USD',
        clientId: 'client_pt_rehab_01',
        sourceReference: {
          type: 'KINESIOLOGY_SESSION',
          referenceId: 'kine_sess_s6_draft_01',
        },
        items: [
          {
            description: 'Kinesiology Therapeutic Treatment',
            skuOrCode: 'KINE-THERAPY-01',
            quantity: 1,
            unitPriceAmount: 100.0,
          },
        ],
      });

    expect(createRes.status).toBe(201);
    const saleId = createRes.body.id;

    // 2. Capture the persisted state before cancellation
    const preCancelSale = await saleRepo.findById(saleId);
    expect(preCancelSale).not.toBeNull();
    expect(preCancelSale?.status).toBe(SaleStatus.DRAFT);
    expect(preCancelSale?.version).toBe(1);
    expect(preCancelSale?.cancelledAt).toBeUndefined();
    expect(preCancelSale?.cancellationReason).toBeUndefined();
    expect(preCancelSale?.items).toHaveLength(1);
    expect(preCancelSale?.total.amount).toBe(100.0);
    expect(preCancelSale?.subtotal.amount).toBe(100.0);
    expect(preCancelSale?.discountTotal.amount).toBe(0.0);

    // 3. Invoke supported cancellation workflow through API boundary
    const cancelRes = await request(app.getHttpServer())
      .post(`/api/v1/sales/${saleId}/cancel`)
      .set('Authorization', `Bearer ${cashierTokenAlpha}`)
      .send({
        reason: 'Patient requested appointment cancellation prior to service start',
      });

    // 4. Verify authoritative cancellation response reflects persisted state
    expect(cancelRes.status).toBe(200);
    expect(cancelRes.body.id).toBe(saleId);
    expect(cancelRes.body.status).toBe('CANCELLED');
    expect(cancelRes.body.cancellationReason).toBe(
      'Patient requested appointment cancellation prior to service start',
    );
    expect(cancelRes.body.cancelledAt).toBeDefined();
    expect(cancelRes.body.version).toBe(2);

    // 5. Reload the Sale from persistence to prove non-destructive preservation
    const postCancelSale = await saleRepo.findById(saleId);
    expect(postCancelSale).not.toBeNull();
    expect(postCancelSale?.id.value).toBe(saleId);
    expect(postCancelSale?.status).toBe(SaleStatus.CANCELLED);
    expect(postCancelSale?.version).toBe(2);
    expect(postCancelSale?.cancellationReason).toBe(
      'Patient requested appointment cancellation prior to service start',
    );
    expect(postCancelSale?.cancelledAt).toBeInstanceOf(Date);

    // Physical preservation proof: Sale and its items are NOT deleted
    expect(saleRepo.store.has(saleId)).toBe(true);
    const postCancelItems = postCancelSale?.items ?? [];
    expect(postCancelItems).toHaveLength(1);
    const firstItem = postCancelItems[0]!;
    expect(firstItem.description).toBe('Kinesiology Therapeutic Treatment');
    expect(firstItem.unitPrice.amount).toBe(100.0);
    expect(firstItem.quantity).toBe(1);
    expect(firstItem.total.amount).toBe(100.0);

    // Financial integrity proof: totals remain immutable and consistent
    expect(postCancelSale?.subtotal.amount).toBe(100.0);
    expect(postCancelSale?.discountTotal.amount).toBe(0.0);
    expect(postCancelSale?.total.amount).toBe(100.0);
    expect(postCancelSale?.currency).toBe('USD');

    // 6. Queryable via supported GET endpoint with identical financial history
    const getRes = await request(app.getHttpServer())
      .get(`/api/v1/sales/${saleId}`)
      .set('Authorization', `Bearer ${cashierTokenAlpha}`);

    expect(getRes.status).toBe(200);
    expect(getRes.body.status).toBe('CANCELLED');
    expect(getRes.body.totalAmount).toBe(100.0);
    expect(getRes.body.subtotalAmount).toBe(100.0);
    expect(getRes.body.items).toHaveLength(1);
    expect(getRes.body.cancellationReason).toBe(
      'Patient requested appointment cancellation prior to service start',
    );
  });

  // ==========================================================================
  // 2. PENDING_PAYMENT Sale Cancellation & Cascaded Tender Cancellation
  // ==========================================================================

  it('[S6-E2E-2] Cancelling a PENDING_PAYMENT Sale cascades cancellation to PENDING payments without deleting payment history', async () => {
    // 1. Create and finalize Sale ($100.00)
    const createRes = await request(app.getHttpServer())
      .post('/api/v1/sales')
      .set('Authorization', `Bearer ${cashierTokenAlpha}`)
      .send({
        currency: 'USD',
        clientId: 'client_pt_rehab_02',
        sourceReference: {
          type: 'KINESIOLOGY_SESSION',
          referenceId: 'kine_sess_s6_pending_02',
        },
        items: [
          {
            description: 'Shoulder Rehabilitation Evaluation',
            skuOrCode: 'KINE-EVAL-02',
            quantity: 1,
            unitPriceAmount: 100.0,
          },
        ],
      });
    const saleId = createRes.body.id;

    await request(app.getHttpServer())
      .post(`/api/v1/sales/${saleId}/finalize`)
      .set('Authorization', `Bearer ${cashierTokenAlpha}`)
      .send();

    // 2. Create a PENDING electronic payment authorization ($100.00 QR)
    const paymentRes = await request(app.getHttpServer())
      .post(`/api/v1/sales/${saleId}/payments`)
      .set('Authorization', `Bearer ${cashierTokenAlpha}`)
      .send({
        method: 'QR',
        amount: 100.0,
        currency: 'USD',
        status: 'PENDING',
        reference: 'QR-AUTH-PENDING-9901',
      });

    expect(paymentRes.status).toBe(201);
    const paymentId = paymentRes.body.id;

    // Verify pre-cancellation persisted state
    const preSale = await saleRepo.findById(saleId);
    expect(preSale?.status).toBe(SaleStatus.PENDING_PAYMENT);
    const prePayment = await paymentRepo.findById(paymentId);
    expect(prePayment?.status).toBe(PaymentStatus.PENDING);

    // 3. Cancel the sale through API boundary
    const cancelRes = await request(app.getHttpServer())
      .post(`/api/v1/sales/${saleId}/cancel`)
      .set('Authorization', `Bearer ${cashierTokenAlpha}`)
      .send({
        reason: 'Patient card authorization expired and patient chose to abort checkout',
      });

    expect(cancelRes.status).toBe(200);
    expect(cancelRes.body.status).toBe('CANCELLED');

    // 4. Reload from persistence: Sale is CANCELLED and payment is CANCELLED (not deleted)
    const postSale = await saleRepo.findById(saleId);
    expect(postSale?.status).toBe(SaleStatus.CANCELLED);

    const postPayment = await paymentRepo.findById(paymentId);
    expect(postPayment).not.toBeNull();
    expect(postPayment?.id.value).toBe(paymentId);
    expect(postPayment?.status).toBe(PaymentStatus.CANCELLED);
    expect(postPayment?.amount.amount).toBe(100.0);
    expect(paymentRepo.store.size).toBe(1); // Payment was NOT destructively deleted

    // 5. Query payment history: cancelled payment remains present in financial audit history
    const historyRes = await request(app.getHttpServer())
      .get(`/api/v1/sales/${saleId}/payments`)
      .set('Authorization', `Bearer ${cashierTokenAlpha}`);

    expect(historyRes.status).toBe(200);
    expect(historyRes.body).toHaveLength(1);
    expect(historyRes.body[0].id).toBe(paymentId);
    expect(historyRes.body[0].status).toBe('CANCELLED');
    expect(historyRes.body[0].amount.amount).toBe(100.0);
  });

  // ==========================================================================
  // 3. PARTIALLY_PAID Sale Cancellation & Completed Payment History Preservation
  // ==========================================================================

  it('[S6-E2E-3] Cancelling a PARTIALLY_PAID Sale preserves completed payment history and marks Sale CANCELLED', async () => {
    // 1. Create and finalize Sale ($100.00 total)
    const createRes = await request(app.getHttpServer())
      .post('/api/v1/sales')
      .set('Authorization', `Bearer ${managerTokenAlpha}`)
      .send({
        currency: 'USD',
        clientId: 'client_pt_rehab_03',
        sourceReference: {
          type: 'KINESIOLOGY_SESSION',
          referenceId: 'kine_sess_s6_partial_03',
        },
        items: [
          {
            description: 'Extended Physical Rehabilitation',
            skuOrCode: 'KINE-EXT-03',
            quantity: 1,
            unitPriceAmount: 100.0,
          },
        ],
      });
    const saleId = createRes.body.id;

    await request(app.getHttpServer())
      .post(`/api/v1/sales/${saleId}/finalize`)
      .set('Authorization', `Bearer ${managerTokenAlpha}`)
      .send();

    // 2. Record a partial cash settlement ($40.00 CASH COMPLETED) -> transitions Sale to PARTIALLY_PAID
    const partialCashRes = await request(app.getHttpServer())
      .post(`/api/v1/sales/${saleId}/payments`)
      .set('Authorization', `Bearer ${managerTokenAlpha}`)
      .send({
        method: 'CASH',
        amount: 40.0,
        currency: 'USD',
        status: 'COMPLETED',
      });
    expect(partialCashRes.status).toBe(201);
    const cashPaymentId = partialCashRes.body.id;

    // Verify Sale entered PARTIALLY_PAID
    const saleAfterPartial = await saleRepo.findById(saleId);
    expect(saleAfterPartial?.status).toBe(SaleStatus.PARTIALLY_PAID);

    // 3. Attach a pending tender for the remainder ($60.00 QR PENDING)
    const pendingQrRes = await request(app.getHttpServer())
      .post(`/api/v1/sales/${saleId}/payments`)
      .set('Authorization', `Bearer ${managerTokenAlpha}`)
      .send({
        method: 'QR',
        amount: 60.0,
        currency: 'USD',
        status: 'PENDING',
        reference: 'TERM-QR-PENDING-4402',
      });
    expect(pendingQrRes.status).toBe(201);
    const qrPaymentId = pendingQrRes.body.id;

    // Verify pre-cancellation persistence snapshot: 2 payments in DB
    expect(paymentRepo.store.size).toBe(2);

    // 4. Cancel the PARTIALLY_PAID sale through API boundary
    const cancelRes = await request(app.getHttpServer())
      .post(`/api/v1/sales/${saleId}/cancel`)
      .set('Authorization', `Bearer ${managerTokenAlpha}`)
      .send({
        reason:
          'Client unable to settle remaining balance; order terminated with partial payment preserved',
      });

    expect(cancelRes.status).toBe(200);
    expect(cancelRes.body.status).toBe('CANCELLED');

    // 5. Reload persistence:
    // - Sale is CANCELLED
    // - COMPLETED cash payment ($40.00) remains COMPLETED (historical tender preserved)
    // - PENDING QR payment ($60.00) is transitioned to CANCELLED
    const postSale = await saleRepo.findById(saleId);
    expect(postSale?.status).toBe(SaleStatus.CANCELLED);

    const postCashPayment = await paymentRepo.findById(cashPaymentId);
    expect(postCashPayment?.status).toBe(PaymentStatus.COMPLETED);
    expect(postCashPayment?.amount.amount).toBe(40.0);

    const postQrPayment = await paymentRepo.findById(qrPaymentId);
    expect(postQrPayment?.status).toBe(PaymentStatus.CANCELLED);
    expect(postQrPayment?.amount.amount).toBe(60.0);

    // Zero physical deletion proof
    expect(paymentRepo.store.size).toBe(2);
    expect(postSale?.items).toHaveLength(1);

    // 6. Query payment history: both records reflect authoritative non-destructive audit history
    const historyRes = await request(app.getHttpServer())
      .get(`/api/v1/sales/${saleId}/payments`)
      .set('Authorization', `Bearer ${managerTokenAlpha}`);

    expect(historyRes.status).toBe(200);
    expect(historyRes.body).toHaveLength(2);

    const cashRecord = historyRes.body.find((p: { id: string }) => p.id === cashPaymentId);
    expect(cashRecord.status).toBe('COMPLETED');
    expect(cashRecord.amount.amount).toBe(40.0);

    const qrRecord = historyRes.body.find((p: { id: string }) => p.id === qrPaymentId);
    expect(qrRecord.status).toBe('CANCELLED');
    expect(qrRecord.amount.amount).toBe(60.0);
  });

  // ==========================================================================
  // 4. Reject Cancellation on PAID or COMPLETED Sales
  // ==========================================================================

  it('[S6-E2E-4] Reject attempts to cancel a fully PAID Sale', async () => {
    // 1. Create, finalize, and fully pay Sale ($100.00)
    const createRes = await request(app.getHttpServer())
      .post('/api/v1/sales')
      .set('Authorization', `Bearer ${managerTokenAlpha}`)
      .send({
        currency: 'USD',
        clientId: 'client_pt_rehab_04',
        sourceReference: {
          type: 'KINESIOLOGY_SESSION',
          referenceId: 'kine_sess_s6_paid_04',
        },
        items: [
          {
            description: 'Kinesiology Consultation Session',
            skuOrCode: 'KINE-CONS-04',
            quantity: 1,
            unitPriceAmount: 100.0,
          },
        ],
      });
    const saleId = createRes.body.id;

    await request(app.getHttpServer())
      .post(`/api/v1/sales/${saleId}/finalize`)
      .set('Authorization', `Bearer ${managerTokenAlpha}`)
      .send();

    await request(app.getHttpServer())
      .post(`/api/v1/sales/${saleId}/payments`)
      .set('Authorization', `Bearer ${managerTokenAlpha}`)
      .send({
        method: 'CASH',
        amount: 100.0,
        currency: 'USD',
        status: 'COMPLETED',
      });

    const preSale = await saleRepo.findById(saleId);
    expect(preSale?.status).toBe(SaleStatus.PAID);

    // 2. Attempt to cancel a PAID sale -> strictly rejected as 422 Unprocessable Entity
    const cancelRes = await request(app.getHttpServer())
      .post(`/api/v1/sales/${saleId}/cancel`)
      .set('Authorization', `Bearer ${managerTokenAlpha}`)
      .send({
        reason: 'Attempting invalid cancellation on settled sale',
      });

    expect(cancelRes.status).toBe(422);
    expect(cancelRes.body.error).toBe('Unprocessable Entity');
    expect(cancelRes.body.message).toContain("Sale in status 'PAID' cannot be cancelled");

    // 3. Reload from persistence: Sale remains PAID with zero partial writes
    const postSale = await saleRepo.findById(saleId);
    expect(postSale?.status).toBe(SaleStatus.PAID);
    expect(postSale?.cancelledAt).toBeUndefined();
    expect(postSale?.cancellationReason).toBeUndefined();
  });

  // ==========================================================================
  // 5. Reject Repeated Cancellation of an Already CANCELLED Sale
  // ==========================================================================

  it('[S6-E2E-5] Reject repeated cancellation of an already CANCELLED Sale (Irreversible Terminal State)', async () => {
    // 1. Create and cancel Sale
    const createRes = await request(app.getHttpServer())
      .post('/api/v1/sales')
      .set('Authorization', `Bearer ${cashierTokenAlpha}`)
      .send({
        currency: 'USD',
        sourceReference: {
          type: 'KINESIOLOGY_SESSION',
          referenceId: 'kine_sess_s6_repeat_05',
        },
      });
    const saleId = createRes.body.id;

    const firstCancelRes = await request(app.getHttpServer())
      .post(`/api/v1/sales/${saleId}/cancel`)
      .set('Authorization', `Bearer ${cashierTokenAlpha}`)
      .send({
        reason: 'First legitimate cancellation',
      });
    expect(firstCancelRes.status).toBe(200);

    const saleV2 = await saleRepo.findById(saleId);
    expect(saleV2?.status).toBe(SaleStatus.CANCELLED);
    expect(saleV2?.version).toBe(2);

    // 2. Second cancellation attempt must be rejected as 422 Unprocessable Entity
    const secondCancelRes = await request(app.getHttpServer())
      .post(`/api/v1/sales/${saleId}/cancel`)
      .set('Authorization', `Bearer ${cashierTokenAlpha}`)
      .send({
        reason: 'Second redundant cancellation attempt',
      });

    expect(secondCancelRes.status).toBe(422);
    expect(secondCancelRes.body.message).toContain(
      "Sale in status 'CANCELLED' cannot be cancelled",
    );

    // 3. Persisted version remains unincremented and original reason preserved
    const salePostRepeat = await saleRepo.findById(saleId);
    expect(salePostRepeat?.status).toBe(SaleStatus.CANCELLED);
    expect(salePostRepeat?.version).toBe(2);
    expect(salePostRepeat?.cancellationReason).toBe('First legitimate cancellation');
  });

  // ==========================================================================
  // 6. Prohibit Mutating a CANCELLED Sale
  // ==========================================================================

  it('[S6-E2E-6] Prohibit mutating line items, discounts, source, or state on a CANCELLED Sale', async () => {
    const createRes = await request(app.getHttpServer())
      .post('/api/v1/sales')
      .set('Authorization', `Bearer ${cashierTokenAlpha}`)
      .send({
        currency: 'USD',
        sourceReference: {
          type: 'FOOD',
          referenceId: 'snack_protein_bar_01',
        },
        items: [
          {
            description: 'Organic Protein Bar',
            skuOrCode: 'BAR-01',
            quantity: 1,
            unitPriceAmount: 25.0,
          },
        ],
      });
    const saleId = createRes.body.id;

    await request(app.getHttpServer())
      .post(`/api/v1/sales/${saleId}/cancel`)
      .set('Authorization', `Bearer ${cashierTokenAlpha}`)
      .send({
        reason: 'Item out of stock at counter',
      });

    // 1. Attempt adding an item -> 409 Conflict (assertDraftState violation)
    const addItemRes = await request(app.getHttpServer())
      .post(`/api/v1/sales/${saleId}/items`)
      .set('Authorization', `Bearer ${cashierTokenAlpha}`)
      .send({
        description: 'New Supplement Packet',
        skuOrCode: 'PACK-02',
        quantity: 1,
        unitPriceAmount: 15.0,
      });
    expect(addItemRes.status).toBe(409);
    expect(addItemRes.body.message).toContain('Cannot mutate Sale');

    // 2. Attempt applying a discount -> 409 Conflict
    const discountRes = await request(app.getHttpServer())
      .post(`/api/v1/sales/${saleId}/discount`)
      .set('Authorization', `Bearer ${cashierTokenAlpha}`)
      .send({
        type: 'PERCENTAGE',
        value: 10,
        reason: 'Staff discount',
      });
    expect(discountRes.status).toBe(409);

    // 3. Attempt finalizing the cancelled sale -> 422 Unprocessable Entity
    const finalizeRes = await request(app.getHttpServer())
      .post(`/api/v1/sales/${saleId}/finalize`)
      .set('Authorization', `Bearer ${cashierTokenAlpha}`)
      .send();
    expect(finalizeRes.status).toBe(422);

    // 4. Attempt reassigning source on cancelled sale -> 409 Conflict
    const sourceRes = await request(app.getHttpServer())
      .post(`/api/v1/sales/${saleId}/source`)
      .set('Authorization', `Bearer ${cashierTokenAlpha}`)
      .send({
        sourceReference: {
          type: 'FOOD',
          referenceId: 'snack_alternate_02',
        },
      });
    expect(sourceRes.status).toBe(409);
    expect(sourceRes.body.message).toContain('Cannot assign source on a CANCELLED sale');

    // Persistence inspection: Sale items and totals remain completely intact
    const postSale = await saleRepo.findById(saleId);
    expect(postSale?.items).toHaveLength(1);
    expect(postSale?.total.amount).toBe(25.0);
  });

  // ==========================================================================
  // 7. Prohibit Attaching or Settling Payments Against a CANCELLED Sale
  // ==========================================================================

  it('[S6-E2E-7] Prohibit attaching or settling payments against a CANCELLED Sale', async () => {
    const createRes = await request(app.getHttpServer())
      .post('/api/v1/sales')
      .set('Authorization', `Bearer ${cashierTokenAlpha}`)
      .send({
        currency: 'USD',
        sourceReference: {
          type: 'FOOD',
          referenceId: 'inv_recovery_shake_01',
        },
        items: [
          {
            description: 'Post-Workout Shake',
            quantity: 1,
            unitPriceAmount: 50.0,
          },
        ],
      });
    const saleId = createRes.body.id;

    await request(app.getHttpServer())
      .post(`/api/v1/sales/${saleId}/cancel`)
      .set('Authorization', `Bearer ${cashierTokenAlpha}`)
      .send({
        reason: 'Customer declined purchase',
      });

    // Attempt to record payment against cancelled sale -> 422 SaleNotPayableException
    const payRes = await request(app.getHttpServer())
      .post(`/api/v1/sales/${saleId}/payments`)
      .set('Authorization', `Bearer ${cashierTokenAlpha}`)
      .send({
        method: 'CASH',
        amount: 50.0,
        currency: 'USD',
        status: 'COMPLETED',
      });

    expect(payRes.status).toBe(422);
    expect(payRes.body.message).toContain("is in status 'CANCELLED' and cannot accept payments");
    expect(paymentRepo.store.size).toBe(0);
  });

  // ==========================================================================
  // 8. Strict IAM Authorization and Input Validation Invariants
  // ==========================================================================

  it('[S6-E2E-8] Enforces mandatory cancellation reason, RBAC permissions, and multi-tenant isolation', async () => {
    const createRes = await request(app.getHttpServer())
      .post('/api/v1/sales')
      .set('Authorization', `Bearer ${cashierTokenAlpha}`)
      .send({
        currency: 'USD',
        sourceReference: {
          type: 'KINESIOLOGY_SESSION',
          referenceId: 'kine_sess_s6_iam_08',
        },
      });
    const saleId = createRes.body.id;

    // 1. Missing or blank cancellation reason -> 400 Bad Request
    const blankReasonRes = await request(app.getHttpServer())
      .post(`/api/v1/sales/${saleId}/cancel`)
      .set('Authorization', `Bearer ${cashierTokenAlpha}`)
      .send({ reason: '   ' });
    expect(blankReasonRes.status).toBe(400);

    const emptyReasonRes = await request(app.getHttpServer())
      .post(`/api/v1/sales/${saleId}/cancel`)
      .set('Authorization', `Bearer ${cashierTokenAlpha}`)
      .send({});
    expect(emptyReasonRes.status).toBe(400);

    // 2. Caller lacking sales.cancel permission (Trainer) -> 403 Forbidden
    const forbiddenRes = await request(app.getHttpServer())
      .post(`/api/v1/sales/${saleId}/cancel`)
      .set('Authorization', `Bearer ${trainerTokenAlpha}`)
      .send({ reason: 'Trainer attempting cancellation' });
    expect(forbiddenRes.status).toBe(403);

    // 3. Cross-tenant cancellation attempt by Tenant Beta Manager -> 403 Forbidden (multi-tenant boundary)
    const crossTenantRes = await request(app.getHttpServer())
      .post(`/api/v1/sales/${saleId}/cancel`)
      .set('Authorization', `Bearer ${managerTokenBeta}`)
      .send({ reason: 'Cross-tenant probe' });
    expect(crossTenantRes.status).toBe(403);

    // Persisted state: Sale remains DRAFT in Tenant Alpha
    const sale = await saleRepo.findById(saleId);
    expect(sale?.status).toBe(SaleStatus.DRAFT);
  });

  // ==========================================================================
  // 9. Concurrency OCC Protection: Simultaneous Payment Settlement vs Cancellation Race
  // ==========================================================================

  it('[S6-E2E-9] Concurrency OCC Protection: Simultaneous payment settlement and cancellation synchronize deterministically', async () => {
    // 1. Create and finalize Sale ($100.00)
    const createRes = await request(app.getHttpServer())
      .post('/api/v1/sales')
      .set('Authorization', `Bearer ${managerTokenAlpha}`)
      .send({
        currency: 'USD',
        clientId: 'client_race_s6_01',
        sourceReference: {
          type: 'KINESIOLOGY_SESSION',
          referenceId: 'kine_sess_s6_race_09',
        },
        items: [
          {
            description: 'High-Impact Rehabilitation Session',
            skuOrCode: 'KINE-RACE-09',
            quantity: 1,
            unitPriceAmount: 100.0,
          },
        ],
      });
    const saleId = createRes.body.id;

    await request(app.getHttpServer())
      .post(`/api/v1/sales/${saleId}/finalize`)
      .set('Authorization', `Bearer ${managerTokenAlpha}`)
      .send();

    // Verify initial version is 2 (finalized from draft)
    const initialSale = await saleRepo.findById(saleId);
    expect(initialSale?.version).toBe(2);

    // 2. Arm synchronization barrier for 2 racing parties
    saleRepo.saveBarrier = new DeterministicSynchronizationBarrier(2);

    // Launch simultaneous settlement and cancellation
    const [settleRes, cancelRes] = await Promise.all([
      request(app.getHttpServer())
        .post(`/api/v1/sales/${saleId}/payments`)
        .set('Authorization', `Bearer ${managerTokenAlpha}`)
        .send({
          method: 'CASH',
          amount: 100.0,
          currency: 'USD',
          status: 'COMPLETED',
        }),
      request(app.getHttpServer())
        .post(`/api/v1/sales/${saleId}/cancel`)
        .set('Authorization', `Bearer ${managerTokenAlpha}`)
        .send({
          reason: 'Cashier racing cancellation during cash handover',
        }),
    ]);

    // Exactly one operation commits and advances the version; the other is rejected deterministically
    const statuses = [settleRes.status, cancelRes.status].sort();
    // One succeeds (200 or 201), the other encounters OCC conflict (409) or lifecycle transition failure (422)
    expect([200, 201]).toContain(statuses[0]);
    expect([409, 422]).toContain(statuses[1]);

    // Reload from persistence: aggregate reached a deterministic, valid terminal status without partial state
    const postSale = await saleRepo.findById(saleId);
    expect(['PAID', 'CANCELLED']).toContain(postSale?.status);
    expect(postSale?.version).toBeGreaterThan(initialSale!.version);
  });
});
