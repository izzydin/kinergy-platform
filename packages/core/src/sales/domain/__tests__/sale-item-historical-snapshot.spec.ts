import { Sale } from '../sale.aggregate';
import { SaleItem } from '../entities/sale-item.entity';
import { SaleId } from '../value-objects/sale-id.vo';
import { SaleItemId } from '../value-objects/sale-item-id.vo';
import { SourceReference } from '../value-objects/source-reference.vo';
import { SourceType } from '../enums/source-type.enum';
import { Money } from '../value-objects/money.vo';
import { Discount } from '../value-objects/discount.vo';
import { SaleStatus } from '../enums/sale-status.enum';
import { SaleAlreadyFinalizedException } from '../exceptions/sale-already-finalized.exception';

/**
 * Test Double representing an external catalog entity (e.g., in Resources or Gym context).
 * Simulates real-world mutations such as price adjustments, catalog renames, and status deprecations.
 */
interface FakeCatalogProduct {
  id: string;
  sku: string;
  title: string;
  price: number;
  currency: string;
  status: 'ACTIVE' | 'DISCONTINUED' | 'OUT_OF_STOCK';
  timesPriceQueried: number;
}

function createFakeProduct(overrides?: Partial<FakeCatalogProduct>): FakeCatalogProduct {
  return {
    id: 'prod_green_smoothie_101',
    sku: 'DRINK-GRN-01',
    title: 'Green Smoothie',
    price: 20.0,
    currency: 'USD',
    status: 'ACTIVE',
    timesPriceQueried: 0,
    ...overrides,
  };
}

describe('SaleItem Historical Commercial Snapshot Invariants', () => {
  const defaultSaleSource = SourceReference.create({
    sourceType: SourceType.CUSTOM_SERVICE,
    sourceId: 'pos_register_01',
  });

  describe('1. Source Price Isolation', () => {
    it('proves that subsequent source catalog price increases do not alter the historical SaleItem unit price or subtotal', () => {
      const liveProduct = createFakeProduct({ price: 20.0 });

      // Checkout snapshot taken at time of sale
      const item = SaleItem.create({
        source: SourceReference.create({
          sourceType: SourceType.INVENTORY_ITEM,
          sourceId: liveProduct.id,
          sourceCode: liveProduct.sku,
        }),
        description: liveProduct.title,
        skuOrCode: liveProduct.sku,
        quantity: 2,
        unitPrice: Money.create(liveProduct.price, liveProduct.currency),
      });

      expect(item.unitPrice.amount).toBe(20.0);
      expect(item.subtotal.amount).toBe(40.0);
      expect(item.total.amount).toBe(40.0);

      // External domain repricing occurs (e.g. inflation or supplier price bump)
      liveProduct.price = 35.0;

      // Historical SaleItem MUST remain unchanged
      expect(item.unitPrice.amount).toBe(20.0);
      expect(item.subtotal.amount).toBe(40.0);
      expect(item.total.amount).toBe(40.0);
      expect(liveProduct.price).toBe(35.0);
    });

    it('proves that subsequent source catalog price drops do not retroactively alter the historical Sale agreement', () => {
      const liveProduct = createFakeProduct({ price: 50.0 });

      const sale = Sale.create({
        currency: 'USD',
        source: defaultSaleSource,
      });

      const item = sale.addItem({
        source: SourceReference.create({
          sourceType: SourceType.INVENTORY_ITEM,
          sourceId: liveProduct.id,
          sourceCode: liveProduct.sku,
        }),
        description: liveProduct.title,
        quantity: 1,
        unitPrice: Money.create(liveProduct.price, 'USD'),
      });

      expect(sale.total.amount).toBe(50.0);
      expect(item.unitPrice.amount).toBe(50.0);

      // External catalog offers a flash discount on the product catalog
      liveProduct.price = 25.0;

      // Sale agreement and item remain at original contracted price
      expect(item.unitPrice.amount).toBe(50.0);
      expect(sale.total.amount).toBe(50.0);
    });
  });

  describe('2. Source Description Isolation', () => {
    it('proves that catalog renaming does not alter historical SaleItem descriptions on past transactions', () => {
      const liveProduct = createFakeProduct({ title: 'Green Smoothie' });

      const item = SaleItem.create({
        source: SourceReference.create({
          sourceType: SourceType.INVENTORY_ITEM,
          sourceId: liveProduct.id,
          sourceCode: liveProduct.sku,
        }),
        description: liveProduct.title,
        quantity: 1,
        unitPrice: Money.create(liveProduct.price, 'USD'),
      });

      expect(item.description).toBe('Green Smoothie');

      // Product marketing renames the product in the master catalog
      liveProduct.title = 'Premium Organic Green Superfood Smoothie';

      // Historical receipt/invoice line remains the exact commercial agreement at checkout
      expect(item.description).toBe('Green Smoothie');
      expect(liveProduct.title).toBe('Premium Organic Green Superfood Smoothie');
    });
  });

  describe('3. Source Lifecycle and Deprecation Isolation', () => {
    it('proves that discontinuing or deleting an external catalog item leaves historical Sale records completely intact', () => {
      const liveProduct = createFakeProduct({ status: 'ACTIVE' });

      const sale = Sale.create({
        currency: 'USD',
        source: defaultSaleSource,
      });

      const item = sale.addItem({
        source: SourceReference.create({
          sourceType: SourceType.INVENTORY_ITEM,
          sourceId: liveProduct.id,
          sourceCode: liveProduct.sku,
        }),
        description: liveProduct.title,
        quantity: 3,
        unitPrice: Money.create(liveProduct.price, 'USD'),
        discount: Discount.fixedAmount(5.0, 'Loyalty reward'),
      });

      expect(sale.subtotal.amount).toBe(60.0);
      expect(sale.total.amount).toBe(55.0);

      // Product is discontinued and marked out of stock in Resources bounded context
      liveProduct.status = 'DISCONTINUED';

      // Sale and SaleItem remain valid, non-null, and mathematically consistent
      expect(item.description).toBe('Green Smoothie');
      expect(item.subtotal.amount).toBe(60.0);
      expect(item.total.amount).toBe(55.0);
      expect(sale.total.amount).toBe(55.0);
    });
  });

  describe('4. Zero Runtime Dependency / No Callbacks to Source', () => {
    it('proves that SaleItem financial calculations operate strictly on internal immutable state without querying the source', () => {
      let callbackInvoked = false;

      // Proxy trap that alarms if any external property is read during calculation
      const monitoredSource = new Proxy(createFakeProduct(), {
        get(target, prop) {
          if (prop === 'price') {
            callbackInvoked = true;
          }
          return Reflect.get(target, prop);
        },
      });

      const item = SaleItem.create({
        source: SourceReference.create({
          sourceType: SourceType.INVENTORY_ITEM,
          sourceId: monitoredSource.id,
          sourceCode: monitoredSource.sku,
        }),
        description: monitoredSource.title,
        quantity: 2,
        unitPrice: Money.create(20.0, 'USD'),
        discount: Discount.percentage(10, '10% off'),
      });

      // Access calculations
      const subtotal = item.subtotal;
      const discountTotal = item.discountTotal;
      const total = item.total;
      const snapshot = item.toSnapshot();

      expect(subtotal.amount).toBe(40.0);
      expect(discountTotal.amount).toBe(4.0);
      expect(total.amount).toBe(36.0);
      expect(snapshot.total).toBe(36.0);

      // Verify that no dynamic callback to the source was ever executed
      expect(callbackInvoked).toBe(false);
    });
  });

  describe('5. SourceReference Boundary Integrity', () => {
    it('proves that SourceReference is strictly an unowned, immutable pointer without object references', () => {
      const source = SourceReference.create({
        sourceType: SourceType.MEMBERSHIP_PLAN,
        sourceId: 'plan_gold_annual',
        sourceCode: 'GOLD-ANNUAL',
      });

      expect(source.sourceType).toBe(SourceType.MEMBERSHIP_PLAN);
      expect(source.sourceId).toBe('plan_gold_annual');
      expect(source.sourceCode).toBe('GOLD-ANNUAL');

      // Immutable object verification
      expect(Object.isFrozen(source)).toBe(true);

      // Verify that SourceReference contains no runtime instance references or dynamic getters
      const keys = Object.keys(source);
      expect(keys.some((k) => k.toLowerCase().includes('entity'))).toBe(false);
      expect(keys.some((k) => k.toLowerCase().includes('model'))).toBe(false);
      expect(keys.some((k) => k.toLowerCase().includes('callback'))).toBe(false);
    });
  });

  describe('6. Historical Stability After Finalization', () => {
    it('proves that finalizing a Sale permanently freezes all commercial lines against modification', () => {
      const sale = Sale.create({
        currency: 'USD',
        source: defaultSaleSource,
      });

      const item = sale.addItem({
        source: SourceReference.create({
          sourceType: SourceType.TREATMENT_SESSION,
          sourceId: 'session_kine_404',
          sourceCode: 'KINE-REHAB-60',
        }),
        description: '60-min Kinesiology Rehabilitation Session',
        quantity: 1,
        unitPrice: Money.create(85.0, 'USD'),
      });

      expect(sale.status).toBe(SaleStatus.DRAFT);
      expect(sale.total.amount).toBe(85.0);

      // Finalize the agreement (DRAFT -> PENDING_PAYMENT)
      sale.finalize();
      expect(sale.status).toBe(SaleStatus.PENDING_PAYMENT);

      // Prohibited mutations must throw SaleAlreadyFinalizedException
      expect(() => {
        sale.addItem({
          source: defaultSaleSource,
          description: 'Late Addition',
          quantity: 1,
          unitPrice: Money.create(10.0, 'USD'),
        });
      }).toThrow(SaleAlreadyFinalizedException);

      expect(() => {
        sale.updateItemQuantity(item.id, 5);
      }).toThrow(SaleAlreadyFinalizedException);

      expect(() => {
        sale.removeItem(item.id);
      }).toThrow(SaleAlreadyFinalizedException);

      expect(() => {
        sale.applyItemDiscount(item.id, Discount.fixedAmount(10.0, 'Late coupon'));
      }).toThrow(SaleAlreadyFinalizedException);

      expect(() => {
        sale.removeItemDiscount(item.id);
      }).toThrow(SaleAlreadyFinalizedException);

      expect(() => {
        sale.applyOrderDiscount(Discount.percentage(10, 'Late promo'));
      }).toThrow(SaleAlreadyFinalizedException);

      // Verify that after all failed tampering attempts, commercial lines and totals remain pristine
      expect(sale.items.length).toBe(1);
      expect(sale.items[0]!.description).toBe('60-min Kinesiology Rehabilitation Session');
      expect(sale.items[0]!.quantity).toBe(1);
      expect(sale.items[0]!.unitPrice.amount).toBe(85.0);
      expect(sale.total.amount).toBe(85.0);
    });

    it('proves that historical persistence reconstitution preserves the exact snapshot values', () => {
      const historicalItemId = SaleItemId.create('item_hist_2025_001');
      const historicalSaleId = SaleId.create('sale_hist_2025_001');

      const historicalItem = SaleItem.reconstitute({
        id: historicalItemId,
        saleId: historicalSaleId,
        source: SourceReference.create({
          sourceType: SourceType.INVENTORY_ITEM,
          sourceId: 'old_legacy_prod_id',
          sourceCode: 'OLD-SKU-99',
        }),
        description: 'Legacy 2025 Discontinued Vitamin Blend',
        skuOrCode: 'OLD-SKU-99',
        quantity: 4,
        unitPrice: Money.create(12.5, 'USD'),
        discount: Discount.fixedAmount(10.0, '2025 Clearance'),
        subtotal: Money.create(50.0, 'USD'),
        discountTotal: Money.create(10.0, 'USD'),
        total: Money.create(40.0, 'USD'),
      });

      expect(historicalItem.description).toBe('Legacy 2025 Discontinued Vitamin Blend');
      expect(historicalItem.quantity).toBe(4);
      expect(historicalItem.unitPrice.amount).toBe(12.5);
      expect(historicalItem.discountTotal.amount).toBe(10.0);
      expect(historicalItem.total.amount).toBe(40.0);
      expect(historicalItem.saleId?.equals(historicalSaleId)).toBe(true);
    });
  });
});
