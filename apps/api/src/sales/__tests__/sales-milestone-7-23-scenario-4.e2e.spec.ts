import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import * as jwt from 'jsonwebtoken';
import {
  Sale,
  SaleId,
  SaleSource,
  SaleSourceType,
  Money,
  Payment,
  PaymentId,
  PaymentMethod,
  PaymentStatus,
  SaleStatus,
  PaymentRepositoryPort,
  SaleRepositoryPort,
  SaleSourceValidatorPort,
  CreateSaleHandler,
  GetSaleByIdHandler,
  AddSaleItemHandler,
  FinalizeSaleHandler,
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
  PaymentOverpaymentException,
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
// In-Memory Repositories with Transactional Rollback Support
// ============================================================================

class InMemoryIntegrationSaleRepository implements SaleRepositoryPort {
  public store = new Map<string, Sale>();

  async findById(id: SaleId | string): Promise<Sale | null> {
    const key = typeof id === 'string' ? id.trim() : id.value;
    const sale = this.store.get(key);
    return sale ? this.clone(sale) : null;
  }

  async save(sale: Sale): Promise<void> {
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
    const key = typeof id === 'string' ? id.trim() : id.value;
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

/**
 * Transactional Unit of Work that emulates ACID isolation & rollback:
 * If an exception is thrown inside executeInTransaction, state changes staged during the transaction
 * are cleanly discarded, leaving persistence completely untouched.
 */
class TransactionalUnitOfWork implements IUnitOfWork {
  constructor(
    private readonly saleRepo: InMemoryIntegrationSaleRepository,
    private readonly paymentRepo: InMemoryIntegrationPaymentRepository,
  ) {}

  async executeInTransaction<T>(work: () => Promise<T>): Promise<T> {
    // Snapshot state before work
    const saleSnapshot = new Map(this.saleRepo.store);
    const paymentSnapshot = new Map(this.paymentRepo.store);

    try {
      return await work();
    } catch (err) {
      // Rollback on failure: restore snapshot
      this.saleRepo.store = saleSnapshot;
      this.paymentRepo.store = paymentSnapshot;
      throw err;
    }
  }
}

// ============================================================================
// Scenario 4 Test Suite: Overpayment Rejection & Strict Zero-Mutation Invariant
// ============================================================================

describe('Milestone 7.23 - Scenario 4: Payments Integrity & Overpayment Protection', () => {
  let app: INestApplication;
  let saleRepo: InMemoryIntegrationSaleRepository;
  let paymentRepo: InMemoryIntegrationPaymentRepository;
  let unitOfWork: TransactionalUnitOfWork;

  const TENANT_ID = 'tenant_kinergy_main';
  const CASHIER_USER_ID = 'usr_cashier_s4';
  const UNAUTHORIZED_USER_ID = 'usr_unauthorized_s4';

  let cashierToken: string;
  let unauthorizedToken: string;

  beforeAll(async () => {
    saleRepo = new InMemoryIntegrationSaleRepository();
    paymentRepo = new InMemoryIntegrationPaymentRepository();
    unitOfWork = new TransactionalUnitOfWork(saleRepo, paymentRepo);

    const cashierUser = new User({
      id: CASHIER_USER_ID,
      email: 'cashier@kinergy.platform',
      passwordHash: 'dummy_hash',
      status: UserStatus.ACTIVE,
      roles: ['Receptionist'],
      permissions: [
        'sales.create',
        'sales.read',
        'payments.create',
        'payments.read',
        'payments.manage',
      ],
      tenantId: TENANT_ID,
      tokenVersion: 1,
    });

    const unauthorizedUser = new User({
      id: UNAUTHORIZED_USER_ID,
      email: 'guest@kinergy.platform',
      passwordHash: 'dummy_hash',
      status: UserStatus.ACTIVE,
      roles: ['Guest'],
      permissions: ['sales.read'],
      tenantId: TENANT_ID,
      tokenVersion: 1,
    });

    const userStore = new Map<string, User>();
    userStore.set(cashierUser.id, cashierUser);
    userStore.set(unauthorizedUser.id, unauthorizedUser);

    const mockUserRepository: Partial<IUserRepository> = {
      findById: async (id: string) => userStore.get(id) ?? null,
      findByEmail: async (email: string) =>
        Array.from(userStore.values()).find((u) => u.email === email) ?? null,
    };

    const mockAccessTokenService: IAccessTokenService = {
      generateToken: async (identity: {
        userId: string;
        email: string;
        roles: string[];
        permissions: string[];
        tenantId?: string;
      }) =>
        JwtTestFactory.createSignedToken({
          sub: identity.userId,
          email: identity.email,
          roles: identity.roles,
          permissions: identity.permissions,
          tenantId: identity.tenantId ?? TENANT_ID,
        }),
      validateToken: async (token: string) => {
        try {
          return jwt.verify(token, DEFAULT_TEST_JWT_SECRET) as unknown as IAccessTokenPayload;
        } catch {
          return null;
        }
      },
    };

    cashierToken = JwtTestFactory.createSignedToken({
      sub: cashierUser.id,
      email: cashierUser.email,
      roles: cashierUser.roles,
      permissions: cashierUser.permissions,
      tenantId: cashierUser.tenantId ?? TENANT_ID,
    });

    unauthorizedToken = JwtTestFactory.createSignedToken({
      sub: unauthorizedUser.id,
      email: unauthorizedUser.email,
      roles: unauthorizedUser.roles,
      permissions: unauthorizedUser.permissions,
      tenantId: unauthorizedUser.tenantId ?? TENANT_ID,
    });

    const auditPublisher = new SalesAuditEventPublisher();

    const alwaysEligibleValidator: SaleSourceValidatorPort = {
      validateSource: jest.fn().mockResolvedValue({
        exists: true,
        isValid: true,
        isEligible: true,
        belongsToContext: true,
        sourceType: 'FOOD' as SaleSourceType,
        sourceId: 'item_standard_100',
      }),
    };

    const moduleFixture: TestingModule = await Test.createTestingModule({
      controllers: [SalesController, PaymentsController],
      providers: [
        { provide: SALE_REPOSITORY_TOKEN, useValue: saleRepo },
        { provide: PAYMENT_REPOSITORY_TOKEN, useValue: paymentRepo },
        { provide: UNIT_OF_WORK_TOKEN, useValue: unitOfWork },
        { provide: SALE_SOURCE_VALIDATOR_TOKEN, useValue: alwaysEligibleValidator },
        { provide: ACCESS_TOKEN_SERVICE, useValue: mockAccessTokenService },
        { provide: USER_REPOSITORY, useValue: mockUserRepository },
        { provide: SalesAuditEventPublisher, useValue: auditPublisher },
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
          useFactory: () =>
            new CreateSaleHandler(saleRepo, undefined, auditPublisher, alwaysEligibleValidator),
        },
        {
          provide: GetSaleByIdHandler,
          useFactory: () => new GetSaleByIdHandler(saleRepo),
        },
        {
          provide: AddSaleItemHandler,
          useFactory: () => new AddSaleItemHandler(saleRepo),
        },
        {
          provide: FinalizeSaleHandler,
          useFactory: () => new FinalizeSaleHandler(saleRepo, undefined, auditPublisher),
        },
        {
          provide: CalculateSaleHandler,
          useFactory: () => new CalculateSaleHandler(saleRepo),
        },
        {
          provide: RecordPaymentHandler,
          useFactory: () =>
            new RecordPaymentHandler(paymentRepo, saleRepo, undefined, auditPublisher, unitOfWork),
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
              unitOfWork,
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
      ],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new GlobalSanitizationValidationPipe());
    app.useGlobalFilters(new SalesExceptionFilter());
    await app.init();
  });

  afterAll(async () => {
    if (app) await app.close();
  });

  beforeEach(() => {
    saleRepo.store.clear();
    paymentRepo.store.clear();
  });

  // Helper to create and finalize a valid Sale with a designated total
  async function seedFinalizedSale(params: {
    id: string;
    subtotalCents: number;
    currency?: string;
    clientId?: string;
  }): Promise<Sale> {
    const currency = params.currency ?? 'USD';
    const source = SaleSource.create(SaleSourceType.FOOD, `item_${params.id}`);
    const sale = Sale.create(
      {
        id: SaleId.create(params.id),
        tenantId: TENANT_ID,
        clientId: params.clientId ?? 'client_scenario_4',
        currency,
        sourceReference: source,
        items: [
          {
            source,
            description: 'Standard Assessment / Consumable Item',
            unitPrice: Money.fromCents(params.subtotalCents, currency),
            quantity: 1,
          },
        ],
      },
      undefined,
    );

    // Finalize to transition from DRAFT to PENDING_PAYMENT
    sale.finalize();
    await saleRepo.save(sale);
    return sale;
  }

  // ==========================================================================
  // Primary Scenario 4: Overpayment Rejection & Strict Zero-Mutation Proof
  // ==========================================================================

  it('[S4-E2E-1] Exactly verifies Scenario 4: Sale total 100.00, attempted payment 120.00 is rejected with zero persisted mutation', async () => {
    // ------------------------------------------------------------------------
    // Step 1: Create a valid Sale with total 100.00 USD (10,000 integer cents)
    // ------------------------------------------------------------------------
    const saleId = 'sale_s4_primary_001';
    await seedFinalizedSale({
      id: saleId,
      subtotalCents: 10000, // 100.00 USD
      currency: 'USD',
    });

    // ------------------------------------------------------------------------
    // Step 2: Capture Sale's persisted financial state before attempted payment
    // ------------------------------------------------------------------------
    const preSale = await saleRepo.findById(saleId);
    expect(preSale).not.toBeNull();
    const prePayments = await paymentRepo.findBySaleId(saleId);

    // Strict baseline assertions:
    expect(preSale!.status).toBe(SaleStatus.PENDING_PAYMENT);
    expect(preSale!.total.cents).toBe(10000);
    expect(preSale!.subtotal.cents).toBe(10000);
    expect(preSale!.discountTotal.cents).toBe(0);
    expect(preSale!.currency).toBe('USD');
    expect(preSale!.items).toHaveLength(1);
    expect(preSale!.items[0]?.total.cents).toBe(10000);
    expect(prePayments).toHaveLength(0);
    expect(paymentRepo.store.size).toBe(0);

    // ------------------------------------------------------------------------
    // Step 3: Execute API workflow attempting an overpayment of 120.00 USD
    // ------------------------------------------------------------------------
    const overpaymentResponse = await request(app.getHttpServer())
      .post(`/api/v1/sales/${saleId}/payments`)
      .set('Authorization', `Bearer ${cashierToken}`)
      .send({
        method: 'CASH',
        amount: 120.0,
        status: 'COMPLETED',
        reference: 'CASH-TENDER-OVERPAY-120',
      });

    // ------------------------------------------------------------------------
    // Step 4: Assert HTTP rejection using established API error semantics
    // In accordance with ADR-0134, ADR-0138, and SalesExceptionFilter:
    // Overpayment is mapped to 422 Unprocessable Entity with code PAYMENT_OVERPAYMENT
    // ------------------------------------------------------------------------
    expect(overpaymentResponse.status).toBe(422);
    expect(overpaymentResponse.body.statusCode).toBe(422);
    expect(overpaymentResponse.body.error).toBe('Unprocessable Entity');
    expect(overpaymentResponse.body.code).toBe('PAYMENT_OVERPAYMENT');
    expect(overpaymentResponse.body.message).toContain(
      'Payment amount 120.00 USD exceeds the remaining sale balance of 100.00 USD',
    );

    // ------------------------------------------------------------------------
    // Step 5: Reload Sale and all associated Payments from persistence
    // ------------------------------------------------------------------------
    const postSale = await saleRepo.findById(saleId);
    const postPayments = await paymentRepo.findBySaleId(saleId);

    // ------------------------------------------------------------------------
    // Step 6: Compare before-and-after state to prove ZERO mutation occurred
    // ------------------------------------------------------------------------
    expect(postSale).not.toBeNull();
    // Invariant: Status remained unchanged (PENDING_PAYMENT, NOT PAID, NOT PARTIALLY_PAID)
    expect(postSale!.status).toBe(SaleStatus.PENDING_PAYMENT);
    expect(postSale!.status).toBe(preSale!.status);

    // Invariant: Financial values remained exactly identical
    expect(postSale!.total.cents).toBe(10000); // Exactly 100.00
    expect(postSale!.total.cents).toBe(preSale!.total.cents);

    expect(postSale!.subtotal.cents).toBe(10000);
    expect(postSale!.subtotal.cents).toBe(preSale!.subtotal.cents);

    expect(postSale!.discountTotal.cents).toBe(0);
    expect(postSale!.discountTotal.cents).toBe(preSale!.discountTotal.cents);

    // Invariant: Line items intact
    expect(postSale!.items).toHaveLength(1);
    expect(postSale!.items[0]?.description).toBe(preSale!.items[0]?.description);
    expect(postSale!.items[0]?.unitPrice.cents).toBe(10000);
    expect(postSale!.items[0]?.total.cents).toBe(10000);

    // Invariant: Zero payments recorded or persisted
    expect(postPayments).toHaveLength(0);
    expect(paymentRepo.store.size).toBe(0);

    // ------------------------------------------------------------------------
    // Step 7: Verify external API representation via read endpoints
    // ------------------------------------------------------------------------
    const getSaleResponse = await request(app.getHttpServer())
      .get(`/api/v1/sales/${saleId}`)
      .set('Authorization', `Bearer ${cashierToken}`);

    expect(getSaleResponse.status).toBe(200);
    expect(getSaleResponse.body.id).toBe(saleId);
    expect(getSaleResponse.body.status).toBe('PENDING_PAYMENT');
    expect(getSaleResponse.body.totalAmount).toBe(100.0);
    expect(getSaleResponse.body.total.cents).toBe(10000);

    const getPaymentsResponse = await request(app.getHttpServer())
      .get(`/api/v1/sales/${saleId}/payments`)
      .set('Authorization', `Bearer ${cashierToken}`);

    expect(getPaymentsResponse.status).toBe(200);
    expect(Array.isArray(getPaymentsResponse.body)).toBe(true);
    expect(getPaymentsResponse.body).toHaveLength(0);
  });

  // ==========================================================================
  // Multi-Payment Boundaries: Partial Payment Followed by Overpayment
  // ==========================================================================

  it('[S4-E2E-2] Partial payment succeeds ($40.00), subsequent overpayment ($70.00 on $60.00 balance) is rejected and leaves partial state clean', async () => {
    const saleId = 'sale_s4_partial_002';
    await seedFinalizedSale({
      id: saleId,
      subtotalCents: 10000, // 100.00 USD
    });

    // Step 1: Valid partial payment of 40.00 USD
    const part1Response = await request(app.getHttpServer())
      .post(`/api/v1/sales/${saleId}/payments`)
      .set('Authorization', `Bearer ${cashierToken}`)
      .send({
        method: 'CASH',
        amount: 40.0,
        status: 'COMPLETED',
        reference: 'PARTIAL-CASH-40',
      });

    expect(part1Response.status).toBe(201);
    expect(part1Response.body.status).toBe('COMPLETED');
    expect(part1Response.body.amountValue).toBe(40.0);

    // Verify Sale transitioned to PARTIALLY_PAID with remaining balance of 60.00 USD
    const saleAfterPart1 = await saleRepo.findById(saleId);
    expect(saleAfterPart1!.status).toBe(SaleStatus.PARTIALLY_PAID);
    const paymentsAfterPart1 = await paymentRepo.findBySaleId(saleId);
    expect(paymentsAfterPart1).toHaveLength(1);

    // Step 2: Attempt second payment of 70.00 USD (exceeds remaining balance of 60.00 USD)
    const overpayPart2Response = await request(app.getHttpServer())
      .post(`/api/v1/sales/${saleId}/payments`)
      .set('Authorization', `Bearer ${cashierToken}`)
      .send({
        method: 'CASH',
        amount: 70.0,
        status: 'COMPLETED',
        reference: 'ILLEGAL-OVERPAY-70',
      });

    expect(overpayPart2Response.status).toBe(422);
    expect(overpayPart2Response.body.code).toBe('PAYMENT_OVERPAYMENT');
    expect(overpayPart2Response.body.message).toContain(
      'Payment amount 70.00 USD exceeds the remaining sale balance of 60.00 USD',
    );

    // Step 3: Assert persisted state remains exactly at the post-part1 state
    const saleAfterRejection = await saleRepo.findById(saleId);
    expect(saleAfterRejection!.status).toBe(SaleStatus.PARTIALLY_PAID);
    expect(saleAfterRejection!.total.cents).toBe(10000);

    const paymentsAfterRejection = await paymentRepo.findBySaleId(saleId);
    expect(paymentsAfterRejection).toHaveLength(1); // Still exactly 1 payment
    expect(paymentsAfterRejection[0]?.amount.cents).toBe(4000);
    expect(paymentsAfterRejection[0]?.reference?.value).toBe('PARTIAL-CASH-40');
  });

  // ==========================================================================
  // Fractional Cent Overpayment Boundary ($100.01 on $100.00)
  // ==========================================================================

  it('[S4-E2E-3] Fractional 1-cent overpayment ($100.01 against $100.00 total) is strictly rejected', async () => {
    const saleId = 'sale_s4_cent_boundary_003';
    await seedFinalizedSale({
      id: saleId,
      subtotalCents: 10000, // 100.00 USD
    });

    const boundaryResponse = await request(app.getHttpServer())
      .post(`/api/v1/sales/${saleId}/payments`)
      .set('Authorization', `Bearer ${cashierToken}`)
      .send({
        method: 'CASH',
        amount: 100.01,
        status: 'COMPLETED',
      });

    expect(boundaryResponse.status).toBe(422);
    expect(boundaryResponse.body.code).toBe('PAYMENT_OVERPAYMENT');
    expect(boundaryResponse.body.message).toContain(
      'Payment amount 100.01 USD exceeds the remaining sale balance of 100.00 USD',
    );

    // Verify 0 payments persisted
    const payments = await paymentRepo.findBySaleId(saleId);
    expect(payments).toHaveLength(0);
  });

  // ==========================================================================
  // Fully Settled Sale Overpayment Guard ($0.01 on PAID Sale)
  // ==========================================================================

  it('[S4-E2E-4] Fully settled Sale ($100.00 PAID) rejects any subsequent payment attempts ($0.01)', async () => {
    const saleId = 'sale_s4_paid_004';
    await seedFinalizedSale({
      id: saleId,
      subtotalCents: 10000,
    });

    // Settle full 100.00 USD
    const settleResponse = await request(app.getHttpServer())
      .post(`/api/v1/sales/${saleId}/payments`)
      .set('Authorization', `Bearer ${cashierToken}`)
      .send({
        method: 'CASH',
        amount: 100.0,
        status: 'COMPLETED',
      });
    expect(settleResponse.status).toBe(201);

    const reloadedSale = await saleRepo.findById(saleId);
    expect(reloadedSale!.status).toBe(SaleStatus.PAID);

    // Attempting even 0.01 USD against PAID sale is rejected as SaleNotPayable
    const subsequentResponse = await request(app.getHttpServer())
      .post(`/api/v1/sales/${saleId}/payments`)
      .set('Authorization', `Bearer ${cashierToken}`)
      .send({
        method: 'CASH',
        amount: 0.01,
        status: 'COMPLETED',
      });

    expect(subsequentResponse.status).toBe(422);
    expect(subsequentResponse.body.message).toContain('cannot accept payments');

    // Persistence contains only the initial payment
    const payments = await paymentRepo.findBySaleId(saleId);
    expect(payments).toHaveLength(1);
    expect(payments[0]?.amount.cents).toBe(10000);
  });

  // ==========================================================================
  // Completion Workflow Overpayment Protection (CompletePaymentHandler)
  // ==========================================================================

  it('[S4-E2E-5] CompletePaymentHandler re-evaluates remaining balance and rejects completing a payment that would overpay', async () => {
    const saleId = 'sale_s4_complete_handler_005';
    await seedFinalizedSale({
      id: saleId,
      subtotalCents: 10000, // 100.00 USD
    });

    // Create a PENDING payment of 70.00 USD
    const pay1 = Payment.createPending(
      {
        id: PaymentId.create('pay_s4_pending_1'),
        saleId: SaleId.create(saleId),
        tenantId: TENANT_ID,
        method: PaymentMethod.CASH,
        amount: Money.fromCents(7000, 'USD'),
      },
      undefined,
    );
    await paymentRepo.save(pay1);

    // Create a second PENDING payment of 50.00 USD (together 120.00 > 100.00)
    const pay2 = Payment.createPending(
      {
        id: PaymentId.create('pay_s4_pending_2'),
        saleId: SaleId.create(saleId),
        tenantId: TENANT_ID,
        method: PaymentMethod.CASH,
        amount: Money.fromCents(5000, 'USD'),
      },
      undefined,
    );
    await paymentRepo.save(pay2);

    // Complete pay1 (70.00 USD)
    const completeHandler = new CompletePaymentHandler(
      paymentRepo,
      saleRepo,
      undefined,
      undefined,
      unitOfWork,
    );

    const completePay1Result = await completeHandler.execute({
      input: {
        paymentId: 'pay_s4_pending_1',
        saleId,
        tenantId: TENANT_ID,
        currentUser: {
          id: CASHIER_USER_ID,
          userId: CASHIER_USER_ID,
          roles: ['Receptionist'],
          permissions: ['payments.create', 'payments.manage'],
        },
      },
    });
    expect(completePay1Result.isSuccess).toBe(true);

    // Now remaining balance is 30.00 USD.
    // Attempting to complete pay2 (50.00 USD > 30.00 USD remaining balance) MUST fail with PaymentOverpaymentException
    const completePay2Result = await completeHandler.execute({
      input: {
        paymentId: 'pay_s4_pending_2',
        saleId,
        tenantId: TENANT_ID,
        currentUser: {
          id: CASHIER_USER_ID,
          userId: CASHIER_USER_ID,
          roles: ['Receptionist'],
          permissions: ['payments.create', 'payments.manage'],
        },
      },
    });

    expect(completePay2Result.isFailure).toBe(true);
    expect(completePay2Result.getError()).toBeInstanceOf(PaymentOverpaymentException);
    expect((completePay2Result.getError() as Error).message).toContain(
      'exceeds the remaining sale balance of 30.00 USD',
    );

    // Assert pay2 remains PENDING in persistence, never COMPLETED
    const postPay2 = await paymentRepo.findById('pay_s4_pending_2');
    expect(postPay2!.status).toBe(PaymentStatus.PENDING);

    // Assert Sale remains PARTIALLY_PAID, NOT PAID
    const postSale = await saleRepo.findById(saleId);
    expect(postSale!.status).toBe(SaleStatus.PARTIALLY_PAID);
  });

  // ==========================================================================
  // Concurrent Multi-Party Race Condition Safety
  // ==========================================================================

  it('[S4-E2E-6] Concurrent competing payments ($70.00 + $60.00 against $100.00 total) allow exactly one to settle, cleanly rejecting the other without balance corruption', async () => {
    const saleId = 'sale_s4_race_006';
    await seedFinalizedSale({
      id: saleId,
      subtotalCents: 10000, // 100.00 USD
    });

    // Execute two concurrent payment requests attempting to over-commit the total debt (70 + 60 = 130 > 100)
    const [resA, resB] = await Promise.all([
      request(app.getHttpServer())
        .post(`/api/v1/sales/${saleId}/payments`)
        .set('Authorization', `Bearer ${cashierToken}`)
        .send({
          method: 'CASH',
          amount: 70.0,
          status: 'COMPLETED',
          reference: 'CONCURRENT-A-70',
        }),
      request(app.getHttpServer())
        .post(`/api/v1/sales/${saleId}/payments`)
        .set('Authorization', `Bearer ${cashierToken}`)
        .send({
          method: 'CASH',
          amount: 60.0,
          status: 'COMPLETED',
          reference: 'CONCURRENT-B-60',
        }),
    ]);

    // Exactly one must succeed (201) and one must be rejected (422)
    const statuses = [resA.status, resB.status].sort();
    expect(statuses).toEqual([201, 422]);

    const failedRes = resA.status === 422 ? resA : resB;
    expect(failedRes.body.code).toBe('PAYMENT_OVERPAYMENT');

    // Persistence inspection: exactly 1 payment recorded, matching the successful response
    const persistedPayments = await paymentRepo.findBySaleId(saleId);
    expect(persistedPayments).toHaveLength(1);
    expect(persistedPayments[0]?.status).toBe(PaymentStatus.COMPLETED);

    // Persisted Sale is PARTIALLY_PAID, total is intact (100.00), paidAmount matches the successful payment
    const persistedSale = await saleRepo.findById(saleId);
    expect(persistedSale!.status).toBe(SaleStatus.PARTIALLY_PAID);
    expect(persistedSale!.total.cents).toBe(10000);
    const winningAmountCents =
      persistedPayments[0]?.reference?.value === 'CONCURRENT-A-70' ? 7000 : 6000;
    expect(persistedPayments[0]?.amount.cents).toBe(winningAmountCents);
  });

  // ==========================================================================
  // Pre-Finalization Invariant Guard (DRAFT Sale)
  // ==========================================================================

  it('[S4-E2E-7] Attempting payment on a DRAFT Sale (before finalization) is strictly rejected with 422', async () => {
    const saleId = 'sale_s4_draft_007';
    const source = SaleSource.create(SaleSourceType.FOOD, `item_${saleId}`);
    const sale = Sale.create(
      {
        id: SaleId.create(saleId),
        tenantId: TENANT_ID,
        currency: 'USD',
        sourceReference: source,
        items: [
          {
            source,
            description: 'Draft item',
            unitPrice: Money.fromCents(10000, 'USD'),
            quantity: 1,
          },
        ],
      },
      undefined,
    );
    await saleRepo.save(sale);

    const draftPayResponse = await request(app.getHttpServer())
      .post(`/api/v1/sales/${saleId}/payments`)
      .set('Authorization', `Bearer ${cashierToken}`)
      .send({
        method: 'CASH',
        amount: 100.0,
        status: 'COMPLETED',
      });

    expect(draftPayResponse.status).toBe(422);
    expect(draftPayResponse.body.message).toContain('cannot accept payments');

    // Zero payments recorded
    const payments = await paymentRepo.findBySaleId(saleId);
    expect(payments).toHaveLength(0);
  });

  // ==========================================================================
  // Security & Authorization Invariant Guards
  // ==========================================================================

  it('[S4-E2E-8] Enforces authentication, authorization, and tenant isolation on payment recording', async () => {
    const saleId = 'sale_s4_security_008';
    await seedFinalizedSale({
      id: saleId,
      subtotalCents: 10000,
    });

    // 1. Unauthenticated -> 401
    const unauthRes = await request(app.getHttpServer())
      .post(`/api/v1/sales/${saleId}/payments`)
      .send({ method: 'CASH', amount: 50.0 });
    expect(unauthRes.status).toBe(401);

    // 2. Caller lacks 'payments.create' permission -> 403
    const forbiddenRes = await request(app.getHttpServer())
      .post(`/api/v1/sales/${saleId}/payments`)
      .set('Authorization', `Bearer ${unauthorizedToken}`)
      .send({ method: 'CASH', amount: 50.0 });
    expect(forbiddenRes.status).toBe(403);

    // 3. Target Sale does not exist -> 404
    const notFoundRes = await request(app.getHttpServer())
      .post('/api/v1/sales/non_existent_sale_uuid/payments')
      .set('Authorization', `Bearer ${cashierToken}`)
      .send({ method: 'CASH', amount: 50.0 });
    expect(notFoundRes.status).toBe(404);

    // Verify persistence remained completely untouched
    const payments = await paymentRepo.findBySaleId(saleId);
    expect(payments).toHaveLength(0);
  });
});
