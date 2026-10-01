import {
  Prisma,
  PrismaClient,
  Sale as PrismaSaleModel,
  SaleItem as PrismaSaleItemModel,
} from '@prisma/client';
import { Sale } from '../../../../domain/sale.aggregate';
import { SaleItem } from '../../../../domain/entities/sale-item.entity';
import { SaleId } from '../../../../domain/value-objects/sale-id.vo';
import { SaleItemId } from '../../../../domain/value-objects/sale-item-id.vo';
import { Money } from '../../../../domain/value-objects/money.vo';
import { Discount } from '../../../../domain/value-objects/discount.vo';
import { SaleSource } from '../../../../domain/value-objects/sale-source.vo';
import { SaleSourceType } from '../../../../domain/enums/sale-source-type.enum';
import { InvalidSaleStateException } from '../../../../domain/exceptions/invalid-sale-state.exception';
import { PrismaSaleRepository } from '../repositories/prisma-sale.repository';
import { PrismaSaleItemMapper } from '../mappers/prisma-sale-item.mapper';
import { DeterministicClock } from '../../../../domain/shared/clock';

/**
 * Stateful relational test harness emulating PostgreSQL / Prisma relational mechanics,
 * foreign key integrity, and ON DELETE CASCADE for Sale and SaleItem.
 */
class MockRelationalDatabase {
  public sales = new Map<string, PrismaSaleModel>();
  public saleItems = new Map<string, PrismaSaleItemModel>();

  // Configurable hooks to simulate database relational engine constraints
  public enforceForeignKeys = true;
  public failOnFkViolation = false;

  public createClient = (): PrismaClient => {
    const createTx = (
      bufferedSales: Map<string, PrismaSaleModel>,
      bufferedItems: Map<string, PrismaSaleItemModel>,
    ) => ({
      sale: {
        findUnique: jest.fn(
          async ({ where, include }: { where: { id: string }; include?: { items?: boolean } }) => {
            const sale = bufferedSales.get(where.id);
            if (!sale) return null;
            if (include?.items) {
              const items = Array.from(bufferedItems.values()).filter(
                (item) => item.saleId === sale.id,
              );
              return { ...sale, items };
            }
            return { ...sale };
          },
        ),
        findFirst: jest.fn(async () => null),
        upsert: jest.fn(
          async ({
            where,
            create,
            update,
          }: {
            where: { id: string };
            create: Record<string, unknown>;
            update: Record<string, unknown>;
          }) => {
            const existing = bufferedSales.get(where.id);
            const data = existing
              ? { ...existing, ...update, updatedAt: new Date() }
              : { ...create, createdAt: new Date(), updatedAt: new Date() };
            bufferedSales.set(where.id, data as PrismaSaleModel);
            return data;
          },
        ),
        updateMany: jest.fn(
          async ({
            where,
            data,
          }: {
            where: { id: string; version: number };
            data: Record<string, unknown>;
          }) => {
            const existing = bufferedSales.get(where.id);
            if (existing && existing.version === where.version) {
              const updated = { ...existing, ...data, updatedAt: new Date() };
              bufferedSales.set(where.id, updated as PrismaSaleModel);
              return { count: 1 };
            }
            return { count: 0 };
          },
        ),
        delete: jest.fn(async ({ where }: { where: { id: string } }) => {
          const existing = bufferedSales.get(where.id);
          if (!existing) {
            throw new Error(`Record to delete does not exist: ${where.id}`);
          }
          bufferedSales.delete(where.id);

          // Relational Engine Emulation: ON DELETE CASCADE
          for (const [itemId, item] of Array.from(bufferedItems.entries())) {
            if (item.saleId === where.id) {
              bufferedItems.delete(itemId);
            }
          }
          return existing;
        }),
      },
      saleItem: {
        findMany: jest.fn(async ({ where }: { where: { saleId?: string } }) => {
          return Array.from(bufferedItems.values()).filter((item) =>
            where.saleId ? item.saleId === where.saleId : true,
          );
        }),
        deleteMany: jest.fn(
          async ({ where }: { where: { saleId: string; id?: { notIn?: string[] } } }) => {
            let deleted = 0;
            for (const [id, item] of Array.from(bufferedItems.entries())) {
              if (item.saleId === where.saleId) {
                if (!where.id?.notIn || !where.id.notIn.includes(id)) {
                  bufferedItems.delete(id);
                  deleted++;
                }
              }
            }
            return { count: deleted };
          },
        ),
        upsert: jest.fn(
          async ({
            where,
            create,
            update,
          }: {
            where: { id: string };
            create: Record<string, unknown>;
            update: Record<string, unknown>;
          }) => {
            const targetSaleId = (create.saleId ?? update.saleId) as string;

            if (this.enforceForeignKeys && !bufferedSales.has(targetSaleId)) {
              throw new Prisma.PrismaClientKnownRequestError(
                `Foreign key constraint failed on the field: sale_items_sale_id_fkey (table: sale_items, parent: sales, key: ${targetSaleId})`,
                { code: 'P2003', clientVersion: '6.3.1' },
              );
            }

            const existing = bufferedItems.get(where.id);
            const data = existing
              ? { ...existing, ...update, updatedAt: new Date() }
              : { ...create, createdAt: new Date(), updatedAt: new Date() };
            bufferedItems.set(where.id, data as PrismaSaleItemModel);
            return data;
          },
        ),
      },
    });

    return {
      $transaction: jest.fn(async (callback: (tx: unknown) => Promise<unknown>) => {
        const bufferedSales = new Map<string, PrismaSaleModel>(
          Array.from(this.sales.entries()).map(([k, v]) => [k, { ...v }]),
        );
        const bufferedItems = new Map<string, PrismaSaleItemModel>(
          Array.from(this.saleItems.entries()).map(([k, v]) => [k, { ...v }]),
        );

        const tx = createTx(bufferedSales, bufferedItems);
        const result = await callback(tx);

        this.sales = bufferedSales;
        this.saleItems = bufferedItems;
        return result;
      }),
      sale: {
        findUnique: jest.fn(
          async ({ where, include }: { where: { id: string }; include?: { items?: boolean } }) => {
            const sale = this.sales.get(where.id);
            if (!sale) return null;
            if (include?.items) {
              const items = Array.from(this.saleItems.values()).filter(
                (item) => item.saleId === sale.id,
              );
              return { ...sale, items };
            }
            return { ...sale };
          },
        ),
        delete: jest.fn(async ({ where }: { where: { id: string } }) => {
          const existing = this.sales.get(where.id);
          if (!existing) {
            throw new Error(`Record does not exist: ${where.id}`);
          }
          this.sales.delete(where.id);

          // ON DELETE CASCADE emulation
          for (const [itemId, item] of Array.from(this.saleItems.entries())) {
            if (item.saleId === where.id) {
              this.saleItems.delete(itemId);
            }
          }
          return existing;
        }),
      },
      saleItem: {
        findMany: jest.fn(async ({ where }: { where?: { saleId?: string } }) => {
          return Array.from(this.saleItems.values()).filter((item) =>
            where?.saleId ? item.saleId === where.saleId : true,
          );
        }),
      },
    } as unknown as PrismaClient;
  };
}

describe('SaleItem Persistence & Ownership Invariants (Integration)', () => {
  const clock = new DeterministicClock(new Date('2026-10-01T14:00:00.000Z'));
  const tenantId = 'tenant_kinergy_wellness';

  const gymSource = SaleSource.create(SaleSourceType.GYM_MEMBERSHIP, 'mem-gold-001');
  const foodSource = SaleSource.create(SaleSourceType.FOOD, 'food-bar-chocolate');
  const drinkSource = SaleSource.create(SaleSourceType.DRINK, 'drink-electrolyte-orange');

  let db: MockRelationalDatabase;
  let prismaClient: PrismaClient;
  let repository: PrismaSaleRepository;

  beforeEach(() => {
    db = new MockRelationalDatabase();
    prismaClient = db.createClient();
    repository = new PrismaSaleRepository(prismaClient);
  });

  // ==========================================================================
  // 1. Creation & Aggregate Ownership
  // ==========================================================================
  describe('1. Creation & Required Ownership', () => {
    it('persists a Sale and its child SaleItems atomically, populating all database columns', async () => {
      const sale = Sale.create({ tenantId, source: foodSource }, clock);
      sale.addItem(
        {
          source: foodSource,
          description: 'Whey Protein Bar',
          skuOrCode: 'SKU-BAR-01',
          quantity: 2,
          unitPrice: Money.create(3.5, 'USD'),
          discount: Discount.fixed(1.0, 'Introductory discount'),
        },
        clock,
      );

      await repository.save(sale);

      // Verify Sale was persisted
      expect(db.sales.size).toBe(1);
      const persistedSale = db.sales.get(sale.id.value);
      expect(persistedSale).toBeDefined();

      // Verify child SaleItem was persisted with explicit required ownership
      expect(db.saleItems.size).toBe(1);
      const persistedItem = Array.from(db.saleItems.values())[0]!;
      expect(persistedItem).toBeDefined();
      expect(persistedItem.id).toBe(sale.items[0]!.id.value);
      expect(persistedItem.saleId).toBe(sale.id.value);
      expect(persistedItem.description).toBe('Whey Protein Bar');
      expect(persistedItem.skuOrCode).toBe('SKU-BAR-01');
      expect(persistedItem.sourceType).toBe(SaleSourceType.FOOD);
      expect(persistedItem.sourceId).toBe('food-bar-chocolate');
      expect(persistedItem.quantity).toEqual(new Prisma.Decimal('2.000'));
      expect(persistedItem.unitPriceAmount).toEqual(new Prisma.Decimal('3.50'));
      expect(persistedItem.unitPriceCurrency).toBe('USD');
      expect(persistedItem.subtotalAmount).toEqual(new Prisma.Decimal('7.00'));
      expect(persistedItem.discountTotalAmount).toEqual(new Prisma.Decimal('1.00'));
      expect(persistedItem.totalAmount).toEqual(new Prisma.Decimal('6.00'));
      expect(persistedItem.discountType).toBe('FIXED');
      expect(persistedItem.discountValue).toEqual(new Prisma.Decimal('1.00'));
      expect(persistedItem.discountReason).toBe('Introductory discount');
    });

    it('persists multiple child SaleItems with distinct sources and lines under one parent Sale', async () => {
      const sale = Sale.create({ tenantId, source: gymSource }, clock);
      sale.addItem(
        {
          source: gymSource,
          description: 'Gold Monthly Membership Access',
          skuOrCode: 'PLAN-GOLD',
          quantity: 1,
          unitPrice: Money.create(150.0, 'USD'),
        },
        clock,
      );
      sale.addItem(
        {
          source: drinkSource,
          description: 'Orange Electrolyte Recovery Drink',
          skuOrCode: 'DRINK-ORANGE-500',
          quantity: 3,
          unitPrice: Money.create(4.25, 'USD'),
        },
        clock,
      );

      await repository.save(sale);

      expect(db.saleItems.size).toBe(2);
      const items = Array.from(db.saleItems.values());
      expect(items.every((it) => it.saleId === sale.id.value)).toBe(true);

      const membershipItem = items.find((it) => it.skuOrCode === 'PLAN-GOLD');
      const drinkItem = items.find((it) => it.skuOrCode === 'DRINK-ORANGE-500');

      expect(membershipItem?.totalAmount).toEqual(new Prisma.Decimal('150.00'));
      expect(drinkItem?.totalAmount).toEqual(new Prisma.Decimal('12.75'));
      expect(persistedTotalSum(items)).toEqual(new Prisma.Decimal('162.75'));
    });
  });

  // ==========================================================================
  // 2. Retrieval & Reconstitution
  // ==========================================================================
  describe('2. Retrieval & Reconstitution', () => {
    it('retrieves and hydrates all child SaleItems correctly into domain entities via Sale aggregate', async () => {
      const sale = Sale.create({ tenantId, source: foodSource }, clock);
      sale.addItem(
        {
          source: foodSource,
          description: 'Crispy Protein Snack',
          skuOrCode: 'SNACK-01',
          quantity: 4,
          unitPrice: Money.create(2.5, 'USD'),
          discount: Discount.percentage(10, '10% Multi-buy discount'),
        },
        clock,
      );

      await repository.save(sale);

      const retrieved = await repository.findById(sale.id);
      expect(retrieved).not.toBeNull();
      expect(retrieved!.items).toHaveLength(1);

      const item = retrieved!.items[0]!;
      expect(item.id.value).toBe(sale.items[0]!.id.value);
      expect(item.saleId?.value).toBe(sale.id.value);
      expect(item.description).toBe('Crispy Protein Snack');
      expect(item.skuOrCode).toBe('SNACK-01');
      expect(item.quantity).toBe(4);
      expect(item.unitPrice.amount).toBe(2.5);
      expect(item.unitPrice.currency).toBe('USD');
      expect(item.subtotal.amount).toBe(10.0);
      expect(item.discountTotal.amount).toBe(1.0); // 10% of 10.00 = 1.00
      expect(item.total.amount).toBe(9.0);
      expect(item.discount?.type).toBe('PERCENTAGE');
      expect(item.discount?.value).toBe(10);
      expect(item.discount?.reason).toBe('10% Multi-buy discount');
      expect(item.source.sourceType).toBe(SaleSourceType.FOOD);
      expect(item.source.sourceId).toBe('food-bar-chocolate');
    });
  });

  // ==========================================================================
  // 3. Sale Relation & Referential Integrity
  // ==========================================================================
  describe('3. Sale Relation & Referential Integrity', () => {
    it('verifies every child item is linked to parent Sale foreign key', async () => {
      const sale = Sale.create({ tenantId, source: drinkSource }, clock);
      sale.addItem(
        {
          source: drinkSource,
          description: 'Pure Isotonic Hydration',
          quantity: 2,
          unitPrice: Money.create(5.0, 'USD'),
        },
        clock,
      );

      await repository.save(sale);

      const rawItems = await prismaClient.saleItem.findMany({
        where: { saleId: sale.id.value },
      });

      expect(rawItems).toHaveLength(1);
      expect(rawItems[0]!.saleId).toBe(sale.id.value);
    });

    it('guarantees parent Sale aggregate totals equal sum of child line items', async () => {
      const sale = Sale.create({ tenantId, source: foodSource }, clock);
      sale.addItem(
        {
          source: foodSource,
          description: 'Bar 1',
          quantity: 2,
          unitPrice: Money.create(10.0, 'USD'),
        },
        clock,
      );
      sale.addItem(
        {
          source: drinkSource,
          description: 'Drink 1',
          quantity: 1,
          unitPrice: Money.create(5.0, 'USD'),
        },
        clock,
      );

      await repository.save(sale);

      const persistedSale = db.sales.get(sale.id.value)!;
      const items = Array.from(db.saleItems.values()).filter((i) => i.saleId === sale.id.value);

      const itemsSubtotalSum = items.reduce(
        (sum, item) => sum.plus(item.subtotalAmount),
        new Prisma.Decimal(0),
      );
      const itemsTotalSum = items.reduce(
        (sum, item) => sum.plus(item.totalAmount),
        new Prisma.Decimal(0),
      );

      expect(persistedSale.subtotalAmount).toEqual(itemsSubtotalSum);
      expect(persistedSale.totalAmount).toEqual(itemsTotalSum);
    });
  });

  // ==========================================================================
  // 4. Deletion & ON DELETE CASCADE
  // ==========================================================================
  describe('4. Deletion Behavior & ON DELETE CASCADE', () => {
    it('deletes removed items from persistence during draft synchronization', async () => {
      const sale = Sale.create({ tenantId, source: foodSource }, clock);
      sale.addItem(
        {
          source: foodSource,
          description: 'Item to Keep',
          quantity: 1,
          unitPrice: Money.create(10.0, 'USD'),
        },
        clock,
      );
      sale.addItem(
        {
          source: drinkSource,
          description: 'Item to Remove',
          quantity: 1,
          unitPrice: Money.create(5.0, 'USD'),
        },
        clock,
      );

      await repository.save(sale);
      expect(db.saleItems.size).toBe(2);

      const itemToRemoveId = sale.items[1]!.id;
      sale.removeItem(itemToRemoveId, clock);

      await repository.save(sale);

      // Verify differential sync removed the item from database
      expect(db.saleItems.size).toBe(1);
      const remainingItem = Array.from(db.saleItems.values())[0]!;
      expect(remainingItem.description).toBe('Item to Keep');
    });

    it('cascades deletion of all child SaleItems when parent Sale is deleted, preventing orphan rows', async () => {
      const sale = Sale.create({ tenantId, source: foodSource }, clock);
      sale.addItem(
        {
          source: foodSource,
          description: 'Orphan Prevention Test Item A',
          quantity: 1,
          unitPrice: Money.create(15.0, 'USD'),
        },
        clock,
      );
      sale.addItem(
        {
          source: drinkSource,
          description: 'Orphan Prevention Test Item B',
          quantity: 2,
          unitPrice: Money.create(7.5, 'USD'),
        },
        clock,
      );

      await repository.save(sale);
      expect(db.sales.size).toBe(1);
      expect(db.saleItems.size).toBe(2);

      // Emulate parent Sale deletion (e.g. database purge or draft cleanup)
      await prismaClient.sale.delete({
        where: { id: sale.id.value },
      });

      // Verify Sale is deleted
      expect(db.sales.size).toBe(0);

      // Verify ON DELETE CASCADE cleaned up all child sale_items: NO ORPHANS REMAIN
      expect(db.saleItems.size).toBe(0);
    });
  });

  // ==========================================================================
  // 5. Invalid Sale Reference & Detached Item Prevention
  // ==========================================================================
  describe('5. Invalid Sale Reference & Detached Item Prevention', () => {
    it('rejects persisting a SaleItem when parent saleId is undefined or missing', () => {
      const item = SaleItem.create({
        source: foodSource,
        description: 'Detached Item',
        quantity: 1,
        unitPrice: Money.create(10.0, 'USD'),
      });

      expect(() => PrismaSaleItemMapper.toPersistence(item)).toThrow(InvalidSaleStateException);
      expect(() => PrismaSaleItemMapper.toPersistence(item)).toThrow(
        /Cannot persist detached SaleItem .* without parent saleId/,
      );
    });

    it('rejects persisting a SaleItem with mismatched parent saleId (cross-sale persistence attack)', () => {
      const item = SaleItem.reconstitute({
        id: SaleItemId.create('item-123'),
        saleId: SaleId.create('sale-real-parent'),
        source: foodSource,
        description: 'Cross Sale Item',
        quantity: 1,
        unitPrice: Money.create(10.0, 'USD'),
      });

      expect(() => PrismaSaleItemMapper.toPersistence(item, 'sale-foreign-parent', 'USD')).toThrow(
        InvalidSaleStateException,
      );
      expect(() => PrismaSaleItemMapper.toPersistence(item, 'sale-foreign-parent', 'USD')).toThrow(
        /Cross-Sale persistence is strictly prohibited/,
      );
    });

    it('rejects persisting a SaleItem when foreign key constraint fails on non-existent parent sale in DB', async () => {
      const validItem = SaleItem.create({
        source: foodSource,
        description: 'Item with Ghost Parent',
        quantity: 1,
        unitPrice: Money.create(10.0, 'USD'),
      });

      const persistenceData = PrismaSaleItemMapper.toPersistence(
        validItem,
        'non-existent-sale-id',
        'USD',
      );

      // Attempt direct upsert of child item pointing to nonexistent parent
      await expect(
        prismaClient.$transaction(async (tx) => {
          const clientTx = tx as unknown as {
            saleItem: {
              upsert: (args: {
                where: { id: string };
                create: Record<string, unknown>;
                update: Record<string, unknown>;
              }) => Promise<unknown>;
            };
          };
          return clientTx.saleItem.upsert({
            where: { id: persistenceData.id },
            create: persistenceData,
            update: persistenceData,
          });
        }),
      ).rejects.toThrow(Prisma.PrismaClientKnownRequestError);
    });
  });

  // ==========================================================================
  // 6. Monetary Precision & Determinism
  // ==========================================================================
  describe('6. Monetary Precision & Exact Rounding', () => {
    it('preserves exact 2-decimal scale without floating-point artifacts', async () => {
      const sale = Sale.create({ tenantId, source: foodSource }, clock);
      sale.addItem(
        {
          source: foodSource,
          description: 'Precision Item',
          quantity: 3,
          unitPrice: Money.create(19.99, 'USD'),
        },
        clock,
      );

      await repository.save(sale);

      const persistedItem = Array.from(db.saleItems.values())[0]!;
      // 3 * 19.99 = 59.97 exactly
      expect(persistedItem.unitPriceAmount.toFixed(2)).toBe('19.99');
      expect(persistedItem.subtotalAmount.toFixed(2)).toBe('59.97');
      expect(persistedItem.totalAmount.toFixed(2)).toBe('59.97');
      expect(persistedItem.unitPriceAmount).toBeInstanceOf(Prisma.Decimal);
    });

    it('persists exact fractional cent discounts rounded to standard financial precision', async () => {
      const sale = Sale.create({ tenantId, source: foodSource }, clock);
      sale.addItem(
        {
          source: foodSource,
          description: 'Discount Rounding Item',
          quantity: 1,
          unitPrice: Money.create(33.33, 'USD'),
          discount: Discount.percentage(15, '15% sale discount'),
        },
        clock,
      );

      await repository.save(sale);

      const persistedItem = Array.from(db.saleItems.values())[0]!;
      // 33.33 * 0.15 = 4.9995 -> 5.00 rounded
      expect(persistedItem.subtotalAmount.toFixed(2)).toBe('33.33');
      expect(persistedItem.discountTotalAmount.toFixed(2)).toBe('5.00');
      expect(persistedItem.totalAmount.toFixed(2)).toBe('28.33');
    });
  });

  // ==========================================================================
  // 7. Quantity Precision
  // ==========================================================================
  describe('7. Quantity Precision (@db.Decimal(10, 3))', () => {
    it('persists fractional quantities with exact 3-decimal precision', async () => {
      const sale = Sale.create({ tenantId, source: foodSource }, clock);
      // e.g. 1.750 kg of protein bulk supplement
      sale.addItem(
        {
          source: foodSource,
          description: 'Bulk Protein Powder (kg)',
          skuOrCode: 'BULK-PROTEIN-KG',
          quantity: 1.75,
          unitPrice: Money.create(20.0, 'USD'),
        },
        clock,
      );

      await repository.save(sale);

      const persistedItem = Array.from(db.saleItems.values())[0]!;
      expect(persistedItem.quantity).toBeInstanceOf(Prisma.Decimal);
      expect(persistedItem.quantity.toFixed(3)).toBe('1.750');
      // Subtotal = 1.750 * 20.00 = 35.00
      expect(persistedItem.subtotalAmount.toFixed(2)).toBe('35.00');
    });

    it('persists fine-grained three-decimal quantities (e.g. 0.125 units)', async () => {
      const sale = Sale.create({ tenantId, source: foodSource }, clock);
      sale.addItem(
        {
          source: foodSource,
          description: 'Small Fraction Supplement',
          quantity: 0.125,
          unitPrice: Money.create(80.0, 'USD'),
        },
        clock,
      );

      await repository.save(sale);

      const persistedItem = Array.from(db.saleItems.values())[0]!;
      expect(persistedItem.quantity.toFixed(3)).toBe('0.125');
      // 0.125 * 80.00 = 10.00
      expect(persistedItem.subtotalAmount.toFixed(2)).toBe('10.00');
    });
  });

  // ==========================================================================
  // 8. Round Trip Fidelity
  // ==========================================================================
  describe('8. Domain <-> Persistence Round Trip Fidelity', () => {
    it('reconstitutes identical domain SaleItem after saving to persistence and loading back', async () => {
      const originalSale = Sale.create({ tenantId, source: drinkSource }, clock);
      originalSale.addItem(
        {
          source: drinkSource,
          description: 'Hydration Pack Complete',
          skuOrCode: 'HYDRO-PACK-01',
          quantity: 3,
          unitPrice: Money.create(12.75, 'USD'),
          discount: Discount.fixed(2.5, 'Promo Code Summer'),
        },
        clock,
      );

      await repository.save(originalSale);

      const retrievedSale = await repository.findById(originalSale.id);
      expect(retrievedSale).not.toBeNull();
      expect(retrievedSale!.items).toHaveLength(1);

      const originalItem = originalSale.items[0]!;
      const retrievedItem = retrievedSale!.items[0]!;

      // Exact field-by-field parity
      expect(retrievedItem.id.value).toBe(originalItem.id.value);
      expect(retrievedItem.saleId?.value).toBe(originalSale.id.value);
      expect(retrievedItem.description).toBe(originalItem.description);
      expect(retrievedItem.skuOrCode).toBe(originalItem.skuOrCode);
      expect(retrievedItem.quantity).toBe(originalItem.quantity);
      expect(retrievedItem.unitPrice.amount).toBe(originalItem.unitPrice.amount);
      expect(retrievedItem.unitPrice.currency).toBe(originalItem.unitPrice.currency);
      expect(retrievedItem.subtotal.amount).toBe(originalItem.subtotal.amount);
      expect(retrievedItem.discountTotal.amount).toBe(originalItem.discountTotal.amount);
      expect(retrievedItem.total.amount).toBe(originalItem.total.amount);
      expect(retrievedItem.discount?.type).toBe(originalItem.discount?.type);
      expect(retrievedItem.discount?.value).toBe(originalItem.discount?.value);
      expect(retrievedItem.discount?.reason).toBe(originalItem.discount?.reason);
      expect(retrievedItem.source.sourceType).toBe(originalItem.source.sourceType);
      expect(retrievedItem.source.sourceId).toBe(originalItem.source.sourceId);
    });
  });

  // ==========================================================================
  // 9. Prohibition of Aggregate Bypassing in Persistence Operations
  // ==========================================================================
  describe('9. Aggregate Encapsulation & Prohibition of Bypassing', () => {
    it('proves no standalone SaleItem repository exists in application layer', () => {
      // Repositories are strictly root-level (SaleRepositoryPort, not SaleItemRepositoryPort)
      const repoAny = repository as unknown as Record<string, unknown>;
      expect(repoAny.saveItem).toBeUndefined();
      expect(repoAny.deleteItem).toBeUndefined();
      expect(repoAny.updateItem).toBeUndefined();
      expect(repoAny.findItemById).toBeUndefined();
    });

    it('rejects persisting an item with currency that does not match parent sale currency', () => {
      const itemWithEur = SaleItem.create({
        source: foodSource,
        description: 'EUR item under USD sale',
        quantity: 1,
        unitPrice: Money.create(10.0, 'EUR'),
      });

      expect(() =>
        PrismaSaleItemMapper.toPersistence(itemWithEur, 'parent-sale-usd', 'USD'),
      ).toThrow(InvalidSaleStateException);
      expect(() =>
        PrismaSaleItemMapper.toPersistence(itemWithEur, 'parent-sale-usd', 'USD'),
      ).toThrow(/Currency mismatch/);
    });
  });
});

function persistedTotalSum(items: PrismaSaleItemModel[]): Prisma.Decimal {
  return items.reduce((sum, item) => sum.plus(item.totalAmount), new Prisma.Decimal(0));
}
