import {
  Payment,
  PaymentId,
  SaleId,
  Money,
  PaymentMethod,
  PaymentStatus,
  PaymentReference,
  Clock,
  TestClock,
} from '@kinergy-platform/core';

/**
 * Fluent test builder for constructing valid Payment aggregates.
 * Guarantees compliance with ADR-0116 lifecycle transitions and positive monetary values.
 */
export class PaymentTestBuilder {
  private id = 'pay-builder-01';
  private saleId = 'sale-builder-01';
  private tenantId = 'tenant-test-main';
  private method: PaymentMethod = PaymentMethod.QR;
  private amount: Money = Money.create(100.0, 'USD');
  private status: PaymentStatus = PaymentStatus.COMPLETED;
  private reference?: string = 'QR-BUILDER-REF-01';
  private clock: Clock = new TestClock(new Date('2026-10-02T12:00:00.000Z'));

  public withId(id: string): this {
    this.id = id;
    return this;
  }

  public withSaleId(saleId: string): this {
    this.saleId = saleId;
    return this;
  }

  public withTenantId(tenantId: string): this {
    this.tenantId = tenantId;
    return this;
  }

  public withMethod(method: PaymentMethod): this {
    this.method = method;
    return this;
  }

  public withAmount(amount: Money): this {
    this.amount = amount;
    return this;
  }

  public withStatus(status: PaymentStatus): this {
    this.status = status;
    return this;
  }

  public withReference(reference?: string): this {
    this.reference = reference;
    return this;
  }

  public withClock(clock: Clock): this {
    this.clock = clock;
    return this;
  }

  public build(): Payment {
    if (this.status === PaymentStatus.COMPLETED) {
      return Payment.createCompleted(
        {
          id: PaymentId.create(this.id),
          saleId: SaleId.create(this.saleId),
          tenantId: this.tenantId,
          method: this.method,
          amount: this.amount,
          reference: this.reference,
        },
        this.clock,
      );
    }

    if (this.status === PaymentStatus.PENDING) {
      return Payment.createPending(
        {
          id: PaymentId.create(this.id),
          saleId: SaleId.create(this.saleId),
          tenantId: this.tenantId,
          method: this.method,
          amount: this.amount,
        },
        this.clock,
      );
    }

    // Reconstitute failed or cancelled states
    return Payment.reconstitute({
      id: PaymentId.create(this.id),
      saleId: SaleId.create(this.saleId),
      tenantId: this.tenantId,
      method: this.method,
      amount: this.amount,
      status: this.status,
      reference: this.reference ? PaymentReference.create(this.reference) : null,
      paidAt: null,
      createdAt: this.clock.now(),
      updatedAt: this.clock.now(),
      version: 1,
    });
  }
}
