import { Sale, CreateSaleProps } from '../sale.aggregate';
import { SaleItem } from '../entities/sale-item.entity';
import { SaleStatus } from '../enums/sale-status.enum';
import { SourceType } from '../enums/source-type.enum';
import { SourceReference, SourceReferenceProps } from '../value-objects/source-reference.vo';
import { SaleId } from '../value-objects/sale-id.vo';
import { SaleItemId } from '../value-objects/sale-item-id.vo';
import { Money } from '../value-objects/money.vo';
import { Discount } from '../value-objects/discount.vo';
import { Clock } from '../shared/clock';
import {
  SaleDomainException,
  EmptySaleException,
  SaleAlreadyFinalizedException,
  InvalidSaleStateException,
  InvalidSaleTransitionException,
  InvalidSaleItemException,
  InvalidDiscountException,
} from '../exceptions';

class FixedClock implements Clock {
  constructor(private readonly fixedTime: Date) {}
  public now(): Date {
    return new Date(this.fixedTime.getTime());
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

describe('Sale Aggregate Deterministic Failures & Atomicity', () => {
  const t0 = new Date('2026-09-01T10:00:00.000Z');
  const clock = new FixedClock(t0);

  const validSource = SourceReference.create({
    sourceType: SourceType.TREATMENT_SESSION,
    sourceId: 'session_100',
  });

  const validItemSource = SourceReference.create({
    sourceType: SourceType.INVENTORY_ITEM,
    sourceId: 'inv_item_200',
  });

  function createDraftSaleWithItems(): Sale {
    const sale = Sale.create(
      {
        source: validSource,
        currency: 'USD',
        tenantId: 'tenant_1',
        clientId: 'client_1',
      },
      clock,
    );

    sale.addItem(
      {
        source: validItemSource,
        description: 'First Item',
        quantity: 2,
        unitPrice: Money.create(50, 'USD'),
      },
      clock,
    );

    sale.addItem(
      {
        source: validItemSource,
        description: 'Second Item',
        quantity: 1,
        unitPrice: Money.create(100, 'USD'),
        discount: Discount.fixedAmount(10, 'Special Promo'),
      },
      clock,
    );

    return sale;
  }

  describe('1. Construction & Factory Failures', () => {
    it('fails deterministically if props is null or undefined', () => {
      expect(() => Sale.create(null as unknown as CreateSaleProps)).toThrow(
        InvalidSaleStateException,
      );
      try {
        Sale.create(null as unknown as CreateSaleProps);
      } catch (e: unknown) {
        expect(e).toBeInstanceOf(SaleDomainException);
        if (e instanceof SaleDomainException) {
          expect(e.code).toBe('INVALID_SALE_STATE');
        }
      }
    });

    it('fails deterministically if source is invalid or missing', () => {
      expect(() => Sale.create({ source: null as unknown as SourceReference })).toThrow(
        InvalidSaleStateException,
      );
      try {
        Sale.create({
          source: { sourceType: 'INVALID', sourceId: '1' } as unknown as SourceReference,
        });
      } catch (e: unknown) {
        expect(e).toBeInstanceOf(InvalidSaleStateException);
        if (e instanceof InvalidSaleStateException) {
          expect(e.code).toBe('INVALID_SALE_STATE');
          expect(e.message).toContain('SourceReference is required');
        }
      }
    });

    it('fails deterministically if SaleId is not a SaleId instance', () => {
      try {
        Sale.create({ id: 'raw_string_id' as unknown as SaleId, source: validSource });
        fail('Should have thrown');
      } catch (e: unknown) {
        expect(e).toBeInstanceOf(InvalidSaleStateException);
        if (e instanceof InvalidSaleStateException) {
          expect(e.code).toBe('INVALID_SALE_STATE');
          expect(e.message).toContain('SaleId must be a valid SaleId instance');
        }
      }
    });

    it('fails deterministically if tenantId is empty or whitespace', () => {
      try {
        Sale.create({ source: validSource, tenantId: '   ' });
        fail('Should have thrown');
      } catch (e: unknown) {
        expect(e).toBeInstanceOf(InvalidSaleStateException);
        if (e instanceof InvalidSaleStateException) {
          expect(e.code).toBe('INVALID_SALE_STATE');
          expect(e.message).toContain('tenantId cannot be empty or whitespace');
        }
      }
    });

    it('fails deterministically if clientId is empty or whitespace', () => {
      try {
        Sale.create({ source: validSource, clientId: '' });
        fail('Should have thrown');
      } catch (e: unknown) {
        expect(e).toBeInstanceOf(InvalidSaleStateException);
        if (e instanceof InvalidSaleStateException) {
          expect(e.code).toBe('INVALID_SALE_STATE');
          expect(e.message).toContain('clientId cannot be empty or whitespace');
        }
      }
    });

    it('fails deterministically if currency is not a valid 3-letter ISO code', () => {
      const invalidCurrencies = ['US', 'USDD', '123', '', 'usd1'];
      for (const cur of invalidCurrencies) {
        try {
          Sale.create({ source: validSource, currency: cur });
          fail(`Should have thrown for currency: ${cur}`);
        } catch (e: unknown) {
          expect(e).toBeInstanceOf(InvalidSaleStateException);
          if (e instanceof InvalidSaleStateException) {
            expect(e.code).toBe('INVALID_SALE_STATE');
          }
        }
      }
    });

    it('fails deterministically if orderDiscount is not a Discount instance', () => {
      try {
        Sale.create({ source: validSource, orderDiscount: { value: 10 } as unknown as Discount });
        fail('Should have thrown');
      } catch (e: unknown) {
        expect(e).toBeInstanceOf(InvalidSaleStateException);
        if (e instanceof InvalidSaleStateException) {
          expect(e.code).toBe('INVALID_SALE_STATE');
          expect(e.message).toContain('Order discount must be a valid Discount instance');
        }
      }
    });

    it('fails atomically during create if any initial item is invalid', () => {
      expect(() => {
        Sale.create({
          source: validSource,
          currency: 'USD',
          items: [
            {
              source: validItemSource,
              description: 'Valid Item',
              quantity: 1,
              unitPrice: Money.create(50, 'USD'),
            },
            {
              source: validItemSource,
              description: 'Invalid Item with non-positive quantity',
              quantity: -2,
              unitPrice: Money.create(50, 'USD'),
            },
          ],
        });
      }).toThrow(InvalidSaleItemException);
    });
  });

  describe('2. Reconstitution Failures & Mathematical Integrity', () => {
    it('fails if persisted subtotal does not reconcile with item subtotals', () => {
      const item = SaleItem.create({
        source: validItemSource,
        description: 'Test Item',
        quantity: 1,
        unitPrice: Money.create(100, 'USD'),
      });

      try {
        Sale.reconstitute({
          id: SaleId.create(),
          status: SaleStatus.PENDING_PAYMENT,
          currency: 'USD',
          source: validSource,
          items: [item],
          subtotal: Money.create(99, 'USD'), // Corrupted!
          discountTotal: Money.zero('USD'),
          total: Money.create(99, 'USD'),
          version: 2,
          createdAt: t0,
          updatedAt: t0,
        });
        fail('Should have thrown');
      } catch (e: unknown) {
        expect(e).toBeInstanceOf(InvalidSaleStateException);
        if (e instanceof InvalidSaleStateException) {
          expect(e.code).toBe('INVALID_SALE_STATE');
          expect(e.message).toContain('Persisted subtotal');
        }
      }
    });

    it('fails if persisted discountTotal does not reconcile', () => {
      const item = SaleItem.create({
        source: validItemSource,
        description: 'Test Item',
        quantity: 1,
        unitPrice: Money.create(100, 'USD'),
        discount: Discount.fixedAmount(20, 'Promotion'),
      });

      try {
        Sale.reconstitute({
          id: SaleId.create(),
          status: SaleStatus.PENDING_PAYMENT,
          currency: 'USD',
          source: validSource,
          items: [item],
          subtotal: Money.create(100, 'USD'),
          discountTotal: Money.create(15, 'USD'), // Corrupted!
          total: Money.create(85, 'USD'),
          version: 2,
          createdAt: t0,
          updatedAt: t0,
        });
        fail('Should have thrown');
      } catch (e: unknown) {
        expect(e).toBeInstanceOf(InvalidSaleStateException);
        if (e instanceof InvalidSaleStateException) {
          expect(e.code).toBe('INVALID_SALE_STATE');
          expect(e.message).toContain('Persisted discountTotal');
        }
      }
    });

    it('fails if persisted total does not reconcile with subtotal - discountTotal', () => {
      const item = SaleItem.create({
        source: validItemSource,
        description: 'Test Item',
        quantity: 1,
        unitPrice: Money.create(100, 'USD'),
      });

      try {
        Sale.reconstitute({
          id: SaleId.create(),
          status: SaleStatus.PENDING_PAYMENT,
          currency: 'USD',
          source: validSource,
          items: [item],
          subtotal: Money.create(100, 'USD'),
          discountTotal: Money.zero('USD'),
          total: Money.create(90, 'USD'), // Corrupted!
          version: 2,
          createdAt: t0,
          updatedAt: t0,
        });
        fail('Should have thrown');
      } catch (e: unknown) {
        expect(e).toBeInstanceOf(InvalidSaleStateException);
        if (e instanceof InvalidSaleStateException) {
          expect(e.code).toBe('INVALID_SALE_STATE');
          expect(e.message).toContain('Persisted total');
        }
      }
    });

    it('fails if duplicate item IDs exist in persisted snapshot', () => {
      const sharedId = SaleItemId.create();
      const item1 = SaleItem.create({
        id: sharedId,
        source: validItemSource,
        description: 'Item 1',
        quantity: 1,
        unitPrice: Money.create(50, 'USD'),
      });
      const item2 = SaleItem.create({
        id: sharedId,
        source: validItemSource,
        description: 'Item 2',
        quantity: 1,
        unitPrice: Money.create(50, 'USD'),
      });

      try {
        Sale.reconstitute({
          id: SaleId.create(),
          status: SaleStatus.DRAFT,
          currency: 'USD',
          source: validSource,
          items: [item1, item2],
          subtotal: Money.create(100, 'USD'),
          discountTotal: Money.zero('USD'),
          total: Money.create(100, 'USD'),
          version: 1,
          createdAt: t0,
          updatedAt: t0,
        });
        fail('Should have thrown');
      } catch (e: unknown) {
        expect(e).toBeInstanceOf(InvalidSaleStateException);
        if (e instanceof InvalidSaleStateException) {
          expect(e.code).toBe('INVALID_SALE_STATE');
          expect(e.message).toContain('Duplicate SaleItem ID');
        }
      }
    });

    it('fails if item currency does not match Sale currency during reconstitution', () => {
      const eurItem = SaleItem.create({
        source: validItemSource,
        description: 'EUR item',
        quantity: 1,
        unitPrice: Money.create(50, 'EUR'),
      });

      try {
        Sale.reconstitute({
          id: SaleId.create(),
          status: SaleStatus.DRAFT,
          currency: 'USD',
          source: validSource,
          items: [eurItem],
          subtotal: Money.create(50, 'USD'),
          discountTotal: Money.zero('USD'),
          total: Money.create(50, 'USD'),
          version: 1,
          createdAt: t0,
          updatedAt: t0,
        });
        fail('Should have thrown');
      } catch (e: unknown) {
        expect(e).toBeInstanceOf(InvalidSaleStateException);
        if (e instanceof InvalidSaleStateException) {
          expect(e.code).toBe('INVALID_SALE_STATE');
          expect(e.message).toContain('does not match Sale currency');
        }
      }
    });

    it('fails if CANCELLED sale is reconstituted without cancellationReason or cancelledAt', () => {
      expect(() => {
        Sale.reconstitute({
          id: SaleId.create(),
          status: SaleStatus.CANCELLED,
          currency: 'USD',
          source: validSource,
          items: [],
          subtotal: Money.zero('USD'),
          discountTotal: Money.zero('USD'),
          total: Money.zero('USD'),
          version: 2,
          cancellationReason: '',
          cancelledAt: t0,
          createdAt: t0,
          updatedAt: t0,
        });
      }).toThrow(InvalidSaleStateException);

      expect(() => {
        Sale.reconstitute({
          id: SaleId.create(),
          status: SaleStatus.CANCELLED,
          currency: 'USD',
          source: validSource,
          items: [],
          subtotal: Money.zero('USD'),
          discountTotal: Money.zero('USD'),
          total: Money.zero('USD'),
          version: 2,
          cancellationReason: 'Customer request',
          cancelledAt: undefined,
          createdAt: t0,
          updatedAt: t0,
        });
      }).toThrow(InvalidSaleStateException);
    });

    it('fails if COMPLETED sale is reconstituted without completedAt', () => {
      expect(() => {
        Sale.reconstitute({
          id: SaleId.create(),
          status: SaleStatus.COMPLETED,
          currency: 'USD',
          source: validSource,
          items: [],
          subtotal: Money.zero('USD'),
          discountTotal: Money.zero('USD'),
          total: Money.zero('USD'),
          version: 3,
          completedAt: undefined,
          createdAt: t0,
          updatedAt: t0,
        });
      }).toThrow(InvalidSaleStateException);
    });

    it('fails if REFUNDED sale is reconstituted without refundedAt', () => {
      expect(() => {
        Sale.reconstitute({
          id: SaleId.create(),
          status: SaleStatus.REFUNDED,
          currency: 'USD',
          source: validSource,
          items: [],
          subtotal: Money.zero('USD'),
          discountTotal: Money.zero('USD'),
          total: Money.zero('USD'),
          version: 4,
          refundedAt: undefined,
          createdAt: t0,
          updatedAt: t0,
        });
      }).toThrow(InvalidSaleStateException);
    });

    it('fails if DRAFT sale is reconstituted with terminal timestamps', () => {
      expect(() => {
        Sale.reconstitute({
          id: SaleId.create(),
          status: SaleStatus.DRAFT,
          currency: 'USD',
          source: validSource,
          items: [],
          subtotal: Money.zero('USD'),
          discountTotal: Money.zero('USD'),
          total: Money.zero('USD'),
          version: 1,
          completedAt: t0,
          createdAt: t0,
          updatedAt: t0,
        });
      }).toThrow(InvalidSaleStateException);
    });
  });

  describe('3. Item Operations & Atomicity Guarantees', () => {
    it('addItem rejection leaves aggregate strictly unchanged when currency does not match', () => {
      const sale = createDraftSaleWithItems();
      const snapshot = takeSnapshot(sale);

      expect(() => {
        sale.addItem(
          {
            source: validItemSource,
            description: 'Item in EUR',
            quantity: 1,
            unitPrice: Money.create(25, 'EUR'),
          },
          new FixedClock(new Date('2026-09-01T11:00:00.000Z')),
        );
      }).toThrow(InvalidSaleStateException);

      try {
        sale.addItem({
          source: validItemSource,
          description: 'Item in EUR',
          quantity: 1,
          unitPrice: Money.create(25, 'EUR'),
        });
      } catch (e: unknown) {
        if (e instanceof InvalidSaleStateException) {
          expect(e.code).toBe('INVALID_SALE_STATE');
        }
      }

      assertSnapshotUnchanged(sale, snapshot);
    });

    it('addItem rejection leaves aggregate strictly unchanged when item props violate invariants', () => {
      const sale = createDraftSaleWithItems();
      const snapshot = takeSnapshot(sale);

      // Non-positive quantity
      expect(() => {
        sale.addItem({
          source: validItemSource,
          description: 'Bad Quantity',
          quantity: 0,
          unitPrice: Money.create(10, 'USD'),
        });
      }).toThrow(InvalidSaleItemException);
      assertSnapshotUnchanged(sale, snapshot);

      // Empty description
      expect(() => {
        sale.addItem({
          source: validItemSource,
          description: '   ',
          quantity: 1,
          unitPrice: Money.create(10, 'USD'),
        });
      }).toThrow(InvalidSaleItemException);
      assertSnapshotUnchanged(sale, snapshot);

      // Duplicate item ID
      const existingId = sale.items[0]!.id;
      expect(() => {
        sale.addItem({
          id: existingId,
          source: validItemSource,
          description: 'Duplicate',
          quantity: 1,
          unitPrice: Money.create(10, 'USD'),
        });
      }).toThrow(InvalidSaleStateException);
      assertSnapshotUnchanged(sale, snapshot);
    });

    it('updateItemQuantity rejection leaves item and aggregate state unchanged', () => {
      const sale = createDraftSaleWithItems();
      const targetItem = sale.items[0]!;
      const snapshot = takeSnapshot(sale);

      // Non-existent item ID
      expect(() => {
        sale.updateItemQuantity('non_existent_item_id', 5);
      }).toThrow(InvalidSaleStateException);
      assertSnapshotUnchanged(sale, snapshot);

      // Non-positive quantity
      expect(() => {
        sale.updateItemQuantity(targetItem.id, 0);
      }).toThrow(InvalidSaleItemException);
      assertSnapshotUnchanged(sale, snapshot);

      // Negative quantity
      expect(() => {
        sale.updateItemQuantity(targetItem.id, -3);
      }).toThrow(InvalidSaleItemException);
      assertSnapshotUnchanged(sale, snapshot);

      // NaN quantity
      expect(() => {
        sale.updateItemQuantity(targetItem.id, NaN);
      }).toThrow(InvalidSaleItemException);
      assertSnapshotUnchanged(sale, snapshot);
    });

    it('applyItemDiscount rejection leaves item and aggregate state unchanged', () => {
      const sale = createDraftSaleWithItems();
      const targetItem = sale.items[0]!;
      const snapshot = takeSnapshot(sale);

      // Item not found
      expect(() => {
        sale.applyItemDiscount('unknown_item_id', Discount.percentage(10, 'Test'));
      }).toThrow(InvalidSaleStateException);
      assertSnapshotUnchanged(sale, snapshot);

      // Invalid discount instance
      expect(() => {
        sale.applyItemDiscount(targetItem.id, null as unknown as Discount);
      }).toThrow(InvalidSaleStateException);
      assertSnapshotUnchanged(sale, snapshot);

      // Non-existent discount creation (e.g. >100%)
      expect(() => {
        Discount.percentage(120, 'Excessive');
      }).toThrow(InvalidDiscountException);
      assertSnapshotUnchanged(sale, snapshot);
    });

    it('removeItem rejection leaves aggregate state unchanged when item does not exist', () => {
      const sale = createDraftSaleWithItems();
      const snapshot = takeSnapshot(sale);

      expect(() => {
        sale.removeItem('non_existent_id');
      }).toThrow(InvalidSaleStateException);
      assertSnapshotUnchanged(sale, snapshot);

      expect(() => {
        sale.removeItem('');
      }).toThrow(InvalidSaleStateException);
      assertSnapshotUnchanged(sale, snapshot);
    });

    it('applyOrderDiscount rejection leaves aggregate state unchanged', () => {
      const sale = createDraftSaleWithItems();
      const snapshot = takeSnapshot(sale);

      expect(() => {
        sale.applyOrderDiscount(null as unknown as Discount);
      }).toThrow(InvalidSaleStateException);
      assertSnapshotUnchanged(sale, snapshot);

      expect(() => {
        sale.applyOrderDiscount({ value: 10 } as unknown as Discount);
      }).toThrow(InvalidSaleStateException);
      assertSnapshotUnchanged(sale, snapshot);
    });
  });

  describe('4. Lifecycle State Transitions & Freeze Immutability', () => {
    it('finalizing an empty Sale fails with EmptySaleException and leaves DRAFT state unmutated', () => {
      const sale = Sale.create(
        {
          source: validSource,
          currency: 'USD',
        },
        clock,
      );
      const snapshot = takeSnapshot(sale);

      expect(() => sale.finalize(clock)).toThrow(EmptySaleException);
      try {
        sale.finalize(clock);
      } catch (e: unknown) {
        expect(e).toBeInstanceOf(EmptySaleException);
        if (e instanceof EmptySaleException) {
          expect(e.code).toBe('EMPTY_SALE');
          expect(e).toBeInstanceOf(SaleDomainException);
        }
      }

      assertSnapshotUnchanged(sale, snapshot);
      expect(sale.status).toBe(SaleStatus.DRAFT);
      expect(sale.version).toBe(1);
    });

    it('mutations on finalized or departing DRAFT sale fail with SaleAlreadyFinalizedException and leave aggregate unchanged', () => {
      const sale = createDraftSaleWithItems();
      sale.finalize(clock);
      const snapshot = takeSnapshot(sale);

      // addItem
      expect(() => {
        sale.addItem({
          source: validItemSource,
          description: 'New Post-Finalize Item',
          quantity: 1,
          unitPrice: Money.create(10, 'USD'),
        });
      }).toThrow(SaleAlreadyFinalizedException);
      assertSnapshotUnchanged(sale, snapshot);

      // updateItemQuantity
      expect(() => {
        sale.updateItemQuantity(sale.items[0]!.id, 10);
      }).toThrow(SaleAlreadyFinalizedException);
      assertSnapshotUnchanged(sale, snapshot);

      // applyItemDiscount
      expect(() => {
        sale.applyItemDiscount(sale.items[0]!.id, Discount.percentage(10, 'Promo'));
      }).toThrow(SaleAlreadyFinalizedException);
      assertSnapshotUnchanged(sale, snapshot);

      // removeItemDiscount
      expect(() => {
        sale.removeItemDiscount(sale.items[1]!.id);
      }).toThrow(SaleAlreadyFinalizedException);
      assertSnapshotUnchanged(sale, snapshot);

      // removeItem
      expect(() => {
        sale.removeItem(sale.items[0]!.id);
      }).toThrow(SaleAlreadyFinalizedException);
      assertSnapshotUnchanged(sale, snapshot);

      // applyOrderDiscount
      expect(() => {
        sale.applyOrderDiscount(Discount.percentage(10, 'Order Promo'));
      }).toThrow(SaleAlreadyFinalizedException);
      assertSnapshotUnchanged(sale, snapshot);

      // removeOrderDiscount
      expect(() => {
        sale.removeOrderDiscount();
      }).toThrow(SaleAlreadyFinalizedException);
      assertSnapshotUnchanged(sale, snapshot);
    });

    it('prohibits invalid lifecycle transitions deterministically with InvalidSaleTransitionException', () => {
      const sale = createDraftSaleWithItems();
      const snapshot = takeSnapshot(sale);

      // DRAFT -> PARTIALLY_PAID (must go through PENDING_PAYMENT)
      expect(() => sale.markPartiallyPaid()).toThrow(InvalidSaleTransitionException);
      assertSnapshotUnchanged(sale, snapshot);

      // DRAFT -> PAID
      expect(() => sale.markPaid()).toThrow(InvalidSaleTransitionException);
      assertSnapshotUnchanged(sale, snapshot);

      // DRAFT -> COMPLETED
      expect(() => sale.markCompleted()).toThrow(InvalidSaleTransitionException);
      assertSnapshotUnchanged(sale, snapshot);

      // DRAFT -> REFUNDED
      expect(() => sale.markRefunded('Reason')).toThrow(InvalidSaleTransitionException);
      assertSnapshotUnchanged(sale, snapshot);

      // Finalize to PENDING_PAYMENT
      sale.finalize(clock);
      const pendingSnapshot = takeSnapshot(sale);

      // PENDING_PAYMENT -> COMPLETED (cannot skip payment)
      expect(() => sale.markCompleted()).toThrow(InvalidSaleTransitionException);
      assertSnapshotUnchanged(sale, pendingSnapshot);

      // PENDING_PAYMENT -> REFUNDED (cannot refund unpaid sale)
      expect(() => sale.markRefunded('Refund')).toThrow(InvalidSaleTransitionException);
      assertSnapshotUnchanged(sale, pendingSnapshot);

      // PENDING_PAYMENT -> DRAFT (cannot unfinalize)
      expect(() => sale.finalize()).toThrow(InvalidSaleTransitionException);
      assertSnapshotUnchanged(sale, pendingSnapshot);

      // Transition to PAID
      sale.markPaid(clock);
      const paidSnapshot = takeSnapshot(sale);

      // PAID -> PARTIALLY_PAID (cannot demote from full payment)
      expect(() => sale.markPartiallyPaid()).toThrow(InvalidSaleTransitionException);
      assertSnapshotUnchanged(sale, paidSnapshot);

      // PAID -> CANCELLED (cannot cancel paid agreement)
      expect(() => sale.cancel('Customer changed mind')).toThrow(InvalidSaleTransitionException);
      assertSnapshotUnchanged(sale, paidSnapshot);

      // Complete the sale
      sale.markCompleted(clock);
      const completedSnapshot = takeSnapshot(sale);

      // COMPLETED -> CANCELLED
      expect(() => sale.cancel('Too late')).toThrow(InvalidSaleTransitionException);
      assertSnapshotUnchanged(sale, completedSnapshot);

      // COMPLETED -> PAID
      expect(() => sale.markPaid()).toThrow(InvalidSaleTransitionException);
      assertSnapshotUnchanged(sale, completedSnapshot);

      // Refund the sale
      sale.markRefunded('Defective service batch', clock);
      const refundedSnapshot = takeSnapshot(sale);

      // REFUNDED -> PAID
      expect(() => sale.markPaid()).toThrow(InvalidSaleTransitionException);
      assertSnapshotUnchanged(sale, refundedSnapshot);

      // REFUNDED -> CANCELLED
      expect(() => sale.cancel('Already refunded')).toThrow(InvalidSaleTransitionException);
      assertSnapshotUnchanged(sale, refundedSnapshot);
    });

    it('rejects cancellation without reason deterministically and preserves aggregate state', () => {
      const sale = createDraftSaleWithItems();
      const snapshot = takeSnapshot(sale);

      const invalidReasons = ['', '   ', null as unknown as string, undefined as unknown as string];
      for (const reason of invalidReasons) {
        expect(() => sale.cancel(reason)).toThrow(InvalidSaleStateException);
        try {
          sale.cancel(reason);
        } catch (e: unknown) {
          expect(e).toBeInstanceOf(InvalidSaleStateException);
          if (e instanceof InvalidSaleStateException) {
            expect(e.code).toBe('INVALID_CANCELLATION_REASON');
          }
        }
        assertSnapshotUnchanged(sale, snapshot);
      }
    });

    it('rejects refund with whitespace reason deterministically and preserves aggregate state', () => {
      const sale = createDraftSaleWithItems();
      sale.finalize(clock);
      sale.markPaid(clock);
      const snapshot = takeSnapshot(sale);

      expect(() => sale.markRefunded('')).toThrow(InvalidSaleStateException);
      expect(() => sale.markRefunded('   ')).toThrow(InvalidSaleStateException);

      try {
        sale.markRefunded('   ');
      } catch (e: unknown) {
        expect(e).toBeInstanceOf(InvalidSaleStateException);
        if (e instanceof InvalidSaleStateException) {
          expect(e.code).toBe('INVALID_REFUND_REASON');
        }
      }

      assertSnapshotUnchanged(sale, snapshot);
    });
  });

  describe('5. Value Object Invariant Failures & Error Codes', () => {
    it('SaleId rejects empty or whitespace with INVALID_SALE_ID', () => {
      try {
        SaleId.create('');
        fail('Should have thrown');
      } catch (e: unknown) {
        expect(e).toBeInstanceOf(SaleDomainException);
        if (e instanceof SaleDomainException) {
          expect(e.code).toBe('INVALID_SALE_ID');
        }
      }
    });

    it('SaleItemId rejects empty or whitespace with INVALID_SALE_ITEM_ID', () => {
      try {
        SaleItemId.create('   ');
        fail('Should have thrown');
      } catch (e: unknown) {
        expect(e).toBeInstanceOf(SaleDomainException);
        if (e instanceof SaleDomainException) {
          expect(e.code).toBe('INVALID_SALE_ITEM_ID');
        }
      }
    });

    it('SourceReference rejects invalid SourceType with INVALID_SOURCE_TYPE', () => {
      try {
        SourceReference.create({
          sourceType: 'UNKNOWN' as SourceType,
          sourceId: '123',
        } as SourceReferenceProps);
        fail('Should have thrown');
      } catch (e: unknown) {
        expect(e).toBeInstanceOf(SaleDomainException);
        if (e instanceof SaleDomainException) {
          expect(e.code).toBe('INVALID_SOURCE_TYPE');
        }
      }
    });

    it('SourceReference rejects empty sourceId with INVALID_SOURCE_ID', () => {
      try {
        SourceReference.create({ sourceType: SourceType.INVENTORY_ITEM, sourceId: '' });
        fail('Should have thrown');
      } catch (e: unknown) {
        expect(e).toBeInstanceOf(SaleDomainException);
        if (e instanceof SaleDomainException) {
          expect(e.code).toBe('INVALID_SOURCE_ID');
        }
      }
    });

    it('Discount rejects negative value, >100% percentage, or empty reason with INVALID_DISCOUNT', () => {
      expect(() => Discount.percentage(-5, 'Negative')).toThrow(InvalidDiscountException);
      expect(() => Discount.percentage(101, 'Over 100')).toThrow(InvalidDiscountException);
      expect(() => Discount.percentage(20, '')).toThrow(InvalidDiscountException);
      expect(() => Discount.percentage(20, '   ')).toThrow(InvalidDiscountException);
      expect(() => Discount.fixedAmount(-10, 'Negative')).toThrow(InvalidDiscountException);

      try {
        Discount.percentage(150, 'Too high');
      } catch (e: unknown) {
        expect(e).toBeInstanceOf(InvalidDiscountException);
        if (e instanceof InvalidDiscountException) {
          expect(e.code).toBe('INVALID_DISCOUNT');
        }
      }
    });
  });
});
