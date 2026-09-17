/**
 * Authoritative Behavioral Test Suite for the Kinergy Sale Aggregate Root.
 *
 * Traceability to Business Rules (docs/business-rules/sales-payments.md):
 * - SALE-01: Tenant Identity Invariant
 * - SALE-03: Optional Client Association
 * - SALE-04: Initial Lifecycle State (DRAFT)
 * - SALE-05: Empty Order Finalization Prohibition
 * - SALE-06: Single Currency Homogeneity
 * - SALE-07: Non-Negative Total Guard
 * - SALE-08: Finalization Immutability Milestone
 * - SALE-09: Cancellation Permissibility & Reason Invariant
 * - SALE-10: Full Settlement Transition (PAID)
 * - SALE-11: Partial Settlement Transition (PARTIALLY_PAID)
 * - SALE-12: Order Completion Prerequisite (COMPLETED) & Refund (REFUNDED)
 * - ITEM-01: Exclusive Parent Ownership
 * - ITEM-02: Strict Positive Quantity & 3-Decimal Precision
 * - ITEM-03: Non-Negative Unit Price Snapshot
 * - ITEM-04: Permanent Commercial Snapshotting
 * - ITEM-05: Unconstrained Source Reference
 * - ITEM-07: Line-Item Discount Cap
 * - ITEM-08: Line Net Calculation
 * - ITEM-09: Post-Finalization Child Entity Freeze
 * - MNY-01, MNY-02, MNY-05: Cent-Guarded Integer Arithmetic, Half-Up Rounding & Non-Negative Amounts
 */

import { Sale } from '../sale.aggregate';
import { SaleItem } from '../entities/sale-item.entity';
import { SaleStatus } from '../enums/sale-status.enum';
import { SourceType } from '../enums/source-type.enum';
import { SourceReference } from '../value-objects/source-reference.vo';
import { SaleId } from '../value-objects/sale-id.vo';
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
import { SaleCreatedEvent } from '../events';

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
    itemCount: sale.items.length,
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

describe('Sale Aggregate Root Behavioral Test Suite', () => {
  const t0 = new Date('2026-09-17T12:00:00.000Z');
  let clock: TestClock;

  const validSessionSource = SourceReference.create({
    sourceType: SourceType.TREATMENT_SESSION,
    sourceId: 'session_clin_101',
  });

  const validInventorySource = SourceReference.create({
    sourceType: SourceType.INVENTORY_ITEM,
    sourceId: 'sku_protein_shake_01',
    sourceCode: 'PRT-SHK',
  });

  beforeEach(() => {
    clock = new TestClock(t0);
  });

  describe('1. Construction & Initialization (SALE-01, SALE-03, SALE-04, SALE-06)', () => {
    it('creates a valid Sale with all required fields in DRAFT status with version 1', () => {
      const sale = Sale.create(
        {
          tenantId: 'tenant_kinergy_corp',
          clientId: 'client_marcus_01',
          currency: 'USD',
          source: validSessionSource,
        },
        clock,
      );

      expect(sale.id).toBeInstanceOf(SaleId);
      expect(sale.tenantId).toBe('tenant_kinergy_corp');
      expect(sale.clientId).toBe('client_marcus_01');
      expect(sale.status).toBe(SaleStatus.DRAFT);
      expect(sale.currency).toBe('USD');
      expect(sale.source.equals(validSessionSource)).toBe(true);
      expect(sale.subtotal.amount).toBe(0.0);
      expect(sale.discountTotal.amount).toBe(0.0);
      expect(sale.total.amount).toBe(0.0);
      expect(sale.version).toBe(1);
      expect(sale.createdAt).toEqual(t0);
      expect(sale.updatedAt).toEqual(t0);
      expect(sale.completedAt).toBeUndefined();
      expect(sale.cancelledAt).toBeUndefined();
      expect(sale.refundedAt).toBeUndefined();
      expect(sale.cancellationReason).toBeUndefined();
      expect(sale.items).toHaveLength(0);

      const events = sale.getUncommittedEvents();
      expect(events).toHaveLength(1);
      expect(events[0]).toBeInstanceOf(SaleCreatedEvent);
      expect(events[0]!.aggregateId).toBe(sale.id.value);
    });

    it('allows omitting clientId for anonymous walk-in retail purchases (SALE-03)', () => {
      const sale = Sale.create(
        {
          tenantId: 'tenant_kinergy_corp',
          source: validInventorySource,
        },
        clock,
      );

      expect(sale.clientId).toBeUndefined();
      expect(sale.status).toBe(SaleStatus.DRAFT);
    });

    it('trims whitespace on tenantId and clientId', () => {
      const sale = Sale.create(
        {
          tenantId: '  tenant_spaced  ',
          clientId: '  client_spaced  ',
          source: validInventorySource,
        },
        clock,
      );

      expect(sale.tenantId).toBe('tenant_spaced');
      expect(sale.clientId).toBe('client_spaced');
    });

    it('rejects blank or empty string for tenantId and clientId (SALE-01)', () => {
      expect(() => Sale.create({ tenantId: '   ', source: validInventorySource }, clock)).toThrow(
        InvalidSaleStateException,
      );

      expect(() => Sale.create({ clientId: '', source: validInventorySource }, clock)).toThrow(
        InvalidSaleStateException,
      );
    });

    it('defaults currency to USD if omitted, and validates 3-letter uppercase ISO code (SALE-06)', () => {
      const defaultSale = Sale.create({ source: validInventorySource }, clock);
      expect(defaultSale.currency).toBe('USD');

      const eurSale = Sale.create({ currency: 'eur', source: validInventorySource }, clock);
      expect(eurSale.currency).toBe('EUR');

      expect(() =>
        Sale.create({ currency: 'TOOLONG', source: validInventorySource }, clock),
      ).toThrow(InvalidSaleStateException);
      expect(() => Sale.create({ currency: 'US', source: validInventorySource }, clock)).toThrow(
        InvalidSaleStateException,
      );
    });

    it('creates a Sale initialized with items and recalculates totals immediately', () => {
      const sale = Sale.create(
        {
          tenantId: 'tenant_1',
          currency: 'USD',
          source: validSessionSource,
          items: [
            {
              source: validInventorySource,
              description: 'Item 1',
              quantity: 2,
              unitPrice: Money.create(25, 'USD'),
            },
            {
              source: validInventorySource,
              description: 'Item 2',
              quantity: 1,
              unitPrice: Money.create(50, 'USD'),
              discount: Discount.fixedAmount(10, 'Promo'),
            },
          ],
        },
        clock,
      );

      expect(sale.items).toHaveLength(2);
      expect(sale.subtotal.amount).toBe(100.0);
      expect(sale.discountTotal.amount).toBe(10.0);
      expect(sale.total.amount).toBe(90.0);
    });
  });

  describe('2. SaleItem Management & Invariants (ITEM-01 through ITEM-08)', () => {
    it('creates an immutable SaleItem owned by Sale and snapshots catalog details (ITEM-01, ITEM-04)', () => {
      const sale = Sale.create({ source: validSessionSource }, clock);

      const item = sale.addItem(
        {
          source: validInventorySource,
          description: 'Electrolyte Hydration Drink',
          skuOrCode: 'ELC-HYD-500',
          quantity: 3,
          unitPrice: Money.create(4.5, 'USD'),
          discount: Discount.percentage(10, 'Member 10% Discount'),
        },
        clock,
      );

      expect(item).toBeInstanceOf(SaleItem);
      expect(item.id).toBeInstanceOf(SaleItemId);
      expect(item.description).toBe('Electrolyte Hydration Drink');
      expect(item.skuOrCode).toBe('ELC-HYD-500');
      expect(item.quantity).toBe(3);
      expect(item.unitPrice.amount).toBe(4.5);
      expect(item.subtotal.amount).toBe(13.5); // 3 * 4.50
      expect(item.discountTotal.amount).toBe(1.35); // 10% of 13.50
      expect(item.total.amount).toBe(12.15); // 13.50 - 1.35
      expect(Object.isFrozen(item)).toBe(true);

      const events = sale.getUncommittedEvents();
      expect(events.some((e) => e.eventType === 'SaleItemAdded')).toBe(true);
    });

    it('enforces strictly positive quantity and supports up to 3 decimal places (ITEM-02)', () => {
      const sale = Sale.create({ source: validSessionSource }, clock);

      // Fractional quantity for weighted/bulk goods (e.g. 1.25 kg)
      const bulkItem = sale.addItem({
        source: validInventorySource,
        description: 'Bulk Protein Powder',
        quantity: 1.25,
        unitPrice: Money.create(20.0, 'USD'),
      });
      expect(bulkItem.quantity).toBe(1.25);
      expect(bulkItem.subtotal.amount).toBe(25.0);

      // Zero quantity rejected
      expect(() => {
        sale.addItem({
          source: validInventorySource,
          description: 'Invalid Item',
          quantity: 0,
          unitPrice: Money.create(10.0, 'USD'),
        });
      }).toThrow(InvalidSaleItemException);

      // Negative quantity rejected
      expect(() => {
        sale.addItem({
          source: validInventorySource,
          description: 'Invalid Item',
          quantity: -2,
          unitPrice: Money.create(10.0, 'USD'),
        });
      }).toThrow(InvalidSaleItemException);

      // NaN quantity rejected
      expect(() => {
        sale.addItem({
          source: validInventorySource,
          description: 'Invalid Item',
          quantity: NaN,
          unitPrice: Money.create(10.0, 'USD'),
        });
      }).toThrow(InvalidSaleItemException);
    });

    it('enforces non-negative unit price and permits zero-price promotional gifts (ITEM-03)', () => {
      const sale = Sale.create({ source: validSessionSource }, clock);

      // Zero-price item
      const freeGift = sale.addItem({
        source: validInventorySource,
        description: 'Free Promotional Shaker Cup',
        quantity: 1,
        unitPrice: Money.zero('USD'),
      });
      expect(freeGift.unitPrice.amount).toBe(0.0);
      expect(freeGift.subtotal.amount).toBe(0.0);
      expect(freeGift.total.amount).toBe(0.0);

      // Negative unit price rejected by Money assertion
      expect(() => {
        Money.create(-5.0, 'USD');
      }).toThrow();
    });

    it('caps line-item discount at item gross subtotal (ITEM-07)', () => {
      const sale = Sale.create({ source: validSessionSource }, clock);

      const item = sale.addItem({
        source: validInventorySource,
        description: 'Single Protein Bar',
        quantity: 1,
        unitPrice: Money.create(3.0, 'USD'),
        discount: Discount.fixedAmount(10.0, 'Voucher exceeding price'),
      });

      // Reduction is capped at subtotal $3.00, total is $0.00 (not -$7.00)
      expect(item.subtotal.amount).toBe(3.0);
      expect(item.discountTotal.amount).toBe(3.0);
      expect(item.total.amount).toBe(0.0);
    });

    it('rejects adding an item with currency different from the Sale (SALE-06)', () => {
      const sale = Sale.create({ currency: 'USD', source: validSessionSource }, clock);

      expect(() => {
        sale.addItem({
          source: validInventorySource,
          description: 'Euro Item',
          quantity: 1,
          unitPrice: Money.create(10.0, 'EUR'),
        });
      }).toThrow(InvalidSaleStateException);
    });

    it('rejects duplicate SaleItemId within the same Sale', () => {
      const sale = Sale.create({ source: validSessionSource }, clock);
      const itemId = SaleItemId.create('item_fixed_123');

      sale.addItem({
        id: itemId,
        source: validInventorySource,
        description: 'First Insertion',
        quantity: 1,
        unitPrice: Money.create(10.0, 'USD'),
      });

      expect(() => {
        sale.addItem({
          id: itemId,
          source: validInventorySource,
          description: 'Duplicate Insertion',
          quantity: 1,
          unitPrice: Money.create(10.0, 'USD'),
        });
      }).toThrow(InvalidSaleStateException);
    });
  });

  describe('3. Totals & Mathematical Reconciliation (SALE-06, SALE-07, MNY-01, MNY-02)', () => {
    it('calculates totals accurately for multiple items with mixed quantities and discounts', () => {
      const sale = Sale.create({ source: validSessionSource }, clock);

      // Line 1: 2 * $45.00 = $90.00, no discount
      sale.addItem({
        source: validInventorySource,
        description: 'Resistance Band Set',
        quantity: 2,
        unitPrice: Money.create(45.0, 'USD'),
      });

      // Line 2: 1.5 * $60.00 = $90.00, 10% discount = $9.00
      sale.addItem({
        source: validInventorySource,
        description: 'Recovery Oil (Bulk)',
        quantity: 1.5,
        unitPrice: Money.create(60.0, 'USD'),
        discount: Discount.percentage(10, '10% volume discount'),
      });

      // Subtotal = 90.00 + 90.00 = 180.00
      // Line discounts = 0.00 + 9.00 = 9.00
      // Net before order discount = 171.00
      expect(sale.subtotal.amount).toBe(180.0);
      expect(sale.discountTotal.amount).toBe(9.0);
      expect(sale.total.amount).toBe(171.0);

      // Apply 10% order discount on net pre-order subtotal ($171.00 * 10% = $17.10)
      sale.applyOrderDiscount(Discount.percentage(10, 'Storewide 10%'));

      // Total discounts = $9.00 line + $17.10 order = $26.10
      // Payable total = $180.00 - $26.10 = $153.90
      expect(sale.discountTotal.amount).toBe(26.1);
      expect(sale.total.amount).toBe(153.9);
    });

    it('dynamically recalculates totals when item quantity is updated', () => {
      const sale = Sale.create({ source: validSessionSource }, clock);
      const item = sale.addItem({
        source: validInventorySource,
        description: 'Gym Towel',
        quantity: 1,
        unitPrice: Money.create(15.0, 'USD'),
        discount: Discount.fixedAmount(5.0, 'Towel Discount'),
      });

      expect(sale.subtotal.amount).toBe(15.0);
      expect(sale.total.amount).toBe(10.0);

      // Increase quantity to 3 -> subtotal $45.00, discount $5.00, total $40.00
      sale.updateItemQuantity(item.id, 3);
      expect(sale.subtotal.amount).toBe(45.0);
      expect(sale.total.amount).toBe(40.0);
    });

    it('dynamically recalculates totals when line items are removed', () => {
      const sale = Sale.create({ source: validSessionSource }, clock);
      const item1 = sale.addItem({
        source: validInventorySource,
        description: 'Item A',
        quantity: 1,
        unitPrice: Money.create(20.0, 'USD'),
      });
      const item2 = sale.addItem({
        source: validInventorySource,
        description: 'Item B',
        quantity: 2,
        unitPrice: Money.create(30.0, 'USD'),
      });

      expect(sale.subtotal.amount).toBe(80.0);

      sale.removeItem(item1.id);
      expect(sale.items).toHaveLength(1);
      expect(sale.items[0]!.id.value).toBe(item2.id.value);
      expect(sale.subtotal.amount).toBe(60.0);
      expect(sale.total.amount).toBe(60.0);

      const events = sale.getUncommittedEvents();
      expect(events.some((e) => e.eventType === 'SaleItemRemoved')).toBe(true);
    });

    it('enforces non-negative total guard when order discount exceeds subtotal (SALE-07)', () => {
      const sale = Sale.create({ source: validSessionSource }, clock);
      sale.addItem({
        source: validInventorySource,
        description: 'Single Water Bottle',
        quantity: 1,
        unitPrice: Money.create(2.5, 'USD'),
      });

      sale.applyOrderDiscount(Discount.fixedAmount(50.0, 'Huge Loyalty Coupon'));

      expect(sale.subtotal.amount).toBe(2.5);
      expect(sale.discountTotal.amount).toBe(2.5);
      expect(sale.total.amount).toBe(0.0);
    });
  });

  describe('4. Lifecycle State Machine Transitions (SALE-05, SALE-08, SALE-09, SALE-10, SALE-11, SALE-12)', () => {
    it('follows the primary happy path: DRAFT -> PENDING_PAYMENT -> PARTIALLY_PAID -> PAID -> COMPLETED', () => {
      const sale = Sale.create({ source: validSessionSource }, clock);
      sale.addItem({
        source: validInventorySource,
        description: 'Physical Therapy Session',
        quantity: 1,
        unitPrice: Money.create(120.0, 'USD'),
      });
      expect(sale.status).toBe(SaleStatus.DRAFT);
      expect(sale.version).toBe(1);

      // 1. Finalize (DRAFT -> PENDING_PAYMENT)
      clock.advanceBy(60_000);
      sale.finalize(clock);
      expect(sale.status).toBe(SaleStatus.PENDING_PAYMENT);
      expect(sale.version).toBe(2);

      // 2. Partial Payment (PENDING_PAYMENT -> PARTIALLY_PAID)
      clock.advanceBy(60_000);
      sale.markPartiallyPaid(clock);
      expect(sale.status).toBe(SaleStatus.PARTIALLY_PAID);
      expect(sale.version).toBe(3);

      // 3. Full Settlement (PARTIALLY_PAID -> PAID)
      clock.advanceBy(60_000);
      sale.markPaid(clock);
      expect(sale.status).toBe(SaleStatus.PAID);
      expect(sale.version).toBe(4);

      // 4. Fulfillment Completion (PAID -> COMPLETED)
      clock.advanceBy(60_000);
      sale.markCompleted(clock);
      expect(sale.status).toBe(SaleStatus.COMPLETED);
      expect(sale.version).toBe(5);
      expect(sale.completedAt).toEqual(clock.now());
    });

    it('follows direct settlement: DRAFT -> PENDING_PAYMENT -> PAID -> REFUNDED', () => {
      const sale = Sale.create({ source: validSessionSource }, clock);
      sale.addItem({
        source: validInventorySource,
        description: 'Monthly Gym Membership',
        quantity: 1,
        unitPrice: Money.create(75.0, 'USD'),
      });

      sale.finalize(clock);
      sale.markPaid(clock);
      expect(sale.status).toBe(SaleStatus.PAID);

      // Full compensating refund
      clock.advanceBy(300_000);
      sale.markRefunded('Member medical relocation', clock);
      expect(sale.status).toBe(SaleStatus.REFUNDED);
      expect(sale.refundedAt).toEqual(clock.now());

      const refundEvent = sale.getUncommittedEvents().find((e) => e.eventType === 'SaleRefunded');
      expect(refundEvent).toBeDefined();
    });

    it('allows refunding after COMPLETED status', () => {
      const sale = Sale.create({ source: validSessionSource }, clock);
      sale.addItem({
        source: validInventorySource,
        description: 'Supplements',
        quantity: 1,
        unitPrice: Money.create(40.0, 'USD'),
      });
      sale.finalize(clock);
      sale.markPaid(clock);
      sale.markCompleted(clock);
      expect(sale.status).toBe(SaleStatus.COMPLETED);

      sale.markRefunded('Defective batch return', clock);
      expect(sale.status).toBe(SaleStatus.REFUNDED);
    });

    it('allows cancellation from DRAFT, PENDING_PAYMENT, and PARTIALLY_PAID with a reason (SALE-09)', () => {
      // From DRAFT
      const draftSale = Sale.create({ source: validSessionSource }, clock);
      draftSale.cancel('Customer walked away before scan', clock);
      expect(draftSale.status).toBe(SaleStatus.CANCELLED);
      expect(draftSale.cancellationReason).toBe('Customer walked away before scan');

      // From PENDING_PAYMENT
      const pendingSale = Sale.create({ source: validSessionSource }, clock);
      pendingSale.addItem({
        source: validInventorySource,
        description: 'Item',
        quantity: 1,
        unitPrice: Money.create(10.0, 'USD'),
      });
      pendingSale.finalize(clock);
      pendingSale.cancel('Card declined multiple times', clock);
      expect(pendingSale.status).toBe(SaleStatus.CANCELLED);

      // From PARTIALLY_PAID
      const partialSale = Sale.create({ source: validSessionSource }, clock);
      partialSale.addItem({
        source: validInventorySource,
        description: 'Item',
        quantity: 1,
        unitPrice: Money.create(100.0, 'USD'),
      });
      partialSale.finalize(clock);
      partialSale.markPartiallyPaid(clock);
      partialSale.cancel('Remaining balance not payable', clock);
      expect(partialSale.status).toBe(SaleStatus.CANCELLED);
    });

    it('prohibits empty sale finalization (SALE-05)', () => {
      const emptySale = Sale.create({ source: validSessionSource }, clock);
      expect(() => emptySale.finalize(clock)).toThrow(EmptySaleException);
    });

    it('rejects cancellation without reason or with whitespace (SALE-09)', () => {
      const sale = Sale.create({ source: validSessionSource }, clock);
      expect(() => sale.cancel('', clock)).toThrow(InvalidSaleStateException);
      expect(() => sale.cancel('   ', clock)).toThrow(InvalidSaleStateException);
    });

    it('rejects refund with whitespace reason', () => {
      const sale = Sale.create({ source: validSessionSource }, clock);
      sale.addItem({
        source: validInventorySource,
        description: 'Item',
        quantity: 1,
        unitPrice: Money.create(10.0, 'USD'),
      });
      sale.finalize(clock);
      sale.markPaid(clock);

      expect(() => sale.markRefunded('   ', clock)).toThrow(InvalidSaleStateException);
    });

    it('prohibits all invalid lifecycle transitions across the state graph', () => {
      const sale = Sale.create({ source: validSessionSource }, clock);
      sale.addItem({
        source: validInventorySource,
        description: 'Item',
        quantity: 1,
        unitPrice: Money.create(10.0, 'USD'),
      });

      // From DRAFT
      expect(() => sale.markPartiallyPaid()).toThrow(InvalidSaleTransitionException);
      expect(() => sale.markPaid()).toThrow(InvalidSaleTransitionException);
      expect(() => sale.markCompleted()).toThrow(InvalidSaleTransitionException);
      expect(() => sale.markRefunded('reason')).toThrow(InvalidSaleTransitionException);

      sale.finalize(clock);
      // From PENDING_PAYMENT
      expect(() => sale.finalize()).toThrow(InvalidSaleTransitionException);
      expect(() => sale.markCompleted()).toThrow(InvalidSaleTransitionException);
      expect(() => sale.markRefunded('reason')).toThrow(InvalidSaleTransitionException);

      sale.markPaid(clock);
      // From PAID
      expect(() => sale.markPartiallyPaid()).toThrow(InvalidSaleTransitionException);
      expect(() => sale.cancel('Paid cannot cancel')).toThrow(InvalidSaleTransitionException);

      sale.markCompleted(clock);
      // From COMPLETED
      expect(() => sale.markPaid()).toThrow(InvalidSaleTransitionException);
      expect(() => sale.cancel('Completed cannot cancel')).toThrow(InvalidSaleTransitionException);

      sale.markRefunded('Refunded now', clock);
      // From REFUNDED (terminal)
      expect(() => sale.markPaid()).toThrow(InvalidSaleTransitionException);
      expect(() => sale.cancel('Terminal cannot cancel')).toThrow(InvalidSaleTransitionException);
    });
  });

  describe('5. Progressive Immutability & Freezing (SALE-08, ITEM-09)', () => {
    it('prohibits all cart mutations once the Sale departs DRAFT status', () => {
      const sale = Sale.create({ source: validSessionSource }, clock);
      const item = sale.addItem({
        source: validInventorySource,
        description: 'Yoga Mat',
        quantity: 1,
        unitPrice: Money.create(35.0, 'USD'),
      });

      sale.finalize(clock);

      // addItem
      expect(() =>
        sale.addItem({
          source: validInventorySource,
          description: 'New Item',
          quantity: 1,
          unitPrice: Money.create(5.0, 'USD'),
        }),
      ).toThrow(SaleAlreadyFinalizedException);

      // updateItemQuantity
      expect(() => sale.updateItemQuantity(item.id, 5)).toThrow(SaleAlreadyFinalizedException);

      // applyItemDiscount
      expect(() =>
        sale.applyItemDiscount(item.id, Discount.percentage(10, 'Late Discount')),
      ).toThrow(SaleAlreadyFinalizedException);

      // removeItemDiscount
      expect(() => sale.removeItemDiscount(item.id)).toThrow(SaleAlreadyFinalizedException);

      // removeItem
      expect(() => sale.removeItem(item.id)).toThrow(SaleAlreadyFinalizedException);

      // applyOrderDiscount
      expect(() =>
        sale.applyOrderDiscount(Discount.fixedAmount(5.0, 'Late Order Discount')),
      ).toThrow(SaleAlreadyFinalizedException);

      // removeOrderDiscount
      expect(() => sale.removeOrderDiscount()).toThrow(SaleAlreadyFinalizedException);
    });
  });

  describe('6. Defensive Encapsulation & Anti-Tampering', () => {
    it('protects internal items array against external mutation via returned references', () => {
      const sale = Sale.create({ source: validSessionSource }, clock);
      sale.addItem({
        source: validInventorySource,
        description: 'Water',
        quantity: 1,
        unitPrice: Money.create(2.0, 'USD'),
      });

      const exposedItems = sale.items;
      expect(Object.isFrozen(exposedItems)).toBe(true);

      expect(() => {
        (exposedItems as unknown as unknown[]).push({});
      }).toThrow();
    });

    it('protects domain events list against external mutation', () => {
      const sale = Sale.create({ source: validSessionSource }, clock);
      const exposedEvents = sale.getUncommittedEvents();
      expect(Object.isFrozen(exposedEvents)).toBe(true);

      expect(() => {
        (exposedEvents as unknown as unknown[]).push({});
      }).toThrow();
    });

    it('returns defensive copies of Date timestamps', () => {
      const sale = Sale.create({ source: validSessionSource }, clock);
      const createdAt = sale.createdAt;
      createdAt.setFullYear(1999);

      expect(sale.createdAt.getFullYear()).toBe(2026);
    });
  });

  describe('7. Failure Atomicity (Unmutated Aggregate State on Rejection)', () => {
    it('preserves identical aggregate state when addItem fails validation', () => {
      const sale = Sale.create({ source: validSessionSource }, clock);
      sale.addItem({
        source: validInventorySource,
        description: 'Initial Item',
        quantity: 1,
        unitPrice: Money.create(20.0, 'USD'),
      });

      const snapshot = takeSnapshot(sale);

      // Currency mismatch failure
      expect(() => {
        sale.addItem({
          source: validInventorySource,
          description: 'Euro Item',
          quantity: 1,
          unitPrice: Money.create(20.0, 'EUR'),
        });
      }).toThrow(InvalidSaleStateException);
      assertSnapshotUnchanged(sale, snapshot);

      // Invalid quantity failure
      expect(() => {
        sale.addItem({
          source: validInventorySource,
          description: 'Zero Item',
          quantity: 0,
          unitPrice: Money.create(20.0, 'USD'),
        });
      }).toThrow(InvalidSaleItemException);
      assertSnapshotUnchanged(sale, snapshot);
    });

    it('preserves identical aggregate state when updateItemQuantity fails', () => {
      const sale = Sale.create({ source: validSessionSource }, clock);
      const item = sale.addItem({
        source: validInventorySource,
        description: 'Item',
        quantity: 2,
        unitPrice: Money.create(15.0, 'USD'),
      });

      const snapshot = takeSnapshot(sale);

      // Non-existent item ID
      expect(() => sale.updateItemQuantity('non_existent', 5)).toThrow(InvalidSaleStateException);
      assertSnapshotUnchanged(sale, snapshot);

      // Negative quantity
      expect(() => sale.updateItemQuantity(item.id, -1)).toThrow(InvalidSaleItemException);
      assertSnapshotUnchanged(sale, snapshot);
    });

    it('preserves identical aggregate state when lifecycle transitions fail', () => {
      const sale = Sale.create({ source: validSessionSource }, clock);
      sale.addItem({
        source: validInventorySource,
        description: 'Item',
        quantity: 1,
        unitPrice: Money.create(50.0, 'USD'),
      });

      const snapshot = takeSnapshot(sale);

      // Direct markPaid from DRAFT
      expect(() => sale.markPaid()).toThrow(InvalidSaleTransitionException);
      assertSnapshotUnchanged(sale, snapshot);

      // Blank cancellation reason
      expect(() => sale.cancel('   ')).toThrow(InvalidSaleStateException);
      assertSnapshotUnchanged(sale, snapshot);
    });
  });

  describe('8. Regression Tests (Defect Verification)', () => {
    it('REG-01: fractional quantity underflow (< 0.001) rounding to zero is strictly rejected', () => {
      const sale = Sale.create({ source: validSessionSource }, clock);

      expect(() => {
        sale.addItem({
          source: validInventorySource,
          description: 'Underflow item',
          quantity: 0.0001,
          unitPrice: Money.create(100.0, 'USD'),
        });
      }).toThrow(InvalidSaleItemException);
    });

    it('REG-02: large order discount capping preserves $0.00 floor without negative amounts', () => {
      const sale = Sale.create({ source: validSessionSource }, clock);
      sale.addItem({
        source: validInventorySource,
        description: 'Low cost item',
        quantity: 1,
        unitPrice: Money.create(10.0, 'USD'),
      });

      sale.applyOrderDiscount(Discount.fixedAmount(500.0, 'Massive Discount'));
      expect(sale.total.amount).toBe(0.0);
      expect(sale.discountTotal.amount).toBe(10.0);
    });

    it('REG-03: clearEvents clears domain events without affecting aggregate business state', () => {
      const sale = Sale.create({ source: validSessionSource }, clock);
      sale.addItem({
        source: validInventorySource,
        description: 'Item',
        quantity: 1,
        unitPrice: Money.create(10.0, 'USD'),
      });

      expect(sale.getUncommittedEvents().length).toBeGreaterThan(0);
      sale.clearEvents();
      expect(sale.getUncommittedEvents()).toHaveLength(0);
      expect(sale.subtotal.amount).toBe(10.0);
      expect(sale.version).toBe(1);
    });

    it('REG-04: reconstituted totals strictly reconcile with line item sum and discount reduction', () => {
      const sale = Sale.create({ source: validSessionSource }, clock);
      sale.addItem({
        source: validInventorySource,
        description: 'Item A',
        quantity: 2,
        unitPrice: Money.create(30.0, 'USD'),
      });
      sale.finalize(clock);

      const reconstituted = Sale.reconstitute({
        id: sale.id,
        status: sale.status,
        currency: sale.currency,
        source: sale.source,
        items: [...sale.items],
        subtotal: sale.subtotal,
        discountTotal: sale.discountTotal,
        total: sale.total,
        version: sale.version,
        createdAt: sale.createdAt,
        updatedAt: sale.updatedAt,
      });

      expect(reconstituted.total.equals(sale.total)).toBe(true);
      expect(reconstituted.subtotal.equals(sale.subtotal)).toBe(true);
    });
  });
});
