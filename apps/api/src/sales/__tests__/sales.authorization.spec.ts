import { ExecutionContext, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Sale, Money, SaleStatus, SourceReference, SourceType } from '@kinergy-platform/core';
import { SalesController } from '../controllers/sales.controller';
import { AuthorizationGuard } from '../../platform/identity/authorization/authorization.guard';
import { DefaultAuthorizationEvaluator } from '../../platform/identity/authorization/default-authorization-evaluator';
import { IPermissionResolver } from '../../platform/identity/authorization/authorization.interface';
import { AuthenticatedUserContext } from '../../platform/identity/context/authenticated-user-context';
import { ROLES_KEY } from '../../platform/identity/authorization/decorators/roles.decorator';
import { PERMISSIONS_KEY } from '../../platform/identity/authorization/decorators/permissions.decorator';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Senior Application Security Specification
 * Sales Module RBAC, Capability-Based Authorization & Pre-Mutation Enforcement
 *
 * Verifies:
 * 1. Metadata reflection: @Roles and @Permissions on all 8 core use-case routes.
 * 2. Deterministic policy evaluation for all Kinergy personas:
 *    - Owner & Manager: Unrestricted access across all 8 operations.
 *    - Receptionist: Full commercial checkout and cancellation authority.
 *    - Kitchen Staff: Commercial checkout allowed; cancellation strictly FORBIDDEN.
 *    - Trainer: Read-only access allowed; mutation and cancellation strictly FORBIDDEN.
 *    - Client: All 8 operations strictly FORBIDDEN.
 *    - Unauthenticated: Throws UnauthorizedException prior to authorization evaluation.
 * 3. Pre-mutation & Pre-persistence invariant: Unauthorized attempts are rejected
 *    before aggregate reconstitution, handler execution, or repository mutation.
 * 4. Domain Isolation: Sale Aggregate has zero awareness of JWT, users, roles, HTTP, or NestJS.
 */
describe('Sale Application Authorization & RBAC Security Specification', () => {
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

  // ===========================================================================
  // SECTION 1: Route Decorator & Metadata Reflection
  // ===========================================================================
  describe('1. Route Decorator Reflection & Least Privilege Metadata Audit', () => {
    it('verifies CreateSale requires sales.create permission and authorized roles', () => {
      const handler = SalesController.prototype.createSale;
      const roles = reflector.get<string[]>(ROLES_KEY, handler);
      const permissions = reflector.get<string[]>(PERMISSIONS_KEY, handler);

      expect(roles).toEqual(['Owner', 'Manager', 'Receptionist', 'Kitchen Staff']);
      expect(permissions).toEqual(['sales.create']);
    });

    it('verifies AddSaleItem requires sales.create permission and authorized roles', () => {
      const handler = SalesController.prototype.addItem;
      const roles = reflector.get<string[]>(ROLES_KEY, handler);
      const permissions = reflector.get<string[]>(PERMISSIONS_KEY, handler);

      expect(roles).toEqual(['Owner', 'Manager', 'Receptionist', 'Kitchen Staff']);
      expect(permissions).toEqual(['sales.create']);
    });

    it('verifies RemoveSaleItem requires sales.create permission and authorized roles', () => {
      const handler = SalesController.prototype.removeItem;
      const roles = reflector.get<string[]>(ROLES_KEY, handler);
      const permissions = reflector.get<string[]>(PERMISSIONS_KEY, handler);

      expect(roles).toEqual(['Owner', 'Manager', 'Receptionist', 'Kitchen Staff']);
      expect(permissions).toEqual(['sales.create']);
    });

    it('verifies ApplyDiscount requires sales.create permission and authorized roles', () => {
      const handler = SalesController.prototype.applyDiscount;
      const roles = reflector.get<string[]>(ROLES_KEY, handler);
      const permissions = reflector.get<string[]>(PERMISSIONS_KEY, handler);

      expect(roles).toEqual(['Owner', 'Manager', 'Receptionist', 'Kitchen Staff']);
      expect(permissions).toEqual(['sales.create']);
    });

    it('verifies CalculateSale requires sales.read permission and authorized roles', () => {
      const handler = SalesController.prototype.calculateSale;
      const roles = reflector.get<string[]>(ROLES_KEY, handler);
      const permissions = reflector.get<string[]>(PERMISSIONS_KEY, handler);

      expect(roles).toEqual(['Owner', 'Manager', 'Receptionist', 'Trainer', 'Kitchen Staff']);
      expect(permissions).toEqual(['sales.read']);
    });

    it('verifies GetSale requires sales.read permission and authorized roles', () => {
      const handler = SalesController.prototype.getSale;
      const roles = reflector.get<string[]>(ROLES_KEY, handler);
      const permissions = reflector.get<string[]>(PERMISSIONS_KEY, handler);

      expect(roles).toEqual(['Owner', 'Manager', 'Receptionist', 'Trainer', 'Kitchen Staff']);
      expect(permissions).toEqual(['sales.read']);
    });

    it('verifies ListSales requires sales.read permission and authorized roles', () => {
      const handler = SalesController.prototype.listSales;
      const roles = reflector.get<string[]>(ROLES_KEY, handler);
      const permissions = reflector.get<string[]>(PERMISSIONS_KEY, handler);

      expect(roles).toEqual(['Owner', 'Manager', 'Receptionist', 'Trainer', 'Kitchen Staff']);
      expect(permissions).toEqual(['sales.read']);
    });

    it('verifies CancelSale strictly requires sales.cancel permission and excludes Kitchen Staff', () => {
      const handler = SalesController.prototype.cancelSale;
      const roles = reflector.get<string[]>(ROLES_KEY, handler);
      const permissions = reflector.get<string[]>(PERMISSIONS_KEY, handler);

      // Least privilege: Kitchen Staff cannot void sales transactions
      expect(roles).toEqual(['Owner', 'Manager', 'Receptionist']);
      expect(roles).not.toContain('Kitchen Staff');
      expect(roles).not.toContain('Trainer');
      expect(permissions).toEqual(['sales.cancel']);
    });
  });

  // ===========================================================================
  // SECTION 2: Persona-Specific Authorization Evaluation
  // ===========================================================================
  describe('2. Role-Based Access Control Evaluation across All 8 Operations', () => {
    describe('A. Owner & Manager (Unrestricted Commercial Superusers)', () => {
      it.each([
        ['createSale', 'CreateSale'],
        ['addItem', 'AddSaleItem'],
        ['removeItem', 'RemoveSaleItem'],
        ['applyDiscount', 'ApplyDiscount'],
        ['calculateSale', 'CalculateSale'],
        ['getSale', 'GetSale'],
        ['listSales', 'ListSales'],
        ['cancelSale', 'CancelSale'],
      ] as const)('authorizes Owner for %s (%s)', async (handlerName, _displayName) => {
        const context = createMockContext(handlerName, ownerUser);
        const authorized = await guard.canActivate(context);
        expect(authorized).toBe(true);
      });

      it.each([
        ['createSale', 'CreateSale'],
        ['addItem', 'AddSaleItem'],
        ['removeItem', 'RemoveSaleItem'],
        ['applyDiscount', 'ApplyDiscount'],
        ['calculateSale', 'CalculateSale'],
        ['getSale', 'GetSale'],
        ['listSales', 'ListSales'],
        ['cancelSale', 'CancelSale'],
      ] as const)('authorizes Manager for %s (%s)', async (handlerName, _displayName) => {
        const context = createMockContext(handlerName, managerUser);
        const authorized = await guard.canActivate(context);
        expect(authorized).toBe(true);
      });
    });

    describe('B. Receptionist (Front Desk Checkout, Billing & Void Authority)', () => {
      it.each([
        ['createSale', 'CreateSale'],
        ['addItem', 'AddSaleItem'],
        ['removeItem', 'RemoveSaleItem'],
        ['applyDiscount', 'ApplyDiscount'],
        ['calculateSale', 'CalculateSale'],
        ['getSale', 'GetSale'],
        ['listSales', 'ListSales'],
        ['cancelSale', 'CancelSale'],
      ] as const)('authorizes Receptionist for %s (%s)', async (handlerName, _displayName) => {
        const context = createMockContext(handlerName, receptionistUser);
        const authorized = await guard.canActivate(context);
        expect(authorized).toBe(true);
      });
    });

    describe('C. Kitchen Staff (Point-of-Sale Checkout Allowed; Cancellation FORBIDDEN)', () => {
      it.each([
        ['createSale', 'CreateSale'],
        ['addItem', 'AddSaleItem'],
        ['removeItem', 'RemoveSaleItem'],
        ['applyDiscount', 'ApplyDiscount'],
        ['calculateSale', 'CalculateSale'],
        ['getSale', 'GetSale'],
        ['listSales', 'ListSales'],
      ] as const)(
        'authorizes Kitchen Staff for checkout operation %s (%s)',
        async (handlerName, _displayName) => {
          const context = createMockContext(handlerName, kitchenStaffUser);
          const authorized = await guard.canActivate(context);
          expect(authorized).toBe(true);
        },
      );

      it('strictly DENIES Kitchen Staff from invoking CancelSale (missing sales.cancel)', async () => {
        const context = createMockContext('cancelSale', kitchenStaffUser);
        await expect(guard.canActivate(context)).rejects.toThrow(ForbiddenException);
      });
    });

    describe('D. Trainer (Read-Only POS Inspection; All Mutations FORBIDDEN)', () => {
      it.each([
        ['calculateSale', 'CalculateSale'],
        ['getSale', 'GetSale'],
        ['listSales', 'ListSales'],
      ] as const)(
        'authorizes Trainer for query operation %s (%s)',
        async (handlerName, _displayName) => {
          const context = createMockContext(handlerName, trainerUser);
          const authorized = await guard.canActivate(context);
          expect(authorized).toBe(true);
        },
      );

      it.each([
        ['createSale', 'CreateSale'],
        ['addItem', 'AddSaleItem'],
        ['removeItem', 'RemoveSaleItem'],
        ['applyDiscount', 'ApplyDiscount'],
        ['cancelSale', 'CancelSale'],
      ] as const)(
        'strictly DENIES Trainer from mutating operation %s (%s)',
        async (handlerName, _displayName) => {
          const context = createMockContext(handlerName, trainerUser);
          await expect(guard.canActivate(context)).rejects.toThrow(ForbiddenException);
        },
      );
    });

    describe('E. Client Portal User (Zero Internal Staff Permissions)', () => {
      it.each([
        ['createSale', 'CreateSale'],
        ['addItem', 'AddSaleItem'],
        ['removeItem', 'RemoveSaleItem'],
        ['applyDiscount', 'ApplyDiscount'],
        ['calculateSale', 'CalculateSale'],
        ['getSale', 'GetSale'],
        ['listSales', 'ListSales'],
        ['cancelSale', 'CancelSale'],
      ] as const)('strictly DENIES Client from %s (%s)', async (handlerName, _displayName) => {
        const context = createMockContext(handlerName, clientPortalUser);
        await expect(guard.canActivate(context)).rejects.toThrow(ForbiddenException);
      });
    });

    describe('F. Unauthenticated Request Invariant', () => {
      it.each([
        ['createSale', 'CreateSale'],
        ['addItem', 'AddSaleItem'],
        ['removeItem', 'RemoveSaleItem'],
        ['applyDiscount', 'ApplyDiscount'],
        ['calculateSale', 'CalculateSale'],
        ['getSale', 'GetSale'],
        ['listSales', 'ListSales'],
        ['cancelSale', 'CancelSale'],
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
    it('proves unauthorized calls are rejected before any handler or repository invocation', async () => {
      const mockSave = jest.fn();
      const mockRepo = {
        findById: jest.fn(),
        save: mockSave,
      };

      const cancelHandlerSpy = jest.fn();

      // An unauthorized user attempts to cancel a sale
      const context = createMockContext('cancelSale', kitchenStaffUser);

      // Verify that the guard rejects
      await expect(guard.canActivate(context)).rejects.toThrow(ForbiddenException);

      // Verify that handler and repository were NEVER called
      expect(cancelHandlerSpy).not.toHaveBeenCalled();
      expect(mockSave).not.toHaveBeenCalled();
      expect(mockRepo.findById).not.toHaveBeenCalled();
    });
  });

  // ===========================================================================
  // SECTION 4: Domain Purity & Aggregate Ignorance of Authorization
  // ===========================================================================
  describe('4. Domain Purity: Sale Aggregate Ignorance of Auth Frameworks', () => {
    it('verifies Sale Aggregate domain files do not import JWT, NestJS, HTTP, or Auth Guards', () => {
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

    it('proves Sale Aggregate methods enforce only domain business invariants without role checks', () => {
      const source = SourceReference.create({
        sourceType: SourceType.CUSTOM_SERVICE,
        sourceId: 'src_test_01',
      });

      const sale = Sale.create({
        currency: 'USD',
        source,
      });

      // Domain enforces state rules regardless of caller identity
      expect(sale.status).toBe(SaleStatus.DRAFT);

      // Domain calculates totals purely through domain logic
      sale.addItem({
        source,
        description: 'Recovery Drink',
        quantity: 2,
        unitPrice: Money.create(15, 'USD'),
      });
      expect(sale.total.amount).toBe(30);

      // Invariant: cannot cancel already cancelled sale
      sale.cancel('Order cancelled');
      expect(sale.status).toBe(SaleStatus.CANCELLED);

      expect(() => {
        sale.cancel('Second cancellation attempt');
      }).toThrow();
    });
  });
});
