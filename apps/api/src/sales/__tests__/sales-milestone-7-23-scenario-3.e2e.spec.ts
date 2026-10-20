import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import * as jwt from 'jsonwebtoken';
import { Prisma } from '@prisma/client';
import {
  Sale,
  SaleId,
  SaleSource,
  SaleSourceType,
  Money,
  Discount,
  Payment,
  PaymentId,
  Receipt,
  ReceiptId,
  ReceiptNumber,
  SaleSourceValidatorPort,
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
  ApplyDiscountHandler,
  ApplyOrderDiscountHandler,
  RemoveOrderDiscountHandler,
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
import {
  InMemoryReceiptSequenceGenerator,
  PrismaSaleMapper,
  PrismaMoneyMapper,
} from '@kinergy-platform/core/server';

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
}

class InMemoryIntegrationPaymentRepository implements PaymentRepositoryPort {
  public store = new Map<string, Payment>();

  async findById(id: PaymentId | string): Promise<Payment | null> {
    const key = typeof id === 'string' ? id.trim() : id.value;
    return this.store.get(key) ?? null;
  }

  async findBySaleId(saleId: SaleId | string): Promise<Payment[]> {
    const key = typeof saleId === 'string' ? saleId.trim() : saleId.value;
    return Array.from(this.store.values()).filter((p) => p.saleId.value === key);
  }

  async save(payment: Payment): Promise<void> {
    this.store.set(payment.id.value, payment);
  }
}

class InMemoryIntegrationReceiptRepository implements ReceiptRepositoryPort {
  public store = new Map<string, Receipt>();
  private readonly sequenceGenerator = new InMemoryReceiptSequenceGenerator();

  async findById(id: ReceiptId | string): Promise<Receipt | null> {
    const key = typeof id === 'string' ? id.trim() : id.value;
    return this.store.get(key) ?? null;
  }

  async findBySaleId(saleId: SaleId | string, tenantId?: string): Promise<Receipt | null> {
    const key = typeof saleId === 'string' ? saleId.trim() : saleId.value;
    for (const r of this.store.values()) {
      if (r.saleId.value === key) {
        if (tenantId && r.tenantId !== tenantId) {
          continue;
        }
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
// Scenario 3 Test Suite: Percentage Discount & Deterministic Persistence
// ============================================================================

describe('Milestone 7.23 - Scenario 3: Percentage Discount & Monetary Persistence Invariants', () => {
  let app: INestApplication;
  let saleRepo: InMemoryIntegrationSaleRepository;
  let paymentRepo: InMemoryIntegrationPaymentRepository;
  let receiptRepo: InMemoryIntegrationReceiptRepository;

  const TENANT_ID = 'tenant_kinergy_main';
  const RECEPTIONIST_USER_ID = 'usr_receptionist_s3';

  let receptionistToken: string;

  beforeAll(async () => {
    saleRepo = new InMemoryIntegrationSaleRepository();
    paymentRepo = new InMemoryIntegrationPaymentRepository();
    receiptRepo = new InMemoryIntegrationReceiptRepository();

    const receptionistUser = new User({
      id: RECEPTIONIST_USER_ID,
      email: 'receptionist@kinergy.platform',
      passwordHash: 'dummy_hash',
      status: UserStatus.ACTIVE,
      roles: ['Receptionist'],
      permissions: [
        'sales.create',
        'sales.read',
        'payments.create',
        'payments.read',
        'payments.manage',
        'receipts.manage',
        'receipts.read',
      ],
      tenantId: TENANT_ID,
      tokenVersion: 1,
    });

    const userStore = new Map<string, User>();
    userStore.set(receptionistUser.id, receptionistUser);

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

    receptionistToken = JwtTestFactory.createSignedToken({
      sub: receptionistUser.id,
      email: receptionistUser.email,
      roles: receptionistUser.roles,
      permissions: receptionistUser.permissions,
      tenantId: receptionistUser.tenantId,
      tokenVersion: receptionistUser.tokenVersion,
    });

    const mockUnitOfWork: IUnitOfWork = {
      executeInTransaction: jest.fn(async <T>(fn: () => Promise<T>): Promise<T> => fn()),
    };

    const auditPublisher = new SalesAuditEventPublisher();

    const alwaysEligibleValidator: SaleSourceValidatorPort = {
      validateSource: jest.fn().mockResolvedValue({
        exists: true,
        isValid: true,
        isEligible: true,
        belongsToContext: true,
        sourceType: 'FOOD' as SaleSourceType,
        sourceId: 'inv_item_mock',
      }),
    };

    const moduleFixture: TestingModule = await Test.createTestingModule({
      controllers: [SalesController, PaymentsController, ReceiptsController],
      providers: [
        { provide: SALE_REPOSITORY_TOKEN, useValue: saleRepo },
        { provide: PAYMENT_REPOSITORY_TOKEN, useValue: paymentRepo },
        { provide: RECEIPT_REPOSITORY_TOKEN, useValue: receiptRepo },
        { provide: UNIT_OF_WORK_TOKEN, useValue: mockUnitOfWork },
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
          provide: ListSalesHandler,
          useFactory: () => new ListSalesHandler(saleRepo),
        },
        {
          provide: CancelSaleHandler,
          useFactory: () =>
            new CancelSaleHandler(saleRepo, undefined, auditPublisher, paymentRepo, mockUnitOfWork),
        },
        {
          provide: ApplyOrderDiscountHandler,
          useFactory: () => new ApplyOrderDiscountHandler(saleRepo),
        },
        {
          provide: ApplyDiscountHandler,
          useFactory: () => new ApplyOrderDiscountHandler(saleRepo),
        },
        {
          provide: RemoveOrderDiscountHandler,
          useFactory: () => new RemoveOrderDiscountHandler(saleRepo),
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
          useFactory: () => new GetReceiptBySaleHandler(receiptRepo),
        },
      ],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new GlobalSanitizationValidationPipe());
    app.useGlobalFilters(new SalesExceptionFilter());
    await app.init();
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  // =========================================================================
  // Requirement 1 & Acceptance Criteria: 10% Discount on 100.00 Subtotal
  // =========================================================================

  describe('[S3-E2E-1] Item-Level 10% Percentage Discount in Explicit Currency (USD)', () => {
    it('produces subtotal 100.00, discount 10.00, and net total 90.00 with integer-minor-unit precision', async () => {
      // 1. Create a Sale in USD
      const createRes = await request(app.getHttpServer())
        .post('/api/v1/sales')
        .set('Authorization', `Bearer ${receptionistToken}`)
        .send({
          currency: 'USD',
          sourceReference: {
            type: 'FOOD',
            referenceId: 'inv_wellness_tea_001',
            referenceCode: 'TEA-WELL-100',
          },
          items: [
            {
              description: 'Organic Herbal Wellness Tea Tin (100.00 USD base)',
              skuOrCode: 'TEA-WELL-100',
              quantity: 1,
              unitPriceAmount: 100.0,
              discount: {
                type: 'PERCENTAGE',
                value: 10,
                reason: '10% Wellness Member Discount',
              },
            },
          ],
        })
        .expect(201);

      const saleId = createRes.body.id;
      expect(saleId).toBeDefined();

      // 2. Validate Domain Calculation Invariants
      // Subtotal: 100.00 USD (10000 cents)
      // Discount: 10.00 USD (1000 cents)
      // Total:    90.00 USD (9000 cents)
      expect(createRes.body.subtotalAmount).toBe(100.0);
      expect(createRes.body.discountTotalAmount).toBe(10.0);
      expect(createRes.body.totalAmount).toBe(90.0);

      expect(createRes.body.subtotal).toEqual({
        amount: 100.0,
        currency: 'USD',
        formatted: '100.00',
        cents: 10000,
      });
      expect(createRes.body.discountTotal).toEqual({
        amount: 10.0,
        currency: 'USD',
        formatted: '10.00',
        cents: 1000,
      });
      expect(createRes.body.total).toEqual({
        amount: 90.0,
        currency: 'USD',
        formatted: '90.00',
        cents: 9000,
      });

      // 3. Verify Item Line Snapshot
      expect(createRes.body.items).toHaveLength(1);
      const lineItem = createRes.body.items[0];
      expect(lineItem.subtotalAmount).toBe(100.0);
      expect(lineItem.discountTotalAmount).toBe(10.0);
      expect(lineItem.totalAmount).toBe(90.0);
      expect(lineItem.discount).toEqual({
        type: 'PERCENTAGE',
        value: 10,
        reason: '10% Wellness Member Discount',
      });

      // 4. Verify Read through Supported API GET /api/v1/sales/:id
      const getRes = await request(app.getHttpServer())
        .get(`/api/v1/sales/${saleId}`)
        .set('Authorization', `Bearer ${receptionistToken}`)
        .expect(200);

      expect(getRes.body.subtotalAmount).toBe(100.0);
      expect(getRes.body.discountTotalAmount).toBe(10.0);
      expect(getRes.body.totalAmount).toBe(90.0);
      expect(getRes.body.subtotal.cents).toBe(10000);
      expect(getRes.body.discountTotal.cents).toBe(1000);
      expect(getRes.body.total.cents).toBe(9000);
    });
  });

  describe('[S3-E2E-2] Order-Level 10% Percentage Discount in Alternative Currency (EUR)', () => {
    it('proves currency independence and applies order-level discount to 100.00 EUR item', async () => {
      // 1. Create a Sale in EUR with item 100.00 EUR and no line discount
      const createRes = await request(app.getHttpServer())
        .post('/api/v1/sales')
        .set('Authorization', `Bearer ${receptionistToken}`)
        .send({
          currency: 'EUR',
          sourceReference: {
            type: 'FOOD',
            referenceId: 'inv_gym_gear_002',
            referenceCode: 'GEAR-BAG-100',
          },
          items: [
            {
              description: 'Athletic Gym Duffel Bag',
              skuOrCode: 'GEAR-BAG-100',
              quantity: 1,
              unitPriceAmount: 100.0,
            },
          ],
        })
        .expect(201);

      const saleId = createRes.body.id;
      expect(createRes.body.currency).toBe('EUR');
      expect(createRes.body.subtotalAmount).toBe(100.0);
      expect(createRes.body.discountTotalAmount).toBe(0.0);
      expect(createRes.body.totalAmount).toBe(100.0);

      // 2. Apply 10% Order-Level Discount via POST /api/v1/sales/:id/discount
      const discountRes = await request(app.getHttpServer())
        .post(`/api/v1/sales/${saleId}/discount`)
        .set('Authorization', `Bearer ${receptionistToken}`)
        .send({
          type: 'PERCENTAGE',
          value: 10,
          reason: '10% Seasonal Concession',
        })
        .expect(200);

      // Expected Totals:
      // Subtotal: 100.00 EUR (10000 cents)
      // Discount Total: 10.00 EUR (1000 cents)
      // Net Total: 90.00 EUR (9000 cents)
      expect(discountRes.body.subtotalAmount).toBe(100.0);
      expect(discountRes.body.discountTotalAmount).toBe(10.0);
      expect(discountRes.body.totalAmount).toBe(90.0);

      expect(discountRes.body.subtotal).toEqual({
        amount: 100.0,
        currency: 'EUR',
        formatted: '100.00',
        cents: 10000,
      });
      expect(discountRes.body.discountTotal).toEqual({
        amount: 10.0,
        currency: 'EUR',
        formatted: '10.00',
        cents: 1000,
      });
      expect(discountRes.body.total).toEqual({
        amount: 90.0,
        currency: 'EUR',
        formatted: '90.00',
        cents: 9000,
      });

      // 3. Confirm API Read via GET /api/v1/sales/:id
      const readRes = await request(app.getHttpServer())
        .get(`/api/v1/sales/${saleId}`)
        .set('Authorization', `Bearer ${receptionistToken}`)
        .expect(200);

      expect(readRes.body.subtotalAmount).toBe(100.0);
      expect(readRes.body.discountTotalAmount).toBe(10.0);
      expect(readRes.body.totalAmount).toBe(90.0);
      expect(readRes.body.orderDiscount).toEqual({
        type: 'PERCENTAGE',
        value: 10,
        reason: '10% Seasonal Concession',
      });
    });
  });

  // =========================================================================
  // Requirement 2, 5: PostgreSQL / Prisma Persistence Representation & Reload
  // =========================================================================

  describe('[S3-E2E-3] Persistence Stability & PostgreSQL Decimal(12, 2) Storage Round-Trip', () => {
    it('persists exact financial values to database and verifies reconstitution without rounding drift', async () => {
      // 1. Create Sale Aggregate with 10% discount on 100.00
      const sale = Sale.create({
        id: SaleId.create('sale_s3_persistence_001'),
        currency: 'USD',
        tenantId: TENANT_ID,
        source: SaleSource.create(SaleSourceType.FOOD, 'inv_tea_100'),
      });

      sale.addItem({
        source: SaleSource.create(SaleSourceType.FOOD, 'inv_tea_100'),
        description: 'Premium Matcha Pack',
        quantity: 1,
        unitPrice: Money.create(100.0, 'USD'),
        discount: Discount.percentage(10, '10% Member Concession'),
      });

      // Domain asserts
      expect(sale.subtotal.cents).toBe(10000);
      expect(sale.discountTotal.cents).toBe(1000);
      expect(sale.total.cents).toBe(9000);

      // 2. Map to Persistence Representation (Prisma Decimal 12, 2)
      const { sale: dbSale, items: dbItems } = PrismaSaleMapper.toPersistence(sale);

      // Verify PostgreSQL DB column types and exact scale
      expect(dbSale.subtotalAmount).toBeInstanceOf(Prisma.Decimal);
      expect(dbSale.subtotalAmount.toFixed(2)).toBe('100.00');

      expect(dbSale.discountTotalAmount).toBeInstanceOf(Prisma.Decimal);
      expect(dbSale.discountTotalAmount.toFixed(2)).toBe('10.00');

      expect(dbSale.totalAmount).toBeInstanceOf(Prisma.Decimal);
      expect(dbSale.totalAmount.toFixed(2)).toBe('90.00');

      expect(dbSale.currency).toBe('USD');

      // Verify line item persistence record
      expect(dbItems).toHaveLength(1);
      const dbItem = dbItems[0]!;
      expect(dbItem.subtotalAmount.toFixed(2)).toBe('100.00');
      expect(dbItem.discountTotalAmount.toFixed(2)).toBe('10.00');
      expect(dbItem.totalAmount.toFixed(2)).toBe('90.00');
      expect(dbItem.discountType).toBe('PERCENTAGE');
      expect(dbItem.discountValue?.toFixed(2)).toBe('10.00');
      expect(dbItem.discountReason).toBe('10% Member Concession');

      // 3. Simulate Database Storage & Reconstitution (Prisma → Domain)
      const rawDatabaseRecord = {
        ...dbSale,
        createdAt: sale.createdAt,
        updatedAt: sale.updatedAt,
        items: dbItems.map((item) => ({
          ...item,
          createdAt: sale.createdAt,
          updatedAt: sale.updatedAt,
        })),
      };

      const reconstitutedSale = PrismaSaleMapper.toDomain(rawDatabaseRecord);

      // 4. Assert Absolute Identity and Numerical Stability
      expect(reconstitutedSale.id.value).toBe(sale.id.value);
      expect(reconstitutedSale.currency).toBe('USD');
      expect(reconstitutedSale.subtotal.cents).toBe(10000);
      expect(reconstitutedSale.subtotal.amount).toBe(100.0);
      expect(reconstitutedSale.discountTotal.cents).toBe(1000);
      expect(reconstitutedSale.discountTotal.amount).toBe(10.0);
      expect(reconstitutedSale.total.cents).toBe(9000);
      expect(reconstitutedSale.total.amount).toBe(90.0);

      expect(reconstitutedSale.subtotal.equals(sale.subtotal)).toBe(true);
      expect(reconstitutedSale.discountTotal.equals(sale.discountTotal)).toBe(true);
      expect(reconstitutedSale.total.equals(sale.total)).toBe(true);

      // 5. Assert PrismaMoneyMapper direct conversion fidelity
      const subtotalDecimal = PrismaMoneyMapper.toDecimal(sale.subtotal);
      expect(subtotalDecimal.toFixed(2)).toBe('100.00');
      const remappedSubtotal = PrismaMoneyMapper.toMoney(subtotalDecimal, 'USD');
      expect(remappedSubtotal.cents).toBe(10000);
      expect(remappedSubtotal.amount).toBe(100.0);

      const discountDecimal = PrismaMoneyMapper.toDecimal(sale.discountTotal);
      expect(discountDecimal.toFixed(2)).toBe('10.00');
      const remappedDiscount = PrismaMoneyMapper.toMoney(discountDecimal, 'USD');
      expect(remappedDiscount.cents).toBe(1000);
      expect(remappedDiscount.amount).toBe(10.0);

      const totalDecimal = PrismaMoneyMapper.toDecimal(sale.total);
      expect(totalDecimal.toFixed(2)).toBe('90.00');
      const remappedTotal = PrismaMoneyMapper.toMoney(totalDecimal, 'USD');
      expect(remappedTotal.cents).toBe(9000);
      expect(remappedTotal.amount).toBe(90.0);
    });
  });

  // =========================================================================
  // Requirement 4: Commercial Half-Up Rounding Boundaries
  // =========================================================================

  describe('[S3-E2E-4] Commercial Half-Up Rounding Boundaries (Integer Minor Units)', () => {
    it('proves deterministic Half-Up rounding at the fractional cent boundary ($0.005 / 0.5 cents)', async () => {
      // Case A: $33.33 subtotal = 3333 cents.
      // 3333 * 10 / 100 = 333.3 cents -> rounds down to 333 cents ($3.33 discount).
      // Total = 3333 - 333 = 3000 cents ($30.00 net).
      const discount = Discount.percentage(10);
      const money3333 = Money.create('33.33', 'USD');
      const reductionA = discount.calculate(money3333);
      expect(reductionA.cents).toBe(333);
      expect(reductionA.amount).toBe(3.33);

      // Case B: $33.35 subtotal = 3335 cents.
      // 3335 * 10 / 100 = 333.5 cents -> Half-Up rounds to 334 cents ($3.34 discount).
      // Total = 3335 - 334 = 3001 cents ($30.01 net).
      const money3335 = Money.create('33.35', 'USD');
      const reductionB = discount.calculate(money3335);
      expect(reductionB.cents).toBe(334);
      expect(reductionB.amount).toBe(3.34);

      // Case C: $0.05 subtotal = 5 cents.
      // 5 * 10 / 100 = 0.5 cents -> Half-Up rounds to 1 cent ($0.01 discount).
      const money5c = Money.create('0.05', 'USD');
      const reductionC = discount.calculate(money5c);
      expect(reductionC.cents).toBe(1);
      expect(reductionC.amount).toBe(0.01);

      // Case D: $0.04 subtotal = 4 cents.
      // 4 * 10 / 100 = 0.4 cents -> rounds down to 0 cents ($0.00 discount).
      const money4c = Money.create('0.04', 'USD');
      const reductionD = discount.calculate(money4c);
      expect(reductionD.cents).toBe(0);
      expect(reductionD.amount).toBe(0.0);
    });
  });

  // =========================================================================
  // Requirement 7: Invalid Discounts & Boundary Rejections
  // =========================================================================

  describe('[S3-E2E-5] Strict Rejection of Invalid Percentage Discounts Without State Mutation', () => {
    it('rejects negative percentage discount (-10%) without mutating persisted Sale', async () => {
      // 1. Create clean draft sale
      const createRes = await request(app.getHttpServer())
        .post('/api/v1/sales')
        .set('Authorization', `Bearer ${receptionistToken}`)
        .send({
          currency: 'USD',
          sourceReference: { type: 'FOOD', referenceId: 'inv_clean_001' },
          items: [
            {
              description: 'Pure Product',
              quantity: 1,
              unitPriceAmount: 100.0,
            },
          ],
        })
        .expect(201);

      const saleId = createRes.body.id;

      // 2. Attempt to apply negative discount (-10%)
      const errRes = await request(app.getHttpServer())
        .post(`/api/v1/sales/${saleId}/discount`)
        .set('Authorization', `Bearer ${receptionistToken}`)
        .send({
          type: 'PERCENTAGE',
          value: -10,
          reason: 'Exploit attempt',
        })
        .expect(400);

      expect(errRes.body.statusCode).toBe(400);

      // 3. Verify Sale in repository was NOT altered
      const verifyRes = await request(app.getHttpServer())
        .get(`/api/v1/sales/${saleId}`)
        .set('Authorization', `Bearer ${receptionistToken}`)
        .expect(200);

      expect(verifyRes.body.subtotalAmount).toBe(100.0);
      expect(verifyRes.body.discountTotalAmount).toBe(0.0);
      expect(verifyRes.body.totalAmount).toBe(100.0);
      expect(verifyRes.body.orderDiscount).toBeNull();
    });

    it('rejects percentage discount exceeding 100% (e.g. 105%) with 400 Bad Request', async () => {
      const createRes = await request(app.getHttpServer())
        .post('/api/v1/sales')
        .set('Authorization', `Bearer ${receptionistToken}`)
        .send({
          currency: 'USD',
          sourceReference: { type: 'FOOD', referenceId: 'inv_clean_002' },
          items: [{ description: 'Item', quantity: 1, unitPriceAmount: 100.0 }],
        })
        .expect(201);

      const saleId = createRes.body.id;

      await request(app.getHttpServer())
        .post(`/api/v1/sales/${saleId}/discount`)
        .set('Authorization', `Bearer ${receptionistToken}`)
        .send({
          type: 'PERCENTAGE',
          value: 105,
        })
        .expect(400);
    });

    it('rejects percentage discount with excessive decimal precision (e.g. 10.123%)', async () => {
      const createRes = await request(app.getHttpServer())
        .post('/api/v1/sales')
        .set('Authorization', `Bearer ${receptionistToken}`)
        .send({
          currency: 'USD',
          sourceReference: { type: 'FOOD', referenceId: 'inv_clean_003' },
          items: [{ description: 'Item', quantity: 1, unitPriceAmount: 100.0 }],
        })
        .expect(201);

      const saleId = createRes.body.id;

      await request(app.getHttpServer())
        .post(`/api/v1/sales/${saleId}/discount`)
        .set('Authorization', `Bearer ${receptionistToken}`)
        .send({
          type: 'PERCENTAGE',
          value: 10.123,
        })
        .expect(400);
    });
  });

  describe('[S3-E2E-6] Fixed Discount Boundary: Non-Exceeding Invariant & No Silent Clamping', () => {
    it('strictly rejects fixed discount exceeding line subtotal ($105.00 on $100.00) without silent clamping', async () => {
      // 1. Direct Domain Invariant: Fixed discount exceeding eligible amount throws InvalidDiscountException
      const excessiveFixedDiscount = Discount.fixed(105.0, 'Excessive fixed voucher');
      const eligibleAmount = Money.create(100.0, 'USD');
      expect(() => excessiveFixedDiscount.calculate(eligibleAmount)).toThrow(/cannot exceed/i);

      // 2. HTTP API Invariant: Attempting to add an item with fixed discount exceeding line subtotal is strictly rejected (400 Bad Request)
      const errRes = await request(app.getHttpServer())
        .post('/api/v1/sales')
        .set('Authorization', `Bearer ${receptionistToken}`)
        .send({
          currency: 'USD',
          sourceReference: { type: 'FOOD', referenceId: 'inv_clean_004' },
          items: [
            {
              description: 'Item with excessive fixed discount',
              quantity: 1,
              unitPriceAmount: 100.0,
              discount: {
                type: 'FIXED',
                value: 105.0,
                reason: 'Excessive fixed voucher',
              },
            },
          ],
        })
        .expect(400);

      expect(errRes.body.statusCode).toBe(400);
      expect(errRes.body.message).toMatch(/cannot exceed/i);
    });
  });

  // =========================================================================
  // Commercial Lock & Financial Settlement Lifecycle
  // =========================================================================

  describe('[S3-E2E-7] Commercial Terms Immutability Upon Finalization', () => {
    it('prevents applying or modifying discounts after sale is finalized (PENDING_PAYMENT)', async () => {
      // 1. Create sale with 10% discount on 100.00
      const createRes = await request(app.getHttpServer())
        .post('/api/v1/sales')
        .set('Authorization', `Bearer ${receptionistToken}`)
        .send({
          currency: 'USD',
          sourceReference: { type: 'FOOD', referenceId: 'inv_clean_005' },
          items: [
            {
              description: 'Item',
              quantity: 1,
              unitPriceAmount: 100.0,
              discount: { type: 'PERCENTAGE', value: 10 },
            },
          ],
        })
        .expect(201);

      const saleId = createRes.body.id;
      expect(createRes.body.totalAmount).toBe(90.0);

      // 2. Finalize sale
      await request(app.getHttpServer())
        .post(`/api/v1/sales/${saleId}/finalize`)
        .set('Authorization', `Bearer ${receptionistToken}`)
        .expect(200);

      // 3. Attempt to add order discount on finalized sale -> 409 Conflict
      await request(app.getHttpServer())
        .post(`/api/v1/sales/${saleId}/discount`)
        .set('Authorization', `Bearer ${receptionistToken}`)
        .send({
          type: 'PERCENTAGE',
          value: 5,
        })
        .expect(409);
    });
  });

  describe('[S3-E2E-8] Complete Payment & Receipt Settlement on Discounted Net Total', () => {
    it('completes exact 90.00 payment, advances Sale to PAID, and issues receipt reflecting subtotal, discount, and total', async () => {
      // 1. Create draft sale with 10% discount on 100.00
      const createRes = await request(app.getHttpServer())
        .post('/api/v1/sales')
        .set('Authorization', `Bearer ${receptionistToken}`)
        .send({
          currency: 'USD',
          sourceReference: { type: 'FOOD', referenceId: 'inv_clean_006' },
          items: [
            {
              description: 'Item',
              quantity: 1,
              unitPriceAmount: 100.0,
              discount: { type: 'PERCENTAGE', value: 10, reason: '10% Promo' },
            },
          ],
        })
        .expect(201);

      const saleId = createRes.body.id;

      // 2. Finalize sale -> PENDING_PAYMENT
      await request(app.getHttpServer())
        .post(`/api/v1/sales/${saleId}/finalize`)
        .set('Authorization', `Bearer ${receptionistToken}`)
        .expect(200);

      // 3. Create completed cash payment for exact discounted total of 90.00
      const payRes = await request(app.getHttpServer())
        .post('/api/v1/payments')
        .set('Authorization', `Bearer ${receptionistToken}`)
        .send({
          saleId,
          amount: 90.0,
          currency: 'USD',
          method: 'CASH',
          status: 'COMPLETED',
          reference: 'CASH-SETTLE-90',
        })
        .expect(201);

      expect(payRes.body.status).toBe('COMPLETED');
      expect(payRes.body.amountValue).toBe(90.0);
      expect(payRes.body.amount.cents).toBe(9000);

      // 5. Verify Sale reached PAID status
      const saleVerifyRes = await request(app.getHttpServer())
        .get(`/api/v1/sales/${saleId}`)
        .set('Authorization', `Bearer ${receptionistToken}`)
        .expect(200);

      expect(saleVerifyRes.body.status).toBe('PAID');
      expect(saleVerifyRes.body.subtotalAmount).toBe(100.0);
      expect(saleVerifyRes.body.discountTotalAmount).toBe(10.0);
      expect(saleVerifyRes.body.totalAmount).toBe(90.0);

      // 6. Verify Receipt Issuance and Snapshot Correctness
      const receiptRes = await request(app.getHttpServer())
        .post(`/api/v1/sales/${saleId}/receipt`)
        .set('Authorization', `Bearer ${receptionistToken}`)
        .send()
        .expect(201);

      expect(receiptRes.body.receiptNumber).toMatch(/^REC-/);
      expect(receiptRes.body.status).toBe('ISSUED');
      expect(receiptRes.body.subtotal.amount).toBe(100.0);
      expect(receiptRes.body.subtotal.cents).toBe(10000);
      expect(receiptRes.body.discountTotal.amount).toBe(10.0);
      expect(receiptRes.body.discountTotal.cents).toBe(1000);
      expect(receiptRes.body.total.amount).toBe(90.0);
      expect(receiptRes.body.total.cents).toBe(9000);
    });
  });
});
