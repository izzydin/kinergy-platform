import { Money } from '../value-objects/money.vo';
import { Discount } from '../value-objects/discount.vo';
import { Sale } from '../sale.aggregate';
import { SaleItem } from '../entities/sale-item.entity';
import { SourceReference } from '../value-objects/source-reference.vo';
import { SourceType } from '../enums/source-type.enum';
import { InvalidDiscountException } from '../exceptions/invalid-discount.exception';
import { SaleAlreadyFinalizedException } from '../exceptions/sale-already-finalized.exception';

describe('Milestone 7.4 Monetary Precision & Determinism Safety Net', () => {
  describe('1. Mandatory IEEE 754 Binary Floating-Point Pitfall Proofs', () => {
    it('proves 0.1 + 0.2 equals exactly 0.30 (30 cents), whereas JavaScript number arithmetic drifts', () => {
      // Classic IEEE 754 floating-point drift proof:
      const jsFloatSum = 0.1 + 0.2;
      expect(jsFloatSum).not.toBe(0.3); // 0.30000000000000004 in IEEE 754
      expect(jsFloatSum).toBe(0.30000000000000004);

      // Money value object exactness:
      const m1 = Money.create(0.1, 'USD');
      const m2 = Money.create(0.2, 'USD');
      const sum = m1.add(m2);

      expect(sum.cents).toBe(30);
      expect(sum.amount).toBe(0.3);
      expect(sum.toString()).toBe('0.30 USD');
      expect(sum.equals(Money.create(0.3, 'USD'))).toBe(true);

      // Prove that replacing Money arithmetic with JS float addition fails our assertion:
      const unsafeFloatResult = m1.amount + m2.amount;
      expect(unsafeFloatResult === 0.3).toBe(false); // Unsafe float addition fails
    });

    it('proves 0.7 + 0.1 equals exactly 0.80 (80 cents), whereas JavaScript number arithmetic drifts', () => {
      const jsFloatSum = 0.7 + 0.1;
      expect(jsFloatSum).not.toBe(0.8); // 0.7999999999999999 in IEEE 754
      expect(jsFloatSum).toBe(0.7999999999999999);

      const m1 = Money.create(0.7, 'USD');
      const m2 = Money.create(0.1, 'USD');
      const sum = m1.add(m2);

      expect(sum.cents).toBe(80);
      expect(sum.amount).toBe(0.8);
      expect(sum.toString()).toBe('0.80 USD');
      expect(sum.equals(Money.create(0.8, 'USD'))).toBe(true);
    });

    it('proves 1.00 - 0.90 equals exactly 0.10 (10 cents), whereas JavaScript number arithmetic drifts', () => {
      const jsFloatDiff = 1.0 - 0.9;
      expect(jsFloatDiff).not.toBe(0.1); // 0.09999999999999998 in IEEE 754
      expect(jsFloatDiff).toBe(0.09999999999999998);

      const m1 = Money.create(1.0, 'USD');
      const m2 = Money.create(0.9, 'USD');
      const diff = m1.subtract(m2);

      expect(diff.cents).toBe(10);
      expect(diff.amount).toBe(0.1);
      expect(diff.toString()).toBe('0.10 USD');
      expect(diff.equals(Money.create(0.1, 'USD'))).toBe(true);
    });

    it('proves 0.29 * 100 equals exactly 29 cents, avoiding binary conversion truncation', () => {
      // In raw JS: 0.29 * 100 = 28.999999999999996 -> Math.floor would turn this into 28 cents!
      const jsProduct = 0.29 * 100;
      expect(jsProduct).not.toBe(29);
      expect(Math.floor(jsProduct)).toBe(28); // The classic banking vulnerability

      // Money parses 0.29 to exact 29 cents
      const m = Money.create(0.29, 'USD');
      expect(m.cents).toBe(29);
      expect(m.amount).toBe(0.29);
    });

    it('proves 0.14 * 100 equals exactly 14 cents, avoiding binary conversion drift', () => {
      // In raw JS: 0.14 * 100 = 14.000000000000002
      const jsProduct = 0.14 * 100;
      expect(jsProduct).not.toBe(14);

      const m = Money.create(0.14, 'USD');
      expect(m.cents).toBe(14);
      expect(m.amount).toBe(0.14);
    });

    it('proves fractional quantity item multiplication (2.5 units @ $19.99) rounds Half-Up to $49.98', () => {
      // 2.5 * 19.99 = 49.975 exactly
      // Half-Up commercial rounding rule mandates rounding .005 up to .01 -> $49.98 (cents: 4998)
      const unitPrice = Money.create(19.99, 'USD');
      const lineTotal = unitPrice.multiply(2.5);

      expect(lineTotal.cents).toBe(4998);
      expect(lineTotal.amount).toBe(49.98);
      expect(lineTotal.toString()).toBe('49.98 USD');
    });
  });

  describe('2. Commercial Half-Up Rounding Boundary Proofs', () => {
    it('rounds exact half-boundary (.005) upwards to the next cent', () => {
      // 10% discount on $49.98 = $4.998 -> rounds up to $5.00 (500 cents)
      const discount = Discount.percentage(10);
      const reduction = discount.calculateReduction(Money.create(49.98, 'USD'));
      expect(reduction.cents).toBe(500);
      expect(reduction.amount).toBe(5.0);
    });

    it('rounds values immediately below boundary (e.g. 4.49% on $1.00 = 4.49 cents) downwards to 4 cents', () => {
      // 100 cents * 4.49% = 4.49 cents -> Math.round(4.49) = 4 cents ($0.04)
      const discount = Discount.percentage(4.49);
      const reduction = discount.calculateReduction(Money.create(1.0, 'USD'));
      expect(reduction.cents).toBe(4);
      expect(reduction.amount).toBe(0.04);
    });

    it('rounds values exactly at half boundary (4.50% on $1.00 = 4.50 cents) upwards to 5 cents', () => {
      // 100 cents * 4.50% = 4.50 cents -> Half-Up rounds to 5 cents ($0.05)
      const discount = Discount.percentage(4.5);
      const reduction = discount.calculateReduction(Money.create(1.0, 'USD'));
      expect(reduction.cents).toBe(5);
      expect(reduction.amount).toBe(0.05);
    });

    it('rounds values immediately above boundary (4.51% on $1.00 = 4.51 cents) upwards to 5 cents', () => {
      // 100 cents * 4.51% = 4.51 cents -> Half-Up rounds to 5 cents ($0.05)
      const discount = Discount.percentage(4.51);
      const reduction = discount.calculateReduction(Money.create(1.0, 'USD'));
      expect(reduction.cents).toBe(5);
      expect(reduction.amount).toBe(0.05);
    });

    it('verifies exact percentage discount rounding boundaries across multiple standard commercial rates', () => {
      const base = Money.create(100.0, 'USD');

      // 5% of 100 = 5.00
      expect(Discount.percentage(5).calculateReduction(base).cents).toBe(500);
      // 12.5% of 100 = 12.50
      expect(Discount.percentage(12.5).calculateReduction(base).cents).toBe(1250);
      // 33.33% of 100 = 33.33
      expect(Discount.percentage(33.33).calculateReduction(base).cents).toBe(3333);
      // 33.335% of 100 = 33.34
      expect(Discount.percentage(33.335).calculateReduction(base).cents).toBe(3334);
    });
  });

  describe('3. Core Financial Formula & Invariant Proofs', () => {
    it('proves subtotal = Σ(quantity × unitPrice), discountTotal = Σ(discounts), total = subtotal - discountTotal', () => {
      const sale = Sale.create({
        currency: 'USD',
        source: SourceReference.create({
          sourceType: SourceType.INVENTORY_ITEM,
          sourceId: 'src_1',
        }),
      });

      // Item 1: 3 @ 10.00 = 30.00 (cents: 3000), 10% disc = 3.00 (cents: 300), net = 27.00
      sale.addItem({
        source: SourceReference.create({ sourceType: SourceType.INVENTORY_ITEM, sourceId: 'p1' }),
        description: 'Item 1',
        quantity: 3,
        unitPrice: Money.create(10.0, 'USD'),
        discount: Discount.percentage(10),
      });

      // Item 2: 2 @ 25.00 = 50.00 (cents: 5000), fixed disc = 5.00 (cents: 500), net = 45.00
      sale.addItem({
        source: SourceReference.create({ sourceType: SourceType.INVENTORY_ITEM, sourceId: 'p2' }),
        description: 'Item 2',
        quantity: 2,
        unitPrice: Money.create(25.0, 'USD'),
        discount: Discount.fixed(5.0),
      });

      // Subtotal = 30.00 + 50.00 = 80.00 (cents: 8000)
      // Line discounts = 3.00 + 5.00 = 8.00 (cents: 800)
      // Net pre-order discount = 80.00 - 8.00 = 72.00 (cents: 7200)
      expect(sale.subtotal.cents).toBe(8000);
      expect(sale.discountTotal.cents).toBe(800);
      expect(sale.total.cents).toBe(7200);

      // Apply Order Discount: 10% on remaining net (72.00) = 7.20 (cents: 720)
      sale.applyOrderDiscount(Discount.percentage(10));

      // Total discount = 8.00 (line) + 7.20 (order) = 15.20 (cents: 1520)
      // Total = 80.00 - 15.20 = 64.80 (cents: 6480)
      expect(sale.subtotal.cents).toBe(8000);
      expect(sale.discountTotal.cents).toBe(1520);
      expect(sale.total.cents).toBe(6480);

      // Verify exact mathematical formula invariants:
      expect(sale.total.equals(sale.subtotal.subtract(sale.discountTotal))).toBe(true);
    });

    it('proves subtotal >= 0, discountTotal >= 0, total >= 0 across randomized commercial permutations', () => {
      const currencies = ['USD', 'EUR', 'CAD'];

      for (let iteration = 0; iteration < 100; iteration++) {
        const currency = currencies[iteration % currencies.length]!;
        const sale = Sale.create({
          currency,
          source: SourceReference.create({
            sourceType: SourceType.INVENTORY_ITEM,
            sourceId: `seed_${iteration}`,
          }),
        });

        // Add 1-5 randomized items
        const numItems = (iteration % 5) + 1;
        for (let i = 0; i < numItems; i++) {
          const qty = ((i * 3 + iteration) % 10) + 0.5; // 0.5 to 9.5
          const price = ((i * 17 + iteration * 13) % 100) + 1.25; // > 0
          const hasDiscount = (i + iteration) % 3 === 0;
          const discount = hasDiscount
            ? Discount.percentage((iteration * 7) % 50) // 0 to 49%
            : null;

          sale.addItem({
            source: SourceReference.create({
              sourceType: SourceType.INVENTORY_ITEM,
              sourceId: `item_${i}`,
            }),
            description: `Random Item ${i}`,
            quantity: qty,
            unitPrice: Money.create(price, currency),
            discount,
          });
        }

        // Invariant checks on every step
        expect(sale.subtotal.cents).toBeGreaterThanOrEqual(0);
        expect(sale.discountTotal.cents).toBeGreaterThanOrEqual(0);
        expect(sale.total.cents).toBeGreaterThanOrEqual(0);
        expect(sale.total.cents).toBe(sale.subtotal.cents - sale.discountTotal.cents);
      }
    });

    it('proves exact zero total when 100% order discount is applied', () => {
      const sale = Sale.create({
        currency: 'USD',
        source: SourceReference.create({
          sourceType: SourceType.INVENTORY_ITEM,
          sourceId: 'free_pass',
        }),
      });
      sale.addItem({
        source: SourceReference.create({ sourceType: SourceType.INVENTORY_ITEM, sourceId: 'p1' }),
        description: 'Trial Session',
        quantity: 1,
        unitPrice: Money.create(50.0, 'USD'),
      });

      sale.applyOrderDiscount(Discount.percentage(100));

      expect(sale.subtotal.cents).toBe(5000);
      expect(sale.discountTotal.cents).toBe(5000);
      expect(sale.total.cents).toBe(0);
      expect(sale.total.isZero()).toBe(true);
    });

    it('strictly forbids excessive fixed discount exceeding line subtotal via InvalidDiscountException', () => {
      const sale = Sale.create({
        currency: 'USD',
        source: SourceReference.create({
          sourceType: SourceType.INVENTORY_ITEM,
          sourceId: 'excessive_disc_test',
        }),
      });

      expect(() => {
        sale.addItem({
          source: SourceReference.create({ sourceType: SourceType.INVENTORY_ITEM, sourceId: 'p1' }),
          description: 'Snack Bar',
          quantity: 1,
          unitPrice: Money.create(10.0, 'USD'),
          discount: Discount.fixed(50.0), // $50 discount on $10 item!
        });
      }).toThrow(InvalidDiscountException);

      // Verify sale remains uncorrupted
      expect(sale.itemCount).toBe(0);
      expect(sale.total.cents).toBe(0);
    });
  });

  describe('4. Determinism Proof (1,000 Iteration Consistency)', () => {
    it('produces bitwise and formatted identical totals over 1,000 identical calculations', () => {
      const runCalculation = () => {
        const sale = Sale.create({
          currency: 'USD',
          source: SourceReference.create({
            sourceType: SourceType.INVENTORY_ITEM,
            sourceId: 'det_test',
          }),
        });

        // 3 items with fractional quantities and discounts
        sale.addItem({
          source: SourceReference.create({ sourceType: SourceType.INVENTORY_ITEM, sourceId: 'i1' }),
          description: 'Creatine Monohydrate',
          quantity: 2.75,
          unitPrice: Money.create(29.99, 'USD'),
          discount: Discount.percentage(15),
        });

        sale.addItem({
          source: SourceReference.create({ sourceType: SourceType.INVENTORY_ITEM, sourceId: 'i2' }),
          description: 'Lifting Straps',
          quantity: 1,
          unitPrice: Money.create(14.5, 'USD'),
          discount: Discount.fixed(2.5),
        });

        sale.addItem({
          source: SourceReference.create({ sourceType: SourceType.INVENTORY_ITEM, sourceId: 'i3' }),
          description: 'Electrolyte Pack',
          quantity: 5,
          unitPrice: Money.create(3.25, 'USD'),
        });

        sale.applyOrderDiscount(Discount.percentage(10));

        return {
          subtotalCents: sale.subtotal.cents,
          discountTotalCents: sale.discountTotal.cents,
          totalCents: sale.total.cents,
          formattedTotal: sale.total.toString(),
        };
      };

      const baseline = runCalculation();

      for (let i = 0; i < 1000; i++) {
        const current = runCalculation();
        expect(current.subtotalCents).toBe(baseline.subtotalCents);
        expect(current.discountTotalCents).toBe(baseline.discountTotalCents);
        expect(current.totalCents).toBe(baseline.totalCents);
        expect(current.formattedTotal).toBe(baseline.formattedTotal);
      }
    });
  });

  describe('5. Mutation Regression & Lifecycle Consistency', () => {
    it('proves that any change to quantity, price, or discounts immediately updates totals with zero stale values', () => {
      const sale = Sale.create({
        currency: 'USD',
        source: SourceReference.create({
          sourceType: SourceType.INVENTORY_ITEM,
          sourceId: 'mutation_test',
        }),
      });

      // 1. Initial item
      const item = sale.addItem({
        source: SourceReference.create({ sourceType: SourceType.INVENTORY_ITEM, sourceId: 'm1' }),
        description: 'BCAA Powder',
        quantity: 1,
        unitPrice: Money.create(20.0, 'USD'),
      });
      expect(sale.total.cents).toBe(2000);

      // 2. Quantity change
      sale.updateItemQuantity(item.id, 3);
      expect(sale.total.cents).toBe(6000);

      // 3. Apply item discount
      sale.applyItemDiscount(item.id, Discount.fixed(10.0));
      expect(sale.total.cents).toBe(5000);

      // 4. Remove item discount
      sale.removeItemDiscount(item.id);
      expect(sale.total.cents).toBe(6000);

      // 5. Apply order discount
      sale.applyOrderDiscount(Discount.percentage(50));
      expect(sale.total.cents).toBe(3000);

      // 6. Remove order discount
      sale.removeOrderDiscount();
      expect(sale.total.cents).toBe(6000);

      // 7. Remove item
      sale.removeItem(item.id);
      expect(sale.subtotal.cents).toBe(0);
      expect(sale.total.cents).toBe(0);
    });

    it('proves that finalized sales permanently reject mutations (commercial lock)', () => {
      const sale = Sale.create({
        currency: 'USD',
        source: SourceReference.create({
          sourceType: SourceType.INVENTORY_ITEM,
          sourceId: 'lock_test',
        }),
      });
      const item = sale.addItem({
        source: SourceReference.create({ sourceType: SourceType.INVENTORY_ITEM, sourceId: 'l1' }),
        description: 'Towel',
        quantity: 1,
        unitPrice: Money.create(5.0, 'USD'),
      });

      sale.finalize();

      expect(() =>
        sale.addItem({
          source: SourceReference.create({ sourceType: SourceType.INVENTORY_ITEM, sourceId: 'l2' }),
          description: 'Lock',
          quantity: 1,
          unitPrice: Money.create(10.0, 'USD'),
        }),
      ).toThrow(SaleAlreadyFinalizedException);

      expect(() => sale.updateItemQuantity(item.id, 2)).toThrow(SaleAlreadyFinalizedException);
      expect(() => sale.applyItemDiscount(item.id, Discount.fixed(1.0))).toThrow(
        SaleAlreadyFinalizedException,
      );
      expect(() => sale.applyOrderDiscount(Discount.percentage(10))).toThrow(
        SaleAlreadyFinalizedException,
      );
      expect(() => sale.removeItem(item.id)).toThrow(SaleAlreadyFinalizedException);
    });
  });

  describe('6. Reconstitution Integrity Law', () => {
    it('throws InvalidSaleStateException if persisted totals differ from recalculation by even 1 cent', () => {
      const item = SaleItem.create({
        source: SourceReference.create({ sourceType: SourceType.INVENTORY_ITEM, sourceId: 'r1' }),
        description: 'Water Bottle',
        quantity: 1,
        unitPrice: Money.create(10.0, 'USD'),
      });

      // Invariant: Subtotal of 1 @ 10.00 is exactly 10.00 USD (1000 cents).
      // If persisted snapshot is 10.01 USD (1001 cents), reconstitution MUST fail.
      const dummySale = Sale.create({
        currency: 'USD',
        source: SourceReference.create({
          sourceType: SourceType.INVENTORY_ITEM,
          sourceId: 'rec_test',
        }),
      });

      expect(() => {
        Sale.reconstitute({
          id: dummySale.id,
          currency: 'USD',
          status: dummySale.status,
          source: dummySale.source,
          items: [item],
          subtotal: Money.create(10.01, 'USD'), // Stale/corrupted by 1 cent!
          discountTotal: Money.zero('USD'),
          total: Money.create(10.01, 'USD'),
          version: 1,
          createdAt: new Date(),
          updatedAt: new Date(),
        });
      }).toThrow(/does not reconcile/);
    });
  });
});
