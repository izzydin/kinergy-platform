import {
  Receipt,
  ReceiptId,
  ReceiptNumber,
  SaleId,
  Money,
  SourceType,
  PaymentMethod,
  PaymentStatus,
  ReceiptClientSnapshot,
  ReceiptItemSnapshot,
  ReceiptPaymentSnapshot,
  Clock,
  TestClock,
} from '@kinergy-platform/core';

/**
 * Fluent test builder for constructing valid Receipt aggregates.
 * Guarantees compliance with ADR-0117 point-in-time snapshot and proof-of-purchase invariants.
 */
export class ReceiptTestBuilder {
  private id = 'rcpt-builder-01';
  private tenantId = 'tenant-test-main';
  private saleId = 'sale-builder-01';
  private receiptNumber = 'REC-2026-000001';
  private saleReference = 'ORD-2026-BUILDER-01';
  private clientSnapshot?: ReceiptClientSnapshot | null = ReceiptClientSnapshot.create({
    clientId: 'cli-builder-01',
    fullName: 'Jane Builder Client',
    email: 'jane.builder@example.com',
  });
  private amount: Money = Money.create(100.0, 'USD');
  private clock: Clock = new TestClock(new Date('2026-10-02T12:00:00.000Z'));

  public withId(id: string): this {
    this.id = id;
    return this;
  }

  public withTenantId(tenantId: string): this {
    this.tenantId = tenantId;
    return this;
  }

  public withSaleId(saleId: string): this {
    this.saleId = saleId;
    return this;
  }

  public withReceiptNumber(receiptNumber: string): this {
    this.receiptNumber = receiptNumber;
    return this;
  }

  public withSaleReference(saleReference: string): this {
    this.saleReference = saleReference;
    return this;
  }

  public withClientSnapshot(snapshot: ReceiptClientSnapshot | null): this {
    this.clientSnapshot = snapshot;
    return this;
  }

  public withAmount(amount: Money): this {
    this.amount = amount;
    return this;
  }

  public withClock(clock: Clock): this {
    this.clock = clock;
    return this;
  }

  public build(): Receipt {
    return Receipt.create(
      {
        id: ReceiptId.create(this.id),
        tenantId: this.tenantId,
        saleId: SaleId.create(this.saleId),
        receiptNumber: ReceiptNumber.create(this.receiptNumber),
        saleReference: this.saleReference,
        clientSnapshot: this.clientSnapshot ?? null,
        items: [
          ReceiptItemSnapshot.create({
            itemId: 'item-builder-1',
            sourceType: SourceType.INVENTORY_ITEM,
            sourceId: 'inv-builder-1',
            description: 'Standard Clinical Therapy',
            quantity: 1,
            unitPrice: this.amount,
            subtotal: this.amount,
            total: this.amount,
          }),
        ],
        payments: [
          ReceiptPaymentSnapshot.create({
            paymentId: 'pay-builder-1',
            method: PaymentMethod.QR,
            status: PaymentStatus.COMPLETED,
            amount: this.amount,
            paidAt: this.clock.now(),
          }),
        ],
        subtotal: this.amount,
        total: this.amount,
      },
      this.clock,
    );
  }
}
