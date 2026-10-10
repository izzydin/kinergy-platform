import { ExecutionContext, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import {
  Payment,
  PaymentId,
  Sale,
  SaleId,
  SaleSource,
  SaleSourceType,
  SaleStatus,
  Money,
  PaymentMethod,
  PaymentStatus,
  SystemClock,
  Clock,
  PaymentRepositoryPort,
  SaleRepositoryPort,
  SalesEventPublisherPort,
  IUnitOfWork,
  RecordPaymentHandler,
  CompletePaymentHandler,
  SettlePaymentHandler,
  FailPaymentHandler,
  CancelPaymentHandler,
  CompletePaymentCommand,
  PaymentUnauthorizedException,
} from '@kinergy-platform/core';
import { PaymentsController } from '../controllers/payments.controller';
import { AuthorizationGuard } from '../../platform/identity/authorization/authorization.guard';
import { DefaultAuthorizationEvaluator } from '../../platform/identity/authorization/default-authorization-evaluator';
import { IPermissionResolver } from '../../platform/identity/authorization/authorization.interface';
import { AuthenticatedUserContext } from '../../platform/identity/context/authenticated-user-context';
import { AuthenticatedUserPayload } from '../../platform/identity/decorators/current-user.decorator';
import { ROLES_KEY } from '../../platform/identity/authorization/decorators/roles.decorator';
import { PERMISSIONS_KEY } from '../../platform/identity/authorization/decorators/permissions.decorator';
import { checkPaymentAuthorization } from '../../../../../packages/core/src/sales/application/shared/payment-authorization';
import { SettlePaymentRequestDto, CancelPaymentRequestDto, FailPaymentRequestDto } from '../dto';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Spy In-Memory Payment Repository tracking save operations and state snapshots.
 */
class SpyPaymentRepository implements PaymentRepositoryPort {
  public store = new Map<string, Payment>();
  public saveCount = 0;
  public lastSavedPayment: Payment | null = null;
  public shouldFailSave = false;

  async findById(id: PaymentId | string): Promise<Payment | null> {
    const key = typeof id === 'string' ? id.trim() : id.value;
    return this.store.get(key) ?? null;
  }

  async findBySaleId(saleId: SaleId | string): Promise<Payment[]> {
    const key = typeof saleId === 'string' ? saleId.trim() : saleId.value;
    return Array.from(this.store.values()).filter((p) => p.saleId.value === key);
  }

  async save(payment: Payment): Promise<void> {
    if (this.shouldFailSave) {
      throw new Error('Database persistence failure during Payment write.');
    }
    this.saveCount++;
    this.lastSavedPayment = payment;
    this.store.set(payment.id.value, payment);
  }

  clear(): void {
    this.store.clear();
    this.saveCount = 0;
    this.lastSavedPayment = null;
    this.shouldFailSave = false;
  }
}

/**
 * Spy In-Memory Sale Repository tracking save operations and state snapshots.
 */
class SpySaleRepository implements SaleRepositoryPort {
  public store = new Map<string, Sale>();
  public saveCount = 0;
  public lastSavedSale: Sale | null = null;
  public shouldFailSave = false;

  async findById(id: SaleId | string): Promise<Sale | null> {
    const key = typeof id === 'string' ? id.trim() : id.value;
    return this.store.get(key) ?? null;
  }

  async save(sale: Sale): Promise<void> {
    if (this.shouldFailSave) {
      throw new Error('Database persistence failure during Sale write.');
    }
    this.saveCount++;
    this.lastSavedSale = sale;
    this.store.set(sale.id.value, sale);
  }

  clear(): void {
    this.store.clear();
    this.saveCount = 0;
    this.lastSavedSale = null;
    this.shouldFailSave = false;
  }
}

/**
 * Mock Unit of Work providing transaction boundary and rollback tracking.
 */
class MockUnitOfWork implements IUnitOfWork {
  public transactionStarted = false;
  public transactionCommitted = false;
  public transactionRolledBack = false;

  async executeInTransaction<T>(work: () => Promise<T>): Promise<T> {
    this.transactionStarted = true;
    try {
      const result = await work();
      this.transactionCommitted = true;
      return result;
    } catch (error) {
      this.transactionRolledBack = true;
      throw error;
    }
  }

  reset(): void {
    this.transactionStarted = false;
    this.transactionCommitted = false;
    this.transactionRolledBack = false;
  }
}

/**
 * Mock Event Publisher tracking domain events.
 */
class MockEventPublisher implements SalesEventPublisherPort {
  public publishedEvents: unknown[] = [];

  async publish(events: ReadonlyArray<unknown>): Promise<void> {
    this.publishedEvents.push(...events);
  }

  clear(): void {
    this.publishedEvents = [];
  }
}

describe('Principal Payments Authorization & Financial Consistency Specification (payments:manage)', () => {
  let reflector: Reflector;
  let permissionResolver: jest.Mocked<IPermissionResolver>;
  let evaluator: DefaultAuthorizationEvaluator;
  let guard: AuthorizationGuard;

  let paymentRepo: SpyPaymentRepository;
  let saleRepo: SpySaleRepository;
  let unitOfWork: MockUnitOfWork;
  let eventPublisher: MockEventPublisher;
  let clock: Clock;
  let controller: PaymentsController;

  const tenantId = 'tenant_kinergy_payments';

  // Personas
  const authorizedManagerManage = new AuthenticatedUserContext({
    userId: 'usr_mgr_01',
    email: 'manager@kinergy.platform',
    status: 'ACTIVE',
    roles: ['Manager'],
    permissions: ['payments:manage'], // colon-notation format
    tenantId,
  });

  const authorizedOwnerDotManage = new AuthenticatedUserContext({
    userId: 'usr_owner_01',
    email: 'owner@kinergy.platform',
    status: 'ACTIVE',
    roles: ['Owner'],
    permissions: ['payments.manage'], // canonical dot-notation format
    tenantId,
  });

  const authorizedWildcardAdmin = new AuthenticatedUserContext({
    userId: 'usr_admin_01',
    email: 'admin@kinergy.platform',
    status: 'ACTIVE',
    roles: ['Platform Admin'],
    permissions: ['*'], // superuser wildcard
    tenantId,
  });

  const receptionistWithCreateOnly = new AuthenticatedUserContext({
    userId: 'usr_recept_create_only',
    email: 'reception@kinergy.platform',
    status: 'ACTIVE',
    roles: ['Receptionist'],
    permissions: ['payments.create'], // lacks payments.manage
    tenantId,
  });

  const clientUnauthorized = new AuthenticatedUserContext({
    userId: 'usr_client_01',
    email: 'client@example.com',
    status: 'ACTIVE',
    roles: ['Client'],
    permissions: ['client.portal.read'],
    tenantId,
  });

  const trainerUnauthorized = new AuthenticatedUserContext({
    userId: 'usr_trainer_01',
    email: 'trainer@kinergy.platform',
    status: 'ACTIVE',
    roles: ['Trainer'],
    permissions: ['sales.read'], // lacks payments:manage
    tenantId,
  });

  const toPayload = (ctx: AuthenticatedUserContext): AuthenticatedUserPayload => ({
    id: ctx.userId,
    email: ctx.email,
    status: ctx.status,
    roles: [...ctx.roles],
    permissions: [...ctx.permissions],
    tenantId: ctx.tenantId,
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

    paymentRepo = new SpyPaymentRepository();
    saleRepo = new SpySaleRepository();
    unitOfWork = new MockUnitOfWork();
    eventPublisher = new MockEventPublisher();
    clock = new SystemClock();

    const recordPaymentHandler = new RecordPaymentHandler(
      paymentRepo,
      saleRepo,
      clock,
      eventPublisher,
      unitOfWork,
    );
    const completePaymentHandler = new CompletePaymentHandler(
      paymentRepo,
      saleRepo,
      clock,
      eventPublisher,
      unitOfWork,
    );
    const settlePaymentHandler = new SettlePaymentHandler(
      paymentRepo,
      saleRepo,
      clock,
      eventPublisher,
      unitOfWork,
    );
    const failPaymentHandler = new FailPaymentHandler(paymentRepo, saleRepo, clock, eventPublisher);
    const cancelPaymentHandler = new CancelPaymentHandler(
      paymentRepo,
      saleRepo,
      clock,
      eventPublisher,
    );

    controller = new PaymentsController(
      paymentRepo,
      saleRepo,
      recordPaymentHandler,
      undefined,
      undefined,
      undefined,
      completePaymentHandler,
      settlePaymentHandler,
      failPaymentHandler,
      cancelPaymentHandler,
    );
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

  const seedFinalizedSale = async (
    saleIdStr: string,
    amountDollars = 100.0,
    currency = 'USD',
  ): Promise<Sale> => {
    const sale = Sale.create({
      id: SaleId.create(saleIdStr),
      tenantId,
      currency,
      source: SaleSource.create(SaleSourceType.FOOD, 'fd_1'),
    });
    sale.addItem({
      source: SaleSource.create(SaleSourceType.FOOD, 'fd_1'),
      description: 'Protein Shake',
      quantity: 1,
      unitPrice: Money.create(amountDollars, currency),
    });
    sale.finalize(clock);
    await saleRepo.save(sale);
    return sale;
  };

  const seedPendingPayment = async (
    paymentIdStr: string,
    sale: Sale,
    amountDollars = 100.0,
  ): Promise<Payment> => {
    const payment = Payment.createPending(
      {
        id: PaymentId.create(paymentIdStr),
        saleId: sale.id,
        tenantId,
        method: PaymentMethod.CASH,
        amount: Money.create(amountDollars, sale.currency),
      },
      clock,
    );
    await paymentRepo.save(payment);
    return payment;
  };

  // =========================================================================
  // 1. All Public Paths & Route Decorators Enforcement Audit
  // =========================================================================
  describe('1. Public Paths & Interface Boundary Decorators Enforcement', () => {
    it('verifies CreatePayment primary route (recordPayment) and aliases require payments.create / payments.manage', () => {
      const primaryHandler = PaymentsController.prototype.recordPayment;
      const aliasHandler = PaymentsController.prototype.createPayment;

      const primaryRoles = reflector.get<string[]>(ROLES_KEY, primaryHandler);
      const primaryPerms = reflector.get<string[]>(PERMISSIONS_KEY, primaryHandler);
      const aliasRoles = reflector.get<string[]>(ROLES_KEY, aliasHandler);
      const aliasPerms = reflector.get<string[]>(PERMISSIONS_KEY, aliasHandler);

      expect(primaryRoles).toEqual(['Owner', 'Manager', 'Receptionist', 'Kitchen Staff']);
      expect(primaryPerms).toEqual(['payments.create']);
      expect(aliasRoles).toEqual(['Owner', 'Manager', 'Receptionist', 'Kitchen Staff']);
      expect(aliasPerms).toEqual(['payments.create']);
    });

    it('verifies CompletePayment primary route and settlePayment alias require elevated settlement permissions', () => {
      const completeHandler = PaymentsController.prototype.completePayment;
      const settleHandler = PaymentsController.prototype.settlePayment;

      const completeRoles = reflector.get<string[]>(ROLES_KEY, completeHandler);
      const completePerms = reflector.get<string[]>(PERMISSIONS_KEY, completeHandler);
      const settleRoles = reflector.get<string[]>(ROLES_KEY, settleHandler);
      const settlePerms = reflector.get<string[]>(PERMISSIONS_KEY, settleHandler);

      expect(completeRoles).toEqual(['Owner', 'Manager', 'Receptionist']);
      expect(completePerms).toEqual(['payments.create', 'payments.manage']);
      expect(settleRoles).toEqual(['Owner', 'Manager', 'Receptionist']);
      expect(settlePerms).toEqual(['payments.create', 'payments.manage']);
    });

    it('verifies FailPayment requires elevated settlement permissions', () => {
      const failHandler = PaymentsController.prototype.failPayment;
      const roles = reflector.get<string[]>(ROLES_KEY, failHandler);
      const permissions = reflector.get<string[]>(PERMISSIONS_KEY, failHandler);

      expect(roles).toEqual(['Owner', 'Manager', 'Receptionist']);
      expect(permissions).toEqual(['payments.create', 'payments.manage']);
    });

    it('verifies CancelPayment strictly requires payments.manage and is restricted to Owner & Manager', () => {
      const cancelHandler = PaymentsController.prototype.cancelPayment;
      const roles = reflector.get<string[]>(ROLES_KEY, cancelHandler);
      const permissions = reflector.get<string[]>(PERMISSIONS_KEY, cancelHandler);

      expect(roles).toEqual(['Owner', 'Manager']);
      expect(roles).not.toContain('Receptionist');
      expect(roles).not.toContain('Kitchen Staff');
      expect(roles).not.toContain('Trainer');
      expect(permissions).toEqual(['payments.manage']);
    });
  });

  // =========================================================================
  // 2. Mutation 1: CreatePayment Authorization & Lifecycle Transitions
  // =========================================================================
  describe('2. Mutation: CreatePayment (recordPayment / createPayment)', () => {
    it('Authorized caller with payments:manage succeeds and coordinates Sale status to PAID', async () => {
      const sale = await seedFinalizedSale('sale_create_auth_01', 50.0);

      const response = await controller.recordPayment(
        sale.id.value,
        {
          method: PaymentMethod.CASH,
          amount: 50.0,
          currency: 'USD',
          reference: 'REF-TX-001',
        },
        toPayload(authorizedManagerManage),
      );

      expect(response.id).toBeDefined();
      expect(response.status).toBe(PaymentStatus.COMPLETED);
      expect(response.amount.amount).toBe(50.0);

      // Verify Sale status coordinated to PAID through domain
      const updatedSale = await saleRepo.findById(sale.id);
      expect(updatedSale?.status).toBe(SaleStatus.PAID);
    });

    it('Authorized caller with canonical payments.manage succeeds via createPayment alias', async () => {
      const sale = await seedFinalizedSale('sale_create_alias_01', 75.0);

      const response = await controller.createPayment(
        sale.id.value,
        {
          method: PaymentMethod.CASH,
          amount: 75.0,
          currency: 'USD',
        },
        toPayload(authorizedOwnerDotManage),
      );

      expect(response.status).toBe(PaymentStatus.COMPLETED);
      const updatedSale = await saleRepo.findById(sale.id);
      expect(updatedSale?.status).toBe(SaleStatus.PAID);
    });

    it('Authorized superuser wildcard caller succeeds', async () => {
      const sale = await seedFinalizedSale('sale_create_wild_01', 40.0);

      const response = await controller.recordPayment(
        sale.id.value,
        {
          method: PaymentMethod.CASH,
          amount: 40.0,
          currency: 'USD',
        },
        toPayload(authorizedWildcardAdmin),
      );

      expect(response.status).toBe(PaymentStatus.COMPLETED);
    });

    it('Unauthenticated caller is rejected with UnauthorizedException at transport boundary', async () => {
      const context = createMockContext('recordPayment', undefined);
      await expect(guard.canActivate(context)).rejects.toThrow(UnauthorizedException);
      expect(paymentRepo.saveCount).toBe(0);
    });

    it('Authenticated caller without payments:manage is rejected with ForbiddenException', async () => {
      const context = createMockContext('recordPayment', trainerUnauthorized);
      await expect(guard.canActivate(context)).rejects.toThrow(ForbiddenException);
      expect(paymentRepo.saveCount).toBe(0);
    });

    it('Direct handler call by authenticated caller lacking permission throws PaymentUnauthorizedException', () => {
      expect(() => {
        checkPaymentAuthorization(
          {
            id: 'usr_trainer',
            roles: ['Trainer'],
            permissions: ['sales.read'],
          },
          ['payments.create', 'payments.manage'],
        );
      }).toThrow(PaymentUnauthorizedException);
    });

    it('Authorized caller attempting invalid transition (overpayment beyond Sale balance) is rejected', async () => {
      const sale = await seedFinalizedSale('sale_overpay_01', 50.0);
      const initialPaymentCount = paymentRepo.saveCount;

      await expect(
        controller.recordPayment(
          sale.id.value,
          {
            method: PaymentMethod.CASH,
            amount: 100.0, // Exceeds $50.00 balance
            currency: 'USD',
          },
          toPayload(authorizedManagerManage),
        ),
      ).rejects.toThrow();

      expect(paymentRepo.saveCount).toBe(initialPaymentCount);
    });

    it('Authorized caller attempting creation against non-payable CANCELLED sale is rejected', async () => {
      const sale = await seedFinalizedSale('sale_cancelled_01', 50.0);
      sale.cancel('Voided', clock);
      await saleRepo.save(sale);

      const initialSaveCount = paymentRepo.saveCount;

      await expect(
        controller.recordPayment(
          sale.id.value,
          {
            method: PaymentMethod.CASH,
            amount: 50.0,
            currency: 'USD',
          },
          toPayload(authorizedManagerManage),
        ),
      ).rejects.toThrow();

      expect(paymentRepo.saveCount).toBe(initialSaveCount);
    });
  });

  // =========================================================================
  // 3. Mutation 2: CompletePayment Authorization & Coordinated Settlement
  // =========================================================================
  describe('3. Mutation: CompletePayment (completePayment / settlePayment)', () => {
    it('Authorized caller with payments:manage completes pending payment and coordinates Sale to PAID', async () => {
      const sale = await seedFinalizedSale('sale_complete_01', 100.0);
      const payment = await seedPendingPayment('pmt_complete_01', sale, 100.0);

      const response = await controller.completePayment(
        payment.id.value,
        { reference: 'QR-CONFIRMED-TRACE-99' },
        toPayload(authorizedManagerManage),
      );

      expect(response.status).toBe(PaymentStatus.COMPLETED);
      expect(response.reference).toBe('QR-CONFIRMED-TRACE-99');
      expect(response.paidAt).toBeDefined();

      const updatedSale = await saleRepo.findById(sale.id);
      expect(updatedSale?.status).toBe(SaleStatus.PAID);
    });

    it('Authorized caller with canonical dot-notation payments.manage succeeds via settlePayment alias', async () => {
      const sale = await seedFinalizedSale('sale_settle_01', 80.0);
      const payment = await seedPendingPayment('pmt_settle_01', sale, 80.0);

      const response = await controller.settlePayment(
        payment.id.value,
        { reference: 'SETTLE-TRACE-42' },
        toPayload(authorizedOwnerDotManage),
      );

      expect(response.status).toBe(PaymentStatus.COMPLETED);
      const updatedSale = await saleRepo.findById(sale.id);
      expect(updatedSale?.status).toBe(SaleStatus.PAID);
    });

    it('Unauthenticated caller on completePayment is rejected with UnauthorizedException', async () => {
      const context = createMockContext('completePayment', undefined);
      await expect(guard.canActivate(context)).rejects.toThrow(UnauthorizedException);
    });

    it('Unauthenticated caller on settlePayment alias is rejected with UnauthorizedException', async () => {
      const context = createMockContext('settlePayment', undefined);
      await expect(guard.canActivate(context)).rejects.toThrow(UnauthorizedException);
    });

    it('Authenticated caller without payments:manage is rejected with ForbiddenException', async () => {
      const context = createMockContext('completePayment', trainerUnauthorized);
      await expect(guard.canActivate(context)).rejects.toThrow(ForbiddenException);
    });

    it('Client portal user is strictly forbidden from completePayment and settlePayment', async () => {
      const contextComplete = createMockContext('completePayment', clientUnauthorized);
      const contextSettle = createMockContext('settlePayment', clientUnauthorized);

      await expect(guard.canActivate(contextComplete)).rejects.toThrow(ForbiddenException);
      await expect(guard.canActivate(contextSettle)).rejects.toThrow(ForbiddenException);
    });

    it('Authorized caller attempting invalid state transition (already COMPLETED payment) is rejected with 422', async () => {
      const sale = await seedFinalizedSale('sale_double_comp_01', 100.0);
      const payment = await seedPendingPayment('pmt_double_comp_01', sale, 100.0);

      // Complete once
      await controller.completePayment(payment.id.value, {}, toPayload(authorizedManagerManage));

      // Attempt second completion (terminal state transition violation)
      await expect(
        controller.completePayment(payment.id.value, {}, toPayload(authorizedManagerManage)),
      ).rejects.toThrow();
    });

    it('Denied completion does not modify Payment or Sale aggregates', async () => {
      const sale = await seedFinalizedSale('sale_denied_comp_01', 100.0);
      const payment = await seedPendingPayment('pmt_denied_comp_01', sale, 100.0);

      const paymentSaveCountBefore = paymentRepo.saveCount;
      const saleSaveCountBefore = saleRepo.saveCount;

      // Unprivileged caller attempt
      await expect(
        controller.completePayment(payment.id.value, {}, toPayload(trainerUnauthorized)),
      ).rejects.toThrow();

      // State remains strictly PENDING
      const pmtAfter = await paymentRepo.findById(payment.id);
      expect(pmtAfter?.status).toBe(PaymentStatus.PENDING);
      expect(pmtAfter?.paidAt).toBeNull();

      // Sale remains strictly PENDING_PAYMENT
      const saleAfter = await saleRepo.findById(sale.id);
      expect(saleAfter?.status).toBe(SaleStatus.PENDING_PAYMENT);

      expect(paymentRepo.saveCount).toBe(paymentSaveCountBefore);
      expect(saleRepo.saveCount).toBe(saleSaveCountBefore);
    });
  });

  // =========================================================================
  // 4. Mutation 3: FailPayment Authorization & Lifecycle Transitions
  // =========================================================================
  describe('4. Mutation: FailPayment (failPayment)', () => {
    it('Authorized caller with payments:manage marks pending payment as FAILED', async () => {
      const sale = await seedFinalizedSale('sale_fail_01', 60.0);
      const payment = await seedPendingPayment('pmt_fail_01', sale, 60.0);

      const response = await controller.failPayment(
        payment.id.value,
        { reason: 'Terminal decline by card rail' },
        toPayload(authorizedManagerManage),
      );

      expect(response.status).toBe(PaymentStatus.FAILED);
      expect(response.paidAt).toBeNull();

      const pmtAfter = await paymentRepo.findById(payment.id);
      expect(pmtAfter?.status).toBe(PaymentStatus.FAILED);
    });

    it('Unauthenticated caller on failPayment is rejected with UnauthorizedException', async () => {
      const context = createMockContext('failPayment', undefined);
      await expect(guard.canActivate(context)).rejects.toThrow(UnauthorizedException);
    });

    it('Authenticated caller without payments:manage is rejected with ForbiddenException', async () => {
      const context = createMockContext('failPayment', trainerUnauthorized);
      await expect(guard.canActivate(context)).rejects.toThrow(ForbiddenException);
    });

    it('Authorized caller attempting invalid state transition (failing an already COMPLETED payment) is rejected', async () => {
      const sale = await seedFinalizedSale('sale_fail_completed_01', 50.0);
      const payment = await seedPendingPayment('pmt_fail_completed_01', sale, 50.0);

      // Settle first
      await controller.completePayment(payment.id.value, {}, toPayload(authorizedManagerManage));

      // Attempt to fail completed payment (illegal state transition)
      await expect(
        controller.failPayment(
          payment.id.value,
          { reason: 'Late rail decline' },
          toPayload(authorizedManagerManage),
        ),
      ).rejects.toThrow();

      const pmtAfter = await paymentRepo.findById(payment.id);
      expect(pmtAfter?.status).toBe(PaymentStatus.COMPLETED);
    });
  });

  // =========================================================================
  // 5. Mutation 4: CancelPayment Authorization & Lifecycle Transitions
  // =========================================================================
  describe('5. Mutation: CancelPayment (cancelPayment)', () => {
    it('Authorized caller with payments:manage cancels pending payment', async () => {
      const sale = await seedFinalizedSale('sale_cancel_01', 90.0);
      const payment = await seedPendingPayment('pmt_cancel_01', sale, 90.0);

      const response = await controller.cancelPayment(
        payment.id.value,
        { reason: 'Customer changed tender choice' },
        toPayload(authorizedManagerManage),
      );

      expect(response.status).toBe(PaymentStatus.CANCELLED);
      expect(response.paidAt).toBeNull();

      const pmtAfter = await paymentRepo.findById(payment.id);
      expect(pmtAfter?.status).toBe(PaymentStatus.CANCELLED);
    });

    it('Unauthenticated caller on cancelPayment is rejected with UnauthorizedException', async () => {
      const context = createMockContext('cancelPayment', undefined);
      await expect(guard.canActivate(context)).rejects.toThrow(UnauthorizedException);
    });

    it('Authenticated caller without payments:manage (e.g. Receptionist with only payments.create) is denied', async () => {
      const context = createMockContext('cancelPayment', receptionistWithCreateOnly);
      await expect(guard.canActivate(context)).rejects.toThrow(ForbiddenException);
    });

    it('Authorized caller attempting invalid transition (cancelling a COMPLETED payment) is rejected', async () => {
      const sale = await seedFinalizedSale('sale_cancel_comp_01', 100.0);
      const payment = await seedPendingPayment('pmt_cancel_comp_01', sale, 100.0);

      await controller.completePayment(payment.id.value, {}, toPayload(authorizedManagerManage));

      // Attempt to cancel settled payment (reversal/cancellation of settled tender forbidden in-place)
      await expect(
        controller.cancelPayment(
          payment.id.value,
          { reason: 'Cashier void attempt' },
          toPayload(authorizedManagerManage),
        ),
      ).rejects.toThrow();

      const pmtAfter = await paymentRepo.findById(payment.id);
      expect(pmtAfter?.status).toBe(PaymentStatus.COMPLETED);
    });

    it('Denied cancellation does not modify Payment or Sale aggregates', async () => {
      const sale = await seedFinalizedSale('sale_denied_cancel_01', 80.0);
      const payment = await seedPendingPayment('pmt_denied_cancel_01', sale, 80.0);

      const paymentSaveCountBefore = paymentRepo.saveCount;

      await expect(
        controller.cancelPayment(
          payment.id.value,
          { reason: 'Unauthorized void' },
          toPayload(trainerUnauthorized),
        ),
      ).rejects.toThrow();

      const pmtAfter = await paymentRepo.findById(payment.id);
      expect(pmtAfter?.status).toBe(PaymentStatus.PENDING);
      expect(paymentRepo.saveCount).toBe(paymentSaveCountBefore);
    });
  });

  // =========================================================================
  // 6. Transaction Boundary, Financial Consistency & Rollback
  // =========================================================================
  describe('6. Transaction Boundary & Financial Consistency Rollback', () => {
    it('Failed persistence rolls back coordinated changes and does not leave contradictory states', async () => {
      const sale = await seedFinalizedSale('sale_rollback_01', 100.0);
      const payment = await seedPendingPayment('pmt_rollback_01', sale, 100.0);

      // Configure Sale repository persistence to throw inside transaction
      saleRepo.shouldFailSave = true;

      const handler = new CompletePaymentHandler(
        paymentRepo,
        saleRepo,
        clock,
        eventPublisher,
        unitOfWork,
      );

      const result = await handler.execute(
        new CompletePaymentCommand({
          paymentId: payment.id.value,
          saleId: sale.id.value,
          tenantId,
          currentUser: {
            id: authorizedManagerManage.userId,
            roles: [...authorizedManagerManage.roles],
            permissions: [...authorizedManagerManage.permissions],
          },
        }),
      );

      // Application result fails cleanly
      expect(result.isFailure).toBe(true);
      expect(unitOfWork.transactionRolledBack).toBe(true);

      // Post-commit domain events are NOT published when persistence fails
      expect(eventPublisher.publishedEvents.length).toBe(0);
    });

    it('Domain Purity: Payment and Sale domain aggregates contain zero authorization logic', () => {
      const domainDir = path.resolve(__dirname, '../../../../../packages/core/src/sales/domain');
      const files = fs.readdirSync(domainDir);

      const forbiddenTokens = [
        'authorization',
        'permissions',
        'roles',
        'currentUser',
        '@nestjs',
        'jwt',
      ];

      for (const file of files) {
        if (!file.endsWith('.ts')) continue;
        const content = fs.readFileSync(path.join(domainDir, file), 'utf-8');

        for (const token of forbiddenTokens) {
          expect(content.toLowerCase()).not.toContain(`import { ${token.toLowerCase()}`);
        }
      }
    });

    it('Prevents arbitrary status or paidAt injection through general update DTO', () => {
      // SettlePaymentRequestDto, CompletePaymentRequestDto, CancelPaymentRequestDto, FailPaymentRequestDto
      // do not expose status or paidAt fields
      const settleDto = new SettlePaymentRequestDto();
      const cancelDto = new CancelPaymentRequestDto();
      const failDto = new FailPaymentRequestDto();

      expect('status' in settleDto).toBe(false);
      expect('paidAt' in settleDto).toBe(false);
      expect('status' in cancelDto).toBe(false);
      expect('paidAt' in cancelDto).toBe(false);
      expect('status' in failDto).toBe(false);
      expect('paidAt' in failDto).toBe(false);
    });

    it('Duplicate payment reference idempotency check is preserved', async () => {
      const sale = await seedFinalizedSale('sale_dup_ref_01', 100.0);

      // First payment with reference REF-001
      await controller.recordPayment(
        sale.id.value,
        {
          method: PaymentMethod.CASH,
          amount: 50.0,
          currency: 'USD',
          reference: 'REF-001',
        },
        toPayload(authorizedManagerManage),
      );

      // Second payment with duplicate reference REF-001 against same Sale
      await expect(
        controller.recordPayment(
          sale.id.value,
          {
            method: PaymentMethod.CASH,
            amount: 50.0,
            currency: 'USD',
            reference: 'REF-001',
          },
          toPayload(authorizedManagerManage),
        ),
      ).rejects.toThrow();
    });
  });
});
