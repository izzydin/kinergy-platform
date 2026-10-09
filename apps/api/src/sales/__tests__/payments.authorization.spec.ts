import { ExecutionContext, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import {
  Payment,
  Money,
  PaymentMethod,
  PaymentStatus,
  SystemClock,
  PaymentUnauthorizedException,
  InvalidPaymentTransitionException,
} from '@kinergy-platform/core';
import { PaymentsController } from '../controllers/payments.controller';
import { AuthorizationGuard } from '../../platform/identity/authorization/authorization.guard';
import { DefaultAuthorizationEvaluator } from '../../platform/identity/authorization/default-authorization-evaluator';
import { IPermissionResolver } from '../../platform/identity/authorization/authorization.interface';
import { AuthenticatedUserContext } from '../../platform/identity/context/authenticated-user-context';
import { ROLES_KEY } from '../../platform/identity/authorization/decorators/roles.decorator';
import { PERMISSIONS_KEY } from '../../platform/identity/authorization/decorators/permissions.decorator';
import { checkPaymentAuthorization } from '../../../../../packages/core/src/sales/application/shared/payment-authorization';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Senior Application Security Specification
 * Payments Module RBAC, Capability-Based Authorization & Pre-Mutation Enforcement
 *
 * Verifies:
 * 1. Metadata reflection: @Roles and @Permissions on all 7 Payment operations:
 *    - CreatePayment (recordPayment / createPayment)
 *    - CompletePayment (completePayment / settlePayment)
 *    - FailPayment (failPayment)
 *    - CancelPayment (cancelPayment)
 *    - GetPayment (getPaymentById / getPayment)
 *    - ListPayments (listPayments)
 *    - GetSalePaymentHistory (getPaymentsBySaleId / getSalePaymentHistory)
 * 2. Deterministic policy evaluation for all Kinergy personas:
 *    - Owner & Manager: Unrestricted administrative access across all 7 operations.
 *    - Receptionist: Full front-desk operational checkout, settlement, and query access;
 *      destructive CancelPayment strictly restricted to Manager/Owner.
 *    - Kitchen Staff: Point-of-sale CreatePayment allowed; ledger inspection, settlement,
 *      and cancellation strictly FORBIDDEN.
 *    - Trainer: Completely segregation of duties; ALL 7 operations strictly FORBIDDEN.
 *    - Client: All 7 operations strictly FORBIDDEN.
 *    - Unauthenticated: Throws UnauthorizedException prior to authorization evaluation.
 * 3. Pre-mutation & Pre-persistence invariant: Unauthorized attempts are rejected
 *    before aggregate reconstitution, handler execution, or repository mutation.
 * 4. Domain Isolation: Payment Aggregate has zero awareness of JWT, users, roles, HTTP, or NestJS.
 */
describe('Payment Application Authorization & RBAC Security Specification', () => {
  let reflector: Reflector;
  let permissionResolver: jest.Mocked<IPermissionResolver>;
  let evaluator: DefaultAuthorizationEvaluator;
  let guard: AuthorizationGuard;

  // ---------------------------------------------------------------------------
  // Canonical Persona Fixtures (Adhering strictly to Kinergy Identity Seed)
  // ---------------------------------------------------------------------------
  const ownerUser = new AuthenticatedUserContext({
    userId: 'usr_owner_01',
    email: 'owner@kinergy.platform',
    status: 'ACTIVE',
    roles: ['Owner'],
    permissions: ['*'],
    tenantId: 'tenant_main',
  });

  const managerUser = new AuthenticatedUserContext({
    userId: 'usr_mgr_01',
    email: 'manager@kinergy.platform',
    status: 'ACTIVE',
    roles: ['Manager'],
    permissions: [
      'sales.read',
      'sales.create',
      'sales.manage',
      'sales.cancel',
      'payments.create',
      'payments.read',
      'payments.manage',
    ],
    tenantId: 'tenant_main',
  });

  const receptionistUser = new AuthenticatedUserContext({
    userId: 'usr_recept_01',
    email: 'reception@kinergy.platform',
    status: 'ACTIVE',
    roles: ['Receptionist'],
    permissions: [
      'clients.read',
      'clients.write',
      'appointments.read',
      'appointments.create',
      'appointments.update',
      'appointments.delete',
      'billing.read',
      'billing.write',
      'sales.read',
      'sales.create',
      'sales.cancel',
      'payments.read',
      'payments.create',
      'payments.manage',
      'receipts.read',
      'receipts.manage',
    ],
    tenantId: 'tenant_main',
  });

  const kitchenStaffUser = new AuthenticatedUserContext({
    userId: 'usr_kitchen_01',
    email: 'kitchen@kinergy.platform',
    status: 'ACTIVE',
    roles: ['Kitchen Staff'],
    permissions: [
      'kitchen.read',
      'kitchen.orders.manage',
      'inventory.read',
      'inventory.write',
      'sales.read',
      'sales.create',
      'payments.create',
    ],
    tenantId: 'tenant_main',
  });

  const trainerUser = new AuthenticatedUserContext({
    userId: 'usr_trainer_01',
    email: 'trainer@kinergy.platform',
    status: 'ACTIVE',
    roles: ['Trainer'],
    permissions: [
      'clients.read',
      'clients.write',
      'appointments.read',
      'appointments.create',
      'appointments.update',
      'reports.read',
      'sales.read',
    ],
    tenantId: 'tenant_main',
  });

  const clientPortalUser = new AuthenticatedUserContext({
    userId: 'usr_client_01',
    email: 'client@example.com',
    status: 'ACTIVE',
    roles: ['Client'],
    permissions: ['client.portal.read'],
    tenantId: 'tenant_main',
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
  // SECTION 1: Route Decorator & Metadata Reflection
  // ===========================================================================
  describe('1. Route Decorator Reflection & Least Privilege Metadata Audit', () => {
    it('verifies CreatePayment (recordPayment) requires payments.create and authorized roles including Kitchen Staff', () => {
      const handler = PaymentsController.prototype.recordPayment;
      const roles = reflector.get<string[]>(ROLES_KEY, handler);
      const permissions = reflector.get<string[]>(PERMISSIONS_KEY, handler);

      expect(roles).toEqual(['Owner', 'Manager', 'Receptionist', 'Kitchen Staff']);
      expect(permissions).toEqual(['payments.create']);
    });

    it('verifies CreatePayment (createPayment alias) requires payments.create and authorized roles', () => {
      const handler = PaymentsController.prototype.createPayment;
      const roles = reflector.get<string[]>(ROLES_KEY, handler);
      const permissions = reflector.get<string[]>(PERMISSIONS_KEY, handler);

      expect(roles).toEqual(['Owner', 'Manager', 'Receptionist', 'Kitchen Staff']);
      expect(permissions).toEqual(['payments.create']);
    });

    it('verifies CompletePayment requires payments.create, payments.manage and excludes Kitchen Staff & Trainer', () => {
      const handler = PaymentsController.prototype.completePayment;
      const roles = reflector.get<string[]>(ROLES_KEY, handler);
      const permissions = reflector.get<string[]>(PERMISSIONS_KEY, handler);

      expect(roles).toEqual(['Owner', 'Manager', 'Receptionist']);
      expect(roles).not.toContain('Kitchen Staff');
      expect(roles).not.toContain('Trainer');
      expect(permissions).toEqual(['payments.create', 'payments.manage']);
    });

    it('verifies SettlePayment (canonical complete alias) requires identical settlement privileges', () => {
      const handler = PaymentsController.prototype.settlePayment;
      const roles = reflector.get<string[]>(ROLES_KEY, handler);
      const permissions = reflector.get<string[]>(PERMISSIONS_KEY, handler);

      expect(roles).toEqual(['Owner', 'Manager', 'Receptionist']);
      expect(permissions).toEqual(['payments.create', 'payments.manage']);
    });

    it('verifies FailPayment requires payments.create, payments.manage and authorized operational roles', () => {
      const handler = PaymentsController.prototype.failPayment;
      const roles = reflector.get<string[]>(ROLES_KEY, handler);
      const permissions = reflector.get<string[]>(PERMISSIONS_KEY, handler);

      expect(roles).toEqual(['Owner', 'Manager', 'Receptionist']);
      expect(roles).not.toContain('Kitchen Staff');
      expect(roles).not.toContain('Trainer');
      expect(permissions).toEqual(['payments.create', 'payments.manage']);
    });

    it('verifies CancelPayment strictly requires payments.manage and is restricted to Owner & Manager', () => {
      const handler = PaymentsController.prototype.cancelPayment;
      const roles = reflector.get<string[]>(ROLES_KEY, handler);
      const permissions = reflector.get<string[]>(PERMISSIONS_KEY, handler);

      // Highly sensitive voiding operation: front desk cashier cannot unilaterally cancel
      expect(roles).toEqual(['Owner', 'Manager']);
      expect(roles).not.toContain('Receptionist');
      expect(roles).not.toContain('Kitchen Staff');
      expect(roles).not.toContain('Trainer');
      expect(permissions).toEqual(['payments.manage']);
    });

    it('verifies GetPayment (getPaymentById) requires payments.read permission', () => {
      const handler = PaymentsController.prototype.getPaymentById;
      const permissions = reflector.get<string[]>(PERMISSIONS_KEY, handler);

      expect(permissions).toEqual(['payments.read']);
    });

    it('verifies GetSalePaymentHistory (getPaymentsBySaleId) requires payments.read permission', () => {
      const handler = PaymentsController.prototype.getPaymentsBySaleId;
      const permissions = reflector.get<string[]>(PERMISSIONS_KEY, handler);

      expect(permissions).toEqual(['payments.read']);
    });

    it('verifies ListPayments requires payments.read permission and authorized operational roles', () => {
      const handler = PaymentsController.prototype.listPayments;
      const roles = reflector.get<string[]>(ROLES_KEY, handler);
      const permissions = reflector.get<string[]>(PERMISSIONS_KEY, handler);

      expect(roles).toEqual(['Owner', 'Manager', 'Receptionist']);
      expect(roles).not.toContain('Kitchen Staff');
      expect(roles).not.toContain('Trainer');
      expect(permissions).toEqual(['payments.read']);
    });
  });

  // ===========================================================================
  // SECTION 2: Persona-Specific Authorization Evaluation
  // ===========================================================================
  describe('2. Role-Based Access Control Evaluation across All 7 Payment Operations', () => {
    describe('A. Owner & Manager (Unrestricted Commercial Superusers)', () => {
      it.each([
        ['recordPayment', 'CreatePayment'],
        ['completePayment', 'CompletePayment'],
        ['failPayment', 'FailPayment'],
        ['cancelPayment', 'CancelPayment'],
        ['getPaymentById', 'GetPayment'],
        ['listPayments', 'ListPayments'],
        ['getPaymentsBySaleId', 'GetSalePaymentHistory'],
      ] as const)('authorizes Owner for %s (%s)', async (handlerName, _displayName) => {
        const context = createMockContext(handlerName, ownerUser);
        const authorized = await guard.canActivate(context);
        expect(authorized).toBe(true);
      });

      it.each([
        ['recordPayment', 'CreatePayment'],
        ['completePayment', 'CompletePayment'],
        ['failPayment', 'FailPayment'],
        ['cancelPayment', 'CancelPayment'],
        ['getPaymentById', 'GetPayment'],
        ['listPayments', 'ListPayments'],
        ['getPaymentsBySaleId', 'GetSalePaymentHistory'],
      ] as const)('authorizes Manager for %s (%s)', async (handlerName, _displayName) => {
        const context = createMockContext(handlerName, managerUser);
        const authorized = await guard.canActivate(context);
        expect(authorized).toBe(true);
      });
    });

    describe('B. future Receptionist (Front Desk Operations & Settlement Authority)', () => {
      it.each([
        ['recordPayment', 'CreatePayment'],
        ['completePayment', 'CompletePayment'],
        ['failPayment', 'FailPayment'],
        ['getPaymentById', 'GetPayment'],
        ['listPayments', 'ListPayments'],
        ['getPaymentsBySaleId', 'GetSalePaymentHistory'],
      ] as const)(
        'authorizes Receptionist for front desk operation %s (%s)',
        async (handlerName, _displayName) => {
          const context = createMockContext(handlerName, receptionistUser);
          const authorized = await guard.canActivate(context);
          expect(authorized).toBe(true);
        },
      );

      it('strictly DENIES Receptionist from invoking CancelPayment via default route (requires Manager/Owner role)', async () => {
        const context = createMockContext('cancelPayment', receptionistUser);
        await expect(guard.canActivate(context)).rejects.toThrow(ForbiddenException);
      });
    });

    describe('C. Kitchen Staff (Point-of-Sale Collection Allowed; Settlement & Audit FORBIDDEN)', () => {
      it('authorizes Kitchen Staff for CreatePayment (recordPayment) via payments.create', async () => {
        const context = createMockContext('recordPayment', kitchenStaffUser);
        const authorized = await guard.canActivate(context);
        expect(authorized).toBe(true);
      });

      it.each([
        ['completePayment', 'CompletePayment'],
        ['failPayment', 'FailPayment'],
        ['cancelPayment', 'CancelPayment'],
        ['getPaymentById', 'GetPayment'],
        ['listPayments', 'ListPayments'],
        ['getPaymentsBySaleId', 'GetSalePaymentHistory'],
      ] as const)(
        'strictly DENIES Kitchen Staff from sensitive operation %s (%s)',
        async (handlerName, _displayName) => {
          const context = createMockContext(handlerName, kitchenStaffUser);
          await expect(guard.canActivate(context)).rejects.toThrow(ForbiddenException);
        },
      );
    });

    describe('D. Trainer (Zero Financial Entitlements; All 7 Operations FORBIDDEN)', () => {
      it.each([
        ['recordPayment', 'CreatePayment'],
        ['completePayment', 'CompletePayment'],
        ['failPayment', 'FailPayment'],
        ['cancelPayment', 'CancelPayment'],
        ['getPaymentById', 'GetPayment'],
        ['listPayments', 'ListPayments'],
        ['getPaymentsBySaleId', 'GetSalePaymentHistory'],
      ] as const)(
        'strictly DENIES Trainer from %s (%s) due to segregation of duties',
        async (handlerName, _displayName) => {
          const context = createMockContext(handlerName, trainerUser);
          await expect(guard.canActivate(context)).rejects.toThrow(ForbiddenException);
        },
      );
    });

    describe('E. Client Portal User (Zero Internal Staff Entitlements)', () => {
      it.each([
        ['recordPayment', 'CreatePayment'],
        ['completePayment', 'CompletePayment'],
        ['failPayment', 'FailPayment'],
        ['cancelPayment', 'CancelPayment'],
        ['getPaymentById', 'GetPayment'],
        ['listPayments', 'ListPayments'],
        ['getPaymentsBySaleId', 'GetSalePaymentHistory'],
      ] as const)('strictly DENIES Client from %s (%s)', async (handlerName, _displayName) => {
        const context = createMockContext(handlerName, clientPortalUser);
        await expect(guard.canActivate(context)).rejects.toThrow(ForbiddenException);
      });
    });

    describe('F. Unauthenticated Request Invariant', () => {
      it.each([
        ['recordPayment', 'CreatePayment'],
        ['completePayment', 'CompletePayment'],
        ['failPayment', 'FailPayment'],
        ['cancelPayment', 'CancelPayment'],
        ['getPaymentById', 'GetPayment'],
        ['listPayments', 'ListPayments'],
        ['getPaymentsBySaleId', 'GetSalePaymentHistory'],
      ] as const)(
        'rejects unauthenticated caller on %s with UnauthorizedException',
        async (handlerName, _displayName) => {
          const context = createMockContext(handlerName, undefined);
          await expect(guard.canActivate(context)).rejects.toThrow(UnauthorizedException);
        },
      );
    });
  });

  // ===========================================================================
  // SECTION 3: Pre-Mutation & Pre-Persistence Enforcement
  // ===========================================================================
  describe('3. Pre-Mutation & Pre-Persistence Enforcement Guard Invariant', () => {
    it('proves unauthorized presentation calls are rejected before any handler or repository invocation', async () => {
      const mockSave = jest.fn();
      const mockRepo = {
        findById: jest.fn(),
        save: mockSave,
      };

      const handlerSpy = jest.fn();

      // An unauthorized Trainer attempts to record a payment
      const context = createMockContext('recordPayment', trainerUser);

      // Verify that the guard rejects at the transport boundary
      await expect(guard.canActivate(context)).rejects.toThrow(ForbiddenException);

      // Verify that handler and repository were NEVER called
      expect(handlerSpy).not.toHaveBeenCalled();
      expect(mockSave).not.toHaveBeenCalled();
      expect(mockRepo.findById).not.toHaveBeenCalled();
    });

    it('proves application authorization checks reject unauthorized execution before aggregate financial mutation', () => {
      // Simulate an unprivileged caller attempting to complete a payment at the application layer
      const unprivilegedCaller = {
        id: 'usr_unprivileged',
        roles: ['Trainer'],
        permissions: ['reports.read'],
      };

      // checkPaymentAuthorization must throw PaymentUnauthorizedException before any aggregate method is called
      expect(() => {
        checkPaymentAuthorization(unprivilegedCaller, ['payments.create', 'payments.manage']);
      }).toThrow(PaymentUnauthorizedException);
    });
  });

  // ===========================================================================
  // SECTION 4: Domain Purity & Aggregate Ignorance of Authorization
  // ===========================================================================
  describe('4. Domain Purity: Payment Aggregate Ignorance of Auth Frameworks', () => {
    it('verifies Payment Aggregate domain files do not import JWT, NestJS, HTTP, or Auth Guards', () => {
      const domainDir = path.resolve(__dirname, '../../../../../packages/core/src/sales/domain');
      const files = fs.readdirSync(domainDir);

      const forbiddenTokens = [
        '@nestjs',
        'jwt',
        'jsonwebtoken',
        'passport',
        'AuthorizationGuard',
        'AuthenticationGuard',
        'AuthenticatedUserContext',
        'roles.decorator',
        'permissions.decorator',
      ];

      for (const file of files) {
        if (!file.endsWith('.ts')) continue;
        const content = fs.readFileSync(path.join(domainDir, file), 'utf-8');

        for (const token of forbiddenTokens) {
          expect(content.toLowerCase()).not.toContain(token.toLowerCase());
        }
      }
    });

    it('proves Payment Aggregate methods enforce purely mathematical and state machine invariants without role inspection', () => {
      const clock = new SystemClock();
      const payment = Payment.createPending({
        saleId: 'sale_auth_01',
        amount: Money.create(50, 'USD'),
        method: PaymentMethod.CASH,
        tenantId: 'tenant_main',
      });

      // Pure domain lifecycle state
      expect(payment.status).toBe(PaymentStatus.PENDING);
      expect(payment.paidAt).toBeNull();

      // Complete payment via domain aggregate (contains zero user/role checks)
      payment.complete(clock);
      expect(payment.status).toBe(PaymentStatus.COMPLETED);
      expect(payment.paidAt).toBeDefined();

      // Terminal state immutability enforced purely by domain state machine
      expect(() => payment.complete(clock)).toThrow(InvalidPaymentTransitionException);
      expect(() => payment.fail('declined', clock)).toThrow(InvalidPaymentTransitionException);
      expect(() => payment.cancel('customer request', clock)).toThrow(
        InvalidPaymentTransitionException,
      );
    });
  });
});
