import {
  discountSchema,
  recordPaymentSchema,
  cancelSaleSchema,
  lineItemSchema,
  createSaleSchema,
} from '../schemas';

describe('Sales Validation Schemas', () => {
  describe('discountSchema', () => {
    it('validates a valid percentage discount', () => {
      const result = discountSchema.safeParse({
        type: 'PERCENTAGE',
        value: 15,
        reason: 'Holiday special',
      });
      expect(result.success).toBe(true);
    });

    it('rejects percentage discount greater than 100%', () => {
      const result = discountSchema.safeParse({
        type: 'PERCENTAGE',
        value: 105,
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error?.issues[0]?.message).toMatch(/cannot exceed 100%/i);
      }
    });

    it('validates a valid fixed discount', () => {
      const result = discountSchema.safeParse({
        type: 'FIXED',
        value: 50.0,
      });
      expect(result.success).toBe(true);
    });

    it('rejects zero or negative discount value', () => {
      const result = discountSchema.safeParse({
        type: 'FIXED',
        value: 0,
      });
      expect(result.success).toBe(false);
    });
  });

  describe('recordPaymentSchema', () => {
    it('validates valid cash payment tender', () => {
      const result = recordPaymentSchema.safeParse({
        method: 'CASH',
        amount: 25.5,
        reference: 'DRAWER-01',
      });
      expect(result.success).toBe(true);
    });

    it('rejects unsupported payment method', () => {
      const result = recordPaymentSchema.safeParse({
        method: 'BITCOIN',
        amount: 50,
      });
      expect(result.success).toBe(false);
    });

    it('rejects non-positive payment amount', () => {
      const result = recordPaymentSchema.safeParse({
        method: 'CARD',
        amount: 0,
      });
      expect(result.success).toBe(false);
    });
  });

  describe('cancelSaleSchema', () => {
    it('validates valid cancellation reason', () => {
      const result = cancelSaleSchema.safeParse({
        reason: 'Customer requested cancellation before tender',
      });
      expect(result.success).toBe(true);
    });

    it('rejects reason shorter than 3 characters or whitespace only', () => {
      const result = cancelSaleSchema.safeParse({
        reason: '  no ',
      });
      expect(result.success).toBe(false);
    });
  });

  describe('createSaleSchema and lineItemSchema', () => {
    it('validates a complete sale creation payload', () => {
      const result = createSaleSchema.safeParse({
        currency: 'USD',
        clientId: 'cli_01j987654321',
        items: [
          {
            sourceType: 'INVENTORY_ITEM',
            sourceId: 'inv_item_protein_01',
            description: 'Whey Protein Isolate 1kg',
            unitPrice: 45.0,
            quantity: 2,
            discount: {
              type: 'PERCENTAGE',
              value: 10,
            },
          },
        ],
        orderDiscount: {
          type: 'FIXED',
          value: 5.0,
          reason: 'Manager goodwill',
        },
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.currency).toBe('USD');
        expect(result.data.items).toHaveLength(1);
        expect(result.data.items?.[0]?.quantity).toBe(2);
      }
    });

    it('rejects line item with zero quantity', () => {
      const result = lineItemSchema.safeParse({
        sourceType: 'INVENTORY_ITEM',
        sourceId: 'inv_01',
        description: 'Bar',
        unitPrice: 2.5,
        quantity: 0,
      });
      expect(result.success).toBe(false);
    });

    it('rejects line item with negative unit price', () => {
      const result = lineItemSchema.safeParse({
        sourceType: 'INVENTORY_ITEM',
        sourceId: 'inv_01',
        description: 'Bar',
        unitPrice: -5.0,
        quantity: 1,
      });
      expect(result.success).toBe(false);
    });
  });
});
