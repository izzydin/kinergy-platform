import { Receipt } from '../receipt.aggregate';
import { ReceiptId } from '../value-objects/receipt-id.vo';
import { ReceiptNumber } from '../value-objects/receipt-number.vo';
import { SaleId } from '../value-objects/sale-id.vo';
import { Money } from '../value-objects/money.vo';
import { ReceiptClientSnapshot } from '../value-objects/receipt-client-snapshot.vo';
import { ReceiptItemSnapshot } from '../value-objects/receipt-item-snapshot.vo';
import { ReceiptPaymentSnapshot } from '../value-objects/receipt-payment-snapshot.vo';
import { ReceiptStatus } from '../enums/receipt-status.enum';
import { PaymentMethod } from '../enums/payment-method.enum';
import { PaymentStatus } from '../enums/payment-status.enum';
import { ReceiptDomainException } from '../exceptions/receipt-domain.exception';
import { ReceiptIssuedEvent, ReceiptReprintedEvent } from '../events';
import { Clock } from '../shared/clock';

describe('Receipt Aggregate Root (Domain Specification)', () => {
  const fixedNow = new Date('2026-09-24T12:00:00.000Z');
  const mockClock: Clock = {
    now: () => new Date(fixedNow.getTime()),
  };

  const createValidItemSnapshot = (
    overrides?: Partial<Parameters<typeof ReceiptItemSnapshot.create>[0]>,
  ) => {
    const unitPrice = overrides?.unitPrice ?? Money.create('25.00', 'USD');
    const quantity = overrides?.quantity ?? 2;
    const subtotal = overrides?.subtotal ?? Money.create('50.00', 'USD');
    const discountTotal = overrides?.discountTotal ?? Money.create('5.00', 'USD');
    const total = overrides?.total ?? Money.create('45.00', 'USD');

    return ReceiptItemSnapshot.create({
      itemId: 'item_1',
      sourceType: 'INVENTORY_ITEM',
      sourceId: 'inv_101',
      description: 'Protein Shake Powder',
      skuOrCode: 'PROT-VAN-01',
      quantity,
      unitPrice,
      subtotal,
      discountTotal,
      total,
      ...overrides,
    });
  };

  const createValidPaymentSnapshot = (
    overrides?: Partial<Parameters<typeof ReceiptPaymentSnapshot.create>[0]>,
  ) => {
    return ReceiptPaymentSnapshot.create({
      paymentId: 'pay_1',
      method: PaymentMethod.CASH,
      amount: Money.create('45.00', 'USD'),
      status: PaymentStatus.COMPLETED,
      reference: 'DRAWER-1',
      paidAt: new Date(fixedNow.getTime()),
      ...overrides,
    });
  };

  const createValidClientSnapshot = (
    overrides?: Partial<Parameters<typeof ReceiptClientSnapshot.create>[0]>,
  ) => {
    return ReceiptClientSnapshot.create({
      clientId: 'cli_1',
      referenceNumber: 'CLI-2026-00001',
      fullName: 'John Doe',
      email: 'john.doe@example.com',
      phone: '+15551234567',
      ...overrides,
    });
  };

  describe('1. Valid Receipt Creation', () => {
    it('creates a valid Receipt with full client snapshot and single tender', () => {
      const item = createValidItemSnapshot();
      const payment = createValidPaymentSnapshot();
      const client = createValidClientSnapshot();

      const receipt = Receipt.create(
        {
          id: 'rec_1001',
          tenantId: 'tenant_1',
          saleId: 'sale_2001',
          receiptNumber: 'REC-2026-000001',
          saleReference: 'REF-SALE-2001',
          clientSnapshot: client,
          items: [item],
          subtotal: Money.create('50.00', 'USD'),
          discountTotal: Money.create('5.00', 'USD'),
          total: Money.create('45.00', 'USD'),
          payments: [payment],
        },
        mockClock,
      );

      expect(receipt.id.value).toBe('rec_1001');
      expect(receipt.tenantId).toBe('tenant_1');
      expect(receipt.saleId.value).toBe('sale_2001');
      expect(receipt.receiptNumber.value).toBe('REC-2026-000001');
      expect(receipt.saleReference).toBe('REF-SALE-2001');
      expect(receipt.issuedAt).toEqual(fixedNow);
      expect(receipt.status).toBe(ReceiptStatus.ISSUED);
      expect(receipt.isReprint).toBe(false);
      expect(receipt.reprintCount).toBe(0);
      expect(receipt.lastReprintedAt).toBeNull();
      expect(receipt.version).toBe(1);
      expect(receipt.currency).toBe('USD');

      // Client verification
      expect(receipt.clientSnapshot).not.toBeNull();
      expect(receipt.clientSnapshot?.clientId).toBe('cli_1');
      expect(receipt.clientSnapshot?.fullName).toBe('John Doe');

      // Item verification
      expect(receipt.itemCount).toBe(1);
      expect(receipt.items[0]!.description).toBe('Protein Shake Powder');
      expect(receipt.subtotal.amount).toBe(50.0);
      expect(receipt.discountTotal.amount).toBe(5.0);
      expect(receipt.total.amount).toBe(45.0);
      expect(receipt.total.toString()).toBe('45.00 USD');

      // Payment verification
      expect(receipt.payments.length).toBe(1);
      expect(receipt.paymentMethod).toBe(PaymentMethod.CASH);
      expect(receipt.paymentStatus).toBe(PaymentStatus.COMPLETED);

      // Domain Event verification
      const events = receipt.getUncommittedEvents();
      expect(events.length).toBe(1);
      expect(events[0]).toBeInstanceOf(ReceiptIssuedEvent);
      expect((events[0] as ReceiptIssuedEvent).payload.receiptNumber).toBe('REC-2026-000001');
    });

    it('creates a valid Receipt without client snapshot (walk-in cash customer)', () => {
      const item = createValidItemSnapshot({
        quantity: 1,
        unitPrice: Money.create('10.00', 'USD'),
        subtotal: Money.create('10.00', 'USD'),
        discountTotal: Money.create('0.00', 'USD'),
        total: Money.create('10.00', 'USD'),
      });
      const payment = createValidPaymentSnapshot({
        amount: Money.create('10.00', 'USD'),
      });

      const receipt = Receipt.create(
        {
          tenantId: 'tenant_1',
          saleId: 'sale_2002',
          receiptNumber: 'REC-2026-000002',
          saleReference: 'REF-SALE-2002',
          clientSnapshot: null,
          items: [item],
          subtotal: Money.create('10.00', 'USD'),
          discountTotal: Money.create('0.00', 'USD'),
          total: Money.create('10.00', 'USD'),
          payments: [payment],
        },
        mockClock,
      );

      expect(receipt.clientSnapshot).toBeNull();
      expect(receipt.total.amount).toBe(10.0);
    });

    it('creates a valid Receipt with multiple payment tenders (split tender)', () => {
      const item = createValidItemSnapshot({
        quantity: 1,
        unitPrice: Money.create('100.00', 'USD'),
        subtotal: Money.create('100.00', 'USD'),
        discountTotal: Money.create('0.00', 'USD'),
        total: Money.create('100.00', 'USD'),
      });
      const cashPayment = createValidPaymentSnapshot({
        paymentId: 'pay_cash',
        method: PaymentMethod.CASH,
        amount: Money.create('60.00', 'USD'),
      });
      const qrPayment = createValidPaymentSnapshot({
        paymentId: 'pay_qr',
        method: PaymentMethod.QR,
        amount: Money.create('40.00', 'USD'),
      });

      const receipt = Receipt.create(
        {
          tenantId: 'tenant_1',
          saleId: 'sale_split',
          receiptNumber: 'REC-2026-000003',
          saleReference: 'REF-SPLIT',
          items: [item],
          subtotal: Money.create('100.00', 'USD'),
          discountTotal: Money.create('0.00', 'USD'),
          total: Money.create('100.00', 'USD'),
          payments: [cashPayment, qrPayment],
        },
        mockClock,
      );

      expect(receipt.payments.length).toBe(2);
      expect(receipt.payments[0]!.method).toBe(PaymentMethod.CASH);
      expect(receipt.payments[1]!.method).toBe(PaymentMethod.QR);
      expect(receipt.paymentMethod).toBe(PaymentMethod.CASH);
    });

    it('automatically generates ReceiptId if omitted in create factory', () => {
      const item = createValidItemSnapshot();
      const payment = createValidPaymentSnapshot();

      const receipt = Receipt.create(
        {
          tenantId: 'tenant_1',
          saleId: 'sale_2004',
          receiptNumber: 'REC-2026-000004',
          saleReference: 'REF-SALE-2004',
          items: [item],
          subtotal: Money.create('50.00', 'USD'),
          discountTotal: Money.create('5.00', 'USD'),
          total: Money.create('45.00', 'USD'),
          payments: [payment],
        },
        mockClock,
      );

      expect(receipt.id).toBeInstanceOf(ReceiptId);
      expect(receipt.id.value.startsWith('rec_')).toBe(true);
    });
  });

  describe('2. Invalid Identifiers & References', () => {
    it('rejects empty or whitespace ReceiptId', () => {
      expect(() => ReceiptId.create('')).toThrow(ReceiptDomainException);
      expect(() => ReceiptId.create('   ')).toThrow(ReceiptDomainException);
    });

    it('rejects empty or whitespace ReceiptNumber', () => {
      expect(() => ReceiptNumber.create('')).toThrow(ReceiptDomainException);
      expect(() => ReceiptNumber.create('   ')).toThrow(ReceiptDomainException);
    });

    it('rejects ReceiptNumber with invalid characters or unsupported length', () => {
      expect(() => ReceiptNumber.create('AB')).toThrow(ReceiptDomainException); // too short (<3)
      expect(() => ReceiptNumber.create('REC#2026@123')).toThrow(ReceiptDomainException); // invalid symbols
      expect(() => ReceiptNumber.create('A'.repeat(51))).toThrow(ReceiptDomainException); // > 50 chars
    });

    it('rejects empty or whitespace tenantId', () => {
      const item = createValidItemSnapshot();
      const payment = createValidPaymentSnapshot();

      expect(() =>
        Receipt.create(
          {
            tenantId: '   ',
            saleId: 'sale_1',
            receiptNumber: 'REC-001',
            saleReference: 'REF-1',
            items: [item],
            subtotal: Money.create('50.00', 'USD'),
            discountTotal: Money.create('5.00', 'USD'),
            total: Money.create('45.00', 'USD'),
            payments: [payment],
          },
          mockClock,
        ),
      ).toThrow(ReceiptDomainException);
    });

    it('rejects empty or whitespace saleReference', () => {
      const item = createValidItemSnapshot();
      const payment = createValidPaymentSnapshot();

      expect(() =>
        Receipt.create(
          {
            tenantId: 'tenant_1',
            saleId: 'sale_1',
            receiptNumber: 'REC-001',
            saleReference: '   ',
            items: [item],
            subtotal: Money.create('50.00', 'USD'),
            discountTotal: Money.create('5.00', 'USD'),
            total: Money.create('45.00', 'USD'),
            payments: [payment],
          },
          mockClock,
        ),
      ).toThrow(ReceiptDomainException);
    });
  });

  describe('3. Invalid Dates', () => {
    it('rejects invalid issuedAt date', () => {
      const item = createValidItemSnapshot();
      const payment = createValidPaymentSnapshot();

      expect(() =>
        Receipt.create(
          {
            tenantId: 'tenant_1',
            saleId: 'sale_1',
            receiptNumber: 'REC-001',
            saleReference: 'REF-1',
            issuedAt: new Date('invalid-date'),
            items: [item],
            subtotal: Money.create('50.00', 'USD'),
            discountTotal: Money.create('5.00', 'USD'),
            total: Money.create('45.00', 'USD'),
            payments: [payment],
          },
          mockClock,
        ),
      ).toThrow(ReceiptDomainException);
    });
  });

  describe('4. Negative Money & Arithmetic Reconciliation', () => {
    it('rejects receipt when subtotal minus discountTotal does not equal total', () => {
      const item = createValidItemSnapshot();
      const payment = createValidPaymentSnapshot();

      expect(() =>
        Receipt.create(
          {
            tenantId: 'tenant_1',
            saleId: 'sale_1',
            receiptNumber: 'REC-001',
            saleReference: 'REF-1',
            items: [item],
            subtotal: Money.create('50.00', 'USD'),
            discountTotal: Money.create('5.00', 'USD'),
            total: Money.create('40.00', 'USD'), // Inconsistent: 50 - 5 = 45, not 40
            payments: [payment],
          },
          mockClock,
        ),
      ).toThrow(ReceiptDomainException);
    });

    it('rejects receipt when sum of item subtotals does not equal receipt subtotal', () => {
      const item = createValidItemSnapshot();
      const payment = createValidPaymentSnapshot();

      expect(() =>
        Receipt.create(
          {
            tenantId: 'tenant_1',
            saleId: 'sale_1',
            receiptNumber: 'REC-001',
            saleReference: 'REF-1',
            items: [item], // item subtotal is 50.00
            subtotal: Money.create('60.00', 'USD'), // mismatch
            discountTotal: Money.create('5.00', 'USD'),
            total: Money.create('55.00', 'USD'),
            payments: [payment],
          },
          mockClock,
        ),
      ).toThrow(ReceiptDomainException);
    });

    it('rejects item snapshot when quantity * unitPrice does not equal subtotal', () => {
      expect(() =>
        ReceiptItemSnapshot.create({
          itemId: 'item_1',
          sourceType: 'INVENTORY_ITEM',
          sourceId: 'inv_1',
          description: 'Item',
          quantity: 2,
          unitPrice: Money.create('10.00', 'USD'),
          subtotal: Money.create('25.00', 'USD'), // 2 * 10 = 20, not 25
          discountTotal: Money.zero('USD'),
          total: Money.create('25.00', 'USD'),
        }),
      ).toThrow(ReceiptDomainException);
    });

    it('rejects item snapshot when subtotal minus discountTotal does not equal total', () => {
      expect(() =>
        ReceiptItemSnapshot.create({
          itemId: 'item_1',
          sourceType: 'INVENTORY_ITEM',
          sourceId: 'inv_1',
          description: 'Item',
          quantity: 2,
          unitPrice: Money.create('10.00', 'USD'),
          subtotal: Money.create('20.00', 'USD'),
          discountTotal: Money.create('5.00', 'USD'),
          total: Money.create('12.00', 'USD'), // 20 - 5 = 15, not 12
        }),
      ).toThrow(ReceiptDomainException);
    });
  });

  describe('5. Invalid Quantities & Items', () => {
    it('rejects receipt with empty items array', () => {
      const payment = createValidPaymentSnapshot();

      expect(() =>
        Receipt.create(
          {
            tenantId: 'tenant_1',
            saleId: 'sale_1',
            receiptNumber: 'REC-001',
            saleReference: 'REF-1',
            items: [],
            subtotal: Money.zero('USD'),
            discountTotal: Money.zero('USD'),
            total: Money.zero('USD'),
            payments: [payment],
          },
          mockClock,
        ),
      ).toThrow(ReceiptDomainException);
    });

    it('rejects item snapshot with zero or negative quantity', () => {
      expect(() =>
        ReceiptItemSnapshot.create({
          itemId: 'item_1',
          sourceType: 'INVENTORY_ITEM',
          sourceId: 'inv_1',
          description: 'Item',
          quantity: 0,
          unitPrice: Money.create('10.00', 'USD'),
          subtotal: Money.zero('USD'),
          discountTotal: Money.zero('USD'),
          total: Money.zero('USD'),
        }),
      ).toThrow(ReceiptDomainException);

      expect(() =>
        ReceiptItemSnapshot.create({
          itemId: 'item_1',
          sourceType: 'INVENTORY_ITEM',
          sourceId: 'inv_1',
          description: 'Item',
          quantity: -2,
          unitPrice: Money.create('10.00', 'USD'),
          subtotal: Money.create('-20.00', 'USD', { allowNegative: true }),
          discountTotal: Money.zero('USD'),
          total: Money.zero('USD'),
        }),
      ).toThrow(ReceiptDomainException);
    });

    it('rejects currency mismatch between item and receipt total', () => {
      const itemCad = createValidItemSnapshot({
        unitPrice: Money.create('25.00', 'CAD'),
        subtotal: Money.create('50.00', 'CAD'),
        discountTotal: Money.create('5.00', 'CAD'),
        total: Money.create('45.00', 'CAD'),
      });
      const payment = createValidPaymentSnapshot();

      expect(() =>
        Receipt.create(
          {
            tenantId: 'tenant_1',
            saleId: 'sale_1',
            receiptNumber: 'REC-001',
            saleReference: 'REF-1',
            items: [itemCad],
            subtotal: Money.create('50.00', 'USD'),
            discountTotal: Money.create('5.00', 'USD'),
            total: Money.create('45.00', 'USD'),
            payments: [payment],
          },
          mockClock,
        ),
      ).toThrow(ReceiptDomainException);
    });
  });

  describe('6. Invalid Payment Representation & Underpayment', () => {
    it('rejects receipt with empty payments array', () => {
      const item = createValidItemSnapshot();

      expect(() =>
        Receipt.create(
          {
            tenantId: 'tenant_1',
            saleId: 'sale_1',
            receiptNumber: 'REC-001',
            saleReference: 'REF-1',
            items: [item],
            subtotal: Money.create('50.00', 'USD'),
            discountTotal: Money.create('5.00', 'USD'),
            total: Money.create('45.00', 'USD'),
            payments: [],
          },
          mockClock,
        ),
      ).toThrow(ReceiptDomainException);
    });

    it('rejects payment snapshot with unsettled status (e.g. PENDING, FAILED, CANCELLED)', () => {
      expect(() =>
        ReceiptPaymentSnapshot.create({
          paymentId: 'pay_pending',
          method: PaymentMethod.CASH,
          amount: Money.create('45.00', 'USD'),
          status: PaymentStatus.PENDING,
        }),
      ).toThrow(ReceiptDomainException);

      expect(() =>
        ReceiptPaymentSnapshot.create({
          paymentId: 'pay_failed',
          method: PaymentMethod.QR,
          amount: Money.create('45.00', 'USD'),
          status: PaymentStatus.FAILED,
        }),
      ).toThrow(ReceiptDomainException);

      expect(() =>
        ReceiptPaymentSnapshot.create({
          paymentId: 'pay_cancelled',
          method: PaymentMethod.CASH,
          amount: Money.create('45.00', 'USD'),
          status: PaymentStatus.CANCELLED,
        }),
      ).toThrow(ReceiptDomainException);
    });

    it('rejects receipt if sum of settled payments is less than total payable (underpayment check)', () => {
      const item = createValidItemSnapshot();
      const partialPayment = createValidPaymentSnapshot({
        amount: Money.create('30.00', 'USD'), // total is 45.00
      });

      expect(() =>
        Receipt.create(
          {
            tenantId: 'tenant_1',
            saleId: 'sale_1',
            receiptNumber: 'REC-001',
            saleReference: 'REF-1',
            items: [item],
            subtotal: Money.create('50.00', 'USD'),
            discountTotal: Money.create('5.00', 'USD'),
            total: Money.create('45.00', 'USD'),
            payments: [partialPayment],
          },
          mockClock,
        ),
      ).toThrow(ReceiptDomainException);
    });

    it('rejects payment currency mismatch against receipt total currency', () => {
      const item = createValidItemSnapshot();
      const paymentCad = createValidPaymentSnapshot({
        amount: Money.create('45.00', 'CAD'),
      });

      expect(() =>
        Receipt.create(
          {
            tenantId: 'tenant_1',
            saleId: 'sale_1',
            receiptNumber: 'REC-001',
            saleReference: 'REF-1',
            items: [item],
            subtotal: Money.create('50.00', 'USD'),
            discountTotal: Money.create('5.00', 'USD'),
            total: Money.create('45.00', 'USD'),
            payments: [paymentCad],
          },
          mockClock,
        ),
      ).toThrow(ReceiptDomainException);
    });
  });

  describe('7. Snapshot Immutability & Prototype Defense', () => {
    it('returns frozen copies of items and payments collections', () => {
      const item = createValidItemSnapshot();
      const payment = createValidPaymentSnapshot();

      const receipt = Receipt.create(
        {
          tenantId: 'tenant_1',
          saleId: 'sale_1',
          receiptNumber: 'REC-001',
          saleReference: 'REF-1',
          items: [item],
          subtotal: Money.create('50.00', 'USD'),
          discountTotal: Money.create('5.00', 'USD'),
          total: Money.create('45.00', 'USD'),
          payments: [payment],
        },
        mockClock,
      );

      expect(Object.isFrozen(receipt.items)).toBe(true);
      expect(Object.isFrozen(receipt.payments)).toBe(true);

      // Attempting to push to frozen array throws TypeError in strict mode
      expect(() => {
        (receipt.items as ReceiptItemSnapshot[]).push(item);
      }).toThrow();
    });

    it('ensures no setter exists on Receipt prototype for financial and status fields', () => {
      const descriptorStatus = Object.getOwnPropertyDescriptor(Receipt.prototype, 'status');
      expect(descriptorStatus?.set).toBeUndefined();

      const descriptorTotal = Object.getOwnPropertyDescriptor(Receipt.prototype, 'total');
      expect(descriptorTotal?.set).toBeUndefined();

      const descriptorSubtotal = Object.getOwnPropertyDescriptor(Receipt.prototype, 'subtotal');
      expect(descriptorSubtotal?.set).toBeUndefined();

      const descriptorDiscount = Object.getOwnPropertyDescriptor(
        Receipt.prototype,
        'discountTotal',
      );
      expect(descriptorDiscount?.set).toBeUndefined();
    });
  });

  describe('8. Reprint Lifecycle & Events', () => {
    it('transitions to REPRINTED, increments reprintCount, and records ReceiptReprintedEvent', () => {
      const item = createValidItemSnapshot();
      const payment = createValidPaymentSnapshot();

      const receipt = Receipt.create(
        {
          tenantId: 'tenant_1',
          saleId: 'sale_1',
          receiptNumber: 'REC-001',
          saleReference: 'REF-1',
          items: [item],
          subtotal: Money.create('50.00', 'USD'),
          discountTotal: Money.create('5.00', 'USD'),
          total: Money.create('45.00', 'USD'),
          payments: [payment],
        },
        mockClock,
      );

      receipt.clearEvents();

      const reprintTime = new Date('2026-09-24T12:30:00.000Z');
      const reprintClock: Clock = { now: () => reprintTime };

      // First reprint
      receipt.recordReprint(reprintClock);

      expect(receipt.status).toBe(ReceiptStatus.REPRINTED);
      expect(receipt.isReprint).toBe(true);
      expect(receipt.reprintCount).toBe(1);
      expect(receipt.lastReprintedAt).toEqual(reprintTime);
      expect(receipt.version).toBe(2);

      const events = receipt.getUncommittedEvents();
      expect(events.length).toBe(1);
      expect(events[0]).toBeInstanceOf(ReceiptReprintedEvent);
      expect((events[0] as ReceiptReprintedEvent).payload.reprintCount).toBe(1);

      // Second reprint
      const secondReprintTime = new Date('2026-09-24T13:00:00.000Z');
      receipt.recordReprint({ now: () => secondReprintTime });

      expect(receipt.status).toBe(ReceiptStatus.REPRINTED);
      expect(receipt.reprintCount).toBe(2);
      expect(receipt.lastReprintedAt).toEqual(secondReprintTime);
      expect(receipt.version).toBe(3);
    });
  });

  describe('9. Reconstitution from Persistence', () => {
    it('reconstitutes an existing Receipt faithfully preserving version and timestamps', () => {
      const item = createValidItemSnapshot();
      const payment = createValidPaymentSnapshot();
      const client = createValidClientSnapshot();

      const reconstituted = Receipt.reconstitute({
        id: ReceiptId.create('rec_persisted_1'),
        tenantId: 'tenant_99',
        saleId: SaleId.create('sale_persisted_99'),
        receiptNumber: ReceiptNumber.create('REC-2026-999999'),
        saleReference: 'REF-PAST',
        issuedAt: new Date('2026-08-01T10:00:00.000Z'),
        clientSnapshot: client,
        items: [item],
        subtotal: Money.create('50.00', 'USD'),
        discountTotal: Money.create('5.00', 'USD'),
        total: Money.create('45.00', 'USD'),
        payments: [payment],
        status: ReceiptStatus.REPRINTED,
        reprintCount: 3,
        lastReprintedAt: new Date('2026-08-02T15:00:00.000Z'),
        version: 4,
        createdAt: new Date('2026-08-01T10:00:00.000Z'),
        updatedAt: new Date('2026-08-02T15:00:00.000Z'),
      });

      expect(reconstituted.id.value).toBe('rec_persisted_1');
      expect(reconstituted.tenantId).toBe('tenant_99');
      expect(reconstituted.version).toBe(4);
      expect(reconstituted.status).toBe(ReceiptStatus.REPRINTED);
      expect(reconstituted.reprintCount).toBe(3);
      expect(reconstituted.lastReprintedAt?.toISOString()).toBe('2026-08-02T15:00:00.000Z');
      expect(reconstituted.getUncommittedEvents().length).toBe(0);
    });
  });
});
