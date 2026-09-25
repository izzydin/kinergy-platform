import { Receipt } from '../receipt.aggregate';
import { ReceiptId } from '../value-objects/receipt-id.vo';
import { ReceiptClientSnapshot } from '../value-objects/receipt-client-snapshot.vo';
import { ReceiptItemSnapshot } from '../value-objects/receipt-item-snapshot.vo';
import { ReceiptPaymentSnapshot } from '../value-objects/receipt-payment-snapshot.vo';
import { Sale } from '../sale.aggregate';
import { SaleId } from '../value-objects/sale-id.vo';
import { SaleItem } from '../entities/sale-item.entity';
import { SaleItemId } from '../value-objects/sale-item-id.vo';
import { SourceReference } from '../value-objects/source-reference.vo';
import { SourceType } from '../enums/source-type.enum';
import { Money } from '../value-objects/money.vo';
import { Discount } from '../value-objects/discount.vo';
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

describe('Receipt Snapshot Model — Historical Financial Representations (ADR-0117)', () => {
  const baseTime = new Date('2026-09-24T12:00:00.000Z');
  const tenantId = 'tenant_kinergy_prime';
  let clock: DeterministicClock;

  beforeEach(() => {
    clock = new DeterministicClock(baseTime);
  });

  const createSampleSettledSale = (status = SaleStatus.PAID): Sale => {
    const saleId = SaleId.create('sale_test_snap_001');
    const source = SourceReference.create({
      sourceType: SourceType.TREATMENT_SESSION,
      sourceId: 'sess_123',
    });

    const item1 = SaleItem.create({
      id: SaleItemId.create('item_snap_01'),
      source: SourceReference.create({
        sourceType: SourceType.TREATMENT_SESSION,
        sourceId: 'sess_123',
      }),
      description: 'Physiotherapy Assessment 60m',
      skuOrCode: 'PHYSIO-60',
      quantity: 1,
      unitPrice: Money.create(100.0, 'USD'),
    });

    const item2 = SaleItem.create({
      id: SaleItemId.create('item_snap_02'),
      source: SourceReference.create({
        sourceType: SourceType.INVENTORY_ITEM,
        sourceId: 'inv_protein_01',
      }),
      description: 'Whey Protein Isolate 1kg',
      skuOrCode: 'WPI-1KG',
      quantity: 2,
      unitPrice: Money.create(25.0, 'USD'),
    });

    const subtotal = Money.create(150.0, 'USD');
    const discountTotal = Money.create(10.0, 'USD');
    const total = Money.create(140.0, 'USD');

    return Sale.reconstitute({
      id: saleId,
      tenantId,
      clientId: 'client_jane_doe_123',
      status,
      currency: 'USD',
      source,
      items: [item1, item2],
      orderDiscount: Discount.fixed(10.0),
      subtotal,
      discountTotal,
      total,
      version: 1,
      completedAt: status === SaleStatus.COMPLETED ? baseTime : undefined,
      cancelledAt: status === SaleStatus.CANCELLED ? baseTime : undefined,
      cancellationReason:
        status === SaleStatus.CANCELLED ? 'Customer requested cancellation' : undefined,
      createdAt: baseTime,
      updatedAt: baseTime,
    });
  };

  const createSampleSettledPayment = (amount = 140.0, id = 'pay_test_snap_01'): Payment => {
    return Payment.reconstitute({
      id: PaymentId.create(id),
      tenantId,
      saleId: SaleId.create('sale_test_snap_001'),
      method: PaymentMethod.QR,
      amount: Money.create(amount, 'USD'),
      status: PaymentStatus.COMPLETED,
      reference: null,
      paidAt: baseTime,
      createdAt: baseTime,
      updatedAt: baseTime,
      version: 1,
    });
  };

  // ===========================================================================
  // 1. CLIENT SNAPSHOT IMMUTABILITY & DECOUPLING
  // ===========================================================================
  describe('1. Client Snapshot Immutability & Decoupling', () => {
    it('should freeze client information at issuance and remain unaffected when original client data mutates', () => {
      // Simulating mutable client entity or external DTO
      const clientProfile = {
        id: 'client_uuid_777',
        referenceNumber: 'CLI-2026-0042',
        fullName: 'Jane Doe',
        email: 'jane.doe@example.com',
        phone: '+1-555-0100',
      };

      const clientSnapshot = ReceiptClientSnapshot.fromSummary(clientProfile);

      const itemSnapshot = ReceiptItemSnapshot.create({
        itemId: 'item_01',
        sourceType: 'INVENTORY_ITEM',
        sourceId: 'inv_01',
        description: 'Resistance Band Set',
        quantity: 1,
        unitPrice: Money.create(20.0, 'USD'),
        subtotal: Money.create(20.0, 'USD'),
        total: Money.create(20.0, 'USD'),
      });

      const paymentSnapshot = ReceiptPaymentSnapshot.create({
        paymentId: 'pay_01',
        method: PaymentMethod.CASH,
        amount: Money.create(20.0, 'USD'),
        status: PaymentStatus.COMPLETED,
      });

      const receipt = Receipt.create(
        {
          tenantId,
          saleId: 'sale_001',
          receiptNumber: 'REC-2026-000001',
          saleReference: 'ORD-001',
          clientSnapshot,
          items: [itemSnapshot],
          subtotal: Money.create(20.0, 'USD'),
          total: Money.create(20.0, 'USD'),
          payments: [paymentSnapshot],
        },
        clock,
      );

      // Verify initial snapshot
      expect(receipt.clientSnapshot).not.toBeNull();
      expect(receipt.clientSnapshot!.fullName).toBe('Jane Doe');
      expect(receipt.clientSnapshot!.email).toBe('jane.doe@example.com');
      expect(receipt.clientSnapshot!.phone).toBe('+1-555-0100');
      expect(receipt.clientSnapshot!.referenceNumber).toBe('CLI-2026-0042');

      // MUTATION: Customer changes name, email, phone in Client Bounded Context
      clientProfile.fullName = 'Jane Smith-Doe';
      clientProfile.email = 'jane.smith@newdomain.com';
      clientProfile.phone = '+1-555-9999';
      clientProfile.referenceNumber = 'CLI-2026-9999';

      // PROOF: The historical receipt voucher remains 100% frozen
      expect(receipt.clientSnapshot!.fullName).toBe('Jane Doe');
      expect(receipt.clientSnapshot!.email).toBe('jane.doe@example.com');
      expect(receipt.clientSnapshot!.phone).toBe('+1-555-0100');
      expect(receipt.clientSnapshot!.referenceNumber).toBe('CLI-2026-0042');
    });

    it('should freeze the ReceiptClientSnapshot object preventing runtime property modifications', () => {
      const clientSnapshot = ReceiptClientSnapshot.create({
        clientId: 'cli_1',
        fullName: 'John Smith',
      });

      expect(Object.isFrozen(clientSnapshot)).toBe(true);

      expect(() => {
        // @ts-expect-error - Testing runtime mutation defense
        clientSnapshot.fullName = 'Malicious Change';
      }).toThrow();
    });

    it('should support anonymous / walk-in sales without registered client (clientSnapshot is null)', () => {
      const sale = createSampleSettledSale(SaleStatus.PAID);
      const payment = createSampleSettledPayment(140.0);

      const receipt = Receipt.fromSettledSale(
        {
          sale,
          payments: [payment],
          clientSummary: null, // Walk-in customer
          receiptNumber: 'REC-2026-000002',
        },
        clock,
      );

      expect(receipt.clientSnapshot).toBeNull();
      expect(receipt.total.amount).toBe(140.0);
      expect(receipt.status).toBe('ISSUED');
    });
  });

  // ===========================================================================
  // 2. SALE & SALE ITEM SNAPSHOT IMMUTABILITY & DECOUPLING
  // ===========================================================================
  describe('2. Sale & Sale Item Snapshot Immutability & Decoupling', () => {
    it('should freeze sale item descriptions and unit prices so catalog modifications do not rewrite the receipt', () => {
      const sale = createSampleSettledSale(SaleStatus.PAID);
      const payment = createSampleSettledPayment(140.0);

      const receipt = Receipt.fromSettledSale(
        {
          sale,
          payments: [payment],
          receiptNumber: 'REC-2026-000003',
        },
        clock,
      );

      expect(receipt.itemCount).toBe(2);
      expect(receipt.items[0]!.description).toBe('Physiotherapy Assessment 60m');
      expect(receipt.items[0]!.unitPrice.amount).toBe(100.0);
      expect(receipt.items[1]!.description).toBe('Whey Protein Isolate 1kg');
      expect(receipt.items[1]!.unitPrice.amount).toBe(25.0);

      // Verify each item snapshot is frozen
      expect(Object.isFrozen(receipt.items[0])).toBe(true);
      expect(Object.isFrozen(receipt.items[1])).toBe(true);

      // Runtime mutation defense: attempts to mutate item throw
      expect(() => {
        // @ts-expect-error - Testing runtime mutation defense
        receipt.items[0].description = 'Renamed Service';
      }).toThrow();

      expect(() => {
        // @ts-expect-error - Testing runtime mutation defense
        receipt.items[0].unitPrice = Money.create(200.0, 'USD');
      }).toThrow();
    });

    it('should freeze the items array so external consumers cannot push or pop line items from the receipt', () => {
      const sale = createSampleSettledSale(SaleStatus.PAID);
      const payment = createSampleSettledPayment(140.0);

      const itemsArray: ReceiptItemSnapshot[] = [
        ReceiptItemSnapshot.fromSaleItem(sale.items[0]!),
        ReceiptItemSnapshot.fromSaleItem(sale.items[1]!),
      ];

      const receipt = Receipt.create(
        {
          tenantId,
          saleId: sale.id,
          receiptNumber: 'REC-2026-000004',
          saleReference: sale.id.value,
          items: itemsArray,
          subtotal: sale.subtotal,
          discountTotal: sale.discountTotal,
          total: sale.total,
          payments: [ReceiptPaymentSnapshot.fromPayment(payment)],
        },
        clock,
      );

      // Mutate external items array
      const newItem = ReceiptItemSnapshot.create({
        itemId: 'item_injected',
        sourceType: 'INVENTORY_ITEM',
        sourceId: 'inv_fake',
        description: 'Fraudulent Item',
        quantity: 1,
        unitPrice: Money.create(50.0, 'USD'),
        subtotal: Money.create(50.0, 'USD'),
        total: Money.create(50.0, 'USD'),
      });
      itemsArray.push(newItem);

      // Receipt internal collection was defensively cloned and frozen
      expect(receipt.itemCount).toBe(2);
      expect(receipt.items.length).toBe(2);
      expect(Object.isFrozen(receipt.items)).toBe(true);

      // Attempting to mutate getter output throws
      expect(() => {
        (receipt.items as ReceiptItemSnapshot[]).push(newItem);
      }).toThrow();
    });
  });

  // ===========================================================================
  // 3. PAYMENT SNAPSHOT IMMUTABILITY & TENDER INTEGRITY
  // ===========================================================================
  describe('3. Payment Snapshot Immutability & Tender Integrity', () => {
    it('should freeze payment method and settled tender status against subsequent mutations', () => {
      const sale = createSampleSettledSale(SaleStatus.PAID);
      const payment = createSampleSettledPayment(140.0);

      const receipt = Receipt.fromSettledSale(
        {
          sale,
          payments: [payment],
          receiptNumber: 'REC-2026-000005',
        },
        clock,
      );

      expect(receipt.paymentMethod).toBe(PaymentMethod.QR);
      expect(receipt.paymentStatus).toBe(PaymentStatus.COMPLETED);
      expect(receipt.payments[0]!.amount.amount).toBe(140.0);

      // Verify payment snapshot is frozen
      expect(Object.isFrozen(receipt.payments[0])).toBe(true);
      expect(Object.isFrozen(receipt.payments)).toBe(true);

      // Runtime mutation defense
      expect(() => {
        // @ts-expect-error - Testing runtime mutation defense
        receipt.payments[0].status = PaymentStatus.FAILED;
      }).toThrow();
    });

    it('should accurately snapshot multi-tender split payments ($60 QR + $80 Cash = $140)', () => {
      const sale = createSampleSettledSale(SaleStatus.PAID);

      const qrPayment = Payment.reconstitute({
        id: PaymentId.create('pay_split_qr_01'),
        tenantId,
        saleId: sale.id,
        method: PaymentMethod.QR,
        amount: Money.create(60.0, 'USD'),
        status: PaymentStatus.COMPLETED,
        reference: null,
        paidAt: baseTime,
        createdAt: baseTime,
        updatedAt: baseTime,
        version: 1,
      });

      const cashPayment = Payment.reconstitute({
        id: PaymentId.create('pay_split_cash_02'),
        tenantId,
        saleId: sale.id,
        method: PaymentMethod.CASH,
        amount: Money.create(80.0, 'USD'),
        status: PaymentStatus.COMPLETED,
        reference: null,
        paidAt: baseTime,
        createdAt: baseTime,
        updatedAt: baseTime,
        version: 1,
      });

      const receipt = Receipt.fromSettledSale(
        {
          sale,
          payments: [qrPayment, cashPayment],
          receiptNumber: 'REC-2026-000006',
        },
        clock,
      );

      expect(receipt.payments.length).toBe(2);
      expect(receipt.payments[0]!.method).toBe(PaymentMethod.QR);
      expect(receipt.payments[0]!.amount.amount).toBe(60.0);
      expect(receipt.payments[1]!.method).toBe(PaymentMethod.CASH);
      expect(receipt.payments[1]!.amount.amount).toBe(80.0);
      expect(receipt.total.amount).toBe(140.0);
    });

    it('should reject receipt issuance when tender payments do not cover the sale total (underpayment)', () => {
      const sale = createSampleSettledSale(SaleStatus.PAID);
      const partialPayment = createSampleSettledPayment(100.0); // Sale total is 140.0

      expect(() => {
        Receipt.fromSettledSale({
          sale,
          payments: [partialPayment],
          receiptNumber: 'REC-2026-000007',
        });
      }).toThrow(ReceiptDomainException);
    });
  });

  // ===========================================================================
  // 4. DATE AND TEMPORAL DEFENSIVE COPYING
  // ===========================================================================
  describe('4. Date and Temporal Defensive Copying', () => {
    it('should defensively clone issuedAt and paidAt dates preventing external epoch tampering', () => {
      const mutableDate = new Date('2026-09-24T12:00:00.000Z');
      const sale = createSampleSettledSale(SaleStatus.PAID);
      const payment = createSampleSettledPayment(140.0);

      const receipt = Receipt.create(
        {
          tenantId,
          saleId: sale.id,
          receiptNumber: 'REC-2026-000008',
          saleReference: sale.id.value,
          issuedAt: mutableDate,
          items: sale.items.map((i) => ReceiptItemSnapshot.fromSaleItem(i)),
          subtotal: sale.subtotal,
          discountTotal: sale.discountTotal,
          total: sale.total,
          payments: [ReceiptPaymentSnapshot.fromPayment(payment)],
        },
        clock,
      );

      // External caller tampers with original Date reference
      mutableDate.setFullYear(2030);
      expect(receipt.issuedAt.getFullYear()).toBe(2026);

      // Caller tampers with Date instance returned by getter
      const retrievedDate = receipt.issuedAt;
      retrievedDate.setFullYear(1999);
      expect(receipt.issuedAt.getFullYear()).toBe(2026);
    });
  });

  // ===========================================================================
  // 5. SALE LIFECYCLE PRECONDITIONS (ADR-0117 INVARIANT 9)
  // ===========================================================================
  describe('5. Sale Lifecycle Preconditions (ADR-0117 Invariant 9)', () => {
    it('should permit receipt issuance for COMPLETED sales', () => {
      const sale = createSampleSettledSale(SaleStatus.COMPLETED);
      const payment = createSampleSettledPayment(140.0);

      const receipt = Receipt.fromSettledSale(
        {
          sale,
          payments: [payment],
          receiptNumber: 'REC-2026-000009',
        },
        clock,
      );

      expect(receipt.status).toBe('ISSUED');
      expect(receipt.total.amount).toBe(140.0);
    });

    it('should reject receipt issuance for DRAFT sales', () => {
      const sale = createSampleSettledSale(SaleStatus.DRAFT);
      const payment = createSampleSettledPayment(140.0);

      expect(() => {
        Receipt.fromSettledSale({
          sale,
          payments: [payment],
          receiptNumber: 'REC-2026-000010',
        });
      }).toThrow(ReceiptDomainException);
    });

    it('should reject receipt issuance for PENDING_PAYMENT sales', () => {
      const sale = createSampleSettledSale(SaleStatus.PENDING_PAYMENT);
      const payment = createSampleSettledPayment(140.0);

      expect(() => {
        Receipt.fromSettledSale({
          sale,
          payments: [payment],
          receiptNumber: 'REC-2026-000011',
        });
      }).toThrow(ReceiptDomainException);
    });

    it('should reject receipt issuance for CANCELLED sales', () => {
      const sale = createSampleSettledSale(SaleStatus.CANCELLED);
      const payment = createSampleSettledPayment(140.0);

      expect(() => {
        Receipt.fromSettledSale({
          sale,
          payments: [payment],
          receiptNumber: 'REC-2026-000012',
        });
      }).toThrow(ReceiptDomainException);
    });
  });

  // ===========================================================================
  // 6. FIELD CLASSIFICATION VERIFICATION
  // ===========================================================================
  describe('6. Field Classification Verification', () => {
    it('should satisfy classification contracts: scalar references, immutable snapshots, and derived values', () => {
      const sale = createSampleSettledSale(SaleStatus.PAID);
      const payment = createSampleSettledPayment(140.0);
      const client = {
        id: 'client_123',
        referenceNumber: 'CLI-01',
        fullName: 'Alice Walker',
        email: 'alice@example.com',
        phone: '12345678',
      };

      const receipt = Receipt.fromSettledSale(
        {
          sale,
          payments: [payment],
          clientSummary: client,
          receiptNumber: 'REC-2026-000013',
        },
        clock,
      );

      // REFERENCES: scalar identifiers
      expect(receipt.id).toBeInstanceOf(ReceiptId);
      expect(receipt.saleId).toBeInstanceOf(SaleId);
      expect(receipt.saleId.value).toBe('sale_test_snap_001');
      expect(receipt.tenantId).toBe(tenantId);
      expect(receipt.clientSnapshot!.clientId).toBe('client_123');
      expect(receipt.items[0]!.itemId).toBe('item_snap_01');
      expect(receipt.payments[0]!.paymentId).toBe('pay_test_snap_01');

      // SNAPSHOTS: point-in-time frozen values
      expect(receipt.receiptNumber.value).toBe('REC-2026-000013');
      expect(receipt.saleReference).toBe('sale_test_snap_001');
      expect(receipt.clientSnapshot!.fullName).toBe('Alice Walker');
      expect(receipt.items[0]!.description).toBe('Physiotherapy Assessment 60m');
      expect(receipt.subtotal.amount).toBe(150.0);
      expect(receipt.discountTotal.amount).toBe(10.0);
      expect(receipt.total.amount).toBe(140.0);

      // DERIVED PRESENTATION VALUES
      expect(receipt.currency).toBe('USD');
      expect(receipt.itemCount).toBe(2);
      expect(receipt.paymentMethod).toBe(PaymentMethod.QR);
      expect(receipt.paymentStatus).toBe(PaymentStatus.COMPLETED);

      // DERIVED OPERATIONAL STATE
      expect(receipt.status).toBe('ISSUED');
      expect(receipt.reprintCount).toBe(0);
      expect(receipt.lastReprintedAt).toBeNull();
    });
  });

  // ===========================================================================
  // 7. HISTORICAL FINANCIAL-DOMAIN INTEGRITY & ENTITY MUTATION STABILITY
  // ===========================================================================
  describe('7. Historical Financial-Domain Integrity & Entity Mutation Stability Regression Suite', () => {
    it('verifies Sale changes (status transition, cancellation, re-settlement) do not silently mutate the issued Receipt', () => {
      const sale = createSampleSettledSale(SaleStatus.PAID);
      const payment = createSampleSettledPayment(140.0);
      const client = {
        id: 'client_hist_01',
        fullName: 'Historical Client',
        email: 'hist@example.com',
      };

      const receipt = Receipt.fromSettledSale(
        {
          sale,
          payments: [payment],
          clientSummary: client,
          receiptNumber: 'REC-2026-000088',
        },
        clock,
      );

      // Verify baseline state
      expect(receipt.status).toBe('ISSUED');
      expect(receipt.total.amount).toBe(140.0);
      expect(receipt.subtotal.amount).toBe(150.0);
      expect(receipt.discountTotal.amount).toBe(10.0);

      // MUTATION: Sale changes after receipt issuance (e.g. completion, cancellation, refunding)
      const untypedSale = sale as unknown as Record<string, unknown>;
      untypedSale['_status'] = SaleStatus.CANCELLED;
      untypedSale['_subtotal'] = Money.zero('USD');
      untypedSale['_discountTotal'] = Money.zero('USD');
      untypedSale['_total'] = Money.zero('USD');

      // PROOF: The historical receipt voucher remains 100% stable and intact
      expect(receipt.status).toBe('ISSUED');
      expect(receipt.total.amount).toBe(140.0);
      expect(receipt.total.cents).toBe(14000);
      expect(receipt.subtotal.amount).toBe(150.0);
      expect(receipt.subtotal.cents).toBe(15000);
      expect(receipt.discountTotal.amount).toBe(10.0);
      expect(receipt.discountTotal.cents).toBe(1000);
      expect(receipt.saleReference).toBe('sale_test_snap_001');
    });

    it('verifies Client profile modifications (name change, contact update, anonymization) do not silently mutate receipt client snapshot', () => {
      const sale = createSampleSettledSale(SaleStatus.PAID);
      const payment = createSampleSettledPayment(140.0);
      const clientProfile = {
        id: 'client_gdpr_01',
        referenceNumber: 'CLI-GDPR-99',
        fullName: 'Original Customer Name',
        email: 'original@privacy.org',
        phone: '+1-555-0199',
      };

      const receipt = Receipt.fromSettledSale(
        {
          sale,
          payments: [payment],
          clientSummary: clientProfile,
          receiptNumber: 'REC-2026-000089',
        },
        clock,
      );

      // Verify baseline snapshot
      expect(receipt.clientSnapshot!.fullName).toBe('Original Customer Name');
      expect(receipt.clientSnapshot!.email).toBe('original@privacy.org');
      expect(receipt.clientSnapshot!.phone).toBe('+1-555-0199');
      expect(receipt.clientSnapshot!.referenceNumber).toBe('CLI-GDPR-99');

      // MUTATION: Client exercises GDPR "Right to be forgotten" or updates legal name
      clientProfile.fullName = 'Anonymized Client';
      clientProfile.email = 'redacted@privacy.org';
      clientProfile.phone = '+0-000-0000';
      clientProfile.referenceNumber = 'CLI-REDACTED';

      // PROOF: Receipt snapshot is permanently frozen in point-in-time state
      expect(receipt.clientSnapshot!.fullName).toBe('Original Customer Name');
      expect(receipt.clientSnapshot!.email).toBe('original@privacy.org');
      expect(receipt.clientSnapshot!.phone).toBe('+1-555-0199');
      expect(receipt.clientSnapshot!.referenceNumber).toBe('CLI-GDPR-99');
    });

    it('verifies SaleItem adjustments (quantity changes, catalog re-pricing) do not silently mutate receipt item snapshots', () => {
      const sale = createSampleSettledSale(SaleStatus.PAID);
      const payment = createSampleSettledPayment(140.0);

      const receipt = Receipt.fromSettledSale(
        {
          sale,
          payments: [payment],
          receiptNumber: 'REC-2026-000090',
        },
        clock,
      );

      expect(receipt.itemCount).toBe(2);
      expect(receipt.items[0]!.quantity).toBe(1);
      expect(receipt.items[0]!.unitPrice.amount).toBe(100.0);
      expect(receipt.items[0]!.subtotal.amount).toBe(100.0);
      expect(receipt.items[1]!.quantity).toBe(2);
      expect(receipt.items[1]!.unitPrice.amount).toBe(25.0);
      expect(receipt.items[1]!.subtotal.amount).toBe(50.0);

      // MUTATION: Sale items reconfigured in the Sale aggregate post-issuance
      const reconfiguredItem = SaleItem.create({
        id: SaleItemId.create('item_snap_01'),
        source: SourceReference.create({
          sourceType: SourceType.TREATMENT_SESSION,
          sourceId: 'sess_123',
        }),
        description: 'Changed Service Description',
        quantity: 10,
        unitPrice: Money.create(500.0, 'USD'),
      });
      const untypedSale = sale as unknown as Record<string, unknown>;
      untypedSale['_items'] = [reconfiguredItem];

      // PROOF: Receipt item snapshots retain original values
      expect(receipt.itemCount).toBe(2);
      expect(receipt.items[0]!.quantity).toBe(1);
      expect(receipt.items[0]!.unitPrice.amount).toBe(100.0);
      expect(receipt.items[0]!.subtotal.amount).toBe(100.0);
      expect(receipt.items[0]!.description).toBe('Physiotherapy Assessment 60m');
    });

    it('verifies current catalog price increases do not rewrite historical receipt prices', () => {
      const sale = createSampleSettledSale(SaleStatus.PAID);
      const payment = createSampleSettledPayment(140.0);

      const receipt = Receipt.fromSettledSale(
        {
          sale,
          payments: [payment],
          receiptNumber: 'REC-2026-000091',
        },
        clock,
      );

      // Original price recorded: $100.00
      expect(receipt.items[0]!.unitPrice.amount).toBe(100.0);
      expect(receipt.total.amount).toBe(140.0);

      // Simulated catalog price hike: Physiotherapy increased to $175.00
      const currentCatalogPrice = Money.create(175.0, 'USD');
      expect(currentCatalogPrice.amount).toBe(175.0);

      // PROOF: Receipt historical prices remain frozen at original $100.00
      expect(receipt.items[0]!.unitPrice.amount).toBe(100.0);
      expect(receipt.total.amount).toBe(140.0);
    });

    it('verifies promotion expiry and discount modifications do not rewrite historical receipt discounts', () => {
      const sale = createSampleSettledSale(SaleStatus.PAID);
      const payment = createSampleSettledPayment(140.0);

      const receipt = Receipt.fromSettledSale(
        {
          sale,
          payments: [payment],
          receiptNumber: 'REC-2026-000092',
        },
        clock,
      );

      expect(receipt.discountTotal.amount).toBe(10.0);

      // Promotion expired or removed on sale aggregate
      const untypedSale = sale as unknown as Record<string, unknown>;
      untypedSale['_discountTotal'] = Money.zero('USD');
      untypedSale['_orderDiscount'] = null;

      // PROOF: Receipt preserves historical discount of $10.00
      expect(receipt.discountTotal.amount).toBe(10.0);
      expect(receipt.discountTotal.cents).toBe(1000);
      expect(receipt.total.amount).toBe(140.0);
    });

    it('verifies Payment status transitions (chargeback, refund) do not silently rewrite historical receipt payment snapshots', () => {
      const sale = createSampleSettledSale(SaleStatus.PAID);
      const payment = createSampleSettledPayment(140.0);

      const receipt = Receipt.fromSettledSale(
        {
          sale,
          payments: [payment],
          receiptNumber: 'REC-2026-000093',
        },
        clock,
      );

      expect(receipt.paymentStatus).toBe(PaymentStatus.COMPLETED);
      expect(receipt.payments[0]!.status).toBe(PaymentStatus.COMPLETED);
      expect(receipt.payments[0]!.amount.amount).toBe(140.0);

      // Later event: Payment status transitions to CANCELLED in the Payment aggregate
      const untypedPayment = payment as unknown as Record<string, unknown>;
      untypedPayment['_status'] = PaymentStatus.CANCELLED;

      // PROOF: Historical proof-of-purchase payment snapshot remains COMPLETED
      expect(receipt.paymentStatus).toBe(PaymentStatus.COMPLETED);
      expect(receipt.payments[0]!.status).toBe(PaymentStatus.COMPLETED);
      expect(receipt.payments[0]!.amount.amount).toBe(140.0);
    });

    it('enforces runtime immutability on private historical properties preventing direct property mutations', () => {
      const sale = createSampleSettledSale(SaleStatus.PAID);
      const payment = createSampleSettledPayment(140.0);

      const receipt = Receipt.fromSettledSale(
        {
          sale,
          payments: [payment],
          receiptNumber: 'REC-2026-000094',
        },
        clock,
      );

      const untypedReceipt = receipt as unknown as Record<string, unknown>;

      // 1. Direct mutation of non-writable private fields throws TypeError in runtime
      expect(() => {
        untypedReceipt['_total'] = Money.create(999.0, 'USD');
      }).toThrow(TypeError);

      expect(() => {
        untypedReceipt['_subtotal'] = Money.create(999.0, 'USD');
      }).toThrow(TypeError);

      expect(() => {
        untypedReceipt['_discountTotal'] = Money.create(999.0, 'USD');
      }).toThrow(TypeError);

      expect(() => {
        untypedReceipt['_items'] = [];
      }).toThrow(TypeError);

      expect(() => {
        untypedReceipt['_payments'] = [];
      }).toThrow(TypeError);

      expect(() => {
        untypedReceipt['_clientSnapshot'] = null;
      }).toThrow(TypeError);

      expect(() => {
        untypedReceipt['_saleId'] = SaleId.create('fraudulent_sale');
      }).toThrow(TypeError);

      expect(() => {
        untypedReceipt['_receiptNumber'] = null;
      }).toThrow(TypeError);

      expect(() => {
        untypedReceipt['_issuedAt'] = new Date();
      }).toThrow(TypeError);

      // 2. Direct mutation of getter-only properties throws TypeError in strict mode
      expect(() => {
        untypedReceipt['total'] = Money.create(0.0, 'USD');
      }).toThrow(TypeError);

      expect(() => {
        untypedReceipt['subtotal'] = Money.create(0.0, 'USD');
      }).toThrow(TypeError);

      expect(() => {
        untypedReceipt['status'] = 'VOID';
      }).toThrow(TypeError);

      // 3. Deleting historical fields on sealed object throws TypeError
      expect(() => {
        delete untypedReceipt['_total'];
      }).toThrow(TypeError);

      // 4. Adding rogue fields to sealed object throws TypeError
      expect(() => {
        untypedReceipt['rogueFinancialOverride'] = true;
      }).toThrow(TypeError);

      // 5. Array mutation on frozen getters throws TypeError
      const itemsList = receipt.items as unknown as Array<unknown>;
      expect(() => {
        itemsList.push({ description: 'Injected Item' });
      }).toThrow(TypeError);

      const paymentsList = receipt.payments as unknown as Array<unknown>;
      expect(() => {
        paymentsList.push({ amount: Money.create(10, 'USD') });
      }).toThrow(TypeError);
    });

    it('proves duplicate reprinting updates ONLY reprint operational metadata while keeping historical financial data identical', () => {
      const sale = createSampleSettledSale(SaleStatus.PAID);
      const payment = createSampleSettledPayment(140.0);
      const client = {
        id: 'client_reprint_01',
        fullName: 'Reprint Test User',
      };

      const receipt = Receipt.fromSettledSale(
        {
          sale,
          payments: [payment],
          clientSummary: client,
          receiptNumber: 'REC-2026-000095',
        },
        clock,
      );

      const preReprintSubtotal = receipt.subtotal;
      const preReprintTotal = receipt.total;
      const preReprintDiscount = receipt.discountTotal;
      const preReprintItems = receipt.items;
      const preReprintPayments = receipt.payments;
      const preReprintClient = receipt.clientSnapshot;
      const preReprintIssuedAt = receipt.issuedAt;

      // Advance clock and trigger duplicate reprint
      clock.advance(3600 * 1000 * 24); // 24 hours later
      const reprintTimestamp = clock.now();
      receipt.recordReprint(clock);

      // Operational reprint fields MUST update
      expect(receipt.status).toBe('REPRINTED');
      expect(receipt.reprintCount).toBe(1);
      expect(receipt.isReprint).toBe(true);
      expect(receipt.lastReprintedAt?.toISOString()).toBe(reprintTimestamp.toISOString());
      expect(receipt.version).toBe(2);

      // Historical financial, client, items, payments, and issuance fields MUST NOT mutate
      expect(receipt.subtotal.equals(preReprintSubtotal)).toBe(true);
      expect(receipt.total.equals(preReprintTotal)).toBe(true);
      expect(receipt.discountTotal.equals(preReprintDiscount)).toBe(true);
      expect(receipt.issuedAt.toISOString()).toBe(preReprintIssuedAt.toISOString());
      expect(receipt.clientSnapshot!.fullName).toBe(preReprintClient!.fullName);
      expect(receipt.itemCount).toBe(preReprintItems.length);
      expect(receipt.payments.length).toBe(preReprintPayments.length);
    });
  });
});
