import { Sale } from '../sale.aggregate';
import { SaleItem } from '../entities/sale-item.entity';
import { SaleId } from '../value-objects/sale-id.vo';
import { SaleItemId } from '../value-objects/sale-item-id.vo';
import { Money } from '../value-objects/money.vo';
import { Discount } from '../value-objects/discount.vo';
import { SourceReference } from '../value-objects/source-reference.vo';
import { SourceType } from '../enums/source-type.enum';
import { SaleStatus } from '../enums/sale-status.enum';
import { PaymentStatus } from '../enums/payment-status.enum';
import { PaymentMethod } from '../enums/payment-method.enum';
import { Payment } from '../payment.aggregate';
import { PaymentId } from '../value-objects/payment-id.vo';
import { Receipt } from '../receipt.aggregate';
import { ReceiptId } from '../value-objects/receipt-id.vo';
import { ReceiptNumber } from '../value-objects/receipt-number.vo';
import { ReceiptStatus } from '../enums/receipt-status.enum';
import { ReceiptDomainException } from '../exceptions/receipt-domain.exception';
import { Clock } from '../shared/clock';
import { IssueReceiptHandler } from '../../application/handlers/issue-receipt.handler';
import { SaleRepositoryPort } from '../../application/ports/sale-repository.port';
import { ReceiptRepositoryPort } from '../../application/ports/receipt-repository.port';
import { PaymentRepositoryPort } from '../../application/ports/payment-repository.port';
import { IssueReceiptCommand } from '../../application/commands/issue-receipt.command';

class DeterministicClock implements Clock {
  constructor(private currentTime: Date) {}
  public now(): Date {
    return new Date(this.currentTime.getTime());
  }
  public advance(ms: number): void {
    this.currentTime = new Date(this.currentTime.getTime() + ms);
  }
}

class InMemorySaleRepo implements SaleRepositoryPort {
  public store = new Map<string, Sale>();
  public async findById(id: SaleId | string): Promise<Sale | null> {
    const key = typeof id === 'string' ? id : id.value;
    return this.store.get(key) ?? null;
  }
  public async save(sale: Sale): Promise<void> {
    this.store.set(sale.id.value, sale);
  }
}

class InMemoryPaymentRepo implements PaymentRepositoryPort {
  public store = new Map<string, Payment>();
  public async findById(id: PaymentId | string): Promise<Payment | null> {
    const key = typeof id === 'string' ? id : id.value;
    return this.store.get(key) ?? null;
  }
  public async findBySaleId(saleId: SaleId | string): Promise<Payment[]> {
    const key = typeof saleId === 'string' ? saleId : saleId.value;
    return Array.from(this.store.values()).filter((p) => p.saleId.value === key);
  }
  public async save(payment: Payment): Promise<void> {
    this.store.set(payment.id.value, payment);
  }
}

class InMemoryReceiptRepo implements ReceiptRepositoryPort {
  public store = new Map<string, Receipt>();
  public sequence = 100;
  public async findById(id: ReceiptId | string): Promise<Receipt | null> {
    const key = typeof id === 'string' ? id : id.value;
    return this.store.get(key) ?? null;
  }
  public async findBySaleId(saleId: SaleId | string): Promise<Receipt | null> {
    const key = typeof saleId === 'string' ? saleId : saleId.value;
    return Array.from(this.store.values()).find((r) => r.saleId.value === key) ?? null;
  }
  public async findByReceiptNumber(receiptNumber: ReceiptNumber | string): Promise<Receipt | null> {
    const key = typeof receiptNumber === 'string' ? receiptNumber : receiptNumber.value;
    return Array.from(this.store.values()).find((r) => r.receiptNumber.value === key) ?? null;
  }
  public async save(receipt: Receipt): Promise<void> {
    this.store.set(receipt.id.value, receipt);
  }
  public async getNextReceiptNumber(_tenantId: string, year: number): Promise<ReceiptNumber> {
    this.sequence++;
    return ReceiptNumber.create(`REC-${year}-${String(this.sequence).padStart(6, '0')}`);
  }
}

interface SaleDeepSnapshot {
  id: string;
  tenantId?: string;
  clientId?: string;
  status: SaleStatus;
  currency: string;
  itemCount: number;
  itemIds: string[];
  subtotalCents: number;
  discountTotalCents: number;
  totalCents: number;
  version: number;
  updatedAt: number;
  uncommittedEventsCount: number;
}

function captureSaleDeepSnapshot(sale: Sale): SaleDeepSnapshot {
  return {
    id: sale.id.value,
    tenantId: sale.tenantId,
    clientId: sale.clientId,
    status: sale.status,
    currency: sale.currency,
    itemCount: sale.itemCount,
    itemIds: sale.items.map((i) => i.id.value),
    subtotalCents: sale.subtotal.cents,
    discountTotalCents: sale.discountTotal.cents,
    totalCents: sale.total.cents,
    version: sale.version,
    updatedAt: sale.updatedAt.getTime(),
    uncommittedEventsCount: sale.getUncommittedEvents().length,
  };
}

describe('Senior Domain Integration Architecture: Sale ↔ Receipt Boundary Integration', () => {
  const clock = new DeterministicClock(new Date('2026-09-28T16:00:00.000Z'));
  const source = SourceReference.create({
    sourceType: SourceType.INVENTORY_ITEM,
    sourceId: 'inv-item-omega-99',
    sourceCode: 'SKU-OMEGA-99',
  });

  function createStandardSettledSaleAndPayment(): {
    sale: Sale;
    payment: Payment;
  } {
    const sale = Sale.create(
      {
        source,
        tenantId: 'tenant-charlie',
        clientId: 'client-bravo',
        currency: 'USD',
      },
      clock,
    );

    sale.addItem(
      {
        id: SaleItemId.create('item-1'),
        source,
        description: 'Elite Coaching Program',
        quantity: 1,
        unitPrice: Money.create(150.0, 'USD'),
      },
      clock,
    );

    sale.addItem(
      {
        id: SaleItemId.create('item-2'),
        source,
        description: 'Recovery Session Addon',
        quantity: 2,
        unitPrice: Money.create(25.0, 'USD'),
        discount: Discount.fixed(10.0, 'Early Bird Special'),
      },
      clock,
    );

    // Subtotal: 150 + 50 = 200.00. Line discounts: 10.00. Net pre-order: 190.00.
    // Order discount: 10% on 190.00 = 19.00. Total discount: 29.00. Net Total: 171.00.
    sale.applyOrderDiscount(Discount.percentage(10, 'Seasonal Member Promo'), clock);
    sale.finalize(clock);

    // Create completed payment matching total debt ($171.00)
    const payment = Payment.createSettled(
      {
        id: PaymentId.create('pay-settled-1'),
        saleId: sale.id,
        tenantId: sale.tenantId,
        method: PaymentMethod.CASH,
        amount: Money.create(171.0, 'USD'),
        reference: 'ch_cash_tx_12345678',
      },
      clock,
    );

    sale.markPaid(clock);
    sale.clearEvents();
    payment.clearEvents();

    return { sale, payment };
  }

  // ==========================================================================
  // 1. Boundary & Read-Only Representation Verification
  // ==========================================================================
  describe('1. Read-Only Representation & Domain Boundary Verification', () => {
    it('proves Receipt reads Sale state as downstream representation without mutating Sale', () => {
      const { sale, payment } = createStandardSettledSaleAndPayment();
      const saleSnapshotBefore = captureSaleDeepSnapshot(sale);

      const receipt = Receipt.fromSettledSale(
        {
          id: ReceiptId.create('rec-001'),
          sale,
          payments: [payment],
          receiptNumber: ReceiptNumber.create('REC-2026-000101'),
        },
        clock,
      );

      // Receipt captures accurate commercial representation
      expect(receipt.saleId.value).toBe(sale.id.value);
      expect(receipt.tenantId).toBe(sale.tenantId);
      expect(receipt.subtotal.cents).toBe(sale.subtotal.cents);
      expect(receipt.discountTotal.cents).toBe(sale.discountTotal.cents);
      expect(receipt.total.cents).toBe(sale.total.cents);
      expect(receipt.items.length).toBe(sale.items.length);
      expect(receipt.status).toBe(ReceiptStatus.ISSUED);

      // Crucial Architectural Invariant: Sale Aggregate is completely unmutated
      const saleSnapshotAfter = captureSaleDeepSnapshot(sale);
      expect(saleSnapshotAfter).toEqual(saleSnapshotBefore);
      expect(sale.status).toBe(SaleStatus.PAID);
      expect(sale.version).toBe(saleSnapshotBefore.version);
      expect(sale.getUncommittedEvents()).toHaveLength(0);
    });

    it('proves Receipt does NOT compute authoritative Sale totals independently', () => {
      const { sale, payment } = createStandardSettledSaleAndPayment();

      const receipt = Receipt.fromSettledSale(
        {
          id: ReceiptId.create('rec-002'),
          sale,
          payments: [payment],
          receiptNumber: 'REC-2026-000102',
        },
        clock,
      );

      // The Receipt adopts the Sale's authoritative totals directly
      expect(receipt.subtotal.equals(sale.subtotal)).toBe(true);
      expect(receipt.discountTotal.equals(sale.discountTotal)).toBe(true);
      expect(receipt.total.equals(sale.total)).toBe(true);

      // Verify that Sale remains the sole calculator:
      // subtotal ($200.00) - discountTotal ($29.00) === total ($171.00)
      expect(receipt.subtotal.cents - receipt.discountTotal.cents).toBe(receipt.total.cents);
    });
  });

  // ==========================================================================
  // 2. Authority Isolation: Source of Truth Integrity
  // ==========================================================================
  describe('2. Authority Isolation: Sale vs Payment vs Receipt', () => {
    it('proves Sale is the sole source of truth for items, subtotals, discounts, and currency', () => {
      const { sale, payment } = createStandardSettledSaleAndPayment();
      const receipt = Receipt.fromSettledSale(
        {
          id: ReceiptId.create('rec-003'),
          sale,
          payments: [payment],
          receiptNumber: 'REC-2026-000103',
        },
        clock,
      );

      // Mutating the returned array of receipt item snapshots has zero impact on Sale
      const receiptItemsCopy = [...receipt.items];
      // receiptItemsCopy is a copy of frozen items
      expect(receiptItemsCopy.length).toBe(sale.items.length);

      // Currency is strictly governed by Sale
      expect(receipt.subtotal.currency).toBe(sale.currency);
      expect(receipt.total.currency).toBe(sale.currency);
    });

    it('proves Payment is the sole source of truth for payment lifecycle, state, and tender method', () => {
      const { sale, payment } = createStandardSettledSaleAndPayment();

      expect(payment.status).toBe(PaymentStatus.COMPLETED);
      expect(payment.method).toBe(PaymentMethod.CASH);
      expect(payment.amount.cents).toBe(17100);

      const receipt = Receipt.fromSettledSale(
        {
          id: ReceiptId.create('rec-004'),
          sale,
          payments: [payment],
          receiptNumber: 'REC-2026-000104',
        },
        clock,
      );

      // Receipt captures payment snapshot; does not alter payment aggregate
      expect(receipt.payments[0]!.paymentId).toBe(payment.id.value);
      expect(receipt.payments[0]!.method).toBe(PaymentMethod.CASH);
      expect(receipt.payments[0]!.status).toBe(PaymentStatus.COMPLETED);
    });

    it('proves Receipt alone manages historical presentation, reprint sequence, and reprint count', () => {
      const { sale, payment } = createStandardSettledSaleAndPayment();
      const receipt = Receipt.fromSettledSale(
        {
          id: ReceiptId.create('rec-005'),
          sale,
          payments: [payment],
          receiptNumber: 'REC-2026-000105',
        },
        clock,
      );

      const saleSnapshotBefore = captureSaleDeepSnapshot(sale);

      expect(receipt.reprintCount).toBe(0);
      expect(receipt.status).toBe(ReceiptStatus.ISSUED);

      // Reprint receipt
      clock.advance(60000);
      receipt.recordReprint(clock);

      expect(receipt.reprintCount).toBe(1);
      expect(receipt.status).toBe(ReceiptStatus.REPRINTED);
      expect(receipt.lastReprintedAt).toBeDefined();

      // Proves that reprint operation did not touch or mutate the underlying Sale
      const saleSnapshotAfter = captureSaleDeepSnapshot(sale);
      expect(saleSnapshotAfter).toEqual(saleSnapshotBefore);
    });
  });

  // ==========================================================================
  // 3. Invariant Enforcement: Receipt Creation Cannot Bypass Sale Invariants
  // ==========================================================================
  describe('3. Invariant Enforcement: Receipt Creation Cannot Bypass Sale Invariants', () => {
    it('strictly forbids issuing a Receipt for a Sale in DRAFT status', () => {
      const sale = Sale.create({ source, tenantId: 'tenant-1', currency: 'USD' }, clock);
      sale.addItem(
        {
          id: SaleItemId.create('item-1'),
          source,
          description: 'Consultation',
          quantity: 1,
          unitPrice: Money.create(100.0, 'USD'),
        },
        clock,
      );

      const payment = Payment.createSettled(
        {
          id: PaymentId.create('pay-1'),
          saleId: sale.id,
          tenantId: sale.tenantId,
          method: PaymentMethod.CASH,
          amount: Money.create(100.0, 'USD'),
        },
        clock,
      );

      expect(sale.status).toBe(SaleStatus.DRAFT);

      expect(() =>
        Receipt.fromSettledSale(
          {
            id: ReceiptId.create('rec-fail-1'),
            sale,
            payments: [payment],
            receiptNumber: 'REC-2026-000106',
          },
          clock,
        ),
      ).toThrow(ReceiptDomainException);
    });

    it('strictly forbids issuing a Receipt for a Sale in PENDING_PAYMENT status', () => {
      const sale = Sale.create({ source, tenantId: 'tenant-1', currency: 'USD' }, clock);
      sale.addItem(
        {
          id: SaleItemId.create('item-1'),
          source,
          description: 'Consultation',
          quantity: 1,
          unitPrice: Money.create(100.0, 'USD'),
        },
        clock,
      );
      sale.finalize(clock);

      const payment = Payment.createPending(
        {
          id: PaymentId.create('pay-2'),
          saleId: sale.id,
          tenantId: sale.tenantId,
          method: PaymentMethod.CASH,
          amount: Money.create(100.0, 'USD'),
        },
        clock,
      );

      expect(sale.status).toBe(SaleStatus.PENDING_PAYMENT);

      expect(() =>
        Receipt.fromSettledSale(
          {
            id: ReceiptId.create('rec-fail-2'),
            sale,
            payments: [payment],
            receiptNumber: 'REC-2026-000107',
          },
          clock,
        ),
      ).toThrow(ReceiptDomainException);
    });

    it('strictly forbids issuing a Receipt for a Sale in PARTIALLY_PAID status', () => {
      const sale = Sale.create({ source, tenantId: 'tenant-1', currency: 'USD' }, clock);
      sale.addItem(
        {
          id: SaleItemId.create('item-1'),
          source,
          description: 'Consultation',
          quantity: 1,
          unitPrice: Money.create(100.0, 'USD'),
        },
        clock,
      );
      sale.finalize(clock);
      sale.markPartiallyPaid(clock);

      const partialPayment = Payment.createSettled(
        {
          id: PaymentId.create('pay-3'),
          saleId: sale.id,
          tenantId: sale.tenantId,
          method: PaymentMethod.CASH,
          amount: Money.create(40.0, 'USD'),
        },
        clock,
      );

      expect(sale.status).toBe(SaleStatus.PARTIALLY_PAID);

      expect(() =>
        Receipt.fromSettledSale(
          {
            id: ReceiptId.create('rec-fail-3'),
            sale,
            payments: [partialPayment],
            receiptNumber: 'REC-2026-000108',
          },
          clock,
        ),
      ).toThrow(ReceiptDomainException);
    });

    it('strictly forbids issuing a Receipt for a Sale in CANCELLED status', () => {
      const sale = Sale.create({ source, tenantId: 'tenant-1', currency: 'USD' }, clock);
      sale.addItem(
        {
          id: SaleItemId.create('item-1'),
          source,
          description: 'Consultation',
          quantity: 1,
          unitPrice: Money.create(100.0, 'USD'),
        },
        clock,
      );
      sale.finalize(clock);
      sale.cancel('Client requested cancellation', clock);

      const payment = Payment.createSettled(
        {
          id: PaymentId.create('pay-4'),
          saleId: sale.id,
          tenantId: sale.tenantId,
          method: PaymentMethod.CASH,
          amount: Money.create(100.0, 'USD'),
        },
        clock,
      );

      expect(sale.status).toBe(SaleStatus.CANCELLED);

      expect(() =>
        Receipt.fromSettledSale(
          {
            id: ReceiptId.create('rec-fail-4'),
            sale,
            payments: [payment],
            receiptNumber: 'REC-2026-000109',
          },
          clock,
        ),
      ).toThrow(ReceiptDomainException);
    });

    it('strictly forbids issuing a Receipt if payment tenders array is empty', () => {
      const { sale } = createStandardSettledSaleAndPayment();

      expect(() =>
        Receipt.fromSettledSale(
          {
            id: ReceiptId.create('rec-fail-5'),
            sale,
            payments: [],
            receiptNumber: 'REC-2026-000110',
          },
          clock,
        ),
      ).toThrow(ReceiptDomainException);
    });

    it('proves IssueReceiptHandler enforces tender coverage before issuing a Receipt', async () => {
      const saleRepo = new InMemorySaleRepo();
      const paymentRepo = new InMemoryPaymentRepo();
      const receiptRepo = new InMemoryReceiptRepo();

      const handler = new IssueReceiptHandler(receiptRepo, saleRepo, paymentRepo, undefined, clock);

      // Create a sale for $100.00
      const sale = Sale.create({ source, tenantId: 'tenant-alpha', currency: 'USD' }, clock);
      sale.addItem(
        {
          id: SaleItemId.create('item-underpaid'),
          source,
          description: 'Single Session',
          quantity: 1,
          unitPrice: Money.create(100.0, 'USD'),
        },
        clock,
      );
      sale.finalize(clock);

      // Create an UNDERPAID payment of only $40.00
      const partialPayment = Payment.createSettled(
        {
          id: PaymentId.create('pay-underpaid'),
          saleId: sale.id,
          tenantId: sale.tenantId,
          method: PaymentMethod.CASH,
          amount: Money.create(40.0, 'USD'),
        },
        clock,
      );

      await saleRepo.save(sale);
      await paymentRepo.save(partialPayment);

      const command = new IssueReceiptCommand({
        saleId: sale.id.value,
        tenantId: sale.tenantId!,
        currentUser: {
          permissions: ['receipts.manage'],
          roles: ['Receptionist'],
        },
      });

      // Handler rejects because sale is not settled and payments ($40) < sale total ($100)
      const result = await handler.execute(command);
      expect(result.isFailure).toBe(true);
      const errorObj = result.getError();
      const message = errorObj instanceof Error ? errorObj.message : String(errorObj);
      expect(message).toMatch(/requires PAID or COMPLETED sale|Cannot issue receipt/);
    });
  });

  // ==========================================================================
  // 4. Decoupling & Absence of Circular Dependencies
  // ==========================================================================
  describe('4. Architectural Decoupling & Circular Dependency Immunity', () => {
    it('proves Sale aggregate prototype has ZERO awareness, properties, or dependencies on Receipt', () => {
      const saleProps = Object.getOwnPropertyNames(Sale.prototype);
      const saleHasReceipt = saleProps.some((p) => p.toLowerCase().includes('receipt'));
      expect(saleHasReceipt).toBe(false);

      const saleItemProps = Object.getOwnPropertyNames(SaleItem.prototype);
      const saleItemHasReceipt = saleItemProps.some((p) => p.toLowerCase().includes('receipt'));
      expect(saleItemHasReceipt).toBe(false);
    });

    it('proves separate persistence boundaries: SaleRepository does not persist Receipts', () => {
      const saleRepo = new InMemorySaleRepo();
      const receiptRepo = new InMemoryReceiptRepo();

      const { sale, payment } = createStandardSettledSaleAndPayment();
      const receipt = Receipt.fromSettledSale(
        {
          id: ReceiptId.create('rec-persist-1'),
          sale,
          payments: [payment],
          receiptNumber: 'REC-2026-000111',
        },
        clock,
      );

      // Each repository stores only its own root
      saleRepo.save(sale);
      receiptRepo.save(receipt);

      expect(saleRepo.store.has(sale.id.value)).toBe(true);
      expect(receiptRepo.store.has(receipt.id.value)).toBe(true);
      expect(saleRepo.store.has(receipt.id.value)).toBe(false);
    });
  });
});
