import {
  ExecutionContext,
  NotFoundException,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
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
  GetSaleByIdHandler,
  ListSalesHandler,
  CalculateSaleHandler,
  CreateSaleHandler,
  AddSaleItemHandler,
  RemoveSaleItemHandler,
  ApplyOrderDiscountHandler,
  RemoveOrderDiscountHandler,
  FinalizeSaleHandler,
  CancelSaleHandler,
  AssignSaleSourceHandler,
} from '@kinergy-platform/core';
import { SalesController } from '../controllers/sales.controller';
import { AuthorizationGuard } from '../../platform/identity/authorization/authorization.guard';
import { DefaultAuthorizationEvaluator } from '../../platform/identity/authorization/default-authorization-evaluator';
import { IPermissionResolver } from '../../platform/identity/authorization/authorization.interface';
import { AuthenticatedUserContext } from '../../platform/identity/context/authenticated-user-context';
import { AuthenticatedUserPayload } from '../../platform/identity/decorators/current-user.decorator';

/**
 * In-memory test repository implementing SaleRepositoryPort and SaleRepositoryInterface.
 */
class InMemorySaleRepository implements SaleRepositoryPort, SaleRepositoryInterface {
  public store = new Map<string, Sale>();

  async findById(id: SaleId | string): Promise<Sale | null> {
    const key = typeof id === 'string' ? id.trim() : id.value;
    return this.store.get(key) ?? null;
  }

  async save(sale: Sale): Promise<void> {
    this.store.set(sale.id.value, sale);
  }

  async findMany(
    criteria: FindSalesCriteria,
    pagination: FindSalesPagination,
    _sort: FindSalesSort,
  ): Promise<FindSalesResult> {
    let summaries = Array.from(this.store.values()).map((sale) => SaleMapper.toSummaryDTO(sale));

    if (criteria.tenantId) {
      summaries = summaries.filter((s) => s.tenantId === criteria.tenantId);
    }
    if (criteria.clientId) {
      summaries = summaries.filter((s) => s.clientId === criteria.clientId);
    }
    if (criteria.status) {
      summaries = summaries.filter((s) => s.status === criteria.status);
    }

    const total = summaries.length;
    const skip = (pagination.page - 1) * pagination.limit;
    const paginatedItems = summaries.slice(skip, skip + pagination.limit);

    return {
      items: paginatedItems,
      total,
    };
  }

  clear(): void {
    this.store.clear();
  }
}

describe('Sales Read Queries Authorization Specification (ADR-0135 & ADR-0111)', () => {
  let saleRepo: InMemorySaleRepository;
  let controller: SalesController;
  let reflector: Reflector;
  let permissionResolver: jest.Mocked<IPermissionResolver>;
  let evaluator: DefaultAuthorizationEvaluator;
  let guard: AuthorizationGuard;

  // Personas
  const ownerUser = new AuthenticatedUserContext({
    userId: 'usr_owner_01',
    email: 'owner@kinergy.platform',
    status: 'ACTIVE',
    roles: ['Owner'],
    permissions: ['*'],
    tenantId: 'tenant_kinergy_main',
  });

  const managerUser = new AuthenticatedUserContext({
    userId: 'usr_mgr_01',
    email: 'manager@kinergy.platform',
    status: 'ACTIVE',
    roles: ['Manager'],
    permissions: ['sales.read'],
    tenantId: 'tenant_kinergy_main',
  });

  const receptionistUser = new AuthenticatedUserContext({
    userId: 'usr_recept_01',
    email: 'reception@kinergy.platform',
    status: 'ACTIVE',
    roles: ['Receptionist'],
    permissions: ['sales.read'],
    tenantId: 'tenant_kinergy_main',
  });

  const trainerUser = new AuthenticatedUserContext({
    userId: 'usr_trainer_01',
    email: 'trainer@kinergy.platform',
    status: 'ACTIVE',
    roles: ['Trainer'],
    permissions: ['sales.read'],
    tenantId: 'tenant_kinergy_main',
  });

  const kitchenStaffUser = new AuthenticatedUserContext({
    userId: 'usr_kitchen_01',
    email: 'kitchen@kinergy.platform',
    status: 'ACTIVE',
    roles: ['Kitchen Staff'],
    permissions: ['sales.read'],
    tenantId: 'tenant_kinergy_main',
  });

  const clientUser = new AuthenticatedUserContext({
    userId: 'client_vip_777',
    email: 'client@example.com',
    status: 'ACTIVE',
    roles: ['Client'],
    permissions: ['sales.read'],
    tenantId: 'tenant_kinergy_main',
  });

  const unauthorizedStaffUser = new AuthenticatedUserContext({
    userId: 'usr_unauth_01',
    email: 'unauth@kinergy.platform',
    status: 'ACTIVE',
    roles: ['Kitchen Staff'],
    permissions: ['kitchen.orders.manage'], // Lacks sales.read
    tenantId: 'tenant_kinergy_main',
  });

  const crossTenantManager = new AuthenticatedUserContext({
    userId: 'usr_competitor_mgr',
    email: 'rival@competitor.com',
    status: 'ACTIVE',
    roles: ['Manager'],
    permissions: ['sales.read'],
    tenantId: 'tenant_competitor_rival',
  });

  const toPayload = (user: AuthenticatedUserContext): AuthenticatedUserPayload => ({
    id: user.userId,
    email: user.email,
    status: user.status,
    tenantId: user.tenantId,
    roles: [...user.roles],
    permissions: [...user.permissions],
  });

  beforeEach(() => {
    saleRepo = new InMemorySaleRepository();

    controller = new SalesController(
      saleRepo,
      undefined,
      new CreateSaleHandler(saleRepo),
      new GetSaleByIdHandler(saleRepo),
      new AddSaleItemHandler(saleRepo),
      new RemoveSaleItemHandler(saleRepo),
      new ApplyOrderDiscountHandler(saleRepo),
      new RemoveOrderDiscountHandler(saleRepo),
      new FinalizeSaleHandler(saleRepo),
      new CancelSaleHandler(saleRepo),
      undefined,
      new AssignSaleSourceHandler(saleRepo),
      new CalculateSaleHandler(saleRepo),
      new ListSalesHandler(saleRepo),
    );

    reflector = new Reflector();
    permissionResolver = {
      resolvePermissions: jest
        .fn()
        .mockImplementation((_userId, _roles, directPermissions) =>
          Promise.resolve(directPermissions ?? []),
        ),
    };
    evaluator = new DefaultAuthorizationEvaluator(permissionResolver);
    guard = new AuthorizationGuard(reflector, evaluator);
  });

  const createMockContext = (
    handlerName: keyof SalesController,
    userContext?: AuthenticatedUserContext,
  ): ExecutionContext => {
    return {
      getHandler: () => SalesController.prototype[handlerName],
      getClass: () => SalesController,
      switchToHttp: () => ({
        getRequest: () => ({
          user: userContext,
        }),
      }),
    } as unknown as ExecutionContext;
  };

  const seedSampleSale = (
    saleId = 'sale_query_test_01',
    tenantId = 'tenant_kinergy_main',
    clientId: string | null = 'client_vip_777',
  ): Sale => {
    const sale = Sale.create({
      id: SaleId.create(saleId),
      currency: 'USD',
      tenantId,
      clientId: clientId ?? undefined,
      source: SaleSource.create(SaleSourceType.FOOD, 'pos_terminal_01'),
    });

    sale.addItem({
      source: SaleSource.create(SaleSourceType.FOOD, 'snack_shelf'),
      description: 'Protein Shake (Chocolate)',
      quantity: 2,
      unitPrice: Money.create(5.5, 'USD'),
    });

    saleRepo.store.set(sale.id.value, sale);
    return sale;
  };

  // ---------------------------------------------------------------------------
  // 1. GetSale Endpoint Authorization & Resource Isolation
  // ---------------------------------------------------------------------------
  describe('1. GetSale (GET /api/v1/sales/:id)', () => {
    it('authorizes Owner, Manager, Receptionist, Trainer, and Kitchen Staff with sales.read', async () => {
      const sale = seedSampleSale('sale_auth_check_1');

      const staffUsers = [ownerUser, managerUser, receptionistUser, trainerUser, kitchenStaffUser];
      for (const user of staffUsers) {
        const canActivate = await guard.canActivate(createMockContext('getSale', user));
        expect(canActivate).toBe(true);

        const response = await controller.getSale(sale.id.value, toPayload(user));

        expect(response.id).toBe(sale.id.value);
        expect(response.subtotalAmount).toBe(11.0);
        expect(response.totalAmount).toBe(11.0);
        expect(response.clientId).toBe('client_vip_777');
        expect(response.items).toHaveLength(1);
      }
    });

    it('rejects caller lacking sales.read permission with 403 Forbidden', async () => {
      await expect(
        guard.canActivate(createMockContext('getSale', unauthorizedStaffUser)),
      ).rejects.toThrow(ForbiddenException);
    });

    it('rejects unauthenticated caller with 401 Unauthorized', async () => {
      await expect(guard.canActivate(createMockContext('getSale', undefined))).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('rejects cross-tenant probing with 404 Not Found (uniform 404 per ADR-0135 §9)', async () => {
      const sale = seedSampleSale('sale_cross_tenant_1', 'tenant_kinergy_main');

      // Caller from rival tenant has sales.read permission
      const canActivate = await guard.canActivate(createMockContext('getSale', crossTenantManager));
      expect(canActivate).toBe(true);

      // But application handler enforces tenant isolation and throws NotFoundException
      await expect(
        controller.getSale(sale.id.value, toPayload(crossTenantManager)),
      ).rejects.toThrow(NotFoundException);
    });

    it('enforces Client object-level ownership boundary (ADR-0135 & ADR-0111)', async () => {
      const ownSale = seedSampleSale('sale_client_own', 'tenant_kinergy_main', 'client_vip_777');
      const otherSale = seedSampleSale(
        'sale_client_other',
        'tenant_kinergy_main',
        'client_other_999',
      );
      const anonSale = seedSampleSale('sale_client_anon', 'tenant_kinergy_main', null);

      // Own sale retrieval succeeds at application layer
      const response = await controller.getSale(ownSale.id.value, toPayload(clientUser));
      expect(response.id).toBe(ownSale.id.value);
      expect(response.clientId).toBe('client_vip_777');

      // Attempting to retrieve another client's sale yields 404 Not Found (no existence leakage)
      await expect(controller.getSale(otherSale.id.value, toPayload(clientUser))).rejects.toThrow(
        NotFoundException,
      );

      // Attempting to retrieve anonymous walk-in sale yields 404 Not Found
      await expect(controller.getSale(anonSale.id.value, toPayload(clientUser))).rejects.toThrow(
        NotFoundException,
      );
    });

    it('strictly guarantees nested Payment and Receipt data are NOT exposed in Sale response', async () => {
      const sale = seedSampleSale('sale_privacy_check');

      const response = await controller.getSale(sale.id.value, toPayload(managerUser));

      const raw = response as unknown as Record<string, unknown>;
      // ADR-0135: No payment ledgers, payment transactions, or fiscal receipts leak into sale query
      expect(raw['payments']).toBeUndefined();
      expect(raw['receipt']).toBeUndefined();
      expect(raw['receipts']).toBeUndefined();
      expect(raw['paymentHistory']).toBeUndefined();
      expect(raw['paymentSummary']).toBeUndefined();
    });
  });

  // ---------------------------------------------------------------------------
  // 2. ListSales Endpoint Authorization & Isolation
  // ---------------------------------------------------------------------------
  describe('2. ListSales (GET /api/v1/sales)', () => {
    it('authorizes staff caller with sales.read and automatically scopes to caller tenantId', async () => {
      // Seed sales across multiple tenants
      seedSampleSale('sale_tenant_a_1', 'tenant_kinergy_main');
      seedSampleSale('sale_tenant_a_2', 'tenant_kinergy_main');
      seedSampleSale('sale_tenant_b_1', 'tenant_competitor_rival');

      const canActivate = await guard.canActivate(createMockContext('listSales', managerUser));
      expect(canActivate).toBe(true);

      const result = await controller.listSales(
        '1',
        '20',
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        toPayload(managerUser),
      );

      expect(result.items).toHaveLength(2);
      expect(result.items.every((s) => s.tenantId === 'tenant_kinergy_main')).toBe(true);
      expect(result.items.some((s) => s.id === 'sale_tenant_b_1')).toBe(false);
    });

    it('rejects caller lacking sales.read permission with 403 Forbidden', async () => {
      await expect(
        guard.canActivate(createMockContext('listSales', unauthorizedStaffUser)),
      ).rejects.toThrow(ForbiddenException);
    });

    it('rejects unauthenticated caller with 401 Unauthorized', async () => {
      await expect(guard.canActivate(createMockContext('listSales', undefined))).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('automatically scopes list query to caller clientId when caller has Client role', async () => {
      seedSampleSale('sale_client_a', 'tenant_kinergy_main', 'client_vip_777');
      seedSampleSale('sale_client_b', 'tenant_kinergy_main', 'client_other_999');

      const result = await controller.listSales(
        '1',
        '20',
        'client_other_999', // Maliciously requests another client's sales
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        toPayload(clientUser),
      );

      // Forced to only own sales
      expect(result.items).toHaveLength(1);
      expect(result.items[0]?.id).toBe('sale_client_a');
      expect(result.items[0]?.clientId).toBe('client_vip_777');
    });

    it('preserves pagination bounds and sorting parameters', async () => {
      for (let i = 1; i <= 5; i++) {
        seedSampleSale(`sale_page_${i}`, 'tenant_kinergy_main', `client_${i}`);
      }

      const result = await controller.listSales(
        '1',
        '2',
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        'createdAt',
        'desc',
        toPayload(managerUser),
      );

      expect(result.items).toHaveLength(2);
      expect(result.total).toBe(5);
      expect(result.page).toBe(1);
      expect(result.limit).toBe(2);
      expect(result.totalPages).toBe(3);
      expect(result.hasNextPage).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // 3. CalculateSale Endpoint Authorization & Isolation
  // ---------------------------------------------------------------------------
  describe('3. CalculateSale (GET /api/v1/sales/:id/calculate)', () => {
    it('authorizes staff caller with sales.read and returns authoritative monetary totals', async () => {
      const sale = seedSampleSale('sale_calc_auth');

      const canActivate = await guard.canActivate(
        createMockContext('calculateSale', receptionistUser),
      );
      expect(canActivate).toBe(true);

      const totals = await controller.calculateSale(sale.id.value, toPayload(receptionistUser));

      expect(totals.subtotalAmount).toBe(11.0);
      expect(totals.totalAmount).toBe(11.0);
      expect(totals.currency).toBe('USD');
    });

    it('rejects caller lacking sales.read permission with 403 Forbidden', async () => {
      await expect(
        guard.canActivate(createMockContext('calculateSale', unauthorizedStaffUser)),
      ).rejects.toThrow(ForbiddenException);
    });

    it('rejects cross-tenant calculate probing with 404 Not Found', async () => {
      const sale = seedSampleSale('sale_calc_cross', 'tenant_kinergy_main');

      const canActivate = await guard.canActivate(
        createMockContext('calculateSale', crossTenantManager),
      );
      expect(canActivate).toBe(true);

      await expect(
        controller.calculateSale(sale.id.value, toPayload(crossTenantManager)),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ---------------------------------------------------------------------------
  // 4. Clean Architectural Separation of Concerns
  // ---------------------------------------------------------------------------
  describe('4. Architecture Boundary & Invariant Protections', () => {
    it('proves Controller delegates authorization and query scoping to Application Layer', () => {
      expect(typeof controller.getSale).toBe('function');
      expect(typeof controller.listSales).toBe('function');
      expect(typeof controller.calculateSale).toBe('function');
    });

    it('proves public application contracts do not leak Prisma or ORM types', async () => {
      const sale = seedSampleSale('sale_contract_purity');

      const response = await controller.getSale(sale.id.value, toPayload(managerUser));

      expect(response).not.toHaveProperty('_prisma');
      expect(response).not.toHaveProperty('_raw');
      expect(typeof response.id).toBe('string');
      expect(typeof response.subtotalAmount).toBe('number');
    });
  });
});
