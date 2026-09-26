import { Sale } from '../sale.aggregate';
import { SaleItem } from '../entities/sale-item.entity';
import { SaleId } from '../value-objects/sale-id.vo';
import { SaleItemId } from '../value-objects/sale-item-id.vo';
import { Money } from '../value-objects/money.vo';
import { Discount } from '../value-objects/discount.vo';
import { SourceReference } from '../value-objects/source-reference.vo';
import { SourceType } from '../enums/source-type.enum';
import { InvalidSaleStateException } from '../exceptions/invalid-sale-state.exception';
import { SaleAlreadyFinalizedException } from '../exceptions/sale-already-finalized.exception';
import { SaleStatus } from '../enums/sale-status.enum';
import { PrismaSaleItemMapper } from '../../infrastructure/persistence/prisma/mappers/prisma-sale-item.mapper';
import { PrismaSaleMapper } from '../../infrastructure/persistence/prisma/mappers/prisma-sale.mapper';

describe('SaleItem Ownership Hardening & Aggregate Boundaries', () => {
  const clp1000 = Money.create(1000, 'CLP');
  const clp2000 = Money.create(2000, 'CLP');
  const usd50 = Money.create(50, 'USD');

  const sourceRef = SourceReference.create({
    sourceType: SourceType.INVENTORY_ITEM,
    sourceId: 'inv-item-123',
    sourceCode: 'PROTEIN-01',
  });

  const createDraftSale = (idValue?: string): Sale => {
    return Sale.create({
      id: idValue ? SaleId.create(idValue) : undefined,
      currency: 'CLP',
      clientId: 'client-abc-001',
      source: SourceReference.create({
        sourceType: SourceType.CUSTOM_SERVICE,
        sourceId: 'pos-01',
      }),
    });
  };

  describe('1. Adding Valid Items & Ownership Binding', () => {
    it('should add a valid item through AddSaleItemProps and bind saleId to the aggregate root', () => {
      const sale = createDraftSale('sale-001');

      const item = sale.addItem({
        description: 'Whey Protein 1kg',
        quantity: 2,
        unitPrice: clp1000,
        source: sourceRef,
      });

      expect(sale.items).toHaveLength(1);
      expect(item.saleId).toBeDefined();
      expect(item.saleId!.value).toBe(sale.id.value);
      expect(item.belongsTo(sale.id)).toBe(true);
      expect(item.belongsTo(sale.id.value)).toBe(true);
      expect(sale.subtotal.amount).toBe(2000);
      expect(sale.total.amount).toBe(2000);
      expect(sale.itemCount).toBe(1);
    });

    it('should accept an explicit matching saleId in AddSaleItemProps', () => {
      const sale = createDraftSale('sale-001');

      const item = sale.addItem({
        saleId: sale.id,
        description: 'Creatine Monohydrate',
        quantity: 1,
        unitPrice: clp2000,
        source: sourceRef,
      });

      expect(item.saleId!.equals(sale.id)).toBe(true);
      expect(item.belongsTo(sale.id)).toBe(true);
    });

    it('should accept a pre-constructed SaleItem if it was constructed for this exact Sale', () => {
      const sale = createDraftSale('sale-001');
      const directItem = SaleItem.create({
        saleId: sale.id,
        description: 'BCAA 500g',
        quantity: 1,
        unitPrice: clp1000,
        source: sourceRef,
      });

      const added = sale.addItem(directItem);

      expect(added.id.value).toBe(directItem.id.value);
      expect(added.belongsTo(sale.id)).toBe(true);
      expect(sale.items).toHaveLength(1);
    });
  });

  describe('2. Rejecting Invalid Items', () => {
    it('should reject null or undefined props', () => {
      const sale = createDraftSale();
      expect(() => (sale as unknown as { addItem: (arg: unknown) => void }).addItem(null)).toThrow(
        InvalidSaleStateException,
      );
      expect(() =>
        (sale as unknown as { addItem: (arg: unknown) => void }).addItem(undefined),
      ).toThrow(InvalidSaleStateException);
    });

    it('should reject items with invalid or non-Money unitPrice', () => {
      const sale = createDraftSale();
      expect(() =>
        sale.addItem({
          description: 'Invalid Item',
          quantity: 1,
          unitPrice: null as unknown as Money,
          source: sourceRef,
        }),
      ).toThrow(InvalidSaleStateException);

      expect(() =>
        sale.addItem({
          description: 'Invalid Item',
          quantity: 1,
          unitPrice: { amount: 1000, currency: 'CLP' } as unknown as Money,
          source: sourceRef,
        }),
      ).toThrow('SaleItem unitPrice must be a valid Money instance.');
    });

    it('should reject currency mismatch between item and parent Sale', () => {
      const sale = createDraftSale('sale-clp'); // CLP
      expect(() =>
        sale.addItem({
          description: 'USD Item',
          quantity: 1,
          unitPrice: usd50, // USD
          source: sourceRef,
        }),
      ).toThrow(InvalidSaleStateException);
    });

    it('should reject duplicate SaleItem IDs within the aggregate', () => {
      const sale = createDraftSale('sale-001');
      const itemId = SaleItemId.create('item-fixed-id-01');

      sale.addItem({
        id: itemId,
        description: 'First Item',
        quantity: 1,
        unitPrice: clp1000,
        source: sourceRef,
      });

      expect(() =>
        sale.addItem({
          id: itemId,
          description: 'Duplicate Item ID',
          quantity: 2,
          unitPrice: clp1000,
          source: sourceRef,
        }),
      ).toThrow(InvalidSaleStateException);
    });
  });

  describe('3. Rejecting Wrong Aggregate Ownership & Cross-Sale Attachment', () => {
    it('should strictly reject attaching a SaleItem belonging to another Sale', () => {
      const saleA = createDraftSale('sale-A');
      const saleB = createDraftSale('sale-B');

      // Item explicitly created for Sale A
      const foreignItem = SaleItem.create({
        saleId: saleA.id,
        description: 'Protein Shake',
        quantity: 1,
        unitPrice: clp1000,
        source: sourceRef,
      });

      expect(() => saleB.addItem(foreignItem)).toThrow(
        expect.objectContaining({
          message: expect.stringContaining('Cross-Sale item attachment is strictly prohibited'),
          code: 'CROSS_SALE_ITEM_ATTACHMENT_PROHIBITED',
        }),
      );
    });

    it('should reject props containing a foreign saleId', () => {
      const saleA = createDraftSale('sale-A');
      const saleB = createDraftSale('sale-B');

      expect(() =>
        saleB.addItem({
          saleId: saleA.id,
          description: 'Protein Bar',
          quantity: 2,
          unitPrice: clp1000,
          source: sourceRef,
        }),
      ).toThrow(
        expect.objectContaining({
          message: expect.stringContaining('Cross-Sale item attachment is strictly prohibited'),
          code: 'CROSS_SALE_ITEM_ATTACHMENT_PROHIBITED',
        }),
      );
    });

    it('should reject reconstituting a Sale with items belonging to a different saleId', () => {
      const foreignItem = SaleItem.create({
        saleId: SaleId.create('sale-foreign'),
        description: 'Towel',
        quantity: 1,
        unitPrice: clp1000,
        source: sourceRef,
      });

      expect(() =>
        Sale.reconstitute({
          id: SaleId.create('sale-target'),
          clientId: 'client-001',
          currency: 'CLP',
          source: SourceReference.create({
            sourceType: SourceType.CUSTOM_SERVICE,
            sourceId: 'pos-1',
          }),
          subtotal: clp1000,
          discountTotal: Money.zero('CLP'),
          total: clp1000,
          items: [foreignItem],
          status: SaleStatus.DRAFT,
          version: 1,
          createdAt: new Date(),
          updatedAt: new Date(),
        }),
      ).toThrow(
        expect.objectContaining({
          code: 'CROSS_SALE_ITEM_ATTACHMENT_PROHIBITED',
        }),
      );
    });

    it('item.belongsTo correctly discriminates ownership identity', () => {
      const saleA = createDraftSale('sale-A');
      const saleB = createDraftSale('sale-B');

      const item = saleA.addItem({
        description: 'Gym Pass',
        quantity: 1,
        unitPrice: clp1000,
        source: sourceRef,
      });

      expect(item.belongsTo(saleA.id)).toBe(true);
      expect(item.belongsTo(saleA.id.value)).toBe(true);
      expect(item.belongsTo(saleB.id)).toBe(false);
      expect(item.belongsTo('non-existent-sale-id')).toBe(false);
    });
  });

  describe('4. Controlled Item Removal', () => {
    it('should remove an item and deterministically update totals and item count', () => {
      const sale = createDraftSale('sale-001');
      const item1 = sale.addItem({
        description: 'Item 1',
        quantity: 2,
        unitPrice: clp1000,
        source: sourceRef,
      });
      const item2 = sale.addItem({
        description: 'Item 2',
        quantity: 1,
        unitPrice: clp2000,
        source: sourceRef,
      });

      expect(sale.items).toHaveLength(2);
      expect(sale.total.amount).toBe(4000);

      sale.removeItem(item1.id);

      expect(sale.items).toHaveLength(1);
      expect(sale.items[0]?.id.value).toBe(item2.id.value);
      expect(sale.total.amount).toBe(2000);
      expect(sale.subtotal.amount).toBe(2000);
      expect(sale.itemCount).toBe(1);
    });

    it('should throw when attempting to remove non-existent item', () => {
      const sale = createDraftSale();
      expect(() => sale.removeItem('unknown-item-id')).toThrow(InvalidSaleStateException);
    });

    it('should reject item removal after finalization', () => {
      const sale = createDraftSale();
      const item = sale.addItem({
        description: 'Item 1',
        quantity: 1,
        unitPrice: clp1000,
        source: sourceRef,
      });
      sale.markPendingPayment();

      expect(() => sale.removeItem(item.id)).toThrow(SaleAlreadyFinalizedException);
    });
  });

  describe('5. Controlled Item Update & Snapshot Behavior', () => {
    it('should update item quantity and discount through updateItem while preserving ownership', () => {
      const sale = createDraftSale('sale-001');
      const item = sale.addItem({
        description: 'Item 1',
        quantity: 1,
        unitPrice: clp1000,
        source: sourceRef,
      });

      const updated = sale.updateItem(item.id, {
        quantity: 3,
        discount: Discount.fixed(1000, 'VIP Discount'),
      });

      expect(updated.quantity).toBe(3);
      expect(updated.subtotal.amount).toBe(3000);
      expect(updated.discountTotal.amount).toBe(1000);
      expect(updated.total.amount).toBe(2000);
      expect(updated.saleId!.value).toBe(sale.id.value);
      expect(updated.belongsTo(sale.id)).toBe(true);

      expect(sale.subtotal.amount).toBe(3000);
      expect(sale.discountTotal.amount).toBe(1000);
      expect(sale.total.amount).toBe(2000);
    });

    it('should reject updates on non-existent items', () => {
      const sale = createDraftSale();
      expect(() => sale.updateItem('non-existent', { quantity: 5 })).toThrow(
        InvalidSaleStateException,
      );
    });

    it('should reject updates after finalization', () => {
      const sale = createDraftSale();
      const item = sale.addItem({
        description: 'Item',
        quantity: 1,
        unitPrice: clp1000,
        source: sourceRef,
      });
      sale.markPendingPayment();

      expect(() => sale.updateItem(item.id, { quantity: 2 })).toThrow(
        SaleAlreadyFinalizedException,
      );
    });
  });

  describe('6. Public Domain Collection Immutability', () => {
    it('should freeze the returned items array preventing public push() or splice()', () => {
      const sale = createDraftSale('sale-001');
      sale.addItem({
        description: 'Item',
        quantity: 1,
        unitPrice: clp1000,
        source: sourceRef,
      });

      const itemsCollection = sale.items;
      expect(Object.isFrozen(itemsCollection)).toBe(true);

      const arbitraryItem = SaleItem.create({
        saleId: sale.id,
        description: 'Injected item',
        quantity: 1,
        unitPrice: clp1000,
        source: sourceRef,
      });

      // Public unrestricted collection mutation must throw TypeError
      expect(() => (itemsCollection as unknown as SaleItem[]).push(arbitraryItem)).toThrow(
        TypeError,
      );
      expect(() => (itemsCollection as unknown as SaleItem[]).splice(0, 1)).toThrow(TypeError);

      // Verify internal aggregate was untouched
      expect(sale.items).toHaveLength(1);
      expect(sale.itemCount).toBe(1);
    });

    it('mutating a returned SaleItem instance should not affect aggregate state because entities are immutable', () => {
      const sale = createDraftSale('sale-001');
      const item = sale.addItem({
        description: 'Item',
        quantity: 1,
        unitPrice: clp1000,
        source: sourceRef,
      });

      // Calling withQuantity returns a new SaleItem, does not mutate existing
      const modifiedCopy = item.withQuantity(5);
      expect(modifiedCopy.quantity).toBe(5);
      expect(item.quantity).toBe(1);
      expect(sale.items[0]?.quantity).toBe(1);
      expect(sale.total.amount).toBe(1000);
    });
  });

  describe('7. Persistence Consistency & Anti-Bypass Protections', () => {
    it('PrismaSaleItemMapper.toPersistence must strictly reject detached items without parent saleId', () => {
      const detachedItem = SaleItem.create({
        description: 'Detached Item',
        quantity: 1,
        unitPrice: clp1000,
        source: sourceRef,
      });

      expect(() => PrismaSaleItemMapper.toPersistence(detachedItem)).toThrow(
        expect.objectContaining({
          code: 'DETACHED_SALE_ITEM_PERSISTENCE_PROHIBITED',
        }),
      );
    });

    it('PrismaSaleItemMapper.toPersistence must strictly reject cross-Sale persistence mismatch', () => {
      const itemBelongingToSaleA = SaleItem.create({
        saleId: SaleId.create('sale-A'),
        description: 'Item of Sale A',
        quantity: 1,
        unitPrice: clp1000,
        source: sourceRef,
      });

      expect(() => PrismaSaleItemMapper.toPersistence(itemBelongingToSaleA, 'sale-B')).toThrow(
        expect.objectContaining({
          code: 'CROSS_SALE_PERSISTENCE_PROHIBITED',
        }),
      );
    });

    it('PrismaSaleItemMapper.toPersistence succeeds and correctly binds saleId when consistent', () => {
      const item = SaleItem.create({
        saleId: SaleId.create('sale-A'),
        description: 'Consistent Item',
        quantity: 2,
        unitPrice: clp1000,
        source: sourceRef,
      });

      const persisted = PrismaSaleItemMapper.toPersistence(item, 'sale-A');
      expect(persisted.saleId).toBe('sale-A');
      expect(persisted.id).toBe(item.id.value);
    });

    it('PrismaSaleMapper.toPersistence guarantees all mapped items belong strictly to the Sale aggregate id', () => {
      const sale = createDraftSale('sale-root-001');
      sale.addItem({
        description: 'Item 1',
        quantity: 2,
        unitPrice: clp1000,
        source: sourceRef,
      });
      sale.addItem({
        description: 'Item 2',
        quantity: 3,
        unitPrice: clp2000,
        source: sourceRef,
      });

      const { sale: persistedSale, items: persistedItems } = PrismaSaleMapper.toPersistence(sale);

      expect(persistedSale.id).toBe('sale-root-001');
      expect(persistedItems).toHaveLength(2);
      for (const item of persistedItems) {
        expect(item.saleId).toBe('sale-root-001');
      }
    });
  });
});
