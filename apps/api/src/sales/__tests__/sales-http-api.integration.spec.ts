import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import * as jwt from 'jsonwebtoken';
import {
  Sale,
  Money,
  SaleId,
  SaleSource,
  SaleSourceType,
  SaleRepositoryPort,
  SaleRepositoryInterface,
  FindSalesCriteria,
  FindSalesPagination,
  FindSalesSort,
  FindSalesResult,
  SaleMapper,
  CreateSaleHandler,
  GetSaleByIdHandler,
  AddSaleItemHandler,
  RemoveSaleItemHandler,
  ApplyOrderDiscountHandler,
  RemoveOrderDiscountHandler,
  FinalizeSaleHandler,
  CancelSaleHandler,
  AssignSaleSourceHandler,
  CalculateSaleHandler,
  ListSalesHandler,
} from '@kinergy-platform/core';
import { SalesController, SALE_REPOSITORY_TOKEN } from '../controllers/sales.controller';
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

/**
 * Deterministic In-Memory Integration Repository for Sales HTTP testing.
 * Tracks save calls and verifies transactional state persistence without database side-effects.
 */
class InMemoryIntegrationSaleRepository implements SaleRepositoryPort, SaleRepositoryInterface {
  public store = new Map<string, Sale>();
  public saveCount = 0;
  public lastSavedSale: Sale | null = null;

  async findById(id: SaleId | string): Promise<Sale | null> {
    const key = typeof id === 'string' ? id.trim() : id.value;
    return this.store.get(key) ?? null;
  }

  async save(sale: Sale): Promise<void> {
    this.saveCount++;
    this.lastSavedSale = sale;
    this.store.set(sale.id.value, sale);
  }

  async findMany(
    criteria: FindSalesCriteria,
    pagination: FindSalesPagination,
    sort: FindSalesSort,
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
    if (criteria.sourceType) {
      sales = sales.filter((s) => s.source.sourceType === criteria.sourceType);
    }
    if (criteria.sourceReferenceId) {
      sales = sales.filter((s) => s.source.sourceId === criteria.sourceReferenceId);
    }
    if (criteria.fromDate) {
      const fromTime = new Date(criteria.fromDate).getTime();
      sales = sales.filter((s) => s.createdAt.getTime() >= fromTime);
    }
    if (criteria.toDate) {
      const toTime = new Date(criteria.toDate).getTime();
      sales = sales.filter((s) => s.createdAt.getTime() <= toTime);
    }
    if (criteria.search) {
      const q = criteria.search.toLowerCase();
      sales = sales.filter(
        (s) =>
          s.id.value.toLowerCase().includes(q) ||
          s.source.sourceId.toLowerCase().includes(q) ||
          (s.source.sourceCode && s.source.sourceCode.toLowerCase().includes(q)) ||
          s.items.some((i) => i.description.toLowerCase().includes(q)),
      );
    }

    // Deterministic sorting
    sales.sort((a, b) => {
      let comparison: number;
      if (sort.field === 'total') {
        comparison = a.total.amount - b.total.amount;
      } else if (sort.field === 'status') {
        comparison = a.status.localeCompare(b.status);
      } else {
        // default createdAt
        comparison = a.createdAt.getTime() - b.createdAt.getTime();
      }
      if (comparison === 0) {
        comparison = a.id.value.localeCompare(b.id.value); // Stable tie-breaker
      }
      return sort.direction === 'desc' ? -comparison : comparison;
    });

    const total = sales.length;
    const skip = (pagination.page - 1) * pagination.limit;
    const paginated = sales.slice(skip, skip + pagination.limit);
    const items = paginated.map((s) => SaleMapper.toSummaryDTO(s));

    return { items, total };
  }

  clear(): void {
    this.store.clear();
    this.saveCount = 0;
    this.lastSavedSale = null;
  }
}

describe('Sales HTTP API Complete Integration Test Suite (Milestone 7.14)', () => {
  let app: INestApplication;
  let saleRepo: InMemoryIntegrationSaleRepository;
  const userStore = new Map<string, User>();

  // Personas matching Kinergy IAM specs
  const ownerUser = new User({
    id: 'usr_owner_int',
    email: 'owner@kinergy.platform',
    passwordHash: 'dummy_hash',
    status: UserStatus.ACTIVE,
    roles: ['Owner'],
    permissions: ['*'],
    tenantId: 'tenant_kinergy_main',
    tokenVersion: 1,
  });

  const managerUser = new User({
    id: 'usr_manager_int',
    email: 'manager@kinergy.platform',
    passwordHash: 'dummy_hash',
    status: UserStatus.ACTIVE,
    roles: ['Manager'],
    permissions: ['sales.manage', 'sales.create', 'sales.read', 'sales.cancel'],
    tenantId: 'tenant_kinergy_main',
    tokenVersion: 1,
  });

  const receptionistUser = new User({
    id: 'usr_recept_int',
    email: 'receptionist@kinergy.platform',
    passwordHash: 'dummy_hash',
    status: UserStatus.ACTIVE,
    roles: ['Receptionist'],
    permissions: ['sales.create', 'sales.read', 'sales.cancel'],
    tenantId: 'tenant_kinergy_main',
    tokenVersion: 1,
  });

  const kitchenStaffUser = new User({
    id: 'usr_kitchen_int',
    email: 'kitchen@kinergy.platform',
    passwordHash: 'dummy_hash',
    status: UserStatus.ACTIVE,
    roles: ['Kitchen Staff'],
    permissions: ['sales.create', 'sales.read'], // No sales.cancel
    tenantId: 'tenant_kinergy_main',
    tokenVersion: 1,
  });

  const trainerUser = new User({
    id: 'usr_trainer_int',
    email: 'trainer@kinergy.platform',
    passwordHash: 'dummy_hash',
    status: UserStatus.ACTIVE,
    roles: ['Trainer'],
    permissions: ['sales.read'], // Read-only
    tenantId: 'tenant_kinergy_main',
    tokenVersion: 1,
  });

  const clientUser = new User({
    id: 'usr_client_vip',
    email: 'vip.client@example.com',
    passwordHash: 'dummy_hash',
    status: UserStatus.ACTIVE,
    roles: ['Client'],
    permissions: ['sales.read'],
    tenantId: 'tenant_kinergy_main',
    tokenVersion: 1,
  });

  const competitorManagerUser = new User({
    id: 'usr_rival_mgr',
    email: 'rival@competitor.com',
    passwordHash: 'dummy_hash',
    status: UserStatus.ACTIVE,
    roles: ['Manager'],
    permissions: ['sales.manage'],
    tenantId: 'tenant_competitor',
    tokenVersion: 1,
  });

  const disabledUser = new User({
    id: 'usr_disabled_int',
    email: 'disabled@kinergy.platform',
    passwordHash: 'dummy_hash',
    status: UserStatus.INACTIVE,
    roles: ['Manager'],
    permissions: ['sales.manage'],
    tenantId: 'tenant_kinergy_main',
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
  let disabledToken: string;

  beforeAll(async () => {
    // Populate user store
    [
      ownerUser,
      managerUser,
      receptionistUser,
      kitchenStaffUser,
      trainerUser,
      clientUser,
      competitorManagerUser,
      disabledUser,
    ].forEach((u) => userStore.set(u.id, u));

    ownerToken = createTokenForUser(ownerUser);
    managerToken = createTokenForUser(managerUser);
    receptionistToken = createTokenForUser(receptionistUser);
    kitchenToken = createTokenForUser(kitchenStaffUser);
    trainerToken = createTokenForUser(trainerUser);
    clientToken = createTokenForUser(clientUser);
    competitorToken = createTokenForUser(competitorManagerUser);
    disabledToken = createTokenForUser(disabledUser);

    saleRepo = new InMemoryIntegrationSaleRepository();

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
      controllers: [SalesController],
      providers: [
        {
          provide: SALE_REPOSITORY_TOKEN,
          useValue: saleRepo,
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
          provide: CreateSaleHandler,
          useFactory: (repo: SaleRepositoryPort) => new CreateSaleHandler(repo),
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
          provide: RemoveSaleItemHandler,
          useFactory: (repo: SaleRepositoryPort) => new RemoveSaleItemHandler(repo),
          inject: [SALE_REPOSITORY_TOKEN],
        },
        {
          provide: ApplyOrderDiscountHandler,
          useFactory: (repo: SaleRepositoryPort) => new ApplyOrderDiscountHandler(repo),
          inject: [SALE_REPOSITORY_TOKEN],
        },
        {
          provide: RemoveOrderDiscountHandler,
          useFactory: (repo: SaleRepositoryPort) => new RemoveOrderDiscountHandler(repo),
          inject: [SALE_REPOSITORY_TOKEN],
        },
        {
          provide: FinalizeSaleHandler,
          useFactory: (repo: SaleRepositoryPort) => new FinalizeSaleHandler(repo),
          inject: [SALE_REPOSITORY_TOKEN],
        },
        {
          provide: CancelSaleHandler,
          useFactory: (repo: SaleRepositoryPort) => new CancelSaleHandler(repo),
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
          provide: AssignSaleSourceHandler,
          useFactory: (repo: SaleRepositoryPort) => new AssignSaleSourceHandler(repo),
          inject: [SALE_REPOSITORY_TOKEN],
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
  });

  const seedSampleSale = (
    id = 'sale_int_fixture_01',
    tenantId = 'tenant_kinergy_main',
    clientId: string | null = 'usr_client_vip',
  ): Sale => {
    const sale = Sale.create({
      id: SaleId.create(id),
      currency: 'USD',
      tenantId,
      clientId: clientId ?? undefined,
      source: SaleSource.create(SaleSourceType.FOOD, 'terminal_front_01'),
    });
    saleRepo.store.set(sale.id.value, sale);
    return sale;
  };

  // ===========================================================================
  // 1. ROUTE 1: POST /api/v1/sales (Create Sale)
  // ===========================================================================
  describe('1. POST /api/v1/sales (Create Sale Integration)', () => {
    it('creates a new draft sale with valid items and source reference -> 201 Created', async () => {
      const initialSaveCount = saleRepo.saveCount;

      const res = await request(app.getHttpServer())
        .post('/api/v1/sales')
        .set('Authorization', `Bearer ${managerToken}`)
        .send({
          id: 'sale_create_success_01',
          currency: 'USD',
          clientId: 'client_123',
          sourceReference: { type: 'FOOD', referenceId: 'term_1' },
          items: [
            {
              description: 'Protein Shake (Berry)',
              quantity: 2,
              unitPriceAmount: 6.5,
            },
          ],
        });

      expect(res.status).toBe(201);
      expect(res.body.id).toBe('sale_create_success_01');
      expect(res.body.status).toBe('DRAFT');
      expect(res.body.currency).toBe('USD');
      expect(res.body.tenantId).toBe('tenant_kinergy_main');
      expect(res.body.subtotalAmount).toBe(13.0);
      expect(res.body.totalAmount).toBe(13.0);
      expect(res.body.total.cents).toBe(1300);
      expect(res.body.items).toHaveLength(1);
      expect(saleRepo.saveCount).toBe(initialSaveCount + 1);
    });

    it('creates walk-in draft sale without source reference -> 201 Created', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/sales')
        .set('Authorization', `Bearer ${receptionistToken}`)
        .send({
          id: 'sale_walk_in_01',
          currency: 'USD',
        });

      expect(res.status).toBe(201);
      expect(res.body.id).toBe('sale_walk_in_01');
      expect(res.body.status).toBe('DRAFT');
      expect(res.body.total.cents).toBe(0);
    });

    it('rejects unsupported currency code -> 400 Bad Request', async () => {
      const initialSaveCount = saleRepo.saveCount;

      const res = await request(app.getHttpServer())
        .post('/api/v1/sales')
        .set('Authorization', `Bearer ${managerToken}`)
        .send({
          id: 'sale_bad_cur',
          currency: 'INVALID_CURRENCY',
        });

      expect(res.status).toBe(400);
      expect(saleRepo.saveCount).toBe(initialSaveCount);
    });

    it('rejects non-whitelisted injection properties -> 400 Bad Request', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/sales')
        .set('Authorization', `Bearer ${managerToken}`)
        .send({
          id: 'sale_injection',
          currency: 'USD',
          maliciousField: 'exploit',
        });

      expect(res.status).toBe(400);
      expect(res.body.message).toContain('property maliciousField should not exist');
    });

    it('rejects unauthenticated request -> 401 Unauthorized', async () => {
      const res = await request(app.getHttpServer()).post('/api/v1/sales').send({
        id: 'sale_unauth',
        currency: 'USD',
      });

      expect(res.status).toBe(401);
      expect(res.body.error).toBe('Unauthorized');
    });

    it('rejects caller lacking sales.create permission (Trainer) -> 403 Forbidden', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/sales')
        .set('Authorization', `Bearer ${trainerToken}`)
        .send({
          id: 'sale_trainer_create',
          currency: 'USD',
        });

      expect(res.status).toBe(403);
      expect(res.body.error).toBe('Forbidden');
    });

    it('forbids tenantId in body via DTO whitelisting and extracts tenant from verified JWT', async () => {
      // 1. Attempting to send tenantId in body is rejected by strict DTO whitelisting
      const badRes = await request(app.getHttpServer())
        .post('/api/v1/sales')
        .set('Authorization', `Bearer ${receptionistToken}`)
        .send({
          id: 'sale_tenant_tamper_body',
          currency: 'USD',
          tenantId: 'tenant_competitor',
        });

      expect(badRes.status).toBe(400);
      expect(badRes.body.message).toContain('property tenantId should not exist');

      // 2. Attempting to spoof tenant via x-tenant-id header is ignored in favor of verified JWT token
      const okRes = await request(app.getHttpServer())
        .post('/api/v1/sales')
        .set('Authorization', `Bearer ${receptionistToken}`)
        .set('x-tenant-id', 'tenant_competitor')
        .send({
          id: 'sale_tenant_header_tamper',
          currency: 'USD',
        });

      expect(okRes.status).toBe(201);
      expect(okRes.body.tenantId).toBe('tenant_kinergy_main');
    });
  });

  // ===========================================================================
  // 2. ROUTE 2: GET /api/v1/sales (List Sales Integration)
  // ===========================================================================
  describe('2. GET /api/v1/sales (List Sales Integration)', () => {
    beforeEach(() => {
      // Seed deterministic fixture sales
      for (let i = 1; i <= 5; i++) {
        const sale = Sale.create({
          id: SaleId.create(`sale_page_${i}`),
          currency: 'USD',
          tenantId: 'tenant_kinergy_main',
          clientId: i % 2 === 0 ? 'usr_client_vip' : `client_other_${i}`,
          source: SaleSource.create(
            i % 2 === 0 ? SaleSourceType.FOOD : SaleSourceType.GYM_MEMBERSHIP,
            `term_${i}`,
          ),
        });
        sale.addItem({
          source: SaleSource.create(SaleSourceType.FOOD, `snack_${i}`),
          description: `Item ${i}`,
          quantity: i,
          unitPrice: Money.create(10, 'USD'),
        });
        saleRepo.store.set(sale.id.value, sale);
      }
      // Seed a competitor tenant sale
      const rivalSale = Sale.create({
        id: SaleId.create('sale_rival_tenant_1'),
        currency: 'USD',
        tenantId: 'tenant_competitor',
        source: SaleSource.create(SaleSourceType.FOOD, 'rival_term'),
      });
      saleRepo.store.set(rivalSale.id.value, rivalSale);
    });

    it('returns 200 OK with default pagination (page=1, limit=20) and tenant scoping', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/sales')
        .set('Authorization', `Bearer ${managerToken}`);

      expect(res.status).toBe(200);
      expect(res.body.items).toHaveLength(5);
      expect(res.body.total).toBe(5);
      expect(res.body.page).toBe(1);
      expect(res.body.limit).toBe(20);
      expect(
        res.body.items.every((s: { tenantId: string }) => s.tenantId === 'tenant_kinergy_main'),
      ).toBe(true);
      expect(res.body.items.some((s: { id: string }) => s.id === 'sale_rival_tenant_1')).toBe(
        false,
      );
    });

    it('supports custom page and limit with pagination metadata', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/sales')
        .set('Authorization', `Bearer ${managerToken}`)
        .query({ page: 2, limit: 2 });

      expect(res.status).toBe(200);
      expect(res.body.items).toHaveLength(2);
      expect(res.body.page).toBe(2);
      expect(res.body.limit).toBe(2);
      expect(res.body.total).toBe(5);
      expect(res.body.totalPages).toBe(3);
      expect(res.body.hasNextPage).toBe(true);
      expect(res.body.hasPreviousPage).toBe(true);
    });

    it('rejects limit exceeding 100 -> 400 Bad Request', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/sales')
        .set('Authorization', `Bearer ${managerToken}`)
        .query({ limit: 150 });

      expect(res.status).toBe(400);
      expect(res.body.message).toContain('Limit cannot exceed maximum page size of 100');
    });

    it('rejects invalid page number (< 1) -> 400 Bad Request', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/sales')
        .set('Authorization', `Bearer ${managerToken}`)
        .query({ page: 0 });

      expect(res.status).toBe(400);
    });

    it('rejects fromDate after toDate -> 400 Bad Request', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/sales')
        .set('Authorization', `Bearer ${managerToken}`)
        .query({
          fromDate: '2026-10-15T00:00:00.000Z',
          toDate: '2026-10-10T00:00:00.000Z',
        });

      expect(res.status).toBe(400);
      expect(res.body.message).toContain('cannot be after toDate');
    });

    it('filters by status and clientId accurately', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/sales')
        .set('Authorization', `Bearer ${managerToken}`)
        .query({ clientId: 'usr_client_vip', status: 'DRAFT' });

      expect(res.status).toBe(200);
      expect(res.body.items).toHaveLength(2); // page_2 and page_4
      expect(
        res.body.items.every((s: { clientId: string }) => s.clientId === 'usr_client_vip'),
      ).toBe(true);
    });

    it('strictly denies Client role user from accessing staff sales listing -> 403 Forbidden', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/sales')
        .set('Authorization', `Bearer ${clientToken}`);

      expect(res.status).toBe(403);
      expect(res.body.error).toBe('Forbidden');
    });

    it('sorts by total amount ascending with stable tie-breaker', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/sales')
        .set('Authorization', `Bearer ${managerToken}`)
        .query({ sortField: 'total', sortDirection: 'asc' });

      expect(res.status).toBe(200);
      expect(res.body.items[0].totalAmount).toBeLessThanOrEqual(res.body.items[1].totalAmount);
    });
  });

  // ===========================================================================
  // 3. ROUTE 3: GET /api/v1/sales/:id (Get Sale Details)
  // ===========================================================================
  describe('3. GET /api/v1/sales/:id (Get Sale Details Integration)', () => {
    it('returns 200 OK with complete financial breakdown for existing sale', async () => {
      const sale = seedSampleSale('sale_get_01');
      sale.addItem({
        source: SaleSource.create(SaleSourceType.FOOD, 'p1'),
        description: 'Electrolyte Water',
        quantity: 2,
        unitPrice: Money.create(3.5, 'USD'),
      });
      await saleRepo.save(sale);

      const res = await request(app.getHttpServer())
        .get('/api/v1/sales/sale_get_01')
        .set('Authorization', `Bearer ${receptionistToken}`);

      expect(res.status).toBe(200);
      expect(res.body.id).toBe('sale_get_01');
      expect(res.body.currency).toBe('USD');
      expect(res.body.subtotalAmount).toBe(7.0);
      expect(res.body.totalAmount).toBe(7.0);
      expect(res.body.subtotal.cents).toBe(700);
      expect(res.body.items).toHaveLength(1);
    });

    it('returns 404 Not Found for non-existent sale ID', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/sales/sale_not_existing_999')
        .set('Authorization', `Bearer ${managerToken}`);

      expect(res.status).toBe(404);
      expect(res.body.error).toBe('Not Found');
    });

    it('returns uniform 404 Not Found on cross-tenant probe (preventing resource enumeration)', async () => {
      seedSampleSale('sale_cross_tenant_probe', 'tenant_kinergy_main');

      const res = await request(app.getHttpServer())
        .get('/api/v1/sales/sale_cross_tenant_probe')
        .set('Authorization', `Bearer ${competitorToken}`);

      expect(res.status).toBe(404);
      expect(res.body.error).toBe('Not Found');
    });

    it('denies Client role user from staff sale detail route -> 403 Forbidden', async () => {
      seedSampleSale('sale_foreign_client', 'tenant_kinergy_main', 'client_other_user');

      const res = await request(app.getHttpServer())
        .get('/api/v1/sales/sale_foreign_client')
        .set('Authorization', `Bearer ${clientToken}`);

      expect(res.status).toBe(403);
      expect(res.body.error).toBe('Forbidden');
    });

    it('guarantees response contains zero unapproved payment/receipt data leakage', async () => {
      seedSampleSale('sale_leakage_check');

      const res = await request(app.getHttpServer())
        .get('/api/v1/sales/sale_leakage_check')
        .set('Authorization', `Bearer ${managerToken}`);

      expect(res.status).toBe(200);
      expect(res.body.payments).toBeUndefined();
      expect(res.body.receipts).toBeUndefined();
      expect(res.body.creditCardPan).toBeUndefined();
    });
  });

  // ===========================================================================
  // 4. ROUTE 4: POST /api/v1/sales/:id/items (Add Sale Item)
  // ===========================================================================
  describe('4. POST /api/v1/sales/:id/items (Add Sale Item Integration)', () => {
    it('adds item to draft sale and recalculates financial totals -> 200 OK', async () => {
      seedSampleSale('sale_add_item_01');
      const initialSaveCount = saleRepo.saveCount;

      const res = await request(app.getHttpServer())
        .post('/api/v1/sales/sale_add_item_01/items')
        .set('Authorization', `Bearer ${kitchenToken}`)
        .send({
          description: 'Fruit Smoothie',
          quantity: 2,
          unitPriceAmount: 5.5,
          sourceReference: { type: 'FOOD', referenceId: 'smoothie_bar_1' },
        });

      expect(res.status).toBe(200);
      expect(res.body.items).toHaveLength(1);
      expect(res.body.subtotalAmount).toBe(11.0);
      expect(res.body.totalAmount).toBe(11.0);
      expect(res.body.total.cents).toBe(1100);
      expect(saleRepo.saveCount).toBe(initialSaveCount + 1);
    });

    it('adds item with line-level discount and computes minor units correctly -> 200 OK', async () => {
      seedSampleSale('sale_item_disc_01');

      const res = await request(app.getHttpServer())
        .post('/api/v1/sales/sale_item_disc_01/items')
        .set('Authorization', `Bearer ${managerToken}`)
        .send({
          description: 'Premium Training Mat',
          quantity: 1,
          unitPriceAmount: 50.0,
          discount: {
            type: 'PERCENTAGE',
            value: 20,
            reason: 'VIP Special',
          },
        });

      expect(res.status).toBe(200);
      expect(res.body.subtotalAmount).toBe(50.0);
      expect(res.body.discountTotalAmount).toBe(10.0);
      expect(res.body.totalAmount).toBe(40.0);
      expect(res.body.total.cents).toBe(4000);
    });

    it('rejects negative unit price -> 400 Bad Request', async () => {
      seedSampleSale('sale_neg_price_test');
      const initialSaveCount = saleRepo.saveCount;

      const res = await request(app.getHttpServer())
        .post('/api/v1/sales/sale_neg_price_test/items')
        .set('Authorization', `Bearer ${managerToken}`)
        .send({
          description: 'Item',
          quantity: 1,
          unitPriceAmount: -10,
        });

      expect(res.status).toBe(400);
      expect(saleRepo.saveCount).toBe(initialSaveCount);
    });

    it('rejects zero or negative quantity -> 400 Bad Request', async () => {
      seedSampleSale('sale_bad_qty_test');

      const res = await request(app.getHttpServer())
        .post('/api/v1/sales/sale_bad_qty_test/items')
        .set('Authorization', `Bearer ${managerToken}`)
        .send({
          description: 'Item',
          quantity: 0,
          unitPriceAmount: 10,
        });

      expect(res.status).toBe(400);
    });

    it('rejects adding item to CANCELLED sale -> 409 Conflict', async () => {
      const sale = seedSampleSale('sale_cancelled_add_item');
      sale.cancel('Voided order');
      await saleRepo.save(sale);
      const initialSaveCount = saleRepo.saveCount;

      const res = await request(app.getHttpServer())
        .post('/api/v1/sales/sale_cancelled_add_item/items')
        .set('Authorization', `Bearer ${managerToken}`)
        .send({
          description: 'Item',
          quantity: 1,
          unitPriceAmount: 10,
        });

      expect(res.status).toBe(409);
      expect(saleRepo.saveCount).toBe(initialSaveCount);
    });
  });

  // ===========================================================================
  // 5. ROUTE 5: DELETE /api/v1/sales/:id/items/:itemId (Remove Sale Item)
  // ===========================================================================
  describe('5. DELETE /api/v1/sales/:id/items/:itemId (Remove Sale Item Integration)', () => {
    it('removes item and recalculates financial totals to zero -> 200 OK', async () => {
      const sale = seedSampleSale('sale_rem_item_01');
      sale.addItem({
        source: SaleSource.create(SaleSourceType.FOOD, 'item_1'),
        description: 'Snack Bar',
        quantity: 1,
        unitPrice: Money.create(4, 'USD'),
      });
      await saleRepo.save(sale);
      const itemId = sale.items[0]!.id.value;
      const initialSaveCount = saleRepo.saveCount;

      const res = await request(app.getHttpServer())
        .delete(`/api/v1/sales/sale_rem_item_01/items/${itemId}`)
        .set('Authorization', `Bearer ${kitchenToken}`);

      expect(res.status).toBe(200);
      expect(res.body.items).toHaveLength(0);
      expect(res.body.totalAmount).toBe(0);
      expect(res.body.total.cents).toBe(0);
      expect(saleRepo.saveCount).toBe(initialSaveCount + 1);
    });

    it('returns 404 Not Found when itemId does not exist in sale', async () => {
      seedSampleSale('sale_rem_nonexist_item');
      const initialSaveCount = saleRepo.saveCount;

      const res = await request(app.getHttpServer())
        .delete('/api/v1/sales/sale_rem_nonexist_item/items/item_does_not_exist')
        .set('Authorization', `Bearer ${managerToken}`);

      expect(res.status).toBe(404);
      expect(saleRepo.saveCount).toBe(initialSaveCount);
    });
  });

  // ===========================================================================
  // 6. ROUTE 6: POST /api/v1/sales/:id/discount (Apply Discount)
  // ===========================================================================
  describe('6. POST /api/v1/sales/:id/discount (Apply Discount Integration)', () => {
    it('applies percentage order discount and updates totals -> 200 OK', async () => {
      const sale = seedSampleSale('sale_disc_test_01');
      sale.addItem({
        source: SaleSource.create(SaleSourceType.FOOD, 'f1'),
        description: 'Gym Bag',
        quantity: 1,
        unitPrice: Money.create(100, 'USD'),
      });
      await saleRepo.save(sale);
      const initialSaveCount = saleRepo.saveCount;

      const res = await request(app.getHttpServer())
        .post('/api/v1/sales/sale_disc_test_01/discount')
        .set('Authorization', `Bearer ${managerToken}`)
        .send({
          type: 'PERCENTAGE',
          value: 15,
          reason: 'Seasonal Promotion',
        });

      expect(res.status).toBe(200);
      expect(res.body.subtotalAmount).toBe(100.0);
      expect(res.body.discountTotalAmount).toBe(15.0);
      expect(res.body.totalAmount).toBe(85.0);
      expect(res.body.total.cents).toBe(8500);
      expect(saleRepo.saveCount).toBe(initialSaveCount + 1);
    });

    it('rejects discount percentage exceeding 100% -> 400 Bad Request', async () => {
      const sale = seedSampleSale('sale_disc_excess_test');
      sale.addItem({
        source: SaleSource.create(SaleSourceType.FOOD, 'f1'),
        description: 'Shirt',
        quantity: 1,
        unitPrice: Money.create(20, 'USD'),
      });
      await saleRepo.save(sale);
      const initialSaveCount = saleRepo.saveCount;

      const res = await request(app.getHttpServer())
        .post('/api/v1/sales/sale_disc_excess_test/discount')
        .set('Authorization', `Bearer ${managerToken}`)
        .send({
          type: 'PERCENTAGE',
          value: 120, // Invalid: > 100%
          reason: 'Excessive',
        });

      expect(res.status).toBe(400);
      expect(saleRepo.saveCount).toBe(initialSaveCount);
    });
  });

  // ===========================================================================
  // 7. ROUTE 7: POST /api/v1/sales/:id/cancel (Cancel Sale)
  // ===========================================================================
  describe('7. POST /api/v1/sales/:id/cancel (Cancel Sale Integration)', () => {
    it('cancels active draft sale with valid audit reason -> 200 OK', async () => {
      seedSampleSale('sale_cancel_test_01');
      const initialSaveCount = saleRepo.saveCount;

      const res = await request(app.getHttpServer())
        .post('/api/v1/sales/sale_cancel_test_01/cancel')
        .set('Authorization', `Bearer ${managerToken}`)
        .send({
          reason: 'Customer requested cancellation prior to tender',
        });

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('CANCELLED');
      expect(res.body.cancellationReason).toBe('Customer requested cancellation prior to tender');
      expect(saleRepo.saveCount).toBe(initialSaveCount + 1);
    });

    it('authorizes Receptionist to cancel sale -> 200 OK', async () => {
      seedSampleSale('sale_recept_cancel_01');

      const res = await request(app.getHttpServer())
        .post('/api/v1/sales/sale_recept_cancel_01/cancel')
        .set('Authorization', `Bearer ${receptionistToken}`)
        .send({ reason: 'Client cancelled appointment' });

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('CANCELLED');
    });

    it('rejects Kitchen Staff attempting to cancel sale -> 403 Forbidden', async () => {
      seedSampleSale('sale_kitchen_no_cancel');
      const initialSaveCount = saleRepo.saveCount;

      const res = await request(app.getHttpServer())
        .post('/api/v1/sales/sale_kitchen_no_cancel/cancel')
        .set('Authorization', `Bearer ${kitchenToken}`)
        .send({ reason: 'Kitchen attempt void' });

      expect(res.status).toBe(403);
      expect(saleRepo.saveCount).toBe(initialSaveCount);
    });

    it('rejects cancellation missing reason -> 400 Bad Request', async () => {
      seedSampleSale('sale_no_reason_cancel');

      const res = await request(app.getHttpServer())
        .post('/api/v1/sales/sale_no_reason_cancel/cancel')
        .set('Authorization', `Bearer ${managerToken}`)
        .send({});

      expect(res.status).toBe(400);
      expect(JSON.stringify(res.body.message)).toContain('Cancellation reason');
    });

    it('rejects repeated cancellation of already CANCELLED sale -> 409 / 422 Conflict', async () => {
      const sale = seedSampleSale('sale_already_cancelled_test');
      sale.cancel('First cancellation');
      await saleRepo.save(sale);
      const initialSaveCount = saleRepo.saveCount;

      const res = await request(app.getHttpServer())
        .post('/api/v1/sales/sale_already_cancelled_test/cancel')
        .set('Authorization', `Bearer ${managerToken}`)
        .send({ reason: 'Second cancellation attempt' });

      expect([409, 422]).toContain(res.status);
      expect(saleRepo.saveCount).toBe(initialSaveCount);
    });
  });

  // ===========================================================================
  // 8. Cross-Cutting & Security Controls
  // ===========================================================================
  describe('8. Cross-Cutting Security & Authorization Integrity', () => {
    it('denies inactive / disabled user account with 401 Unauthorized', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/sales')
        .set('Authorization', `Bearer ${disabledToken}`);

      expect(res.status).toBe(401);
      expect(res.body.message).toContain('User account is inactive or disabled');
    });

    it('authorizes Owner superuser with wildcard permissions to perform checkout and administration', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/sales')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({
          id: 'sale_owner_super',
          currency: 'USD',
          sourceReference: { type: 'FOOD', referenceId: 'term_owner' },
        });

      expect(res.status).toBe(201);
      expect(res.body.id).toBe('sale_owner_super');
      expect(res.body.tenantId).toBe('tenant_kinergy_main');
    });

    it('denies malformed bearer token with 401 Unauthorized', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/sales')
        .set('Authorization', 'Bearer invalid.tampered.token');

      expect(res.status).toBe(401);
    });

    it('calculates sale totals without mutating database (saveCount remains 0)', async () => {
      const sale = seedSampleSale('sale_calc_integ');
      sale.addItem({
        source: SaleSource.create(SaleSourceType.FOOD, 'c1'),
        description: 'Bottle of Water',
        quantity: 3,
        unitPrice: Money.create(2.5, 'USD'),
      });
      await saleRepo.save(sale);
      const initialSaveCount = saleRepo.saveCount;

      const res = await request(app.getHttpServer())
        .get('/api/v1/sales/sale_calc_integ/calculate')
        .set('Authorization', `Bearer ${trainerToken}`);

      expect(res.status).toBe(200);
      expect(res.body.totalAmount).toBe(7.5);
      expect(res.body.currency).toBe('USD');
      // Invariant: read-only query produces 0 saves
      expect(saleRepo.saveCount).toBe(initialSaveCount);
    });
  });
});
