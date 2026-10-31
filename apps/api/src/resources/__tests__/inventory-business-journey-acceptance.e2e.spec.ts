import { Test, TestingModule } from '@nestjs/testing';
import { Global, INestApplication, Module, HttpStatus } from '@nestjs/common';
import request from 'supertest';
import * as jwt from 'jsonwebtoken';
import {
  InventoryItem,
  InventoryCategory,
  UnitOfMeasure,
  StockMovementType,
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
  IUnitOfWork,
  InventoryStockDecrementPort,
  SellStockHandler,
} from '@kinergy-platform/core';
import {
  InMemoryReceiptSequenceGenerator,
  PrismaInventoryItemRepository,
} from '@kinergy-platform/core/server';
import { JwtTestFactory, DEFAULT_TEST_JWT_SECRET } from '@kinergy-platform/testing';
import { ResourcesModule } from '../resources.module';
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
import { SalesExceptionFilter } from '../../sales/filters/sales-exception.filter';
import { InMemoryInventoryItemRepository } from '../__e2e__/support/in-memory-storage.engine';

// ============================================================================
// Deterministic In-Memory Integration Repositories for Sales Context
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
        (!tenantId || sale.tenantId === tenantId)
      ) {
        return sale;
      }
    }
    return null;
  }

  async find(
    criteria: FindSalesCriteria,
    pagination: FindSalesPagination,
    _sort?: FindSalesSort,
  ): Promise<FindSalesResult> {
    let sales = Array.from(this.store.values());
    if (criteria.tenantId) {
      sales = sales.filter((s) => s.tenantId === criteria.tenantId);
    }
    if (criteria.status) {
      sales = sales.filter((s) => s.status === criteria.status);
    }
    const total = sales.length;
    const page = pagination.page ?? 1;
    const limit = pagination.limit ?? 20;
    const start = (page - 1) * limit;
    const paged = sales.slice(start, start + limit);
    return {
      items: paged.map((s) => SaleMapper.toSummaryDTO(s)),
      total,
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
        if (tenantId && receipt.tenantId !== tenantId) continue;
        return receipt;
      }
    }
    return null;
  }

  async findByReceiptNumber(receiptNumber: ReceiptNumber | string): Promise<Receipt | null> {
    const key = typeof receiptNumber === 'string' ? receiptNumber.trim() : receiptNumber.value;
    for (const receipt of this.store.values()) {
      if (receipt.receiptNumber.value === key) return receipt;
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

// ============================================================================
// Milestone 9.4 — Inventory Business Journey Acceptance Tests
// ============================================================================

describe('Milestone 9.4 — Inventory Business Journey End-to-End Acceptance (Receive Stock → Supported Retail Sale → Verify Stock Movement → Verify Low-Stock Behavior)', () => {
  let app: INestApplication;
  let inventoryRepo: InMemoryInventoryItemRepository;
  let saleRepo: InMemoryIntegrationSaleRepository;
  let paymentRepo: InMemoryIntegrationPaymentRepository;
  let receiptRepo: InMemoryIntegrationReceiptRepository;
  let decrementPort: InventoryStockDecrementPort;

  const TENANT_ID = 'tenant_kinergy_inventory_e2e';
  const KITCHEN_USER_ID = 'usr_kitchen_staff_01';
  const OWNER_USER_ID = 'usr_owner_admin_01';
  const RECEPTIONIST_USER_ID = 'usr_receptionist_01';
  const TRAINER_USER_ID = 'usr_trainer_01';
  const CLIENT_USER_ID = 'usr_client_01';

  let ownerToken: string;
  let kitchenToken: string;
  let receptionistToken: string;
  let trainerToken: string;
  let clientToken: string;

  // Tracked entity IDs across the business journey
  let drinkItemId: string;
  let mealItemId: string;
  let cleaningItemId: string;
  let inactiveItemId: string;
  let completedSaleId: string;

  beforeAll(async () => {
    inventoryRepo = new InMemoryInventoryItemRepository();
    saleRepo = new InMemoryIntegrationSaleRepository();
    paymentRepo = new InMemoryIntegrationPaymentRepository();
    receiptRepo = new InMemoryIntegrationReceiptRepository();
    decrementPort = new SellStockHandler(inventoryRepo);

    // Personas and Permissions
    const ownerPerms = [
      'inventory.read',
      'inventory.write',
      'billing.read',
      'sales.read',
      'sales.create',
      'sales.cancel',
      'payments.create',
      'payments.read',
      'payments.manage',
      'receipts.read',
      'receipts.manage',
    ];

    const kitchenPerms = [
      'kitchen.read',
      'kitchen.orders.manage',
      'inventory.read',
      'inventory.write',
      'sales.read',
      'sales.create',
      'payments.create',
      'receipts.read',
    ];

    const receptionistPerms = [
      'inventory.read',
      'sales.read',
      'sales.create',
      'payments.create',
      'payments.read',
      'receipts.read',
      'receipts.manage',
    ];

    const trainerPerms = ['inventory.read', 'clients.read'];
    const clientPerms: string[] = [];

    const mockUsers = new Map<string, User>([
      [
        OWNER_USER_ID,
        new User({
          id: OWNER_USER_ID,
          email: 'owner@kinergy.test',
          passwordHash: 'hashed',
          status: UserStatus.ACTIVE,
          roles: ['Owner', 'OWNER', 'Admin', 'ADMIN'],
          permissions: ownerPerms,
          tenantId: TENANT_ID,
          tokenVersion: 1,
        }),
      ],
      [
        KITCHEN_USER_ID,
        new User({
          id: KITCHEN_USER_ID,
          email: 'kitchen@kinergy.test',
          passwordHash: 'hashed',
          status: UserStatus.ACTIVE,
          roles: ['Kitchen Staff', 'KITCHEN_STAFF'],
          permissions: kitchenPerms,
          tenantId: TENANT_ID,
          tokenVersion: 1,
        }),
      ],
      [
        RECEPTIONIST_USER_ID,
        new User({
          id: RECEPTIONIST_USER_ID,
          email: 'reception@kinergy.test',
          passwordHash: 'hashed',
          status: UserStatus.ACTIVE,
          roles: ['Receptionist', 'RECEPTIONIST'],
          permissions: receptionistPerms,
          tenantId: TENANT_ID,
          tokenVersion: 1,
        }),
      ],
      [
        TRAINER_USER_ID,
        new User({
          id: TRAINER_USER_ID,
          email: 'trainer@kinergy.test',
          passwordHash: 'hashed',
          status: UserStatus.ACTIVE,
          roles: ['Trainer', 'TRAINER'],
          permissions: trainerPerms,
          tenantId: TENANT_ID,
          tokenVersion: 1,
        }),
      ],
      [
        CLIENT_USER_ID,
        new User({
          id: CLIENT_USER_ID,
          email: 'client@kinergy.test',
          passwordHash: 'hashed',
          status: UserStatus.ACTIVE,
          roles: ['Client', 'CLIENT'],
          permissions: clientPerms,
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
      userId: OWNER_USER_ID,
      email: 'owner@kinergy.test',
      roles: ['Owner', 'OWNER', 'Admin', 'ADMIN'],
      permissions: ownerPerms,
      tenantId: TENANT_ID,
      tokenVersion: 1,
    });

    kitchenToken = await mockAccessTokenService.generateToken({
      userId: KITCHEN_USER_ID,
      email: 'kitchen@kinergy.test',
      roles: ['Kitchen Staff', 'KITCHEN_STAFF'],
      permissions: kitchenPerms,
      tenantId: TENANT_ID,
      tokenVersion: 1,
    });

    receptionistToken = await mockAccessTokenService.generateToken({
      userId: RECEPTIONIST_USER_ID,
      email: 'reception@kinergy.test',
      roles: ['Receptionist', 'RECEPTIONIST'],
      permissions: receptionistPerms,
      tenantId: TENANT_ID,
      tokenVersion: 1,
    });

    trainerToken = await mockAccessTokenService.generateToken({
      userId: TRAINER_USER_ID,
      email: 'trainer@kinergy.test',
      roles: ['Trainer', 'TRAINER'],
      permissions: trainerPerms,
      tenantId: TENANT_ID,
      tokenVersion: 1,
    });

    clientToken = await mockAccessTokenService.generateToken({
      userId: CLIENT_USER_ID,
      email: 'client@kinergy.test',
      roles: ['Client', 'CLIENT'],
      permissions: clientPerms,
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
      imports: [TestGlobalPlatformModule, ResourcesModule, SalesModule],
    })
      // Resources Module overrides
      .overrideProvider(PrismaInventoryItemRepository)
      .useValue(inventoryRepo)
      // Sales Module overrides
      .overrideProvider(SALE_REPOSITORY_TOKEN)
      .useValue(saleRepo)
      .overrideProvider(PAYMENT_REPOSITORY_TOKEN)
      .useValue(paymentRepo)
      .overrideProvider(RECEIPT_REPOSITORY_TOKEN)
      .useValue(receiptRepo)
      .overrideProvider(UNIT_OF_WORK_TOKEN)
      .useValue(mockUnitOfWork)
      .compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api/v1', {
      exclude: ['api/v1/(.*)', 'api/v1'],
    });
    app.useGlobalPipes(
      new GlobalSanitizationValidationPipe({
        transform: true,
        whitelist: true,
        forbidNonWhitelisted: true,
      }),
    );
    app.useGlobalFilters(new GlobalExceptionFilter(), new SalesExceptionFilter());
    await app.init();
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  // ==========================================================================
  // STEP 1: CATALOG TAXONOMY SETUP & INITIAL STATE
  // ==========================================================================
  describe('Step 1: Inventory Catalog Taxonomy & Baseline Verification', () => {
    it('seeds and verifies retail-eligible consumable products alongside non-retail supplies', async () => {
      // 1. Retail-Eligible Drink (HEALTHY_DRINKS) with 0 initial stock and threshold = 5
      const drinkItem = InventoryItem.create({
        sku: 'DRK-ELECTRO-500',
        name: 'Electrolyte Hydration Drink 500ml',
        description: 'Zero-sugar functional electrolyte replenishment beverage',
        category: InventoryCategory.HEALTHY_DRINKS,
        unit: UnitOfMeasure.BOTTLES,
        initialStock: 0,
        minimumStock: 5,
        purchaseCost: { amount: 1.5, currency: 'USD' },
        sellingPrice: { amount: 4.5, currency: 'USD' },
        recordedByUserId: OWNER_USER_ID,
        tenantId: TENANT_ID,
      });
      inventoryRepo.seed(drinkItem);
      drinkItemId = drinkItem.id.getValue();

      // 2. Retail-Eligible Meal/Snack (HEALTHY_MEALS) with 0 initial stock and threshold = 10
      const mealItem = InventoryItem.create({
        sku: 'BAR-PROT-CHOC',
        name: 'Artisan Chocolate Protein Bar 60g',
        description: 'Cold-pressed high-protein plant-based snack',
        category: InventoryCategory.HEALTHY_MEALS,
        unit: UnitOfMeasure.UNITS,
        initialStock: 0,
        minimumStock: 10,
        purchaseCost: { amount: 1.0, currency: 'USD' },
        sellingPrice: { amount: 3.0, currency: 'USD' },
        recordedByUserId: OWNER_USER_ID,
        tenantId: TENANT_ID,
      });
      inventoryRepo.seed(mealItem);
      mealItemId = mealItem.id.getValue();

      // 3. Non-Retail Consumable Supply (CLEANING_SUPPLIES) - strictly NOT saleable at retail
      const cleaningItem = InventoryItem.create({
        sku: 'CLN-DISINF-1L',
        name: 'Hospital-Grade Sanitizing Surface Spray 1L',
        description: 'Facility hygiene disinfectant',
        category: InventoryCategory.CLEANING_SUPPLIES,
        unit: UnitOfMeasure.BOTTLES,
        initialStock: 10,
        minimumStock: 3,
        purchaseCost: { amount: 8.0, currency: 'USD' },
        sellingPrice: { amount: 15.0, currency: 'USD' },
        recordedByUserId: OWNER_USER_ID,
        tenantId: TENANT_ID,
      });
      inventoryRepo.seed(cleaningItem);
      cleaningItemId = cleaningItem.id.getValue();

      // 4. Inactive Consumable Product (INACTIVE status)
      const inactiveItem = InventoryItem.create({
        sku: 'DRK-SMOOTHIE-SEA',
        name: 'Seasonal Berry Smoothie (Discontinued)',
        description: 'Past season smoothie recipe',
        category: InventoryCategory.HEALTHY_DRINKS,
        unit: UnitOfMeasure.BOTTLES,
        initialStock: 5,
        minimumStock: 2,
        purchaseCost: { amount: 2.0, currency: 'USD' },
        sellingPrice: { amount: 5.0, currency: 'USD' },
        recordedByUserId: OWNER_USER_ID,
        tenantId: TENANT_ID,
      });
      inactiveItem.deactivate(OWNER_USER_ID, 'End of season run');
      inventoryRepo.seed(inactiveItem);
      inactiveItemId = inactiveItem.id.getValue();

      // Baseline assertions via API
      const getDrinkRes = await request(app.getHttpServer())
        .get(`/api/v1/resources/inventory/${drinkItemId}`)
        .set('Authorization', `Bearer ${kitchenToken}`)
        .expect(200);

      expect(getDrinkRes.body.id).toBe(drinkItemId);
      expect(getDrinkRes.body.sku).toBe('DRK-ELECTRO-500');
      expect(getDrinkRes.body.quantityOnHand).toBe(0);
      expect(getDrinkRes.body.minimumStock).toBe(5);
      expect(getDrinkRes.body.sellingPriceAmount).toBe(4.5);
      expect(getDrinkRes.body.status).toBe('ACTIVE');

      // Verify that initial 0 stock triggers low-stock indicator (0 <= 5)
      const drinkStockLevelRes = await request(app.getHttpServer())
        .get(`/api/v1/resources/inventory/${drinkItemId}/stock-level`)
        .set('Authorization', `Bearer ${kitchenToken}`)
        .expect(200);

      expect(drinkStockLevelRes.body.isLowStock).toBe(true);
      expect(drinkStockLevelRes.body.quantityOnHand).toBe(0);

      // Verify Owner with billing.read permission can query baseline inventory valuation
      const valuationRes = await request(app.getHttpServer())
        .get('/api/v1/resources/inventory/valuation')
        .set('Authorization', `Bearer ${ownerToken}`)
        .expect(200);

      expect(valuationRes.body.totalDistinctItems).toBeGreaterThanOrEqual(1);
    });
  });

  // ==========================================================================
  // STEP 2: VALIDATE STOCK RECEIVING
  // ==========================================================================
  describe('Step 2: Validate Stock Receiving Workflow & State Persistence', () => {
    it('rejects stock receiving with invalid quantities, non-existent items, and unprivileged roles', async () => {
      // 1. Rejects zero quantity
      await request(app.getHttpServer())
        .post(`/api/v1/resources/inventory/${drinkItemId}/receive`)
        .set('Authorization', `Bearer ${kitchenToken}`)
        .send({
          quantity: 0,
          notes: 'Invalid zero batch',
        })
        .expect(HttpStatus.BAD_REQUEST);

      // 2. Rejects negative quantity
      await request(app.getHttpServer())
        .post(`/api/v1/resources/inventory/${drinkItemId}/receive`)
        .set('Authorization', `Bearer ${kitchenToken}`)
        .send({
          quantity: -10,
          notes: 'Negative quantity attempt',
        })
        .expect(HttpStatus.BAD_REQUEST);

      // 3. Rejects non-existent item ID
      await request(app.getHttpServer())
        .post('/api/v1/resources/inventory/item_non_existent_404/receive')
        .set('Authorization', `Bearer ${kitchenToken}`)
        .send({
          quantity: 15,
          notes: 'Ghost item delivery',
        })
        .expect(HttpStatus.NOT_FOUND);

      // 4. Denies unprivileged role lacking inventory.write (Trainer) -> 403 Forbidden
      await request(app.getHttpServer())
        .post(`/api/v1/resources/inventory/${drinkItemId}/receive`)
        .set('Authorization', `Bearer ${trainerToken}`)
        .send({
          quantity: 15,
          notes: 'Trainer attempt to receive stock',
        })
        .expect(HttpStatus.FORBIDDEN);

      // 5. Denies unauthenticated caller -> 401 Unauthorized
      await request(app.getHttpServer())
        .post(`/api/v1/resources/inventory/${drinkItemId}/receive`)
        .send({
          quantity: 15,
          notes: 'Anonymous delivery',
        })
        .expect(HttpStatus.UNAUTHORIZED);
    });

    it('receives stock legitimately through supported workflow, updates on-hand balance, and records PURCHASE ledger', async () => {
      // Receive 15 units of Electrolyte Drink by Kitchen Staff
      const receiveDrinkRes = await request(app.getHttpServer())
        .post(`/api/v1/resources/inventory/${drinkItemId}/receive`)
        .set('Authorization', `Bearer ${kitchenToken}`)
        .send({
          quantity: 15,
          unitCost: 1.5,
          notes: 'Vendor delivery batch PO-2026-001',
          referenceNumber: 'PO-2026-001',
        })
        .expect(200);

      expect(receiveDrinkRes.body.item.id).toBe(drinkItemId);
      expect(receiveDrinkRes.body.item.quantityOnHand).toBe(15);
      expect(receiveDrinkRes.body.movement.movementType).toBe('PURCHASE');
      expect(receiveDrinkRes.body.movement.referenceId).toBe('PO-2026-001');

      // Receive 20 units of Protein Energy Bar by Kitchen Staff
      const receiveMealRes = await request(app.getHttpServer())
        .post(`/api/v1/resources/inventory/${mealItemId}/receive`)
        .set('Authorization', `Bearer ${kitchenToken}`)
        .send({
          quantity: 20,
          unitCost: 1.0,
          notes: 'Vendor delivery batch PO-2026-002',
          referenceNumber: 'PO-2026-002',
        })
        .expect(200);

      expect(receiveMealRes.body.item.quantityOnHand).toBe(20);

      // Verify persistence via GET /inventory/:id
      const verifyDrinkRes = await request(app.getHttpServer())
        .get(`/api/v1/resources/inventory/${drinkItemId}`)
        .set('Authorization', `Bearer ${kitchenToken}`)
        .expect(200);

      expect(verifyDrinkRes.body.quantityOnHand).toBe(15);

      // Verify stock movement ledger via GET /inventory/:id/movements
      const movementsRes = await request(app.getHttpServer())
        .get(`/api/v1/resources/inventory/${drinkItemId}/movements`)
        .set('Authorization', `Bearer ${kitchenToken}`)
        .expect(200);

      expect(movementsRes.body.items).toHaveLength(1);
      expect(movementsRes.body.items[0].movementType).toBe('PURCHASE');
      expect(movementsRes.body.items[0].quantityDelta).toBe(15);
      expect(movementsRes.body.items[0].recordedByUserId).toBe(KITCHEN_USER_ID);
      expect(movementsRes.body.items[0].referenceId).toBe('PO-2026-001');

      // Verify stock level query reflects transition OUT of low stock (15 > 5)
      const stockLevelRes = await request(app.getHttpServer())
        .get(`/api/v1/resources/inventory/${drinkItemId}/stock-level`)
        .set('Authorization', `Bearer ${kitchenToken}`)
        .expect(200);

      expect(stockLevelRes.body.quantityOnHand).toBe(15);
      expect(stockLevelRes.body.isLowStock).toBe(false);

      // Verify item is NOT in low-stock query
      const lowStockRes = await request(app.getHttpServer())
        .get('/api/v1/resources/inventory/low-stock')
        .set('Authorization', `Bearer ${kitchenToken}`)
        .expect(200);

      const isDrinkInLowStock = lowStockRes.body.items.some(
        (i: { id: string }) => i.id === drinkItemId,
      );
      expect(isDrinkInLowStock).toBe(false);
    });
  });

  // ==========================================================================
  // STEP 3: VALIDATE RETAIL SALE ELIGIBILITY & COMMERCIAL CHECKOUT
  // ==========================================================================
  describe('Step 3: Validate Retail Sale Eligibility & Unified Commercial Checkout', () => {
    it('strictly rejects non-retail supplies, inactive items, and overselling at checkout boundary', async () => {
      // 1. Ineligible category: CLEANING_SUPPLIES rejected by ResourcesSourceValidatorAdapter
      const ineligibleRes = await request(app.getHttpServer())
        .post('/api/v1/sales')
        .set('Authorization', `Bearer ${receptionistToken}`)
        .send({
          currency: 'USD',
          sourceReference: {
            type: 'DRINK',
            referenceId: cleaningItemId,
          },
        })
        .expect(HttpStatus.BAD_REQUEST);

      expect(ineligibleRes.body.message).toContain('not eligible for retail sale');

      // 2. Inactive item rejected: Only ACTIVE items can be sold
      const inactiveRes = await request(app.getHttpServer())
        .post('/api/v1/sales')
        .set('Authorization', `Bearer ${receptionistToken}`)
        .send({
          currency: 'USD',
          sourceReference: {
            type: 'DRINK',
            referenceId: inactiveItemId,
          },
        })
        .expect(HttpStatus.BAD_REQUEST);

      expect(inactiveRes.body.message).toContain('Only ACTIVE items can be sold');

      // 3. Overselling rejected: Zero stock item checkout rejected
      const outOfStockItem = InventoryItem.create({
        sku: 'DRK-OUT-OF-STOCK',
        name: 'Depleted Electrolyte Drink',
        category: InventoryCategory.HEALTHY_DRINKS,
        unit: UnitOfMeasure.BOTTLES,
        initialStock: 0,
        minimumStock: 5,
        purchaseCost: { amount: 1.0, currency: 'USD' },
        sellingPrice: { amount: 4.5, currency: 'USD' },
        recordedByUserId: OWNER_USER_ID,
        tenantId: TENANT_ID,
      });
      inventoryRepo.seed(outOfStockItem);

      const oversellRes = await request(app.getHttpServer())
        .post('/api/v1/sales')
        .set('Authorization', `Bearer ${receptionistToken}`)
        .send({
          currency: 'USD',
          sourceReference: {
            type: 'DRINK',
            referenceId: outOfStockItem.id.getValue(),
          },
        })
        .expect(HttpStatus.BAD_REQUEST);

      expect(oversellRes.body.message).toContain('Insufficient stock');
    });

    it('creates unified commercial sale, snapshots authoritative catalog price, finalizes, and collects cash settlement', async () => {
      completedSaleId = 'sale_pos_retail_drink_001';

      // 1. Create Sale for 1 unit of Electrolyte Drink at $4.50 retail
      const createSaleRes = await request(app.getHttpServer())
        .post('/api/v1/sales')
        .set('Authorization', `Bearer ${receptionistToken}`)
        .send({
          id: completedSaleId,
          currency: 'USD',
          sourceReference: {
            type: 'DRINK',
            referenceId: drinkItemId,
            referenceCode: 'DRK-ELECTRO-500',
          },
        })
        .expect(201);

      expect(createSaleRes.body.id).toBe(completedSaleId);
      expect(createSaleRes.body.status).toBe('DRAFT');
      expect(createSaleRes.body.items).toHaveLength(1);
      expect(createSaleRes.body.items[0].description).toBe('Electrolyte Hydration Drink 500ml');
      expect(createSaleRes.body.items[0].unitPriceAmount).toBe(4.5);
      expect(createSaleRes.body.items[0].quantity).toBe(1);
      expect(createSaleRes.body.totalAmount).toBe(4.5);
      expect(createSaleRes.body.total.cents).toBe(450);

      // 2. Finalize Sale -> Transitions to PENDING_PAYMENT
      const finalizeRes = await request(app.getHttpServer())
        .post(`/api/v1/sales/${completedSaleId}/finalize`)
        .set('Authorization', `Bearer ${receptionistToken}`)
        .send()
        .expect(200);

      expect(finalizeRes.body.status).toBe('PENDING_PAYMENT');
      expect(finalizeRes.body.totalAmount).toBe(4.5);

      // 3. Tendering CASH Payment for full amount
      const paymentRes = await request(app.getHttpServer())
        .post(`/api/v1/sales/${completedSaleId}/payments`)
        .set('Authorization', `Bearer ${receptionistToken}`)
        .send({
          method: 'CASH',
          amount: 4.5,
          currency: 'USD',
          status: 'COMPLETED',
          reference: 'POS-CASH-REG-01',
        })
        .expect(201);

      expect(paymentRes.body.saleId).toBe(completedSaleId);
      expect(paymentRes.body.method).toBe('CASH');
      expect(paymentRes.body.status).toBe('COMPLETED');
      expect(paymentRes.body.amountValue).toBe(4.5);

      // 4. Verify Sale transitioned to PAID
      const getSaleRes = await request(app.getHttpServer())
        .get(`/api/v1/sales/${completedSaleId}`)
        .set('Authorization', `Bearer ${receptionistToken}`)
        .expect(200);

      expect(getSaleRes.body.status).toBe('PAID');

      // 5. Issue Proof-of-Purchase Receipt
      const receiptRes = await request(app.getHttpServer())
        .post(`/api/v1/sales/${completedSaleId}/receipt`)
        .set('Authorization', `Bearer ${receptionistToken}`)
        .send()
        .expect(201);

      expect(receiptRes.body.status).toBe('ISSUED');
      expect(receiptRes.body.paymentMethod).toBe('CASH');
      expect(receiptRes.body.total.amount).toBe(4.5);
      expect(receiptRes.body.receiptNumber).toMatch(/^REC-\d{4}-\d{6}$/);

      // 6. CRITICAL ARCHITECTURAL ASSERTION (ADR-0106 & ADR-0112):
      // Commercial checkout NEVER mutates physical inventory tables directly.
      // Stock on hand in Resources remains 15 until explicit fulfillment execution!
      const unmutatedItem = await inventoryRepo.findById(drinkItemId);
      expect(unmutatedItem).not.toBeNull();
      expect(unmutatedItem!.quantityOnHand.value).toBe(15);
      expect(unmutatedItem!.movements).toHaveLength(1); // Only initial PURCHASE movement
    });
  });

  // ==========================================================================
  // STEP 4: VERIFY STOCK EFFECTS & OWNER-CONTROLLED FULFILLMENT
  // ==========================================================================
  describe('Step 4: Verify Stock Decrement & Movement Ledger Fulfillment', () => {
    it('executes stock deduction via InventoryStockDecrementPort and verifies append-only SALE movement and idempotency', async () => {
      // 1. Outbound capability port execution (Owner-Controlled Fulfillment)
      const fulfillmentResult = await decrementPort.sellStock({
        itemId: drinkItemId,
        quantity: 12,
        referenceId: `${completedSaleId}:line_1`,
        reason: 'Retail point-of-sale checkout fulfillment',
        actorId: KITCHEN_USER_ID,
        tenantId: TENANT_ID,
        sellingPrice: { amount: 4.5, currency: 'USD' },
      });

      expect(fulfillmentResult.isSuccess).toBe(true);
      expect(fulfillmentResult.value.item.quantityOnHand).toBe(3); // 15 - 12 = 3
      expect(fulfillmentResult.value.movement.movementType).toBe(StockMovementType.SALE);
      expect(fulfillmentResult.value.movement.quantityDelta).toBe(-12);
      expect(fulfillmentResult.value.movement.referenceId).toBe(`${completedSaleId}:line_1`);

      // 2. Verify persisted stock level via API
      const stockLevelRes = await request(app.getHttpServer())
        .get(`/api/v1/resources/inventory/${drinkItemId}/stock-level`)
        .set('Authorization', `Bearer ${kitchenToken}`)
        .expect(200);

      expect(stockLevelRes.body.quantityOnHand).toBe(3);

      // 3. Verify movements ledger has both PURCHASE and SALE
      const movementsRes = await request(app.getHttpServer())
        .get(`/api/v1/resources/inventory/${drinkItemId}/movements`)
        .set('Authorization', `Bearer ${kitchenToken}`)
        .expect(200);

      expect(movementsRes.body.items).toHaveLength(2);
      const saleMovement = movementsRes.body.items.find(
        (m: { movementType: string }) => m.movementType === 'SALE',
      );
      expect(saleMovement).toBeDefined();
      expect(saleMovement.quantityDelta).toBe(-12);
      expect(saleMovement.referenceId).toBe(`${completedSaleId}:line_1`);

      // 4. Fulfillment Anti-Duplication (Idempotency):
      // Re-invoking the fulfillment with the identical referenceId is a no-op that returns existing movement
      const retryResult = await decrementPort.sellStock({
        itemId: drinkItemId,
        quantity: 12,
        referenceId: `${completedSaleId}:line_1`,
        reason: 'Network retry checkout fulfillment',
        actorId: KITCHEN_USER_ID,
        tenantId: TENANT_ID,
      });

      expect(retryResult.isSuccess).toBe(true);
      expect(retryResult.value.item.quantityOnHand).toBe(3); // Remains 3, DOES NOT DOUBLE DECREMENT!

      const recheckedItem = await inventoryRepo.findById(drinkItemId);
      expect(recheckedItem!.quantityOnHand.value).toBe(3);
      expect(recheckedItem!.movements).toHaveLength(2); // Still exactly 2 movements!
    });
  });

  // ==========================================================================
  // STEP 5: VERIFY LOW-STOCK BEHAVIOR & BOUNDARY CONDITIONS
  // ==========================================================================
  describe('Step 5: Verify Low-Stock Threshold Triggers & Boundary Conditions', () => {
    it('verifies low-stock trigger (quantityOnHand <= minimumStock) and exact boundary transitions', async () => {
      // Current state: drinkItemId has quantityOnHand = 3, minimumStock = 5.
      // Invariant: 3 <= 5 -> LOW STOCK ACTIVE!
      const lowStockCheck1 = await request(app.getHttpServer())
        .get(`/api/v1/resources/inventory/${drinkItemId}/stock-level`)
        .set('Authorization', `Bearer ${kitchenToken}`)
        .expect(200);

      expect(lowStockCheck1.body.quantityOnHand).toBe(3);
      expect(lowStockCheck1.body.minimumStock).toBe(5);
      expect(lowStockCheck1.body.isLowStock).toBe(true);

      // Check low-stock list includes the item
      const lowStockList1 = await request(app.getHttpServer())
        .get('/api/v1/resources/inventory/low-stock')
        .set('Authorization', `Bearer ${kitchenToken}`)
        .expect(200);

      const foundInList1 = lowStockList1.body.items.some(
        (i: { id: string }) => i.id === drinkItemId,
      );
      expect(foundInList1).toBe(true);

      // ----------------------------------------------------------------------
      // Boundary Test: Receive 2 units -> 3 + 2 = 5 (EXACT EQUALITY: Q == minStock)
      // Contract: quantityOnHand <= minimumStock is INCLUSIVE!
      // Therefore, 5 <= 5 MUST STILL BE CONSIDERED LOW STOCK!
      // ----------------------------------------------------------------------
      await request(app.getHttpServer())
        .post(`/api/v1/resources/inventory/${drinkItemId}/receive`)
        .set('Authorization', `Bearer ${kitchenToken}`)
        .send({
          quantity: 2,
          notes: 'Restocking boundary test (bringing to exactly minStock)',
        })
        .expect(200);

      const boundaryCheck = await request(app.getHttpServer())
        .get(`/api/v1/resources/inventory/${drinkItemId}/stock-level`)
        .set('Authorization', `Bearer ${kitchenToken}`)
        .expect(200);

      expect(boundaryCheck.body.quantityOnHand).toBe(5);
      expect(boundaryCheck.body.minimumStock).toBe(5);
      expect(boundaryCheck.body.isLowStock).toBe(true); // INCLUSIVE BOUNDARY: Still low stock!

      // ----------------------------------------------------------------------
      // Transition Out: Receive 1 more unit -> 5 + 1 = 6 (Q > minStock)
      // Contract: 6 > 5 -> TRANSITIONS OUT OF LOW STOCK!
      // ----------------------------------------------------------------------
      await request(app.getHttpServer())
        .post(`/api/v1/resources/inventory/${drinkItemId}/receive`)
        .set('Authorization', `Bearer ${kitchenToken}`)
        .send({
          quantity: 1,
          notes: 'Surpassing threshold (bringing above minStock)',
        })
        .expect(200);

      const resolvedCheck = await request(app.getHttpServer())
        .get(`/api/v1/resources/inventory/${drinkItemId}/stock-level`)
        .set('Authorization', `Bearer ${kitchenToken}`)
        .expect(200);

      expect(resolvedCheck.body.quantityOnHand).toBe(6);
      expect(resolvedCheck.body.isLowStock).toBe(false); // Above threshold!

      // Item should now disappear from low-stock query
      const lowStockList2 = await request(app.getHttpServer())
        .get('/api/v1/resources/inventory/low-stock')
        .set('Authorization', `Bearer ${kitchenToken}`)
        .expect(200);

      const foundInList2 = lowStockList2.body.items.some(
        (i: { id: string }) => i.id === drinkItemId,
      );
      expect(foundInList2).toBe(false);
    });
  });

  // ==========================================================================
  // STEP 6: NEGATIVE SCENARIOS, CONCURRENCY & RBAC SECURITY
  // ==========================================================================
  describe('Step 6: Negative Scenarios, Invariant Protection & RBAC Enforcement', () => {
    it('enforces non-negative stock invariant on HTTP sell endpoint', async () => {
      // Current stock is 6. Attempting to sell 10 units via HTTP API
      const oversellHttpRes = await request(app.getHttpServer())
        .post(`/api/v1/resources/inventory/${drinkItemId}/sell`)
        .set('Authorization', `Bearer ${kitchenToken}`)
        .send({
          quantity: 10,
          notes: 'Excessive direct sale attempt',
        })
        .expect(HttpStatus.BAD_REQUEST);

      expect(oversellHttpRes.body.message).toContain('Insufficient stock');

      // Verify stock remained 6
      const item = await inventoryRepo.findById(drinkItemId);
      expect(item!.quantityOnHand.value).toBe(6);
    });

    it('enforces RBAC permissions across Resources and Sales boundaries', async () => {
      // 1. Receptionist has inventory.read but lacks inventory.write -> 403 on receiveStock
      await request(app.getHttpServer())
        .post(`/api/v1/resources/inventory/${drinkItemId}/receive`)
        .set('Authorization', `Bearer ${receptionistToken}`)
        .send({
          quantity: 5,
          notes: 'Unauthorized stock reception',
        })
        .expect(HttpStatus.FORBIDDEN);

      // 2. Trainer lacks inventory.write -> 403 on sellStock
      await request(app.getHttpServer())
        .post(`/api/v1/resources/inventory/${drinkItemId}/sell`)
        .set('Authorization', `Bearer ${trainerToken}`)
        .send({
          quantity: 1,
          notes: 'Unauthorized sale',
        })
        .expect(HttpStatus.FORBIDDEN);

      // 3. Client lacks all inventory permissions -> 403 on GET /inventory
      await request(app.getHttpServer())
        .get('/api/v1/resources/inventory')
        .set('Authorization', `Bearer ${clientToken}`)
        .expect(HttpStatus.FORBIDDEN);

      // 4. Unauthenticated request -> 401
      await request(app.getHttpServer())
        .get(`/api/v1/resources/inventory/${drinkItemId}`)
        .expect(HttpStatus.UNAUTHORIZED);
    });
  });

  // ==========================================================================
  // STEP 7: PERSISTED STATE INTEGRITY VERIFICATION
  // ==========================================================================
  describe('Step 7: Cross-Domain Persisted State Consistency Verification', () => {
    it('maintains referential and mathematical consistency across Inventory, Sales, Payment, and Receipt stores', async () => {
      // 1. Inventory Item Store
      const persistedDrink = await inventoryRepo.findById(drinkItemId);
      expect(persistedDrink).not.toBeNull();
      expect(persistedDrink!.quantityOnHand.value).toBe(6);
      // Movements:
      // 1. Initial Receive 15
      // 2. Fulfill Sale -12
      // 3. Receive 2
      // 4. Receive 1
      expect(persistedDrink!.movements).toHaveLength(4);

      // 2. Sales Order Store
      const persistedSale = await saleRepo.findById(completedSaleId);
      expect(persistedSale).not.toBeNull();
      expect(persistedSale!.status).toBe('PAID');
      expect(persistedSale!.source.sourceType).toBe('DRINK');
      expect(persistedSale!.source.sourceId).toBe(drinkItemId);
      expect(persistedSale!.total.amount).toBe(4.5);

      // 3. Payment Store
      const persistedPayments = await paymentRepo.findBySaleId(completedSaleId);
      expect(persistedPayments).toHaveLength(1);
      expect(persistedPayments[0]!.method).toBe(PaymentMethod.CASH);
      expect(persistedPayments[0]!.status).toBe(PaymentStatus.COMPLETED);
      expect(persistedPayments[0]!.amount.amount).toBe(4.5);

      // 4. Receipt Store
      const persistedReceipt = await receiptRepo.findBySaleId(completedSaleId);
      expect(persistedReceipt).not.toBeNull();
      expect(persistedReceipt!.status).toBe(ReceiptStatus.ISSUED);
      expect(persistedReceipt!.total.amount).toBe(4.5);
      expect(persistedReceipt!.saleId.value).toBe(completedSaleId);
    });
  });
});
