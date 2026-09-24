import { Receipt } from '../receipt.aggregate';
import { Sale } from '../sale.aggregate';
import { SaleId } from '../value-objects/sale-id.vo';
import { SaleItem } from '../entities/sale-item.entity';
import { SaleItemId } from '../value-objects/sale-item-id.vo';
import { SourceReference } from '../value-objects/source-reference.vo';
import { SourceType } from '../enums/source-type.enum';
import { Money } from '../value-objects/money.vo';
import { SaleStatus } from '../enums/sale-status.enum';
import { Payment } from '../payment.aggregate';
import { PaymentId } from '../value-objects/payment-id.vo';
import { PaymentMethod } from '../enums/payment-method.enum';
import { PaymentStatus } from '../enums/payment-status.enum';
import { ReceiptDomainException } from '../exceptions/receipt-domain.exception';
import { Clock } from '../shared/clock';

class DeterministicClock implements Clock {
  constructor(private currentTime: Date) {}
  public now(): Date {
    return new Date(this.currentTime.getTime());
  }
  public advance(ms: number): void {
    this.currentTime = new Date(this.currentTime.getTime() + ms);
  }
}

describe('Receipt Issuance Rules — Domain Lifecycle (ADR-0117 & REC-RULES)', () => {
  const baseTime = new Date('2026-09-24T12:00:00.000Z');
  const tenantId = 'tenant_prime_001';
  let clock: DeterministicClock;

  beforeEach(() => {
    clock = new DeterministicClock(baseTime);
  });

  const createSaleWithStatus = (status: SaleStatus, amount = 100.0): Sale => {
    const saleId = SaleId.create('sale_lifecycle_001');
    const item = SaleItem.create({
      id: SaleItemId.create('item_lc_01'),
      source: SourceReference.create({
        sourceType: SourceType.INVENTORY_ITEM,
        sourceId: 'inv_101',
      }),
      description: 'Standard Protein Shake',
      quantity: 2,
      unitPrice: Money.create(amount / 2, 'USD'),
    });

    const subtotal = Money.create(amount, 'USD');
    const discountTotal = Money.zero('USD');
    const total = subtotal;

    return Sale.reconstitute({
      id: saleId,
      tenantId,
      clientId: 'client_001',
      status,
      currency: 'USD',
      source: SourceReference.create({
        sourceType: SourceType.INVENTORY_ITEM,
        sourceId: 'inv_101',
      }),
      items: [item],
      orderDiscount: null,
      subtotal,
      discountTotal,
      total,
      version: 1,
      completedAt: status === SaleStatus.COMPLETED ? baseTime : undefined,
      cancelledAt: status === SaleStatus.CANCELLED ? baseTime : undefined,
      cancellationReason:
        status === SaleStatus.CANCELLED ? 'Cancelled by client request' : undefined,
      createdAt: baseTime,
      updatedAt: baseTime,
    });
  };

  const createPaymentWithStatus = (
    status: PaymentStatus,
    amount = 100.0,
    method = PaymentMethod.CASH,
    id = 'pay_lc_01',
  ): Payment => {
    return Payment.reconstitute({
      id: PaymentId.create(id),
      tenantId,
      saleId: SaleId.create('sale_lifecycle_001'),
      method,
      amount: Money.create(amount, 'USD'),
      status,
      reference: null,
      paidAt: status === PaymentStatus.COMPLETED ? baseTime : null,
      createdAt: baseTime,
      updatedAt: baseTime,
      version: 1,
    });
  };

  // ===========================================================================
  // 1. WHEN RECEIPT MAY BE ISSUED
  // ===========================================================================
  describe('1. Permitted Issuance Scenarios', () => {
    it('should successfully issue a Receipt when Sale is in PAID status and Payment is COMPLETED', () => {
      const sale = createSaleWithStatus(SaleStatus.PAID, 100.0);
      const payment = createPaymentWithStatus(PaymentStatus.COMPLETED, 100.0, PaymentMethod.CASH);

      const receipt = Receipt.fromSettledSale(
        {
          sale,
          payments: [payment],
          receiptNumber: 'REC-2026-000101',
        },
        clock,
      );

      expect(receipt).toBeDefined();
      expect(receipt.status).toBe('ISSUED');
      expect(receipt.saleId.value).toBe(sale.id.value);
      expect(receipt.total.amount).toBe(100.0);
      expect(receipt.paymentMethod).toBe(PaymentMethod.CASH);
      expect(receipt.paymentStatus).toBe(PaymentStatus.COMPLETED);
      expect(receipt.reprintCount).toBe(0);
    });

    it('should successfully issue a Receipt when Sale is in COMPLETED status (fulfilled after payment)', () => {
      const sale = createSaleWithStatus(SaleStatus.COMPLETED, 100.0);
      const payment = createPaymentWithStatus(PaymentStatus.COMPLETED, 100.0, PaymentMethod.QR);

      const receipt = Receipt.fromSettledSale(
        {
          sale,
          payments: [payment],
          receiptNumber: 'REC-2026-000102',
        },
        clock,
      );

      expect(receipt.status).toBe('ISSUED');
      expect(receipt.paymentMethod).toBe(PaymentMethod.QR);
    });

    it('should accurately represent multi-tender split payments (e.g. $40 Cash + $60 QR)', () => {
      const sale = createSaleWithStatus(SaleStatus.PAID, 100.0);
      const cashPayment = createPaymentWithStatus(
        PaymentStatus.COMPLETED,
        40.0,
        PaymentMethod.CASH,
        'pay_split_1',
      );
      const qrPayment = createPaymentWithStatus(
        PaymentStatus.COMPLETED,
        60.0,
        PaymentMethod.QR,
        'pay_split_2',
      );

      const receipt = Receipt.fromSettledSale(
        {
          sale,
          payments: [cashPayment, qrPayment],
          receiptNumber: 'REC-2026-000103',
        },
        clock,
      );

      expect(receipt.payments.length).toBe(2);
      expect(receipt.payments[0]!.method).toBe(PaymentMethod.CASH);
      expect(receipt.payments[0]!.amount.amount).toBe(40.0);
      expect(receipt.payments[1]!.method).toBe(PaymentMethod.QR);
      expect(receipt.payments[1]!.amount.amount).toBe(60.0);
      expect(receipt.total.amount).toBe(100.0);
    });
  });

  // ===========================================================================
  // 2. WHEN ISSUANCE MUST BE REJECTED
  // ===========================================================================
  describe('2. Prohibited & Rejected Issuance Scenarios', () => {
    it('should reject receipt issuance when Sale is in DRAFT status', () => {
      const sale = createSaleWithStatus(SaleStatus.DRAFT);
      const payment = createPaymentWithStatus(PaymentStatus.COMPLETED);

      expect(() => {
        Receipt.fromSettledSale({
          sale,
          payments: [payment],
          receiptNumber: 'REC-2026-000104',
        });
      }).toThrow(ReceiptDomainException);
    });

    it('should reject receipt issuance when Sale is in PENDING_PAYMENT status', () => {
      const sale = createSaleWithStatus(SaleStatus.PENDING_PAYMENT);
      const payment = createPaymentWithStatus(PaymentStatus.COMPLETED);

      expect(() => {
        Receipt.fromSettledSale({
          sale,
          payments: [payment],
          receiptNumber: 'REC-2026-000105',
        });
      }).toThrow(ReceiptDomainException);
    });

    it('should reject receipt issuance when Sale is in PARTIALLY_PAID status', () => {
      const sale = createSaleWithStatus(SaleStatus.PARTIALLY_PAID);
      const payment = createPaymentWithStatus(PaymentStatus.COMPLETED, 50.0);

      expect(() => {
        Receipt.fromSettledSale({
          sale,
          payments: [payment],
          receiptNumber: 'REC-2026-000106',
        });
      }).toThrow(ReceiptDomainException);
    });

    it('should reject receipt issuance when Sale is in CANCELLED status', () => {
      const sale = createSaleWithStatus(SaleStatus.CANCELLED);
      const payment = createPaymentWithStatus(PaymentStatus.COMPLETED);

      expect(() => {
        Receipt.fromSettledSale({
          sale,
          payments: [payment],
          receiptNumber: 'REC-2026-000107',
        });
      }).toThrow(ReceiptDomainException);
    });

    it('should reject receipt issuance when Payment is in PENDING status', () => {
      const sale = createSaleWithStatus(SaleStatus.PAID);
      const pendingPayment = createPaymentWithStatus(PaymentStatus.PENDING);

      expect(() => {
        Receipt.fromSettledSale({
          sale,
          payments: [pendingPayment],
          receiptNumber: 'REC-2026-000108',
        });
      }).toThrow(ReceiptDomainException);
    });

    it('should reject receipt issuance when Payment is in FAILED status', () => {
      const sale = createSaleWithStatus(SaleStatus.PAID);
      const failedPayment = createPaymentWithStatus(PaymentStatus.FAILED);

      expect(() => {
        Receipt.fromSettledSale({
          sale,
          payments: [failedPayment],
          receiptNumber: 'REC-2026-000109',
        });
      }).toThrow(ReceiptDomainException);
    });

    it('should reject receipt issuance when Payment is in CANCELLED status', () => {
      const sale = createSaleWithStatus(SaleStatus.PAID);
      const cancelledPayment = createPaymentWithStatus(PaymentStatus.CANCELLED);

      expect(() => {
        Receipt.fromSettledSale({
          sale,
          payments: [cancelledPayment],
          receiptNumber: 'REC-2026-000110',
        });
      }).toThrow(ReceiptDomainException);
    });

    it('should reject receipt issuance when completed payments do not cover sale total (underpayment)', () => {
      const sale = createSaleWithStatus(SaleStatus.PAID, 100.0);
      const underpaidPayment = createPaymentWithStatus(PaymentStatus.COMPLETED, 80.0);

      expect(() => {
        Receipt.fromSettledSale({
          sale,
          payments: [underpaidPayment],
          receiptNumber: 'REC-2026-000111',
        });
      }).toThrow(ReceiptDomainException);
    });
  });

  // ===========================================================================
  // 3. REPRINT STATE MACHINE LIFECYCLE
  // ===========================================================================
  describe('3. Controlled Reprint Lifecycle (No Arbitrary Mutators)', () => {
    it('should increment reprintCount and update lastReprintedAt when recordReprint is executed', () => {
      const sale = createSaleWithStatus(SaleStatus.PAID, 100.0);
      const payment = createPaymentWithStatus(PaymentStatus.COMPLETED, 100.0);

      const receipt = Receipt.fromSettledSale(
        {
          sale,
          payments: [payment],
          receiptNumber: 'REC-2026-000112',
        },
        clock,
      );

      expect(receipt.status).toBe('ISSUED');
      expect(receipt.reprintCount).toBe(0);
      expect(receipt.lastReprintedAt).toBeNull();

      // Advance clock by 10 minutes
      clock.advance(10 * 60 * 1000);
      const reprintTime = clock.now();

      // Execute semantic reprint
      receipt.recordReprint(clock);

      expect(receipt.status).toBe('REPRINTED');
      expect(receipt.reprintCount).toBe(1);
      expect(receipt.lastReprintedAt).toEqual(reprintTime);

      // Repeat reprint
      clock.advance(5 * 60 * 1000);
      const secondReprintTime = clock.now();
      receipt.recordReprint(clock);

      expect(receipt.status).toBe('REPRINTED');
      expect(receipt.reprintCount).toBe(2);
      expect(receipt.lastReprintedAt).toEqual(secondReprintTime);
    });

    it('should NOT provide generic status setters (e.g. setReceiptStatus) preventing arbitrary state tampering', () => {
      const sale = createSaleWithStatus(SaleStatus.PAID, 100.0);
      const payment = createPaymentWithStatus(PaymentStatus.COMPLETED, 100.0);

      const receipt = Receipt.fromSettledSale(
        {
          sale,
          payments: [payment],
          receiptNumber: 'REC-2026-000113',
        },
        clock,
      );

      // Proving absence of generic setters
      const untypedReceipt = receipt as unknown as Record<string, unknown>;
      expect(untypedReceipt.setReceiptStatus).toBeUndefined();
      expect(untypedReceipt.setStatus).toBeUndefined();
      expect(untypedReceipt.updateStatus).toBeUndefined();
    });
  });

  // ===========================================================================
  // 4. INVARIANT PRESERVATION
  // ===========================================================================
  describe('4. Invariant Preservation (No Mutation of Sale, Items, Discounts, or Accounting)', () => {
    it('should NOT mutate Sale totals, SaleItem prices, or order discounts during receipt issuance', () => {
      const sale = createSaleWithStatus(SaleStatus.PAID, 100.0);
      const payment = createPaymentWithStatus(PaymentStatus.COMPLETED, 100.0);

      const preIssuanceSaleTotal = sale.total.amount;
      const preIssuanceSubtotal = sale.subtotal.amount;
      const preIssuanceDiscountTotal = sale.discountTotal.amount;
      const preIssuanceItemUnitPrice = sale.items[0]!.unitPrice.amount;
      const preIssuanceItemQuantity = sale.items[0]!.quantity;

      // Issue receipt
      Receipt.fromSettledSale(
        {
          sale,
          payments: [payment],
          receiptNumber: 'REC-2026-000114',
        },
        clock,
      );

      // Verify Sale is completely untouched
      expect(sale.total.amount).toBe(preIssuanceSaleTotal);
      expect(sale.subtotal.amount).toBe(preIssuanceSubtotal);
      expect(sale.discountTotal.amount).toBe(preIssuanceDiscountTotal);
      expect(sale.items[0]!.unitPrice.amount).toBe(preIssuanceItemUnitPrice);
      expect(sale.items[0]!.quantity).toBe(preIssuanceItemQuantity);
    });
  });
});
