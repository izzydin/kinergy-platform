import {
  InventoryCategory,
  InventoryItemStatus,
  StockMovementType,
  UnitOfMeasure,
  createProductSchema,
  receiveStockSchema,
  sellStockSchema,
  consumeStockSchema,
  scrapStockSchema,
  adjustStockSchema,
  inventoryQueryKeys,
} from '../index';

describe('Inventory Foundation & Contracts', () => {
  describe('Domain Enums', () => {
    it('verifies exported status and movement type values', () => {
      expect(InventoryItemStatus.ACTIVE).toBe('ACTIVE');
      expect(StockMovementType.PURCHASE).toBe('PURCHASE');
    });
  });

  describe('Zod Validation Schemas', () => {
    it('validates a correct create product payload', () => {
      const validData = {
        sku: 'PROT-WHEY-1KG',
        name: 'Grass-Fed Whey Protein Isolate',
        description: '1kg bag vanilla flavour',
        category: InventoryCategory.SUPPLEMENTS,
        unitCost: 28.5,
        sellingPrice: 49.99,
        quantityOnHand: 20,
        reorderThreshold: 5,
        unitOfMeasure: UnitOfMeasure.UNITS,
      };

      const result = createProductSchema.safeParse(validData);
      expect(result.success).toBe(true);
    });

    it('rejects an invalid SKU with forbidden characters', () => {
      const invalidData = {
        sku: 'PROT WHEY @@@',
        name: 'Whey Protein',
        category: InventoryCategory.SUPPLEMENTS,
        unitCost: 20,
        sellingPrice: 40,
      };

      const result = createProductSchema.safeParse(invalidData);
      expect(result.success).toBe(false);
    });

    it('validates stock receipt payload', () => {
      const payload = {
        quantity: 10,
        unitCost: 25.0,
        referenceNumber: 'PO-2026-0901',
        notes: 'Delivered by distributor',
      };

      const result = receiveStockSchema.safeParse(payload);
      expect(result.success).toBe(true);
    });

    it('rejects stock receipt with non-positive quantity', () => {
      const payload = {
        quantity: 0,
        referenceNumber: 'PO-2026-0901',
      };

      const result = receiveStockSchema.safeParse(payload);
      expect(result.success).toBe(false);
    });

    it('validates retail sale payload', () => {
      const payload = {
        quantity: 2,
        unitPrice: 50.0,
        referenceId: 'REC-9912',
        notes: 'Front desk cash sale',
      };

      const result = sellStockSchema.safeParse(payload);
      expect(result.success).toBe(true);
    });

    it('validates clinical treatment consumption payload', () => {
      const payload = {
        quantity: 1,
        treatmentSessionId: 'SESS-10492',
        notes: 'Applied during rehab session',
      };

      const result = consumeStockSchema.safeParse(payload);
      expect(result.success).toBe(true);
    });

    it('validates scrap disposal payload with mandatory reason', () => {
      const payload = {
        quantity: 3,
        reason: 'Expired past shelf life',
      };

      const result = scrapStockSchema.safeParse(payload);
      expect(result.success).toBe(true);
    });

    it('rejects scrap disposal with empty or short reason', () => {
      const payload = {
        quantity: 3,
        reason: 'Bad',
      };

      const result = scrapStockSchema.safeParse(payload);
      expect(result.success).toBe(false);
    });

    it('validates physical count adjustment with non-zero delta', () => {
      const payload = {
        deltaQuantity: -2,
        reason: 'Audit shrinkage reconciliation',
      };

      const result = adjustStockSchema.safeParse(payload);
      expect(result.success).toBe(true);
    });

    it('rejects adjustment with 0 delta', () => {
      const payload = {
        deltaQuantity: 0,
        reason: 'Zero delta is invalid',
      };

      const result = adjustStockSchema.safeParse(payload);
      expect(result.success).toBe(false);
    });
  });

  describe('Query Key Factories', () => {
    it('constructs deterministic query keys for inventory catalog and detail', () => {
      expect(inventoryQueryKeys.all).toEqual(['resources', 'inventory']);
      expect(inventoryQueryKeys.categories()).toEqual(['resources', 'inventory', 'categories']);
      expect(inventoryQueryKeys.lowStock()).toEqual(['resources', 'inventory', 'low-stock']);
      expect(inventoryQueryKeys.valuation()).toEqual(['resources', 'valuation', 'inventory']);
      expect(inventoryQueryKeys.lists()).toEqual(['resources', 'inventory', 'list']);
      expect(inventoryQueryKeys.list({ search: 'whey', page: 2 })).toEqual([
        'resources',
        'inventory',
        'list',
        { search: 'whey', page: 2 },
      ]);
      expect(inventoryQueryKeys.detail('item-123')).toEqual([
        'resources',
        'inventory',
        'detail',
        'item-123',
      ]);
      expect(inventoryQueryKeys.stock('item-123')).toEqual([
        'resources',
        'inventory',
        'detail',
        'item-123',
        'stock',
      ]);
      expect(inventoryQueryKeys.movements('item-123', { page: 1, limit: 10 })).toEqual([
        'resources',
        'inventory',
        'detail',
        'item-123',
        'movements',
        { page: 1, limit: 10 },
      ]);
    });
  });
});
