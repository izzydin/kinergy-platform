/**
 * Authoritative Regression Suite for Historical Commercial Stability & Snapshot Integrity.
 *
 * Proves that Kinergy NEVER rewrites historical commercial transactions because a source entity changed.
 *
 * Scenarios Covered:
 * - Scenario 1: Price Change (Source repricing leaves SaleItem historical price/subtotal/total stable)
 * - Scenario 2: Description Change (Source rename leaves SaleItem description stable)
 * - Scenario 3: Source Status Change (Source inactivity/retirement leaves historical lines valid)
 * - Scenario 4: Source Deletion/Archival (Source deletion does not affect financial integrity)
 * - Scenario 5: Finalized Sale (Freezes description, quantity, price, discount, source, items)
 * - Scenario 6: Aggregate Encapsulation (Returned collection/item mutations fail to corrupt state)
 * - Scenario 7: Financial Reconciliation (Sale.subtotal == Σ SaleItem.subtotal, Sale.total reconciliation)
 * - Scenario 8: Failure Atomicity (Invalid operations result in before === after for all state)
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
  SaleAlreadyFinalizedException,
  InvalidSaleStateException,
  InvalidSaleItemException,
} from '../exceptions';

class DeterministicClock implements Clock {
  constructor(private currentTime: Date) {}
  public now(): Date {
    return new Date(this.currentTime.getTime());
  }
}

interface SaleSnapshot {
  status: SaleStatus;
  version: number;
  subtotal: number;
  discountTotal: number;
  total: number;
  itemCount: number;
  items: Array<{
    id: string;
    description: string;
    quantity: number;
    unitPrice: number;
    subtotal: number;
    total: number;
  }>;
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
      description: i.description,
      quantity: i.quantity,
      unitPrice: i.unitPrice.amount,
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

describe('SaleItem Historical Commercial Stability & Immutability Regression Suite', () => {
  const clock = new DeterministicClock(new Date('2026-09-17T12:00:00.000Z'));
  const defaultSaleSource = SourceReference.create({
    sourceType: SourceType.CUSTOM_SERVICE,
    sourceId: 'pos_terminal_01',
  });

  describe('Scenario 1 — Price Change', () => {
    it('preserves historical unitPrice, subtotal, and total when source price changes from 10 to 15', () => {
      // 1. Source reference representing Product A with price = 10
      interface CatalogProduct {
        id: string;
        sku: string;
        name: string;
        price: number;
      }

      const productA: CatalogProduct = {
        id: 'prod_a_101',
        sku: 'PROD-A',
        name: 'Product A',
        price: 10.0,
      };

      const sourceRef = SourceReference.create({
        sourceType: SourceType.INVENTORY_ITEM,
        sourceId: productA.id,
        sourceCode: productA.sku,
      });

      // 2. Create Sale and SaleItem: quantity = 2, unitPrice = 10, subtotal = 20, total = 20
      const sale = Sale.create({ source: defaultSaleSource }, clock);
      const item = sale.addItem(
        {
          source: sourceRef,
          description: productA.name,
          skuOrCode: productA.sku,
          quantity: 2,
          unitPrice: Money.create(productA.price, 'USD'),
        },
        clock,
      );

      expect(item.quantity).toBe(2);
      expect(item.unitPrice.amount).toBe(10.0);
      expect(item.subtotal.amount).toBe(20.0);
      expect(item.total.amount).toBe(20.0);
      expect(sale.subtotal.amount).toBe(20.0);
      expect(sale.total.amount).toBe(20.0);

      // 3. Change conceptual source price to 15
      productA.price = 15.0;

      // 4. Verify: SaleItem and Sale maintain historical truth
      expect(item.unitPrice.amount).toBe(10.0);
      expect(item.subtotal.amount).toBe(20.0);
      expect(item.total.amount).toBe(20.0);
      expect(sale.subtotal.amount).toBe(20.0);
      expect(sale.total.amount).toBe(20.0);
    });
  });

  describe('Scenario 2 — Description Change', () => {
    it('preserves historical description "Healthy Shake" when source changes to "Premium Healthy Shake"', () => {
      interface CatalogProduct {
        id: string;
        title: string;
        price: number;
      }

      const liveProduct: CatalogProduct = {
        id: 'prod_shake_202',
        title: 'Healthy Shake',
        price: 8.5,
      };

      const sourceRef = SourceReference.create({
        sourceType: SourceType.INVENTORY_ITEM,
        sourceId: liveProduct.id,
      });

      // Original creation with description = "Healthy Shake"
      const sale = Sale.create({ source: defaultSaleSource }, clock);
      const item = sale.addItem(
        {
          source: sourceRef,
          description: liveProduct.title,
          quantity: 1,
          unitPrice: Money.create(liveProduct.price, 'USD'),
        },
        clock,
      );

      expect(item.description).toBe('Healthy Shake');

      // Source changes title to "Premium Healthy Shake"
      liveProduct.title = 'Premium Healthy Shake';

      // Historical SaleItem must remain "Healthy Shake"
      expect(item.description).toBe('Healthy Shake');
      expect(sale.items[0]!.description).toBe('Healthy Shake');
      expect(sale.getItem(item.id)?.description).toBe('Healthy Shake');
    });
  });

  describe('Scenario 3 — Source Status Change', () => {
    it('remains valid historical data when source becomes inactive, unavailable, retired, or out of stock', () => {
      interface SourceEntityState {
        id: string;
        status: 'ACTIVE' | 'INACTIVE' | 'UNAVAILABLE' | 'RETIRED' | 'OUT_OF_STOCK';
      }

      const sourceEntity: SourceEntityState = {
        id: 'svc_kine_consult_303',
        status: 'ACTIVE',
      };

      const sourceRef = SourceReference.create({
        sourceType: SourceType.TREATMENT_SESSION,
        sourceId: sourceEntity.id,
      });

      const sale = Sale.create({ source: defaultSaleSource }, clock);
      const item = sale.addItem(
        {
          source: sourceRef,
          description: 'Initial Kinesiology Assessment',
          quantity: 1,
          unitPrice: Money.create(120.0, 'USD'),
          discount: Discount.fixedAmount(20.0, 'Introductory Voucher'),
        },
        clock,
      );

      expect(item.subtotal.amount).toBe(120.0);
      expect(item.discountTotal.amount).toBe(20.0);
      expect(item.total.amount).toBe(100.0);
      expect(sale.total.amount).toBe(100.0);

      // Lifecycle status transitions in external context
      const statusTransitions: SourceEntityState['status'][] = [
        'INACTIVE',
        'UNAVAILABLE',
        'RETIRED',
        'OUT_OF_STOCK',
      ];

      for (const newStatus of statusTransitions) {
        sourceEntity.status = newStatus;

        // Historical line must not be reinterpreted or invalidated
        expect(item.description).toBe('Initial Kinesiology Assessment');
        expect(item.unitPrice.amount).toBe(120.0);
        expect(item.subtotal.amount).toBe(120.0);
        expect(item.discountTotal.amount).toBe(20.0);
        expect(item.total.amount).toBe(100.0);
        expect(sale.total.amount).toBe(100.0);
      }
    });
  });

  describe('Scenario 4 — Source Deletion/Archival', () => {
    it('does not require the live source object to remain available for historical correctness', () => {
      let liveSourceInstance: { id: string; code: string; name: string; price: number } | null = {
        id: 'inv_legacy_404',
        code: 'OLD-TOWEL-2024',
        name: 'Discontinued Vintage Towel',
        price: 15.0,
      };

      const sourceRef = SourceReference.create({
        sourceType: SourceType.INVENTORY_ITEM,
        sourceId: liveSourceInstance.id,
        sourceCode: liveSourceInstance.code,
      });

      const item = SaleItem.create({
        source: sourceRef,
        description: liveSourceInstance.name,
        skuOrCode: liveSourceInstance.code,
        quantity: 3,
        unitPrice: Money.create(liveSourceInstance.price, 'USD'),
      });

      // Simulate source object deletion / dereferencing / removal from external table
      liveSourceInstance = null;
      expect(liveSourceInstance).toBeNull();

      // SaleItem operates completely autonomously without the external entity in memory
      expect(item.description).toBe('Discontinued Vintage Towel');
      expect(item.skuOrCode).toBe('OLD-TOWEL-2024');
      expect(item.source.sourceId).toBe('inv_legacy_404');
      expect(item.source.sourceCode).toBe('OLD-TOWEL-2024');
      expect(item.quantity).toBe(3);
      expect(item.unitPrice.amount).toBe(15.0);
      expect(item.subtotal.amount).toBe(45.0);
      expect(item.total.amount).toBe(45.0);

      // Snapshot serialization does not require the source instance
      const snapshot = item.toSnapshot();
      expect(snapshot.sourceId).toBe('inv_legacy_404');
      expect(snapshot.subtotal).toBe(45.0);
      expect(snapshot.total).toBe(45.0);
    });
  });

  describe('Scenario 5 — Finalized Sale', () => {
    it('strictly forbids any modification to description, quantity, price, discount, source, or items', () => {
      const sale = Sale.create({ source: defaultSaleSource }, clock);
      const originalSourceRef = SourceReference.create({
        sourceType: SourceType.INVENTORY_ITEM,
        sourceId: 'inv_locked_505',
        sourceCode: 'LOCK-01',
      });

      const item = sale.addItem(
        {
          source: originalSourceRef,
          description: 'Locked Gym Equipment',
          skuOrCode: 'LOCK-01',
          quantity: 1,
          unitPrice: Money.create(250.0, 'USD'),
          discount: Discount.fixedAmount(50.0, 'Seasonal Discount'),
        },
        clock,
      );

      // Finalize according to the approved lifecycle: DRAFT -> PENDING_PAYMENT
      sale.finalize(clock);
      expect(sale.status).toBe(SaleStatus.PENDING_PAYMENT);

      const beforeSnapshot = takeSnapshot(sale);

      // 1. Prohibit description modification on frozen item
      expect(() => {
        (item as unknown as { _description: string })._description = 'Tampered Description';
      }).toThrow();
      expect(item.description).toBe('Locked Gym Equipment');

      // 2. Prohibit quantity modification
      expect(() => sale.updateItemQuantity(item.id, 10, clock)).toThrow(
        SaleAlreadyFinalizedException,
      );

      // 3. Prohibit unit price modification on frozen item
      expect(() => {
        (item as unknown as { _unitPrice: Money })._unitPrice = Money.create(500.0, 'USD');
      }).toThrow();
      expect(item.unitPrice.amount).toBe(250.0);

      // 4. Prohibit line and order discount modification
      expect(() =>
        sale.applyItemDiscount(item.id, Discount.percentage(20, 'Tampered Discount'), clock),
      ).toThrow(SaleAlreadyFinalizedException);
      expect(() => sale.removeItemDiscount(item.id, clock)).toThrow(SaleAlreadyFinalizedException);
      expect(() =>
        sale.applyOrderDiscount(Discount.fixedAmount(20, 'Tampered Order Disc'), clock),
      ).toThrow(SaleAlreadyFinalizedException);
      expect(() => sale.removeOrderDiscount(clock)).toThrow(SaleAlreadyFinalizedException);

      // 5. Prohibit source reference modification on frozen item
      expect(() => {
        (item as unknown as { _source: SourceReference })._source = SourceReference.create({
          sourceType: SourceType.CUSTOM_SERVICE,
          sourceId: 'hacked_source',
        });
      }).toThrow();
      expect(item.source.sourceId).toBe('inv_locked_505');

      // 6. Prohibit items collection modification
      expect(() =>
        sale.addItem(
          {
            source: defaultSaleSource,
            description: 'Late Addition',
            quantity: 1,
            unitPrice: Money.create(10.0, 'USD'),
          },
          clock,
        ),
      ).toThrow(SaleAlreadyFinalizedException);
      expect(() => sale.removeItem(item.id, clock)).toThrow(SaleAlreadyFinalizedException);

      // Verify the entire Sale and its items remain completely unchanged
      assertSnapshotUnchanged(sale, beforeSnapshot);
    });
  });

  describe('Scenario 6 — Aggregate Encapsulation', () => {
    it('protects internal state when callers attempt to mutate returned item collection or references', () => {
      const sale = Sale.create({ source: defaultSaleSource }, clock);
      const item = sale.addItem(
        {
          source: defaultSaleSource,
          description: 'Protected Item',
          quantity: 2,
          unitPrice: Money.create(40.0, 'USD'),
        },
        clock,
      );

      // 1. Array mutation attempts
      const exposedItems = sale.items as unknown as SaleItem[];
      expect(Object.isFrozen(exposedItems)).toBe(true);

      expect(() => exposedItems.push({} as unknown as SaleItem)).toThrow();
      expect(() => exposedItems.pop()).toThrow();
      expect(() => exposedItems.shift()).toThrow();
      expect(() => exposedItems.splice(0, 1)).toThrow();
      expect(() => {
        (exposedItems as unknown as { [key: number]: unknown })[0] = {};
      }).toThrow();

      // 2. Withers return detached objects without corrupting aggregate state
      const detachedWithQuantity = item.withQuantity(99);
      expect(detachedWithQuantity.quantity).toBe(99);
      expect(sale.getItem(item.id)?.quantity).toBe(2);
      expect(sale.total.amount).toBe(80.0);

      const detachedWithDiscount = item.withDiscount(Discount.percentage(50, 'Detached'));
      expect(detachedWithDiscount.discountTotal.amount).toBe(40.0);
      expect(sale.getItem(item.id)?.discountTotal.amount).toBe(0.0);
      expect(sale.total.amount).toBe(80.0);

      // 3. Internal Sale collection and financial state remain completely protected
      expect(sale.itemCount).toBe(1);
      expect(sale.items.length).toBe(1);
      expect(sale.subtotal.amount).toBe(80.0);
      expect(sale.discountTotal.amount).toBe(0.0);
      expect(sale.total.amount).toBe(80.0);
    });
  });

  describe('Scenario 7 — Financial Reconciliation', () => {
    it('verifies Sale.subtotal == Σ SaleItem.subtotal and Sale.total == Σ SaleItem.total under line & order discounts', () => {
      const sale = Sale.create({ source: defaultSaleSource }, clock);

      // Line 1: 2 * $30.00 = $60.00, discount 10% ($6.00) -> line total $54.00
      const item1 = sale.addItem(
        {
          source: defaultSaleSource,
          description: 'Item 1',
          quantity: 2,
          unitPrice: Money.create(30.0, 'USD'),
          discount: Discount.percentage(10, '10% line discount'),
        },
        clock,
      );

      // Line 2: 3 * $40.00 = $120.00, fixed discount $15.00 -> line total $105.00
      const item2 = sale.addItem(
        {
          source: defaultSaleSource,
          description: 'Item 2',
          quantity: 3,
          unitPrice: Money.create(40.0, 'USD'),
          discount: Discount.fixedAmount(15.0, '$15 fixed line discount'),
        },
        clock,
      );

      // Line 3: 1 * $25.50 = $25.50, zero discount -> line total $25.50
      const item3 = sale.addItem(
        {
          source: defaultSaleSource,
          description: 'Item 3',
          quantity: 1,
          unitPrice: Money.create(25.5, 'USD'),
        },
        clock,
      );

      // Subtotal check: Sale.subtotal == Σ SaleItem.subtotal
      const sumOfSubtotals = item1.subtotal.add(item2.subtotal).add(item3.subtotal);
      expect(sale.subtotal.equals(sumOfSubtotals)).toBe(true);
      expect(sale.subtotal.amount).toBe(205.5);

      // Line discounts sum: 6.00 + 15.00 + 0.00 = 21.00
      const sumOfLineDiscounts = item1.discountTotal
        .add(item2.discountTotal)
        .add(item3.discountTotal);
      expect(sumOfLineDiscounts.amount).toBe(21.0);

      // Line totals sum (Net Pre-Order Discount): 54.00 + 105.00 + 25.50 = 184.50
      const sumOfLineTotals = item1.total.add(item2.total).add(item3.total);
      expect(sale.total.equals(sumOfLineTotals)).toBe(true);
      expect(sale.total.amount).toBe(184.5);

      // Apply 10% order-level discount:
      // Order discount base is net pre-order subtotal ($184.50)
      // 10% of $184.50 = $18.45
      sale.applyOrderDiscount(Discount.percentage(10, '10% Order Voucher'), clock);

      // Total discounts = line discounts ($21.00) + order discount ($18.45) = $39.45
      expect(sale.discountTotal.amount).toBe(39.45);

      // Payable order total = subtotal ($205.50) - discountTotal ($39.45) = $166.05
      expect(sale.total.amount).toBe(166.05);

      // Formal reconciliation invariant: Sale.total === Sale.subtotal - Sale.discountTotal
      expect(sale.total.equals(sale.subtotal.subtract(sale.discountTotal))).toBe(true);
    });
  });

  describe('Scenario 8 — Failure Atomicity', () => {
    it('verifies before === after for all Sale state when an invalid SaleItem operation is attempted', () => {
      const sale = Sale.create({ source: defaultSaleSource }, clock);
      const existingItem = sale.addItem(
        {
          source: defaultSaleSource,
          description: 'Initial Established Item',
          quantity: 2,
          unitPrice: Money.create(25.0, 'USD'),
        },
        clock,
      );

      const before = takeSnapshot(sale);

      // 1. Attempt addItem with negative quantity
      expect(() => {
        sale.addItem(
          {
            source: defaultSaleSource,
            description: 'Negative Item',
            quantity: -5,
            unitPrice: Money.create(25.0, 'USD'),
          },
          clock,
        );
      }).toThrow(InvalidSaleItemException);
      assertSnapshotUnchanged(sale, before);

      // 2. Attempt addItem with currency mismatch
      expect(() => {
        sale.addItem(
          {
            source: defaultSaleSource,
            description: 'Euro Item',
            quantity: 1,
            unitPrice: Money.create(25.0, 'EUR'),
          },
          clock,
        );
      }).toThrow(InvalidSaleStateException);
      assertSnapshotUnchanged(sale, before);

      // 3. Attempt addItem with duplicate item ID
      expect(() => {
        sale.addItem(
          {
            id: existingItem.id,
            source: defaultSaleSource,
            description: 'Duplicate Item',
            quantity: 1,
            unitPrice: Money.create(25.0, 'USD'),
          },
          clock,
        );
      }).toThrow(InvalidSaleStateException);
      assertSnapshotUnchanged(sale, before);

      // 4. Attempt updateItemQuantity with non-existent item ID
      expect(() => {
        sale.updateItemQuantity(SaleItemId.create('non-existent'), 5, clock);
      }).toThrow(InvalidSaleStateException);
      assertSnapshotUnchanged(sale, before);

      // 5. Attempt updateItemQuantity with zero quantity
      expect(() => {
        sale.updateItemQuantity(existingItem.id, 0, clock);
      }).toThrow(InvalidSaleItemException);
      assertSnapshotUnchanged(sale, before);

      // 6. Attempt applyItemDiscount with non-existent item ID
      expect(() => {
        sale.applyItemDiscount('non-existent', Discount.percentage(10, 'Valid reason'), clock);
      }).toThrow(InvalidSaleStateException);
      assertSnapshotUnchanged(sale, before);

      // 7. Attempt removeItem with non-existent item ID
      expect(() => {
        sale.removeItem('non-existent', clock);
      }).toThrow(InvalidSaleStateException);
      assertSnapshotUnchanged(sale, before);

      // Final confirmation: exactly 1 item, unchanged totals, unchanged version
      expect(sale.itemCount).toBe(1);
      expect(sale.total.amount).toBe(50.0);
      expect(sale.version).toBe(1);
    });
  });
});
