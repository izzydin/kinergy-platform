/**
 * Comprehensive Architectural & Domain Test Suite for Sale-SaleItem Integration.
 *
 * Demonstrates:
 * 1. Sale aggregate root exclusive ownership of SaleItem child entities.
 * 2. Collection protection and anti-tampering (frozen arrays, frozen entities).
 * 3. Immediate and synchronous totals synchronization on all item operations.
 * 4. Empty Sale semantics (DRAFT permits zero items, finalization forbids zero items).
 * 5. Failure atomicity (zero state change if any item operation fails validation).
 * 6. Post-finalization freezing of all commercial terms and child entities.
 */

import { Sale } from '../sale.aggregate';
import { SaleItem } from '../entities/sale-item.entity';
import { SaleStatus } from '../enums/sale-status.enum';
import { SourceType } from '../enums/source-type.enum';
import { SourceReference } from '../value-objects/source-reference.vo';
import { SaleItemId } from '../value-objects/sale-item-id.vo';
import { Money } from '../value-objects/money.vo';
import { Discount } from '../value-objects/discount.vo';
import { Clock } from '../shared/clock';
import {
  EmptySaleException,
  SaleAlreadyFinalizedException,
  InvalidSaleStateException,
  InvalidSaleTransitionException,
  InvalidSaleItemException,
} from '../exceptions';

class TestClock implements Clock {
  constructor(private currentTime: Date) {}
  public now(): Date {
    return new Date(this.currentTime.getTime());
  }
  public advanceBy(ms: number): void {
    this.currentTime = new Date(this.currentTime.getTime() + ms);
  }
  public set(time: Date): void {
    this.currentTime = new Date(time.getTime());
  }
}

interface SaleSnapshot {
  status: SaleStatus;
  version: number;
  subtotal: number;
  discountTotal: number;
  total: number;
  itemCount: number;
  items: Array<{ id: string; quantity: number; subtotal: number; total: number }>;
  orderDiscount: string | null;
  updatedAt: number;
  eventsCount: number;
}

function takeSnapshot(sale: Sale): SaleSnapshot {
  return {
    status: sale.status,
    version: sale.version,
    subtotal: sale.subtotal.amount,
    discountTotal: sale.discountTotal.amount,
    total: sale.total.amount,
    itemCount: sale.itemCount,
    items: sale.items.map((i) => ({
      id: i.id.value,
      quantity: i.quantity,
      subtotal: i.subtotal.amount,
      total: i.total.amount,
    })),
    orderDiscount: sale.orderDiscount ? sale.orderDiscount.toString() : null,
    updatedAt: sale.updatedAt.getTime(),
    eventsCount: sale.getUncommittedEvents().length,
  };
}

function assertSnapshotUnchanged(sale: Sale, before: SaleSnapshot): void {
  const after = takeSnapshot(sale);
  expect(after.status).toBe(before.status);
  expect(after.version).toBe(before.version);
  expect(after.subtotal).toBe(before.subtotal);
  expect(after.discountTotal).toBe(before.discountTotal);
  expect(after.total).toBe(before.total);
  expect(after.itemCount).toBe(before.itemCount);
  expect(after.items).toEqual(before.items);
  expect(after.orderDiscount).toBe(before.orderDiscount);
  expect(after.updatedAt).toBe(before.updatedAt);
  expect(after.eventsCount).toBe(before.eventsCount);
}

describe('Sale & SaleItem Aggregate Integration Contract', () => {
  const t0 = new Date('2026-09-17T12:00:00.000Z');
  let clock: TestClock;

  const validSource = SourceReference.create({
    sourceType: SourceType.INVENTORY_ITEM,
    sourceId: 'inv-item-001',
    sourceCode: 'SHAKE-01',
  });

  const altSource = SourceReference.create({
    sourceType: SourceType.TREATMENT_SESSION,
    sourceId: 'session-pt-001',
  });

  beforeEach(() => {
    clock = new TestClock(t0);
  });

  describe('1. Collection Ownership & Protection', () => {
    it('protects internal collection from direct manipulation via sale.items', () => {
      const sale = Sale.create({ source: validSource }, clock);
      sale.addItem({
        source: validSource,
        description: 'Protein Shake',
        quantity: 1,
        unitPrice: Money.create(5.0, 'USD'),
      });

      const exposedItems = sale.items as unknown as SaleItem[];
      expect(Object.isFrozen(exposedItems)).toBe(true);
      expect(() => {
        exposedItems.push({} as unknown as SaleItem);
      }).toThrow();
    });

    it('ensures individual SaleItem instances returned are immutable and frozen', () => {
      const sale = Sale.create({ source: validSource }, clock);
      const item = sale.addItem({
        source: validSource,
        description: 'Protein Bar',
        quantity: 2,
        unitPrice: Money.create(3.0, 'USD'),
      });

      expect(Object.isFrozen(item)).toBe(true);

      // Mutating withers return detached copies and do not affect the parent aggregate
      const detachedItem = item.withQuantity(10);
      expect(detachedItem.quantity).toBe(10);
      expect(sale.getItem(item.id)?.quantity).toBe(2);
      expect(sale.total.amount).toBe(6.0); // Not 30.0
    });

    it('provides domain query operations (getItem, hasItem, itemCount)', () => {
      const sale = Sale.create({ source: validSource }, clock);
      expect(sale.itemCount).toBe(0);
      expect(sale.hasItem('non_existent')).toBe(false);
      expect(sale.getItem('non_existent')).toBeUndefined();

      const item = sale.addItem({
        source: validSource,
        description: 'Gym Towel',
        quantity: 1,
        unitPrice: Money.create(12.0, 'USD'),
      });

      expect(sale.itemCount).toBe(1);
      expect(sale.hasItem(item.id)).toBe(true);
      expect(sale.hasItem(item.id.value)).toBe(true);
      expect(sale.hasItem('')).toBe(false);

      const queried = sale.getItem(item.id);
      expect(queried).toBeDefined();
      expect(queried!.id.equals(item.id)).toBe(true);
      expect(queried!.description).toBe('Gym Towel');
      expect(sale.getItem('')).toBeUndefined();
    });
  });

  describe('2. Immediate & Synchronous Totals Synchronization', () => {
    it('synchronously updates subtotal, discountTotal, and total on every item addition', () => {
      const sale = Sale.create({ source: validSource }, clock);
      expect(sale.subtotal.amount).toBe(0.0);
      expect(sale.discountTotal.amount).toBe(0.0);
      expect(sale.total.amount).toBe(0.0);

      // Add item 1: 2 * $25.00 = $50.00
      sale.addItem({
        source: validSource,
        description: 'Shirt',
        quantity: 2,
        unitPrice: Money.create(25.0, 'USD'),
      });
      expect(sale.subtotal.amount).toBe(50.0);
      expect(sale.discountTotal.amount).toBe(0.0);
      expect(sale.total.amount).toBe(50.0);

      // Add item 2: 1 * $40.00 with 10% discount ($4.00) = $36.00
      sale.addItem({
        source: validSource,
        description: 'Shorts',
        quantity: 1,
        unitPrice: Money.create(40.0, 'USD'),
        discount: Discount.percentage(10, '10% member discount'),
      });
      expect(sale.subtotal.amount).toBe(90.0);
      expect(sale.discountTotal.amount).toBe(4.0);
      expect(sale.total.amount).toBe(86.0);
    });

    it('synchronously updates totals when item quantity is modified', () => {
      const sale = Sale.create({ source: validSource }, clock);
      const item = sale.addItem({
        source: validSource,
        description: 'Socks',
        quantity: 1,
        unitPrice: Money.create(10.0, 'USD'),
        discount: Discount.fixedAmount(2.0, 'Promo'),
      });

      expect(sale.subtotal.amount).toBe(10.0);
      expect(sale.discountTotal.amount).toBe(2.0);
      expect(sale.total.amount).toBe(8.0);

      // Increase quantity to 3 -> subtotal $30.00, discount $2.00, total $28.00
      sale.updateItemQuantity(item.id, 3);
      expect(sale.subtotal.amount).toBe(30.0);
      expect(sale.discountTotal.amount).toBe(2.0);
      expect(sale.total.amount).toBe(28.0);
    });

    it('synchronously updates totals when item discount is applied or removed', () => {
      const sale = Sale.create({ source: validSource }, clock);
      const item = sale.addItem({
        source: validSource,
        description: 'Massage Oil',
        quantity: 2,
        unitPrice: Money.create(20.0, 'USD'),
      });

      expect(sale.subtotal.amount).toBe(40.0);
      expect(sale.discountTotal.amount).toBe(0.0);
      expect(sale.total.amount).toBe(40.0);

      // Apply 25% discount -> subtotal $40.00, discount $10.00, total $30.00
      sale.applyItemDiscount(item.id, Discount.percentage(25, 'Quarter Off'));
      expect(sale.subtotal.amount).toBe(40.0);
      expect(sale.discountTotal.amount).toBe(10.0);
      expect(sale.total.amount).toBe(30.0);

      // Remove discount -> back to $40.00 total
      sale.removeItemDiscount(item.id);
      expect(sale.subtotal.amount).toBe(40.0);
      expect(sale.discountTotal.amount).toBe(0.0);
      expect(sale.total.amount).toBe(40.0);
    });

    it('synchronously updates totals when item is removed from Sale', () => {
      const sale = Sale.create({ source: validSource }, clock);
      const item1 = sale.addItem({
        source: validSource,
        description: 'Item 1',
        quantity: 1,
        unitPrice: Money.create(30.0, 'USD'),
      });
      const item2 = sale.addItem({
        source: validSource,
        description: 'Item 2',
        quantity: 1,
        unitPrice: Money.create(70.0, 'USD'),
      });

      expect(sale.subtotal.amount).toBe(100.0);
      expect(sale.total.amount).toBe(100.0);

      sale.removeItem(item1.id);
      expect(sale.itemCount).toBe(1);
      expect(sale.hasItem(item1.id)).toBe(false);
      expect(sale.hasItem(item2.id)).toBe(true);
      expect(sale.subtotal.amount).toBe(70.0);
      expect(sale.total.amount).toBe(70.0);

      sale.removeItem(item2.id);
      expect(sale.itemCount).toBe(0);
      expect(sale.subtotal.amount).toBe(0.0);
      expect(sale.total.amount).toBe(0.0);
    });
  });

  describe('3. Empty Sale Semantics & Lifecycle Distinction', () => {
    it('permits creation of a DRAFT sale with zero items with zero totals', () => {
      const sale = Sale.create({ source: validSource }, clock);
      expect(sale.status).toBe(SaleStatus.DRAFT);
      expect(sale.itemCount).toBe(0);
      expect(sale.items).toHaveLength(0);
      expect(sale.subtotal.amount).toBe(0.0);
      expect(sale.discountTotal.amount).toBe(0.0);
      expect(sale.total.amount).toBe(0.0);
    });

    it('strictly forbids finalization of an empty sale with EmptySaleException (SALE-05)', () => {
      const sale = Sale.create({ source: validSource }, clock);
      expect(() => sale.finalize(clock)).toThrow(EmptySaleException);
    });

    it('forbids advancing an empty sale to any payment state', () => {
      const sale = Sale.create({ source: validSource }, clock);
      expect(() => sale.markPartiallyPaid(clock)).toThrow(InvalidSaleTransitionException);
      expect(() => sale.markPaid(clock)).toThrow(InvalidSaleTransitionException);
      expect(() => sale.markCompleted(clock)).toThrow(InvalidSaleTransitionException);
    });

    it('permits cancellation of an empty DRAFT sale with a non-empty reason', () => {
      const sale = Sale.create({ source: validSource }, clock);
      sale.cancel('Customer abandoned empty checkout ticket', clock);
      expect(sale.status).toBe(SaleStatus.CANCELLED);
      expect(sale.cancellationReason).toBe('Customer abandoned empty checkout ticket');
    });

    it('allows finalization after adding an item, and forbids finalization again if all items are removed', () => {
      const sale = Sale.create({ source: validSource }, clock);
      expect(() => sale.finalize(clock)).toThrow(EmptySaleException);

      const item = sale.addItem({
        source: validSource,
        description: 'Single Pass',
        quantity: 1,
        unitPrice: Money.create(15.0, 'USD'),
      });

      // Removing the item brings count back to 0
      sale.removeItem(item.id);
      expect(sale.itemCount).toBe(0);
      expect(() => sale.finalize(clock)).toThrow(EmptySaleException);

      // Re-adding an item permits finalization
      sale.addItem({
        source: validSource,
        description: 'Re-added Pass',
        quantity: 1,
        unitPrice: Money.create(15.0, 'USD'),
      });
      expect(() => sale.finalize(clock)).not.toThrow();
      expect(sale.status).toBe(SaleStatus.PENDING_PAYMENT);
    });
  });

  describe('4. Strict Failure Atomicity (Unmutated Aggregate State on Error)', () => {
    let populatedSale: Sale;
    let baselineSnapshot: SaleSnapshot;
    let existingItemId: SaleItemId;

    beforeEach(() => {
      populatedSale = Sale.create({ source: validSource }, clock);
      const item = populatedSale.addItem(
        {
          source: validSource,
          description: 'Baseline Item',
          quantity: 2,
          unitPrice: Money.create(30.0, 'USD'),
        },
        clock,
      );
      existingItemId = item.id;
      baselineSnapshot = takeSnapshot(populatedSale);
    });

    it('preserves entire aggregate unchanged when addItem fails with currency mismatch', () => {
      expect(() => {
        populatedSale.addItem({
          source: altSource,
          description: 'Euro Item',
          quantity: 1,
          unitPrice: Money.create(30.0, 'EUR'),
        });
      }).toThrow(InvalidSaleStateException);

      assertSnapshotUnchanged(populatedSale, baselineSnapshot);
    });

    it('preserves entire aggregate unchanged when addItem fails with duplicate item ID', () => {
      expect(() => {
        populatedSale.addItem({
          id: existingItemId,
          source: altSource,
          description: 'Duplicate Item',
          quantity: 1,
          unitPrice: Money.create(30.0, 'USD'),
        });
      }).toThrow(InvalidSaleStateException);

      assertSnapshotUnchanged(populatedSale, baselineSnapshot);
    });

    it('preserves entire aggregate unchanged when addItem fails with invalid quantity (<= 0 or > MAX)', () => {
      // Zero
      expect(() => {
        populatedSale.addItem({
          source: altSource,
          description: 'Zero Qty',
          quantity: 0,
          unitPrice: Money.create(30.0, 'USD'),
        });
      }).toThrow(InvalidSaleItemException);
      assertSnapshotUnchanged(populatedSale, baselineSnapshot);

      // Negative
      expect(() => {
        populatedSale.addItem({
          source: altSource,
          description: 'Negative Qty',
          quantity: -3,
          unitPrice: Money.create(30.0, 'USD'),
        });
      }).toThrow(InvalidSaleItemException);
      assertSnapshotUnchanged(populatedSale, baselineSnapshot);

      // Exceeding MAX_QUANTITY
      expect(() => {
        populatedSale.addItem({
          source: altSource,
          description: 'Too Huge Qty',
          quantity: 1_000_000,
          unitPrice: Money.create(30.0, 'USD'),
        });
      }).toThrow(InvalidSaleItemException);
      assertSnapshotUnchanged(populatedSale, baselineSnapshot);
    });

    it('preserves entire aggregate unchanged when addItem fails with empty description', () => {
      expect(() => {
        populatedSale.addItem({
          source: altSource,
          description: '   ',
          quantity: 1,
          unitPrice: Money.create(30.0, 'USD'),
        });
      }).toThrow(InvalidSaleItemException);

      assertSnapshotUnchanged(populatedSale, baselineSnapshot);
    });

    it('preserves entire aggregate unchanged when updateItemQuantity fails (non-existent or invalid qty)', () => {
      // Non-existent item
      expect(() => {
        populatedSale.updateItemQuantity('non-existent-id', 5);
      }).toThrow(InvalidSaleStateException);
      assertSnapshotUnchanged(populatedSale, baselineSnapshot);

      // Negative quantity
      expect(() => {
        populatedSale.updateItemQuantity(existingItemId, -2);
      }).toThrow(InvalidSaleItemException);
      assertSnapshotUnchanged(populatedSale, baselineSnapshot);

      // NaN quantity
      expect(() => {
        populatedSale.updateItemQuantity(existingItemId, NaN);
      }).toThrow(InvalidSaleItemException);
      assertSnapshotUnchanged(populatedSale, baselineSnapshot);
    });

    it('preserves entire aggregate unchanged when applyItemDiscount fails', () => {
      // Non-existent item
      expect(() => {
        populatedSale.applyItemDiscount('non-existent-id', Discount.percentage(10, 'Valid reason'));
      }).toThrow(InvalidSaleStateException);
      assertSnapshotUnchanged(populatedSale, baselineSnapshot);

      // Invalid discount instance
      expect(() => {
        populatedSale.applyItemDiscount(existingItemId, {
          type: 'PERCENTAGE',
          value: 10,
        } as unknown as Discount);
      }).toThrow(InvalidSaleStateException);
      assertSnapshotUnchanged(populatedSale, baselineSnapshot);
    });

    it('preserves entire aggregate unchanged when removeItem fails with non-existent ID', () => {
      expect(() => {
        populatedSale.removeItem('non-existent-id');
      }).toThrow(InvalidSaleStateException);
      assertSnapshotUnchanged(populatedSale, baselineSnapshot);
    });
  });

  describe('5. Post-Finalization Freeze & Historical Snapshot Immutability', () => {
    it('prevents all item modifications once Sale is finalized into PENDING_PAYMENT', () => {
      const sale = Sale.create({ source: validSource }, clock);
      const item = sale.addItem(
        {
          source: validSource,
          description: 'Permanent Commercial Item',
          quantity: 2,
          unitPrice: Money.create(50.0, 'USD'),
          discount: Discount.percentage(10, 'Early Bird'),
        },
        clock,
      );

      sale.finalize(clock);
      expect(sale.status).toBe(SaleStatus.PENDING_PAYMENT);

      const finalizedSnapshot = takeSnapshot(sale);

      // 1. addItem blocked
      expect(() =>
        sale.addItem({
          source: altSource,
          description: 'Late Item',
          quantity: 1,
          unitPrice: Money.create(10.0, 'USD'),
        }),
      ).toThrow(SaleAlreadyFinalizedException);
      assertSnapshotUnchanged(sale, finalizedSnapshot);

      // 2. updateItemQuantity blocked
      expect(() => sale.updateItemQuantity(item.id, 5)).toThrow(SaleAlreadyFinalizedException);
      assertSnapshotUnchanged(sale, finalizedSnapshot);

      // 3. applyItemDiscount blocked
      expect(() =>
        sale.applyItemDiscount(item.id, Discount.percentage(20, 'Later Discount')),
      ).toThrow(SaleAlreadyFinalizedException);
      assertSnapshotUnchanged(sale, finalizedSnapshot);

      // 4. removeItemDiscount blocked
      expect(() => sale.removeItemDiscount(item.id)).toThrow(SaleAlreadyFinalizedException);
      assertSnapshotUnchanged(sale, finalizedSnapshot);

      // 5. removeItem blocked
      expect(() => sale.removeItem(item.id)).toThrow(SaleAlreadyFinalizedException);
      assertSnapshotUnchanged(sale, finalizedSnapshot);
    });

    it('maintains absolute freezing across terminal states (PAID, COMPLETED, CANCELLED, REFUNDED)', () => {
      // 1. Cancelled
      const cancelledSale = Sale.create({ source: validSource }, clock);
      const item = cancelledSale.addItem({
        source: validSource,
        description: 'Item',
        quantity: 1,
        unitPrice: Money.create(20.0, 'USD'),
      });
      cancelledSale.cancel('Cancelled by customer');
      expect(() => cancelledSale.updateItemQuantity(item.id, 2)).toThrow(
        SaleAlreadyFinalizedException,
      );
      expect(() => cancelledSale.removeItem(item.id)).toThrow(SaleAlreadyFinalizedException);

      // 2. Paid
      const paidSale = Sale.create({ source: validSource }, clock);
      const item2 = paidSale.addItem({
        source: validSource,
        description: 'Item 2',
        quantity: 1,
        unitPrice: Money.create(20.0, 'USD'),
      });
      paidSale.finalize(clock);
      paidSale.markPaid(clock);
      expect(() => paidSale.updateItemQuantity(item2.id, 2)).toThrow(SaleAlreadyFinalizedException);

      // 3. Completed
      paidSale.markCompleted(clock);
      expect(() => paidSale.updateItemQuantity(item2.id, 2)).toThrow(SaleAlreadyFinalizedException);

      // 4. Refunded
      paidSale.markRefunded('Refunded item', clock);
      expect(() => paidSale.updateItemQuantity(item2.id, 2)).toThrow(SaleAlreadyFinalizedException);
    });
  });
});
