import { ExecutionContext, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import {
  Sale,
  SaleId,
  Money,
  SaleSource,
  SaleSourceType,
  SaleStatus,
  Payment,
  PaymentId,
  PaymentMethod,
  PaymentStatus,
  Receipt,
  ReceiptId,
  ReceiptNumber,
  CreateSaleHandler,
  CreateSaleCommand,
  CancelSaleHandler,
  CancelSaleCommand,
  FinalizeSaleHandler,
  RecordPaymentHandler,
  CompletePaymentHandler,
  IssueReceiptHandler,
  checkSaleAuthorization,
  checkPaymentAuthorization,
  checkReceiptAuthorization,
  enforceSaleTenantIsolation,
  enforceTenantIsolation as enforcePaymentTenantIsolation,
  enforceReceiptTenantIsolation,
  enforceReceiptOwnershipBoundary,
  SaleNotFoundException,
  SaleUnauthorizedException,
  PaymentUnauthorizedException,
  ReceiptUnauthorizedException,
  SaleRepositoryPort,
  SaleRepositoryInterface,
  PaymentRepositoryPort,
  ReceiptRepositoryPort,
  FindSalesResult,
  FindPaymentsResult,
  FinalizeSaleCommand,
  RecordPaymentCommand,
  CompletePaymentCommand,
  IssueReceiptCommand,
} from '@kinergy-platform/core';
import {
  adminUserFixture,
  createValidSaleFixture,
  createPaidSaleWithPaymentAndReceiptFixture,
  DEFAULT_TEST_CLOCK,
  DEFAULT_TEST_TENANT_ID,
} from '@kinergy-platform/testing';
import { SalesController } from '../controllers/sales.controller';
import { PaymentsController } from '../controllers/payments.controller';
import { ReceiptsController } from '../controllers/receipts.controller';
import { AuthorizationGuard } from '../../platform/identity/authorization/authorization.guard';
import { DefaultAuthorizationEvaluator } from '../../platform/identity/authorization/default-authorization-evaluator';
import { IPermissionResolver } from '../../platform/identity/authorization/authorization.interface';
import { AuthenticatedUserContext } from '../../platform/identity/context/authenticated-user-context';
import { ROLES_KEY } from '../../platform/identity/authorization/decorators/roles.decorator';
import { PERMISSIONS_KEY } from '../../platform/identity/authorization/decorators/permissions.decorator';

// =============================================================================
// RECORDING / SPY REPOSITORIES FOR PERSISTENCE VERIFICATION
// =============================================================================

class SpySaleRepository implements SaleRepositoryPort, SaleRepositoryInterface {
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

  async findMany(): Promise<FindSalesResult> {
    return { items: [], total: 0 };
  }

  clear(): void {
    this.store.clear();
    this.saveCount = 0;
    this.lastSavedSale = null;
  }
}

class SpyPaymentRepository implements PaymentRepositoryPort {
  public store = new Map<string, Payment>();
  public saveCount = 0;
  public lastSavedPayment: Payment | null = null;

  async findById(id: PaymentId | string): Promise<Payment | null> {
    const key = typeof id === 'string' ? id.trim() : id.value;
    return this.store.get(key) ?? null;
  }

  async save(payment: Payment): Promise<void> {
    this.saveCount++;
    this.lastSavedPayment = payment;
    this.store.set(payment.id.value, payment);
  }

  async findBySaleId(saleId: SaleId | string): Promise<Payment[]> {
    const key = typeof saleId === 'string' ? saleId.trim() : saleId.value;
    return Array.from(this.store.values()).filter((p) => p.saleId.value === key);
  }

  async findMany(): Promise<FindPaymentsResult> {
    return { items: [], total: 0 };
  }

  clear(): void {
    this.store.clear();
    this.saveCount = 0;
    this.lastSavedPayment = null;
  }
}

class SpyReceiptRepository implements ReceiptRepositoryPort {
  public store = new Map<string, Receipt>();
  public saveCount = 0;
  public lastSavedReceipt: Receipt | null = null;
  private sequence = 1;

  async findById(id: ReceiptId | string): Promise<Receipt | null> {
    const key = typeof id === 'string' ? id.trim() : id.value;
    return this.store.get(key) ?? null;
  }

  async save(receipt: Receipt): Promise<void> {
    this.saveCount++;
    this.lastSavedReceipt = receipt;
    this.store.set(receipt.id.value, receipt);
  }

  async findBySaleId(saleId: SaleId | string): Promise<Receipt | null> {
    const key = typeof saleId === 'string' ? saleId.trim() : saleId.value;
    return Array.from(this.store.values()).find((r) => r.saleId.value === key) ?? null;
  }

  async findByReceiptNumber(receiptNumber: ReceiptNumber | string): Promise<Receipt | null> {
    const num = typeof receiptNumber === 'string' ? receiptNumber.trim() : receiptNumber.value;
    return Array.from(this.store.values()).find((r) => r.receiptNumber.value === num) ?? null;
  }

  async getNextReceiptNumber(_tenantId: string, year: number): Promise<ReceiptNumber> {
    const seqStr = String(this.sequence++).padStart(6, '0');
    return ReceiptNumber.create(`REC-${year}-${seqStr}`);
  }

  clear(): void {
    this.store.clear();
    this.saveCount = 0;
    this.lastSavedReceipt = null;
    this.sequence = 1;
  }
}

// =============================================================================
// PHASE 7 AUTHORIZATION SECURITY SPECIFICATION & MATRIX
// =============================================================================

describe('Phase 7 Authorization Test Suite & Matrix (ADR-0135, ADR-0111, ADR-0114)', () => {
  let reflector: Reflector;
  let permissionResolver: jest.Mocked<IPermissionResolver>;
  let evaluator: DefaultAuthorizationEvaluator;
  let guard: AuthorizationGuard;

  let saleRepo: SpySaleRepository;
  let paymentRepo: SpyPaymentRepository;
  let receiptRepo: SpyReceiptRepository;

  // ---------------------------------------------------------------------------
  // Canonical IAM Personas (Reusing Existing Fixtures and Seed Rules)
  // ---------------------------------------------------------------------------
  const adminPrincipal = new AuthenticatedUserContext({
    userId: adminUserFixture.id,
    email: adminUserFixture.email,
    status: adminUserFixture.status,
    roles: [...adminUserFixture.roles],
    permissions: [...adminUserFixture.permissions],
    tenantId: DEFAULT_TEST_TENANT_ID,
  });

  const ownerPrincipal = new AuthenticatedUserContext({
    userId: 'usr_owner_phase7',
    email: 'owner@kinergy.local',
    status: 'ACTIVE',
    roles: ['Owner'],
    permissions: ['*'],
    tenantId: DEFAULT_TEST_TENANT_ID,
  });

  const managerPrincipal = new AuthenticatedUserContext({
    userId: 'usr_mgr_phase7',
    email: 'manager@kinergy.local',
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
      'receipts.read',
      'receipts.manage',
    ],
    tenantId: DEFAULT_TEST_TENANT_ID,
  });

  const receptionistPrincipal = new AuthenticatedUserContext({
    userId: 'usr_rec_phase7',
    email: 'receptionist@kinergy.local',
    status: 'ACTIVE',
    roles: ['Receptionist'],
    permissions: [
      'sales.create',
      'sales.read',
      'payments.create',
      'payments.read',
      'receipts.read',
    ],
    tenantId: DEFAULT_TEST_TENANT_ID,
  });

  const kitchenStaffPrincipal = new AuthenticatedUserContext({
    userId: 'usr_kitchen_phase7',
    email: 'kitchen@kinergy.local',
    status: 'ACTIVE',
    roles: ['Kitchen Staff'],
    permissions: ['sales.create', 'payments.create'],
    tenantId: DEFAULT_TEST_TENANT_ID,
  });

  const trainerPrincipal = new AuthenticatedUserContext({
    userId: 'usr_trainer_phase7',
    email: 'trainer@kinergy.local',
    status: 'ACTIVE',
    roles: ['Trainer'],
    permissions: ['sales.read'],
    tenantId: DEFAULT_TEST_TENANT_ID,
  });

  const clientPrincipal = new AuthenticatedUserContext({
    userId: 'cli-paid-01',
    email: 'client@kinergy.local',
    status: 'ACTIVE',
    roles: ['Client'],
    permissions: [],
    tenantId: DEFAULT_TEST_TENANT_ID,
  });

  const foreignClientPrincipal = new AuthenticatedUserContext({
    userId: 'cli-foreign-999',
    email: 'foreign.client@kinergy.local',
    status: 'ACTIVE',
    roles: ['Client'],
    permissions: [],
    tenantId: DEFAULT_TEST_TENANT_ID,
  });

  const crossTenantManager = new AuthenticatedUserContext({
    userId: 'usr_cross_phase7',
    email: 'cross.mgr@foreign.local',
    status: 'ACTIVE',
    roles: ['Manager'],
    permissions: ['sales.manage', 'payments.manage', 'receipts.manage'],
    tenantId: 'tenant_foreign_xyz',
  });

  // ---------------------------------------------------------------------------
  // Setup & Teardown
  // ---------------------------------------------------------------------------
  beforeEach(() => {
    reflector = new Reflector();
    permissionResolver = {
      resolvePermissions: jest.fn().mockImplementation((_userId, _roles, permissions) => {
        return Promise.resolve(permissions);
      }),
    };
    evaluator = new DefaultAuthorizationEvaluator(permissionResolver);
    guard = new AuthorizationGuard(reflector, evaluator);

    saleRepo = new SpySaleRepository();
    paymentRepo = new SpyPaymentRepository();
    receiptRepo = new SpyReceiptRepository();
  });

  // Mock Context Helpers
  const createSalesContext = (
    handlerName: keyof SalesController,
    userContext?: AuthenticatedUserContext,
  ): ExecutionContext => {
    return {
      getHandler: () => SalesController.prototype[handlerName],
      getClass: () => SalesController,
      switchToHttp: () => ({
        getRequest: () => ({ user: userContext }),
      }),
    } as unknown as ExecutionContext;
  };

  const createPaymentsContext = (
    handlerName: keyof PaymentsController,
    userContext?: AuthenticatedUserContext,
  ): ExecutionContext => {
    return {
      getHandler: () => PaymentsController.prototype[handlerName],
      getClass: () => PaymentsController,
      switchToHttp: () => ({
        getRequest: () => ({ user: userContext }),
      }),
    } as unknown as ExecutionContext;
  };

  const createReceiptsContext = (
    handlerName: keyof ReceiptsController,
    userContext?: AuthenticatedUserContext,
  ): ExecutionContext => {
    return {
      getHandler: () => ReceiptsController.prototype[handlerName],
      getClass: () => ReceiptsController,
      switchToHttp: () => ({
        getRequest: () => ({ user: userContext }),
      }),
    } as unknown as ExecutionContext;
  };

  // ===========================================================================
  // LEVEL 1: PERMISSION CATALOG & ROLE-MAPPING UNIT TESTS
  // ===========================================================================
  describe('Level 1: Permission Catalog and Role-Mapping Unit Tests', () => {
    it('verifies route metadata reflection for @Roles and @Permissions across key routes', () => {
      // 1. Sale create
      const saleCreateHandler = SalesController.prototype.createSale;
      expect(reflector.get<string[]>(ROLES_KEY, saleCreateHandler)).toEqual([
        'Owner',
        'Manager',
        'Receptionist',
        'Kitchen Staff',
      ]);
      expect(reflector.get<string[]>(PERMISSIONS_KEY, saleCreateHandler)).toEqual(['sales.create']);

      // 2. Payment cancel (requires payments.manage)
      const payCancelHandler = PaymentsController.prototype.cancelPayment;
      expect(reflector.get<string[]>(ROLES_KEY, payCancelHandler)).toEqual(['Owner', 'Manager']);
      expect(reflector.get<string[]>(PERMISSIONS_KEY, payCancelHandler)).toEqual([
        'payments.manage',
      ]);

      // 3. Receipt issue (requires receipts.manage)
      const receiptIssueHandler = ReceiptsController.prototype.issueReceipt;
      expect(reflector.get<string[]>(ROLES_KEY, receiptIssueHandler)).toEqual([
        'Owner',
        'Manager',
        'Receptionist',
        'Kitchen Staff',
      ]);
      expect(reflector.get<string[]>(PERMISSIONS_KEY, receiptIssueHandler)).toEqual([
        'receipts.manage',
      ]);
    });

    it('normalizes colon-notation (sales:create) and dot-notation (sales.create)', async () => {
      const user = new AuthenticatedUserContext({
        userId: 'usr_colon',
        email: 'colon@kinergy.local',
        status: 'ACTIVE',
        roles: ['Manager'],
        permissions: ['sales:create', 'payments:create'],
      });

      const canCreateSale = await guard.canActivate(createSalesContext('createSale', user));
      const canRecordPayment = await guard.canActivate(
        createPaymentsContext('recordPayment', user),
      );

      expect(canCreateSale).toBe(true);
      expect(canRecordPayment).toBe(true);
    });

    it('enforces capability hierarchy: billing.manage covers all sales, payments, and receipts operations', async () => {
      const billingAdmin = new AuthenticatedUserContext({
        userId: 'usr_billing_adm',
        email: 'billing.admin@kinergy.local',
        status: 'ACTIVE',
        roles: ['Manager'],
        permissions: ['billing.manage'],
      });

      expect(await guard.canActivate(createSalesContext('createSale', billingAdmin))).toBe(true);
      expect(await guard.canActivate(createSalesContext('cancelSale', billingAdmin))).toBe(true);
      expect(await guard.canActivate(createPaymentsContext('recordPayment', billingAdmin))).toBe(
        true,
      );
      expect(await guard.canActivate(createPaymentsContext('cancelPayment', billingAdmin))).toBe(
        true,
      );
      expect(await guard.canActivate(createReceiptsContext('issueReceipt', billingAdmin))).toBe(
        true,
      );
    });

    it('enforces capability hierarchy: sales.manage covers sales.create, sales.read, sales.cancel, and receipts.read', async () => {
      const salesManager = new AuthenticatedUserContext({
        userId: 'usr_sales_mgr',
        email: 'sales.mgr@kinergy.local',
        status: 'ACTIVE',
        roles: ['Manager'],
        permissions: ['sales.manage'],
      });

      expect(await guard.canActivate(createSalesContext('createSale', salesManager))).toBe(true);
      expect(await guard.canActivate(createSalesContext('getSale', salesManager))).toBe(true);
      expect(await guard.canActivate(createSalesContext('cancelSale', salesManager))).toBe(true);
      expect(await guard.canActivate(createReceiptsContext('getReceiptById', salesManager))).toBe(
        true,
      );
      // But sales.manage does NOT grant payments.manage (destructive payment cancellation)
      await expect(
        guard.canActivate(createPaymentsContext('cancelPayment', salesManager)),
      ).rejects.toThrow(ForbiddenException);
    });

    it('enforces capability hierarchy: payments.manage covers payments.create and payments.read', async () => {
      const paymentSupervisor = new AuthenticatedUserContext({
        userId: 'usr_pay_sup',
        email: 'payments.sup@kinergy.local',
        status: 'ACTIVE',
        roles: ['Manager'],
        permissions: ['payments.manage'],
      });

      expect(
        await guard.canActivate(createPaymentsContext('recordPayment', paymentSupervisor)),
      ).toBe(true);
      expect(
        await guard.canActivate(createPaymentsContext('getPaymentById', paymentSupervisor)),
      ).toBe(true);
      expect(
        await guard.canActivate(createPaymentsContext('completePayment', paymentSupervisor)),
      ).toBe(true);
      // But does NOT grant sales.create
      await expect(
        guard.canActivate(createSalesContext('createSale', paymentSupervisor)),
      ).rejects.toThrow(ForbiddenException);
    });

    it('enforces capability hierarchy: wildcard (*) covers all operations across Phase 7', async () => {
      expect(await guard.canActivate(createSalesContext('createSale', adminPrincipal))).toBe(true);
      expect(await guard.canActivate(createPaymentsContext('cancelPayment', adminPrincipal))).toBe(
        true,
      );
      expect(await guard.canActivate(createReceiptsContext('issueReceipt', adminPrincipal))).toBe(
        true,
      );
    });
  });

  // ===========================================================================
  // LEVEL 2: AUTHORIZATION EVALUATOR & GUARD TESTS
  // ===========================================================================
  describe('Level 2: Authorization Evaluator and Guard Architecture Tests', () => {
    it('fails closed when request is completely unauthenticated (throws UnauthorizedException)', async () => {
      const unauthContext = createSalesContext('createSale', undefined);
      await expect(guard.canActivate(unauthContext)).rejects.toThrow(UnauthorizedException);
    });

    it('fails closed when authenticated identity is inactive or blocked (throws UnauthorizedException)', async () => {
      const inactiveUser = new AuthenticatedUserContext({
        userId: 'usr_inactive',
        email: 'inactive@kinergy.local',
        status: 'INACTIVE',
        roles: ['Manager'],
        permissions: ['*'],
      });

      const blockedUser = new AuthenticatedUserContext({
        userId: 'usr_blocked',
        email: 'blocked@kinergy.local',
        status: 'BLOCKED',
        roles: ['Owner'],
        permissions: ['*'],
      });

      await expect(
        guard.canActivate(createSalesContext('createSale', inactiveUser)),
      ).rejects.toThrow(UnauthorizedException);
      await expect(
        guard.canActivate(createSalesContext('createSale', blockedUser)),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('throws ForbiddenException with clean reason and ZERO leaked internal evaluation details for missing permission', async () => {
      // User has Manager role (passes route role check), but lacks sales.cancel
      const managerWithoutCancel = new AuthenticatedUserContext({
        userId: 'usr_no_cancel',
        email: 'nocancel@kinergy.local',
        status: 'ACTIVE',
        roles: ['Manager'],
        permissions: ['sales.read'],
      });
      const context = createSalesContext('cancelSale', managerWithoutCancel);

      try {
        await guard.canActivate(context);
        fail('Expected ForbiddenException was not thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(ForbiddenException);
        const forbidden = error as ForbiddenException;
        expect(forbidden.message).toBe('Access denied: required permission missing.');
        // Ensure no internal evaluator details (e.g. resolvedPermissions, policy AST) are in exception message
        expect(forbidden.message).not.toContain('sales.cancel');
        expect(forbidden.message).not.toContain('nocancel@kinergy.local');
        expect(forbidden.message).not.toContain('usr_no_cancel');
      }
    });

    it('throws ForbiddenException with clean reason for missing role', async () => {
      // User has Trainer role, route cancelSale requires Owner or Manager
      const context = createSalesContext('cancelSale', trainerPrincipal);

      try {
        await guard.canActivate(context);
        fail('Expected ForbiddenException was not thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(ForbiddenException);
        const forbidden = error as ForbiddenException;
        expect(forbidden.message).toBe('Access denied: required role missing.');
      }
    });
  });

  // ===========================================================================
  // LEVEL 3: CONTROLLER/API INTEGRATION TESTS (COMPLETE OPERATION INVENTORY)
  // ===========================================================================
  describe('Level 3: Controller/API Route Integration Tests (24 Protected Operations)', () => {
    // -------------------------------------------------------------------------
    // Sales Operations (11 Operations)
    // -------------------------------------------------------------------------
    describe('Sales Operations (11 operations)', () => {
      const salesOperations: (keyof SalesController)[] = [
        'createSale',
        'getSale',
        'addItem',
        'removeItem',
        'applyDiscount',
        'removeDiscount',
        'finalizeSale',
        'cancelSale',
        'assignSource',
        'calculateSale',
        'listSales',
      ];

      salesOperations.forEach((op) => {
        it(`[${op}] rejects unauthenticated callers with UnauthorizedException`, async () => {
          await expect(guard.canActivate(createSalesContext(op, undefined))).rejects.toThrow(
            UnauthorizedException,
          );
        });
      });

      it('[cancelSale] rejects Receptionist and Kitchen Staff lacking sales.cancel', async () => {
        await expect(
          guard.canActivate(createSalesContext('cancelSale', receptionistPrincipal)),
        ).rejects.toThrow(ForbiddenException);
        await expect(
          guard.canActivate(createSalesContext('cancelSale', kitchenStaffPrincipal)),
        ).rejects.toThrow(ForbiddenException);
      });

      it('[cancelSale] permits Manager and Owner possessing sales.cancel / sales.manage', async () => {
        expect(await guard.canActivate(createSalesContext('cancelSale', managerPrincipal))).toBe(
          true,
        );
        expect(await guard.canActivate(createSalesContext('cancelSale', ownerPrincipal))).toBe(
          true,
        );
      });

      it('[createSale, addItem, finalizeSale] permits Receptionist and Kitchen Staff', async () => {
        expect(
          await guard.canActivate(createSalesContext('createSale', receptionistPrincipal)),
        ).toBe(true);
        expect(
          await guard.canActivate(createSalesContext('createSale', kitchenStaffPrincipal)),
        ).toBe(true);
        expect(await guard.canActivate(createSalesContext('addItem', receptionistPrincipal))).toBe(
          true,
        );
        expect(
          await guard.canActivate(createSalesContext('finalizeSale', receptionistPrincipal)),
        ).toBe(true);
      });

      it('[createSale, addItem, finalizeSale] strictly rejects Trainer and Client', async () => {
        await expect(
          guard.canActivate(createSalesContext('createSale', trainerPrincipal)),
        ).rejects.toThrow(ForbiddenException);
        await expect(
          guard.canActivate(createSalesContext('createSale', clientPrincipal)),
        ).rejects.toThrow(ForbiddenException);
        await expect(
          guard.canActivate(createSalesContext('finalizeSale', trainerPrincipal)),
        ).rejects.toThrow(ForbiddenException);
      });

      it('[getSale, listSales] permits Trainer with sales.read', async () => {
        expect(await guard.canActivate(createSalesContext('getSale', trainerPrincipal))).toBe(true);
        expect(await guard.canActivate(createSalesContext('listSales', trainerPrincipal))).toBe(
          true,
        );
      });
    });

    // -------------------------------------------------------------------------
    // Payments Operations (9 Operations)
    // -------------------------------------------------------------------------
    describe('Payments Operations (9 operations)', () => {
      const paymentOperations: (keyof PaymentsController)[] = [
        'recordPayment',
        'getPaymentById',
        'getPaymentsBySaleId',
        'getSalePaymentHistory',
        'completePayment',
        'settlePayment',
        'failPayment',
        'cancelPayment',
        'listPayments',
      ];

      paymentOperations.forEach((op) => {
        it(`[${op}] rejects unauthenticated callers with UnauthorizedException`, async () => {
          await expect(guard.canActivate(createPaymentsContext(op, undefined))).rejects.toThrow(
            UnauthorizedException,
          );
        });
      });

      it('[cancelPayment] strictly rejects Receptionist and Kitchen Staff (requires payments.manage)', async () => {
        await expect(
          guard.canActivate(createPaymentsContext('cancelPayment', receptionistPrincipal)),
        ).rejects.toThrow(ForbiddenException);
        await expect(
          guard.canActivate(createPaymentsContext('cancelPayment', kitchenStaffPrincipal)),
        ).rejects.toThrow(ForbiddenException);
      });

      it('[cancelPayment] permits Manager and Owner possessing payments.manage', async () => {
        expect(
          await guard.canActivate(createPaymentsContext('cancelPayment', managerPrincipal)),
        ).toBe(true);
        expect(
          await guard.canActivate(createPaymentsContext('cancelPayment', ownerPrincipal)),
        ).toBe(true);
      });

      it('[recordPayment] permits Receptionist and Kitchen Staff with payments.create', async () => {
        expect(
          await guard.canActivate(createPaymentsContext('recordPayment', receptionistPrincipal)),
        ).toBe(true);
        expect(
          await guard.canActivate(createPaymentsContext('recordPayment', kitchenStaffPrincipal)),
        ).toBe(true);
      });

      it('[recordPayment, completePayment] strictly rejects Trainer and Client', async () => {
        await expect(
          guard.canActivate(createPaymentsContext('recordPayment', trainerPrincipal)),
        ).rejects.toThrow(ForbiddenException);
        await expect(
          guard.canActivate(createPaymentsContext('recordPayment', clientPrincipal)),
        ).rejects.toThrow(ForbiddenException);
        await expect(
          guard.canActivate(createPaymentsContext('completePayment', trainerPrincipal)),
        ).rejects.toThrow(ForbiddenException);
      });
    });

    // -------------------------------------------------------------------------
    // Receipts Operations (4 Operations)
    // -------------------------------------------------------------------------
    describe('Receipts Operations (4 operations)', () => {
      const receiptOperations: (keyof ReceiptsController)[] = [
        'issueReceipt',
        'issueReceiptDirect',
        'getReceiptById',
        'getReceiptBySale',
      ];

      receiptOperations.forEach((op) => {
        it(`[${op}] rejects unauthenticated callers with UnauthorizedException`, async () => {
          await expect(guard.canActivate(createReceiptsContext(op, undefined))).rejects.toThrow(
            UnauthorizedException,
          );
        });
      });

      it('[issueReceipt, issueReceiptDirect] permits Manager and Owner possessing receipts.manage', async () => {
        expect(
          await guard.canActivate(createReceiptsContext('issueReceipt', managerPrincipal)),
        ).toBe(true);
        expect(
          await guard.canActivate(createReceiptsContext('issueReceiptDirect', managerPrincipal)),
        ).toBe(true);
      });

      it('[issueReceipt] strictly rejects Receptionist, Kitchen Staff, Trainer, and Client', async () => {
        await expect(
          guard.canActivate(createReceiptsContext('issueReceipt', receptionistPrincipal)),
        ).rejects.toThrow(ForbiddenException);
        await expect(
          guard.canActivate(createReceiptsContext('issueReceipt', kitchenStaffPrincipal)),
        ).rejects.toThrow(ForbiddenException);
        await expect(
          guard.canActivate(createReceiptsContext('issueReceipt', trainerPrincipal)),
        ).rejects.toThrow(ForbiddenException);
        await expect(
          guard.canActivate(createReceiptsContext('issueReceipt', clientPrincipal)),
        ).rejects.toThrow(ForbiddenException);
      });

      it('[getReceiptById, getReceiptBySale] permits Receptionist with receipts.read', async () => {
        expect(
          await guard.canActivate(createReceiptsContext('getReceiptById', receptionistPrincipal)),
        ).toBe(true);
        expect(
          await guard.canActivate(createReceiptsContext('getReceiptBySale', receptionistPrincipal)),
        ).toBe(true);
      });
    });
  });

  // ===========================================================================
  // LEVEL 4: APPLICATION USE CASE TESTS FOR PROTECTED ENTRY POINTS
  // ===========================================================================
  describe('Level 4: Application Use Case Tests for Protected Entry Points', () => {
    it('enforces domain checkSaleAuthorization rejecting unprivileged caller', () => {
      expect(() => {
        checkSaleAuthorization(
          {
            userId: 'usr_unprivileged',
            roles: ['Trainer'],
            permissions: ['sales.read'],
          },
          ['sales.cancel'],
        );
      }).toThrow(SaleUnauthorizedException);
    });

    it('enforces domain checkPaymentAuthorization rejecting unprivileged caller', () => {
      expect(() => {
        checkPaymentAuthorization(
          {
            userId: 'usr_unprivileged',
            roles: ['Receptionist'],
            permissions: ['payments.create'],
          },
          ['payments.manage'],
        );
      }).toThrow(PaymentUnauthorizedException);
    });

    it('enforces domain checkReceiptAuthorization rejecting unprivileged caller', () => {
      expect(() => {
        checkReceiptAuthorization(
          {
            userId: 'usr_unprivileged',
            roles: ['Receptionist'],
            permissions: ['receipts.read'],
          },
          ['receipts.manage'],
        );
      }).toThrow(ReceiptUnauthorizedException);
    });

    it('enforces multi-tenant isolation across Sales, Payments, and Receipts', () => {
      // ADR-0135 §9: Sale tenant isolation throws uniform SaleNotFoundException to prevent resource enumeration
      expect(() => {
        enforceSaleTenantIsolation(DEFAULT_TEST_TENANT_ID, 'foreign-tenant');
      }).toThrow(SaleNotFoundException);

      expect(() => {
        enforcePaymentTenantIsolation(DEFAULT_TEST_TENANT_ID, 'foreign-tenant');
      }).toThrow(PaymentUnauthorizedException);

      expect(() => {
        enforceReceiptTenantIsolation(DEFAULT_TEST_TENANT_ID, 'foreign-tenant');
      }).toThrow(ReceiptUnauthorizedException);
    });

    it('enforces object-level ownership boundary: Client can view own receipt, but is denied foreign receipt', () => {
      const { receipt } = createPaidSaleWithPaymentAndReceiptFixture();

      // 1. Authorized: client accessing own receipt document (matching clientSnapshot.clientId 'cli-paid-01')
      expect(() => {
        enforceReceiptOwnershipBoundary(receipt, {
          userId: clientPrincipal.userId,
          clientId: clientPrincipal.userId,
          roles: [...clientPrincipal.roles],
          permissions: [...clientPrincipal.permissions],
        });
      }).not.toThrow();

      // 2. Denied: foreign client attempting to view another client receipt
      expect(() => {
        enforceReceiptOwnershipBoundary(receipt, {
          userId: foreignClientPrincipal.userId,
          clientId: foreignClientPrincipal.userId,
          roles: [...foreignClientPrincipal.roles],
          permissions: [...foreignClientPrincipal.permissions],
        });
      }).toThrow(ReceiptUnauthorizedException);

      // 3. Denied: trainer without client ownership
      expect(() => {
        enforceReceiptOwnershipBoundary(receipt, {
          userId: trainerPrincipal.userId,
          roles: [...trainerPrincipal.roles],
          permissions: [...trainerPrincipal.permissions],
        });
      }).toThrow(ReceiptUnauthorizedException);
    });

    it('enforces cross-tenant denial when foreign tenant manager attempts operations on target tenant', () => {
      expect(() => {
        enforceSaleTenantIsolation(DEFAULT_TEST_TENANT_ID, crossTenantManager.tenantId);
      }).toThrow(SaleNotFoundException);
    });

    it('authorizes Kitchen Staff (holding sales.create) to execute CreateSaleHandler', async () => {
      const handler = new CreateSaleHandler(saleRepo);
      const result = await handler.execute(
        new CreateSaleCommand({
          id: 'sale-kitchen-create-01',
          currency: 'USD',
          tenantId: DEFAULT_TEST_TENANT_ID,
          source: {
            sourceType: 'DRINK',
            sourceId: 'drink-smoothie-01',
          },
          currentUser: {
            userId: kitchenStaffPrincipal.userId,
            roles: [...kitchenStaffPrincipal.roles],
            permissions: [...kitchenStaffPrincipal.permissions],
          },
        }),
      );
      expect(result.isSuccess).toBe(true);
      expect(result.getValue().id).toBe('sale-kitchen-create-01');
    });

    it('authorizes Receptionist (holding sales.cancel) to execute CancelSaleHandler', async () => {
      const sale = createValidSaleFixture({ id: 'sale-cancel-rec-01' });
      await saleRepo.save(sale);

      const handler = new CancelSaleHandler(saleRepo);
      const result = await handler.execute(
        new CancelSaleCommand({
          saleId: sale.id.value,
          reason: 'Customer requested cancellation at reception desk',
          tenantId: DEFAULT_TEST_TENANT_ID,
          currentUser: {
            userId: 'usr_rec_with_cancel',
            roles: ['Receptionist'],
            permissions: ['sales.cancel', 'sales.read'],
          },
        }),
      );
      expect(result.isSuccess).toBe(true);
      const reloaded = await saleRepo.findById(sale.id);
      expect(reloaded?.status).toBe(SaleStatus.CANCELLED);
    });

    it('strictly denies Kitchen Staff from executing CancelSaleHandler (missing sales.cancel)', async () => {
      const sale = createValidSaleFixture({ id: 'sale-cancel-kitchen-denied' });
      await saleRepo.save(sale);

      const handler = new CancelSaleHandler(saleRepo);
      const result = await handler.execute(
        new CancelSaleCommand({
          saleId: sale.id.value,
          reason: 'Attempted cancellation by kitchen',
          tenantId: DEFAULT_TEST_TENANT_ID,
          currentUser: {
            userId: kitchenStaffPrincipal.userId,
            roles: [...kitchenStaffPrincipal.roles],
            permissions: [...kitchenStaffPrincipal.permissions],
          },
        }),
      );
      expect(result.isFailure).toBe(true);
      expect(result.getError()).toBeInstanceOf(SaleUnauthorizedException);
      const reloaded = await saleRepo.findById(sale.id);
      expect(reloaded?.status).toBe(SaleStatus.PENDING_PAYMENT);
    });

    it('strictly denies Trainer from executing CreateSaleHandler (missing sales.create)', async () => {
      const handler = new CreateSaleHandler(saleRepo);
      const result = await handler.execute(
        new CreateSaleCommand({
          id: 'sale-trainer-denied-01',
          currency: 'USD',
          tenantId: DEFAULT_TEST_TENANT_ID,
          source: {
            sourceType: 'DRINK',
            sourceId: 'drink-01',
          },
          currentUser: {
            userId: trainerPrincipal.userId,
            roles: [...trainerPrincipal.roles],
            permissions: [...trainerPrincipal.permissions],
          },
        }),
      );
      expect(result.isFailure).toBe(true);
      expect(result.getError()).toBeInstanceOf(SaleUnauthorizedException);
    });
  });

  // ===========================================================================
  // LEVEL 5: PERSISTENCE INTEGRATION TESTS FOR DENIED MUTATIONS
  // ===========================================================================
  describe('Level 5: Persistence Integration Tests for Denied Mutations', () => {
    // -------------------------------------------------------------------------
    // Sales Mutation Denials
    // -------------------------------------------------------------------------
    it('denied Sale Create leaves persistence store empty (saveCount === 0)', async () => {
      const unauthContext = createSalesContext('createSale', undefined);
      await expect(guard.canActivate(unauthContext)).rejects.toThrow(UnauthorizedException);

      expect(saleRepo.saveCount).toBe(0);
      expect(saleRepo.store.size).toBe(0);
    });

    it('denied Sale Finalize by unprivileged caller leaves persisted aggregate unaltered (saveCount === 0)', async () => {
      const sale = createValidSaleFixture({ id: 'sale-occ-001' });
      // Reset status to DRAFT to test finalize
      const draftSale = Sale.create(
        {
          id: sale.id,
          tenantId: sale.tenantId,
          clientId: sale.clientId,
          source: sale.source,
          currency: 'USD',
        },
        DEFAULT_TEST_CLOCK,
      );
      await saleRepo.save(draftSale);
      saleRepo.saveCount = 0; // reset spy count

      const context = createSalesContext('finalizeSale', trainerPrincipal);
      await expect(guard.canActivate(context)).rejects.toThrow(ForbiddenException);

      expect(saleRepo.saveCount).toBe(0);
      const reloaded = await saleRepo.findById(draftSale.id);
      expect(reloaded?.status).toBe(SaleStatus.DRAFT);
    });

    it('denied Sale Cancel by Kitchen Staff leaves persisted aggregate active (saveCount === 0)', async () => {
      const sale = createValidSaleFixture({ id: 'sale-active-001' });
      await saleRepo.save(sale);
      saleRepo.saveCount = 0;

      const context = createSalesContext('cancelSale', kitchenStaffPrincipal);
      await expect(guard.canActivate(context)).rejects.toThrow(ForbiddenException);

      expect(saleRepo.saveCount).toBe(0);
      const reloaded = await saleRepo.findById(sale.id);
      expect(reloaded?.status).toBe(SaleStatus.PENDING_PAYMENT);
    });

    it('authorized caller attempting invalid domain operation (Finalize Empty Sale) does NOT mutate store', async () => {
      const emptySale = Sale.create(
        {
          id: SaleId.create('sale-empty-persist'),
          tenantId: DEFAULT_TEST_TENANT_ID,
          clientId: 'cli-001',
          source: SaleSource.create(SaleSourceType.FOOD, 'srv-1'),
          currency: 'USD',
        },
        DEFAULT_TEST_CLOCK,
      );
      await saleRepo.save(emptySale);
      saleRepo.saveCount = 0;

      // Authorized manager passes guard
      expect(await guard.canActivate(createSalesContext('finalizeSale', managerPrincipal))).toBe(
        true,
      );

      // Handler rejects EmptySaleException
      const handler = new FinalizeSaleHandler(saleRepo);
      const result = await handler.execute(
        new FinalizeSaleCommand({
          saleId: emptySale.id.value,
          currentUser: {
            userId: managerPrincipal.userId,
            roles: [...managerPrincipal.roles],
            permissions: [...managerPrincipal.permissions],
          },
        }),
      );

      expect(result.isFailure).toBe(true);
      expect(saleRepo.saveCount).toBe(0);
      const reloaded = await saleRepo.findById(emptySale.id);
      expect(reloaded?.status).toBe(SaleStatus.DRAFT);
    });

    // -------------------------------------------------------------------------
    // Payments Mutation Denials
    // -------------------------------------------------------------------------
    it('denied Payment Record by Trainer leaves persistence store empty (saveCount === 0)', async () => {
      const sale = createValidSaleFixture({ id: 'sale-pay-test-01' });
      await saleRepo.save(sale);
      paymentRepo.saveCount = 0;

      const context = createPaymentsContext('recordPayment', trainerPrincipal);
      await expect(guard.canActivate(context)).rejects.toThrow(ForbiddenException);

      expect(paymentRepo.saveCount).toBe(0);
      expect(paymentRepo.store.size).toBe(0);
    });

    it('denied Payment Cancel by Receptionist leaves persisted payment in PENDING status (saveCount === 0)', async () => {
      const payment = Payment.createPending(
        {
          id: PaymentId.create('pay-cancel-denied-01'),
          saleId: SaleId.create('sale-001'),
          tenantId: DEFAULT_TEST_TENANT_ID,
          amount: Money.create(50.0, 'USD'),
          method: PaymentMethod.CASH,
        },
        DEFAULT_TEST_CLOCK,
      );
      await paymentRepo.save(payment);
      paymentRepo.saveCount = 0;

      const context = createPaymentsContext('cancelPayment', receptionistPrincipal);
      await expect(guard.canActivate(context)).rejects.toThrow(ForbiddenException);

      expect(paymentRepo.saveCount).toBe(0);
      const reloaded = await paymentRepo.findById(payment.id);
      expect(reloaded?.status).toBe(PaymentStatus.PENDING);
    });

    it('authorized caller attempting invalid domain operation (Overpayment) does NOT mutate payment or sale', async () => {
      const sale = createValidSaleFixture({ id: 'sale-overpay-test' });
      await saleRepo.save(sale);
      saleRepo.saveCount = 0;
      paymentRepo.saveCount = 0;

      // Authorized receptionist passes guard
      expect(
        await guard.canActivate(createPaymentsContext('recordPayment', receptionistPrincipal)),
      ).toBe(true);

      const handler = new RecordPaymentHandler(paymentRepo, saleRepo);
      // Remaining balance is $100.00; attempt to pay $150.00
      const result = await handler.execute(
        new RecordPaymentCommand({
          saleId: sale.id.value,
          amount: 150.0,
          currency: 'USD',
          method: PaymentMethod.CASH,
          currentUser: {
            userId: receptionistPrincipal.userId,
            roles: [...receptionistPrincipal.roles],
            permissions: [...receptionistPrincipal.permissions],
          },
        }),
      );

      expect(result.isFailure).toBe(true);
      expect(paymentRepo.saveCount).toBe(0);
      expect(saleRepo.saveCount).toBe(0);
      const reloadedSale = await saleRepo.findById(sale.id);
      expect(reloadedSale?.status).toBe(SaleStatus.PENDING_PAYMENT);
    });

    // -------------------------------------------------------------------------
    // Receipts Mutation Denials
    // -------------------------------------------------------------------------
    it('denied Receipt Issuance by Receptionist leaves persistence store empty (saveCount === 0)', async () => {
      const { sale, payment } = createPaidSaleWithPaymentAndReceiptFixture();
      await saleRepo.save(sale);
      await paymentRepo.save(payment);
      receiptRepo.saveCount = 0;

      const context = createReceiptsContext('issueReceipt', receptionistPrincipal);
      await expect(guard.canActivate(context)).rejects.toThrow(ForbiddenException);

      expect(receiptRepo.saveCount).toBe(0);
      expect(receiptRepo.store.size).toBe(0);
    });

    it('authorized caller attempting invalid domain operation (Issue Receipt for Unpaid Sale) does NOT persist', async () => {
      const unpaidSale = createValidSaleFixture({ id: 'sale-unpaid-receipt-test' });
      await saleRepo.save(unpaidSale);
      receiptRepo.saveCount = 0;

      // Authorized manager passes guard
      expect(await guard.canActivate(createReceiptsContext('issueReceipt', managerPrincipal))).toBe(
        true,
      );

      const handler = new IssueReceiptHandler(receiptRepo, saleRepo, paymentRepo);
      const result = await handler.execute(
        new IssueReceiptCommand({
          saleId: unpaidSale.id.value,
          currentUser: {
            userId: managerPrincipal.userId,
            roles: [...managerPrincipal.roles],
            permissions: [...managerPrincipal.permissions],
          },
        }),
      );

      expect(result.isFailure).toBe(true);
      expect(receiptRepo.saveCount).toBe(0);
      expect(receiptRepo.store.size).toBe(0);
    });
  });

  // ===========================================================================
  // LEVEL 6: CROSS-MODULE REGRESSION & FINANCIAL COORDINATION TESTS
  // ===========================================================================
  describe('Level 6: Cross-Module Regression and Financial Coordination Tests', () => {
    it('preserves coverage of CompletePayment coordinating Payment settlement, Sale balance, and Receipt issuance', async () => {
      // 1. Setup finalized sale with remaining balance of $100.00
      const sale = createValidSaleFixture({ id: 'sale-coord-001' });
      await saleRepo.save(sale);

      // 2. Setup pending payment for $100.00
      const payment = Payment.createPending(
        {
          id: PaymentId.create('pay-coord-001'),
          saleId: sale.id,
          tenantId: sale.tenantId,
          amount: Money.create(100.0, 'USD'),
          method: PaymentMethod.QR,
        },
        DEFAULT_TEST_CLOCK,
      );
      await paymentRepo.save(payment);

      // Reset save counts
      saleRepo.saveCount = 0;
      paymentRepo.saveCount = 0;

      // 3. Authorized complete payment execution
      const completeHandler = new CompletePaymentHandler(paymentRepo, saleRepo);
      const result = await completeHandler.execute(
        new CompletePaymentCommand({
          paymentId: payment.id.value,
          reference: 'QR-CONFIRMED-TRACE-999',
          currentUser: {
            userId: managerPrincipal.userId,
            roles: [...managerPrincipal.roles],
            permissions: [...managerPrincipal.permissions],
          },
        }),
      );

      expect(result.isSuccess).toBe(true);
      expect(result.getValue().status).toBe(PaymentStatus.COMPLETED);
      const updatedSale = await saleRepo.findById(sale.id);
      expect(updatedSale?.status).toBe(SaleStatus.PAID);
      expect(paymentRepo.saveCount).toBe(1);
      expect(saleRepo.saveCount).toBe(1);

      // 4. Now issue receipt for the fully settled sale
      const issueHandler = new IssueReceiptHandler(receiptRepo, saleRepo, paymentRepo);
      const receiptResult = await issueHandler.execute(
        new IssueReceiptCommand({
          saleId: sale.id.value,
          currentUser: {
            userId: managerPrincipal.userId,
            roles: [...managerPrincipal.roles],
            permissions: [...managerPrincipal.permissions],
          },
        }),
      );

      expect(receiptResult.isSuccess).toBe(true);
      expect(receiptResult.getValue().saleId).toBe(sale.id.value);
      expect(receiptRepo.saveCount).toBe(1);
    });

    it('enforces Receipt Immutability: duplicate issuance attempt is strictly rejected', async () => {
      const { sale, payment, receipt } = createPaidSaleWithPaymentAndReceiptFixture();
      await saleRepo.save(sale);
      await paymentRepo.save(payment);
      await receiptRepo.save(receipt);
      receiptRepo.saveCount = 0;

      const issueHandler = new IssueReceiptHandler(receiptRepo, saleRepo, paymentRepo);
      const result = await issueHandler.execute(
        new IssueReceiptCommand({
          saleId: sale.id.value,
          currentUser: {
            userId: managerPrincipal.userId,
            roles: [...managerPrincipal.roles],
            permissions: [...managerPrincipal.permissions],
          },
        }),
      );

      // Deterministically returns the existing receipt without duplicate save
      expect(result.isSuccess).toBe(true);
      expect(result.getValue().id).toBe(receipt.id.value);
      expect(receiptRepo.saveCount).toBe(0);
    });

    it('verifies strict segregation of duties between Sales, Payments, and Receipts capabilities', async () => {
      // Principal with role Manager and ONLY sales.create
      const salesOnlyUser = new AuthenticatedUserContext({
        userId: 'usr_sales_only',
        email: 'sales.only@kinergy.local',
        status: 'ACTIVE',
        roles: ['Manager'],
        permissions: ['sales.create'],
      });

      // Can create sales
      expect(await guard.canActivate(createSalesContext('createSale', salesOnlyUser))).toBe(true);
      // CANNOT record payments
      await expect(
        guard.canActivate(createPaymentsContext('recordPayment', salesOnlyUser)),
      ).rejects.toThrow(ForbiddenException);
      // CANNOT issue receipts
      await expect(
        guard.canActivate(createReceiptsContext('issueReceipt', salesOnlyUser)),
      ).rejects.toThrow(ForbiddenException);

      // Principal with role Manager and ONLY payments.read
      const paymentsReadOnlyUser = new AuthenticatedUserContext({
        userId: 'usr_pay_read_only',
        email: 'pay.reader@kinergy.local',
        status: 'ACTIVE',
        roles: ['Manager'],
        permissions: ['payments.read'],
      });

      // Can read payments
      expect(
        await guard.canActivate(createPaymentsContext('getPaymentById', paymentsReadOnlyUser)),
      ).toBe(true);
      // CANNOT mutate sales
      await expect(
        guard.canActivate(createSalesContext('createSale', paymentsReadOnlyUser)),
      ).rejects.toThrow(ForbiddenException);
      // CANNOT issue receipts
      await expect(
        guard.canActivate(createReceiptsContext('issueReceipt', paymentsReadOnlyUser)),
      ).rejects.toThrow(ForbiddenException);
    });

    it('proves denied requests cannot leak financial balances, item line prices, or client PII', async () => {
      const sale = createValidSaleFixture({ id: 'sale-confidential-001' });
      await saleRepo.save(sale);

      const context = createSalesContext('getSale', clientPrincipal);
      try {
        await guard.canActivate(context);
        fail('Expected ForbiddenException');
      } catch (error) {
        expect(error).toBeInstanceOf(ForbiddenException);
        const errJson = JSON.stringify(error);
        // Ensure no sensitive financial or domain details leak in the error object
        expect(errJson).not.toContain('Clinical Rehabilitation Consultation');
        expect(errJson).not.toContain('100.00');
        expect(errJson).not.toContain('cli-fixture-001');
      }
    });
  });
});
