import { ExecutionContext, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthorizationGuard } from '../../platform/identity/authorization/authorization.guard';
import { IAuthorizationEvaluator } from '../../platform/identity/authorization/authorization-evaluator.interface';
import { AuthorizationDecision } from '../../platform/identity/authorization/models/authorization-decision.model';
import { AuthenticatedUserContext } from '../../platform/identity/context/authenticated-user-context';
import { InventoryController } from '../controllers/inventory.controller';

describe('InventoryController Authorization & RBAC Evaluation (Milestone 6.7)', () => {
  let guard: AuthorizationGuard;
  let reflector: Reflector;
  let mockEvaluator: jest.Mocked<IAuthorizationEvaluator>;

  beforeEach(() => {
    reflector = new Reflector();
    mockEvaluator = {
      evaluate: jest.fn(),
    };
    guard = new AuthorizationGuard(reflector, mockEvaluator);
  });

  const createMockContext = (
    handlerName: keyof InventoryController,
    userContext?: AuthenticatedUserContext,
  ): ExecutionContext => {
    return {
      getHandler: () => InventoryController.prototype[handlerName],
      getClass: () => InventoryController,
      switchToHttp: () => ({
        getRequest: () => ({
          user: userContext,
        }),
      }),
    } as unknown as ExecutionContext;
  };

  describe('1. Consumable Inventory Mutations (Require inventory.write)', () => {
    it('allows createItem when user possesses inventory.write permission', async () => {
      const user = new AuthenticatedUserContext({
        userId: 'usr_kitchen_mgr',
        email: 'kitchen@kinergy.platform',
        status: 'ACTIVE',
        roles: ['KITCHEN_STAFF'],
        permissions: ['inventory.write'],
        tenantId: 'tenant_main',
      });

      mockEvaluator.evaluate.mockResolvedValueOnce(AuthorizationDecision.authorized());

      const context = createMockContext('createItem', user);
      const result = await guard.canActivate(context);

      expect(result).toBe(true);
      expect(mockEvaluator.evaluate).toHaveBeenCalledWith(
        user,
        expect.objectContaining({
          requiredPermissions: ['inventory.write'],
        }),
      );
    });

    it('denies createItem when user lacks inventory.write permission', async () => {
      const user = new AuthenticatedUserContext({
        userId: 'usr_trainer_01',
        email: 'trainer@kinergy.platform',
        status: 'ACTIVE',
        roles: ['TRAINER'],
        permissions: ['inventory.read'],
      });

      mockEvaluator.evaluate.mockResolvedValueOnce(
        AuthorizationDecision.denied('Access denied: missing required permission inventory.write'),
      );

      const context = createMockContext('createItem', user);
      await expect(guard.canActivate(context)).rejects.toThrow(ForbiddenException);
    });

    it('allows updateItem when user possesses inventory.write permission', async () => {
      const user = new AuthenticatedUserContext({
        userId: 'usr_admin_01',
        email: 'admin@kinergy.platform',
        status: 'ACTIVE',
        roles: ['ADMIN'],
        permissions: ['inventory.write'],
      });

      mockEvaluator.evaluate.mockResolvedValueOnce(AuthorizationDecision.authorized());

      const context = createMockContext('updateItem', user);
      const result = await guard.canActivate(context);

      expect(result).toBe(true);
      expect(mockEvaluator.evaluate).toHaveBeenCalledWith(
        user,
        expect.objectContaining({
          requiredPermissions: ['inventory.write'],
        }),
      );
    });

    it('denies updateItem when user lacks inventory.write permission', async () => {
      const user = new AuthenticatedUserContext({
        userId: 'usr_reception_01',
        email: 'reception@kinergy.platform',
        status: 'ACTIVE',
        roles: ['RECEPTIONIST'],
        permissions: ['inventory.read'],
      });

      mockEvaluator.evaluate.mockResolvedValueOnce(
        AuthorizationDecision.denied('Access denied: missing required permission inventory.write'),
      );

      const context = createMockContext('updateItem', user);
      await expect(guard.canActivate(context)).rejects.toThrow(ForbiddenException);
    });

    it('allows archiveItem and activateItem when user possesses inventory.write permission', async () => {
      const user = new AuthenticatedUserContext({
        userId: 'usr_owner_01',
        email: 'owner@kinergy.platform',
        status: 'ACTIVE',
        roles: ['OWNER'],
        permissions: ['inventory.write'],
      });

      mockEvaluator.evaluate.mockResolvedValue(AuthorizationDecision.authorized());

      const archiveContext = createMockContext('archiveItem', user);
      const activateContext = createMockContext('activateItem', user);

      expect(await guard.canActivate(archiveContext)).toBe(true);
      expect(await guard.canActivate(activateContext)).toBe(true);
    });

    it('allows receiveStock when user possesses inventory.write permission', async () => {
      const user = new AuthenticatedUserContext({
        userId: 'usr_inventory_clerk',
        email: 'clerk@kinergy.platform',
        status: 'ACTIVE',
        roles: ['KITCHEN_STAFF'],
        permissions: ['inventory.write'],
      });

      mockEvaluator.evaluate.mockResolvedValueOnce(AuthorizationDecision.authorized());

      const context = createMockContext('receiveStock', user);
      const result = await guard.canActivate(context);

      expect(result).toBe(true);
      expect(mockEvaluator.evaluate).toHaveBeenCalledWith(
        user,
        expect.objectContaining({
          requiredPermissions: ['inventory.write'],
        }),
      );
    });

    it('denies receiveStock when user lacks inventory.write permission', async () => {
      const user = new AuthenticatedUserContext({
        userId: 'usr_guest',
        email: 'guest@kinergy.platform',
        status: 'ACTIVE',
        roles: ['TRAINER'],
        permissions: ['inventory.read'],
      });

      mockEvaluator.evaluate.mockResolvedValueOnce(
        AuthorizationDecision.denied('Access denied: missing required permission inventory.write'),
      );

      const context = createMockContext('receiveStock', user);
      await expect(guard.canActivate(context)).rejects.toThrow(ForbiddenException);
    });

    it('allows sellStock when user possesses inventory.write permission', async () => {
      const user = new AuthenticatedUserContext({
        userId: 'usr_reception_pos',
        email: 'reception@kinergy.platform',
        status: 'ACTIVE',
        roles: ['RECEPTIONIST'],
        permissions: ['inventory.write'],
      });

      mockEvaluator.evaluate.mockResolvedValueOnce(AuthorizationDecision.authorized());

      const context = createMockContext('sellStock', user);
      const result = await guard.canActivate(context);

      expect(result).toBe(true);
      expect(mockEvaluator.evaluate).toHaveBeenCalledWith(
        user,
        expect.objectContaining({
          requiredPermissions: ['inventory.write'],
        }),
      );
    });

    it('denies sellStock when user lacks inventory.write permission', async () => {
      const user = new AuthenticatedUserContext({
        userId: 'usr_guest_pos',
        email: 'guest@kinergy.platform',
        status: 'ACTIVE',
        roles: ['TRAINER'],
        permissions: ['inventory.read'],
      });

      mockEvaluator.evaluate.mockResolvedValueOnce(
        AuthorizationDecision.denied('Access denied: missing required permission inventory.write'),
      );

      const context = createMockContext('sellStock', user);
      await expect(guard.canActivate(context)).rejects.toThrow(ForbiddenException);
    });

    it('allows consumeStock when user possesses inventory.write permission', async () => {
      const user = new AuthenticatedUserContext({
        userId: 'usr_therapist_01',
        email: 'therapist@kinergy.platform',
        status: 'ACTIVE',
        roles: ['TRAINER'],
        permissions: ['inventory.write'],
      });

      mockEvaluator.evaluate.mockResolvedValueOnce(AuthorizationDecision.authorized());

      const context = createMockContext('consumeStock', user);
      const result = await guard.canActivate(context);

      expect(result).toBe(true);
      expect(mockEvaluator.evaluate).toHaveBeenCalledWith(
        user,
        expect.objectContaining({
          requiredPermissions: ['inventory.write'],
        }),
      );
    });

    it('denies consumeStock when user lacks inventory.write permission', async () => {
      const user = new AuthenticatedUserContext({
        userId: 'usr_read_only_therapist',
        email: 'therapist@kinergy.platform',
        status: 'ACTIVE',
        roles: ['TRAINER'],
        permissions: ['inventory.read'],
      });

      mockEvaluator.evaluate.mockResolvedValueOnce(
        AuthorizationDecision.denied('Access denied: missing required permission inventory.write'),
      );

      const context = createMockContext('consumeStock', user);
      await expect(guard.canActivate(context)).rejects.toThrow(ForbiddenException);
    });

    it('allows adjustStock when user possesses inventory.write permission', async () => {
      const user = new AuthenticatedUserContext({
        userId: 'usr_owner_01',
        email: 'owner@kinergy.platform',
        status: 'ACTIVE',
        roles: ['OWNER'],
        permissions: ['inventory.write'],
      });

      mockEvaluator.evaluate.mockResolvedValueOnce(AuthorizationDecision.authorized());

      const context = createMockContext('adjustStock', user);
      const result = await guard.canActivate(context);

      expect(result).toBe(true);
      expect(mockEvaluator.evaluate).toHaveBeenCalledWith(
        user,
        expect.objectContaining({
          requiredPermissions: ['inventory.write'],
        }),
      );
    });

    it('denies adjustStock with ForbiddenException when user only has inventory.read', async () => {
      const user = new AuthenticatedUserContext({
        userId: 'usr_trainer_read_only',
        email: 'trainer@kinergy.platform',
        status: 'ACTIVE',
        roles: ['TRAINER'],
        permissions: ['inventory.read'],
      });

      mockEvaluator.evaluate.mockResolvedValueOnce(
        AuthorizationDecision.denied('Access denied: missing required permission inventory.write'),
      );

      const context = createMockContext('adjustStock', user);
      await expect(guard.canActivate(context)).rejects.toThrow(ForbiddenException);
    });
  });

  describe('2. Consumable Inventory Queries (Require inventory.read)', () => {
    it('allows listItems when user possesses inventory.read permission', async () => {
      const user = new AuthenticatedUserContext({
        userId: 'usr_trainer_01',
        email: 'trainer@kinergy.platform',
        status: 'ACTIVE',
        roles: ['TRAINER'],
        permissions: ['inventory.read'],
      });

      mockEvaluator.evaluate.mockResolvedValueOnce(AuthorizationDecision.authorized());

      const context = createMockContext('listItems', user);
      const result = await guard.canActivate(context);

      expect(result).toBe(true);
      expect(mockEvaluator.evaluate).toHaveBeenCalledWith(
        user,
        expect.objectContaining({
          requiredPermissions: ['inventory.read'],
        }),
      );
    });

    it('denies listItems when user lacks inventory.read permission', async () => {
      const user = new AuthenticatedUserContext({
        userId: 'usr_unprivileged',
        email: 'unprivileged@kinergy.platform',
        status: 'ACTIVE',
        roles: ['CLIENT'],
        permissions: ['client.portal'],
      });

      mockEvaluator.evaluate.mockResolvedValueOnce(
        AuthorizationDecision.denied('Access denied: missing required permission inventory.read'),
      );

      const context = createMockContext('listItems', user);
      await expect(guard.canActivate(context)).rejects.toThrow(ForbiddenException);
    });

    it('allows getLowStock when user possesses inventory.read permission', async () => {
      const user = new AuthenticatedUserContext({
        userId: 'usr_kitchen_01',
        email: 'kitchen@kinergy.platform',
        status: 'ACTIVE',
        roles: ['KITCHEN_STAFF'],
        permissions: ['inventory.read'],
      });

      mockEvaluator.evaluate.mockResolvedValueOnce(AuthorizationDecision.authorized());

      const context = createMockContext('getLowStock', user);
      const result = await guard.canActivate(context);

      expect(result).toBe(true);
      expect(mockEvaluator.evaluate).toHaveBeenCalledWith(
        user,
        expect.objectContaining({
          requiredPermissions: ['inventory.read'],
        }),
      );
    });

    it('allows getItem when user possesses inventory.read permission', async () => {
      const user = new AuthenticatedUserContext({
        userId: 'usr_trainer_02',
        email: 'trainer2@kinergy.platform',
        status: 'ACTIVE',
        roles: ['TRAINER'],
        permissions: ['inventory.read'],
      });

      mockEvaluator.evaluate.mockResolvedValueOnce(AuthorizationDecision.authorized());

      const context = createMockContext('getItem', user);
      const result = await guard.canActivate(context);

      expect(result).toBe(true);
      expect(mockEvaluator.evaluate).toHaveBeenCalledWith(
        user,
        expect.objectContaining({
          requiredPermissions: ['inventory.read'],
        }),
      );
    });

    it('allows getStockLevel when user possesses inventory.read permission', async () => {
      const user = new AuthenticatedUserContext({
        userId: 'usr_reception_01',
        email: 'reception@kinergy.platform',
        status: 'ACTIVE',
        roles: ['RECEPTIONIST'],
        permissions: ['inventory.read'],
      });

      mockEvaluator.evaluate.mockResolvedValueOnce(AuthorizationDecision.authorized());

      const context = createMockContext('getStockLevel', user);
      const result = await guard.canActivate(context);

      expect(result).toBe(true);
      expect(mockEvaluator.evaluate).toHaveBeenCalledWith(
        user,
        expect.objectContaining({
          requiredPermissions: ['inventory.read'],
        }),
      );
    });

    it('allows getMovements when user possesses inventory.read permission', async () => {
      const user = new AuthenticatedUserContext({
        userId: 'usr_kitchen_audit',
        email: 'audit@kinergy.platform',
        status: 'ACTIVE',
        roles: ['KITCHEN_STAFF'],
        permissions: ['inventory.read'],
      });

      mockEvaluator.evaluate.mockResolvedValueOnce(AuthorizationDecision.authorized());

      const context = createMockContext('getMovements', user);
      const result = await guard.canActivate(context);

      expect(result).toBe(true);
      expect(mockEvaluator.evaluate).toHaveBeenCalledWith(
        user,
        expect.objectContaining({
          requiredPermissions: ['inventory.read'],
        }),
      );
    });
  });

  describe('3. Sensitive Financial Valuation Query (Requires inventory.read AND billing.read)', () => {
    it('allows getValuation when user possesses BOTH inventory.read and billing.read', async () => {
      const user = new AuthenticatedUserContext({
        userId: 'usr_owner_cfo',
        email: 'cfo@kinergy.platform',
        status: 'ACTIVE',
        roles: ['OWNER'],
        permissions: ['inventory.read', 'billing.read'],
      });

      mockEvaluator.evaluate.mockResolvedValueOnce(AuthorizationDecision.authorized());

      const context = createMockContext('getValuation', user);
      const result = await guard.canActivate(context);

      expect(result).toBe(true);
      expect(mockEvaluator.evaluate).toHaveBeenCalledWith(
        user,
        expect.objectContaining({
          requiredPermissions: ['inventory.read', 'billing.read'],
        }),
      );
    });

    it('denies getValuation with ForbiddenException when operational user lacks billing.read', async () => {
      const user = new AuthenticatedUserContext({
        userId: 'usr_kitchen_cook',
        email: 'kitchen@kinergy.platform',
        status: 'ACTIVE',
        roles: ['KITCHEN_STAFF'],
        permissions: ['inventory.read', 'inventory.write'], // Lacks billing.read
      });

      mockEvaluator.evaluate.mockResolvedValueOnce(
        AuthorizationDecision.denied(
          'Access denied: missing required billing.read permission for financial valuation.',
        ),
      );

      const context = createMockContext('getValuation', user);
      await expect(guard.canActivate(context)).rejects.toThrow(ForbiddenException);
    });
  });

  describe('4. Unauthenticated Caller Invariant', () => {
    it('throws UnauthorizedException when request context is unauthenticated', async () => {
      const context = createMockContext('createItem', undefined);
      await expect(guard.canActivate(context)).rejects.toThrow(UnauthorizedException);
    });
  });
});
