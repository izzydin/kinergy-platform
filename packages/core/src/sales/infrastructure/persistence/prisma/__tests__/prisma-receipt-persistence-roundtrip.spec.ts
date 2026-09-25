import { Prisma, PrismaClient, Receipt as PrismaReceiptModel } from '@prisma/client';
import { Receipt } from '../../../../domain/receipt.aggregate';
import { ReceiptId } from '../../../../domain/value-objects/receipt-id.vo';
import { ReceiptNumber } from '../../../../domain/value-objects/receipt-number.vo';
import { SaleId } from '../../../../domain/value-objects/sale-id.vo';
import { Money } from '../../../../domain/value-objects/money.vo';
import { ReceiptClientSnapshot } from '../../../../domain/value-objects/receipt-client-snapshot.vo';
import { ReceiptItemSnapshot } from '../../../../domain/value-objects/receipt-item-snapshot.vo';
import { ReceiptPaymentSnapshot } from '../../../../domain/value-objects/receipt-payment-snapshot.vo';
import { ReceiptStatus } from '../../../../domain/enums/receipt-status.enum';
import { PaymentMethod } from '../../../../domain/enums/payment-method.enum';
import { PaymentStatus } from '../../../../domain/enums/payment-status.enum';
import { ReceiptOptimisticLockException } from '../../../../domain/exceptions/optimistic-lock.exception';
import { DuplicateReceiptException } from '../../../../domain/exceptions/duplicate-receipt.exception';
import { ReceiptDomainException } from '../../../../domain/exceptions/receipt-domain.exception';
import { PrismaReceiptMapper } from '../mappers/prisma-receipt.mapper';
import { PrismaReceiptRepository } from '../repositories/prisma-receipt.repository';
import { DeterministicClock } from '../../../../domain/shared/clock';

type MockPrismaClient = {
  $transaction: jest.Mock;
  $queryRawUnsafe: jest.Mock;
  receipt: {
    create: jest.Mock;
    findUnique: jest.Mock;
    findFirst: jest.Mock;
    updateMany: jest.Mock;
  };
};

describe('Receipt Persistence & Round-Trip Architecture (ADR-0117 / ADR-0118 / Phase 7.7)', () => {
  const t0 = new Date('2026-09-24T12:00:00.000Z');
  let clock: DeterministicClock;

  beforeEach(() => {
    clock = new DeterministicClock(t0);
  });

  const tenantId = 'tenant_kinergy_wellness';
  const saleId = SaleId.create('33333333-3333-4333-a333-333333333333');
  const receiptId = ReceiptId.create('rcpt_12345678-1234-4234-a234-123456789012');
  const receiptNumber = ReceiptNumber.create('REC-2026-000042');
  const saleReference = 'ORD-2026-0924-001';

  const clientSnapshot = ReceiptClientSnapshot.create({
    clientId: 'cli_999',
    referenceNumber: 'CLI-2026-00042',
    fullName: 'Jane Doe',
    email: 'jane.doe@example.com',
    phone: '+15551234567',
  });

  const item1 = ReceiptItemSnapshot.create({
    itemId: 'item_001',
    sourceType: 'TreatmentSession',
    sourceId: 'treat_77',
    description: 'Deep Tissue Kinesiology Therapy (60 min)',
    skuOrCode: 'TREAT-60',
    quantity: 1,
    unitPrice: Money.create(120.0, 'USD'),
    subtotal: Money.create(120.0, 'USD'),
    total: Money.create(120.0, 'USD'),
  });

  const item2 = ReceiptItemSnapshot.create({
    itemId: 'item_002',
    sourceType: 'ConsumableInventory',
    sourceId: 'inv_mag_01',
    description: 'Recovery Magnesium Spray (250ml)',
    skuOrCode: 'INV-MAG-250',
    quantity: 2,
    unitPrice: Money.create(25.0, 'USD'),
    subtotal: Money.create(50.0, 'USD'),
    total: Money.create(50.0, 'USD'),
  });

  const payment1 = ReceiptPaymentSnapshot.create({
    paymentId: 'pay_001',
    method: PaymentMethod.CASH,
    status: PaymentStatus.COMPLETED,
    amount: Money.create(70.0, 'USD'),
    reference: 'DRAWER-REGISTER-1',
    paidAt: t0,
  });

  const payment2 = ReceiptPaymentSnapshot.create({
    paymentId: 'pay_002',
    method: PaymentMethod.QR,
    status: PaymentStatus.COMPLETED,
    amount: Money.create(100.0, 'USD'),
    reference: 'QR-TX-998877',
    paidAt: t0,
  });

  const createSampleReceipt = (props?: Partial<Parameters<typeof Receipt.create>[0]>): Receipt => {
    return Receipt.create(
      {
        id: receiptId,
        tenantId,
        saleId,
        receiptNumber,
        saleReference,
        issuedAt: t0,
        clientSnapshot,
        items: [item1, item2],
        subtotal: Money.create(170.0, 'USD'),
        discountTotal: Money.create(0.0, 'USD'),
        total: Money.create(170.0, 'USD'),
        payments: [payment1, payment2],
        ...props,
      },
      clock,
    );
  };

  // ==========================================================================
  // 1. PrismaReceiptMapper: Value Conversion & Complete Round-Trip Fidelity
  // ==========================================================================
  describe('1. PrismaReceiptMapper Value Conversion & Round-Trip Fidelity', () => {
    it('accurately maps exact PostgreSQL DECIMAL(12, 2) amounts without floating-point drift', () => {
      const receipt = createSampleReceipt();
      const persistenceData = PrismaReceiptMapper.toPersistence(receipt);

      expect(persistenceData.id).toBe(receiptId.value);
      expect(persistenceData.tenantId).toBe(tenantId);
      expect(persistenceData.saleId).toBe(saleId.value);
      expect(persistenceData.receiptNumber).toBe('REC-2026-000042');
      expect(persistenceData.saleReference).toBe('ORD-2026-0924-001');

      // Exact Decimal verification
      expect(persistenceData.subtotalAmount).toBeInstanceOf(Prisma.Decimal);
      expect(persistenceData.subtotalAmount.toFixed(2)).toBe('170.00');

      expect(persistenceData.discountTotalAmount).toBeInstanceOf(Prisma.Decimal);
      expect(persistenceData.discountTotalAmount.toFixed(2)).toBe('0.00');

      expect(persistenceData.totalAmount).toBeInstanceOf(Prisma.Decimal);
      expect(persistenceData.totalAmount.toFixed(2)).toBe('170.00');
      expect(persistenceData.currency).toBe('USD');

      expect(persistenceData.status).toBe('ISSUED');
      expect(persistenceData.reprintCount).toBe(0);
      expect(persistenceData.lastReprintedAt).toBeNull();
      expect(persistenceData.version).toBe(1);
    });

    it('faithfully preserves client snapshot, item snapshots, and payment tenders across round-trip', () => {
      const receipt = createSampleReceipt();
      const persistenceData = PrismaReceiptMapper.toPersistence(receipt);

      // Simulate database record
      const rawRecord = {
        ...persistenceData,
        clientSnapshot: persistenceData.clientSnapshot as object,
        itemsSnapshot: persistenceData.itemsSnapshot as object[],
        paymentsSnapshot: persistenceData.paymentsSnapshot as object[],
        createdAt: receipt.createdAt,
        updatedAt: receipt.updatedAt,
      };

      const reconstituted = PrismaReceiptMapper.toDomain(
        rawRecord as unknown as PrismaReceiptModel,
      );

      // Identity & Reference fidelity
      expect(reconstituted.id.value).toBe(receiptId.value);
      expect(reconstituted.saleId.value).toBe(saleId.value);
      expect(reconstituted.receiptNumber.value).toBe('REC-2026-000042');
      expect(reconstituted.saleReference).toBe('ORD-2026-0924-001');
      expect(reconstituted.tenantId).toBe(tenantId);

      // Monetary fidelity
      expect(reconstituted.subtotal.cents).toBe(17000);
      expect(reconstituted.subtotal.amount).toBe(170.0);
      expect(reconstituted.total.cents).toBe(17000);
      expect(reconstituted.total.amount).toBe(170.0);
      expect(reconstituted.discountTotal.cents).toBe(0);

      // Client Snapshot fidelity
      expect(reconstituted.clientSnapshot).not.toBeNull();
      expect(reconstituted.clientSnapshot?.clientId).toBe('cli_999');
      expect(reconstituted.clientSnapshot?.referenceNumber).toBe('CLI-2026-00042');
      expect(reconstituted.clientSnapshot?.fullName).toBe('Jane Doe');
      expect(reconstituted.clientSnapshot?.email).toBe('jane.doe@example.com');
      expect(reconstituted.clientSnapshot?.phone).toBe('+15551234567');

      // Item Snapshots fidelity
      expect(reconstituted.items.length).toBe(2);
      expect(reconstituted.items[0]?.itemId).toBe('item_001');
      expect(reconstituted.items[0]?.description).toBe('Deep Tissue Kinesiology Therapy (60 min)');
      expect(reconstituted.items[0]?.skuOrCode).toBe('TREAT-60');
      expect(reconstituted.items[0]?.quantity).toBe(1);
      expect(reconstituted.items[0]?.unitPrice.cents).toBe(12000);
      expect(reconstituted.items[0]?.total.cents).toBe(12000);

      expect(reconstituted.items[1]?.itemId).toBe('item_002');
      expect(reconstituted.items[1]?.quantity).toBe(2);
      expect(reconstituted.items[1]?.unitPrice.cents).toBe(2500);
      expect(reconstituted.items[1]?.total.cents).toBe(5000);

      // Payment Snapshots fidelity
      expect(reconstituted.payments.length).toBe(2);
      expect(reconstituted.payments[0]?.paymentId).toBe('pay_001');
      expect(reconstituted.payments[0]?.method).toBe(PaymentMethod.CASH);
      expect(reconstituted.payments[0]?.status).toBe(PaymentStatus.COMPLETED);
      expect(reconstituted.payments[0]?.amount.cents).toBe(7000);
      expect(reconstituted.payments[0]?.reference).toBe('DRAWER-REGISTER-1');

      expect(reconstituted.payments[1]?.paymentId).toBe('pay_002');
      expect(reconstituted.payments[1]?.method).toBe(PaymentMethod.QR);
      expect(reconstituted.payments[1]?.amount.cents).toBe(10000);
      expect(reconstituted.payments[1]?.reference).toBe('QR-TX-998877');

      // Lifecycle status & version
      expect(reconstituted.status).toBe(ReceiptStatus.ISSUED);
      expect(reconstituted.reprintCount).toBe(0);
      expect(reconstituted.lastReprintedAt).toBeNull();
      expect(reconstituted.version).toBe(1);
    });

    it('correctly handles anonymous cash sales with null clientSnapshot', () => {
      const receipt = createSampleReceipt({ clientSnapshot: null });
      const persistenceData = PrismaReceiptMapper.toPersistence(receipt);

      expect(persistenceData.clientSnapshot).toBe(Prisma.DbNull);

      const rawRecord = {
        ...persistenceData,
        clientSnapshot: null,
        itemsSnapshot: persistenceData.itemsSnapshot as object[],
        paymentsSnapshot: persistenceData.paymentsSnapshot as object[],
        createdAt: receipt.createdAt,
        updatedAt: receipt.updatedAt,
      };

      const reconstituted = PrismaReceiptMapper.toDomain(
        rawRecord as unknown as PrismaReceiptModel,
      );
      expect(reconstituted.clientSnapshot).toBeNull();
    });

    it('throws when persisted itemsSnapshot or paymentsSnapshot is corrupted', () => {
      const receipt = createSampleReceipt();
      const persistenceData = PrismaReceiptMapper.toPersistence(receipt);

      const corruptedItems = {
        ...persistenceData,
        itemsSnapshot: 'corrupted-string' as unknown as object,
        createdAt: receipt.createdAt,
        updatedAt: receipt.updatedAt,
      };

      expect(() =>
        PrismaReceiptMapper.toDomain(corruptedItems as unknown as PrismaReceiptModel),
      ).toThrow(ReceiptDomainException);

      const corruptedPayments = {
        ...persistenceData,
        itemsSnapshot: persistenceData.itemsSnapshot as object[],
        paymentsSnapshot: [] as object[], // empty payments is invalid
        createdAt: receipt.createdAt,
        updatedAt: receipt.updatedAt,
      };

      expect(() =>
        PrismaReceiptMapper.toDomain(corruptedPayments as unknown as PrismaReceiptModel),
      ).toThrow(ReceiptDomainException);
    });
  });

  // ==========================================================================
  // 2. PrismaReceiptRepository Operations, Idempotency & Immutability Enforcement
  // ==========================================================================
  describe('2. PrismaReceiptRepository Operations, Idempotency & Immutability', () => {
    it('persists a newly issued Receipt (version 1) within a database transaction', async () => {
      const mockPrisma: MockPrismaClient = {
        $transaction: jest.fn(async (cb: (tx: unknown) => Promise<unknown>) => cb(mockPrisma)),
        $queryRawUnsafe: jest.fn(),
        receipt: {
          create: jest.fn().mockResolvedValue({}),
          findUnique: jest.fn().mockResolvedValue(null), // No existing receipt
          findFirst: jest.fn(),
          updateMany: jest.fn(),
        },
      };

      const repo = new PrismaReceiptRepository(mockPrisma as unknown as PrismaClient);
      const receipt = createSampleReceipt();

      await repo.save(receipt);

      expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
      expect(mockPrisma.receipt.findUnique).toHaveBeenCalledWith({
        where: {
          unique_tenant_sale_receipt: {
            tenantId,
            saleId: saleId.value,
          },
        },
        select: { id: true, version: true },
      });

      expect(mockPrisma.receipt.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          id: receiptId.value,
          tenantId,
          saleId: saleId.value,
          receiptNumber: 'REC-2026-000042',
          saleReference: 'ORD-2026-0924-001',
          subtotalAmount: new Prisma.Decimal('170.00'),
          totalAmount: new Prisma.Decimal('170.00'),
          status: 'ISSUED',
          version: 1,
        }),
      });
    });

    it('rejects duplicate primary receipt issuance for the same sale within the same tenant', async () => {
      const mockPrisma: MockPrismaClient = {
        $transaction: jest.fn(async (cb: (tx: unknown) => Promise<unknown>) => cb(mockPrisma)),
        $queryRawUnsafe: jest.fn(),
        receipt: {
          create: jest.fn(),
          findUnique: jest.fn().mockResolvedValue({
            id: 'rcpt_existing_111',
            version: 1,
          }), // Existing receipt found!
          findFirst: jest.fn(),
          updateMany: jest.fn(),
        },
      };

      const repo = new PrismaReceiptRepository(mockPrisma as unknown as PrismaClient);
      const receipt = createSampleReceipt();

      await expect(repo.save(receipt)).rejects.toThrow(DuplicateReceiptException);
      expect(mockPrisma.receipt.create).not.toHaveBeenCalled();
    });

    it('translates database unique constraint violation P2002 on unique_tenant_sale_receipt into DuplicateReceiptException when concurrent race bypasses pre-check', async () => {
      // Simulate concurrent race: pre-check findUnique returns null because transaction B has not yet committed
      // But concurrent tx A committed just before tx B calls create(), raising P2002
      const p2002Error = new Prisma.PrismaClientKnownRequestError(
        'Unique constraint failed on the fields: (`tenant_id`, `sale_id`)',
        {
          code: 'P2002',
          clientVersion: '6.19.3',
        },
      );

      const mockPrisma: MockPrismaClient = {
        $transaction: jest.fn(async (cb: (tx: unknown) => Promise<unknown>) => cb(mockPrisma)),
        $queryRawUnsafe: jest.fn(),
        receipt: {
          create: jest.fn().mockRejectedValue(p2002Error),
          findUnique: jest.fn().mockResolvedValue(null), // Pre-check returned null during race!
          findFirst: jest.fn(),
          updateMany: jest.fn(),
        },
      };

      const repo = new PrismaReceiptRepository(mockPrisma as unknown as PrismaClient);
      const receipt = createSampleReceipt();

      await expect(repo.save(receipt)).rejects.toThrow(DuplicateReceiptException);
      expect(mockPrisma.receipt.create).toHaveBeenCalledTimes(1);
    });

    it('translates database unique constraint violation P2002 on unique_tenant_receipt_number into DuplicateReceiptException', async () => {
      const p2002Error = new Prisma.PrismaClientKnownRequestError(
        'Unique constraint failed on the fields: (`tenant_id`, `receipt_number`)',
        {
          code: 'P2002',
          clientVersion: '6.19.3',
        },
      );

      const mockPrisma: MockPrismaClient = {
        $transaction: jest.fn(async (cb: (tx: unknown) => Promise<unknown>) => cb(mockPrisma)),
        $queryRawUnsafe: jest.fn(),
        receipt: {
          create: jest.fn().mockRejectedValue(p2002Error),
          findUnique: jest.fn().mockResolvedValue(null),
          findFirst: jest.fn(),
          updateMany: jest.fn(),
        },
      };

      const repo = new PrismaReceiptRepository(mockPrisma as unknown as PrismaClient);
      const receipt = createSampleReceipt();

      await expect(repo.save(receipt)).rejects.toThrow(DuplicateReceiptException);
    });

    it('translates raw PostgreSQL 23505 unique violation error into DuplicateReceiptException', async () => {
      const pg23505Error = Object.assign(
        new Error('duplicate key value violates unique constraint "unique_tenant_sale_receipt"'),
        { code: '23505' },
      );

      const mockPrisma: MockPrismaClient = {
        $transaction: jest.fn(async (cb: (tx: unknown) => Promise<unknown>) => cb(mockPrisma)),
        $queryRawUnsafe: jest.fn(),
        receipt: {
          create: jest.fn().mockRejectedValue(pg23505Error),
          findUnique: jest.fn().mockResolvedValue(null),
          findFirst: jest.fn(),
          updateMany: jest.fn(),
        },
      };

      const repo = new PrismaReceiptRepository(mockPrisma as unknown as PrismaClient);
      const receipt = createSampleReceipt();

      await expect(repo.save(receipt)).rejects.toThrow(DuplicateReceiptException);
    });

    it('strictly preserves immutability on reprint: updates ONLY reprint metadata, never financial snapshots', async () => {
      const mockPrisma: MockPrismaClient = {
        $transaction: jest.fn(async (cb: (tx: unknown) => Promise<unknown>) => cb(mockPrisma)),
        $queryRawUnsafe: jest.fn(),
        receipt: {
          create: jest.fn(),
          findUnique: jest.fn(),
          findFirst: jest.fn(),
          updateMany: jest.fn().mockResolvedValue({ count: 1 }), // Successful version match
        },
      };

      const repo = new PrismaReceiptRepository(mockPrisma as unknown as PrismaClient);
      const receipt = createSampleReceipt();

      // Execute reprint mutation on domain aggregate
      clock.advance(3600 * 1000); // 1 hour later
      const reprintTime = clock.now();
      receipt.recordReprint(clock);

      expect(receipt.version).toBe(2);
      expect(receipt.status).toBe(ReceiptStatus.REPRINTED);
      expect(receipt.reprintCount).toBe(1);

      await repo.save(receipt);

      // Verify explicit write-once protection: updateMany data payload contains ONLY reprint metadata
      expect(mockPrisma.receipt.updateMany).toHaveBeenCalledWith({
        where: {
          id: receiptId.value,
          version: 1, // priorVersion check
        },
        data: {
          status: 'REPRINTED',
          reprintCount: 1,
          lastReprintedAt: reprintTime,
          version: 2,
          updatedAt: expect.any(Date),
        },
      });

      // Assert financial fields are NEVER included in update payload
      const updateDataCall = mockPrisma.receipt.updateMany.mock.calls[0][0].data;
      expect(updateDataCall).not.toHaveProperty('subtotalAmount');
      expect(updateDataCall).not.toHaveProperty('totalAmount');
      expect(updateDataCall).not.toHaveProperty('itemsSnapshot');
      expect(updateDataCall).not.toHaveProperty('paymentsSnapshot');
      expect(updateDataCall).not.toHaveProperty('clientSnapshot');
      expect(updateDataCall).not.toHaveProperty('receiptNumber');
      expect(updateDataCall).not.toHaveProperty('saleReference');
    });

    it('throws ReceiptOptimisticLockException when concurrent reprint collision occurs', async () => {
      const mockPrisma: MockPrismaClient = {
        $transaction: jest.fn(async (cb: (tx: unknown) => Promise<unknown>) => cb(mockPrisma)),
        $queryRawUnsafe: jest.fn(),
        receipt: {
          create: jest.fn(),
          findUnique: jest.fn(),
          findFirst: jest.fn(),
          updateMany: jest.fn().mockResolvedValue({ count: 0 }), // Conflict!
        },
      };

      const repo = new PrismaReceiptRepository(mockPrisma as unknown as PrismaClient);
      const receipt = createSampleReceipt();
      receipt.recordReprint(clock);

      await expect(repo.save(receipt)).rejects.toThrow(ReceiptOptimisticLockException);
    });
  });

  // ==========================================================================
  // 3. Retrieval Query Methods & Relation Integrity
  // ==========================================================================
  describe('3. Retrieval Query Methods & Relation Integrity', () => {
    it('finds and reconstitutes a Receipt aggregate by unique domain ID', async () => {
      const receipt = createSampleReceipt();
      const persistenceData = PrismaReceiptMapper.toPersistence(receipt);

      const mockPrisma: MockPrismaClient = {
        $transaction: jest.fn(),
        $queryRawUnsafe: jest.fn(),
        receipt: {
          create: jest.fn(),
          findUnique: jest.fn().mockResolvedValue({
            ...persistenceData,
            clientSnapshot: persistenceData.clientSnapshot,
            itemsSnapshot: persistenceData.itemsSnapshot,
            paymentsSnapshot: persistenceData.paymentsSnapshot,
            createdAt: t0,
            updatedAt: t0,
          }),
          findFirst: jest.fn(),
          updateMany: jest.fn(),
        },
      };

      const repo = new PrismaReceiptRepository(mockPrisma as unknown as PrismaClient);
      const found = await repo.findById(receiptId);

      expect(found).not.toBeNull();
      expect(found?.id.value).toBe(receiptId.value);
      expect(found?.receiptNumber.value).toBe('REC-2026-000042');
      expect(mockPrisma.receipt.findUnique).toHaveBeenCalledWith({
        where: { id: receiptId.value },
      });
    });

    it('returns null when Receipt is not found by ID', async () => {
      const mockPrisma: MockPrismaClient = {
        $transaction: jest.fn(),
        $queryRawUnsafe: jest.fn(),
        receipt: {
          create: jest.fn(),
          findUnique: jest.fn().mockResolvedValue(null),
          findFirst: jest.fn(),
          updateMany: jest.fn(),
        },
      };

      const repo = new PrismaReceiptRepository(mockPrisma as unknown as PrismaClient);
      const found = await repo.findById('non_existent_rcpt');

      expect(found).toBeNull();
    });

    it('finds primary Receipt by saleId reference', async () => {
      const receipt = createSampleReceipt();
      const persistenceData = PrismaReceiptMapper.toPersistence(receipt);

      const mockPrisma: MockPrismaClient = {
        $transaction: jest.fn(),
        $queryRawUnsafe: jest.fn(),
        receipt: {
          create: jest.fn(),
          findUnique: jest.fn(),
          findFirst: jest.fn().mockResolvedValue({
            ...persistenceData,
            clientSnapshot: persistenceData.clientSnapshot,
            itemsSnapshot: persistenceData.itemsSnapshot,
            paymentsSnapshot: persistenceData.paymentsSnapshot,
            createdAt: t0,
            updatedAt: t0,
          }),
          updateMany: jest.fn(),
        },
      };

      const repo = new PrismaReceiptRepository(mockPrisma as unknown as PrismaClient);
      const found = await repo.findBySaleId(saleId);

      expect(found).not.toBeNull();
      expect(found?.saleId.value).toBe(saleId.value);
      expect(mockPrisma.receipt.findFirst).toHaveBeenCalledWith({
        where: { saleId: saleId.value },
      });
    });

    it('finds Receipt by human-readable receiptNumber', async () => {
      const receipt = createSampleReceipt();
      const persistenceData = PrismaReceiptMapper.toPersistence(receipt);

      const mockPrisma: MockPrismaClient = {
        $transaction: jest.fn(),
        $queryRawUnsafe: jest.fn(),
        receipt: {
          create: jest.fn(),
          findUnique: jest.fn(),
          findFirst: jest.fn().mockResolvedValue({
            ...persistenceData,
            clientSnapshot: persistenceData.clientSnapshot,
            itemsSnapshot: persistenceData.itemsSnapshot,
            paymentsSnapshot: persistenceData.paymentsSnapshot,
            createdAt: t0,
            updatedAt: t0,
          }),
          updateMany: jest.fn(),
        },
      };

      const repo = new PrismaReceiptRepository(mockPrisma as unknown as PrismaClient);
      const found = await repo.findByReceiptNumber('REC-2026-000042');

      expect(found).not.toBeNull();
      expect(found?.receiptNumber.value).toBe('REC-2026-000042');
      expect(mockPrisma.receipt.findFirst).toHaveBeenCalledWith({
        where: { receiptNumber: 'REC-2026-000042' },
      });
    });
  });

  // ==========================================================================
  // 4. Atomic Sequence Generator Delegation
  // ==========================================================================
  describe('4. Atomic Sequence Generation via Repository Port', () => {
    it('delegates getNextReceiptNumber to PostgreSQL atomic sequence engine', async () => {
      const mockPrisma: MockPrismaClient = {
        $transaction: jest.fn(),
        $queryRawUnsafe: jest.fn().mockResolvedValue([{ current_value: 42 }]),
        receipt: {
          create: jest.fn(),
          findUnique: jest.fn(),
          findFirst: jest.fn(),
          updateMany: jest.fn(),
        },
      };

      const repo = new PrismaReceiptRepository(mockPrisma as unknown as PrismaClient);
      const seq = await repo.getNextReceiptNumber(tenantId, 2026);

      expect(seq.value).toBe('REC-2026-000042');
      expect(mockPrisma.$queryRawUnsafe).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO "receipt_sequences"'),
        tenantId,
        2026,
      );
    });
  });
});
