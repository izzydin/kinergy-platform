import { ApplyDiscountHandler } from '../handlers/apply-discount.handler';
import { ApplyDiscountCommand, ApplyDiscountInput } from '../commands/apply-discount.command';
import { SaleRepositoryPort } from '../ports/sale-repository.port';
import { SalesEventPublisherPort } from '../ports/sales-event-publisher.port';
import { Sale } from '../../domain/sale.aggregate';
import { SaleId } from '../../domain/value-objects/sale-id.vo';
import { SaleSource } from '../../domain/value-objects/sale-source.vo';
import { Money } from '../../domain/value-objects/money.vo';
import { Discount } from '../../domain/value-objects/discount.vo';
import { SaleStatus } from '../../domain/enums/sale-status.enum';
import { SaleSourceType } from '../../domain/enums/sale-source-type.enum';
import { DeterministicClock } from '../../domain/shared/clock';
import { DomainEvent } from '../../domain/shared/domain-event';
import { SaleNotFoundException } from '../exceptions/sale-not-found.exception';
import { SaleAlreadyFinalizedException } from '../../domain/exceptions/sale-already-finalized.exception';
import { InvalidSaleStateException } from '../../domain/exceptions/invalid-sale-state.exception';
import { InvalidDiscountException } from '../../domain/exceptions/invalid-discount.exception';

class InMemorySaleRepository implements SaleRepositoryPort {
  public store = new Map<string, Sale>();
  public saveCallCount = 0;
  public throwOnSave?: Error;

  async findById(id: SaleId | string): Promise<Sale | null> {
    const key = typeof id === 'string' ? id.trim() : id.value;
    return this.store.get(key) ?? null;
  }

  async save(sale: Sale): Promise<void> {
    this.saveCallCount++;
    if (this.throwOnSave) {
      throw this.throwOnSave;
    }
    this.store.set(sale.id.value, sale);
  }

  clear(): void {
    this.store.clear();
    this.saveCallCount = 0;
    this.throwOnSave = undefined;
  }
}

class MockSalesEventPublisher implements SalesEventPublisherPort {
  public publishedEvents: DomainEvent[] = [];

  async publish(events: ReadonlyArray<DomainEvent>): Promise<void> {
    this.publishedEvents.push(...events);
  }

  clear(): void {
    this.publishedEvents = [];
  }
}

function getErrorMessage(result: { getError(): Error | string | null }): string {
  const err = result.getError();
  return err instanceof Error ? err.message : String(err ?? '');
}

describe('ApplyDiscountHandler Specification (Milestone 7.11, 7.3 & ADR-0132)', () => {
  const fixedNow = new Date('2026-10-04T12:00:00.000Z');
  let clock: DeterministicClock;
  let saleRepo: InMemorySaleRepository;
  let eventPublisher: MockSalesEventPublisher;
  let handler: ApplyDiscountHandler;

  beforeEach(() => {
    clock = new DeterministicClock(fixedNow);
    saleRepo = new InMemorySaleRepository();
    eventPublisher = new MockSalesEventPublisher();
    handler = new ApplyDiscountHandler(saleRepo, clock, eventPublisher);
  });

  const createDraftSale = (
    subtotalAmount = 100.0,
    itemDiscount?: Discount,
    saleIdStr = 'sale_disc_test_01',
  ): Sale => {
    const sale = Sale.create(
      {
        id: SaleId.create(saleIdStr),
        currency: 'USD',
        tenantId: 'tenant_kinergy_main',
        clientId: 'client_01',
        source: SaleSource.create(SaleSourceType.FOOD, 'pos_station_1'),
      },
      clock,
    );

    sale.addItem(
      {
        source: SaleSource.create(SaleSourceType.FOOD, 'food_stock'),
        description: 'Fitness Session',
        quantity: 1,
        unitPrice: Money.create(subtotalAmount, 'USD'),
        discount: itemDiscount,
      },
      clock,
    );

    saleRepo.store.set(sale.id.value, sale);
    return sale;
  };

  describe('1. Fixed Discount', () => {
    it('applies a whole-dollar fixed discount and recalculates totals deterministically', async () => {
      const sale = createDraftSale(100.0);

      const command = new ApplyDiscountCommand({
        saleId: sale.id.value,
        discount: {
          type: 'FIXED',
          value: 20.0,
          reason: '$20 Welcome Voucher',
        },
      });

      const result = await handler.execute(command);

      expect(result.isSuccess).toBe(true);
      const dto = result.getValue();
      expect(dto.subtotal.amount).toBe(100.0);
      expect(dto.discountTotal.amount).toBe(20.0);
      expect(dto.discountTotal.cents).toBe(2000);
      expect(dto.total.amount).toBe(80.0);
      expect(dto.total.cents).toBe(8000);
      expect(dto.orderDiscount).toBeDefined();
      expect(dto.orderDiscount?.type).toBe('FIXED');
      expect(dto.orderDiscount?.value).toBe(20.0);
      expect(dto.orderDiscount?.reason).toBe('$20 Welcome Voucher');

      // Verify persisted state in repository
      const persisted = await saleRepo.findById(sale.id.value);
      expect(persisted).not.toBeNull();
      expect(persisted!.discountTotal.cents).toBe(2000);
      expect(persisted!.total.cents).toBe(8000);
      expect(persisted!.orderDiscount?.value).toBe(20.0);
    });

    it('applies a cents-precise fixed discount without floating-point inaccuracies', async () => {
      const sale = createDraftSale(50.0);

      const command = new ApplyDiscountCommand({
        saleId: sale.id.value,
        discount: {
          type: 'FIXED',
          value: 12.34,
        },
      });

      const result = await handler.execute(command);

      expect(result.isSuccess).toBe(true);
      const dto = result.getValue();
      expect(dto.subtotal.cents).toBe(5000);
      expect(dto.discountTotal.cents).toBe(1234);
      expect(dto.total.cents).toBe(3766);
      expect(dto.total.amount).toBe(37.66);
    });

    it('supports FIXED_AMOUNT type equivalently to FIXED', async () => {
      const sale = createDraftSale(80.0);

      const command = new ApplyDiscountCommand({
        saleId: sale.id.value,
        discount: {
          type: 'FIXED_AMOUNT',
          value: 15.0,
          reason: 'Manager override',
        },
      });

      const result = await handler.execute(command);

      expect(result.isSuccess).toBe(true);
      const dto = result.getValue();
      expect(dto.discountTotal.cents).toBe(1500);
      expect(dto.total.cents).toBe(6500);
    });
  });

  describe('2. Percentage Discount', () => {
    it('applies a standard percentage discount and calculates integer reduction', async () => {
      const sale = createDraftSale(100.0);

      const command = new ApplyDiscountCommand({
        saleId: sale.id.value,
        discount: {
          type: 'PERCENTAGE',
          value: 15,
          reason: '15% Member Discount',
        },
      });

      const result = await handler.execute(command);

      expect(result.isSuccess).toBe(true);
      const dto = result.getValue();
      expect(dto.subtotal.amount).toBe(100.0);
      expect(dto.discountTotal.amount).toBe(15.0);
      expect(dto.discountTotal.cents).toBe(1500);
      expect(dto.total.amount).toBe(85.0);
      expect(dto.total.cents).toBe(8500);
      expect(dto.orderDiscount?.type).toBe('PERCENTAGE');
      expect(dto.orderDiscount?.value).toBe(15);
      expect(dto.orderDiscount?.reason).toBe('15% Member Discount');
    });

    it('applies 100% percentage discount resulting in a 0.00 total', async () => {
      const sale = createDraftSale(120.0);

      const command = new ApplyDiscountCommand({
        saleId: sale.id.value,
        discount: {
          type: 'PERCENTAGE',
          value: 100,
          reason: 'Full Scholarship 100%',
        },
      });

      const result = await handler.execute(command);

      expect(result.isSuccess).toBe(true);
      const dto = result.getValue();
      expect(dto.discountTotal.cents).toBe(12000);
      expect(dto.total.cents).toBe(0);
      expect(dto.total.amount).toBe(0.0);
    });

    it('applies 0% percentage discount without altering the total', async () => {
      const sale = createDraftSale(75.0);

      const command = new ApplyDiscountCommand({
        saleId: sale.id.value,
        discount: {
          type: 'PERCENTAGE',
          value: 0,
        },
      });

      const result = await handler.execute(command);

      expect(result.isSuccess).toBe(true);
      const dto = result.getValue();
      expect(dto.discountTotal.cents).toBe(0);
      expect(dto.total.cents).toBe(7500);
    });

    it('executes Commercial Half-Up rounding in integer cents (e.g. 15% on $33.33)', async () => {
      // $33.33 = 3333 cents. 3333 * 0.15 = 499.95 -> rounds to 500 cents ($5.00). Total = 2833 cents ($28.33).
      const sale = createDraftSale(33.33);

      const command = new ApplyDiscountCommand({
        saleId: sale.id.value,
        discount: {
          type: 'PERCENTAGE',
          value: 15,
        },
      });

      const result = await handler.execute(command);

      expect(result.isSuccess).toBe(true);
      const dto = result.getValue();
      expect(dto.subtotal.cents).toBe(3333);
      expect(dto.discountTotal.cents).toBe(500);
      expect(dto.total.cents).toBe(2833);
      expect(dto.total.amount).toBe(28.33);
    });
  });

  describe('3. Optional Reason', () => {
    it('preserves valid reason text on the discount domain representation', async () => {
      const sale = createDraftSale(50.0);

      const command = new ApplyDiscountCommand({
        saleId: sale.id.value,
        discount: {
          type: 'FIXED',
          value: 5.0,
          reason: 'Holiday Promotion 2026',
        },
      });

      const result = await handler.execute(command);

      expect(result.isSuccess).toBe(true);
      expect(result.getValue().orderDiscount?.reason).toBe('Holiday Promotion 2026');
    });

    it('handles undefined reason gracefully by storing null', async () => {
      const sale = createDraftSale(50.0);

      const command = new ApplyDiscountCommand({
        saleId: sale.id.value,
        discount: {
          type: 'FIXED',
          value: 5.0,
        },
      });

      const result = await handler.execute(command);

      expect(result.isSuccess).toBe(true);
      expect(result.getValue().orderDiscount?.reason).toBeNull();
    });

    it('handles explicit null reason gracefully by storing null', async () => {
      const sale = createDraftSale(50.0);

      const command = new ApplyDiscountCommand({
        saleId: sale.id.value,
        discount: {
          type: 'PERCENTAGE',
          value: 10,
          reason: null,
        },
      });

      const result = await handler.execute(command);

      expect(result.isSuccess).toBe(true);
      expect(result.getValue().orderDiscount?.reason).toBeNull();
    });

    it('rejects empty or whitespace-only reason via domain InvalidDiscountException', async () => {
      const sale = createDraftSale(50.0);

      const command = new ApplyDiscountCommand({
        saleId: sale.id.value,
        discount: {
          type: 'FIXED',
          value: 5.0,
          reason: '   ',
        },
      });

      const result = await handler.execute(command);

      expect(result.isFailure).toBe(true);
      expect(result.getError()).toBeInstanceOf(InvalidDiscountException);
      expect(getErrorMessage(result)).toContain(
        'Discount reason, if provided, cannot be empty or whitespace.',
      );
    });

    it('rejects reason exceeding 255 characters via domain InvalidDiscountException', async () => {
      const sale = createDraftSale(50.0);

      const command = new ApplyDiscountCommand({
        saleId: sale.id.value,
        discount: {
          type: 'FIXED',
          value: 5.0,
          reason: 'A'.repeat(256),
        },
      });

      const result = await handler.execute(command);

      expect(result.isFailure).toBe(true);
      expect(result.getError()).toBeInstanceOf(InvalidDiscountException);
      expect(getErrorMessage(result)).toContain('cannot exceed 255 characters');
    });
  });

  describe('4. Invalid Discount (Domain-Enforced Rules)', () => {
    it('fails when discount type is not recognized by the domain', async () => {
      const sale = createDraftSale(100.0);

      const command = new ApplyDiscountCommand({
        saleId: sale.id.value,
        discount: {
          type: 'UNSUPPORTED_TYPE',
          value: 10.0,
        },
      });

      const result = await handler.execute(command);

      expect(result.isFailure).toBe(true);
      expect(result.getError()).toBeInstanceOf(InvalidDiscountException);
      expect(getErrorMessage(result)).toContain("Invalid discount type: 'UNSUPPORTED_TYPE'.");
    });

    it('fails when discount value is negative', async () => {
      const sale = createDraftSale(100.0);

      const command = new ApplyDiscountCommand({
        saleId: sale.id.value,
        discount: {
          type: 'FIXED',
          value: -10.0,
        },
      });

      const result = await handler.execute(command);

      expect(result.isFailure).toBe(true);
      expect(result.getError()).toBeInstanceOf(InvalidDiscountException);
      expect(getErrorMessage(result)).toContain('Discount value cannot be negative, got: -10.');
    });

    it('fails when discount value is NaN', async () => {
      const sale = createDraftSale(100.0);

      const command = new ApplyDiscountCommand({
        saleId: sale.id.value,
        discount: {
          type: 'PERCENTAGE',
          value: NaN,
        },
      });

      const result = await handler.execute(command);

      expect(result.isFailure).toBe(true);
      expect(result.getError()).toBeInstanceOf(InvalidDiscountException);
      expect(getErrorMessage(result)).toContain('Discount value must be a finite number');
    });

    it('fails when discount value is Infinity', async () => {
      const sale = createDraftSale(100.0);

      const command = new ApplyDiscountCommand({
        saleId: sale.id.value,
        discount: {
          type: 'FIXED',
          value: Infinity,
        },
      });

      const result = await handler.execute(command);

      expect(result.isFailure).toBe(true);
      expect(result.getError()).toBeInstanceOf(InvalidDiscountException);
      expect(getErrorMessage(result)).toContain('Discount value must be a finite number');
    });
  });

  describe('5. Discount Exceeding Permitted Value', () => {
    it('fails when percentage discount exceeds 100% via domain InvalidDiscountException', async () => {
      const sale = createDraftSale(100.0);

      const command = new ApplyDiscountCommand({
        saleId: sale.id.value,
        discount: {
          type: 'PERCENTAGE',
          value: 100.01,
        },
      });

      const result = await handler.execute(command);

      expect(result.isFailure).toBe(true);
      expect(result.getError()).toBeInstanceOf(InvalidDiscountException);
      expect(getErrorMessage(result)).toContain(
        'Percentage discount cannot exceed 100%, got: 100.01%.',
      );
    });

    it('enforces non-negative total invariant when fixed discount exceeds eligible cart subtotal', async () => {
      // Sale subtotal is $50.00, discount is $100.00 voucher
      // Domain guarantees non-negative total invariant (ADR-0114 Section 5.3 & Milestone 7.3):
      // reduction is capped at eligible subtotal ($50.00), floor total is $0.00
      const sale = createDraftSale(50.0);

      const command = new ApplyDiscountCommand({
        saleId: sale.id.value,
        discount: {
          type: 'FIXED',
          value: 100.0,
          reason: 'Excessive Voucher',
        },
      });

      const result = await handler.execute(command);

      expect(result.isSuccess).toBe(true);
      const dto = result.getValue();
      expect(dto.subtotal.amount).toBe(50.0);
      expect(dto.discountTotal.amount).toBe(50.0);
      expect(dto.discountTotal.cents).toBe(5000);
      expect(dto.total.amount).toBe(0.0);
      expect(dto.total.cents).toBe(0);

      // Verify persisted state in repository
      const persisted = await saleRepo.findById(sale.id.value);
      expect(persisted!.discountTotal.cents).toBe(5000);
      expect(persisted!.total.cents).toBe(0);
      expect(persisted!.orderDiscount?.value).toBe(100.0);
    });
  });

  describe('6. Cancelled Sale Immutability', () => {
    it('rejects applyDiscount on a CANCELLED sale with SaleAlreadyFinalizedException', async () => {
      const sale = createDraftSale(100.0);
      sale.cancel('Customer declined transaction', clock);
      await saleRepo.save(sale);

      const command = new ApplyDiscountCommand({
        saleId: sale.id.value,
        discount: {
          type: 'PERCENTAGE',
          value: 10,
        },
      });

      const result = await handler.execute(command);

      expect(result.isFailure).toBe(true);
      expect(result.getError()).toBeInstanceOf(SaleAlreadyFinalizedException);
      expect(getErrorMessage(result)).toContain(
        `Cannot mutate Sale '${sale.id.value}' in status 'CANCELLED'`,
      );
    });
  });

  describe('7. Payment-State Restrictions', () => {
    it('blocks applyDiscount when Sale is in PENDING_PAYMENT status', async () => {
      const sale = createDraftSale(100.0);
      sale.finalize(clock);
      await saleRepo.save(sale);
      expect(sale.status).toBe(SaleStatus.PENDING_PAYMENT);

      const command = new ApplyDiscountCommand({
        saleId: sale.id.value,
        discount: { type: 'FIXED', value: 10.0 },
      });

      const result = await handler.execute(command);

      expect(result.isFailure).toBe(true);
      expect(result.getError()).toBeInstanceOf(SaleAlreadyFinalizedException);
      expect(getErrorMessage(result)).toContain(
        `Cannot mutate Sale '${sale.id.value}' in status 'PENDING_PAYMENT'`,
      );
    });

    it('blocks applyDiscount when Sale is in PARTIALLY_PAID status', async () => {
      const sale = createDraftSale(100.0);
      sale.finalize(clock);
      sale.markPartiallyPaid(clock);
      await saleRepo.save(sale);
      expect(sale.status).toBe(SaleStatus.PARTIALLY_PAID);

      const command = new ApplyDiscountCommand({
        saleId: sale.id.value,
        discount: { type: 'FIXED', value: 10.0 },
      });

      const result = await handler.execute(command);

      expect(result.isFailure).toBe(true);
      expect(result.getError()).toBeInstanceOf(SaleAlreadyFinalizedException);
      expect(getErrorMessage(result)).toContain(
        `Cannot mutate Sale '${sale.id.value}' in status 'PARTIALLY_PAID'`,
      );
    });

    it('blocks applyDiscount when Sale is in PAID status', async () => {
      const sale = createDraftSale(100.0);
      sale.finalize(clock);
      sale.markPaid(clock);
      await saleRepo.save(sale);
      expect(sale.status).toBe(SaleStatus.PAID);

      const command = new ApplyDiscountCommand({
        saleId: sale.id.value,
        discount: { type: 'PERCENTAGE', value: 10 },
      });

      const result = await handler.execute(command);

      expect(result.isFailure).toBe(true);
      expect(result.getError()).toBeInstanceOf(SaleAlreadyFinalizedException);
      expect(getErrorMessage(result)).toContain(
        `Cannot mutate Sale '${sale.id.value}' in status 'PAID'`,
      );
    });

    it('blocks applyDiscount when Sale is in COMPLETED status', async () => {
      const sale = createDraftSale(100.0);
      sale.finalize(clock);
      sale.markPaid(clock);
      sale.markCompleted(clock);
      await saleRepo.save(sale);
      expect(sale.status).toBe(SaleStatus.COMPLETED);

      const command = new ApplyDiscountCommand({
        saleId: sale.id.value,
        discount: { type: 'PERCENTAGE', value: 5 },
      });

      const result = await handler.execute(command);

      expect(result.isFailure).toBe(true);
      expect(result.getError()).toBeInstanceOf(SaleAlreadyFinalizedException);
      expect(getErrorMessage(result)).toContain(
        `Cannot mutate Sale '${sale.id.value}' in status 'COMPLETED'`,
      );
    });

    it('blocks applyDiscount when Sale is in REFUNDED status', async () => {
      const sale = createDraftSale(100.0);
      sale.finalize(clock);
      sale.markPaid(clock);
      sale.markRefunded('Customer requested full refund', clock);
      await saleRepo.save(sale);
      expect(sale.status).toBe(SaleStatus.REFUNDED);

      const command = new ApplyDiscountCommand({
        saleId: sale.id.value,
        discount: { type: 'FIXED', value: 5.0 },
      });

      const result = await handler.execute(command);

      expect(result.isFailure).toBe(true);
      expect(result.getError()).toBeInstanceOf(SaleAlreadyFinalizedException);
      expect(getErrorMessage(result)).toContain(
        `Cannot mutate Sale '${sale.id.value}' in status 'REFUNDED'`,
      );
    });
  });

  describe('8. Multiple Discounts & Compounding', () => {
    it('allows replacing an existing order discount with a new one', async () => {
      const sale = createDraftSale(100.0);

      // 1. Apply first discount: $10.00 fixed
      const res1 = await handler.execute(
        new ApplyDiscountCommand({
          saleId: sale.id.value,
          discount: { type: 'FIXED', value: 10.0, reason: 'First Voucher' },
        }),
      );
      expect(res1.isSuccess).toBe(true);
      expect(res1.getValue().discountTotal.cents).toBe(1000);
      expect(res1.getValue().total.cents).toBe(9000);

      // 2. Replace with a 25% percentage discount
      const res2 = await handler.execute(
        new ApplyDiscountCommand({
          saleId: sale.id.value,
          discount: { type: 'PERCENTAGE', value: 25, reason: 'VIP 25%' },
        }),
      );
      expect(res2.isSuccess).toBe(true);
      expect(res2.getValue().discountTotal.cents).toBe(2500);
      expect(res2.getValue().total.cents).toBe(7500);
      expect(res2.getValue().orderDiscount?.reason).toBe('VIP 25%');
    });

    it('compounds item-level discount and order-level discount deterministically', async () => {
      // Item subtotal = $100.00, line discount = $20.00 fixed -> net pre-order discount = $80.00
      const itemDiscount = Discount.fixed(20.0, '$20 item coupon');
      const sale = createDraftSale(100.0, itemDiscount);

      expect(sale.discountTotal.cents).toBe(2000);
      expect(sale.total.cents).toBe(8000);

      // Apply order-level discount: 10% on remaining net ($80.00) = $8.00
      const command = new ApplyDiscountCommand({
        saleId: sale.id.value,
        discount: {
          type: 'PERCENTAGE',
          value: 10,
          reason: '10% Cart Discount',
        },
      });

      const result = await handler.execute(command);

      expect(result.isSuccess).toBe(true);
      const dto = result.getValue();
      expect(dto.subtotal.cents).toBe(10000);
      // Total discounts = $20.00 (line) + $8.00 (order) = $28.00 (cents: 2800)
      expect(dto.discountTotal.cents).toBe(2800);
      expect(dto.discountTotal.amount).toBe(28.0);
      // Total = $100.00 - $28.00 = $72.00 (cents: 7200)
      expect(dto.total.cents).toBe(7200);
      expect(dto.total.amount).toBe(72.0);
    });
  });

  describe('9. Persistence Failure', () => {
    it('returns failure result when repository save throws', async () => {
      const sale = createDraftSale(100.0);
      saleRepo.throwOnSave = new Error('Database connection lost');

      const command = new ApplyDiscountCommand({
        saleId: sale.id.value,
        discount: {
          type: 'FIXED',
          value: 10.0,
        },
      });

      const result = await handler.execute(command);

      expect(result.isFailure).toBe(true);
      expect(getErrorMessage(result)).toBe('Database connection lost');
      expect(saleRepo.saveCallCount).toBe(1);
    });
  });

  describe('10. Application-Level Structural Validation & Not Found', () => {
    it('returns failure when command or input is null/undefined', async () => {
      const result = await handler.execute(null as unknown as ApplyDiscountCommand);

      expect(result.isFailure).toBe(true);
      expect(result.getError()).toBeInstanceOf(InvalidSaleStateException);
      expect(getErrorMessage(result)).toContain(
        'ApplyDiscountCommand input cannot be null or undefined.',
      );
    });

    it('returns failure when saleId is empty or whitespace', async () => {
      const result = await handler.execute(
        new ApplyDiscountCommand({
          saleId: '   ',
          discount: { type: 'FIXED', value: 10 },
        }),
      );

      expect(result.isFailure).toBe(true);
      expect(result.getError()).toBeInstanceOf(InvalidSaleStateException);
      expect(getErrorMessage(result)).toContain('Sale ID cannot be empty or whitespace.');
    });

    it('returns failure when discount payload is null or undefined', async () => {
      const result = await handler.execute(
        new ApplyDiscountCommand({
          saleId: 'sale_123',
          discount: null as unknown as ApplyDiscountInput['discount'],
        }),
      );

      expect(result.isFailure).toBe(true);
      expect(result.getError()).toBeInstanceOf(InvalidSaleStateException);
      expect(getErrorMessage(result)).toContain('Discount payload cannot be empty or null.');
    });

    it('returns SaleNotFoundException when sale does not exist', async () => {
      const nonExistentId = 'non_existent_sale_999';

      const result = await handler.execute(
        new ApplyDiscountCommand({
          saleId: nonExistentId,
          discount: { type: 'FIXED', value: 10 },
        }),
      );

      expect(result.isFailure).toBe(true);
      expect(result.getError()).toBeInstanceOf(SaleNotFoundException);
      expect(getErrorMessage(result)).toContain(`Sale with ID '${nonExistentId}' was not found.`);
    });
  });

  describe('11. Orchestration Purity Invariant', () => {
    it('delegates discount application and recalculation strictly through sale.applyDiscount', async () => {
      const sale = createDraftSale(100.0);
      const applyDiscountSpy = jest.spyOn(sale, 'applyDiscount');

      const command = new ApplyDiscountCommand({
        saleId: sale.id.value,
        discount: {
          type: 'FIXED',
          value: 15.0,
          reason: 'Orchestration Test',
        },
      });

      const result = await handler.execute(command);

      expect(result.isSuccess).toBe(true);
      expect(applyDiscountSpy).toHaveBeenCalledTimes(1);
      expect(applyDiscountSpy).toHaveBeenCalledWith(expect.any(Discount), clock);
    });
  });
});
