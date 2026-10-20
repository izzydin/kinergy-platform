import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import * as jwt from 'jsonwebtoken';
import {
  Receipt,
  ReceiptId,
  ReceiptNumber,
  Sale,
  SaleId,
  Money,
  SourceReference,
  SourceType,
  PaymentMethod,
  ReceiptStatus,
  Payment,
  PaymentId,
  ReceiptRepositoryPort,
  SaleRepositoryPort,
  PaymentRepositoryPort,
  IssueReceiptHandler,
  GetReceiptHandler,
  GetReceiptBySaleHandler,
} from '@kinergy-platform/core';
import {
  ReceiptPersistenceException,
  InMemoryReceiptSequenceGenerator,
} from '@kinergy-platform/core/server';
import { ReceiptsController, RECEIPT_REPOSITORY_TOKEN } from '../controllers/receipts.controller';
import { SALE_REPOSITORY_TOKEN } from '../controllers/sales.controller';
import { PAYMENT_REPOSITORY_TOKEN } from '../controllers/payments.controller';
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

// --- Integration Test Repositories with Operational Spies ---

class IntegrationReceiptRepository implements ReceiptRepositoryPort {
  public store = new Map<string, Receipt>();
  public saveCount = 0;
  public simulateFailure = false;
  private readonly sequenceGenerator = new InMemoryReceiptSequenceGenerator();

  async findById(id: ReceiptId | string): Promise<Receipt | null> {
    const key = typeof id === 'string' ? id.trim() : id.value;
    return this.store.get(key) ?? null;
  }

  async findBySaleId(saleId: SaleId | string, tenantId?: string): Promise<Receipt | null> {
    if (this.simulateFailure) {
      throw new ReceiptPersistenceException(
        'PrismaClientKnownRequestError: Connection pool exhausted to postgresql://postgres:secret_pass@127.0.0.1:5432/kinergy_prod',
        {
          cause: new Error('P2024: Timed out fetching a new connection from the connection pool.'),
        },
      );
    }
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
    this.simulateFailure = false;
  }
}

class IntegrationSaleRepository implements SaleRepositoryPort {
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

  clear(): void {
    this.store.clear();
    this.saveCount = 0;
  }
}

class IntegrationPaymentRepository implements PaymentRepositoryPort {
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

describe('Receipts HTTP API Integration Specification (GET /api/v1/sales/:saleId/receipt)', () => {
  let app: INestApplication;
  let receiptRepo: IntegrationReceiptRepository;
  let saleRepo: IntegrationSaleRepository;
  let paymentRepo: IntegrationPaymentRepository;
  const userStore = new Map<string, User>();

  const mainTenantId = 'tenant_kinergy_e2e';
  const rivalTenantId = 'tenant_rival_facility';

  // Personas
  const receptionistStaff = new User({
    id: 'usr_recept_01',
    email: 'receptionist@kinergy.com',
    passwordHash: 'hash_123',
    status: UserStatus.ACTIVE,
    roles: ['Receptionist'],
    permissions: ['receipts.read', 'receipts.manage', 'sales.read'],
    tenantId: mainTenantId,
    tokenVersion: 1,
  });

  const clientAlice = new User({
    id: 'usr_client_alice',
    email: 'alice.client@example.com',
    passwordHash: 'hash_123',
    status: UserStatus.ACTIVE,
    roles: ['Client'],
    permissions: ['receipts.read'],
    tenantId: mainTenantId,
    tokenVersion: 1,
  });

  const visitorUser = new User({
    id: 'usr_visitor_unauth',
    email: 'visitor@example.com',
    passwordHash: 'hash_123',
    status: UserStatus.ACTIVE,
    roles: ['Visitor'],
    permissions: [],
    tenantId: mainTenantId,
    tokenVersion: 1,
  });

  const rivalManager = new User({
    id: 'usr_rival_mgr',
    email: 'manager@rival.com',
    passwordHash: 'hash_123',
    status: UserStatus.ACTIVE,
    roles: ['Manager'],
    permissions: ['receipts.read'],
    tenantId: rivalTenantId,
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

  let receptionistToken: string;
  let clientAliceToken: string;
  let visitorToken: string;

  beforeAll(async () => {
    [receptionistStaff, clientAlice, visitorUser, rivalManager].forEach((u) =>
      userStore.set(u.id, u),
    );

    receptionistToken = createTokenForUser(receptionistStaff);
    clientAliceToken = createTokenForUser(clientAlice);
    visitorToken = createTokenForUser(visitorUser);

    receiptRepo = new IntegrationReceiptRepository();
    saleRepo = new IntegrationSaleRepository();
    paymentRepo = new IntegrationPaymentRepository();

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
      controllers: [ReceiptsController],
      providers: [
        {
          provide: RECEIPT_REPOSITORY_TOKEN,
          useValue: receiptRepo,
        },
        {
          provide: SALE_REPOSITORY_TOKEN,
          useValue: saleRepo,
        },
        {
          provide: PAYMENT_REPOSITORY_TOKEN,
          useValue: paymentRepo,
        },
        {
          provide: ACCESS_TOKEN_SERVICE,
          useValue: mockAccessTokenService,
        },
        {
          provide: USER_REPOSITORY,
          useValue: mockUserRepository,
        },
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
          provide: IssueReceiptHandler,
          useFactory: () => new IssueReceiptHandler(receiptRepo, saleRepo, paymentRepo),
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
    receiptRepo.clear();
    saleRepo.clear();
    paymentRepo.clear();
  });

  // Helper to create and settle a Sale with an issued Receipt
  const setupSettledSaleWithReceipt = async (options?: {
    clientId?: string;
    clientName?: string;
    items?: Array<{ desc: string; qty: number; price: number }>;
  }): Promise<{ sale: Sale; payment: Payment; receipt: Receipt }> => {
    const sale = Sale.create({
      tenantId: mainTenantId,
      clientId: options?.clientId,
      currency: 'USD',
      source: SourceReference.create({
        sourceType: SourceType.MEMBERSHIP_PLAN,
        sourceId: 'plan_fit_pass',
      }),
    });

    const itemsConfig = options?.items ?? [{ desc: 'Monthly Access Pass', qty: 1, price: 50.0 }];

    let totalCents = 0;
    for (const item of itemsConfig) {
      const money = Money.create(item.price, 'USD');
      sale.addItem({
        source: SourceReference.create({
          sourceType: SourceType.MEMBERSHIP_PLAN,
          sourceId: 'plan_fit_pass',
        }),
        description: item.desc,
        quantity: item.qty,
        unitPrice: money,
      });
      totalCents += money.cents * item.qty;
    }

    sale.finalize();
    sale.markPaid();
    await saleRepo.save(sale);

    const payment = Payment.createCompleted({
      saleId: sale.id,
      tenantId: mainTenantId,
      amount: Money.create(totalCents / 100, 'USD'),
      method: PaymentMethod.CASH,
    });
    await paymentRepo.save(payment);

    const receipt = Receipt.fromSettledSale({
      sale,
      payments: [payment],
      receiptNumber: 'REC-2026-000701',
      clientSummary: options?.clientId
        ? {
            id: options.clientId,
            fullName: options.clientName ?? 'Alice Client Historical',
            email: 'alice.historical@example.com',
          }
        : null,
    });
    await receiptRepo.save(receipt);

    return { sale, payment, receipt };
  };

  // ===========================================================================
  // Scenario 1: Authorized Request for a Sale with an Issued Receipt (200 OK)
  // ===========================================================================
  it('Scenario 1: Authorized request for a Sale with an issued Receipt returns 200 OK and canonical DTO', async () => {
    const { sale, receipt } = await setupSettledSaleWithReceipt({
      clientId: clientAlice.id,
      clientName: 'Alice Client',
    });

    const response = await request(app.getHttpServer())
      .get(`/api/v1/sales/${sale.id.value}/receipt`)
      .set('Authorization', `Bearer ${receptionistToken}`)
      .expect(200);

    expect(response.body).toBeDefined();
    expect(response.body.id).toBe(receipt.id.value);
    expect(response.body.saleId).toBe(sale.id.value);
    expect(response.body.receiptNumber).toBe('REC-2026-000701');
    expect(response.body.status).toBe(ReceiptStatus.ISSUED);
    expect(response.body.reprintCount).toBe(0);
    expect(response.body.total.formatted).toBe('50.00');
    expect(response.body.total.cents).toBe(5000);
    expect(response.body.items).toHaveLength(1);
    expect(response.body.payments).toHaveLength(1);
  });

  // ===========================================================================
  // Scenario 2: Request for a Nonexistent Sale (404 Not Found)
  // ===========================================================================
  it('Scenario 2: Request for a nonexistent Sale returns standard 404 Not Found contract', async () => {
    const nonExistentSaleId = 'sale_not_existing_uuid_999';

    const response = await request(app.getHttpServer())
      .get(`/api/v1/sales/${nonExistentSaleId}/receipt`)
      .set('Authorization', `Bearer ${receptionistToken}`)
      .expect(404);

    expect(response.body).toEqual({
      statusCode: 404,
      error: 'Not Found',
      message: `Sale with ID '${nonExistentSaleId}' was not found.`,
    });
  });

  // ===========================================================================
  // Scenario 3: Request for an Existing Sale Without a Receipt (404 Not Found)
  // ===========================================================================
  it('Scenario 3: Request for an existing Sale without a Receipt returns 404 Not Found and does NOT auto-create', async () => {
    const sale = Sale.create({
      tenantId: mainTenantId,
      currency: 'USD',
      source: SourceReference.create({
        sourceType: SourceType.MEMBERSHIP_PLAN,
        sourceId: 'plan_basic',
      }),
    });
    sale.addItem({
      source: SourceReference.create({
        sourceType: SourceType.MEMBERSHIP_PLAN,
        sourceId: 'plan_basic',
      }),
      description: 'Day Pass',
      quantity: 1,
      unitPrice: Money.create(15.0, 'USD'),
    });
    sale.finalize();
    sale.markPaid();
    await saleRepo.save(sale);

    // Initial receipt store is empty
    expect(receiptRepo.store.size).toBe(0);

    const response = await request(app.getHttpServer())
      .get(`/api/v1/sales/${sale.id.value}/receipt`)
      .set('Authorization', `Bearer ${receptionistToken}`)
      .expect(404);

    expect(response.body).toEqual({
      statusCode: 404,
      error: 'Not Found',
      message: `Receipt with identifier 'sale:${sale.id.value}' was not found.`,
    });

    // Zero silent auto-creation
    expect(receiptRepo.store.size).toBe(0);
    expect(receiptRepo.saveCount).toBe(0);
  });

  // ===========================================================================
  // Scenario 4: Invalid Sale Identifier (400 Bad Request)
  // ===========================================================================
  it('Scenario 4: Invalid Sale identifier (whitespace) produces standard 400 Bad Request validation response', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/sales/%20%20%20/receipt')
      .set('Authorization', `Bearer ${receptionistToken}`)
      .expect(400);

    expect(response.body).toEqual({
      statusCode: 400,
      error: 'Bad Request',
      message: 'Sale ID cannot be empty or whitespace.',
    });
  });

  // ===========================================================================
  // Scenario 5: Missing Authentication (401 Unauthorized)
  // ===========================================================================
  it('Scenario 5: Request with missing authentication header produces standard 401 Unauthorized response', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/sales/any_sale_id/receipt')
      // No Authorization header provided
      .expect(401);

    expect(response.body).toEqual({
      statusCode: 401,
      error: 'Unauthorized',
      message: 'Authentication token required.',
    });
  });

  // ===========================================================================
  // Scenario 6: Authenticated User Without Required Permission (403 Forbidden)
  // ===========================================================================
  it('Scenario 6: Authenticated user lacking receipts.read produces standard 403 Forbidden response', async () => {
    const { sale } = await setupSettledSaleWithReceipt();

    const response = await request(app.getHttpServer())
      .get(`/api/v1/sales/${sale.id.value}/receipt`)
      .set('Authorization', `Bearer ${visitorToken}`)
      .expect(403);

    expect(response.body).toMatchObject({
      statusCode: 403,
      error: 'Forbidden',
    });
  });

  // ===========================================================================
  // Scenario 7: Receipt With Multiple Items & Nontrivial Monetary Values
  // ===========================================================================
  it('Scenario 7: Receipt with multiple items and nontrivial monetary values preserves integer precision and cents sum', async () => {
    // 3 items with fractional values: $19.99 (x1), $45.50 (x2 = $91.00), $12.35 (x3 = $37.05)
    // Subtotal = 19.99 + 91.00 + 37.05 = 148.04
    const { sale } = await setupSettledSaleWithReceipt({
      items: [
        { desc: 'Whey Protein Supplement', qty: 1, price: 19.99 },
        { desc: 'Personal Training Session', qty: 2, price: 45.5 },
        { desc: 'Electrolyte Hydration Drink', qty: 3, price: 12.35 },
      ],
    });

    const response = await request(app.getHttpServer())
      .get(`/api/v1/sales/${sale.id.value}/receipt`)
      .set('Authorization', `Bearer ${receptionistToken}`)
      .expect(200);

    const body = response.body;

    // Verify aggregate totals
    expect(body.total.amount).toBe(148.04);
    expect(body.total.formatted).toBe('148.04');
    expect(body.total.cents).toBe(14804);
    expect(body.subtotal.cents).toBe(14804);
    expect(body.discountTotal.cents).toBe(0);

    // Verify item snapshots
    expect(body.items).toHaveLength(3);
    expect(body.items[0].unitPrice.cents).toBe(1999);
    expect(body.items[0].total.cents).toBe(1999);
    expect(body.items[1].unitPrice.cents).toBe(4550);
    expect(body.items[1].total.cents).toBe(9100);
    expect(body.items[2].unitPrice.cents).toBe(1235);
    expect(body.items[2].total.cents).toBe(3705);

    // Invariant: sum of item cents strictly matches total cents (zero float arithmetic drift)
    const itemSumCents = body.items.reduce(
      (sum: number, it: { total: { cents: number } }) => sum + it.total.cents,
      0,
    );
    expect(itemSumCents).toBe(body.total.cents);
  });

  // ===========================================================================
  // Scenario 8: Historical Snapshot Fidelity When Current Related Records Differ
  // ===========================================================================
  it('Scenario 8: Historical snapshot fidelity preserves captured client and item data even when current records differ', async () => {
    // 1. Issue receipt with historical client name
    const { sale } = await setupSettledSaleWithReceipt({
      clientId: clientAlice.id,
      clientName: 'Alice Historical MaidenName',
      items: [{ desc: 'Fixed Historical Package', qty: 1, price: 80.0 }],
    });

    // 2. Later, current user updates name in user profile to "Alice Modern MarriedName"
    const updatedUser = new User({
      id: clientAlice.id,
      email: clientAlice.email,
      passwordHash: 'hash_123',
      status: UserStatus.ACTIVE,
      roles: ['Client'],
      permissions: ['receipts.read'],
      tenantId: mainTenantId,
      tokenVersion: 1,
    });
    userStore.set(updatedUser.id, updatedUser);

    // 3. Client retrieves their receipt voucher
    const response = await request(app.getHttpServer())
      .get(`/api/v1/sales/${sale.id.value}/receipt`)
      .set('Authorization', `Bearer ${clientAliceToken}`)
      .expect(200);

    // Historical client name must be returned, not current profile name
    expect(response.body.clientSnapshot.fullName).toBe('Alice Historical MaidenName');
    expect(response.body.items[0].description).toBe('Fixed Historical Package');
    expect(response.body.items[0].unitPrice.cents).toBe(8000);
  });

  // ===========================================================================
  // Scenario 9: Unexpected Repository Failure Handled Cleanly (500 Internal Error)
  // ===========================================================================
  it('Scenario 9: Unexpected database failure returns generic 500 without disclosing Prisma errors, SQL, or stack traces', async () => {
    const { sale } = await setupSettledSaleWithReceipt();

    // Trigger simulated connection pool failure
    receiptRepo.simulateFailure = true;

    const response = await request(app.getHttpServer())
      .get(`/api/v1/sales/${sale.id.value}/receipt`)
      .set('Authorization', `Bearer ${receptionistToken}`)
      .set('x-correlation-id', 'corr_e2e_500')
      .expect(500);

    expect(response.headers['x-correlation-id']).toBe('corr_e2e_500');
    expect(response.body).toEqual({
      statusCode: 500,
      error: 'Internal Server Error',
      message: 'An unexpected internal server error occurred.',
    });

    // Verify zero data leaks
    const responseJson = JSON.stringify(response.body);
    expect(responseJson).not.toContain('PrismaClientKnownRequestError');
    expect(responseJson).not.toContain('postgresql://');
    expect(responseJson).not.toContain('secret_pass');
    expect(responseJson).not.toContain('P2024');
    expect(response.body.stack).toBeUndefined();
  });

  // ===========================================================================
  // Scenario 10: Zero-Mutation Guarantee across Retrieval Operations
  // ===========================================================================
  it('Scenario 10: GET retrieval performs zero write/update/delete operations across all success and error paths', async () => {
    const { sale } = await setupSettledSaleWithReceipt();

    const initialReceiptSaveCount = receiptRepo.saveCount;
    const initialSaleSaveCount = saleRepo.saveCount;
    const initialPaymentSaveCount = paymentRepo.saveCount;

    // 1. Success request
    await request(app.getHttpServer())
      .get(`/api/v1/sales/${sale.id.value}/receipt`)
      .set('Authorization', `Bearer ${receptionistToken}`)
      .expect(200);

    // 2. 404 Missing sale request
    await request(app.getHttpServer())
      .get('/api/v1/sales/missing_id_abc/receipt')
      .set('Authorization', `Bearer ${receptionistToken}`)
      .expect(404);

    // 3. 400 Bad Request
    await request(app.getHttpServer())
      .get('/api/v1/sales/%20%20/receipt')
      .set('Authorization', `Bearer ${receptionistToken}`)
      .expect(400);

    // 4. 401 Unauthorized
    await request(app.getHttpServer()).get(`/api/v1/sales/${sale.id.value}/receipt`).expect(401);

    // 5. 403 Forbidden
    await request(app.getHttpServer())
      .get(`/api/v1/sales/${sale.id.value}/receipt`)
      .set('Authorization', `Bearer ${visitorToken}`)
      .expect(403);

    // Invariant: Zero mutations on ANY path
    expect(receiptRepo.saveCount).toBe(initialReceiptSaveCount);
    expect(saleRepo.saveCount).toBe(initialSaleSaveCount);
    expect(paymentRepo.saveCount).toBe(initialPaymentSaveCount);
  });
});
