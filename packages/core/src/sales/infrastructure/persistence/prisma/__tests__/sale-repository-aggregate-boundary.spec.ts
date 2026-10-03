import { PrismaClient, Prisma } from '@prisma/client';
import { Sale } from '../../../../domain/sale.aggregate';
import { SaleItem } from '../../../../domain/entities/sale-item.entity';
import { SaleId } from '../../../../domain/value-objects/sale-id.vo';
import { SaleItemId } from '../../../../domain/value-objects/sale-item-id.vo';
import { Money } from '../../../../domain/value-objects/money.vo';
import { SourceReference } from '../../../../domain/value-objects/source-reference.vo';
import { SourceType } from '../../../../domain/enums/source-type.enum';
import { SaleOptimisticLockException } from '../../../../domain/exceptions/optimistic-lock.exception';
import { InvalidSaleStateException } from '../../../../domain/exceptions/invalid-sale-state.exception';
import { PrismaSaleRepository } from '../repositories/prisma-sale.repository';
import { PrismaSaleItemMapper } from '../mappers/prisma-sale-item.mapper';
import { Clock } from '../../../../domain/shared/clock';

class TestClock implements Clock {
  constructor(private readonly currentTime: Date) {}
  public now(): Date {
    return new Date(this.currentTime.getTime());
  }
}

describe('Sale Repository Aggregate Boundary & Persistence Hardening (Integration)', () => {
  const clock = new TestClock(new Date('2026-09-28T12:00:00.000Z'));

  const validSource = SourceReference.create({
    sourceType: SourceType.INVENTORY_ITEM,
    sourceId: 'inv-item-001',
    sourceCode: 'SKU-WATER-01',
  });

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
  // 1. Repository Interface & Aggregate Exclusivity
  // ==========================================================================
  describe('1. Repository Interface & Aggregate Exclusivity', () => {
    it('only exposes aggregate root operations without arbitrary mutation methods', () => {
      const { mockPrisma } = createMockPrisma();
      const repo = new PrismaSaleRepository(mockPrisma as unknown as PrismaClient);

      // Verify that authorized aggregate repository methods exist
      expect(typeof repo.findById).toBe('function');
      expect(typeof repo.findBySourceReference).toBe('function');
      expect(typeof repo.findBySourceCode).toBe('function');
      expect(typeof repo.save).toBe('function');

      // Verify NO arbitrary update methods exist on the repository
      const repoAny = repo as unknown as Record<string, unknown>;
      expect(repoAny.updateStatus).toBeUndefined();
      expect(repoAny.updateTotals).toBeUndefined();
      expect(repoAny.replaceItems).toBeUndefined();
      expect(repoAny.replaceDiscounts).toBeUndefined();
      expect(repoAny.updateFinancialFields).toBeUndefined();
      expect(repoAny.update).toBeUndefined();
      expect(repoAny.patch).toBeUndefined();
    });
  });

  // ==========================================================================
  // 2. Terminal State Immutability Guards
  // ==========================================================================
  describe('2. Terminal State Immutability Guards in Persistence', () => {
    it('rejects saving any update when database record is in CANCELLED status', async () => {
      const { mockPrisma, mockTx } = createMockPrisma();
      mockTx.sale.findUnique.mockResolvedValue({
        id: 'sale-001',
        status: 'CANCELLED',
        version: 2,
      });

      const repo = new PrismaSaleRepository(mockPrisma as unknown as PrismaClient);

      const sale = Sale.create({ id: SaleId.create('sale-001'), source: validSource }, clock);
      sale.addItem(
        {
          source: validSource,
          description: 'Water Bottle',
          quantity: 1,
          unitPrice: Money.create(10.0, 'USD'),
        },
        clock,
      );

      await expect(repo.save(sale)).rejects.toThrow(InvalidSaleStateException);
      await expect(repo.save(sale)).rejects.toThrow(
        /Sale is already in terminal CANCELLED status in persistence/,
      );

      expect(mockTx.sale.upsert).not.toHaveBeenCalled();
      expect(mockTx.sale.updateMany).not.toHaveBeenCalled();
      expect(mockTx.saleItem.deleteMany).not.toHaveBeenCalled();
      expect(mockTx.saleItem.upsert).not.toHaveBeenCalled();
    });

    it('rejects saving any update when database record is in REFUNDED status', async () => {
      const { mockPrisma, mockTx } = createMockPrisma();
      mockTx.sale.findUnique.mockResolvedValue({
        id: 'sale-002',
        status: 'REFUNDED',
        version: 3,
      });

      const repo = new PrismaSaleRepository(mockPrisma as unknown as PrismaClient);

      const sale = Sale.create({ id: SaleId.create('sale-002'), source: validSource }, clock);
      sale.addItem(
        {
          source: validSource,
          description: 'Water Bottle',
          quantity: 1,
          unitPrice: Money.create(10.0, 'USD'),
        },
        clock,
      );

      await expect(repo.save(sale)).rejects.toThrow(InvalidSaleStateException);
      await expect(repo.save(sale)).rejects.toThrow(
        /Sale is already in terminal REFUNDED status in persistence/,
      );

      expect(mockTx.sale.upsert).not.toHaveBeenCalled();
      expect(mockTx.sale.updateMany).not.toHaveBeenCalled();
    });
  });

  // ==========================================================================
  // 3. Concurrency & Status Regression Prevention (Version 1 Stale Overwrite)
  // ==========================================================================
  describe('3. Concurrency & Stale Draft Protection', () => {
    it('rejects saving a stale version 1 DRAFT when database record is already at version > 1', async () => {
      const { mockPrisma, mockTx } = createMockPrisma();
      // DB record was already finalized and advanced to version 2
      mockTx.sale.findUnique.mockResolvedValue({
        id: 'sale-003',
        status: 'PENDING_PAYMENT',
        version: 2,
      });

      const repo = new PrismaSaleRepository(mockPrisma as unknown as PrismaClient);

      // Caller holds an obsolete version 1 draft
      const staleDraft = Sale.create({ id: SaleId.create('sale-003'), source: validSource }, clock);
      staleDraft.addItem(
        {
          source: validSource,
          description: 'Item A',
          quantity: 1,
          unitPrice: Money.create(15.0, 'USD'),
        },
        clock,
      );

      expect(staleDraft.version).toBe(1);

      await expect(repo.save(staleDraft)).rejects.toThrow(SaleOptimisticLockException);
      expect(mockTx.sale.upsert).not.toHaveBeenCalled();
      expect(mockTx.saleItem.upsert).not.toHaveBeenCalled();
    });

    it('rejects regressing a non-DRAFT sale back to DRAFT', async () => {
      const { mockPrisma, mockTx } = createMockPrisma();
      mockTx.sale.findUnique.mockResolvedValue({
        id: 'sale-004',
        status: 'PAID',
        version: 1, // pathological edge case: DB was marked PAID without bumping version
      });

      const repo = new PrismaSaleRepository(mockPrisma as unknown as PrismaClient);

      const draftSale = Sale.create({ id: SaleId.create('sale-004'), source: validSource }, clock);
      draftSale.addItem(
        {
          source: validSource,
          description: 'Item',
          quantity: 1,
          unitPrice: Money.create(20.0, 'USD'),
        },
        clock,
      );

      await expect(repo.save(draftSale)).rejects.toThrow(InvalidSaleStateException);
      await expect(repo.save(draftSale)).rejects.toThrow(
        /Cannot regress Sale 'sale-004' from status 'PAID' back to 'DRAFT'/,
      );

      expect(mockTx.sale.upsert).not.toHaveBeenCalled();
    });

    it('enforces optimistic concurrency control on advanced versions (version > 1)', async () => {
      const { mockPrisma, mockTx } = createMockPrisma();
      mockTx.sale.findUnique.mockResolvedValue({
        id: 'sale-005',
        status: 'PENDING_PAYMENT',
        version: 2,
      });
      // Simulate concurrent update: updateMany matches 0 rows because version in DB changed
      mockTx.sale.updateMany.mockResolvedValue({ count: 0 });

      const repo = new PrismaSaleRepository(mockPrisma as unknown as PrismaClient);

      const sale = Sale.create({ id: SaleId.create('sale-005'), source: validSource }, clock);
      sale.addItem(
        {
          source: validSource,
          description: 'Item',
          quantity: 1,
          unitPrice: Money.create(20.0, 'USD'),
        },
        clock,
      );
      sale.finalize(clock); // version 2

      await expect(repo.save(sale)).rejects.toThrow(SaleOptimisticLockException);
    });
  });

  // ==========================================================================
  // 4. Reconstitution Boundary Against Database-Level Data Tampering
  // ==========================================================================
  describe('4. Reconstitution Boundary Against Database Tampering', () => {
    it('strictly fails reconstitution if database totalAmount is tampered/arbitrarily updated', async () => {
      const { mockPrisma } = createMockPrisma();
      // DB record tampered: totalAmount altered from $50.00 to $0.01
      mockPrisma.sale.findUnique.mockResolvedValue({
        id: 'sale-tampered-01',
        tenantId: 'tenant-1',
        clientId: 'client-1',
        status: 'DRAFT',
        currency: 'USD',
        sourceType: 'INVENTORY_ITEM',
        sourceId: 'inv-item-01',
        sourceCode: 'CODE-01',
        subtotalAmount: new Prisma.Decimal('50.00'),
        discountTotalAmount: new Prisma.Decimal('0.00'),
        totalAmount: new Prisma.Decimal('0.01'), // TAMPERED!
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
            id: 'item-001',
            saleId: 'sale-tampered-01',
            sourceType: 'INVENTORY_ITEM',
            sourceId: 'inv-item-01',
            sourceCode: 'CODE-01',
            description: 'Item 1',
            skuOrCode: 'CODE-01',
            quantity: new Prisma.Decimal('1.000'),
            unitPriceAmount: new Prisma.Decimal('50.00'),
            unitPriceCurrency: 'USD',
            subtotalAmount: new Prisma.Decimal('50.00'),
            discountTotalAmount: new Prisma.Decimal('0.00'),
            totalAmount: new Prisma.Decimal('50.00'),
            discountType: null,
            discountValue: null,
            discountReason: null,
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        ],
      });

      const repo = new PrismaSaleRepository(mockPrisma as unknown as PrismaClient);

      await expect(repo.findById('sale-tampered-01')).rejects.toThrow(InvalidSaleStateException);
      await expect(repo.findById('sale-tampered-01')).rejects.toThrow(
        /Persisted total .* does not reconcile with subtotal - discountTotal/,
      );
    });

    it('strictly fails reconstitution if database subtotalAmount is tampered', async () => {
      const { mockPrisma } = createMockPrisma();
      // DB record tampered: subtotal altered from $50.00 to $999.00
      mockPrisma.sale.findUnique.mockResolvedValue({
        id: 'sale-tampered-02',
        tenantId: 'tenant-1',
        clientId: 'client-1',
        status: 'DRAFT',
        currency: 'USD',
        sourceType: 'INVENTORY_ITEM',
        sourceId: 'inv-item-01',
        sourceCode: 'CODE-01',
        subtotalAmount: new Prisma.Decimal('999.00'), // TAMPERED!
        discountTotalAmount: new Prisma.Decimal('0.00'),
        totalAmount: new Prisma.Decimal('999.00'),
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
            id: 'item-001',
            saleId: 'sale-tampered-02',
            sourceType: 'INVENTORY_ITEM',
            sourceId: 'inv-item-01',
            sourceCode: 'CODE-01',
            description: 'Item 1',
            skuOrCode: 'CODE-01',
            quantity: new Prisma.Decimal('1.000'),
            unitPriceAmount: new Prisma.Decimal('50.00'),
            unitPriceCurrency: 'USD',
            subtotalAmount: new Prisma.Decimal('50.00'),
            discountTotalAmount: new Prisma.Decimal('0.00'),
            totalAmount: new Prisma.Decimal('50.00'),
            discountType: null,
            discountValue: null,
            discountReason: null,
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        ],
      });

      const repo = new PrismaSaleRepository(mockPrisma as unknown as PrismaClient);

      await expect(repo.findById('sale-tampered-02')).rejects.toThrow(InvalidSaleStateException);
      await expect(repo.findById('sale-tampered-02')).rejects.toThrow(
        /Persisted subtotal .* does not reconcile with sum of item subtotals/,
      );
    });

    it('strictly fails reconstitution if database discountTotalAmount is tampered', async () => {
      const { mockPrisma } = createMockPrisma();
      // DB record tampered: discountTotalAmount set to $10.00 with no discounts on items or order
      mockPrisma.sale.findUnique.mockResolvedValue({
        id: 'sale-tampered-03',
        tenantId: 'tenant-1',
        clientId: 'client-1',
        status: 'DRAFT',
        currency: 'USD',
        sourceType: 'INVENTORY_ITEM',
        sourceId: 'inv-item-01',
        sourceCode: 'CODE-01',
        subtotalAmount: new Prisma.Decimal('50.00'),
        discountTotalAmount: new Prisma.Decimal('10.00'), // TAMPERED!
        totalAmount: new Prisma.Decimal('40.00'),
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
            id: 'item-001',
            saleId: 'sale-tampered-03',
            sourceType: 'INVENTORY_ITEM',
            sourceId: 'inv-item-01',
            sourceCode: 'CODE-01',
            description: 'Item 1',
            skuOrCode: 'CODE-01',
            quantity: new Prisma.Decimal('1.000'),
            unitPriceAmount: new Prisma.Decimal('50.00'),
            unitPriceCurrency: 'USD',
            subtotalAmount: new Prisma.Decimal('50.00'),
            discountTotalAmount: new Prisma.Decimal('0.00'),
            totalAmount: new Prisma.Decimal('50.00'),
            discountType: null,
            discountValue: null,
            discountReason: null,
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        ],
      });

      const repo = new PrismaSaleRepository(mockPrisma as unknown as PrismaClient);

      await expect(repo.findById('sale-tampered-03')).rejects.toThrow(InvalidSaleStateException);
      await expect(repo.findById('sale-tampered-03')).rejects.toThrow(
        /Persisted discountTotal .* does not reconcile with calculated discount total/,
      );
    });
  });

  // ==========================================================================
  // 5. Item Ownership, Cross-Sale Containment & Currency Homogeneity
  // ==========================================================================
  describe('5. Item Ownership, Cross-Sale Containment & Currency Homogeneity', () => {
    it('mapper rejects persisting SaleItem belonging to foreign parent saleId', () => {
      const foreignItem = SaleItem.create({
        id: SaleItemId.create('item-foreign-1'),
        saleId: SaleId.create('sale-foreign-999'),
        source: validSource,
        description: 'Foreign Item',
        quantity: 1,
        unitPrice: Money.create(25.0, 'USD'),
      });

      expect(() =>
        PrismaSaleItemMapper.toPersistence(foreignItem, 'sale-correct-111', 'USD'),
      ).toThrow(InvalidSaleStateException);

      expect(() =>
        PrismaSaleItemMapper.toPersistence(foreignItem, 'sale-correct-111', 'USD'),
      ).toThrow(/Cross-Sale persistence is strictly prohibited/);
    });

    it('mapper rejects persisting detached SaleItem without parentSaleId', () => {
      const detachedItem = SaleItem.create({
        id: SaleItemId.create('item-detached-1'),
        source: validSource,
        description: 'Detached Item',
        quantity: 1,
        unitPrice: Money.create(25.0, 'USD'),
      });

      expect(() => PrismaSaleItemMapper.toPersistence(detachedItem, undefined, 'USD')).toThrow(
        InvalidSaleStateException,
      );

      expect(() => PrismaSaleItemMapper.toPersistence(detachedItem, undefined, 'USD')).toThrow(
        /Cannot persist detached SaleItem .* without parent saleId/,
      );
    });

    it('mapper rejects persisting SaleItem with currency mismatch against parent Sale', () => {
      const eurItem = SaleItem.create({
        id: SaleItemId.create('item-eur-1'),
        saleId: SaleId.create('sale-usd-01'),
        source: validSource,
        description: 'EUR Item',
        quantity: 1,
        unitPrice: Money.create(25.0, 'EUR'),
      });

      expect(() => PrismaSaleItemMapper.toPersistence(eurItem, 'sale-usd-01', 'USD')).toThrow(
        InvalidSaleStateException,
      );

      expect(() => PrismaSaleItemMapper.toPersistence(eurItem, 'sale-usd-01', 'USD')).toThrow(
        /Currency mismatch/,
      );
    });

    it('synchronizes line items strictly scoped to the parent saleId without affecting foreign items', async () => {
      const { mockPrisma, mockTx } = createMockPrisma();
      const repo = new PrismaSaleRepository(mockPrisma as unknown as PrismaClient);

      const sale = Sale.create({ id: SaleId.create('sale-scoped-01'), source: validSource }, clock);
      const item1 = sale.addItem(
        {
          id: SaleItemId.create('item-001'),
          source: validSource,
          description: 'Item 1',
          quantity: 1,
          unitPrice: Money.create(10.0, 'USD'),
        },
        clock,
      );
      const item2 = sale.addItem(
        {
          id: SaleItemId.create('item-002'),
          source: validSource,
          description: 'Item 2',
          quantity: 2,
          unitPrice: Money.create(20.0, 'USD'),
        },
        clock,
      );

      await repo.save(sale);

      // Verify that deleteMany was strictly scoped to this saleId and excluded current item IDs
      expect(mockTx.saleItem.deleteMany).toHaveBeenCalledWith({
        where: {
          saleId: 'sale-scoped-01',
          id: { notIn: [item1.id.value, item2.id.value] },
        },
      });

      // Verify each item was upserted with the exact parent saleId
      expect(mockTx.saleItem.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: item1.id.value },
          create: expect.objectContaining({ saleId: 'sale-scoped-01' }),
        }),
      );
      expect(mockTx.saleItem.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: item2.id.value },
          create: expect.objectContaining({ saleId: 'sale-scoped-01' }),
        }),
      );
    });
  });

  // ==========================================================================
  // 6. Transactional Atomicity & Full Rollback
  // ==========================================================================
  describe('6. Transactional Atomicity & Full Rollback', () => {
    it('aborts the entire transaction if child item persistence fails', async () => {
      const mockTx: MockPrismaTx = {
        sale: {
          findUnique: jest.fn().mockResolvedValue(null),
          findFirst: jest.fn().mockResolvedValue(null),
          upsert: jest.fn().mockResolvedValue({}),
          updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        },
        saleItem: {
          deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
          upsert: jest.fn().mockRejectedValue(new Error('PostgreSQL Disk / Foreign Key Failure')),
        },
      };

      const mockPrisma = {
        $transaction: jest.fn(async (cb: (tx: MockPrismaTx) => Promise<unknown>) => {
          return cb(mockTx);
        }),
      };

      const repo = new PrismaSaleRepository(mockPrisma as unknown as PrismaClient);

      const sale = Sale.create({ id: SaleId.create('sale-atomic-01'), source: validSource }, clock);
      sale.addItem(
        {
          source: validSource,
          description: 'Item',
          quantity: 1,
          unitPrice: Money.create(10.0, 'USD'),
        },
        clock,
      );

      await expect(repo.save(sale)).rejects.toThrow('PostgreSQL Disk / Foreign Key Failure');
      // The transaction boundary ensures that partial state is never committed.
      expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
    });

    it('rejects updating an already CANCELLED sale record in persistence', async () => {
      const { mockPrisma, mockTx } = createMockPrisma();
      mockTx.sale.findUnique.mockResolvedValue({ status: 'CANCELLED' });

      const repo = new PrismaSaleRepository(mockPrisma as unknown as PrismaClient);
      const sale = Sale.create(
        { id: SaleId.create('sale-cancelled-01'), source: validSource },
        clock,
      );
      sale.addItem(
        {
          source: validSource,
          description: 'Item',
          quantity: 1,
          unitPrice: Money.create(10.0, 'USD'),
        },
        clock,
      );
      sale.cancel('Customer declined transaction at point of sale', clock);

      await expect(repo.save(sale)).rejects.toThrow(InvalidSaleStateException);
      await expect(repo.save(sale)).rejects.toThrow(
        /Sale is already in terminal CANCELLED status in persistence/,
      );

      expect(mockTx.sale.upsert).not.toHaveBeenCalled();
      expect(mockTx.sale.updateMany).not.toHaveBeenCalled();
      expect(mockTx.saleItem.upsert).not.toHaveBeenCalled();
      expect(mockTx.saleItem.deleteMany).not.toHaveBeenCalled();
    });

    it('permits transitioning a DRAFT or PENDING_PAYMENT sale to CANCELLED in persistence', async () => {
      const { mockPrisma, mockTx } = createMockPrisma();
      mockTx.sale.findUnique.mockResolvedValue({ status: 'PENDING_PAYMENT' });
      mockTx.sale.updateMany.mockResolvedValue({ count: 1 });

      const repo = new PrismaSaleRepository(mockPrisma as unknown as PrismaClient);
      const sale = Sale.create(
        { id: SaleId.create('sale-cancel-transition'), source: validSource },
        clock,
      );
      sale.addItem(
        {
          source: validSource,
          description: 'Item',
          quantity: 1,
          unitPrice: Money.create(10.0, 'USD'),
        },
        clock,
      );
      sale.cancel('Customer declined transaction at point of sale', clock);

      await expect(repo.save(sale)).resolves.not.toThrow();
      expect(mockTx.sale.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: sale.id.value, version: 1 },
          data: expect.objectContaining({
            status: 'CANCELLED',
            cancellationReason: 'Customer declined transaction at point of sale',
          }),
        }),
      );
    });
  });
});
