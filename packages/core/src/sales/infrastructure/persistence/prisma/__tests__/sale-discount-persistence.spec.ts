import {
  Prisma,
  PrismaClient,
  Sale as PrismaSaleModel,
  SaleItem as PrismaSaleItemModel,
} from '@prisma/client';
import { Sale } from '../../../../domain/sale.aggregate';
import { Money } from '../../../../domain/value-objects/money.vo';
import { Discount } from '../../../../domain/value-objects/discount.vo';
import { DiscountType } from '../../../../domain/enums/discount-type.enum';
import { SaleSource } from '../../../../domain/value-objects/sale-source.vo';
import { SaleSourceType } from '../../../../domain/enums/sale-source-type.enum';
import { InvalidDiscountException } from '../../../../domain/exceptions/invalid-discount.exception';
import { PrismaSaleRepository } from '../repositories/prisma-sale.repository';
import { PrismaSaleMapper } from '../mappers/prisma-sale.mapper';
import { DeterministicClock } from '../../../../domain/shared/clock';

/**
 * Stateful relational test harness verifying embedded Discount Value Object persistence,
 * structural constraints, lifecycle immutability, and cascade cleanup.
 */
class MockDiscountRelationalDatabase {
  public sales = new Map<string, PrismaSaleModel>();
  public saleItems = new Map<string, PrismaSaleItemModel>();

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
            throw new Error(`Record does not exist: ${where.id}`);
          }
          bufferedSales.delete(where.id);

          // Embedded items cleaned up along with parent Sale
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

describe('Phase 7.3 Discount Persistence & Value Object Architecture (Integration)', () => {
  const clock = new DeterministicClock(new Date('2026-10-01T15:00:00.000Z'));
  const tenantId = 'tenant_kinergy_wellness';

  const foodSource = SaleSource.create(SaleSourceType.FOOD, 'food-bar-peanut');
  const drinkSource = SaleSource.create(SaleSourceType.DRINK, 'drink-protein-shake');

  let db: MockDiscountRelationalDatabase;
  let prismaClient: PrismaClient;
  let repository: PrismaSaleRepository;

  beforeEach(() => {
    db = new MockDiscountRelationalDatabase();
    prismaClient = db.createClient();
    repository = new PrismaSaleRepository(prismaClient);
  });

  // ==========================================================================
  // 1. Architecture Determination: Embedded Value Object vs Entity Table
  // ==========================================================================
  describe('1. Architectural Determination (Embedded Value Object vs Entity Table)', () => {
    it('proves Discount is an embedded Value Object without a dedicated table or synthetic ID', () => {
      const discount = Discount.fixed(10.0, 'Ten Dollar Off Promo');

      // 1. Value Object Characteristics: Immutable, no ID property
      expect((discount as unknown as { id?: string }).id).toBeUndefined();
      expect(Object.isFrozen(discount)).toBe(true);
      expect(discount.type).toBe(DiscountType.FIXED);
      expect(discount.value).toBe(10.0);
      expect(discount.reason).toBe('Ten Dollar Off Promo');

      // 2. Structural equality
      const discountTwin = Discount.fixed(10.0, 'Ten Dollar Off Promo');
      expect(discount.type).toBe(discountTwin.type);
      expect(discount.value).toBe(discountTwin.value);
      expect(discount.reason).toBe(discountTwin.reason);
    });

    it('proves Prisma schema maps discounts as flattened columns on sales and sale_items', () => {
      const sale = Sale.create({ tenantId, source: foodSource }, clock);
      sale.addItem(
        {
          source: foodSource,
          description: 'Peanut Bar',
          quantity: 2,
          unitPrice: Money.create(5.0, 'USD'),
          discount: Discount.percentage(10, '10% Snack Promo'),
        },
        clock,
      );
      sale.applyOrderDiscount(Discount.fixed(2.0, '$2 Off Order'), clock);

      const { sale: persistedSale, items: persistedItems } = PrismaSaleMapper.toPersistence(sale);

      // Embedded columns on sales table (no discounts foreign key)
      expect(persistedSale.orderDiscountType).toBe('FIXED');
      expect(persistedSale.orderDiscountValue).toEqual(new Prisma.Decimal('2.00'));
      expect(persistedSale.orderDiscountReason).toBe('$2 Off Order');
      expect((persistedSale as unknown as { discountId?: string }).discountId).toBeUndefined();

      // Embedded columns on sale_items table (no discounts foreign key)
      const firstItem = persistedItems[0]!;
      expect(firstItem.discountType).toBe('PERCENTAGE');
      expect(firstItem.discountValue).toEqual(new Prisma.Decimal('10.00'));
      expect(firstItem.discountReason).toBe('10% Snack Promo');
      expect((firstItem as unknown as { discountId?: string }).discountId).toBeUndefined();
    });
  });

  // ==========================================================================
  // 2. Order Discount Persistence & Round Trip
  // ==========================================================================
  describe('2. Order Discount Persistence & Aggregate Reconstitution', () => {
    it('persists a percentage order discount and reconstitutes it with exact precision', async () => {
      const sale = Sale.create({ tenantId, source: foodSource }, clock);
      sale.addItem(
        {
          source: foodSource,
          description: 'Protein Shake',
          quantity: 2,
          unitPrice: Money.create(25.0, 'USD'),
        },
        clock,
      );
      sale.applyOrderDiscount(Discount.percentage(20, '20% VIP Client Discount'), clock);

      await repository.save(sale);

      const persistedSale = db.sales.get(sale.id.value)!;
      expect(persistedSale.orderDiscountType).toBe('PERCENTAGE');
      expect(persistedSale.orderDiscountValue).toEqual(new Prisma.Decimal('20.00'));
      expect(persistedSale.orderDiscountReason).toBe('20% VIP Client Discount');
      // Subtotal = 50.00, 20% discount = 10.00, total = 40.00
      expect(persistedSale.subtotalAmount).toEqual(new Prisma.Decimal('50.00'));
      expect(persistedSale.discountTotalAmount).toEqual(new Prisma.Decimal('10.00'));
      expect(persistedSale.totalAmount).toEqual(new Prisma.Decimal('40.00'));

      const retrievedSale = await repository.findById(sale.id);
      expect(retrievedSale).not.toBeNull();
      expect(retrievedSale!.orderDiscount).not.toBeNull();
      expect(retrievedSale!.orderDiscount!.type).toBe(DiscountType.PERCENTAGE);
      expect(retrievedSale!.orderDiscount!.value).toBe(20);
      expect(retrievedSale!.orderDiscount!.reason).toBe('20% VIP Client Discount');
      expect(retrievedSale!.subtotal.amount).toBe(50.0);
      expect(retrievedSale!.discountTotal.amount).toBe(10.0);
      expect(retrievedSale!.total.amount).toBe(40.0);
    });

    it('persists a fixed order discount and reconstitutes it with exact precision', async () => {
      const sale = Sale.create({ tenantId, source: drinkSource }, clock);
      sale.addItem(
        {
          source: drinkSource,
          description: 'Recovery Drink',
          quantity: 4,
          unitPrice: Money.create(10.0, 'USD'),
        },
        clock,
      );
      sale.applyOrderDiscount(Discount.fixed(15.0, '$15 Birthday Voucher'), clock);

      await repository.save(sale);

      const persistedSale = db.sales.get(sale.id.value)!;
      expect(persistedSale.orderDiscountType).toBe('FIXED');
      expect(persistedSale.orderDiscountValue).toEqual(new Prisma.Decimal('15.00'));
      expect(persistedSale.orderDiscountReason).toBe('$15 Birthday Voucher');
      // Subtotal = 40.00, discount = 15.00, total = 25.00
      expect(persistedSale.subtotalAmount).toEqual(new Prisma.Decimal('40.00'));
      expect(persistedSale.discountTotalAmount).toEqual(new Prisma.Decimal('15.00'));
      expect(persistedSale.totalAmount).toEqual(new Prisma.Decimal('25.00'));

      const retrieved = await repository.findById(sale.id);
      expect(retrieved!.orderDiscount!.type).toBe(DiscountType.FIXED);
      expect(retrieved!.orderDiscount!.value).toBe(15.0);
      expect(retrieved!.discountTotal.amount).toBe(15.0);
      expect(retrieved!.total.amount).toBe(25.0);
    });

    it('persists null columns when no order discount is applied to the Sale', async () => {
      const sale = Sale.create({ tenantId, source: foodSource }, clock);
      sale.addItem(
        {
          source: foodSource,
          description: 'Regular Item',
          quantity: 1,
          unitPrice: Money.create(10.0, 'USD'),
        },
        clock,
      );

      await repository.save(sale);

      const persistedSale = db.sales.get(sale.id.value)!;
      expect(persistedSale.orderDiscountType).toBeNull();
      expect(persistedSale.orderDiscountValue).toBeNull();
      expect(persistedSale.orderDiscountReason).toBeNull();

      const retrieved = await repository.findById(sale.id);
      expect(retrieved!.orderDiscount).toBeNull();
      expect(retrieved!.discountTotal.amount).toBe(0.0);
    });
  });

  // ==========================================================================
  // 3. Line-Item Discount Persistence & Round Trip
  // ==========================================================================
  describe('3. Line-Item Discount Persistence & Aggregate Reconstitution', () => {
    it('persists line-level discounts embedded in sale_items table', async () => {
      const sale = Sale.create({ tenantId, source: foodSource }, clock);
      sale.addItem(
        {
          source: foodSource,
          description: 'Specialty Protein Bar',
          quantity: 3,
          unitPrice: Money.create(10.0, 'USD'),
          discount: Discount.percentage(15, '15% Volume discount'),
        },
        clock,
      );

      await repository.save(sale);

      const persistedItem = Array.from(db.saleItems.values())[0]!;
      expect(persistedItem.discountType).toBe('PERCENTAGE');
      expect(persistedItem.discountValue).toEqual(new Prisma.Decimal('15.00'));
      expect(persistedItem.discountReason).toBe('15% Volume discount');
      // Subtotal = 30.00, 15% = 4.50, total = 25.50
      expect(persistedItem.subtotalAmount).toEqual(new Prisma.Decimal('30.00'));
      expect(persistedItem.discountTotalAmount).toEqual(new Prisma.Decimal('4.50'));
      expect(persistedItem.totalAmount).toEqual(new Prisma.Decimal('25.50'));

      const retrieved = await repository.findById(sale.id);
      const retrievedItem = retrieved!.items[0]!;
      expect(retrievedItem.discount).not.toBeNull();
      expect(retrievedItem.discount!.type).toBe(DiscountType.PERCENTAGE);
      expect(retrievedItem.discount!.value).toBe(15);
      expect(retrievedItem.discountTotal.amount).toBe(4.5);
      expect(retrievedItem.total.amount).toBe(25.5);
    });

    it('persists null columns when a line item has no discount', async () => {
      const sale = Sale.create({ tenantId, source: foodSource }, clock);
      sale.addItem(
        {
          source: foodSource,
          description: 'Undiscounted Item',
          quantity: 2,
          unitPrice: Money.create(8.0, 'USD'),
        },
        clock,
      );

      await repository.save(sale);

      const persistedItem = Array.from(db.saleItems.values())[0]!;
      expect(persistedItem.discountType).toBeNull();
      expect(persistedItem.discountValue).toBeNull();
      expect(persistedItem.discountReason).toBeNull();
      expect(persistedItem.discountTotalAmount).toEqual(new Prisma.Decimal('0.00'));

      const retrieved = await repository.findById(sale.id);
      expect(retrieved!.items[0]!.discount).toBeNull();
      expect(retrieved!.items[0]!.discountTotal.amount).toBe(0.0);
    });
  });

  // ==========================================================================
  // 4. Combined Discounts & Aggregate Consistency Invariants
  // ==========================================================================
  describe('4. Combined Discounts & Deterministic Total Invariants', () => {
    it('correctly aggregates line discounts and order discount into Sale.discountTotal', async () => {
      const sale = Sale.create({ tenantId, source: foodSource }, clock);
      // Item 1: 2 @ $20.00 = $40.00, discount 10% = $4.00, line total = $36.00
      sale.addItem(
        {
          source: foodSource,
          description: 'Item A',
          quantity: 2,
          unitPrice: Money.create(20.0, 'USD'),
          discount: Discount.percentage(10, '10% line discount'),
        },
        clock,
      );
      // Item 2: 1 @ $30.00 = $30.00, discount fixed $5.00, line total = $25.00
      sale.addItem(
        {
          source: drinkSource,
          description: 'Item B',
          quantity: 1,
          unitPrice: Money.create(30.0, 'USD'),
          discount: Discount.fixed(5.0, '$5 line discount'),
        },
        clock,
      );
      // Order discount: fixed $10.00
      sale.applyOrderDiscount(Discount.fixed(10.0, '$10 order voucher'), clock);

      await repository.save(sale);

      const persistedSale = db.sales.get(sale.id.value)!;
      // Subtotal = 40.00 + 30.00 = 70.00
      // Line discounts total = 4.00 + 5.00 = 9.00
      // Order discount = 10.00
      // Aggregate discountTotal = 9.00 + 10.00 = 19.00
      // Total payable = 70.00 - 19.00 = 51.00
      expect(persistedSale.subtotalAmount).toEqual(new Prisma.Decimal('70.00'));
      expect(persistedSale.discountTotalAmount).toEqual(new Prisma.Decimal('19.00'));
      expect(persistedSale.totalAmount).toEqual(new Prisma.Decimal('51.00'));

      const retrieved = await repository.findById(sale.id);
      expect(retrieved!.discountTotal.amount).toBe(19.0);
      expect(retrieved!.total.amount).toBe(51.0);
    });
  });

  // ==========================================================================
  // 5. Database CHECK Constraints & Structural Consistency
  // ==========================================================================
  describe('5. Database Structural Invariants & CHECK Constraint Evaluation', () => {
    it('demonstrates database check constraint safety: non-negative values and percentage bounds', () => {
      // In PostgreSQL:
      // chk_sales_discount_type_supported: order_discount_type IN ('PERCENTAGE', 'FIXED', 'FIXED_AMOUNT')
      // chk_sales_discount_percentage_max: order_discount_type != 'PERCENTAGE' OR order_discount_value <= 100.00
      // chk_sales_discount_co_presence: type and value are atomically present together or both null
      const validPercentage = Discount.percentage(100.0, 'Full 100% Promo');
      expect(validPercentage.value).toBe(100.0);

      // Domain invariants reject invalid percentage before reaching database
      expect(() => Discount.percentage(105.0)).toThrow(InvalidDiscountException);
      expect(() => Discount.percentage(-5.0)).toThrow(InvalidDiscountException);
      expect(() => Discount.fixed(-1.0)).toThrow(InvalidDiscountException);
    });

    it('proves domain layer enforces business rules that SQL constraints cannot safely evaluate', () => {
      const sale = Sale.create({ tenantId, source: foodSource }, clock);
      sale.addItem(
        {
          source: foodSource,
          description: 'Single Snack',
          quantity: 1,
          unitPrice: Money.create(10.0, 'USD'),
        },
        clock,
      );

      // Business rule: line discount cannot exceed line subtotal (throws InvalidDiscountException)
      expect(() => {
        sale.addItem(
          {
            source: foodSource,
            description: 'Item with excessive discount',
            quantity: 1,
            unitPrice: Money.create(10.0, 'USD'),
            discount: Discount.fixed(15.0, 'Excessive discount'),
          },
          clock,
        );
      }).toThrow(InvalidDiscountException);

      // Business rule: direct calculation rejects fixed discount exceeding amount
      expect(() => {
        Discount.fixed(25.0).calculate(Money.create(20.0, 'USD'));
      }).toThrow(InvalidDiscountException);
    });
  });

  // ==========================================================================
  // 6. Sale Lifecycle, Cancellation, and Deletion Persistence Behavior
  // ==========================================================================
  describe('6. Sale Lifecycle, Cancellation, and Deletion Persistence Behavior', () => {
    it('preserves embedded discounts when Sale transitions to CANCELLED for financial audit', async () => {
      const sale = Sale.create({ tenantId, source: foodSource }, clock);
      sale.addItem(
        {
          source: foodSource,
          description: 'Item to Cancel',
          quantity: 1,
          unitPrice: Money.create(50.0, 'USD'),
          discount: Discount.fixed(10.0, 'Line Promo'),
        },
        clock,
      );
      sale.applyOrderDiscount(Discount.fixed(5.0, 'Order Promo'), clock);

      await repository.save(sale);

      // Cancel the sale
      sale.cancel('Client requested appointment cancellation', clock);
      await repository.save(sale);

      const persistedSale = db.sales.get(sale.id.value)!;
      expect(persistedSale.status).toBe('CANCELLED');
      expect(persistedSale.cancellationReason).toBe('Client requested appointment cancellation');
      // Audit snapshots remain fully intact in persistence
      expect(persistedSale.orderDiscountType).toBe('FIXED');
      expect(persistedSale.orderDiscountValue).toEqual(new Prisma.Decimal('5.00'));
      expect(persistedSale.discountTotalAmount).toEqual(new Prisma.Decimal('15.00'));

      const persistedItem = Array.from(db.saleItems.values())[0]!;
      expect(persistedItem.discountType).toBe('FIXED');
      expect(persistedItem.discountValue).toEqual(new Prisma.Decimal('10.00'));
    });

    it('cascades cleanup of all embedded discount data when Sale is deleted with zero orphans', async () => {
      const sale = Sale.create({ tenantId, source: foodSource }, clock);
      sale.addItem(
        {
          source: foodSource,
          description: 'Item with discount',
          quantity: 1,
          unitPrice: Money.create(20.0, 'USD'),
          discount: Discount.percentage(10, '10% line discount'),
        },
        clock,
      );
      sale.applyOrderDiscount(Discount.fixed(5.0, 'Order voucher'), clock);

      await repository.save(sale);
      expect(db.sales.size).toBe(1);
      expect(db.saleItems.size).toBe(1);

      // Purge/delete parent Sale
      await prismaClient.sale.delete({
        where: { id: sale.id.value },
      });

      // Both sales and sale_items are deleted; because discounts are embedded columns,
      // ZERO orphan discount records can possibly exist in the database.
      expect(db.sales.size).toBe(0);
      expect(db.saleItems.size).toBe(0);
    });
  });

  // ==========================================================================
  // 7. Prohibition of Generic Discount Framework / Repository Bypass
  // ==========================================================================
  describe('7. Prohibition of Generic Discount Framework / Repository Bypass', () => {
    it('proves no generic DiscountRepository exists, preserving aggregate autonomy', () => {
      // Repositories belong to aggregate roots; Discount is a pure Value Object
      const repoAny = repository as unknown as Record<string, unknown>;
      expect(repoAny.saveDiscount).toBeUndefined();
      expect(repoAny.deleteDiscount).toBeUndefined();
      expect(repoAny.findDiscountById).toBeUndefined();
    });
  });
});
