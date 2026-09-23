import { Prisma, PrismaClient } from '@prisma/client';
import { Payment } from '../../../../domain/payment.aggregate';
import { SaleId } from '../../../../domain/value-objects/sale-id.vo';
import { Money } from '../../../../domain/value-objects/money.vo';
import { PaymentMethod } from '../../../../domain/enums/payment-method.enum';
import { PaymentStatus } from '../../../../domain/enums/payment-status.enum';
import { SaleOptimisticLockException } from '../../../../domain/exceptions/optimistic-lock.exception';
import { PaymentDomainException } from '../../../../domain/exceptions/payment-domain.exception';
import { PrismaPaymentMapper } from '../mappers/prisma-payment.mapper';
import { PrismaPaymentRepository } from '../repositories/prisma-payment.repository';
import { DeterministicClock } from '../../../../domain/shared/clock';

type MockPrismaClient = {
  $transaction: jest.Mock;
  payment: {
    upsert: jest.Mock;
    findUnique: jest.Mock;
    findMany: jest.Mock;
    updateMany: jest.Mock;
  };
};

describe('Payment Persistence & PostgreSQL Exact Decimal Representation (ADR-0115 / Phase 7.5)', () => {
  const t0 = new Date('2026-09-21T10:00:00.000Z');
  let clock: DeterministicClock;

  beforeEach(() => {
    clock = new DeterministicClock(t0);
  });

  const tenantId = 'tenant_kinergy_wellness';
  const saleId = SaleId.create('11111111-1111-4111-a111-111111111111');

  // ==========================================================================
  // 1. PrismaPaymentMapper Value Conversion & Round-Trip Fidelity
  // ==========================================================================
  describe('1. PrismaPaymentMapper Value Conversion & Round-Trip Fidelity', () => {
    it('accurately maps exact cent boundary monetary value ($0.01) bidirectionally', () => {
      const centAmount = Money.create(0.01, 'USD');
      const payment = Payment.createSettled(
        {
          id: 'pay_cent_001',
          tenantId,
          saleId,
          method: PaymentMethod.CASH,
          amount: centAmount,
          reference: 'CENT-RECEIPT',
        },
        clock,
      );

      const persistenceModel = PrismaPaymentMapper.toPersistence(payment);

      expect(persistenceModel.amount).toBeInstanceOf(Prisma.Decimal);
      expect(persistenceModel.amount.toFixed(2)).toBe('0.01');
      expect(persistenceModel.currency).toBe('USD');
      expect(persistenceModel.method).toBe('CASH');
      expect(persistenceModel.status).toBe('SETTLED');
      expect(persistenceModel.reference).toBe('CENT-RECEIPT');
      expect(persistenceModel.paidAt).toEqual(t0);

      // Round-trip back to domain
      const rawRecord = {
        ...persistenceModel,
        createdAt: payment.createdAt,
        updatedAt: payment.updatedAt,
      };

      const reconstituted = PrismaPaymentMapper.toDomain(rawRecord);

      expect(reconstituted.id.value).toBe('pay_cent_001');
      expect(reconstituted.saleId.value).toBe(saleId.value);
      expect(reconstituted.tenantId).toBe(tenantId);
      expect(reconstituted.amount.cents).toBe(1);
      expect(reconstituted.amount.amount).toBe(0.01);
      expect(reconstituted.amount.currency).toBe('USD');
      expect(reconstituted.amount.equals(centAmount)).toBe(true);
      expect(reconstituted.status).toBe(PaymentStatus.COMPLETED);
      expect(reconstituted.reference?.value).toBe('CENT-RECEIPT');
      expect(reconstituted.paidAt).toEqual(t0);
      expect(reconstituted.createdAt).toEqual(t0);
      expect(reconstituted.updatedAt).toEqual(t0);
      expect(reconstituted.version).toBe(1);
    });

    it('accurately maps standard commercial amount ($49.99) without floating-point drift', () => {
      const standardAmount = Money.create(49.99, 'USD');
      const payment = Payment.createSettled(
        {
          id: 'pay_std_002',
          tenantId,
          saleId,
          method: PaymentMethod.QR,
          amount: standardAmount,
          reference: 'QR-TX-4999',
        },
        clock,
      );

      const persistence = PrismaPaymentMapper.toPersistence(payment);
      expect(persistence.amount.toFixed(2)).toBe('49.99');

      const reconstituted = PrismaPaymentMapper.toDomain({
        ...persistence,
        createdAt: payment.createdAt,
        updatedAt: payment.updatedAt,
      });

      expect(reconstituted.amount.cents).toBe(4999);
      expect(reconstituted.amount.amount).toBe(49.99);
      expect(reconstituted.amount.equals(standardAmount)).toBe(true);
    });

    it('accurately maps large financial amounts ($999,999.99) preserving exact scale', () => {
      const largeAmount = Money.create(999999.99, 'USD');
      const payment = Payment.createSettled(
        {
          id: 'pay_large_003',
          tenantId,
          saleId,
          method: PaymentMethod.CASH,
          amount: largeAmount,
        },
        clock,
      );

      const persistence = PrismaPaymentMapper.toPersistence(payment);
      expect(persistence.amount.toFixed(2)).toBe('999999.99');

      const reconstituted = PrismaPaymentMapper.toDomain({
        ...persistence,
        createdAt: payment.createdAt,
        updatedAt: payment.updatedAt,
      });

      expect(reconstituted.amount.cents).toBe(99999999);
      expect(reconstituted.amount.amount).toBe(999999.99);
      expect(reconstituted.amount.equals(largeAmount)).toBe(true);
    });

    it('accurately maps a PENDING payment with null reference and null paidAt', () => {
      const pendingPayment = Payment.createPending(
        {
          id: 'pay_pending_004',
          tenantId,
          saleId,
          method: PaymentMethod.QR,
          amount: Money.create(75.5, 'USD'),
          reference: null,
        },
        clock,
      );

      const persistence = PrismaPaymentMapper.toPersistence(pendingPayment);
      expect(persistence.status).toBe('PENDING');
      expect(persistence.reference).toBeNull();
      expect(persistence.paidAt).toBeNull();
      expect(persistence.amount.toFixed(2)).toBe('75.50');

      const reconstituted = PrismaPaymentMapper.toDomain({
        ...persistence,
        createdAt: pendingPayment.createdAt,
        updatedAt: pendingPayment.updatedAt,
      });

      expect(reconstituted.isPending()).toBe(true);
      expect(reconstituted.reference).toBeNull();
      expect(reconstituted.paidAt).toBeNull();
      expect(reconstituted.amount.cents).toBe(7550);
      expect(reconstituted.version).toBe(1);
    });

    it('accurately maps a FAILED payment with preserved null paidAt', () => {
      const payment = Payment.createPending(
        {
          id: 'pay_failed_005',
          tenantId,
          saleId,
          method: PaymentMethod.QR,
          amount: Money.create(30.0, 'USD'),
        },
        clock,
      );

      clock.advanceSeconds(10);
      payment.fail('Network timeout', clock);

      const persistence = PrismaPaymentMapper.toPersistence(payment);
      expect(persistence.status).toBe('FAILED');
      expect(persistence.paidAt).toBeNull();
      expect(persistence.version).toBe(2);

      const reconstituted = PrismaPaymentMapper.toDomain({
        ...persistence,
        createdAt: payment.createdAt,
        updatedAt: payment.updatedAt,
      });

      expect(reconstituted.isFailed()).toBe(true);
      expect(reconstituted.paidAt).toBeNull();
      expect(reconstituted.version).toBe(2);
      expect(reconstituted.updatedAt).toEqual(new Date('2026-09-21T10:00:10.000Z'));
    });

    it('accurately maps a CANCELLED payment with preserved null paidAt', () => {
      const payment = Payment.createPending(
        {
          id: 'pay_cancelled_006',
          tenantId,
          saleId,
          method: PaymentMethod.QR,
          amount: Money.create(25.0, 'USD'),
        },
        clock,
      );

      clock.advanceSeconds(15);
      payment.cancel('Customer cancelled', clock);

      const persistence = PrismaPaymentMapper.toPersistence(payment);
      expect(persistence.status).toBe('CANCELLED');
      expect(persistence.paidAt).toBeNull();
      expect(persistence.version).toBe(2);

      const reconstituted = PrismaPaymentMapper.toDomain({
        ...persistence,
        createdAt: payment.createdAt,
        updatedAt: payment.updatedAt,
      });

      expect(reconstituted.isCancelled()).toBe(true);
      expect(reconstituted.paidAt).toBeNull();
      expect(reconstituted.version).toBe(2);
    });

    it('strictly fails reconstitution if SETTLED record has null paidAt', () => {
      const invalidRecord = {
        id: 'pay_corrupt_001',
        tenantId,
        saleId: saleId.value,
        method: 'CASH' as const,
        amount: new Prisma.Decimal('50.00'),
        currency: 'USD',
        status: 'SETTLED' as const,
        reference: null,
        paidAt: null, // Contradictory: SETTLED must have paidAt
        createdAt: t0,
        updatedAt: t0,
        version: 1,
      };

      expect(() => PrismaPaymentMapper.toDomain(invalidRecord)).toThrow(PaymentDomainException);
    });

    it('strictly fails reconstitution if PENDING record has non-null paidAt', () => {
      const invalidRecord = {
        id: 'pay_corrupt_002',
        tenantId,
        saleId: saleId.value,
        method: 'QR' as const,
        amount: new Prisma.Decimal('50.00'),
        currency: 'USD',
        status: 'PENDING' as const,
        reference: null,
        paidAt: t0, // Contradictory: PENDING must have paidAt = null
        createdAt: t0,
        updatedAt: t0,
        version: 1,
      };

      expect(() => PrismaPaymentMapper.toDomain(invalidRecord)).toThrow(PaymentDomainException);
    });

    it('strictly fails reconstitution if timestamps are inverted (updatedAt < createdAt)', () => {
      const invalidRecord = {
        id: 'pay_corrupt_003',
        tenantId,
        saleId: saleId.value,
        method: 'CASH' as const,
        amount: new Prisma.Decimal('50.00'),
        currency: 'USD',
        status: 'SETTLED' as const,
        reference: null,
        paidAt: t0,
        createdAt: t0,
        updatedAt: new Date('2026-09-21T09:00:00.000Z'), // Earlier than createdAt
        version: 1,
      };

      expect(() => PrismaPaymentMapper.toDomain(invalidRecord)).toThrow(PaymentDomainException);
    });
  });

  // ==========================================================================
  // 2. PrismaPaymentRepository Operations & Optimistic Concurrency Control (OCC)
  // ==========================================================================
  describe('2. PrismaPaymentRepository Operations & OCC', () => {
    it('saves a newly created Payment (version 1) via transactional upsert', async () => {
      const mockPrisma: MockPrismaClient = {
        $transaction: jest.fn(async (cb: (tx: unknown) => Promise<unknown>) => cb(mockPrisma)),
        payment: {
          upsert: jest.fn().mockResolvedValue({}),
          findUnique: jest.fn(),
          findMany: jest.fn(),
          updateMany: jest.fn(),
        },
      };

      const repo = new PrismaPaymentRepository(mockPrisma as unknown as PrismaClient);

      const payment = Payment.createSettled(
        {
          id: 'pay_repo_001',
          tenantId,
          saleId,
          method: PaymentMethod.CASH,
          amount: Money.create(100.0, 'USD'),
          reference: 'DRAWER-A',
        },
        clock,
      );

      await repo.save(payment);

      expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
      expect(mockPrisma.payment.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'pay_repo_001' },
          create: expect.objectContaining({
            id: 'pay_repo_001',
            tenantId,
            saleId: saleId.value,
            method: 'CASH',
            amount: new Prisma.Decimal('100.00'),
            currency: 'USD',
            status: 'SETTLED',
            reference: 'DRAWER-A',
            paidAt: t0,
            version: 1,
          }),
        }),
      );
    });

    it('enforces optimistic concurrency control (OCC) when saving updated Payment', async () => {
      const mockPrisma: MockPrismaClient = {
        $transaction: jest.fn(async (cb: (tx: unknown) => Promise<unknown>) => cb(mockPrisma)),
        payment: {
          upsert: jest.fn(),
          findUnique: jest.fn(),
          findMany: jest.fn(),
          updateMany: jest.fn().mockResolvedValue({ count: 1 }), // Successful version match
        },
      };

      const repo = new PrismaPaymentRepository(mockPrisma as unknown as PrismaClient);

      const payment = Payment.createPending(
        {
          id: 'pay_repo_002',
          tenantId,
          saleId,
          method: PaymentMethod.QR,
          amount: Money.create(80.0, 'USD'),
        },
        clock,
      );

      clock.advanceSeconds(30);
      payment.settle(clock); // Transitions to version 2
      expect(payment.version).toBe(2);

      await repo.save(payment);

      expect(mockPrisma.payment.updateMany).toHaveBeenCalledWith({
        where: {
          id: 'pay_repo_002',
          version: 1, // priorVersion check
        },
        data: expect.objectContaining({
          id: 'pay_repo_002',
          status: 'SETTLED',
          version: 2,
          paidAt: new Date('2026-09-21T10:00:30.000Z'),
        }),
      });
    });

    it('throws SaleOptimisticLockException when concurrent update conflict occurs (count === 0)', async () => {
      const mockPrisma: MockPrismaClient = {
        $transaction: jest.fn(async (cb: (tx: unknown) => Promise<unknown>) => cb(mockPrisma)),
        payment: {
          upsert: jest.fn(),
          findUnique: jest.fn(),
          findMany: jest.fn(),
          updateMany: jest.fn().mockResolvedValue({ count: 0 }), // Conflict!
        },
      };

      const repo = new PrismaPaymentRepository(mockPrisma as unknown as PrismaClient);

      const payment = Payment.createPending(
        {
          id: 'pay_repo_003',
          tenantId,
          saleId,
          method: PaymentMethod.QR,
          amount: Money.create(60.0, 'USD'),
        },
        clock,
      );
      payment.settle(clock); // version 2

      await expect(repo.save(payment)).rejects.toThrow(SaleOptimisticLockException);
    });

    it('finds and reconstitutes a Payment aggregate by ID', async () => {
      const mockPrisma: MockPrismaClient = {
        $transaction: jest.fn(),
        payment: {
          upsert: jest.fn(),
          findUnique: jest.fn().mockResolvedValue({
            id: 'pay_find_001',
            tenantId,
            saleId: saleId.value,
            method: 'CASH',
            amount: new Prisma.Decimal('125.00'),
            currency: 'USD',
            status: 'SETTLED',
            reference: 'RECEIPT-999',
            paidAt: t0,
            createdAt: t0,
            updatedAt: t0,
            version: 1,
          }),
          findMany: jest.fn(),
          updateMany: jest.fn(),
        },
      };

      const repo = new PrismaPaymentRepository(mockPrisma as unknown as PrismaClient);
      const found = await repo.findById('pay_find_001');

      expect(found).toBeInstanceOf(Payment);
      expect(found?.id.value).toBe('pay_find_001');
      expect(found?.amount.cents).toBe(12500);
      expect(found?.amount.amount).toBe(125.0);
      expect(found?.amount.currency).toBe('USD');
      expect(found?.isSettled()).toBe(true);
      expect(found?.reference?.value).toBe('RECEIPT-999');
      expect(found?.paidAt).toEqual(t0);
    });

    it('returns null when finding a non-existent Payment ID', async () => {
      const mockPrisma: MockPrismaClient = {
        $transaction: jest.fn(),
        payment: {
          upsert: jest.fn(),
          findUnique: jest.fn().mockResolvedValue(null),
          findMany: jest.fn(),
          updateMany: jest.fn(),
        },
      };

      const repo = new PrismaPaymentRepository(mockPrisma as unknown as PrismaClient);
      const found = await repo.findById('non-existent-pay-id');

      expect(found).toBeNull();
    });

    it('finds and returns all payments associated with a saleId (1 Sale -> N Payments)', async () => {
      const mockPrisma: MockPrismaClient = {
        $transaction: jest.fn(),
        payment: {
          upsert: jest.fn(),
          findUnique: jest.fn(),
          findMany: jest.fn().mockResolvedValue([
            {
              id: 'pay_split_001',
              tenantId,
              saleId: saleId.value,
              method: 'CASH',
              amount: new Prisma.Decimal('50.00'),
              currency: 'USD',
              status: 'SETTLED',
              reference: 'DRAWER-1',
              paidAt: t0,
              createdAt: t0,
              updatedAt: t0,
              version: 1,
            },
            {
              id: 'pay_split_002',
              tenantId,
              saleId: saleId.value,
              method: 'QR',
              amount: new Prisma.Decimal('50.00'),
              currency: 'USD',
              status: 'SETTLED',
              reference: 'QR-CONFIRM-2',
              paidAt: new Date('2026-09-21T10:05:00.000Z'),
              createdAt: t0,
              updatedAt: new Date('2026-09-21T10:05:00.000Z'),
              version: 2,
            },
          ]),
          updateMany: jest.fn(),
        },
      };

      const repo = new PrismaPaymentRepository(mockPrisma as unknown as PrismaClient);
      const payments = await repo.findBySaleId(saleId);

      expect(payments).toHaveLength(2);
      expect(payments[0]?.id.value).toBe('pay_split_001');
      expect(payments[0]?.method).toBe(PaymentMethod.CASH);
      expect(payments[0]?.amount.cents).toBe(5000);

      expect(payments[1]?.id.value).toBe('pay_split_002');
      expect(payments[1]?.method).toBe(PaymentMethod.QR);
      expect(payments[1]?.amount.cents).toBe(5000);

      // Verify query constraints
      expect(mockPrisma.payment.findMany).toHaveBeenCalledWith({
        where: { saleId: saleId.value },
        orderBy: { createdAt: 'asc' },
      });
    });

    it('returns an empty array when no payments exist for a saleId', async () => {
      const mockPrisma: MockPrismaClient = {
        $transaction: jest.fn(),
        payment: {
          upsert: jest.fn(),
          findUnique: jest.fn(),
          findMany: jest.fn().mockResolvedValue([]),
          updateMany: jest.fn(),
        },
      };

      const repo = new PrismaPaymentRepository(mockPrisma as unknown as PrismaClient);
      const payments = await repo.findBySaleId('empty-sale-id');

      expect(payments).toEqual([]);
    });
  });

  // ==========================================================================
  // 3. Database Relational Invariants & Foreign Key Integrity
  // ==========================================================================
  describe('3. Database Relational Invariants & Foreign Key Integrity', () => {
    it('verifies that Prisma rejects Payment insert when SaleId violates foreign key constraint', async () => {
      const mockPrisma: MockPrismaClient = {
        $transaction: jest.fn(async (cb: (tx: unknown) => Promise<unknown>) => cb(mockPrisma)),
        payment: {
          upsert: jest.fn().mockRejectedValue(
            new Prisma.PrismaClientKnownRequestError(
              'Foreign key constraint failed on the field: `sale_id`',
              {
                code: 'P2003',
                clientVersion: '6.19.3',
                meta: { field_name: 'sale_id' },
              },
            ),
          ),
          findUnique: jest.fn(),
          findMany: jest.fn(),
          updateMany: jest.fn(),
        },
      };

      const repo = new PrismaPaymentRepository(mockPrisma as unknown as PrismaClient);

      const paymentWithInvalidSale = Payment.createSettled(
        {
          tenantId,
          saleId: SaleId.create('missing-sale-999'),
          method: PaymentMethod.CASH,
          amount: Money.create(50.0, 'USD'),
        },
        clock,
      );

      await expect(repo.save(paymentWithInvalidSale)).rejects.toThrow(
        Prisma.PrismaClientKnownRequestError,
      );
      await expect(repo.save(paymentWithInvalidSale)).rejects.toThrow(
        /Foreign key constraint failed/i,
      );
    });

    it('confirms the pure domain Payment aggregate does not hold Sale instance reference', () => {
      const payment = Payment.createSettled(
        {
          tenantId,
          saleId,
          method: PaymentMethod.CASH,
          amount: Money.create(50.0, 'USD'),
        },
        clock,
      );

      // Verifies pure identifier coupling
      expect(payment.saleId).toBeInstanceOf(SaleId);
      expect(payment.saleId.value).toBe(saleId.value);
      // @ts-expect-error - Proving Sale aggregate is not embedded
      expect(payment.sale).toBeUndefined();
    });
  });
});
