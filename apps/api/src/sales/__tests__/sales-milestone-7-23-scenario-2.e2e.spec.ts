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
  InventoryItem,
  InventoryCategory,
  UnitOfMeasure,
  StockMovementType,
  InventoryItemRepository,
  GetInventoryItemByIdHandler,
  SellStockHandler,
  InventoryStockDecrementPort,
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
  ResourcesSourceValidatorAdapter,
  CompositeSaleSourceValidatorAdapter,
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

class InMemoryInventoryRepository implements InventoryItemRepository {
  public items = new Map<string, InventoryItem>();

  async findById(id: string): Promise<InventoryItem | null> {
    return this.items.get(id) ?? null;
  }

  async findBySku(sku: string, tenantId?: string): Promise<InventoryItem | null> {
    for (const item of this.items.values()) {
      if (
        item.sku.value === sku.trim().toUpperCase() &&
        (!tenantId || item.tenantId === tenantId)
      ) {
        return item;
      }
    }
    return null;
  }

  async save(item: InventoryItem): Promise<void> {
    this.items.set(item.id.getValue(), item);
  }

  async findMany(): Promise<InventoryItem[]> {
    return Array.from(this.items.values());
  }

  async count(): Promise<number> {
    return this.items.size;
  }

  async delete(id: string): Promise<void> {
    this.items.delete(id);
  }

  seed(item: InventoryItem): void {
    this.items.set(item.id.getValue(), item);
  }

  clear(): void {
    this.items.clear();
  }
}

// ============================================================================
// Test Suite: Milestone 7.23 Scenario 2
// Healthy Drink Commercial Sale, Payment Lifecycle, and Inventory Boundaries
// ============================================================================

describe('Milestone 7.23 Scenario 2: Healthy Drink Commercial Sale, Payment, and Resources Integration', () => {
  let app: INestApplication;
  let saleRepo: InMemoryIntegrationSaleRepository;
  let paymentRepo: InMemoryIntegrationPaymentRepository;
  let receiptRepo: InMemoryIntegrationReceiptRepository;
  let inventoryRepo: InMemoryInventoryRepository;
  let decrementPort: InventoryStockDecrementPort;

  const defaultTenantId = 'tenant_kinergy_main';
  const competitorTenantId = 'tenant_kinergy_rival';
  const cashierUserId = 'usr_barista_pos';

  // Users for IAM Authorization
  const managerUser = new User({
    id: 'usr_mgr_s2',
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
    id: 'usr_recep_s2',
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
    id: 'usr_trainer_s2',
    email: 'trainer@kinergy.platform',
    passwordHash: 'dummy_hash',
    status: UserStatus.ACTIVE,
    roles: ['Trainer'],
    permissions: ['sales.read'], // Lacks sales.create & payments.create
    tenantId: defaultTenantId,
    tokenVersion: 1,
  });

  const clientUser = new User({
    id: 'usr_client_guest_002',
    email: 'guest002@example.com',
    passwordHash: 'dummy_hash',
    status: UserStatus.ACTIVE,
    roles: ['Client'],
    permissions: ['sales.read', 'receipts.read'],
    tenantId: defaultTenantId,
    tokenVersion: 1,
  });

  const competitorUser = new User({
    id: 'usr_rival_mgr_s2',
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
    inventoryRepo = new InMemoryInventoryRepository();

    const getInventoryItemByIdHandler = new GetInventoryItemByIdHandler(inventoryRepo);
    decrementPort = new SellStockHandler(inventoryRepo);

    const resourcesAdapter = new ResourcesSourceValidatorAdapter(getInventoryItemByIdHandler);
    const compositeValidator = new CompositeSaleSourceValidatorAdapter(
      undefined, // kinesiologyAdapter
      undefined, // gymAdapter
      resourcesAdapter,
    );

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
    inventoryRepo.clear();
    jest.clearAllMocks();
  });

  // Helper to seed a valid ACTIVE healthy drink in Resources domain
  function seedDrinkConsumable(
    initialStock = 15,
    unitPrice = 6.0,
    tenantId = defaultTenantId,
    sku = 'DRINK-SMOOTHIE-GRE',
  ): InventoryItem {
    const item = InventoryItem.create({
      sku,
      name: 'Cold-Pressed Green Detox Smoothie 500ml',
      category: InventoryCategory.HEALTHY_DRINKS,
      unit: UnitOfMeasure.BOTTLES,
      initialStock,
      minimumStock: 3,
      purchaseCost: { amount: 2.0, currency: 'USD' },
      sellingPrice: { amount: unitPrice, currency: 'USD' },
      recordedByUserId: cashierUserId,
      tenantId,
    });
    inventoryRepo.seed(item);
    return item;
  }

  // ==========================================================================
  // Primary Business Journey: Healthy Drink Sale & Payment Lifecycle
  // ==========================================================================
  describe('Primary Business Journey: Healthy Drink Sale, Calculation, Cash Payment, and Receipt', () => {
    it('executes legitimate healthy-drink checkout, completes cash settlement, and verifies domain boundary independence', async () => {
      // ----------------------------------------------------------------------
      // Step 1: Upstream Product Setup in Resources Management Domain
      // ----------------------------------------------------------------------
      const initialStock = 15;
      const unitPrice = 6.0;
      const drinkItem = seedDrinkConsumable(initialStock, unitPrice);
      const drinkId = drinkItem.id.getValue();

      // ----------------------------------------------------------------------
      // Step 2: Initialize Commercial Sale (POST /sales) with DRINK source
      // ----------------------------------------------------------------------
      const saleTxId = 'sale_drink_tx_001';
      const createSaleRes = await request(app.getHttpServer())
        .post('/api/v1/sales')
        .set('Authorization', `Bearer ${receptionistToken}`)
        .send({
          id: saleTxId,
          sourceReference: {
            type: 'DRINK',
            referenceId: drinkId,
            referenceCode: 'DRINK-SMOOTHIE-GRE',
          },
          currency: 'USD',
        });

      expect(createSaleRes.status).toBe(201);
      expect(createSaleRes.body.id).toBe(saleTxId);
      expect(createSaleRes.body.status).toBe('DRAFT');
      expect(createSaleRes.body.currency).toBe('USD');
      expect(createSaleRes.body.tenantId).toBe(defaultTenantId);

      // Verify authoritative price and line item auto-population from inventory catalog
      expect(createSaleRes.body.subtotalAmount).toBe(6.0);
      expect(createSaleRes.body.totalAmount).toBe(6.0);
      expect(createSaleRes.body.total.cents).toBe(600);
      expect(createSaleRes.body.itemCount).toBe(1);
      expect(createSaleRes.body.items).toHaveLength(1);
      expect(createSaleRes.body.items[0].description).toBe(
        'Cold-Pressed Green Detox Smoothie 500ml',
      );
      expect(createSaleRes.body.items[0].unitPriceAmount).toBe(6.0);
      expect(createSaleRes.body.items[0].quantity).toBe(1);
      expect(createSaleRes.body.items[0].skuOrCode).toBe('DRINK-SMOOTHIE-GRE');

      // ----------------------------------------------------------------------
      // Step 3: Calculate / Verify Authoritative Total (GET /sales/:id/calculate)
      // ----------------------------------------------------------------------
      const calcRes = await request(app.getHttpServer())
        .get(`/api/v1/sales/${saleTxId}/calculate`)
        .set('Authorization', `Bearer ${managerToken}`);

      expect(calcRes.status).toBe(200);
      expect(calcRes.body.totalAmount).toBe(6.0);
      expect(calcRes.body.total.cents).toBe(600);

      // ----------------------------------------------------------------------
      // Step 4: Finalize Sale (POST /sales/:id/finalize) -> PENDING_PAYMENT
      // ----------------------------------------------------------------------
      const finalizeRes = await request(app.getHttpServer())
        .post(`/api/v1/sales/${saleTxId}/finalize`)
        .set('Authorization', `Bearer ${receptionistToken}`)
        .send();

      expect(finalizeRes.status).toBe(200);
      expect(finalizeRes.body.id).toBe(saleTxId);
      expect(finalizeRes.body.status).toBe('PENDING_PAYMENT');
      expect(finalizeRes.body.totalAmount).toBe(6.0);

      // ----------------------------------------------------------------------
      // Step 5: Tendering CASH Payment (POST /sales/:saleId/payments)
      // ----------------------------------------------------------------------
      const paymentRes = await request(app.getHttpServer())
        .post(`/api/v1/sales/${saleTxId}/payments`)
        .set('Authorization', `Bearer ${receptionistToken}`)
        .send({
          method: 'CASH',
          amount: 6.0,
          currency: 'USD',
          status: 'COMPLETED',
          reference: 'POS-BAR-REGISTER-01',
        });

      expect(paymentRes.status).toBe(201);
      const paymentId = paymentRes.body.id;
      expect(paymentId).toBeDefined();
      expect(paymentRes.body.saleId).toBe(saleTxId);
      expect(paymentRes.body.method).toBe('CASH');
      expect(paymentRes.body.amountValue).toBe(6.0);
      expect(paymentRes.body.amount.cents).toBe(600);
      expect(paymentRes.body.status).toBe('COMPLETED');

      // Verify Sale status transitioned to PAID immediately after cash payment completion
      const saleAfterPaymentRes = await request(app.getHttpServer())
        .get(`/api/v1/sales/${saleTxId}`)
        .set('Authorization', `Bearer ${managerToken}`);

      expect(saleAfterPaymentRes.status).toBe(200);
      expect(saleAfterPaymentRes.body.status).toBe('PAID');
      expect(saleAfterPaymentRes.body.totalAmount).toBe(6.0);

      // ----------------------------------------------------------------------
      // Step 6: Issue and Retrieve Proof-of-Purchase Receipt
      // ----------------------------------------------------------------------
      const issueReceiptRes = await request(app.getHttpServer())
        .post(`/api/v1/sales/${saleTxId}/receipt`)
        .set('Authorization', `Bearer ${receptionistToken}`)
        .send();

      expect(issueReceiptRes.status).toBe(201);
      const receiptNumber = issueReceiptRes.body.receiptNumber;
      expect(receiptNumber).toMatch(/^REC-\d{4}-\d{6}$/);
      expect(issueReceiptRes.body.status).toBe('ISSUED');
      expect(issueReceiptRes.body.paymentMethod).toBe('CASH');
      expect(issueReceiptRes.body.total.amount).toBe(6.0);
      expect(issueReceiptRes.body.total.cents).toBe(600);
      expect(issueReceiptRes.body.items).toHaveLength(1);
      expect(issueReceiptRes.body.items[0].description).toBe(
        'Cold-Pressed Green Detox Smoothie 500ml',
      );

      // Retrieve via GET contract by front-desk receptionist
      const getReceiptRes = await request(app.getHttpServer())
        .get(`/api/v1/sales/${saleTxId}/receipt`)
        .set('Authorization', `Bearer ${receptionistToken}`);

      expect(getReceiptRes.status).toBe(200);
      expect(getReceiptRes.body.receiptNumber).toBe(receiptNumber);
      expect(getReceiptRes.body.total.amount).toBe(6.0);

      // Verify Object-Level Ownership: Unrelated client user is denied access to walk-in receipt -> 403 Forbidden
      const clientAccessRes = await request(app.getHttpServer())
        .get(`/api/v1/sales/${saleTxId}/receipt`)
        .set('Authorization', `Bearer ${clientToken}`);
      expect(clientAccessRes.status).toBe(403);

      // ----------------------------------------------------------------------
      // Step 7: Domain Purity & Boundary Independence Verification
      // ----------------------------------------------------------------------
      // A. Exactly one Sale exists for this commercial transaction
      const persistedSale = await saleRepo.findById(saleTxId);
      expect(persistedSale).not.toBeNull();
      expect(persistedSale!.source.sourceType).toBe('DRINK');
      expect(persistedSale!.source.sourceId).toBe(drinkId);
      expect(persistedSale!.status).toBe('PAID');
      expect(persistedSale!.total.amount).toBe(6.0);

      // B. Exactly one Payment exists
      const persistedPayments = await paymentRepo.findBySaleId(saleTxId);
      expect(persistedPayments).toHaveLength(1);
      expect(persistedPayments[0]!.method).toBe(PaymentMethod.CASH);
      expect(persistedPayments[0]!.status).toBe(PaymentStatus.COMPLETED);

      // C. Exactly one Receipt exists
      const persistedReceipt = await receiptRepo.findBySaleId(saleTxId);
      expect(persistedReceipt).not.toBeNull();
      expect(persistedReceipt!.status).toBe(ReceiptStatus.ISSUED);
      expect(persistedReceipt!.total.amount).toBe(6.0);

      // D. CRITICAL ARCHITECTURAL ASSERTION:
      // The Sales bounded context DOES NOT mutate inventory tables directly.
      // Physical inventory in the Resources repository remains unmutated by Sales checkout.
      const persistedItem = await inventoryRepo.findById(drinkId);
      expect(persistedItem).not.toBeNull();
      expect(persistedItem!.quantityOnHand.value).toBe(initialStock); // Still 15!
      expect(persistedItem!.movements).toHaveLength(1); // Only initial stock-in movement
    });
  });

  // ==========================================================================
  // Repeatable Retail Purchases vs Idempotent Retries
  // ==========================================================================
  describe('Consumable Retail Repeatability & Idempotency Invariants', () => {
    it('Invariant 1: Idempotent network retry returns existing Sale without creating duplicate rows', async () => {
      const drinkItem = seedDrinkConsumable(10, 4.5);
      const drinkId = drinkItem.id.getValue();
      const clientTxId = 'sale_drink_retry_101';

      // First call -> creates Sale
      const firstRes = await request(app.getHttpServer())
        .post('/api/v1/sales')
        .set('Authorization', `Bearer ${receptionistToken}`)
        .send({
          id: clientTxId,
          sourceReference: { type: 'DRINK', referenceId: drinkId },
          currency: 'USD',
        });
      expect(firstRes.status).toBe(201);
      expect(saleRepo.saveCount).toBe(1);

      // Second call (network retry with identical parameters) -> returns existing Sale
      const secondRes = await request(app.getHttpServer())
        .post('/api/v1/sales')
        .set('Authorization', `Bearer ${receptionistToken}`)
        .send({
          id: clientTxId,
          sourceReference: { type: 'DRINK', referenceId: drinkId },
          currency: 'USD',
        });
      expect(secondRes.status).toBe(201);
      expect(secondRes.body.id).toBe(clientTxId);

      // Exactly 1 sale in storage
      expect(saleRepo.store.size).toBe(1);
      expect(saleRepo.saveCount).toBe(1);
    });

    it('Invariant 2: Rejects conflicting re-execution with altered parameters under identical transaction ID', async () => {
      const drinkItem = seedDrinkConsumable(10, 4.5);
      const drinkId = drinkItem.id.getValue();
      const clientTxId = 'sale_drink_conflict_202';

      // First call with USD
      const firstRes = await request(app.getHttpServer())
        .post('/api/v1/sales')
        .set('Authorization', `Bearer ${receptionistToken}`)
        .send({
          id: clientTxId,
          sourceReference: { type: 'DRINK', referenceId: drinkId },
          currency: 'USD',
        });
      expect(firstRes.status).toBe(201);

      // Second call with different currency (CAD) under same ID -> 409 Conflict
      const conflictRes = await request(app.getHttpServer())
        .post('/api/v1/sales')
        .set('Authorization', `Bearer ${receptionistToken}`)
        .send({
          id: clientTxId,
          sourceReference: { type: 'DRINK', referenceId: drinkId },
          currency: 'CAD',
        });
      expect(conflictRes.status).toBe(409);
      expect(conflictRes.body.message).toContain(
        'already exists with different transaction parameters',
      );
      expect(saleRepo.store.size).toBe(1);
    });

    it('Invariant 3: Permits multiple independent commercial sales for the SAME consumable drink product', async () => {
      const drinkItem = seedDrinkConsumable(20, 5.0);
      const drinkId = drinkItem.id.getValue();

      // Customer A buys the drink
      const orderA = await request(app.getHttpServer())
        .post('/api/v1/sales')
        .set('Authorization', `Bearer ${receptionistToken}`)
        .send({
          id: 'sale_drink_cust_a',
          sourceReference: { type: 'DRINK', referenceId: drinkId },
          currency: 'USD',
        });
      expect(orderA.status).toBe(201);

      // Customer B buys the same drink product (separate transaction identity)
      const orderB = await request(app.getHttpServer())
        .post('/api/v1/sales')
        .set('Authorization', `Bearer ${receptionistToken}`)
        .send({
          id: 'sale_drink_cust_b',
          sourceReference: { type: 'DRINK', referenceId: drinkId },
          currency: 'USD',
        });
      expect(orderB.status).toBe(201);

      // Critical Invariant: Both commercial sales exist independently in persistence
      expect(saleRepo.store.size).toBe(2);
      expect(orderA.body.id).not.toBe(orderB.body.id);
      expect(orderA.body.totalAmount).toBe(5.0);
      expect(orderB.body.totalAmount).toBe(5.0);
    });

    it('Invariant 4: Rejects checkout when consumable stock is insufficient (0 on-hand)', async () => {
      const outOfStockDrink = seedDrinkConsumable(0, 5.0); // 0 stock!
      const drinkId = outOfStockDrink.id.getValue();

      const res = await request(app.getHttpServer())
        .post('/api/v1/sales')
        .set('Authorization', `Bearer ${receptionistToken}`)
        .send({
          id: 'sale_drink_out_of_stock',
          sourceReference: { type: 'DRINK', referenceId: drinkId },
          currency: 'USD',
        });

      expect(res.status).toBe(400);
      expect(res.body.message).toContain('Insufficient stock');
      expect(saleRepo.store.size).toBe(0);
    });

    it('Invariant 5: Rejects checkout when consumable drink item is DEACTIVATED (INACTIVE status)', async () => {
      const drinkItem = seedDrinkConsumable(10, 5.0);
      drinkItem.deactivate('usr_admin', 'Discontinued flavor');
      await inventoryRepo.save(drinkItem);

      const res = await request(app.getHttpServer())
        .post('/api/v1/sales')
        .set('Authorization', `Bearer ${receptionistToken}`)
        .send({
          id: 'sale_drink_inactive',
          sourceReference: { type: 'DRINK', referenceId: drinkItem.id.getValue() },
          currency: 'USD',
        });

      expect(res.status).toBe(400);
      expect(res.body.message).toContain('Only ACTIVE items can be sold');
      expect(saleRepo.store.size).toBe(0);
    });
  });

  // ==========================================================================
  // Owner-Controlled Inventory Fulfillment via Capability Port (Phase 6 Contract)
  // ==========================================================================
  describe('Owner-Controlled Inventory Fulfillment via Resources Capability Port', () => {
    it('executes explicit stock deduction through InventoryStockDecrementPort and verifies ledgering', async () => {
      const initialStock = 15;
      const drinkItem = seedDrinkConsumable(initialStock, 6.0);
      const drinkId = drinkItem.id.getValue();
      const commercialSaleId = 'sale_drink_fulfilled_001';

      // 1. Commercial Sale formed and paid in Sales domain
      const createRes = await request(app.getHttpServer())
        .post('/api/v1/sales')
        .set('Authorization', `Bearer ${receptionistToken}`)
        .send({
          id: commercialSaleId,
          sourceReference: { type: 'DRINK', referenceId: drinkId },
          currency: 'USD',
        });
      expect(createRes.status).toBe(201);

      await request(app.getHttpServer())
        .post(`/api/v1/sales/${commercialSaleId}/finalize`)
        .set('Authorization', `Bearer ${receptionistToken}`)
        .send();

      await request(app.getHttpServer())
        .post(`/api/v1/sales/${commercialSaleId}/payments`)
        .set('Authorization', `Bearer ${receptionistToken}`)
        .send({ method: 'CASH', amount: 6.0, status: 'COMPLETED' });

      // 2. Owner-Controlled Fulfillment: External context requests stock deduction through capability port
      const fulfillmentResult = await decrementPort.sellStock({
        itemId: drinkId,
        quantity: 1,
        referenceId: `${commercialSaleId}:line_1`,
        reason: 'Front Desk Bar POS retail sale',
        actorId: cashierUserId,
        tenantId: defaultTenantId,
        sellingPrice: { amount: 6.0, currency: 'USD' },
      });

      expect(fulfillmentResult.isSuccess).toBe(true);
      expect(fulfillmentResult.value.item.quantityOnHand).toBe(14); // 15 - 1
      expect(fulfillmentResult.value.movement.movementType).toBe(StockMovementType.SALE);
      expect(fulfillmentResult.value.movement.quantityDelta).toBe(-1);
      expect(fulfillmentResult.value.movement.referenceId).toBe(`${commercialSaleId}:line_1`);

      // 3. Verify persisted state in Resources repository
      const updatedItem = await inventoryRepo.findById(drinkId);
      expect(updatedItem?.quantityOnHand.value).toBe(14);
      expect(updatedItem?.movements).toHaveLength(2); // initial + SALE movement

      // 4. Fulfillment Anti-Duplication: Repeating the deduction with identical reference is deduplicated
      const duplicateFulfillment = await decrementPort.sellStock({
        itemId: drinkId,
        quantity: 1,
        referenceId: `${commercialSaleId}:line_1`,
        reason: 'Retried checkout fulfillment',
        actorId: cashierUserId,
        tenantId: defaultTenantId,
      });

      expect(duplicateFulfillment.isSuccess).toBe(true);
      expect(duplicateFulfillment.value.item.quantityOnHand).toBe(14); // Remains 14, NOT 13!
      const itemAfterRetry = await inventoryRepo.findById(drinkId);
      expect(itemAfterRetry?.quantityOnHand.value).toBe(14);
      expect(itemAfterRetry?.movements).toHaveLength(2); // Still 2 movements!
    });
  });

  // ==========================================================================
  // Cross-Cutting IAM & Multi-Tenant Security Boundaries
  // ==========================================================================
  describe('Security & Multi-Tenant Boundary Enforcement', () => {
    it('enforces strict IAM role authorization and cross-tenant resource concealment', async () => {
      const drinkItem = seedDrinkConsumable(10, 6.0);

      // Unauthenticated request -> 401 Unauthorized
      const unauthRes = await request(app.getHttpServer())
        .post('/api/v1/sales')
        .send({
          sourceReference: { type: 'DRINK', referenceId: drinkItem.id.getValue() },
        });
      expect(unauthRes.status).toBe(401);

      // Trainer lacking sales.create -> 403 Forbidden
      const trainerRes = await request(app.getHttpServer())
        .post('/api/v1/sales')
        .set('Authorization', `Bearer ${trainerToken}`)
        .send({
          sourceReference: { type: 'DRINK', referenceId: drinkItem.id.getValue() },
        });
      expect(trainerRes.status).toBe(403);

      // Cross-tenant probe: Competitor manager probes main tenant sale -> 404 Not Found
      const createRes = await request(app.getHttpServer())
        .post('/api/v1/sales')
        .set('Authorization', `Bearer ${managerToken}`)
        .send({
          sourceReference: { type: 'DRINK', referenceId: drinkItem.id.getValue() },
        });
      const saleId = createRes.body.id;

      const crossTenantRes = await request(app.getHttpServer())
        .get(`/api/v1/sales/${saleId}`)
        .set('Authorization', `Bearer ${competitorToken}`);
      expect(crossTenantRes.status).toBe(404);
    });
  });
});
