import {
  Sale,
  SaleItem,
  SaleId,
  SaleItemId,
  Money,
  Discount,
  SaleSource,
  SaleSourceType,
  Payment,
  PaymentId,
  PaymentMethod,
  Receipt,
  ReceiptId,
  ReceiptNumber,
  ReceiptClientSnapshot,
  ReceiptItemSnapshot,
  ReceiptPaymentSnapshot,
  Clock,
  TestClock,
} from '@kinergy-platform/core';

export interface SaleItemBuilderProps {
  id?: string;
  sourceType?: SaleSourceType;
  sourceId?: string;
  description: string;
  skuOrCode?: string;
  quantity?: number;
  unitPrice: Money;
  discount?: Discount;
}

/**
 * Fluent test builder for constructing fully consistent Sale aggregates.
 * Guarantees zero impossible financial states by deriving subtotals, discounts,
 * and totals strictly through the aggregate's domain invariants.
 */
export class SaleTestBuilder {
  private id = 'sale-test-builder-01';
  private tenantId = 'tenant-test-main';
  private clientId?: string = 'cli-test-01';
  private currency = 'USD';
  private source: SaleSource = SaleSource.create(
    SaleSourceType.KINESIOLOGY_SESSION,
    'sess-test-01',
  );
  private items: SaleItemBuilderProps[] = [];
  private orderDiscount?: Discount;
  private clock: Clock = new TestClock(new Date('2026-10-02T12:00:00.000Z'));

  public withId(id: string): this {
    this.id = id;
    return this;
  }

  public withTenantId(tenantId: string): this {
    this.tenantId = tenantId;
    return this;
  }

  public withClientId(clientId?: string): this {
    this.clientId = clientId;
    return this;
  }

  public withCurrency(currency: string): this {
    this.currency = currency;
    return this;
  }

  public withSource(source: SaleSource): this {
    this.source = source;
    return this;
  }

  public withClock(clock: Clock): this {
    this.clock = clock;
    return this;
  }

  public withOrderDiscount(discount: Discount): this {
    this.orderDiscount = discount;
    return this;
  }

  public addItem(itemProps: SaleItemBuilderProps): this {
    this.items.push(itemProps);
    return this;
  }

  /**
   * Builds the finalized Sale aggregate in PENDING_PAYMENT status.
   */
  public build(): Sale {
    const sale = Sale.create(
      {
        id: SaleId.create(this.id),
        tenantId: this.tenantId,
        clientId: this.clientId,
        source: this.source,
        currency: this.currency,
      },
      this.clock,
    );

    // If no items were added, supply a default valid item to avoid empty total inconsistencies
    const itemPropsList =
      this.items.length > 0
        ? this.items
        : [
            {
              id: `${this.id}-item-1`,
              description: 'Standard Clinical Consultation',
              unitPrice: Money.create(100.0, this.currency),
              quantity: 1,
            },
          ];

    for (let i = 0; i < itemPropsList.length; i++) {
      const p = itemPropsList[i]!;
      const item = SaleItem.create({
        id: SaleItemId.create(p.id ?? `${this.id}-item-${i + 1}`),
        source:
          p.sourceType && p.sourceId ? SaleSource.create(p.sourceType, p.sourceId) : this.source,
        description: p.description,
        skuOrCode: p.skuOrCode,
        quantity: p.quantity ?? 1,
        unitPrice: p.unitPrice,
        discount: p.discount,
      });
      sale.addItem(item);
    }

    if (this.orderDiscount) {
      sale.applyOrderDiscount(this.orderDiscount);
    }

    sale.finalize(this.clock);
    return sale;
  }

  /**
   * Builds a coordinated cluster: a Sale in PAID status, an exact matching settled Payment, and a Receipt.
   */
  public buildPaid(options?: {
    paymentMethod?: PaymentMethod;
    paymentReference?: string;
    receiptNumber?: string;
  }): {
    sale: Sale;
    payment: Payment;
    receipt: Receipt;
  } {
    const sale = this.build();
    const method = options?.paymentMethod ?? PaymentMethod.QR;
    const ref = options?.paymentReference ?? 'QR-REF-BUILDER-01';

    const payment = Payment.createCompleted(
      {
        id: PaymentId.create(`pay-${sale.id.value}`),
        saleId: sale.id,
        tenantId: this.tenantId,
        amount: sale.total,
        method,
        reference: ref,
      },
      this.clock,
    );

    sale.markPaid(this.clock);

    const receipt = Receipt.create(
      {
        id: ReceiptId.create(`rcpt-${sale.id.value}`),
        receiptNumber: ReceiptNumber.create(options?.receiptNumber ?? 'REC-2026-000001'),
        saleId: sale.id,
        saleReference: sale.source.sourceCode ?? sale.id.value,
        tenantId: this.tenantId,
        clientSnapshot: this.clientId
          ? ReceiptClientSnapshot.create({
              clientId: this.clientId,
              fullName: 'Test Builder Client',
            })
          : null,
        items: sale.items.map((i) =>
          ReceiptItemSnapshot.create({
            itemId: i.id.value,
            sourceType: i.source.sourceType,
            sourceId: i.source.sourceId,
            description: i.description,
            quantity: i.quantity,
            unitPrice: i.unitPrice,
            subtotal: i.subtotal,
            total: i.total,
          }),
        ),
        payments: [
          ReceiptPaymentSnapshot.create({
            paymentId: payment.id.value,
            method: payment.method,
            status: payment.status,
            amount: payment.amount,
            reference: payment.reference?.value ?? null,
            paidAt: payment.paidAt ?? this.clock.now(),
          }),
        ],
        subtotal: sale.subtotal,
        discountTotal: sale.discountTotal,
        total: sale.total,
      },
      this.clock,
    );

    return { sale, payment, receipt };
  }
}
