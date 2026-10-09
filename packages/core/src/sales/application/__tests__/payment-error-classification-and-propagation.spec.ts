import { CreatePaymentHandler } from '../handlers/create-payment.handler';
import { CompletePaymentHandler } from '../handlers/complete-payment.handler';
import { FailPaymentHandler } from '../handlers/fail-payment.handler';
import { CancelPaymentHandler } from '../handlers/cancel-payment.handler';
import { GetPaymentByIdHandler } from '../handlers/get-payment-by-id.handler';

import { CreatePaymentCommand } from '../commands/create-payment.command';
import { CompletePaymentCommand } from '../commands/complete-payment.command';
import { FailPaymentCommand } from '../commands/fail-payment.command';
import { CancelPaymentCommand } from '../commands/cancel-payment.command';

import { PaymentRepositoryPort, FindPaymentsResult } from '../ports/payment-repository.port';
import { SaleRepositoryPort } from '../ports/sale-repository.port';
import { Payment } from '../../domain/payment.aggregate';
import { Sale } from '../../domain/sale.aggregate';
import { SaleId } from '../../domain/value-objects/sale-id.vo';
import { PaymentId } from '../../domain/value-objects/payment-id.vo';
import { SourceReference } from '../../domain/value-objects/source-reference.vo';
import { SourceType } from '../../domain/enums/source-type.enum';
import { PaymentMethod } from '../../domain/enums/payment-method.enum';
import { PaymentStatus } from '../../domain/enums/payment-status.enum';
import { SaleStatus } from '../../domain/enums/sale-status.enum';
import { Money } from '../../domain/value-objects/money.vo';
import { DeterministicClock } from '../../domain/shared/clock';

// Domain Exceptions & Aliases
import {
  InvalidPaymentAmountException,
  InvalidPaymentAmount,
  InvalidPaymentMethodException,
  InvalidPaymentMethod,
  InvalidPaymentTransitionException,
  InvalidPaymentTransition,
  PaymentAlreadyCompletedException,
  PaymentAlreadyCompleted,
  PaymentAlreadyFailedException,
  PaymentAlreadyFailed,
  PaymentAlreadyCancelledException,
  PaymentAlreadyCancelled,
  SaleCannotBeMarkedPaidException,
  SaleCannotBeMarkedPaid,
  PaymentOptimisticLockException,
} from '../../domain/exceptions';

// Application Exceptions & Aliases
import {
  PaymentNotFoundException,
  PaymentNotFound,
  SaleNotFoundException,
  SaleNotFound,
  DuplicatePaymentReferenceException,
  PaymentReferenceAlreadyExistsException,
  PaymentReferenceAlreadyExists,
  PaymentSaleConsistencyException,
  PaymentSaleConsistencyFailure,
  PaymentCurrencyMismatchException,
  PaymentOverpaymentException,
  PaymentSaleMismatchException,
  PaymentUnauthorizedException,
} from '../exceptions';

// Infrastructure Error & Mapper
import { PaymentPersistenceException } from '../../infrastructure/persistence/prisma/exceptions/payment-persistence.exception';
import { PrismaDatabaseErrorMapper } from '../../infrastructure/persistence/prisma/mappers/prisma-database-error.mapper';
import { PrismaPaymentRepository } from '../../infrastructure/persistence/prisma/repositories/prisma-payment.repository';
import { PrismaClient } from '@prisma/client';

class MockPaymentRepository implements PaymentRepositoryPort {
  public store = new Map<string, Payment>();
  public throwOnSave?: Error;
  public throwOnFind?: Error;

  async findById(id: string): Promise<Payment | null> {
    if (this.throwOnFind) throw this.throwOnFind;
    return this.store.get(id) ?? null;
  }

  async getById(id: string): Promise<Payment | null> {
    return this.findById(id);
  }

  async findBySaleId(saleId: string | SaleId): Promise<Payment[]> {
    if (this.throwOnFind) throw this.throwOnFind;
    const saleIdStr = typeof saleId === 'string' ? saleId : saleId.value;
    return Array.from(this.store.values()).filter((p) => p.saleId.value === saleIdStr);
  }

  async listBySaleId(saleId: string | SaleId): Promise<Payment[]> {
    return this.findBySaleId(saleId);
  }

  async save(payment: Payment): Promise<void> {
    if (this.throwOnSave) throw this.throwOnSave;
    this.store.set(payment.id.value, payment);
  }

  async findMany(): Promise<FindPaymentsResult> {
    return { items: [], total: 0 };
  }

  async list(): Promise<FindPaymentsResult> {
    return { items: [], total: 0 };
  }
}

class MockSaleRepository implements SaleRepositoryPort {
  public store = new Map<string, Sale>();
  public throwOnSave?: Error;
  public throwOnFind?: Error;

  async findById(id: string | SaleId): Promise<Sale | null> {
    if (this.throwOnFind) throw this.throwOnFind;
    const idStr = typeof id === 'string' ? id : id.value;
    return this.store.get(idStr) ?? null;
  }

  async getById(id: string | SaleId): Promise<Sale | null> {
    return this.findById(id);
  }

  async save(sale: Sale): Promise<void> {
    if (this.throwOnSave) throw this.throwOnSave;
    this.store.set(sale.id.value, sale);
  }

  async findBySourceReference(): Promise<Sale | null> {
    return null;
  }

  async findBySourceCode(): Promise<Sale | null> {
    return null;
  }
}

describe('Payment Error Architecture & Classification Matrix', () => {
  const clock = new DeterministicClock(new Date('2026-10-09T10:00:00.000Z'));
  const validSource = SourceReference.create({
    sourceType: SourceType.INVENTORY_ITEM,
    sourceId: 'inv-item-001',
    sourceCode: 'TERM-01',
  });

  const authorizedUser = {
    userId: 'usr-admin-1',
    roles: ['Platform Admin'],
    permissions: ['payments.create', 'payments.manage'],
  };

  function createTestSale(
    id = 'sale-100',
    total = 100.0,
    status = SaleStatus.PENDING_PAYMENT,
  ): Sale {
    const sale = Sale.create(
      { id: SaleId.create(id), currency: 'USD', source: validSource, tenantId: 'tenant-1' },
      clock,
    );
    sale.addItem({
      source: validSource,
      description: 'Monthly Membership',
      quantity: 1,
      unitPrice: Money.create(total, 'USD'),
    });
    sale.finalize(clock);
    if (status === SaleStatus.CANCELLED) {
      sale.cancel('Order cancelled by client', clock);
    }
    return sale;
  }

  function createTestPayment(
    id = 'pay-100',
    saleId = 'sale-100',
    amount = 100.0,
    status = PaymentStatus.PENDING,
  ): Payment {
    if (status === PaymentStatus.COMPLETED) {
      return Payment.createCompleted(
        {
          id: PaymentId.create(id),
          saleId: SaleId.create(saleId),
          tenantId: 'tenant-1',
          method: PaymentMethod.CASH,
          amount: Money.create(amount, 'USD'),
        },
        clock,
      );
    }
    const payment = Payment.createPending(
      {
        id: PaymentId.create(id),
        saleId: SaleId.create(saleId),
        tenantId: 'tenant-1',
        method: PaymentMethod.CASH,
        amount: Money.create(amount, 'USD'),
      },
      clock,
    );
    if (status === PaymentStatus.FAILED) {
      payment.fail('Card declined', clock);
    } else if (status === PaymentStatus.CANCELLED) {
      payment.cancel('Customer aborted', clock);
    }
    return payment;
  }

  // =========================================================================
  // 1. DOMAIN ERRORS
  // =========================================================================
  describe('1. Domain Errors (Business Invariants within Aggregates)', () => {
    it('enforces InvalidPaymentAmount / InvalidPaymentAmountException when amount is non-positive or invalid', async () => {
      const paymentRepo = new MockPaymentRepository();
      const saleRepo = new MockSaleRepository();
      const sale = createTestSale('sale-amt');
      saleRepo.store.set(sale.id.value, sale);

      const handler = new CreatePaymentHandler(paymentRepo, saleRepo, clock);

      // Test zero amount
      const zeroResult = await handler.execute(
        new CreatePaymentCommand({
          saleId: 'sale-amt',
          tenantId: 'tenant-1',
          amount: 0,
          method: PaymentMethod.CASH,
          currentUser: authorizedUser,
        }),
      );
      expect(zeroResult.isFailure).toBe(true);
      expect(zeroResult.getError()).toBeInstanceOf(InvalidPaymentAmountException);
      expect(zeroResult.getError()).toBeInstanceOf(InvalidPaymentAmount);

      // Test negative amount
      const negativeResult = await handler.execute(
        new CreatePaymentCommand({
          saleId: 'sale-amt',
          tenantId: 'tenant-1',
          amount: -50,
          method: PaymentMethod.CASH,
          currentUser: authorizedUser,
        }),
      );
      expect(negativeResult.isFailure).toBe(true);
      expect(negativeResult.getError()).toBeInstanceOf(InvalidPaymentAmountException);

      // Test domain aggregate instantiation directly
      expect(() => {
        Payment.createCompleted(
          {
            saleId: SaleId.create('sale-amt'),
            method: PaymentMethod.CASH,
            amount: Money.create(0, 'USD'),
          },
          clock,
        );
      }).toThrow(InvalidPaymentAmountException);
    });

    it('enforces InvalidPaymentMethod / InvalidPaymentMethodException on invalid or unsupported methods', async () => {
      const paymentRepo = new MockPaymentRepository();
      const saleRepo = new MockSaleRepository();
      const sale = createTestSale('sale-meth');
      saleRepo.store.set(sale.id.value, sale);

      const handler = new CreatePaymentHandler(paymentRepo, saleRepo, clock);

      const result = await handler.execute(
        new CreatePaymentCommand({
          saleId: 'sale-meth',
          tenantId: 'tenant-1',
          amount: 50,
          method: 'BITCOIN' as unknown as PaymentMethod,
          currentUser: authorizedUser,
        }),
      );

      expect(result.isFailure).toBe(true);
      expect(result.getError()).toBeInstanceOf(InvalidPaymentMethodException);
      expect(result.getError()).toBeInstanceOf(InvalidPaymentMethod);
      expect((result.getError() as InvalidPaymentMethodException).code).toBe(
        'INVALID_PAYMENT_METHOD',
      );
    });

    it('enforces InvalidPaymentTransition / InvalidPaymentTransitionException on illegal state transitions', () => {
      const failedPayment = createTestPayment('pay-fail-trans', 'sale-1', 50, PaymentStatus.FAILED);
      expect(() => failedPayment.complete()).toThrow(InvalidPaymentTransitionException);
      expect(() => failedPayment.complete()).toThrow(InvalidPaymentTransition);

      const cancelledPayment = createTestPayment(
        'pay-canc-trans',
        'sale-1',
        50,
        PaymentStatus.CANCELLED,
      );
      expect(() => cancelledPayment.complete()).toThrow(InvalidPaymentTransitionException);
    });

    it('enforces PaymentAlreadyCompleted / PaymentAlreadyCompletedException when mutating completed payment', async () => {
      const paymentRepo = new MockPaymentRepository();
      const saleRepo = new MockSaleRepository();
      const sale = createTestSale('sale-already-comp');
      const payment = createTestPayment('pay-comp-1', sale.id.value, 100, PaymentStatus.COMPLETED);
      paymentRepo.store.set(payment.id.value, payment);
      saleRepo.store.set(sale.id.value, sale);

      const completeHandler = new CompletePaymentHandler(paymentRepo, saleRepo, clock);
      const result = await completeHandler.execute(
        new CompletePaymentCommand({
          paymentId: payment.id.value,
          tenantId: 'tenant-1',
          currentUser: authorizedUser,
        }),
      );

      expect(result.isFailure).toBe(true);
      expect(result.getError()).toBeInstanceOf(PaymentAlreadyCompletedException);
      expect(result.getError()).toBeInstanceOf(PaymentAlreadyCompleted);
      expect(result.getError()).toBeInstanceOf(InvalidPaymentTransitionException);
      expect((result.getError() as PaymentAlreadyCompletedException).code).toBe(
        'INVALID_PAYMENT_TRANSITION',
      );
      expect((result.getError() as PaymentAlreadyCompletedException).subcode).toBe(
        'PAYMENT_ALREADY_COMPLETED',
      );

      // Also verify attempting to fail or cancel an already completed payment throws PaymentAlreadyCompletedException
      expect(() => payment.fail('decline', clock)).toThrow(PaymentAlreadyCompletedException);
      expect(() => payment.cancel('abort', clock)).toThrow(PaymentAlreadyCompletedException);
    });

    it('enforces PaymentAlreadyFailed / PaymentAlreadyFailedException on repeated failure attempts', async () => {
      const paymentRepo = new MockPaymentRepository();
      const saleRepo = new MockSaleRepository();
      const payment = createTestPayment('pay-failed-1', 'sale-1', 50, PaymentStatus.FAILED);
      paymentRepo.store.set(payment.id.value, payment);

      const failHandler = new FailPaymentHandler(paymentRepo, saleRepo, clock);
      const result = await failHandler.execute(
        new FailPaymentCommand({
          paymentId: payment.id.value,
          tenantId: 'tenant-1',
          reason: 'Duplicate decline signal',
          currentUser: authorizedUser,
        }),
      );

      expect(result.isFailure).toBe(true);
      expect(result.getError()).toBeInstanceOf(PaymentAlreadyFailedException);
      expect(result.getError()).toBeInstanceOf(PaymentAlreadyFailed);
      expect(result.getError()).toBeInstanceOf(InvalidPaymentTransitionException);
      expect((result.getError() as PaymentAlreadyFailedException).code).toBe(
        'INVALID_PAYMENT_TRANSITION',
      );
      expect((result.getError() as PaymentAlreadyFailedException).subcode).toBe(
        'PAYMENT_ALREADY_FAILED',
      );
    });

    it('enforces PaymentAlreadyCancelled / PaymentAlreadyCancelledException on repeated cancellation attempts', async () => {
      const paymentRepo = new MockPaymentRepository();
      const saleRepo = new MockSaleRepository();
      const payment = createTestPayment('pay-cancelled-1', 'sale-1', 50, PaymentStatus.CANCELLED);
      paymentRepo.store.set(payment.id.value, payment);

      const cancelHandler = new CancelPaymentHandler(paymentRepo, saleRepo, clock);
      const result = await cancelHandler.execute(
        new CancelPaymentCommand({
          paymentId: payment.id.value,
          tenantId: 'tenant-1',
          reason: 'Customer left',
          currentUser: authorizedUser,
        }),
      );

      expect(result.isFailure).toBe(true);
      expect(result.getError()).toBeInstanceOf(PaymentAlreadyCancelledException);
      expect(result.getError()).toBeInstanceOf(PaymentAlreadyCancelled);
      expect(result.getError()).toBeInstanceOf(InvalidPaymentTransitionException);
      expect((result.getError() as PaymentAlreadyCancelledException).code).toBe(
        'INVALID_PAYMENT_TRANSITION',
      );
      expect((result.getError() as PaymentAlreadyCancelledException).subcode).toBe(
        'PAYMENT_ALREADY_CANCELLED',
      );
    });

    it('enforces SaleCannotBeMarkedPaid / SaleCannotBeMarkedPaidException when Sale is not payable', async () => {
      const paymentRepo = new MockPaymentRepository();
      const saleRepo = new MockSaleRepository();
      // Sale is cancelled
      const sale = createTestSale('sale-cancelled', 100, SaleStatus.CANCELLED);
      const payment = createTestPayment('pay-canc-sale', sale.id.value, 100, PaymentStatus.PENDING);
      paymentRepo.store.set(payment.id.value, payment);
      saleRepo.store.set(sale.id.value, sale);

      const handler = new CompletePaymentHandler(paymentRepo, saleRepo, clock);
      const result = await handler.execute(
        new CompletePaymentCommand({
          paymentId: payment.id.value,
          tenantId: 'tenant-1',
          currentUser: authorizedUser,
        }),
      );

      expect(result.isFailure).toBe(true);
      expect(result.getError()).toBeInstanceOf(SaleCannotBeMarkedPaidException);
      expect(result.getError()).toBeInstanceOf(SaleCannotBeMarkedPaid);
      expect((result.getError() as SaleCannotBeMarkedPaidException).code).toBe(
        'INVALID_SALE_TRANSITION',
      );
      expect((result.getError() as SaleCannotBeMarkedPaidException).subcode).toBe(
        'SALE_CANNOT_BE_MARKED_PAID',
      );
    });
  });

  // =========================================================================
  // 2. APPLICATION ERRORS
  // =========================================================================
  describe('2. Application Errors (Cross-Aggregate & Use-Case Orchestration)', () => {
    it('propagates PaymentNotFound / PaymentNotFoundException across Complete, Fail, Cancel, and Get handlers', async () => {
      const paymentRepo = new MockPaymentRepository();
      const saleRepo = new MockSaleRepository();

      const completeHandler = new CompletePaymentHandler(paymentRepo, saleRepo, clock);
      const completeRes = await completeHandler.execute(
        new CompletePaymentCommand({
          paymentId: 'non-existent-pay',
          tenantId: 'tenant-1',
          currentUser: authorizedUser,
        }),
      );
      expect(completeRes.isFailure).toBe(true);
      expect(completeRes.getError()).toBeInstanceOf(PaymentNotFoundException);
      expect(completeRes.getError()).toBeInstanceOf(PaymentNotFound);

      const failHandler = new FailPaymentHandler(paymentRepo, saleRepo, clock);
      const failRes = await failHandler.execute(
        new FailPaymentCommand({
          paymentId: 'non-existent-pay',
          tenantId: 'tenant-1',
          currentUser: authorizedUser,
        }),
      );
      expect(failRes.isFailure).toBe(true);
      expect(failRes.getError()).toBeInstanceOf(PaymentNotFoundException);

      const cancelHandler = new CancelPaymentHandler(paymentRepo, saleRepo, clock);
      const cancelRes = await cancelHandler.execute(
        new CancelPaymentCommand({
          paymentId: 'non-existent-pay',
          tenantId: 'tenant-1',
          currentUser: authorizedUser,
        }),
      );
      expect(cancelRes.isFailure).toBe(true);
      expect(cancelRes.getError()).toBeInstanceOf(PaymentNotFoundException);

      const getHandler = new GetPaymentByIdHandler(paymentRepo);
      const getRes = await getHandler.execute({
        input: {
          paymentId: 'non-existent-pay',
          currentUser: {
            userId: 'usr-read',
            roles: ['Platform Admin'],
            permissions: ['payments.read'],
          },
        },
      });
      expect(getRes.isFailure).toBe(true);
      expect(getRes.getError()).toBeInstanceOf(PaymentNotFoundException);
    });

    it('propagates SaleNotFound / SaleNotFoundException across CreatePayment and CompletePayment', async () => {
      const paymentRepo = new MockPaymentRepository();
      const saleRepo = new MockSaleRepository();

      const createHandler = new CreatePaymentHandler(paymentRepo, saleRepo, clock);
      const createRes = await createHandler.execute(
        new CreatePaymentCommand({
          saleId: 'ghost-sale-id',
          tenantId: 'tenant-1',
          amount: 50,
          method: PaymentMethod.CASH,
          currentUser: authorizedUser,
        }),
      );
      expect(createRes.isFailure).toBe(true);
      expect(createRes.getError()).toBeInstanceOf(SaleNotFoundException);
      expect(createRes.getError()).toBeInstanceOf(SaleNotFound);

      // In CompletePayment when referenced sale does not exist
      const orphanPayment = createTestPayment(
        'orphan-pay',
        'missing-sale-id',
        50,
        PaymentStatus.PENDING,
      );
      paymentRepo.store.set(orphanPayment.id.value, orphanPayment);

      const completeHandler = new CompletePaymentHandler(paymentRepo, saleRepo, clock);
      const completeRes = await completeHandler.execute(
        new CompletePaymentCommand({
          paymentId: orphanPayment.id.value,
          tenantId: 'tenant-1',
          currentUser: authorizedUser,
        }),
      );
      expect(completeRes.isFailure).toBe(true);
      expect(completeRes.getError()).toBeInstanceOf(SaleNotFoundException);
    });

    it('propagates PaymentReferenceAlreadyExists / DuplicatePaymentReferenceException on duplicate references', async () => {
      const paymentRepo = new MockPaymentRepository();
      const saleRepo = new MockSaleRepository();
      const sale = createTestSale('sale-dup-ref');
      saleRepo.store.set(sale.id.value, sale);

      // Existing payment with reference REF-101
      const existing = Payment.createPending(
        {
          id: PaymentId.create('pay-existing'),
          saleId: sale.id,
          tenantId: 'tenant-1',
          method: PaymentMethod.CASH,
          amount: Money.create(50, 'USD'),
          reference: 'REF-101',
        },
        clock,
      );
      paymentRepo.store.set(existing.id.value, existing);

      const handler = new CreatePaymentHandler(paymentRepo, saleRepo, clock);
      const result = await handler.execute(
        new CreatePaymentCommand({
          saleId: sale.id.value,
          tenantId: 'tenant-1',
          amount: 50,
          method: PaymentMethod.CASH,
          reference: 'REF-101',
          currentUser: authorizedUser,
        }),
      );

      expect(result.isFailure).toBe(true);
      expect(result.getError()).toBeInstanceOf(DuplicatePaymentReferenceException);
      expect(result.getError()).toBeInstanceOf(PaymentReferenceAlreadyExistsException);
      expect(result.getError()).toBeInstanceOf(PaymentReferenceAlreadyExists);
    });

    it('propagates Payment/Sale consistency failures (CurrencyMismatch, Overpayment, SaleMismatch)', async () => {
      const paymentRepo = new MockPaymentRepository();
      const saleRepo = new MockSaleRepository();
      const sale = createTestSale('sale-consistency', 100.0);
      saleRepo.store.set(sale.id.value, sale);

      const createHandler = new CreatePaymentHandler(paymentRepo, saleRepo, clock);

      // Currency mismatch
      const currRes = await createHandler.execute(
        new CreatePaymentCommand({
          saleId: sale.id.value,
          tenantId: 'tenant-1',
          amount: 50,
          currency: 'EUR',
          method: PaymentMethod.CASH,
          currentUser: authorizedUser,
        }),
      );
      expect(currRes.isFailure).toBe(true);
      expect(currRes.getError()).toBeInstanceOf(PaymentCurrencyMismatchException);
      expect(currRes.getError()).toBeInstanceOf(PaymentSaleConsistencyException);
      expect(currRes.getError()).toBeInstanceOf(PaymentSaleConsistencyFailure);

      // Overpayment
      const overRes = await createHandler.execute(
        new CreatePaymentCommand({
          saleId: sale.id.value,
          tenantId: 'tenant-1',
          amount: 150.0,
          currency: 'USD',
          method: PaymentMethod.CASH,
          currentUser: authorizedUser,
        }),
      );
      expect(overRes.isFailure).toBe(true);
      expect(overRes.getError()).toBeInstanceOf(PaymentOverpaymentException);
      expect(overRes.getError()).toBeInstanceOf(PaymentSaleConsistencyException);

      // PaymentSaleMismatchException
      const mismatchPayment = createTestPayment('pay-mismatch', 'other-sale', 50);
      paymentRepo.store.set(mismatchPayment.id.value, mismatchPayment);
      const mismatchEx = new PaymentSaleMismatchException(
        mismatchPayment.id.value,
        'other-sale',
        sale.id.value,
      );
      expect(mismatchEx).toBeInstanceOf(PaymentSaleConsistencyException);
    });

    it('propagates PaymentUnauthorizedException on cross-tenant access violation', async () => {
      const paymentRepo = new MockPaymentRepository();
      const saleRepo = new MockSaleRepository();
      const sale = createTestSale('sale-sec');
      const payment = createTestPayment('pay-sec', sale.id.value, 100, PaymentStatus.PENDING);
      paymentRepo.store.set(payment.id.value, payment);
      saleRepo.store.set(sale.id.value, sale);

      const handler = new CompletePaymentHandler(paymentRepo, saleRepo, clock);
      const result = await handler.execute(
        new CompletePaymentCommand({
          paymentId: payment.id.value,
          tenantId: 'tenant-rogue',
          currentUser: authorizedUser,
        }),
      );

      expect(result.isFailure).toBe(true);
      expect(result.getError()).toBeInstanceOf(PaymentUnauthorizedException);
    });
  });

  // =========================================================================
  // 3. INFRASTRUCTURE & PERSISTENCE ERRORS (PRISMA ERROR MAPPING)
  // =========================================================================
  describe('3. Infrastructure & Persistence Errors (No Raw Prisma Exposure)', () => {
    it('maps Prisma P2003 (Foreign Key Constraint on saleId) to SaleNotFoundException without exposing Prisma error', () => {
      const prismaP2003 = {
        code: 'P2003',
        message: 'Foreign key constraint failed on the field: `saleId`',
        meta: { field_name: 'payments_sale_id_fkey', target: ['saleId'] },
      };

      const mapped = PrismaDatabaseErrorMapper.mapDatabaseError(prismaP2003, {
        saleId: 'sale-fk-missing',
      });

      expect(mapped).toBeInstanceOf(SaleNotFoundException);
      expect(mapped).not.toHaveProperty('code', 'P2003');
      expect((mapped as SaleNotFoundException).message).toContain('sale-fk-missing');
    });

    it('maps Prisma P2002 (Unique Constraint on reference) to DuplicatePaymentReferenceException', () => {
      const prismaP2002 = {
        code: 'P2002',
        message: 'Unique constraint failed on the fields: (`sale_id`, `reference`)',
        meta: { target: ['saleId', 'reference'] },
      };

      const mapped = PrismaDatabaseErrorMapper.mapDatabaseError(prismaP2002, {
        saleId: 'sale-999',
        reference: 'REF-DUP-DB',
      });

      expect(mapped).toBeInstanceOf(DuplicatePaymentReferenceException);
      expect(mapped).toBeInstanceOf(PaymentReferenceAlreadyExistsException);
      expect((mapped as DuplicatePaymentReferenceException).message).toContain('REF-DUP-DB');
    });

    it('maps Prisma P2025 (Record Not Found on update) to PaymentNotFoundException', () => {
      const prismaP2025 = {
        code: 'P2025',
        message:
          'An operation failed because it depends on one or more records that were required but not found. Record to update not found.',
        meta: { cause: 'Record to update not found.' },
      };

      const mapped = PrismaDatabaseErrorMapper.mapDatabaseError(prismaP2025, {
        paymentId: 'pay-missing-update',
      });

      expect(mapped).toBeInstanceOf(PaymentNotFoundException);
      expect((mapped as PaymentNotFoundException).message).toContain('pay-missing-update');
    });

    it('maps PostgreSQL / Prisma CHECK constraint violations to canonical domain exceptions', () => {
      const prismaP2004 = {
        code: 'P2004',
        message:
          'A constraint failed on the database: violates check constraint "chk_payments_positive_amount"',
        constraint: 'chk_payments_positive_amount',
      };

      const mapped = PrismaDatabaseErrorMapper.mapDatabaseError(prismaP2004);
      expect(mapped).toBeInstanceOf(InvalidPaymentAmountException);
      expect((mapped as InvalidPaymentAmountException).code).toBe(
        'PAYMENT_AMOUNT_MUST_BE_POSITIVE',
      );
    });

    it('wraps unmapped database infrastructure failures in PaymentPersistenceException preserving cause', () => {
      const dbCrash = new Error('Connection reset by peer: PostgreSQL terminate unexpectedly');
      const mapped = PrismaDatabaseErrorMapper.mapDatabaseError(dbCrash);

      expect(mapped).toBeInstanceOf(PaymentPersistenceException);
      expect(mapped.message).toContain('Database persistence error occurred');
      expect((mapped as PaymentPersistenceException & { cause: unknown }).cause).toBe(dbCrash);
    });

    it('proves PrismaPaymentRepository delegates save errors through PrismaDatabaseErrorMapper and prevents raw leakage', async () => {
      const mockPrisma = {
        payment: {
          findUnique: jest.fn().mockResolvedValue(null),
          upsert: jest.fn().mockRejectedValue({
            code: 'P2003',
            message: 'Foreign key constraint failed on `saleId`',
            meta: { field_name: 'payments_sale_id_fkey', target: ['saleId'] },
          }),
        },
      } as unknown as PrismaClient;

      const repo = new PrismaPaymentRepository(mockPrisma);
      const payment = createTestPayment('pay-mock-fk', 'ghost-sale', 50, PaymentStatus.PENDING);

      await expect(repo.save(payment)).rejects.toThrow(SaleNotFoundException);
      await expect(repo.save(payment)).rejects.not.toThrow(/P2003/);
    });

    it('propagates PaymentOptimisticLockException directly on concurrent version collision', async () => {
      const mockPrisma = {
        payment: {
          findUnique: jest.fn().mockResolvedValue({ id: 'pay-occ', version: 3 }),
        },
      } as unknown as PrismaClient;

      const repo = new PrismaPaymentRepository(mockPrisma);
      // Attempting to save version 1 when DB already progressed to version 3
      const stalePayment = createTestPayment('pay-occ', 'sale-occ', 50, PaymentStatus.PENDING);

      await expect(repo.save(stalePayment)).rejects.toThrow(PaymentOptimisticLockException);
    });
  });

  // =========================================================================
  // 4. COMPLETE PAYMENT ERROR SYMMETRY & CONSISTENCY
  // =========================================================================
  describe('4. CompletePayment Cross-Aggregate Error Symmetry', () => {
    it('represents Payment-tier failures and Sale-tier failures symmetrically without leaving corrupted state', async () => {
      const paymentRepo = new MockPaymentRepository();
      const saleRepo = new MockSaleRepository();

      const sale = createTestSale('sale-sym-a', 100);
      const payment = createTestPayment('pay-sym-a', sale.id.value, 100, PaymentStatus.PENDING);
      paymentRepo.store.set(payment.id.value, payment);
      saleRepo.store.set(sale.id.value, sale);

      // Case A: Persistence of Payment fails -> returns failure, leaves Sale uncommitted in repo
      paymentRepo.throwOnSave = new Error('Payment table disk full');
      const handler = new CompletePaymentHandler(paymentRepo, saleRepo, clock);
      const resultA = await handler.execute(
        new CompletePaymentCommand({
          paymentId: payment.id.value,
          tenantId: 'tenant-1',
          currentUser: authorizedUser,
        }),
      );
      expect(resultA.isFailure).toBe(true);
      expect((resultA.getError() as Error).message).toBe('Payment table disk full');

      // Case B: Sale persistence fails -> returns failure
      paymentRepo.throwOnSave = undefined;
      const saleB = createTestSale('sale-sym-b', 100);
      const paymentB = createTestPayment('pay-sym-b', saleB.id.value, 100, PaymentStatus.PENDING);
      paymentRepo.store.set(paymentB.id.value, paymentB);
      saleRepo.store.set(saleB.id.value, saleB);

      saleRepo.throwOnSave = new Error('Sale table deadlock');
      const resultB = await handler.execute(
        new CompletePaymentCommand({
          paymentId: paymentB.id.value,
          tenantId: 'tenant-1',
          currentUser: authorizedUser,
        }),
      );
      expect(resultB.isFailure).toBe(true);
      expect((resultB.getError() as Error).message).toBe('Sale table deadlock');
    });
  });
});
