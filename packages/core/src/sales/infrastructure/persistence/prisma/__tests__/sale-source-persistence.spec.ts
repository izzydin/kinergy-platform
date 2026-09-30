import { PrismaClient, Prisma, SaleStatus as PrismaSaleStatus } from '@prisma/client';
import { Sale } from '../../../../domain/sale.aggregate';
import { SaleId } from '../../../../domain/value-objects/sale-id.vo';
import { SaleItemId } from '../../../../domain/value-objects/sale-item-id.vo';
import { Money } from '../../../../domain/value-objects/money.vo';
import { SaleSource } from '../../../../domain/value-objects/sale-source.vo';
import { SaleSourceType } from '../../../../domain/enums/sale-source-type.enum';
import { SourceReference } from '../../../../domain/value-objects/source-reference.vo';
import { SourceType } from '../../../../domain/enums/source-type.enum';
import { PrismaSaleMapper } from '../mappers/prisma-sale.mapper';
import { PrismaSaleRepository } from '../repositories/prisma-sale.repository';
import { Clock } from '../../../../domain/shared/clock';

class TestClock implements Clock {
  constructor(private readonly currentTime: Date) {}
  public now(): Date {
    return new Date(this.currentTime.getTime());
  }
}

describe('SaleSource Persistence Architecture Integration (Prisma)', () => {
  const clock = new TestClock(new Date('2026-09-30T10:00:00.000Z'));

  type MockPrismaTx = {
    sale: {
      findUnique: jest.Mock;
      findFirst: jest.Mock;
      upsert: jest.Mock;
      updateMany: jest.Mock;
    };
    saleItem: {
      deleteMany: jest.Mock;
      upsert: jest.Mock;
    };
  };

  type MockPrismaClient = {
    $transaction: jest.Mock;
    sale: {
      findUnique: jest.Mock;
      findFirst: jest.Mock;
      upsert: jest.Mock;
      updateMany: jest.Mock;
    };
    saleItem: {
      deleteMany: jest.Mock;
      upsert: jest.Mock;
    };
  };

  function createMockPrisma(): { mockPrisma: MockPrismaClient; mockTx: MockPrismaTx } {
    const mockTx: MockPrismaTx = {
      sale: {
        findUnique: jest.fn().mockResolvedValue(null),
        findFirst: jest.fn().mockResolvedValue(null),
        upsert: jest.fn().mockResolvedValue({}),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      saleItem: {
        deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
        upsert: jest.fn().mockResolvedValue({}),
      },
    };

    const mockPrisma: MockPrismaClient = {
      $transaction: jest.fn(async (cb: (tx: MockPrismaTx) => Promise<unknown>) => cb(mockTx)),
      sale: {
        findUnique: jest.fn().mockResolvedValue(null),
        findFirst: jest.fn().mockResolvedValue(null),
        upsert: jest.fn().mockResolvedValue({}),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      saleItem: {
        deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
        upsert: jest.fn().mockResolvedValue({}),
      },
    };

    return { mockPrisma, mockTx };
  }

  // ==========================================================================
  // 1. Relational Representation & Conceptual Value Pair
  // ==========================================================================
  describe('1. Relational Representation & Conceptual Pair Serialization', () => {
    const canonicalTypes: { type: SaleSourceType; refId: string }[] = [
      { type: SaleSourceType.KINESIOLOGY_SESSION, refId: 'session_kin_999' },
      { type: SaleSourceType.GYM_MEMBERSHIP, refId: 'membership_gold_101' },
      { type: SaleSourceType.FOOD, refId: 'food_order_lunch_45' },
      { type: SaleSourceType.DRINK, refId: 'pos_terminal_drink_01' },
      { type: SaleSourceType.ROOM_RENTAL, refId: 'studio_booking_a1' },
    ];

    it.each(canonicalTypes)(
      'persists SaleSource($type, $refId) into generic scalar columns without specialized tables',
      ({ type, refId }) => {
        const source = SaleSource.create(type, refId);
        const sale = Sale.create(
          {
            id: SaleId.create(`sale-${type.toLowerCase()}-01`),
            tenantId: 'tenant-kinergy-01',
            clientId: 'client-member-01',
            currency: 'USD',
            source,
          },
          clock,
        );

        sale.addItem(
          {
            id: SaleItemId.create(`item-${type.toLowerCase()}-01`),
            source,
            description: `Item for ${type}`,
            quantity: 1,
            unitPrice: Money.create(100, 'USD'),
          },
          clock,
        );

        const { sale: persistedSale, items: persistedItems } = PrismaSaleMapper.toPersistence(sale);

        // Required non-null pair mapped to snake_case DB columns
        expect(persistedSale.sourceType).toBe(type);
        expect(persistedSale.sourceId).toBe(refId);
        expect(persistedSale.sourceCode).toBeNull();

        // Line item persistence
        expect(persistedItems).toHaveLength(1);
        const firstItem = persistedItems[0]!;
        expect(firstItem.sourceType).toBe(type);
        expect(firstItem.sourceId).toBe(refId);
        expect(firstItem.sourceCode).toBeNull();
      },
    );

    it('reconstitutes database row with canonical sourceType back to domain SaleSource value object', () => {
      const rawDbRow = {
        id: 'sale-source-reconstitute-01',
        tenantId: 'tenant-kinergy-01',
        clientId: 'client-001',
        status: PrismaSaleStatus.DRAFT,
        currency: 'USD',
        sourceType: 'KINESIOLOGY_SESSION',
        sourceId: 'sess-kin-550',
        sourceCode: null,
        subtotalAmount: new Prisma.Decimal('150.00'),
        discountTotalAmount: new Prisma.Decimal('0.00'),
        totalAmount: new Prisma.Decimal('150.00'),
        orderDiscountType: null,
        orderDiscountValue: null,
        orderDiscountReason: null,
        cancellationReason: null,
        cancelledAt: null,
        completedAt: null,
        refundedAt: null,
        version: 1,
        createdAt: new Date('2026-09-30T10:00:00Z'),
        updatedAt: new Date('2026-09-30T10:00:00Z'),
        items: [
          {
            id: 'item-001',
            saleId: 'sale-source-reconstitute-01',
            sourceType: 'KINESIOLOGY_SESSION',
            sourceId: 'sess-kin-550',
            sourceCode: null,
            description: 'Kinesiology 60m Treatment',
            skuOrCode: null,
            quantity: new Prisma.Decimal('1.000'),
            unitPriceAmount: new Prisma.Decimal('150.00'),
            unitPriceCurrency: 'USD',
            subtotalAmount: new Prisma.Decimal('150.00'),
            discountTotalAmount: new Prisma.Decimal('0.00'),
            totalAmount: new Prisma.Decimal('150.00'),
            discountType: null,
            discountValue: null,
            discountReason: null,
            createdAt: new Date('2026-09-30T10:00:00Z'),
            updatedAt: new Date('2026-09-30T10:00:00Z'),
          },
        ],
      };

      const domainSale = PrismaSaleMapper.toDomain(rawDbRow);

      expect(domainSale.source).toBeInstanceOf(SaleSource);
      const saleSource = domainSale.source as SaleSource;
      expect(saleSource.type).toBe(SaleSourceType.KINESIOLOGY_SESSION);
      expect(saleSource.referenceId).toBe('sess-kin-550');
      expect(saleSource.sourceType).toBe(SaleSourceType.KINESIOLOGY_SESSION);
      expect(saleSource.sourceId).toBe('sess-kin-550');

      // Check item
      expect(domainSale.items[0]!.source).toBeInstanceOf(SaleSource);
      const itemSource = domainSale.items[0]!.source as SaleSource;
      expect(itemSource.type).toBe(SaleSourceType.KINESIOLOGY_SESSION);
      expect(itemSource.referenceId).toBe('sess-kin-550');
    });
  });

  // ==========================================================================
  // 2. Backward Compatibility with Legacy SourceReference
  // ==========================================================================
  describe('2. Backward Compatibility with Legacy SourceReference', () => {
    it('gracefully reconstitutes legacy SourceType (e.g. INVENTORY_ITEM) as SourceReference', () => {
      const rawDbRow = {
        id: 'sale-legacy-01',
        tenantId: 'tenant-1',
        clientId: 'client-1',
        status: PrismaSaleStatus.DRAFT,
        currency: 'USD',
        sourceType: 'INVENTORY_ITEM',
        sourceId: 'inv-item-old-01',
        sourceCode: 'LEGACY-SKU',
        subtotalAmount: new Prisma.Decimal('25.00'),
        discountTotalAmount: new Prisma.Decimal('0.00'),
        totalAmount: new Prisma.Decimal('25.00'),
        orderDiscountType: null,
        orderDiscountValue: null,
        orderDiscountReason: null,
        cancellationReason: null,
        cancelledAt: null,
        completedAt: null,
        refundedAt: null,
        version: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
        items: [
          {
            id: 'item-leg-01',
            saleId: 'sale-legacy-01',
            sourceType: 'INVENTORY_ITEM',
            sourceId: 'inv-item-old-01',
            sourceCode: 'LEGACY-SKU',
            description: 'Legacy Item',
            skuOrCode: 'LEGACY-SKU',
            quantity: new Prisma.Decimal('1.000'),
            unitPriceAmount: new Prisma.Decimal('25.00'),
            unitPriceCurrency: 'USD',
            subtotalAmount: new Prisma.Decimal('25.00'),
            discountTotalAmount: new Prisma.Decimal('0.00'),
            totalAmount: new Prisma.Decimal('25.00'),
            discountType: null,
            discountValue: null,
            discountReason: null,
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        ],
      };

      const domainSale = PrismaSaleMapper.toDomain(rawDbRow);

      expect(domainSale.source).toBeInstanceOf(SourceReference);
      const sourceRef = domainSale.source as SourceReference;
      expect(sourceRef.sourceType).toBe(SourceType.INVENTORY_ITEM);
      expect(sourceRef.sourceId).toBe('inv-item-old-01');
      expect(sourceRef.sourceCode).toBe('LEGACY-SKU');
    });
  });

  // ==========================================================================
  // 3. Repository Query Patterns (findBySourceReference)
  // ==========================================================================
  describe('3. Repository Query Patterns with Compound Source Indexes', () => {
    it('executes indexed compound lookup by tenantId, sourceType, and sourceId', async () => {
      const { mockPrisma } = createMockPrisma();
      const rawDbRow = {
        id: 'sale-lookup-01',
        tenantId: 'tenant-100',
        clientId: 'client-200',
        status: PrismaSaleStatus.PAID,
        currency: 'USD',
        sourceType: 'FOOD',
        sourceId: 'food-ticket-456',
        sourceCode: null,
        subtotalAmount: new Prisma.Decimal('12.50'),
        discountTotalAmount: new Prisma.Decimal('0.00'),
        totalAmount: new Prisma.Decimal('12.50'),
        orderDiscountType: null,
        orderDiscountValue: null,
        orderDiscountReason: null,
        cancellationReason: null,
        cancelledAt: null,
        completedAt: null,
        refundedAt: null,
        version: 2,
        createdAt: new Date(),
        updatedAt: new Date(),
        items: [
          {
            id: 'item-food-01',
            saleId: 'sale-lookup-01',
            sourceType: 'FOOD',
            sourceId: 'food-ticket-456',
            sourceCode: null,
            description: 'Lunch Bowl',
            skuOrCode: null,
            quantity: new Prisma.Decimal('1.000'),
            unitPriceAmount: new Prisma.Decimal('12.50'),
            unitPriceCurrency: 'USD',
            subtotalAmount: new Prisma.Decimal('12.50'),
            discountTotalAmount: new Prisma.Decimal('0.00'),
            totalAmount: new Prisma.Decimal('12.50'),
            discountType: null,
            discountValue: null,
            discountReason: null,
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        ],
      };

      mockPrisma.sale.findFirst.mockResolvedValue(rawDbRow);
      const repo = new PrismaSaleRepository(mockPrisma as unknown as PrismaClient);

      const result = await repo.findBySourceReference('FOOD', 'food-ticket-456', 'tenant-100');

      expect(result).not.toBeNull();
      expect(result?.source).toBeInstanceOf(SaleSource);
      expect(result?.source.sourceType).toBe('FOOD');
      expect(result?.source.sourceId).toBe('food-ticket-456');

      expect(mockPrisma.sale.findFirst).toHaveBeenCalledWith({
        where: {
          sourceType: 'FOOD',
          sourceId: 'food-ticket-456',
          tenantId: 'tenant-100',
          status: { not: 'CANCELLED' },
        },
        include: {
          items: true,
        },
        orderBy: { createdAt: 'desc' },
      });
    });

    it('returns null when no active sale matches the source reference', async () => {
      const { mockPrisma } = createMockPrisma();
      mockPrisma.sale.findFirst.mockResolvedValue(null);
      const repo = new PrismaSaleRepository(mockPrisma as unknown as PrismaClient);

      const result = await repo.findBySourceReference('DRINK', 'non-existent-drink', 'tenant-100');

      expect(result).toBeNull();
    });
  });
});
