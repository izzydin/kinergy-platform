import { ExecutionContext, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PaymentsController } from '../controllers/payments.controller';
import { AuthorizationGuard } from '../../platform/identity/authorization/authorization.guard';
import { DefaultAuthorizationEvaluator } from '../../platform/identity/authorization/default-authorization-evaluator';
import { IPermissionResolver } from '../../platform/identity/authorization/authorization.interface';
import { AuthenticatedUserContext } from '../../platform/identity/context/authenticated-user-context';
import { ROLES_KEY } from '../../platform/identity/authorization/decorators/roles.decorator';
import { PERMISSIONS_KEY } from '../../platform/identity/authorization/decorators/permissions.decorator';
import {
  Payment,
  PaymentId,
  SaleId,
  Money,
  PaymentMethod,
  PaymentStatus,
  Sale,
  SaleSource,
  SaleSourceType,
  PaymentRepositoryPort,
  SaleRepositoryPort,
  FindPaymentsCriteria,
  FindPaymentsPagination,
  FindPaymentsSort,
  PaginatedResultDTO,
  PaymentDTO,
} from '@kinergy-platform/core';

class MockPaymentRepo implements PaymentRepositoryPort {
  public payments: Payment[] = [];

  async findById(id: PaymentId | string): Promise<Payment | null> {
    const key = typeof id === 'string' ? id.trim() : id.value;
    return this.payments.find((p) => p.id.value === key) ?? null;
  }

  async findBySaleId(saleId: SaleId | string): Promise<Payment[]> {
    const key = typeof saleId === 'string' ? saleId.trim() : saleId.value;
    return this.payments.filter((p) => p.saleId.value === key);
  }

  async save(payment: Payment): Promise<void> {
    const idx = this.payments.findIndex((p) => p.id.equals(payment.id));
    if (idx >= 0) {
      this.payments[idx] = payment;
    } else {
      this.payments.push(payment);
    }
  }

  async findMany(
    criteria: FindPaymentsCriteria,
    pagination: FindPaymentsPagination,
    _sort?: FindPaymentsSort,
  ): Promise<{ items: Payment[]; total: number }> {
    let filtered = [...this.payments];
    if (criteria.tenantId) {
      filtered = filtered.filter((p) => p.tenantId === criteria.tenantId);
    }
    if (criteria.saleId) {
      filtered = filtered.filter((p) => p.saleId.value === criteria.saleId);
    }
    return {
      items: filtered.slice(
        (pagination.page - 1) * pagination.limit,
        pagination.page * pagination.limit,
      ),
      total: filtered.length,
    };
  }
}

class MockSaleRepo implements SaleRepositoryPort {
  public store = new Map<string, Sale>();

  async findById(id: SaleId | string): Promise<Sale | null> {
    const key = typeof id === 'string' ? id.trim() : id.value;
    return this.store.get(key) ?? null;
  }

  async save(sale: Sale): Promise<void> {
    this.store.set(sale.id.value, sale);
  }
}

describe('Payments Read Operations Authorization Specification (payments:read / payments.read)', () => {
  let reflector: Reflector;
  let permissionResolver: jest.Mocked<IPermissionResolver>;
  let evaluator: DefaultAuthorizationEvaluator;
  let guard: AuthorizationGuard;

  let paymentRepo: MockPaymentRepo;
  let saleRepo: MockSaleRepo;
  let controller: PaymentsController;

  const tenantMain = 'tenant_main';
  const saleId = 'sale_order_101';
  const paymentId = 'pay_tx_501';

  // ---------------------------------------------------------------------------
  // Canonical User Contexts
  // ---------------------------------------------------------------------------
  const userWithColonNotation = new AuthenticatedUserContext({
    userId: 'usr_recept_colon',
    email: 'cashier@kinergy.platform',
    status: 'ACTIVE',
    roles: ['Receptionist'],
    permissions: ['payments:read'], // Colon notation
    tenantId: tenantMain,
  });

  const userWithDotNotation = new AuthenticatedUserContext({
    userId: 'usr_recept_dot',
    email: 'cashier2@kinergy.platform',
    status: 'ACTIVE',
    roles: ['Receptionist'],
    permissions: ['payments.read'], // Canonical dot notation
    tenantId: tenantMain,
  });

  const userWithManagePermission = new AuthenticatedUserContext({
    userId: 'usr_mgr_manage',
    email: 'manager@kinergy.platform',
    status: 'ACTIVE',
    roles: ['Manager'],
    permissions: ['payments:manage'], // payments:manage covers payments:read
    tenantId: tenantMain,
  });

  const userWithBillingRead = new AuthenticatedUserContext({
    userId: 'usr_billing_read',
    email: 'auditor@kinergy.platform',
    status: 'ACTIVE',
    roles: ['Receptionist'],
    permissions: ['billing:read'], // billing:read covers payments:read
    tenantId: tenantMain,
  });

  const userMissingPermission = new AuthenticatedUserContext({
    userId: 'usr_unauth_staff',
    email: 'unauth@kinergy.platform',
    status: 'ACTIVE',
    roles: ['Receptionist'],
    permissions: ['sales.read', 'inventory.read'], // Missing payments:read / payments.read
    tenantId: tenantMain,
  });

  const trainerUser = new AuthenticatedUserContext({
    userId: 'usr_trainer',
    email: 'trainer@kinergy.platform',
    status: 'ACTIVE',
    roles: ['Trainer'],
    permissions: ['sales.read', 'reports.read'],
    tenantId: tenantMain,
  });

  const clientUser = new AuthenticatedUserContext({
    userId: 'usr_client_alice',
    email: 'alice@example.com',
    status: 'ACTIVE',
    roles: ['Client'],
    permissions: ['client.portal.read'],
    tenantId: tenantMain,
  });

  beforeEach(() => {
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

    paymentRepo = new MockPaymentRepo();
    saleRepo = new MockSaleRepo();
    controller = new PaymentsController(paymentRepo, saleRepo);

    // Seed test sale & payment
    const sale = Sale.create({
      id: SaleId.create(saleId),
      tenantId: tenantMain,
      clientId: 'usr_client_alice',
      currency: 'USD',
      source: SaleSource.create(SaleSourceType.FOOD, 'order-101'),
    });
    saleRepo.store.set(saleId, sale);

    const payment = Payment.createCompleted({
      id: PaymentId.create(paymentId),
      tenantId: tenantMain,
      saleId: SaleId.create(saleId),
      method: PaymentMethod.CASH,
      amount: Money.create(75.5, 'USD'),
      reference: 'POS-REC-1',
    });
    paymentRepo.payments.push(payment);
  });

  const createMockContext = (
    handlerName: keyof PaymentsController,
    userContext?: AuthenticatedUserContext,
  ): ExecutionContext => {
    return {
      getHandler: () => PaymentsController.prototype[handlerName],
      getClass: () => PaymentsController,
      switchToHttp: () => ({
        getRequest: () => ({
          user: userContext,
        }),
      }),
    } as unknown as ExecutionContext;
  };

  // ===========================================================================
  // 1. Route Metadata & Decorator Audit
  // ===========================================================================
  describe('1. Route Metadata & Decorator Audit', () => {
    const readEndpoints: Array<{
      name: string;
      handler: keyof PaymentsController;
      roles: string[];
      permissions: string[];
    }> = [
      {
        name: 'GetPaymentById (GET /payments/:paymentId)',
        handler: 'getPaymentById',
        roles: ['Owner', 'Manager', 'Receptionist', 'Kitchen Staff'],
        permissions: ['payments.read'],
      },
      {
        name: 'GetPayment (GET /payments/:paymentId/detail)',
        handler: 'getPayment',
        roles: ['Owner', 'Manager', 'Receptionist'],
        permissions: ['payments.read'],
      },
      {
        name: 'ListPayments (GET /payments)',
        handler: 'listPayments',
        roles: ['Owner', 'Manager', 'Receptionist'],
        permissions: ['payments.read'],
      },
      {
        name: 'GetPaymentsBySaleId (GET /sales/:saleId/payments)',
        handler: 'getPaymentsBySaleId',
        roles: ['Owner', 'Manager', 'Receptionist', 'Kitchen Staff'],
        permissions: ['payments.read'],
      },
      {
        name: 'GetSalePaymentHistory (GET /sales/:saleId/payments/history)',
        handler: 'getSalePaymentHistory',
        roles: ['Owner', 'Manager', 'Receptionist'],
        permissions: ['payments.read'],
      },
    ];

    it.each(readEndpoints)(
      'verifies $name enforces payments.read and authorized roles',
      ({ handler, roles: expectedRoles, permissions: expectedPermissions }) => {
        const fn = PaymentsController.prototype[handler];
        const actualRoles = reflector.get<string[]>(ROLES_KEY, fn);
        const actualPermissions = reflector.get<string[]>(PERMISSIONS_KEY, fn);

        expect(actualPermissions).toEqual(expectedPermissions);
        expect(actualRoles).toEqual(expectedRoles);
      },
    );
  });

  // ===========================================================================
  // 2. Permission Evaluation: Colon-Notation & Dot-Notation Equivalence
  // ===========================================================================
  describe('2. Permission Evaluation: Colon-Notation & Dot-Notation Integration', () => {
    const readHandlers: Array<keyof PaymentsController> = [
      'getPaymentById',
      'getPayment',
      'listPayments',
      'getPaymentsBySaleId',
      'getSalePaymentHistory',
    ];

    it.each(readHandlers)(
      'authorizes caller with colon-notation payments:read for %s',
      async (handlerName) => {
        const context = createMockContext(handlerName, userWithColonNotation);
        const isAuthorized = await guard.canActivate(context);
        expect(isAuthorized).toBe(true);
      },
    );

    it.each(readHandlers)(
      'authorizes caller with canonical dot-notation payments.read for %s',
      async (handlerName) => {
        const context = createMockContext(handlerName, userWithDotNotation);
        const isAuthorized = await guard.canActivate(context);
        expect(isAuthorized).toBe(true);
      },
    );

    it.each(readHandlers)(
      'authorizes caller with payments:manage covering payments:read for %s',
      async (handlerName) => {
        const context = createMockContext(handlerName, userWithManagePermission);
        const isAuthorized = await guard.canActivate(context);
        expect(isAuthorized).toBe(true);
      },
    );

    it.each(readHandlers)(
      'authorizes caller with legacy billing:read covering payments:read for %s',
      async (handlerName) => {
        const context = createMockContext(handlerName, userWithBillingRead);
        const isAuthorized = await guard.canActivate(context);
        expect(isAuthorized).toBe(true);
      },
    );
  });

  // ===========================================================================
  // 3. Denial Enforcement: Missing Permission & Unauthenticated Callers
  // ===========================================================================
  describe('3. Denial Enforcement: Missing Permission & Unauthenticated Requests', () => {
    const readHandlers: Array<keyof PaymentsController> = [
      'getPaymentById',
      'getPayment',
      'listPayments',
      'getPaymentsBySaleId',
      'getSalePaymentHistory',
    ];

    it.each(readHandlers)(
      'denies caller missing payments:read on %s with ForbiddenException',
      async (handlerName) => {
        const context = createMockContext(handlerName, userMissingPermission);
        await expect(guard.canActivate(context)).rejects.toThrow(ForbiddenException);
      },
    );

    it.each(readHandlers)(
      'strictly denies Trainer on %s due to lack of payment read entitlement',
      async (handlerName) => {
        const context = createMockContext(handlerName, trainerUser);
        await expect(guard.canActivate(context)).rejects.toThrow(ForbiddenException);
      },
    );

    it.each(readHandlers)(
      'strictly denies unauthenticated caller on %s with UnauthorizedException',
      async (handlerName) => {
        const context = createMockContext(handlerName, undefined);
        await expect(guard.canActivate(context)).rejects.toThrow(UnauthorizedException);
      },
    );

    it.each(readHandlers)(
      'strictly denies client portal user on %s lacking payments:read',
      async (handlerName) => {
        const context = createMockContext(handlerName, clientUser);
        await expect(guard.canActivate(context)).rejects.toThrow(ForbiddenException);
      },
    );
  });

  // ===========================================================================
  // 4. End-to-End Controller Query Execution & Data Leak Prevention
  // ===========================================================================
  describe('4. Controller Read Operations Execution & Zero Financial Data Leakage', () => {
    it('executes getPaymentById successfully for authorized user returning PaymentResponseDto', async () => {
      const userPayload = {
        id: 'usr_recept_colon',
        email: 'cashier@kinergy.platform',
        status: 'ACTIVE',
        roles: ['Receptionist'],
        permissions: ['payments:read'],
        tenantId: tenantMain,
      };

      const response = await controller.getPaymentById(paymentId, userPayload);
      expect(response).toBeDefined();
      expect(response.id).toBe(paymentId);
      expect(response.saleId).toBe(saleId);
      expect(response.amountValue).toBe(75.5);
      expect(response.status).toBe(PaymentStatus.COMPLETED);
    });

    it('executes getSalePaymentHistory successfully returning chronological records', async () => {
      const userPayload = {
        id: 'usr_recept_dot',
        email: 'cashier2@kinergy.platform',
        status: 'ACTIVE',
        roles: ['Receptionist'],
        permissions: ['payments.read'],
        tenantId: tenantMain,
      };

      const history = await controller.getSalePaymentHistory(saleId, userPayload);
      expect(history).toHaveLength(1);
      expect(history[0]!.id).toBe(paymentId);
      expect(history[0]!.reference).toBe('POS-REC-1');
    });

    it('executes listPayments successfully with pagination metadata', async () => {
      const userPayload = {
        id: 'usr_mgr_manage',
        email: 'manager@kinergy.platform',
        status: 'ACTIVE',
        roles: ['Manager'],
        permissions: ['payments:manage'],
        tenantId: tenantMain,
      };

      const result = (await controller.listPayments(
        { page: 1, limit: 10 },
        userPayload,
      )) as PaginatedResultDTO<PaymentDTO>;
      expect(result.items).toHaveLength(1);
      expect(result.total).toBe(1);
      expect(result.page).toBe(1);
    });

    it('denies access without disclosing financial details when non-existent sale or unauthorized sale requested', async () => {
      const userPayload = {
        id: 'usr_client_alice',
        email: 'alice@example.com',
        status: 'ACTIVE',
        roles: ['Client'],
        permissions: ['payments:read'],
        tenantId: tenantMain,
      };

      // Querying an unrelated sale that client does not own
      await expect(
        controller.getSalePaymentHistory('unrelated_sale_999', userPayload),
      ).rejects.toThrow();
    });
  });
});
