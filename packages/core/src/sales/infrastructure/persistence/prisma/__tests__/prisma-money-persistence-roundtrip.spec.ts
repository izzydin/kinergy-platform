import { Prisma, PrismaClient } from '@prisma/client';
import { Money } from '../../../../domain/value-objects/money.vo';
import { Sale } from '../../../../domain/sale.aggregate';
import { Discount } from '../../../../domain/value-objects/discount.vo';
import { SourceReference } from '../../../../domain/value-objects/source-reference.vo';
import { SourceType } from '../../../../domain/enums/source-type.enum';
import { SaleOptimisticLockException } from '../../../../domain/exceptions/optimistic-lock.exception';
import { InvalidSaleStateException } from '../../../../domain/exceptions/invalid-sale-state.exception';
import { PrismaMoneyMapper } from '../mappers/prisma-money.mapper';
import { PrismaSaleMapper } from '../mappers/prisma-sale.mapper';
import { PrismaSaleRepository } from '../repositories/prisma-sale.repository';
import { Clock } from '../../../../domain/shared/clock';

class DeterministicClock implements Clock {
  constructor(private readonly currentTime: Date) {}
  public now(): Date {
    return new Date(this.currentTime.getTime());
  }
}

describe('Sale Monetary Values Persistence & Deterministic PostgreSQL Representation', () => {
  const clock = new DeterministicClock(new Date('2026-09-18T12:00:00.000Z'));

  const inventorySource = SourceReference.create({
    sourceType: SourceType.INVENTORY_ITEM,
    sourceId: 'inv-item-protein-01',
    sourceCode: 'WHEY-VAN-01',
  });

  const sessionSource = SourceReference.create({
    sourceType: SourceType.TREATMENT_SESSION,
    sourceId: 'session-rehab-02',
    sourceCode: 'KINESIO-60',
  });

  // ==========================================================================
  // 1. PrismaMoneyMapper Value Conversion Fidelity
  // ==========================================================================
  describe('1. PrismaMoneyMapper Value Conversion Fidelity', () => {
    it('accurately maps zero monetary value ($0.00) bidirectionally', () => {
      const zeroMoney = Money.zero('USD');
      const decimal = PrismaMoneyMapper.toDecimal(zeroMoney);

      expect(decimal).toBeInstanceOf(Prisma.Decimal);
      expect(decimal.toFixed(2)).toBe('0.00');
      expect(decimal.toString()).toBe('0');

      const reconstituted = PrismaMoneyMapper.toMoney(decimal, 'USD');
      expect(reconstituted).toBeInstanceOf(Money);
      expect(reconstituted.isZero()).toBe(true);
      expect(reconstituted.cents).toBe(0);
      expect(reconstituted.amount).toBe(0.0);
      expect(reconstituted.equals(zeroMoney)).toBe(true);
    });

    it('accurately maps normal monetary values ($49.99) bidirectionally', () => {
      const normalMoney = Money.create(49.99, 'USD');
      const decimal = PrismaMoneyMapper.toDecimal(normalMoney);

      expect(decimal).toBeInstanceOf(Prisma.Decimal);
      expect(decimal.toFixed(2)).toBe('49.99');

      const reconstituted = PrismaMoneyMapper.toMoney(decimal, 'USD');
      expect(reconstituted.cents).toBe(4999);
      expect(reconstituted.amount).toBe(49.99);
      expect(reconstituted.equals(normalMoney)).toBe(true);
    });

    it('accurately maps minimum and maximum supported precision ($0.01 cent boundary)', () => {
      const centMoney = Money.create(0.01, 'USD');
      const decimal = PrismaMoneyMapper.toDecimal(centMoney);

      expect(decimal.toFixed(2)).toBe('0.01');

      const reconstituted = PrismaMoneyMapper.toMoney(decimal, 'USD');
      expect(reconstituted.cents).toBe(1);
      expect(reconstituted.amount).toBe(0.01);
      expect(reconstituted.equals(centMoney)).toBe(true);
    });

    it('accurately preserves trailing zeroes ($10.00 and $10.50) without truncation', () => {
      // $10.00
      const moneyTen = Money.create('10.00', 'USD');
      const decimalTen = PrismaMoneyMapper.toDecimal(moneyTen);
      expect(decimalTen.toFixed(2)).toBe('10.00');

      const reconTen = PrismaMoneyMapper.toMoney(decimalTen, 'USD');
      expect(reconTen.cents).toBe(1000);
      expect(reconTen.amount).toBe(10.0);

      // $10.50
      const moneyFifty = Money.create('10.50', 'USD');
      const decimalFifty = PrismaMoneyMapper.toDecimal(moneyFifty);
      expect(decimalFifty.toFixed(2)).toBe('10.50');

      const reconFifty = PrismaMoneyMapper.toMoney(decimalFifty, 'USD');
      expect(reconFifty.cents).toBe(1050);
      expect(reconFifty.amount).toBe(10.5);
    });

    it('accurately maps large enterprise transactions ($9,999,999,999.99 column boundary)', () => {
      // Max boundary for DECIMAL(12, 2)
      const maxColMoney = Money.create('9999999999.99', 'USD');
      const decimal = PrismaMoneyMapper.toDecimal(maxColMoney);

      expect(decimal.toFixed(2)).toBe('9999999999.99');

      const reconstituted = PrismaMoneyMapper.toMoney(decimal, 'USD');
      expect(reconstituted.cents).toBe(999999999999);
      expect(reconstituted.amount).toBe(9999999999.99);
      expect(reconstituted.equals(maxColMoney)).toBe(true);
    });

    it('strictly preserves exactness without calling Number(), .toNumber(), or parseFloat() on Decimal', () => {
      const spyToNumber = jest.spyOn(Prisma.Decimal.prototype, 'toNumber');

      const testMoney = Money.create(125.75, 'USD');
      const decimal = PrismaMoneyMapper.toDecimal(testMoney);
      const recon = PrismaMoneyMapper.toMoney(decimal, 'USD');

      expect(recon.cents).toBe(12575);
      expect(recon.amount).toBe(125.75);

      // Verify that Decimal.prototype.toNumber was NEVER invoked during mapping
      expect(spyToNumber).not.toHaveBeenCalled();
      spyToNumber.mockRestore();
    });
  });

  // ==========================================================================
  // 2. Sale Aggregate Persistence Round-Trip (Domain → Persistence → Domain)
  // ==========================================================================
  describe('2. Sale Aggregate Persistence Round-Trip', () => {
    it('preserves subtotal, discountTotal, and total for a Sale with no discounts', () => {
      const sale = Sale.create({ source: inventorySource }, clock);
      sale.addItem(
        {
          source: inventorySource,
          description: 'Whey Protein Tub',
          quantity: 2,
          unitPrice: Money.create(35.5, 'USD'),
        },
        clock,
      );

      sale.addItem(
        {
          source: sessionSource,
          description: 'Therapy Session',
          quantity: 1,
          unitPrice: Money.create(90.0, 'USD'),
        },
        clock,
      );

      // Convert Domain -> Persistence
      const { sale: persistenceSale, items: persistenceItems } =
        PrismaSaleMapper.toPersistence(sale);

      expect(persistenceSale.subtotalAmount).toBeInstanceOf(Prisma.Decimal);
      expect(persistenceSale.subtotalAmount.toFixed(2)).toBe('161.00');
      expect(persistenceSale.discountTotalAmount).toBeInstanceOf(Prisma.Decimal);
      expect(persistenceSale.discountTotalAmount.toFixed(2)).toBe('0.00');
      expect(persistenceSale.totalAmount).toBeInstanceOf(Prisma.Decimal);
      expect(persistenceSale.totalAmount.toFixed(2)).toBe('161.00');

      // Convert Persistence -> Domain
      const rawWithRelations = {
        ...persistenceSale,
        createdAt: sale.createdAt,
        updatedAt: sale.updatedAt,
        items: persistenceItems.map((item) => ({
          ...item,
          createdAt: sale.createdAt,
          updatedAt: sale.updatedAt,
        })),
      };

      const reconstituted = PrismaSaleMapper.toDomain(rawWithRelations);

      // Strict equality across all monetary dimensions
      expect(reconstituted.subtotal.cents).toBe(sale.subtotal.cents);
      expect(reconstituted.discountTotal.cents).toBe(sale.discountTotal.cents);
      expect(reconstituted.total.cents).toBe(sale.total.cents);
      expect(reconstituted.subtotal.equals(sale.subtotal)).toBe(true);
      expect(reconstituted.discountTotal.equals(sale.discountTotal)).toBe(true);
      expect(reconstituted.total.equals(sale.total)).toBe(true);
      expect(reconstituted.items.length).toBe(2);
    });

    it('preserves complex compound discounts (percentage + fixed + order voucher)', () => {
      const sale = Sale.create({ source: inventorySource }, clock);

      // Line 1: 2 x $30.00 with $10 fixed discount -> subtotal 60.00, discount 10.00 -> net 50.00
      sale.addItem(
        {
          source: inventorySource,
          description: 'Yoga Mat',
          quantity: 2,
          unitPrice: Money.create(30.0, 'USD'),
          discount: Discount.fixed(10.0, '$10 Mat Discount'),
        },
        clock,
      );

      // Line 2: 1 x $100.00 with 20% discount ($20.00) -> subtotal 100.00, discount 20.00 -> net 80.00
      sale.addItem(
        {
          source: sessionSource,
          description: 'Kinesiology Consultation',
          quantity: 1,
          unitPrice: Money.create(100.0, 'USD'),
          discount: Discount.percentage(20, '20% Promo'),
        },
        clock,
      );

      // Order discount: 10% on remaining net pre-order subtotal ($130.00 * 0.10 = $13.00)
      sale.applyOrderDiscount(Discount.percentage(10, '10% Cart Voucher'), clock);

      // Expected Totals:
      // subtotal = 60.00 + 100.00 = 160.00
      // line discounts = 10.00 + 20.00 = 30.00
      // net pre-order = 130.00
      // order discount = 13.00
      // discountTotal = 30.00 + 13.00 = 43.00
      // total = 160.00 - 43.00 = 117.00
      expect(sale.subtotal.cents).toBe(16000);
      expect(sale.discountTotal.cents).toBe(4300);
      expect(sale.total.cents).toBe(11700);

      // Convert to Persistence
      const { sale: persistenceSale, items: persistenceItems } =
        PrismaSaleMapper.toPersistence(sale);

      expect(persistenceSale.subtotalAmount.toFixed(2)).toBe('160.00');
      expect(persistenceSale.discountTotalAmount.toFixed(2)).toBe('43.00');
      expect(persistenceSale.totalAmount.toFixed(2)).toBe('117.00');
      expect(persistenceSale.orderDiscountType).toBe('PERCENTAGE');
      expect(persistenceSale.orderDiscountValue?.toFixed(2)).toBe('10.00');

      // Round-trip back to domain
      const rawRecord = {
        ...persistenceSale,
        createdAt: sale.createdAt,
        updatedAt: sale.updatedAt,
        items: persistenceItems.map((item) => ({
          ...item,
          createdAt: sale.createdAt,
          updatedAt: sale.updatedAt,
        })),
      };

      const reconstituted = PrismaSaleMapper.toDomain(rawRecord);

      expect(reconstituted.subtotal.cents).toBe(16000);
      expect(reconstituted.discountTotal.cents).toBe(4300);
      expect(reconstituted.total.cents).toBe(11700);
      expect(reconstituted.subtotal.equals(sale.subtotal)).toBe(true);
      expect(reconstituted.discountTotal.equals(sale.discountTotal)).toBe(true);
      expect(reconstituted.total.equals(sale.total)).toBe(true);
      expect(reconstituted.orderDiscount?.value).toBe(10);
    });

    it('strictly fails reconstitution if persisted financial totals do not reconcile with line items', () => {
      const sale = Sale.create({ source: inventorySource }, clock);
      sale.addItem(
        {
          source: inventorySource,
          description: 'Item',
          quantity: 1,
          unitPrice: Money.create(50.0, 'USD'),
        },
        clock,
      );

      const { sale: persistenceSale, items: persistenceItems } =
        PrismaSaleMapper.toPersistence(sale);

      // Tamper with totalAmount in persistence record
      const corruptedRecord = {
        ...persistenceSale,
        totalAmount: new Prisma.Decimal('40.00'), // Subtotal is 50, discount is 0, so 40 is invalid!
        createdAt: sale.createdAt,
        updatedAt: sale.updatedAt,
        items: persistenceItems.map((item) => ({
          ...item,
          createdAt: sale.createdAt,
          updatedAt: sale.updatedAt,
        })),
      };

      expect(() => PrismaSaleMapper.toDomain(corruptedRecord)).toThrow(InvalidSaleStateException);
    });
  });

  // ==========================================================================
  // 3. PrismaSaleRepository Execution & Concurrency Invariants
  // ==========================================================================
  describe('3. PrismaSaleRepository Execution & Concurrency Invariants', () => {
    type MockPrismaClient = {
      $transaction: jest.Mock;
      sale: {
        upsert: jest.Mock;
        findUnique: jest.Mock;
        updateMany: jest.Mock;
      };
      saleItem: {
        upsert: jest.Mock;
        deleteMany: jest.Mock;
      };
    };

    it('saves a newly created Sale (version 1) via transactional upsert', async () => {
      const mockPrisma: MockPrismaClient = {
        $transaction: jest.fn(async (cb: (tx: unknown) => Promise<unknown>) => cb(mockPrisma)),
        sale: {
          upsert: jest.fn().mockResolvedValue({}),
          findUnique: jest.fn(),
          updateMany: jest.fn(),
        },
        saleItem: {
          upsert: jest.fn().mockResolvedValue({}),
          deleteMany: jest.fn().mockResolvedValue({}),
        },
      };

      const repo = new PrismaSaleRepository(mockPrisma as unknown as PrismaClient);

      const sale = Sale.create({ source: inventorySource }, clock);
      sale.addItem(
        {
          source: inventorySource,
          description: 'Water Bottle',
          quantity: 2,
          unitPrice: Money.create(15.0, 'USD'),
        },
        clock,
      );

      await repo.save(sale);

      expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
      expect(mockPrisma.sale.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: sale.id.value },
          create: expect.objectContaining({
            id: sale.id.value,
            subtotalAmount: new Prisma.Decimal('30.00'),
            discountTotalAmount: new Prisma.Decimal('0.00'),
            totalAmount: new Prisma.Decimal('30.00'),
            version: 1,
          }),
        }),
      );
    });

    it('enforces optimistic concurrency control (OCC) when saving updated Sale', async () => {
      const mockPrisma: MockPrismaClient = {
        $transaction: jest.fn(async (cb: (tx: unknown) => Promise<unknown>) => cb(mockPrisma)),
        sale: {
          upsert: jest.fn(),
          findUnique: jest.fn(),
          updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        },
        saleItem: {
          upsert: jest.fn().mockResolvedValue({}),
          deleteMany: jest.fn().mockResolvedValue({}),
        },
      };

      const repo = new PrismaSaleRepository(mockPrisma as unknown as PrismaClient);

      const sale = Sale.create({ source: inventorySource }, clock);
      sale.addItem(
        {
          source: inventorySource,
          description: 'Item',
          quantity: 1,
          unitPrice: Money.create(20.0, 'USD'),
        },
        clock,
      );

      // Finalize transitions to version 2
      sale.finalize(clock);
      expect(sale.version).toBe(2);

      await repo.save(sale);

      expect(mockPrisma.sale.updateMany).toHaveBeenCalledWith({
        where: {
          id: sale.id.value,
          version: 1, // prior version
        },
        data: expect.objectContaining({
          version: 2,
          totalAmount: new Prisma.Decimal('20.00'),
        }),
      });
    });

    it('throws OptimisticLockException when concurrent update is detected (count === 0)', async () => {
      const mockPrisma: MockPrismaClient = {
        $transaction: jest.fn(async (cb: (tx: unknown) => Promise<unknown>) => cb(mockPrisma)),
        sale: {
          upsert: jest.fn(),
          findUnique: jest.fn(),
          updateMany: jest.fn().mockResolvedValue({ count: 0 }), // Concurrent conflict!
        },
        saleItem: {
          upsert: jest.fn(),
          deleteMany: jest.fn(),
        },
      };

      const repo = new PrismaSaleRepository(mockPrisma as unknown as PrismaClient);

      const sale = Sale.create({ source: inventorySource }, clock);
      sale.addItem(
        {
          source: inventorySource,
          description: 'Item',
          quantity: 1,
          unitPrice: Money.create(20.0, 'USD'),
        },
        clock,
      );
      sale.finalize(clock); // version 2

      await expect(repo.save(sale)).rejects.toThrow(SaleOptimisticLockException);
    });

    it('finds and reconstitutes a Sale aggregate by ID with all line items and monetary values', async () => {
      const mockPrisma: MockPrismaClient = {
        $transaction: jest.fn(),
        sale: {
          upsert: jest.fn(),
          findUnique: jest.fn().mockResolvedValue({
            id: '33333333-3333-4333-a333-333333333333',
            tenantId: 'tenant_wellness_01',
            clientId: 'client_jane_doe',
            status: 'DRAFT',
            currency: 'USD',
            sourceType: 'INVENTORY_ITEM',
            sourceId: 'inv-item-01',
            sourceCode: 'WHEY-01',
            subtotalAmount: new Prisma.Decimal('50.00'),
            discountTotalAmount: new Prisma.Decimal('5.00'),
            totalAmount: new Prisma.Decimal('45.00'),
            orderDiscountType: null,
            orderDiscountValue: null,
            orderDiscountReason: null,
            cancellationReason: null,
            cancelledAt: null,
            completedAt: null,
            refundedAt: null,
            version: 1,
            createdAt: new Date('2026-09-18T10:00:00.000Z'),
            updatedAt: new Date('2026-09-18T10:05:00.000Z'),
            items: [
              {
                id: '44444444-4444-4444-a444-444444444444',
                saleId: '33333333-3333-4333-a333-333333333333',
                sourceType: 'INVENTORY_ITEM',
                sourceId: 'inv-item-01',
                sourceCode: 'WHEY-01',
                description: 'Whey Protein',
                skuOrCode: 'WHEY-01',
                quantity: new Prisma.Decimal('1.000'),
                unitPriceAmount: new Prisma.Decimal('50.00'),
                unitPriceCurrency: 'USD',
                subtotalAmount: new Prisma.Decimal('50.00'),
                discountTotalAmount: new Prisma.Decimal('5.00'),
                totalAmount: new Prisma.Decimal('45.00'),
                discountType: 'FIXED',
                discountValue: new Prisma.Decimal('5.00'),
                discountReason: 'Promo $5',
                createdAt: new Date('2026-09-18T10:00:00.000Z'),
                updatedAt: new Date('2026-09-18T10:05:00.000Z'),
              },
            ],
          }),
          updateMany: jest.fn(),
        },
        saleItem: {
          upsert: jest.fn(),
          deleteMany: jest.fn(),
        },
      };

      const repo = new PrismaSaleRepository(mockPrisma as unknown as PrismaClient);
      const found = await repo.findById('33333333-3333-4333-a333-333333333333');

      expect(found).toBeInstanceOf(Sale);
      expect(found?.id.value).toBe('33333333-3333-4333-a333-333333333333');
      expect(found?.subtotal.amount).toBe(50.0);
      expect(found?.subtotal.cents).toBe(5000);
      expect(found?.discountTotal.amount).toBe(5.0);
      expect(found?.discountTotal.cents).toBe(500);
      expect(found?.total.amount).toBe(45.0);
      expect(found?.total.cents).toBe(4500);
      expect(found?.items.length).toBe(1);
      expect(found?.items[0]?.discount?.value).toBe(5.0);
    });

    it('returns null when finding a non-existent Sale ID', async () => {
      const mockPrisma: MockPrismaClient = {
        $transaction: jest.fn(),
        sale: {
          upsert: jest.fn(),
          findUnique: jest.fn().mockResolvedValue(null),
          updateMany: jest.fn(),
        },
        saleItem: {
          upsert: jest.fn(),
          deleteMany: jest.fn(),
        },
      };

      const repo = new PrismaSaleRepository(mockPrisma as unknown as PrismaClient);
      const found = await repo.findById('non-existent-id');
      expect(found).toBeNull();
    });
  });
});
