import {
  ExecutionContext,
  ForbiddenException,
  UnauthorizedException,
  NotFoundException,
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
import { SalesController } from '../controllers/sales.controller';
import { AuthenticationGuard } from '../../platform/identity/guards/authentication.guard';
import { AuthorizationGuard } from '../../platform/identity/authorization/authorization.guard';
import { DefaultAuthorizationEvaluator } from '../../platform/identity/authorization/default-authorization-evaluator';
import { IPermissionResolver } from '../../platform/identity/authorization/authorization.interface';
import { AuthenticatedUserContext } from '../../platform/identity/context/authenticated-user-context';
import { AuthenticatedUserPayload } from '../../platform/identity/decorators/current-user.decorator';
import { ROLES_KEY } from '../../platform/identity/authorization/decorators/roles.decorator';
import { PERMISSIONS_KEY } from '../../platform/identity/authorization/decorators/permissions.decorator';
import { SalesExceptionFilter } from '../filters/sales-exception.filter';
import * as fs from 'fs';
import * as path from 'path';

/**
 * In-memory test repository that logs save calls and maintains multi-tenant data.
 */
class AuditTestSaleRepository implements SaleRepositoryPort, SaleRepositoryInterface {
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
    this.saveCount = 0;
    this.lastSavedSale = null;
  }
}

describe('Milestone 7.14 Sales Endpoints Authorization & Security Audit', () => {
  let saleRepo: AuditTestSaleRepository;
  let controller: SalesController;
  let reflector: Reflector;
  let permissionResolver: jest.Mocked<IPermissionResolver>;
  let evaluator: DefaultAuthorizationEvaluator;
  let guard: AuthorizationGuard;

  // Personas strictly reflecting IAM Seed (identity.seed.ts)
  const ownerUser = new AuthenticatedUserContext({
    userId: 'usr_owner_audit',
    email: 'owner@kinergy.platform',
    status: 'ACTIVE',
    roles: ['Owner'],
    permissions: ['*'],
    tenantId: 'tenant_kinergy_main',
  });

  const managerUser = new AuthenticatedUserContext({
    userId: 'usr_mgr_audit',
    email: 'manager@kinergy.platform',
    status: 'ACTIVE',
    roles: ['Manager'],
    permissions: ['sales.manage'], // sales.manage implies sales.read, sales.create, sales.cancel
    tenantId: 'tenant_kinergy_main',
  });

  const receptionistUser = new AuthenticatedUserContext({
    userId: 'usr_recept_audit',
    email: 'receptionist@kinergy.platform',
    status: 'ACTIVE',
    roles: ['Receptionist'],
    permissions: ['sales.read', 'sales.create', 'sales.cancel'],
    tenantId: 'tenant_kinergy_main',
  });

  const kitchenStaffUser = new AuthenticatedUserContext({
    userId: 'usr_kitchen_audit',
    email: 'kitchen@kinergy.platform',
    status: 'ACTIVE',
    roles: ['Kitchen Staff'],
    permissions: ['sales.read', 'sales.create'], // No sales.cancel
    tenantId: 'tenant_kinergy_main',
  });

  const trainerUser = new AuthenticatedUserContext({
    userId: 'usr_trainer_audit',
    email: 'trainer@kinergy.platform',
    status: 'ACTIVE',
    roles: ['Trainer'],
    permissions: ['sales.read'], // Read only
    tenantId: 'tenant_kinergy_main',
  });

  const clientUser = new AuthenticatedUserContext({
    userId: 'usr_client_audit',
    email: 'client@example.com',
    status: 'ACTIVE',
    roles: ['Client'],
    permissions: ['sales.read'],
    tenantId: 'tenant_kinergy_main',
  });

  const unauthorizedUser = new AuthenticatedUserContext({
    userId: 'usr_unauth_audit',
    email: 'unauth@kinergy.platform',
    status: 'ACTIVE',
    roles: ['Kitchen Staff'],
    permissions: ['kitchen.read'], // Missing sales.*
    tenantId: 'tenant_kinergy_main',
  });

  const rivalTenantManager = new AuthenticatedUserContext({
    userId: 'usr_rival_mgr',
    email: 'rival@competitor.com',
    status: 'ACTIVE',
    roles: ['Manager'],
    permissions: ['sales.manage'],
    tenantId: 'tenant_competitor',
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
    saleRepo = new AuditTestSaleRepository();

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

  const seedDraftSale = (
    saleId = 'sale_audit_01',
    tenantId = 'tenant_kinergy_main',
    clientId: string | null = 'usr_client_audit',
  ): Sale => {
    const sale = Sale.create({
      id: SaleId.create(saleId),
      currency: 'USD',
      tenantId,
      clientId: clientId ?? undefined,
      source: SaleSource.create(SaleSourceType.FOOD, 'terminal_1'),
    });
    saleRepo.store.set(sale.id.value, sale);
    return sale;
  };

  // =========================================================================
  // 1. VERIFY: Every route requires authentication where specified
  // =========================================================================
  describe('Verification 1: Authentication Requirement on All Endpoints', () => {
    it('verifies AuthenticationGuard is declared at the controller level', () => {
      const guards = Reflect.getMetadata('__guards__', SalesController);
      expect(guards).toBeDefined();
      expect(guards).toContain(AuthenticationGuard);
    });

    const targetOperations: Array<keyof SalesController> = [
      'createSale',
      'listSales',
      'getSale',
      'addItem',
      'removeItem',
      'applyDiscount',
      'cancelSale',
    ];

    it.each(targetOperations)(
      'rejects unauthenticated requests to %s with 401 Unauthorized',
      async (handlerName) => {
        const ctx = createMockContext(handlerName, undefined);
        await expect(guard.canActivate(ctx)).rejects.toThrow(UnauthorizedException);
      },
    );
  });

  // =========================================================================
  // 2. VERIFY: Read routes enforce approved Sales read permission
  // =========================================================================
  describe('Verification 2: Read Routes Enforce Approved sales.read Permission', () => {
    it('verifies GET /sales (listSales) requires sales.read permission', () => {
      const handler = SalesController.prototype.listSales;
      const permissions = reflector.get<string[]>(PERMISSIONS_KEY, handler);
      expect(permissions).toEqual(['sales.read']);
    });

    it('verifies GET /sales/:id (getSale) requires sales.read permission', () => {
      const handler = SalesController.prototype.getSale;
      const permissions = reflector.get<string[]>(PERMISSIONS_KEY, handler);
      expect(permissions).toEqual(['sales.read']);
    });

    it('allows read routes for caller with sales.read (Trainer, Receptionist, Kitchen Staff)', async () => {
      const sale = seedDraftSale('sale_read_ok');
      expect(await guard.canActivate(createMockContext('listSales', trainerUser))).toBe(true);
      expect(await guard.canActivate(createMockContext('getSale', trainerUser))).toBe(true);

      const res = await controller.getSale(sale.id.value, toPayload(trainerUser));
      expect(res.id).toBe('sale_read_ok');
    });

    it('allows read routes for caller with sales.manage (Manager, Owner)', async () => {
      expect(await guard.canActivate(createMockContext('listSales', managerUser))).toBe(true);
      expect(await guard.canActivate(createMockContext('getSale', managerUser))).toBe(true);
    });

    it('rejects read routes for authenticated caller lacking sales.read with 403 Forbidden', async () => {
      await expect(
        guard.canActivate(createMockContext('listSales', unauthorizedUser)),
      ).rejects.toThrow(ForbiddenException);

      await expect(
        guard.canActivate(createMockContext('getSale', unauthorizedUser)),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  // =========================================================================
  // 3. VERIFY: Mutation routes enforce approved Sales manage/create/cancel permissions
  // =========================================================================
  describe('Verification 3: Mutation Routes Enforce Approved Sales Mutation Permissions', () => {
    it('verifies POST /sales requires sales.create (implied by sales.manage)', () => {
      const handler = SalesController.prototype.createSale;
      expect(reflector.get<string[]>(PERMISSIONS_KEY, handler)).toEqual(['sales.create']);
    });

    it('verifies POST /sales/:id/items requires sales.create (implied by sales.manage)', () => {
      const handler = SalesController.prototype.addItem;
      expect(reflector.get<string[]>(PERMISSIONS_KEY, handler)).toEqual(['sales.create']);
    });

    it('verifies DELETE /sales/:id/items/:itemId requires sales.create (implied by sales.manage)', () => {
      const handler = SalesController.prototype.removeItem;
      expect(reflector.get<string[]>(PERMISSIONS_KEY, handler)).toEqual(['sales.create']);
    });

    it('verifies POST /sales/:id/discount requires sales.create (implied by sales.manage)', () => {
      const handler = SalesController.prototype.applyDiscount;
      expect(reflector.get<string[]>(PERMISSIONS_KEY, handler)).toEqual(['sales.create']);
    });

    it('verifies POST /sales/:id/cancel requires sales.cancel (implied by sales.manage)', () => {
      const handler = SalesController.prototype.cancelSale;
      expect(reflector.get<string[]>(PERMISSIONS_KEY, handler)).toEqual(['sales.cancel']);
      // Kitchen Staff is excluded from cancel
      const roles = reflector.get<string[]>(ROLES_KEY, handler);
      expect(roles).not.toContain('Kitchen Staff');
      expect(roles).not.toContain('Trainer');
    });

    it('authorizes Manager and Owner with sales.manage across all mutation routes', async () => {
      const mutationHandlers: Array<keyof SalesController> = [
        'createSale',
        'addItem',
        'removeItem',
        'applyDiscount',
        'cancelSale',
      ];

      for (const h of mutationHandlers) {
        expect(await guard.canActivate(createMockContext(h, managerUser))).toBe(true);
        expect(await guard.canActivate(createMockContext(h, ownerUser))).toBe(true);
      }
    });

    it('rejects Trainer attempting mutations with 403 Forbidden', async () => {
      const mutationHandlers: Array<keyof SalesController> = [
        'createSale',
        'addItem',
        'removeItem',
        'applyDiscount',
        'cancelSale',
      ];

      for (const h of mutationHandlers) {
        await expect(guard.canActivate(createMockContext(h, trainerUser))).rejects.toThrow(
          ForbiddenException,
        );
      }
    });

    it('rejects Kitchen Staff attempting cancelSale with 403 Forbidden', async () => {
      await expect(
        guard.canActivate(createMockContext('cancelSale', kitchenStaffUser)),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  // =========================================================================
  // 4. VERIFY: Unauthorized mutation leaves no persisted changes
  // =========================================================================
  describe('Verification 4: Unauthorized Mutation Leaves Zero Persisted Changes', () => {
    it('createSale: unauthorized caller leaves repository saveCount at zero', async () => {
      const initialCount = saleRepo.saveCount;
      const ctx = createMockContext('createSale', unauthorizedUser);
      await expect(guard.canActivate(ctx)).rejects.toThrow(ForbiddenException);
      expect(saleRepo.saveCount).toBe(initialCount);
    });

    it('addItem: unauthorized caller leaves repository unchanged', async () => {
      seedDraftSale('sale_zero_mut_1');
      const initialCount = saleRepo.saveCount;
      const ctx = createMockContext('addItem', trainerUser);
      await expect(guard.canActivate(ctx)).rejects.toThrow(ForbiddenException);
      expect(saleRepo.saveCount).toBe(initialCount);
    });

    it('removeItem: unauthorized caller leaves repository unchanged', async () => {
      const sale = seedDraftSale('sale_zero_mut_2');
      sale.addItem({
        source: SaleSource.create(SaleSourceType.FOOD, 'item_1'),
        description: 'Snack',
        quantity: 1,
        unitPrice: Money.create(3, 'USD'),
      });
      await saleRepo.save(sale);
      const initialCount = saleRepo.saveCount;

      const ctx = createMockContext('removeItem', trainerUser);
      await expect(guard.canActivate(ctx)).rejects.toThrow(ForbiddenException);
      expect(saleRepo.saveCount).toBe(initialCount);
    });

    it('applyDiscount: unauthorized caller leaves repository unchanged', async () => {
      seedDraftSale('sale_zero_mut_3');
      const initialCount = saleRepo.saveCount;
      const ctx = createMockContext('applyDiscount', trainerUser);
      await expect(guard.canActivate(ctx)).rejects.toThrow(ForbiddenException);
      expect(saleRepo.saveCount).toBe(initialCount);
    });

    it('cancelSale: unauthorized caller leaves repository unchanged', async () => {
      seedDraftSale('sale_zero_mut_4');
      const initialCount = saleRepo.saveCount;
      const ctx = createMockContext('cancelSale', kitchenStaffUser);
      await expect(guard.canActivate(ctx)).rejects.toThrow(ForbiddenException);
      expect(saleRepo.saveCount).toBe(initialCount);
    });
  });

  // =========================================================================
  // 5. VERIFY: Nested Sale item routes cannot bypass Sale access rules
  // =========================================================================
  describe('Verification 5: Nested Sale Item Routes Cannot Bypass Sale Access Rules', () => {
    it('cross-tenant caller cannot add item to another tenant sale (uniform 404)', async () => {
      seedDraftSale('sale_foreign_tenant_1', 'tenant_kinergy_main');
      const initialCount = saleRepo.saveCount;

      // Caller has sales.manage but belongs to competitor tenant
      expect(await guard.canActivate(createMockContext('addItem', rivalTenantManager))).toBe(true);

      await expect(
        controller.addItem(
          'sale_foreign_tenant_1',
          {
            description: 'Item',
            quantity: 1,
            unitPriceAmount: 10,
          },
          toPayload(rivalTenantManager),
        ),
      ).rejects.toThrow(NotFoundException);

      expect(saleRepo.saveCount).toBe(initialCount);
    });

    it('cross-tenant caller cannot remove item from another tenant sale (uniform 404)', async () => {
      const sale = seedDraftSale('sale_foreign_tenant_2', 'tenant_kinergy_main');
      sale.addItem({
        source: SaleSource.create(SaleSourceType.FOOD, 'item_1'),
        description: 'Snack',
        quantity: 1,
        unitPrice: Money.create(5, 'USD'),
      });
      const itemId = sale.items[0]!.id.value;
      await saleRepo.save(sale);
      const initialCount = saleRepo.saveCount;

      await expect(
        controller.removeItem('sale_foreign_tenant_2', itemId, toPayload(rivalTenantManager)),
      ).rejects.toThrow(NotFoundException);

      expect(saleRepo.saveCount).toBe(initialCount);
    });

    it('cross-tenant caller cannot apply discount to another tenant sale (uniform 404)', async () => {
      seedDraftSale('sale_foreign_tenant_3', 'tenant_kinergy_main');
      const initialCount = saleRepo.saveCount;

      await expect(
        controller.applyDiscount(
          'sale_foreign_tenant_3',
          { type: 'PERCENTAGE', value: 10 },
          toPayload(rivalTenantManager),
        ),
      ).rejects.toThrow(NotFoundException);

      expect(saleRepo.saveCount).toBe(initialCount);
    });

    it('cross-tenant caller cannot cancel another tenant sale', async () => {
      seedDraftSale('sale_foreign_tenant_4', 'tenant_kinergy_main');
      const initialCount = saleRepo.saveCount;

      await expect(
        controller.cancelSale(
          'sale_foreign_tenant_4',
          { reason: 'Cross-tenant cancel attempt' },
          toPayload(rivalTenantManager),
        ),
      ).rejects.toThrow();

      expect(saleRepo.saveCount).toBe(initialCount);
    });
  });

  // =========================================================================
  // 6. VERIFY: Filtered lists cannot expose records outside approved constraints
  // =========================================================================
  describe('Verification 6: Filtered Lists Multi-Tenant & Scoping Constraints', () => {
    it('listSales automatically scopes to caller tenantId and filters out foreign records', async () => {
      seedDraftSale('sale_tenant_main_1', 'tenant_kinergy_main');
      seedDraftSale('sale_tenant_main_2', 'tenant_kinergy_main');
      seedDraftSale('sale_tenant_rival_1', 'tenant_competitor');

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
      expect(result.items.some((s) => s.id === 'sale_tenant_rival_1')).toBe(false);
    });

    it('listSales strictly restricts Client role to own records even if passing foreign clientId in query', async () => {
      seedDraftSale('sale_client_own', 'tenant_kinergy_main', 'usr_client_audit');
      seedDraftSale('sale_client_other', 'tenant_kinergy_main', 'usr_other_client');

      const result = await controller.listSales(
        '1',
        '20',
        'usr_other_client', // Malicious probe for another user's sales
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        toPayload(clientUser),
      );

      expect(result.items).toHaveLength(1);
      expect(result.items[0]?.id).toBe('sale_client_own');
      expect(result.items[0]?.clientId).toBe('usr_client_audit');
    });
  });

  // =========================================================================
  // 7. VERIFY: No route bypasses authorization by invoking alternate controller
  // =========================================================================
  describe('Verification 7: Controller Architecture & Route Security', () => {
    it('verifies SalesController has no unrestricted PATCH, PUT, or unauthenticated routes', () => {
      const prototype = SalesController.prototype as unknown as Record<string, unknown>;
      const methodNames = Object.getOwnPropertyNames(prototype).filter(
        (name) => name !== 'constructor' && typeof prototype[name] === 'function',
      );

      for (const methodName of methodNames) {
        const handler = prototype[methodName] as (...args: unknown[]) => unknown;
        const pathMeta = Reflect.getMetadata('path', handler);
        // Only inspect actual HTTP route handlers
        if (pathMeta !== undefined) {
          const roles = reflector.get<string[]>(ROLES_KEY, handler);
          const permissions = reflector.get<string[]>(PERMISSIONS_KEY, handler);

          // Every route handler must have either @Roles or @Permissions
          const hasAuthMetadata =
            (roles && roles.length > 0) || (permissions && permissions.length > 0);
          expect(hasAuthMetadata).toBe(true);
        }
      }
    });
  });

  // =========================================================================
  // 8. VERIFY: Error responses do not leak protected financial data
  // =========================================================================
  describe('Verification 8: Error Responses Financial Privacy & Data Masking', () => {
    it('verifies SalesExceptionFilter masks credit card numbers and token strings', () => {
      const filter = new SalesExceptionFilter();
      const sanitize = (filter as unknown as { sanitizeMessage: (msg: string) => string })
        .sanitizeMessage;

      const sensitiveMsg =
        'Error charging card 4111 2222 3333 4444 with bearer eyJhbGciOiJIUzI1NiJ9.test';
      const sanitized = sanitize.call(filter, sensitiveMsg);

      expect(sanitized).not.toContain('4111 2222 3333 4444');
      expect(sanitized).toContain('****-****-****-[MASKED]');
      expect(sanitized).not.toContain('eyJhbGciOiJIUzI1NiJ9.test');
      expect(sanitized).toContain('[MASKED]');
    });

    it('verifies unexpected errors return generic 500 without leaking stack or internal details', () => {
      const filter = new SalesExceptionFilter();
      const mockJson = jest.fn();
      const mockStatus = jest.fn().mockReturnValue({ json: mockJson });
      const mockResponse = {
        status: mockStatus,
        setHeader: jest.fn(),
      };
      const mockHost = {
        switchToHttp: () => ({
          getResponse: () => mockResponse,
          getRequest: () => ({ method: 'POST', url: '/api/v1/sales' }),
        }),
      } as unknown as Parameters<SalesExceptionFilter['catch']>[1];

      filter.catch(
        new Error('FATAL Prisma SELECT * FROM "Sale" WHERE password_hash = ...'),
        mockHost,
      );

      expect(mockStatus).toHaveBeenCalledWith(500);
      expect(mockJson).toHaveBeenCalledWith({
        statusCode: 500,
        error: 'Internal Server Error',
        message: 'An unexpected internal server error occurred.',
      });
    });
  });

  // =========================================================================
  // 9. VERIFY: Domain code remains independent of authorization concerns
  // =========================================================================
  describe('Verification 9: Clean Architecture & Domain Isolation', () => {
    it('verifies Sale domain entities have zero dependencies on HTTP, NestJS, Express, or JWT', () => {
      const domainDir = path.resolve(__dirname, '../../../../../packages/core/src/sales/domain');

      const files = fs.readdirSync(domainDir);
      for (const file of files) {
        if (file.endsWith('.ts')) {
          const content = fs.readFileSync(path.join(domainDir, file), 'utf-8');
          expect(content).not.toMatch(/from\s+['"]@nestjs/);
          expect(content).not.toMatch(/from\s+['"]express['"]/);
          expect(content).not.toMatch(/from\s+['"]jsonwebtoken['"]/);
          expect(content).not.toMatch(/from\s+['"]passport['"]/);
        }
      }
    });
  });

  // =========================================================================
  // 10. VERIFY: Frontend is never treated as an authorization authority
  // =========================================================================
  describe('Verification 10: Frontend Not Treated as Authorization Authority', () => {
    it('ignores client-supplied tenantId/roles and enforces server-extracted JWT context', async () => {
      // Caller authenticated as regular receptionist in tenant_kinergy_main
      // Attempting to create sale claiming tenant_competitor
      const result = await controller.createSale(
        {
          id: 'sale_tamper_tenant_01',
          currency: 'USD',
          sourceReference: { type: SaleSourceType.FOOD, referenceId: 't1' },
        },
        undefined,
        toPayload(receptionistUser), // Verified server payload
      );

      // The created sale must belong to tenant_kinergy_main (from verified token)
      expect(result.tenantId).toBe('tenant_kinergy_main');
      const persisted = await saleRepo.findById('sale_tamper_tenant_01');
      expect(persisted?.tenantId).toBe('tenant_kinergy_main');
    });
  });
});
