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
import { SaleRepositoryPort } from '../../../../application/ports/sale-repository.port';
import { CreateSaleHandler } from '../../../../application/handlers/create-sale.handler';

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

  // ==========================================================================
  // 4. Persistence Lifecycle: Save, Retrieve & End-to-End Round-Trip
  // ==========================================================================
  describe('4. Persistence Lifecycle: Save, Retrieve & End-to-End Round-Trip', () => {
    it.each([
      SaleSourceType.KINESIOLOGY_SESSION,
      SaleSourceType.GYM_MEMBERSHIP,
      SaleSourceType.FOOD,
      SaleSourceType.DRINK,
      SaleSourceType.ROOM_RENTAL,
    ])('completes lossless domain -> persistence -> domain round-trip for %s', (type) => {
      const source = SaleSource.create(type, `roundtrip-${type.toLowerCase()}-789`);
      const originalSale = Sale.create(
        {
          id: SaleId.create(`sale-rt-${type.toLowerCase()}`),
          tenantId: 'tenant-rt-99',
          clientId: 'client-rt-88',
          currency: 'USD',
          source,
        },
        clock,
      );

      originalSale.addItem(
        {
          id: SaleItemId.create(`item-rt-${type.toLowerCase()}`),
          source,
          description: `Line item for ${type}`,
          quantity: 2,
          unitPrice: Money.create(50, 'USD'),
        },
        clock,
      );

      // 1. Domain -> Persistence mapping
      const { sale: persistedSale, items: persistedItems } =
        PrismaSaleMapper.toPersistence(originalSale);

      // 2. Mock DB representation returned from storage
      const rawDbRecord = {
        ...persistedSale,
        createdAt: originalSale.createdAt,
        updatedAt: originalSale.updatedAt,
        items: persistedItems.map((item) => ({
          ...item,
          createdAt: originalSale.createdAt,
          updatedAt: originalSale.updatedAt,
        })),
      };

      // 3. Persistence -> Domain reconstitution
      const reconstitutedSale = PrismaSaleMapper.toDomain(rawDbRecord);

      // Verify domain aggregate equality & source value object integrity
      expect(reconstitutedSale.id.equals(originalSale.id)).toBe(true);
      expect(reconstitutedSale.source).toBeInstanceOf(SaleSource);
      const reconstitutedSource = reconstitutedSale.source as SaleSource;
      expect(reconstitutedSource.type).toBe(type);
      expect(reconstitutedSource.referenceId).toBe(source.referenceId);
      expect(reconstitutedSource.equals(source)).toBe(true);

      // Verify items round-trip
      expect(reconstitutedSale.items).toHaveLength(1);
      const reconstitutedItemSource = reconstitutedSale.items[0]!.source as SaleSource;
      expect(reconstitutedItemSource).toBeInstanceOf(SaleSource);
      expect(reconstitutedItemSource.equals(source)).toBe(true);
      expect(reconstitutedSale.total.equals(originalSale.total)).toBe(true);
    });

    it('persists and retrieves Sale using PrismaSaleRepository.save and findById', async () => {
      const { mockPrisma, mockTx } = createMockPrisma();
      const repo = new PrismaSaleRepository(mockPrisma as unknown as PrismaClient);

      const source = SaleSource.create(SaleSourceType.FOOD, 'food-order-777');
      const sale = Sale.create(
        {
          id: SaleId.create('sale-save-repo-01'),
          tenantId: 'tenant-1',
          currency: 'USD',
          source,
        },
        clock,
      );

      // Execute save
      await repo.save(sale);

      expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
      expect(mockTx.sale.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'sale-save-repo-01' },
          create: expect.objectContaining({
            sourceType: 'FOOD',
            sourceId: 'food-order-777',
            sourceCode: null,
          }),
        }),
      );

      // Setup findById return
      const rawDbRow = {
        id: 'sale-save-repo-01',
        tenantId: 'tenant-1',
        clientId: null,
        status: PrismaSaleStatus.DRAFT,
        currency: 'USD',
        sourceType: 'FOOD',
        sourceId: 'food-order-777',
        sourceCode: null,
        subtotalAmount: new Prisma.Decimal('0.00'),
        discountTotalAmount: new Prisma.Decimal('0.00'),
        totalAmount: new Prisma.Decimal('0.00'),
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
        items: [],
      };
      mockPrisma.sale.findUnique.mockResolvedValue(rawDbRow);

      const retrieved = await repo.findById('sale-save-repo-01');
      expect(retrieved).not.toBeNull();
      expect(retrieved?.id.value).toBe('sale-save-repo-01');
      expect(retrieved?.source).toBeInstanceOf(SaleSource);
      expect((retrieved?.source as SaleSource).type).toBe(SaleSourceType.FOOD);
      expect((retrieved?.source as SaleSource).referenceId).toBe('food-order-777');
    });
  });

  // ==========================================================================
  // 5. Composite Uniqueness & Compound Index Alignment
  // ==========================================================================
  describe('5. Composite Uniqueness & Compound Index Alignment', () => {
    it('verifies queries align with compound index @@index([tenantId, sourceType, sourceId])', async () => {
      const { mockPrisma } = createMockPrisma();
      const repo = new PrismaSaleRepository(mockPrisma as unknown as PrismaClient);

      await repo.findBySourceReference(
        SaleSourceType.GYM_MEMBERSHIP,
        'membership-vip-001',
        'tenant-alpha',
      );

      expect(mockPrisma.sale.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            sourceType: SaleSourceType.GYM_MEMBERSHIP,
            sourceId: 'membership-vip-001',
            tenantId: 'tenant-alpha',
            status: { not: 'CANCELLED' },
          },
        }),
      );
    });

    it('verifies queries align with compound index @@index([sourceType, sourceId]) when tenantId is omitted', async () => {
      const { mockPrisma } = createMockPrisma();
      const repo = new PrismaSaleRepository(mockPrisma as unknown as PrismaClient);

      await repo.findBySourceReference(SaleSourceType.ROOM_RENTAL, 'room-studio-2');

      expect(mockPrisma.sale.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            sourceType: SaleSourceType.ROOM_RENTAL,
            sourceId: 'room-studio-2',
            status: { not: 'CANCELLED' },
          },
        }),
      );
    });
  });

  // ==========================================================================
  // 6. Concurrent Duplicate Source Prevention & Operational Single-Billing
  // ==========================================================================
  describe('6. Concurrent Duplicate Source Behavior & Single-Billing Invariant', () => {
    it('rejects concurrent duplicate sale creation for KINESIOLOGY_SESSION in save() transaction', async () => {
      const { mockPrisma, mockTx } = createMockPrisma();
      const repo = new PrismaSaleRepository(mockPrisma as unknown as PrismaClient);

      const source = SaleSource.create(
        SaleSourceType.KINESIOLOGY_SESSION,
        'session-kin-double-bill',
      );
      const sale = Sale.create(
        {
          id: SaleId.create('sale-new-session'),
          tenantId: 'tenant-clinic',
          currency: 'USD',
          source,
        },
        clock,
      );

      // Simulate concurrent transaction already inserted active sale for this session
      mockTx.sale.findFirst.mockResolvedValue({
        id: 'sale-existing-session',
      });

      await expect(repo.save(sale)).rejects.toThrow(
        /An active Sale \('sale-existing-session'\) already exists for KINESIOLOGY_SESSION 'session-kin-double-bill'/,
      );
    });

    it('allows concurrent non-clinical source types (e.g. FOOD, DRINK) to create multiple sales for same reference if desired', async () => {
      const { mockPrisma, mockTx } = createMockPrisma();
      const repo = new PrismaSaleRepository(mockPrisma as unknown as PrismaClient);

      const source = SaleSource.create(SaleSourceType.FOOD, 'food-item-retail-ref');
      const sale = Sale.create(
        {
          id: SaleId.create('sale-food-retail-01'),
          tenantId: 'tenant-cafe',
          currency: 'USD',
          source,
        },
        clock,
      );

      // Does not check or block duplicate retail sales
      await expect(repo.save(sale)).resolves.not.toThrow();
      expect(mockTx.sale.upsert).toHaveBeenCalled();
    });

    it('handles concurrent Request A and Request B for FOOD/order-123: allows multiple sales per retail source reference', async () => {
      const { mockPrisma } = createMockPrisma();
      const repo = new PrismaSaleRepository(mockPrisma as unknown as PrismaClient);

      // Request A and Request B arrive concurrently with the same source: FOOD / order-123
      const sourceA = SaleSource.create(SaleSourceType.FOOD, 'order-123');
      const saleA = Sale.create(
        {
          id: SaleId.create('sale-req-A'),
          tenantId: 'tenant-cafe',
          currency: 'USD',
          source: sourceA,
        },
        clock,
      );

      const sourceB = SaleSource.create(SaleSourceType.FOOD, 'order-123');
      const saleB = Sale.create(
        {
          id: SaleId.create('sale-req-B'),
          tenantId: 'tenant-cafe',
          currency: 'USD',
          source: sourceB,
        },
        clock,
      );

      // Both concurrent requests save successfully without blocking each other or throwing
      await expect(repo.save(saleA)).resolves.not.toThrow();
      await expect(repo.save(saleB)).resolves.not.toThrow();

      // Proves two distinct commercial agreements were recorded for the retail source
      expect(saleA.id.value).not.toBe(saleB.id.value);
      expect(saleA.source.equals(saleB.source)).toBe(true);
    });

    it('handles concurrent Request A and Request B with identical idempotencyKey: returns existing Sale without creating duplicate', async () => {
      // In-memory repo supporting idempotency simulation
      const inMemoryStore = new Map<string, Sale>();
      const mockRepo: SaleRepositoryPort = {
        findById: jest.fn(async (id: SaleId | string) => {
          const key = typeof id === 'string' ? id : id.value;
          return inMemoryStore.get(key) ?? null;
        }),
        save: jest.fn(async (sale: Sale) => {
          inMemoryStore.set(sale.id.value, sale);
        }),
      };

      const handler = new CreateSaleHandler(mockRepo, clock);

      // Request A arrives with idempotencyKey 'idem-food-order-123'
      const resultA = await handler.execute({
        input: {
          idempotencyKey: 'idem-food-order-123',
          tenantId: 'tenant-cafe',
          clientId: 'client-walkin',
          currency: 'USD',
          source: {
            sourceType: SaleSourceType.FOOD,
            sourceId: 'order-123',
          },
        },
      });

      expect(resultA.isSuccess).toBe(true);
      const saleIdA = resultA.getValue().id;

      // Concurrent/retry Request B arrives with identical idempotencyKey and identical parameters
      const resultB = await handler.execute({
        input: {
          idempotencyKey: 'idem-food-order-123',
          tenantId: 'tenant-cafe',
          clientId: 'client-walkin',
          currency: 'USD',
          source: {
            sourceType: SaleSourceType.FOOD,
            sourceId: 'order-123',
          },
        },
      });

      expect(resultB.isSuccess).toBe(true);
      const saleIdB = resultB.getValue().id;

      // Deterministically returns the same Sale without creating a duplicate
      expect(saleIdB).toBe(saleIdA);
      expect(mockRepo.save).toHaveBeenCalledTimes(1);
    });

    it('translates database unique constraint violation (P2002 / 23505) into DuplicateSaleException', async () => {
      const { mockPrisma, mockTx } = createMockPrisma();
      const repo = new PrismaSaleRepository(mockPrisma as unknown as PrismaClient);

      const source = SaleSource.create(SaleSourceType.FOOD, 'food-001');
      const sale = Sale.create(
        {
          id: SaleId.create('sale-duplicate-p2002'),
          tenantId: 'tenant-1',
          currency: 'USD',
          source,
        },
        clock,
      );

      const p2002Error = new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
        code: 'P2002',
        clientVersion: '6.3.1',
      });
      mockTx.sale.upsert.mockRejectedValue(p2002Error);

      await expect(repo.save(sale)).rejects.toThrow(
        /Unique constraint violation: A Sale with ID 'sale-duplicate-p2002' already exists/,
      );
    });
  });

  // ==========================================================================
  // 7. Null & Optional Semantics in Persistence
  // ==========================================================================
  describe('7. Null & Optional Semantics in Persistence', () => {
    it('strictly maps sourceCode to null when saving SaleSource (pure conceptual pair)', () => {
      const source = SaleSource.create(SaleSourceType.DRINK, 'drink-smoothie-01');
      const sale = Sale.create(
        {
          id: SaleId.create('sale-null-check-01'),
          currency: 'USD',
          source,
        },
        clock,
      );

      const { sale: persistedSale } = PrismaSaleMapper.toPersistence(sale);

      expect(persistedSale.sourceType).toBe('DRINK');
      expect(persistedSale.sourceId).toBe('drink-smoothie-01');
      expect(persistedSale.sourceCode).toBeNull();
      expect(persistedSale.tenantId).toBeNull();
      expect(persistedSale.clientId).toBeNull();
      expect(persistedSale.cancellationReason).toBeNull();
      expect(persistedSale.cancelledAt).toBeNull();
      expect(persistedSale.completedAt).toBeNull();
      expect(persistedSale.refundedAt).toBeNull();
    });

    it('correctly populates optional tenantId and clientId when provided alongside SaleSource', () => {
      const source = SaleSource.create(SaleSourceType.ROOM_RENTAL, 'studio-b');
      const sale = Sale.create(
        {
          id: SaleId.create('sale-with-tenancy'),
          tenantId: 'tenant-rehab-99',
          clientId: 'client-athlete-77',
          currency: 'USD',
          source,
        },
        clock,
      );

      const { sale: persistedSale } = PrismaSaleMapper.toPersistence(sale);

      expect(persistedSale.tenantId).toBe('tenant-rehab-99');
      expect(persistedSale.clientId).toBe('client-athlete-77');
    });

    it('reconstitutes optional fields as undefined when raw database record has null values', () => {
      const rawDbRow = {
        id: 'sale-null-props',
        tenantId: null,
        clientId: null,
        status: PrismaSaleStatus.DRAFT,
        currency: 'USD',
        sourceType: 'FOOD',
        sourceId: 'food-order-nulls',
        sourceCode: null,
        subtotalAmount: new Prisma.Decimal('0.00'),
        discountTotalAmount: new Prisma.Decimal('0.00'),
        totalAmount: new Prisma.Decimal('0.00'),
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
        items: [],
      };

      const domainSale = PrismaSaleMapper.toDomain(rawDbRow);

      expect(domainSale.tenantId).toBeUndefined();
      expect(domainSale.clientId).toBeUndefined();
      expect(domainSale.cancellationReason).toBeUndefined();
      expect(domainSale.cancelledAt).toBeUndefined();
      expect(domainSale.completedAt).toBeUndefined();
      expect(domainSale.refundedAt).toBeUndefined();
      expect(domainSale.source).toBeInstanceOf(SaleSource);
      expect((domainSale.source as SaleSource).sourceCode).toBeNull();
    });
  });
});
