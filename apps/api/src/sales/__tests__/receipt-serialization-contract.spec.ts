import {
  PaymentMethod,
  PaymentStatus,
  ReceiptStatus,
  ReceiptDTO,
  Receipt,
  ReceiptId,
  SaleId,
  ReceiptNumber,
  Money,
  ReceiptItemSnapshot,
  ReceiptPaymentSnapshot,
  ReceiptClientSnapshot,
} from '@kinergy-platform/core';
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

  // ==========================================================================
  // 6. Exact Field Whitelist and Public Contract Mapping
  // ==========================================================================
  describe('6. Exact Field Whitelist & Public Contract Mapping', () => {
    it('ensures root ReceiptResponseDto exposes exclusively the 19 approved canonical properties', () => {
      const response = ReceiptResponseDto.fromDTO(sampleDto);
      const actualKeys = Object.keys(response).sort();
      const expectedKeys = [
        'clientSnapshot',
        'currency',
        'discountTotal',
        'id',
        'issuedAt',
        'itemCount',
        'items',
        'lastReprintedAt',
        'paymentMethod',
        'paymentStatus',
        'payments',
        'receiptNumber',
        'reprintCount',
        'saleId',
        'saleReference',
        'status',
        'subtotal',
        'tenantId',
        'total',
      ].sort();

      expect(actualKeys).toEqual(expectedKeys);
    });

    it('ensures line item snapshot exposes exclusively the 10 approved canonical properties', () => {
      const response = ReceiptResponseDto.fromDTO(sampleDto);
      const item = response.items[0]!;
      const actualKeys = Object.keys(item).sort();
      const expectedKeys = [
        'description',
        'discountTotal',
        'itemId',
        'quantity',
        'skuOrCode',
        'sourceId',
        'sourceType',
        'subtotal',
        'total',
        'unitPrice',
      ].sort();

      expect(actualKeys).toEqual(expectedKeys);
    });

    it('ensures payment tender snapshot exposes exclusively the 6 approved canonical properties', () => {
      const response = ReceiptResponseDto.fromDTO(sampleDto);
      const payment = response.payments[0]!;
      const actualKeys = Object.keys(payment).sort();
      const expectedKeys = [
        'amount',
        'method',
        'paidAt',
        'paymentId',
        'reference',
        'status',
      ].sort();

      expect(actualKeys).toEqual(expectedKeys);
    });

    it('ensures client snapshot exposes exclusively the 5 approved canonical properties', () => {
      const response = ReceiptResponseDto.fromDTO(sampleDto);
      const client = response.clientSnapshot!;
      const actualKeys = Object.keys(client).sort();
      const expectedKeys = ['clientId', 'email', 'fullName', 'phone', 'referenceNumber'].sort();

      expect(actualKeys).toEqual(expectedKeys);
    });

    it('ensures structured MoneyResponseDto exposes exclusively the 4 canonical properties', () => {
      const response = ReceiptResponseDto.fromDTO(sampleDto);
      const money = response.total;
      const actualKeys = Object.keys(money).sort();
      const expectedKeys = ['amount', 'cents', 'currency', 'formatted'].sort();

      expect(actualKeys).toEqual(expectedKeys);
    });
  });

  // ==========================================================================
  // 7. Date Serialization Standards (ISO 8601 UTC)
  // ==========================================================================
  describe('7. Date Serialization Standards (ISO 8601 UTC)', () => {
    const iso8601UtcRegex = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z$/;

    it('serializes issuedAt strictly as an ISO 8601 UTC string', () => {
      const response = ReceiptResponseDto.fromDTO(sampleDto);

      expect(typeof response.issuedAt).toBe('string');
      expect(response.issuedAt).toMatch(iso8601UtcRegex);
      expect(response.issuedAt.endsWith('Z')).toBe(true);
      expect(Number.isNaN(Date.parse(response.issuedAt))).toBe(false);
    });

    it('serializes payment paidAt strictly as an ISO 8601 UTC string', () => {
      const response = ReceiptResponseDto.fromDTO(sampleDto);
      const paidAt = response.payments[0]!.paidAt;

      expect(typeof paidAt).toBe('string');
      expect(paidAt).toMatch(iso8601UtcRegex);
      expect(paidAt?.endsWith('Z')).toBe(true);
    });

    it('serializes lastReprintedAt strictly as ISO 8601 UTC when reprinted', () => {
      const reprintedDto: ReceiptDTO = {
        ...sampleDto,
        status: ReceiptStatus.REPRINTED,
        reprintCount: 1,
        lastReprintedAt: '2026-09-25T15:00:00.000Z',
      };

      const response = ReceiptResponseDto.fromDTO(reprintedDto);

      expect(response.status).toBe(ReceiptStatus.REPRINTED);
      expect(response.reprintCount).toBe(1);
      expect(typeof response.lastReprintedAt).toBe('string');
      expect(response.lastReprintedAt).toMatch(iso8601UtcRegex);
    });

    it('ensures timestamps are never exposed as epoch numbers or milliseconds', () => {
      const response = ReceiptResponseDto.fromDTO(sampleDto);
      const parsed = JSON.parse(JSON.stringify(response)) as Record<string, unknown>;

      expect(typeof parsed['issuedAt']).toBe('string');
      expect(typeof parsed['issuedAt']).not.toBe('number');
      const payment = (parsed['payments'] as Array<Record<string, unknown>>)[0]!;
      expect(typeof payment['paidAt']).toBe('string');
      expect(typeof payment['paidAt']).not.toBe('number');
    });
  });

  // ==========================================================================
  // 8. Intentional Nullable Fields Preservation
  // ==========================================================================
  describe('8. Intentional Nullable Fields Preservation', () => {
    it('preserves null for walk-in clientSnapshot without substituting empty objects or values', () => {
      const walkInDto: ReceiptDTO = {
        ...sampleDto,
        clientSnapshot: null,
      };

      const response = ReceiptResponseDto.fromDTO(walkInDto);
      const json = JSON.parse(JSON.stringify(response)) as Record<string, unknown>;

      expect(response.clientSnapshot).toBeNull();
      expect(json['clientSnapshot']).toBeNull();
      expect(json).toHaveProperty('clientSnapshot');
    });

    it('preserves nullable sub-fields on clientSnapshot intentionally', () => {
      const clientWithNulls: ReceiptDTO = {
        ...sampleDto,
        clientSnapshot: {
          clientId: 'cli_partial',
          referenceNumber: null,
          fullName: 'John Walkin',
          email: null,
          phone: null,
        },
      };

      const response = ReceiptResponseDto.fromDTO(clientWithNulls);
      const client = response.clientSnapshot!;

      expect(client.referenceNumber).toBeNull();
      expect(client.email).toBeNull();
      expect(client.phone).toBeNull();
      expect(client.fullName).toBe('John Walkin');

      const json = JSON.parse(JSON.stringify(response)) as {
        clientSnapshot: Record<string, unknown>;
      };
      expect(json.clientSnapshot['referenceNumber']).toBeNull();
      expect(json.clientSnapshot['email']).toBeNull();
      expect(json.clientSnapshot['phone']).toBeNull();
    });

    it('preserves null for skuOrCode when catalog item has no SKU', () => {
      const itemWithNoSku: ReceiptDTO = {
        ...sampleDto,
        items: [
          {
            ...sampleDto.items[0]!,
            skuOrCode: null,
          },
        ],
      };

      const response = ReceiptResponseDto.fromDTO(itemWithNoSku);
      expect(response.items[0]!.skuOrCode).toBeNull();

      const json = JSON.parse(JSON.stringify(response)) as {
        items: Array<Record<string, unknown>>;
      };
      expect(json.items[0]!['skuOrCode']).toBeNull();
    });

    it('preserves null for payment reference and paidAt when absent', () => {
      const paymentWithNulls: ReceiptDTO = {
        ...sampleDto,
        payments: [
          {
            ...sampleDto.payments[0]!,
            reference: null,
            paidAt: null,
          },
        ],
      };

      const response = ReceiptResponseDto.fromDTO(paymentWithNulls);
      expect(response.payments[0]!.reference).toBeNull();
      expect(response.payments[0]!.paidAt).toBeNull();

      const json = JSON.parse(JSON.stringify(response)) as {
        payments: Array<Record<string, unknown>>;
      };
      expect(json.payments[0]!['reference']).toBeNull();
      expect(json.payments[0]!['paidAt']).toBeNull();
    });

    it('preserves null lastReprintedAt for original vouchers (reprintCount === 0)', () => {
      const response = ReceiptResponseDto.fromDTO(sampleDto);

      expect(response.reprintCount).toBe(0);
      expect(response.lastReprintedAt).toBeNull();

      const json = JSON.parse(JSON.stringify(response)) as Record<string, unknown>;
      expect(json['lastReprintedAt']).toBeNull();
      expect(json).toHaveProperty('lastReprintedAt');
    });
  });

  // ==========================================================================
  // 9. Deterministic Item Ordering
  // ==========================================================================
  describe('9. Deterministic Item Ordering', () => {
    it('strictly preserves the positional order of line items from the settled transaction snapshot', () => {
      const orderedItemsDto: ReceiptDTO = {
        ...sampleDto,
        items: [
          {
            itemId: 'item_seq_1_gym_pass',
            sourceType: 'MEMBERSHIP_PLAN',
            sourceId: 'plan_gold',
            description: '1. Day Pass',
            skuOrCode: 'PASS-01',
            quantity: 1,
            unitPrice: { amount: 20.0, currency: 'USD', formatted: '20.00', cents: 2000 },
            discountTotal: { amount: 0.0, currency: 'USD', formatted: '0.00', cents: 0 },
            subtotal: { amount: 20.0, currency: 'USD', formatted: '20.00', cents: 2000 },
            total: { amount: 20.0, currency: 'USD', formatted: '20.00', cents: 2000 },
          },
          {
            itemId: 'item_seq_2_protein',
            sourceType: 'INVENTORY_ITEM',
            sourceId: 'inv_bar',
            description: '2. Protein Bar Chocolate',
            skuOrCode: 'BAR-01',
            quantity: 3,
            unitPrice: { amount: 5.0, currency: 'USD', formatted: '5.00', cents: 500 },
            discountTotal: { amount: 0.0, currency: 'USD', formatted: '0.00', cents: 0 },
            subtotal: { amount: 15.0, currency: 'USD', formatted: '15.00', cents: 1500 },
            total: { amount: 15.0, currency: 'USD', formatted: '15.00', cents: 1500 },
          },
          {
            itemId: 'item_seq_3_towel',
            sourceType: 'INVENTORY_ITEM',
            sourceId: 'inv_towel',
            description: '3. Microfiber Towel',
            skuOrCode: 'TOWL-01',
            quantity: 1,
            unitPrice: { amount: 12.0, currency: 'USD', formatted: '12.00', cents: 1200 },
            discountTotal: { amount: 2.0, currency: 'USD', formatted: '2.00', cents: 200 },
            subtotal: { amount: 12.0, currency: 'USD', formatted: '12.00', cents: 1200 },
            total: { amount: 10.0, currency: 'USD', formatted: '10.00', cents: 1000 },
          },
          {
            itemId: 'item_seq_4_water',
            sourceType: 'INVENTORY_ITEM',
            sourceId: 'inv_water',
            description: '4. Mineral Water 500ml',
            skuOrCode: 'WAT-01',
            quantity: 2,
            unitPrice: { amount: 2.5, currency: 'USD', formatted: '2.50', cents: 250 },
            discountTotal: { amount: 0.0, currency: 'USD', formatted: '0.00', cents: 0 },
            subtotal: { amount: 5.0, currency: 'USD', formatted: '5.00', cents: 500 },
            total: { amount: 5.0, currency: 'USD', formatted: '5.00', cents: 500 },
          },
        ],
        itemCount: 4,
        subtotal: { amount: 52.0, currency: 'USD', formatted: '52.00', cents: 5200 },
        discountTotal: { amount: 2.0, currency: 'USD', formatted: '2.00', cents: 200 },
        total: { amount: 50.0, currency: 'USD', formatted: '50.00', cents: 5000 },
      };

      const response = ReceiptResponseDto.fromDTO(orderedItemsDto);

      // Verify exact 1:1 positional index preservation
      expect(response.items).toHaveLength(4);
      expect(response.items[0]!.itemId).toBe('item_seq_1_gym_pass');
      expect(response.items[1]!.itemId).toBe('item_seq_2_protein');
      expect(response.items[2]!.itemId).toBe('item_seq_3_towel');
      expect(response.items[3]!.itemId).toBe('item_seq_4_water');

      // Verify sequence is preserved even after JSON serialization roundtrip
      const serialized = JSON.parse(JSON.stringify(response)) as {
        items: Array<{ itemId: string }>;
      };
      expect(serialized.items.map((i) => i.itemId)).toEqual([
        'item_seq_1_gym_pass',
        'item_seq_2_protein',
        'item_seq_3_towel',
        'item_seq_4_water',
      ]);
    });
  });

  // ==========================================================================
  // 10. Financial Immutability & Client Tampering Defense
  // ==========================================================================
  describe('10. Financial Immutability & Client Tampering Defense', () => {
    it('ensures response contains NO client-controllable state mutation fields', () => {
      const response = ReceiptResponseDto.fromDTO(sampleDto);
      const parsed = JSON.parse(JSON.stringify(response)) as Record<string, unknown>;

      // Strictly assert absence of mutable billing, debt, retry, or action controls
      expect(parsed).not.toHaveProperty('balanceRemaining');
      expect(parsed).not.toHaveProperty('amountDue');
      expect(parsed).not.toHaveProperty('paymentRetryToken');
      expect(parsed).not.toHaveProperty('overrideDiscount');
      expect(parsed).not.toHaveProperty('writeOffAmount');
      expect(parsed).not.toHaveProperty('paymentUrl');
      expect(parsed).not.toHaveProperty('action');
      expect(parsed).not.toHaveProperty('nextState');
      expect(parsed).not.toHaveProperty('callbackUrl');
    });

    it('ensures status is strictly a terminal proof-of-purchase status (ISSUED or REPRINTED)', () => {
      const response = ReceiptResponseDto.fromDTO(sampleDto);
      expect([ReceiptStatus.ISSUED, ReceiptStatus.REPRINTED]).toContain(response.status);
      expect(response.status).not.toBe('DRAFT');
      expect(response.status).not.toBe('PENDING');
      expect(response.status).not.toBe('CANCELLED');
    });

    it('ensures payments array represents immutable point-in-time settled tenders, not live view', () => {
      const response = ReceiptResponseDto.fromDTO(sampleDto);

      // Payments snapshot must only contain completed payments evidencing the voucher
      for (const payment of response.payments) {
        expect(payment.status).toBe(PaymentStatus.COMPLETED);
        expect(payment.amount.cents).toBeGreaterThan(0);
      }
    });
  });

  // ==========================================================================
  // 11. Direct Domain Aggregate Mapping (fromAggregate)
  // ==========================================================================
  describe('11. Direct Domain Aggregate Mapping (ReceiptResponseDto.fromAggregate)', () => {
    it('constructs an identical ReceiptResponseDto directly from a domain Receipt aggregate', () => {
      const domainReceipt = Receipt.create({
        id: ReceiptId.create('rcpt_agg_01j9876543210abcdef'),
        tenantId: 'tenant_wellness_center',
        saleId: SaleId.create('sale_agg_01j9876543210abcdef'),
        receiptNumber: ReceiptNumber.create('REC-2026-000421'),
        saleReference: 'ORD-2026-0925-001',
        issuedAt: new Date('2026-09-25T14:30:00.000Z'),
        clientSnapshot: ReceiptClientSnapshot.create({
          clientId: 'cli_01j9876543210abcdef',
          referenceNumber: 'CLI-2026-00042',
          fullName: 'Jane Doe',
          email: 'jane.doe@example.com',
          phone: '+1-555-0199',
        }),
        items: [
          ReceiptItemSnapshot.create({
            itemId: 'item_01j9876543210abcdef',
            sourceType: 'MEMBERSHIP_PLAN',
            sourceId: 'mem_plan_gold_annual',
            description: 'Gold Annual Gym Membership',
            skuOrCode: 'GYM-ANN-01',
            quantity: 1,
            unitPrice: Money.create(100.0, 'USD'),
            discountTotal: Money.create(10.0, 'USD'),
            subtotal: Money.create(100.0, 'USD'),
            total: Money.create(90.0, 'USD'),
          }),
        ],
        subtotal: Money.create(100.0, 'USD'),
        discountTotal: Money.create(10.0, 'USD'),
        total: Money.create(90.0, 'USD'),
        payments: [
          ReceiptPaymentSnapshot.create({
            paymentId: 'pay_01j9876543210abcdef',
            method: PaymentMethod.CASH,
            amount: Money.create(90.0, 'USD'),
            status: PaymentStatus.COMPLETED,
            reference: 'DRAWER-01-REGISTER',
            paidAt: new Date('2026-09-25T14:29:45.000Z'),
          }),
        ],
      });

      const response = ReceiptResponseDto.fromAggregate(domainReceipt);

      expect(response).toBeInstanceOf(ReceiptResponseDto);
      expect(response.id).toBe('rcpt_agg_01j9876543210abcdef');
      expect(response.receiptNumber).toBe('REC-2026-000421');
      expect(response.total.cents).toBe(9000);
      expect(response.subtotal.cents).toBe(10000);
      expect(response.discountTotal.cents).toBe(1000);
      expect(response.items[0]!.description).toBe('Gold Annual Gym Membership');
      expect(response.payments[0]!.method).toBe(PaymentMethod.CASH);
      expect(response.clientSnapshot?.fullName).toBe('Jane Doe');
      expect(response.status).toBe(ReceiptStatus.ISSUED);
      expect(response.reprintCount).toBe(0);
      expect(response.lastReprintedAt).toBeNull();
    });
  });
});
