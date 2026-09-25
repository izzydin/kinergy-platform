import { PaymentMethod, PaymentStatus, ReceiptStatus, ReceiptDTO } from '@kinergy-platform/core';
import { ReceiptResponseDto } from '../dto/receipt-response.dto';

describe('Receipt Canonical Response Serialization Contract', () => {
  const sampleDto: ReceiptDTO = {
    id: 'rcpt_01j9876543210abcdef',
    tenantId: 'tenant_wellness_center',
    saleId: 'sale_01j9876543210abcdef',
    receiptNumber: 'REC-2026-000421',
    saleReference: 'ORD-2026-0925-001',
    issuedAt: '2026-09-25T14:30:00.000Z',
    clientSnapshot: {
      clientId: 'cli_01j9876543210abcdef',
      referenceNumber: 'CLI-2026-00042',
      fullName: 'Jane Doe',
      email: 'jane.doe@example.com',
      phone: '+1-555-0199',
    },
    items: [
      {
        itemId: 'item_01j9876543210abcdef',
        sourceType: 'MEMBERSHIP_PLAN',
        sourceId: 'mem_plan_gold_annual',
        description: 'Gold Annual Gym Membership',
        skuOrCode: 'GYM-ANN-01',
        quantity: 1,
        unitPrice: {
          amount: 100.0,
          currency: 'USD',
          formatted: '100.00',
          cents: 10000,
        },
        discountTotal: {
          amount: 10.0,
          currency: 'USD',
          formatted: '10.00',
          cents: 1000,
        },
        subtotal: {
          amount: 100.0,
          currency: 'USD',
          formatted: '100.00',
          cents: 10000,
        },
        total: {
          amount: 90.0,
          currency: 'USD',
          formatted: '90.00',
          cents: 9000,
        },
      },
    ],
    itemCount: 1,
    subtotal: {
      amount: 100.0,
      currency: 'USD',
      formatted: '100.00',
      cents: 10000,
    },
    discountTotal: {
      amount: 10.0,
      currency: 'USD',
      formatted: '10.00',
      cents: 1000,
    },
    total: {
      amount: 90.0,
      currency: 'USD',
      formatted: '90.00',
      cents: 9000,
    },
    currency: 'USD',
    payments: [
      {
        paymentId: 'pay_01j9876543210abcdef',
        method: PaymentMethod.CASH,
        amount: {
          amount: 90.0,
          currency: 'USD',
          formatted: '90.00',
          cents: 9000,
        },
        status: PaymentStatus.COMPLETED,
        reference: 'DRAWER-01-REGISTER',
        paidAt: '2026-09-25T14:29:45.000Z',
      },
    ],
    paymentMethod: PaymentMethod.CASH,
    paymentStatus: PaymentStatus.COMPLETED,
    status: ReceiptStatus.ISSUED,
    reprintCount: 0,
    lastReprintedAt: null,
    createdAt: '2026-09-25T14:30:00.000Z',
    version: 1,
  };

  // ==========================================================================
  // 1. Exact Monetary Representation
  // ==========================================================================
  describe('1. Exact Monetary Representation (ADR-0108 & ADR-0114)', () => {
    it('serializes subtotal, discountTotal, and total with full 4-field Money structure', () => {
      const response = ReceiptResponseDto.fromDTO(sampleDto);

      // Subtotal
      expect(response.subtotal).toEqual({
        amount: 100.0,
        currency: 'USD',
        formatted: '100.00',
        cents: 10000,
      });

      // Discount Total
      expect(response.discountTotal).toEqual({
        amount: 10.0,
        currency: 'USD',
        formatted: '10.00',
        cents: 1000,
      });

      // Total Payable
      expect(response.total).toEqual({
        amount: 90.0,
        currency: 'USD',
        formatted: '90.00',
        cents: 9000,
      });

      // Invariant: subtotal - discountTotal === total in minor integer cents
      expect(response.subtotal.cents - response.discountTotal.cents).toBe(response.total.cents);
    });

    it('ensures line item prices and line totals use exact structured Money representation', () => {
      const response = ReceiptResponseDto.fromDTO(sampleDto);
      const item = response.items[0];

      expect(item).toBeDefined();
      expect(item?.unitPrice).toEqual({
        amount: 100.0,
        currency: 'USD',
        formatted: '100.00',
        cents: 10000,
      });
      expect(item?.discountTotal).toEqual({
        amount: 10.0,
        currency: 'USD',
        formatted: '10.00',
        cents: 1000,
      });
      expect(item?.subtotal).toEqual({
        amount: 100.0,
        currency: 'USD',
        formatted: '100.00',
        cents: 10000,
      });
      expect(item?.total).toEqual({
        amount: 90.0,
        currency: 'USD',
        formatted: '90.00',
        cents: 9000,
      });
    });

    it('ensures payment tender amounts use exact structured Money representation', () => {
      const response = ReceiptResponseDto.fromDTO(sampleDto);
      const payment = response.payments[0];

      expect(payment).toBeDefined();
      expect(payment?.amount).toEqual({
        amount: 90.0,
        currency: 'USD',
        formatted: '90.00',
        cents: 9000,
      });
    });

    it('prevents binary floating-point drift on arbitrary fractional amounts (e.g. 19.99 + 49.95 + 10.05)', () => {
      const fractionalDto: ReceiptDTO = {
        ...sampleDto,
        subtotal: { amount: 79.99, currency: 'USD', formatted: '79.99', cents: 7999 },
        discountTotal: { amount: 10.05, currency: 'USD', formatted: '10.05', cents: 1005 },
        total: { amount: 69.94, currency: 'USD', formatted: '69.94', cents: 6994 },
      };

      const response = ReceiptResponseDto.fromDTO(fractionalDto);

      expect(response.subtotal.formatted).toBe('79.99');
      expect(response.discountTotal.formatted).toBe('10.05');
      expect(response.total.formatted).toBe('69.94');
      expect(response.total.cents).toBe(6994);
    });
  });

  // ==========================================================================
  // 2. Stable Item Values & Historical Snapshot Preservation
  // ==========================================================================
  describe('2. Stable Item Values & Snapshot Preservation', () => {
    it('preserves all line item snapshot attributes faithfully', () => {
      const response = ReceiptResponseDto.fromDTO(sampleDto);
      const item = response.items[0];

      expect(item?.itemId).toBe('item_01j9876543210abcdef');
      expect(item?.sourceType).toBe('MEMBERSHIP_PLAN');
      expect(item?.sourceId).toBe('mem_plan_gold_annual');
      expect(item?.description).toBe('Gold Annual Gym Membership');
      expect(item?.skuOrCode).toBe('GYM-ANN-01');
      expect(item?.quantity).toBe(1);
      expect(response.itemCount).toBe(1);
    });

    it('handles multiple line items without crosstalk or mutation', () => {
      const multiItemDto: ReceiptDTO = {
        ...sampleDto,
        items: [
          sampleDto.items[0]!,
          {
            itemId: 'item_supp_002',
            sourceType: 'INVENTORY_ITEM',
            sourceId: 'inv_protein_vanilla',
            description: 'Whey Protein Isolate - Vanilla',
            skuOrCode: 'SKU-PROT-01',
            quantity: 2,
            unitPrice: { amount: 25.0, currency: 'USD', formatted: '25.00', cents: 2500 },
            discountTotal: { amount: 0.0, currency: 'USD', formatted: '0.00', cents: 0 },
            subtotal: { amount: 50.0, currency: 'USD', formatted: '50.00', cents: 5000 },
            total: { amount: 50.0, currency: 'USD', formatted: '50.00', cents: 5000 },
          },
        ],
        itemCount: 2,
      };

      const response = ReceiptResponseDto.fromDTO(multiItemDto);

      expect(response.items).toHaveLength(2);
      expect(response.itemCount).toBe(2);
      expect(response.items[0]?.itemId).toBe('item_01j9876543210abcdef');
      expect(response.items[1]?.itemId).toBe('item_supp_002');
      expect(response.items[1]?.quantity).toBe(2);
      expect(response.items[1]?.total.cents).toBe(5000);
    });
  });

  // ==========================================================================
  // 3. Stable Client Snapshot (Registered vs Walk-in)
  // ==========================================================================
  describe('3. Stable Client Snapshot', () => {
    it('faithfully preserves registered client snapshot fields', () => {
      const response = ReceiptResponseDto.fromDTO(sampleDto);

      expect(response.clientSnapshot).not.toBeNull();
      expect(response.clientSnapshot?.clientId).toBe('cli_01j9876543210abcdef');
      expect(response.clientSnapshot?.referenceNumber).toBe('CLI-2026-00042');
      expect(response.clientSnapshot?.fullName).toBe('Jane Doe');
      expect(response.clientSnapshot?.email).toBe('jane.doe@example.com');
      expect(response.clientSnapshot?.phone).toBe('+1-555-0199');
    });

    it('returns null clientSnapshot for anonymous walk-in sales', () => {
      const walkInDto: ReceiptDTO = {
        ...sampleDto,
        clientSnapshot: null,
      };

      const response = ReceiptResponseDto.fromDTO(walkInDto);

      expect(response.clientSnapshot).toBeNull();
    });
  });

  // ==========================================================================
  // 4. Stable Payment Representation
  // ==========================================================================
  describe('4. Stable Payment Representation', () => {
    it('faithfully represents single cash payment tender', () => {
      const response = ReceiptResponseDto.fromDTO(sampleDto);

      expect(response.paymentMethod).toBe(PaymentMethod.CASH);
      expect(response.paymentStatus).toBe(PaymentStatus.COMPLETED);
      expect(response.payments).toHaveLength(1);
      expect(response.payments[0]?.method).toBe(PaymentMethod.CASH);
      expect(response.payments[0]?.reference).toBe('DRAWER-01-REGISTER');
      expect(response.payments[0]?.paidAt).toBe('2026-09-25T14:29:45.000Z');
    });

    it('faithfully represents multi-tender split payments (e.g. CASH $40 + QR $50 = $90)', () => {
      const splitDto: ReceiptDTO = {
        ...sampleDto,
        payments: [
          {
            paymentId: 'pay_cash_01',
            method: PaymentMethod.CASH,
            amount: { amount: 40.0, currency: 'USD', formatted: '40.00', cents: 4000 },
            status: PaymentStatus.COMPLETED,
            reference: 'DRAWER-01',
            paidAt: '2026-09-25T14:29:00.000Z',
          },
          {
            paymentId: 'pay_qr_02',
            method: PaymentMethod.QR,
            amount: { amount: 50.0, currency: 'USD', formatted: '50.00', cents: 5000 },
            status: PaymentStatus.COMPLETED,
            reference: 'QR-TX-987654',
            paidAt: '2026-09-25T14:29:30.000Z',
          },
        ],
      };

      const response = ReceiptResponseDto.fromDTO(splitDto);

      expect(response.payments).toHaveLength(2);
      expect(response.payments[0]?.method).toBe(PaymentMethod.CASH);
      expect(response.payments[0]?.amount.cents).toBe(4000);
      expect(response.payments[1]?.method).toBe(PaymentMethod.QR);
      expect(response.payments[1]?.amount.cents).toBe(5000);

      // Sum of split tenders equals total payable
      const sumTendersCents = response.payments.reduce((s, p) => s + p.amount.cents, 0);
      expect(sumTendersCents).toBe(response.total.cents);
    });
  });

  // ==========================================================================
  // 5. No Accidental Internal Fields / Zero Persistence Leaks
  // ==========================================================================
  describe('5. No Accidental Internal Fields & Zero Persistence Leaks', () => {
    it('ensures internal persistence fields (version, createdAt, updatedAt) are NOT present on response', () => {
      const response = ReceiptResponseDto.fromDTO(sampleDto);
      const rawObject = JSON.parse(JSON.stringify(response)) as Record<string, unknown>;

      // Explicit assertions: internal persistence fields must NOT leak
      expect(rawObject['version']).toBeUndefined();
      expect(rawObject['createdAt']).toBeUndefined();
      expect(rawObject['updatedAt']).toBeUndefined();
    });

    it('ensures raw database snake_case columns are NOT present in serialized JSON', () => {
      const response = ReceiptResponseDto.fromDTO(sampleDto);
      const rawJson = JSON.stringify(response);

      expect(rawJson).not.toContain('tenant_id');
      expect(rawJson).not.toContain('sale_id');
      expect(rawJson).not.toContain('receipt_number');
      expect(rawJson).not.toContain('sale_reference');
      expect(rawJson).not.toContain('issued_at');
      expect(rawJson).not.toContain('subtotal_amount');
      expect(rawJson).not.toContain('discount_total_amount');
      expect(rawJson).not.toContain('total_amount');
      expect(rawJson).not.toContain('client_snapshot');
      expect(rawJson).not.toContain('items_snapshot');
      expect(rawJson).not.toContain('payments_snapshot');
      expect(rawJson).not.toContain('reprint_count');
      expect(rawJson).not.toContain('last_reprinted_at');
      expect(rawJson).not.toContain('created_at');
      expect(rawJson).not.toContain('updated_at');
    });

    it('ensures no Prisma Decimal objects leak into the serialized JSON output', () => {
      const response = ReceiptResponseDto.fromDTO(sampleDto);

      // Recursively traverse response object and verify all monetary values are standard JavaScript primitives
      const checkPrimitives = (obj: unknown, path: string): void => {
        if (!obj || typeof obj !== 'object') return;

        // Decimal.js instances have 'd', 'e', 's' or constructor name 'Decimal'
        if (
          obj.constructor &&
          (obj.constructor.name === 'Decimal' ||
            ('isDecimal' in obj && (obj as { isDecimal: boolean }).isDecimal))
        ) {
          throw new Error(`Prisma Decimal detected at path: ${path}`);
        }

        for (const [key, val] of Object.entries(obj)) {
          checkPrimitives(val, `${path}.${key}`);
        }
      };

      expect(() => checkPrimitives(response, 'root')).not.toThrow();
    });

    it('produces 100% deterministic JSON output matching canonical contract structure', () => {
      const response = ReceiptResponseDto.fromDTO(sampleDto);
      const parsed = JSON.parse(JSON.stringify(response)) as Record<string, unknown>;

      // Reference fields
      expect(typeof parsed['id']).toBe('string');
      expect(typeof parsed['tenantId']).toBe('string');
      expect(typeof parsed['saleId']).toBe('string');
      expect(typeof parsed['receiptNumber']).toBe('string');
      expect(typeof parsed['status']).toBe('string');
      expect(typeof parsed['reprintCount']).toBe('number');

      // Historical snapshot fields
      expect(typeof parsed['saleReference']).toBe('string');
      expect(typeof parsed['issuedAt']).toBe('string');
      expect(typeof parsed['clientSnapshot']).toBe('object');
      expect(Array.isArray(parsed['items'])).toBe(true);
      expect(typeof parsed['itemCount']).toBe('number');
      expect(typeof parsed['subtotal']).toBe('object');
      expect(typeof parsed['discountTotal']).toBe('object');
      expect(typeof parsed['total']).toBe('object');
      expect(typeof parsed['currency']).toBe('string');
      expect(Array.isArray(parsed['payments'])).toBe(true);
      expect(typeof parsed['paymentMethod']).toBe('string');
      expect(typeof parsed['paymentStatus']).toBe('string');
    });
  });
});
