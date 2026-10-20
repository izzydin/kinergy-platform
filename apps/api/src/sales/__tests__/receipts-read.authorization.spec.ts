import { ExecutionContext, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ReceiptsController } from '../controllers/receipts.controller';
import { AuthorizationGuard } from '../../platform/identity/authorization/authorization.guard';
import { DefaultAuthorizationEvaluator } from '../../platform/identity/authorization/default-authorization-evaluator';
import { IPermissionResolver } from '../../platform/identity/authorization/authorization.interface';
import { AuthenticatedUserContext } from '../../platform/identity/context/authenticated-user-context';
import { ROLES_KEY } from '../../platform/identity/authorization/decorators/roles.decorator';
import { PERMISSIONS_KEY } from '../../platform/identity/authorization/decorators/permissions.decorator';
import {
  Receipt,
  ReceiptId,
  ReceiptNumber,
  Sale,
  SaleId,
  Money,
  SourceReference,
  SourceType,
  PaymentMethod,
  PaymentStatus,
  Payment,
  PaymentId,
  PaymentReference,
  ReceiptRepositoryPort,
  SaleRepositoryPort,
  PaymentRepositoryPort,
  IssueReceiptHandler,
  GetReceiptHandler,
  GetReceiptBySaleHandler,
  ReceiptUnauthorizedException,
} from '@kinergy-platform/core';
import { InMemoryReceiptSequenceGenerator } from '@kinergy-platform/core/server';

// ---------------------------------------------------------------------------
// In-Memory Test Doubles
// ---------------------------------------------------------------------------

class MockReceiptRepo implements ReceiptRepositoryPort {
  public store = new Map<string, Receipt>();
  private readonly sequenceGenerator = new InMemoryReceiptSequenceGenerator();

  async findById(id: ReceiptId | string): Promise<Receipt | null> {
    const key = typeof id === 'string' ? id.trim() : id.value;
    return this.store.get(key) ?? null;
  }

  async findBySaleId(saleId: SaleId | string): Promise<Receipt | null> {
    const key = typeof saleId === 'string' ? saleId.trim() : saleId.value;
    for (const receipt of this.store.values()) {
      if (receipt.saleId.value === key) {
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
    this.store.set(receipt.id.value, receipt);
  }

  async getNextReceiptNumber(tenantId: string, year: number): Promise<ReceiptNumber> {
    return this.sequenceGenerator.getNextReceiptNumber(tenantId, year);
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

class MockPaymentRepo implements PaymentRepositoryPort {
  public store = new Map<string, Payment>();

  async findById(id: PaymentId | string): Promise<Payment | null> {
    const key = typeof id === 'string' ? id.trim() : id.value;
    return this.store.get(key) ?? null;
  }

  async findBySaleId(saleId: SaleId | string): Promise<Payment[]> {
    const key = typeof saleId === 'string' ? saleId.trim() : saleId.value;
    return Array.from(this.store.values()).filter((p) => p.saleId.value === key);
  }

  async save(payment: Payment): Promise<void> {
    this.store.set(payment.id.value, payment);
  }
}

describe('Receipts Read Operations Authorization Specification (receipts:read / receipts.read)', () => {
  let reflector: Reflector;
  let permissionResolver: jest.Mocked<IPermissionResolver>;
  let evaluator: DefaultAuthorizationEvaluator;
  let guard: AuthorizationGuard;

  let receiptRepo: MockReceiptRepo;
  let saleRepo: MockSaleRepo;
  let paymentRepo: MockPaymentRepo;
  let controller: ReceiptsController;

  const tenantMain = 'tenant_main';
  const tenantRival = 'tenant_rival';
  const clientAliceId = 'usr_client_alice';
  const clientBobId = 'usr_client_bob';

  const saleAliceId = 'sale_alice_101';
  const saleWalkInId = 'sale_walkin_102';
  const receiptAliceId = 'rec_uuid_alice_101';
  const receiptWalkInId = 'rec_uuid_walkin_102';

  // ---------------------------------------------------------------------------
  // User Security Contexts
  // ---------------------------------------------------------------------------

  const userWithColonNotation = new AuthenticatedUserContext({
    userId: 'usr_recept_colon',
    email: 'receptionist_colon@kinergy.platform',
    status: 'ACTIVE',
    roles: ['Receptionist'],
    permissions: ['receipts:read'], // Colon notation
    tenantId: tenantMain,
  });

  const userWithDotNotation = new AuthenticatedUserContext({
    userId: 'usr_recept_dot',
    email: 'receptionist_dot@kinergy.platform',
    status: 'ACTIVE',
    roles: ['Receptionist'],
    permissions: ['receipts.read'], // Canonical dot notation
    tenantId: tenantMain,
  });

  const userWithReceiptsManage = new AuthenticatedUserContext({
    userId: 'usr_mgr_manage',
    email: 'manager@kinergy.platform',
    status: 'ACTIVE',
    roles: ['Manager'],
    permissions: ['receipts:manage'], // receipts:manage covers receipts:read
    tenantId: tenantMain,
  });

  const userWithSalesManage = new AuthenticatedUserContext({
    userId: 'usr_sales_mgr',
    email: 'sales_mgr@kinergy.platform',
    status: 'ACTIVE',
    roles: ['Manager'],
    permissions: ['sales.manage'], // sales.manage covers receipts.read
    tenantId: tenantMain,
  });

  const userWithBillingRead = new AuthenticatedUserContext({
    userId: 'usr_billing_read',
    email: 'auditor@kinergy.platform',
    status: 'ACTIVE',
    roles: ['Receptionist'],
    permissions: ['billing:read'], // billing:read covers receipts:read
    tenantId: tenantMain,
  });

  const userWithBillingManage = new AuthenticatedUserContext({
    userId: 'usr_owner_billing_manage',
    email: 'owner@kinergy.platform',
    status: 'ACTIVE',
    roles: ['Owner'],
    permissions: ['billing.manage'], // billing.manage covers receipts:read
    tenantId: tenantMain,
  });

  const userWithWildcard = new AuthenticatedUserContext({
    userId: 'usr_superadmin',
    email: 'superadmin@kinergy.platform',
    status: 'ACTIVE',
    roles: ['Platform Admin'],
    permissions: ['*'], // Wildcard covers everything
    tenantId: tenantMain,
  });

  const clientAliceUser = new AuthenticatedUserContext({
    userId: clientAliceId,
    email: 'alice@example.com',
    status: 'ACTIVE',
    roles: ['Client'],
    permissions: ['receipts:read'],
    tenantId: tenantMain,
  });

  const clientBobUser = new AuthenticatedUserContext({
    userId: clientBobId,
    email: 'bob@example.com',
    status: 'ACTIVE',
    roles: ['Client'],
    permissions: ['receipts:read'],
    tenantId: tenantMain,
  });

  const trainerUser = new AuthenticatedUserContext({
    userId: 'usr_trainer_01',
    email: 'trainer@kinergy.platform',
    status: 'ACTIVE',
    roles: ['Trainer'],
    permissions: ['receipts:read'],
    tenantId: tenantMain,
  });

  const userMissingPermission = new AuthenticatedUserContext({
    userId: 'usr_unauth_staff',
    email: 'unauth@kinergy.platform',
    status: 'ACTIVE',
    roles: ['Receptionist'],
    permissions: ['sales.read', 'inventory.read'], // Missing receipts:read
    tenantId: tenantMain,
  });

  const unprivilegedVisitor = new AuthenticatedUserContext({
    userId: 'usr_visitor',
    email: 'visitor@example.com',
    status: 'ACTIVE',
    roles: ['Visitor'], // Unrecognized role
    permissions: [],
    tenantId: tenantMain,
  });

  const inactiveUser = new AuthenticatedUserContext({
    userId: 'usr_suspended_recept',
    email: 'suspended@kinergy.platform',
    status: 'SUSPENDED', // Disabled account
    roles: ['Receptionist'],
    permissions: ['receipts:read'],
    tenantId: tenantMain,
  });

  const rivalTenantUser = new AuthenticatedUserContext({
    userId: 'usr_rival_recept',
    email: 'rival@rivalgym.com',
    status: 'ACTIVE',
    roles: ['Receptionist'],
    permissions: ['receipts:read'],
    tenantId: tenantRival,
  });

  // ---------------------------------------------------------------------------
  // Helper to Seed Settled Sale & Receipt
  // ---------------------------------------------------------------------------

  const seedSettledSaleAndReceipt = async (
    receiptId: string,
    saleId: string,
    tenantId: string,
    clientId?: string,
    clientName?: string,
  ): Promise<{ sale: Sale; payment: Payment; receipt: Receipt }> => {
    const sale = Sale.create({
      id: SaleId.create(saleId),
      tenantId,
      clientId,
      currency: 'USD',
      source: SourceReference.create({
        sourceType: SourceType.INVENTORY_ITEM,
        sourceId: 'inv_protein_01',
      }),
    });

    sale.addItem({
      source: SourceReference.create({
        sourceType: SourceType.INVENTORY_ITEM,
        sourceId: 'inv_protein_01',
      }),
      description: 'Optimum Nutrition Gold Standard Whey 2lb',
      skuOrCode: 'SKU-WHEY-2LB',
      quantity: 2,
      unitPrice: Money.create(35.0, 'USD'),
    });

    sale.finalize();

    const payment = Payment.createCompleted({
      saleId: sale.id,
      tenantId,
      amount: Money.create(70.0, 'USD'),
      method: PaymentMethod.CASH,
      reference: PaymentReference.create('AUTH_TRX_998877'),
    });

    sale.markPaid();

    await saleRepo.save(sale);
    await paymentRepo.save(payment);

    const issueHandler = new IssueReceiptHandler(receiptRepo, saleRepo, paymentRepo);
    const issueResult = await issueHandler.execute({
      input: {
        saleId: sale.id.value,
        receiptId,
        tenantId,
        saleReference: 'ORD-2026-000101',
        clientSummary: clientId
          ? {
              id: clientId,
              referenceNumber: 'CLI-0001',
              fullName: clientName ?? 'Alice Smith',
              email: 'alice@example.com',
              phone: '+1-555-0100',
            }
          : undefined,
        currentUser: {
          id: 'usr_system',
          roles: ['Owner'],
          permissions: ['receipts.manage'],
          tenantId,
        },
      },
    });

    expect(issueResult.isSuccess).toBe(true);
    const receipt = (await receiptRepo.findById(receiptId))!;
    expect(receipt).toBeDefined();

    return { sale, payment, receipt };
  };

  beforeEach(async () => {
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

    receiptRepo = new MockReceiptRepo();
    saleRepo = new MockSaleRepo();
    paymentRepo = new MockPaymentRepo();

    controller = new ReceiptsController(
      receiptRepo,
      saleRepo,
      paymentRepo,
      new IssueReceiptHandler(receiptRepo, saleRepo, paymentRepo),
      new GetReceiptHandler(receiptRepo),
      new GetReceiptBySaleHandler(receiptRepo, saleRepo),
    );

    // Seed test fixtures:
    // 1. Client-attributed receipt for Alice
    await seedSettledSaleAndReceipt(
      receiptAliceId,
      saleAliceId,
      tenantMain,
      clientAliceId,
      'Alice Smith',
    );

    // 2. Walk-in anonymous receipt (no clientId)
    await seedSettledSaleAndReceipt(
      receiptWalkInId,
      saleWalkInId,
      tenantMain,
      undefined,
      undefined,
    );
  });

  const createMockContext = (
    handlerName: keyof ReceiptsController,
    userContext?: AuthenticatedUserContext,
  ): ExecutionContext => {
    return {
      getHandler: () => ReceiptsController.prototype[handlerName],
      getClass: () => ReceiptsController,
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
      handler: keyof ReceiptsController;
      roles: string[];
      permissions: string[];
    }> = [
      {
        name: 'GetReceiptBySale (GET /sales/:saleId/receipt and /receipts/sale/:saleId)',
        handler: 'getReceiptBySale',
        roles: [
          'Owner',
          'Gym Owner',
          'Manager',
          'Gym Manager',
          'Platform Admin',
          'Receptionist',
          'Kitchen Staff',
          'Trainer',
          'Client',
          'Member',
        ],
        permissions: ['receipts.read'],
      },
      {
        name: 'GetReceiptById (GET /receipts/:receiptId)',
        handler: 'getReceiptById',
        roles: [
          'Owner',
          'Gym Owner',
          'Manager',
          'Gym Manager',
          'Platform Admin',
          'Receptionist',
          'Kitchen Staff',
          'Trainer',
          'Client',
          'Member',
        ],
        permissions: ['receipts.read'],
      },
    ];

    it.each(readEndpoints)(
      'verifies $name enforces receipts.read and authorized roles',
      ({ handler, roles: expectedRoles, permissions: expectedPermissions }) => {
        const fn = ReceiptsController.prototype[handler];
        const actualRoles = reflector.get<string[]>(ROLES_KEY, fn);
        const actualPermissions = reflector.get<string[]>(PERMISSIONS_KEY, fn);

        expect(actualPermissions).toEqual(expectedPermissions);
        expect(actualRoles).toEqual(expectedRoles);
      },
    );
  });

  // ===========================================================================
  // 2. Permission Evaluation: Colon-Notation & Dot-Notation Integration
  // ===========================================================================
  describe('2. Permission Evaluation: Colon-Notation & Dot-Notation Integration', () => {
    const readHandlers: Array<keyof ReceiptsController> = ['getReceiptById', 'getReceiptBySale'];

    it.each(readHandlers)(
      'authorizes caller with colon-notation receipts:read for %s',
      async (handlerName) => {
        const context = createMockContext(handlerName, userWithColonNotation);
        const isAuthorized = await guard.canActivate(context);
        expect(isAuthorized).toBe(true);
      },
    );

    it.each(readHandlers)(
      'authorizes caller with canonical dot-notation receipts.read for %s',
      async (handlerName) => {
        const context = createMockContext(handlerName, userWithDotNotation);
        const isAuthorized = await guard.canActivate(context);
        expect(isAuthorized).toBe(true);
      },
    );

    it.each(readHandlers)(
      'authorizes caller with receipts:manage covering receipts:read for %s',
      async (handlerName) => {
        const context = createMockContext(handlerName, userWithReceiptsManage);
        const isAuthorized = await guard.canActivate(context);
        expect(isAuthorized).toBe(true);
      },
    );

    it.each(readHandlers)(
      'authorizes caller with sales.manage covering receipts:read for %s',
      async (handlerName) => {
        const context = createMockContext(handlerName, userWithSalesManage);
        const isAuthorized = await guard.canActivate(context);
        expect(isAuthorized).toBe(true);
      },
    );

    it.each(readHandlers)(
      'authorizes caller with legacy billing:read covering receipts:read for %s',
      async (handlerName) => {
        const context = createMockContext(handlerName, userWithBillingRead);
        const isAuthorized = await guard.canActivate(context);
        expect(isAuthorized).toBe(true);
      },
    );

    it.each(readHandlers)(
      'authorizes caller with billing.manage covering receipts:read for %s',
      async (handlerName) => {
        const context = createMockContext(handlerName, userWithBillingManage);
        const isAuthorized = await guard.canActivate(context);
        expect(isAuthorized).toBe(true);
      },
    );

    it.each(readHandlers)(
      'authorizes caller with wildcard * covering receipts:read for %s',
      async (handlerName) => {
        const context = createMockContext(handlerName, userWithWildcard);
        const isAuthorized = await guard.canActivate(context);
        expect(isAuthorized).toBe(true);
      },
    );
  });

  // ===========================================================================
  // 3. Denial Enforcement: Missing Permission & Unauthenticated Requests
  // ===========================================================================
  describe('3. Denial Enforcement: Missing Permission & Unauthenticated Requests', () => {
    const readHandlers: Array<keyof ReceiptsController> = ['getReceiptById', 'getReceiptBySale'];

    it.each(readHandlers)(
      'denies caller missing receipts:read on %s with ForbiddenException',
      async (handlerName) => {
        const context = createMockContext(handlerName, userMissingPermission);
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
      'strictly denies inactive/disabled user on %s with UnauthorizedException',
      async (handlerName) => {
        const context = createMockContext(handlerName, inactiveUser);
        await expect(guard.canActivate(context)).rejects.toThrow(UnauthorizedException);
      },
    );

    it.each(readHandlers)(
      'strictly denies unprivileged role (e.g. Visitor) on %s with ForbiddenException',
      async (handlerName) => {
        const context = createMockContext(handlerName, unprivilegedVisitor);
        await expect(guard.canActivate(context)).rejects.toThrow(ForbiddenException);
      },
    );
  });

  // ===========================================================================
  // 4. Object-Level Ownership & Tenant Isolation Boundary
  // ===========================================================================
  describe('4. Object-Level Ownership & Tenant Isolation Boundary', () => {
    it('allows client to retrieve their own receipt by UUID via getReceiptById', async () => {
      const response = await controller.getReceiptById(receiptAliceId, {
        id: clientAliceUser.userId,
        email: clientAliceUser.email,
        status: clientAliceUser.status,
        roles: [...clientAliceUser.roles],
        permissions: [...clientAliceUser.permissions],
        tenantId: clientAliceUser.tenantId,
      });

      expect(response).toBeDefined();
      expect(response.id).toBe(receiptAliceId);
      expect(response.saleId).toBe(saleAliceId);
      expect(response.clientSnapshot?.clientId).toBe(clientAliceId);
      expect(response.clientSnapshot?.fullName).toBe('Alice Smith');
    });

    it('allows client to retrieve their own receipt by saleId via getReceiptBySale', async () => {
      const response = await controller.getReceiptBySale(saleAliceId, {
        id: clientAliceUser.userId,
        email: clientAliceUser.email,
        status: clientAliceUser.status,
        roles: [...clientAliceUser.roles],
        permissions: [...clientAliceUser.permissions],
        tenantId: clientAliceUser.tenantId,
      });

      expect(response).toBeDefined();
      expect(response.id).toBe(receiptAliceId);
      expect(response.saleId).toBe(saleAliceId);
      expect(response.clientSnapshot?.clientId).toBe(clientAliceId);
    });

    it('strictly forbids client from retrieving another client receipt (throwing ReceiptUnauthorizedException)', async () => {
      // Bob tries to access Alice's receipt
      await expect(
        controller.getReceiptById(receiptAliceId, {
          id: clientBobUser.userId,
          email: clientBobUser.email,
          status: clientBobUser.status,
          roles: [...clientBobUser.roles],
          permissions: [...clientBobUser.permissions],
          tenantId: clientBobUser.tenantId,
        }),
      ).rejects.toThrow(ReceiptUnauthorizedException);

      await expect(
        controller.getReceiptBySale(saleAliceId, {
          id: clientBobUser.userId,
          email: clientBobUser.email,
          status: clientBobUser.status,
          roles: [...clientBobUser.roles],
          permissions: [...clientBobUser.permissions],
          tenantId: clientBobUser.tenantId,
        }),
      ).rejects.toThrow(ReceiptUnauthorizedException);
    });

    it('strictly forbids client from retrieving an anonymous walk-in receipt', async () => {
      // Alice tries to access walk-in receipt with null clientSnapshot
      await expect(
        controller.getReceiptById(receiptWalkInId, {
          id: clientAliceUser.userId,
          email: clientAliceUser.email,
          status: clientAliceUser.status,
          roles: [...clientAliceUser.roles],
          permissions: [...clientAliceUser.permissions],
          tenantId: clientAliceUser.tenantId,
        }),
      ).rejects.toThrow(ReceiptUnauthorizedException);
    });

    it('strictly forbids Trainer from viewing general facility receipts (ADR-0074)', async () => {
      await expect(
        controller.getReceiptById(receiptAliceId, {
          id: trainerUser.userId,
          email: trainerUser.email,
          status: trainerUser.status,
          roles: [...trainerUser.roles],
          permissions: [...trainerUser.permissions],
          tenantId: trainerUser.tenantId,
        }),
      ).rejects.toThrow(ReceiptUnauthorizedException);
    });

    it('strictly enforces multi-tenant boundary on receipt retrieval', async () => {
      await expect(
        controller.getReceiptById(receiptAliceId, {
          id: rivalTenantUser.userId,
          email: rivalTenantUser.email,
          status: rivalTenantUser.status,
          roles: [...rivalTenantUser.roles],
          permissions: [...rivalTenantUser.permissions],
          tenantId: rivalTenantUser.tenantId,
        }),
      ).rejects.toThrow(ReceiptUnauthorizedException);
    });
  });

  // ===========================================================================
  // 5. Snapshot Protection & Immutability Verification
  // ===========================================================================
  describe('5. Snapshot Protection & Historical Immutability', () => {
    it('protects historical Client details, line items, discounts, totals, payment details from unauthorized disclosure', async () => {
      // Unauthorized caller trying to access receipt should be rejected without disclosing data
      await expect(
        controller.getReceiptById(receiptAliceId, {
          id: userMissingPermission.userId,
          email: userMissingPermission.email,
          status: userMissingPermission.status,
          roles: [...userMissingPermission.roles],
          permissions: [...userMissingPermission.permissions],
          tenantId: userMissingPermission.tenantId,
        }),
      ).rejects.toThrow(ReceiptUnauthorizedException);
    });

    it('preserves receipt snapshots and historical immutability after successful retrieval', async () => {
      const staffPayload = {
        id: userWithColonNotation.userId,
        email: userWithColonNotation.email,
        status: userWithColonNotation.status,
        roles: [...userWithColonNotation.roles],
        permissions: [...userWithColonNotation.permissions],
        tenantId: userWithColonNotation.tenantId,
      };

      const firstRead = await controller.getReceiptById(receiptAliceId, staffPayload);
      const secondRead = await controller.getReceiptById(receiptAliceId, staffPayload);

      // Verify exact parity between sequential reads (zero state mutation)
      expect(firstRead.id).toBe(secondRead.id);
      expect(firstRead.receiptNumber).toBe(secondRead.receiptNumber);
      expect(firstRead.issuedAt).toBe(secondRead.issuedAt);
      expect(firstRead.reprintCount).toBe(0);
      expect(secondRead.reprintCount).toBe(0);
      expect(firstRead.lastReprintedAt).toBeNull();
      expect(secondRead.lastReprintedAt).toBeNull();
      expect(firstRead.status).toBe('ISSUED');
      expect(secondRead.status).toBe('ISSUED');

      // Verify snapshot values
      expect(firstRead.items).toHaveLength(1);
      expect(firstRead.items[0]!.description).toBe('Optimum Nutrition Gold Standard Whey 2lb');
      expect(firstRead.items[0]!.skuOrCode).toBe('SKU-WHEY-2LB');
      expect(firstRead.items[0]!.quantity).toBe(2);
      expect(firstRead.items[0]!.total.cents).toBe(7000);
      expect(firstRead.items[0]!.total.formatted).toBe('70.00');

      // Verify payment snapshot
      expect(firstRead.payments).toHaveLength(1);
      expect(firstRead.payments[0]!.method).toBe(PaymentMethod.CASH);
      expect(firstRead.payments[0]!.status).toBe(PaymentStatus.COMPLETED);
      expect(firstRead.payments[0]!.amount.cents).toBe(7000);
      expect(firstRead.payments[0]!.reference).toBe('AUTH_TRX_998877');

      // Verify total
      expect(firstRead.total.cents).toBe(7000);
      expect(firstRead.total.formatted).toBe('70.00');
    });
  });

  // ===========================================================================
  // 6. Verification of Internal Issuance Workflow Protection
  // ===========================================================================
  describe('6. Internal Receipt-Generation Workflow Security', () => {
    it('verifies IssueReceiptHandler enforces receipts.manage and rejects unauthorized callers', async () => {
      const issueHandler = new IssueReceiptHandler(receiptRepo, saleRepo, paymentRepo);

      // Call with caller lacking receipts.manage
      const result = await issueHandler.execute({
        input: {
          saleId: saleAliceId,
          tenantId: tenantMain,
          currentUser: {
            id: 'usr_client_alice',
            roles: ['Client'],
            permissions: ['receipts.read'], // Only read, not manage
            tenantId: tenantMain,
          },
        },
      });

      expect(result.isFailure).toBe(true);
      expect(result.getError()).toBeInstanceOf(ReceiptUnauthorizedException);
    });

    it('verifies public issuance route POST /sales/:saleId/receipt requires receipts.manage and cannot be invoked by read-only callers', async () => {
      const clientPayload = {
        id: clientAliceUser.userId,
        email: clientAliceUser.email,
        status: clientAliceUser.status,
        roles: [...clientAliceUser.roles],
        permissions: [...clientAliceUser.permissions],
        tenantId: clientAliceUser.tenantId,
      };

      await expect(controller.issueReceipt(saleAliceId, {}, clientPayload)).rejects.toThrow(
        ReceiptUnauthorizedException,
      );
    });
  });
});
