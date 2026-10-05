import { AddSaleItemHandler } from '../handlers/add-sale-item.handler';
import { AddSaleItemCommand, AddSaleItemInput } from '../commands/add-sale-item.command';
import { SaleRepositoryPort } from '../ports/sale-repository.port';
import { SalesEventPublisherPort } from '../ports/sales-event-publisher.port';
import { Sale } from '../../domain/sale.aggregate';
import { SaleId } from '../../domain/value-objects/sale-id.vo';
import { SaleSource } from '../../domain/value-objects/sale-source.vo';
import { Money } from '../../domain/value-objects/money.vo';
import { Discount } from '../../domain/value-objects/discount.vo';
import { SaleStatus } from '../../domain/enums/sale-status.enum';
import { SaleSourceType } from '../../domain/enums/sale-source-type.enum';
import { SourceType } from '../../domain/enums/source-type.enum';
import { DeterministicClock } from '../../domain/shared/clock';
import { DomainEvent } from '../../domain/shared/domain-event';
import { SaleNotFoundException } from '../exceptions/sale-not-found.exception';
import { SaleAlreadyFinalizedException } from '../../domain/exceptions/sale-already-finalized.exception';
import { InvalidSaleStateException } from '../../domain/exceptions/invalid-sale-state.exception';
import { InvalidSaleItemException } from '../../domain/exceptions/invalid-sale-item.exception';
import { InvalidDiscountException } from '../../domain/exceptions/invalid-discount.exception';
import { InvalidMoneyException } from '../../domain/exceptions/invalid-money.exception';

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

describe('AddSaleItemHandler Specification (Milestone 7.11 & ADR-0132)', () => {
  const fixedNow = new Date('2026-10-02T10:00:00.000Z');
  let clock: DeterministicClock;
  let saleRepo: InMemorySaleRepository;
  let eventPublisher: MockSalesEventPublisher;
  let handler: AddSaleItemHandler;

  beforeEach(() => {
    clock = new DeterministicClock(fixedNow);
    saleRepo = new InMemorySaleRepository();
    eventPublisher = new MockSalesEventPublisher();
    handler = new AddSaleItemHandler(saleRepo, clock, eventPublisher);
  });

  const createDraftSale = (props?: {
    id?: string;
    currency?: string;
    orderDiscount?: Discount;
  }): Sale => {
    const sale = Sale.create(
      {
        id: props?.id ? SaleId.create(props.id) : SaleId.create('sale_test_draft_01'),
        currency: props?.currency ?? 'USD',
        tenantId: 'tenant_kinergy_main',
        clientId: 'client_athlete_01',
        source: SaleSource.create(SaleSourceType.FOOD, 'food_reg_01'),
        orderDiscount: props?.orderDiscount,
      },
      clock,
    );
    sale.clearEvents();
    saleRepo.store.set(sale.id.value, sale);
    return sale;
  };

  const createSaleInStatus = (targetStatus: SaleStatus): Sale => {
    const sale = Sale.create(
      {
        id: SaleId.create(`sale_status_${targetStatus.toLowerCase()}`),
        currency: 'USD',
        tenantId: 'tenant_kinergy_main',
        source: SaleSource.create(SaleSourceType.FOOD, 'food_reg_01'),
      },
      clock,
    );

    // Add initial item so finalization is valid
    sale.addItem(
      {
        source: SaleSource.create(SaleSourceType.FOOD, 'food_initial'),
        description: 'Base item',
        quantity: 1,
        unitPrice: Money.create(50, 'USD'),
      },
      clock,
    );

    switch (targetStatus) {
      case SaleStatus.DRAFT:
        break;
      case SaleStatus.PENDING_PAYMENT:
        sale.finalize(clock);
        break;
      case SaleStatus.PARTIALLY_PAID:
        sale.finalize(clock);
        sale.markPartiallyPaid(clock);
        break;
      case SaleStatus.PAID:
        sale.finalize(clock);
        sale.markPaid(clock);
        break;
      case SaleStatus.COMPLETED:
        sale.finalize(clock);
        sale.markPaid(clock);
        sale.markCompleted(clock);
        break;
      case SaleStatus.CANCELLED:
        sale.cancel('Order cancelled before payment', clock);
        break;
      case SaleStatus.REFUNDED:
        sale.finalize(clock);
        sale.markPaid(clock);
        sale.markRefunded('Defective product refund', clock);
        break;
    }

    sale.clearEvents();
    saleRepo.store.set(sale.id.value, sale);
    return sale;
  };

  describe('1. Valid AddSaleItem Execution', () => {
    it('adds an item to an empty DRAFT sale, recalculating domain totals and emitting events', async () => {
      const sale = createDraftSale();

      const command = new AddSaleItemCommand({
        saleId: sale.id.value,
        source: {
          sourceType: SaleSourceType.FOOD,
          sourceId: 'snack_protein_bar',
        },
        description: 'Protein Bar',
        skuOrCode: 'BAR-001',
        quantity: 2,
        unitPriceAmount: 4.5, // 2 * 4.50 = 9.00
      });

      const result = await handler.execute(command);

      expect(result.isSuccess).toBe(true);
      const dto = result.getValue();
      expect(dto.id).toBe(sale.id.value);
      expect(dto.status).toBe(SaleStatus.DRAFT);
      expect(dto.itemCount).toBe(1);
      expect(dto.subtotalAmount).toBe(9.0);
      expect(dto.discountTotalAmount).toBe(0);
      expect(dto.totalAmount).toBe(9.0);
      expect(dto.items).toHaveLength(1);
      expect(dto.items[0]?.description).toBe('Protein Bar');
      expect(dto.items[0]?.skuOrCode).toBe('BAR-001');
      expect(dto.items[0]?.quantity).toBe(2);
      expect(dto.items[0]?.unitPriceAmount).toBe(4.5);
      expect(dto.items[0]?.subtotalAmount).toBe(9.0);

      // Verify repository persistence
      expect(saleRepo.saveCallCount).toBe(1);
      const persisted = saleRepo.store.get(sale.id.value);
      expect(persisted?.itemCount).toBe(1);
      expect(persisted?.total.amount).toBe(9.0);

      // Verify domain events published and cleared
      expect(eventPublisher.publishedEvents).toHaveLength(1);
      expect(eventPublisher.publishedEvents[0]?.eventType).toBe('SaleItemAdded');
      expect(persisted?.getUncommittedEvents()).toHaveLength(0);
    });

    it('adds multiple items sequentially with accurate domain accumulation', async () => {
      const sale = createDraftSale();

      // Add item 1
      await handler.execute(
        new AddSaleItemCommand({
          saleId: sale.id.value,
          description: 'Consultation',
          quantity: 1,
          unitPriceAmount: 100.0,
        }),
      );

      // Add item 2
      const result2 = await handler.execute(
        new AddSaleItemCommand({
          saleId: sale.id.value,
          description: 'Ice Pack',
          quantity: 2,
          unitPriceAmount: 15.0,
        }),
      );

      expect(result2.isSuccess).toBe(true);
      const dto = result2.getValue();
      expect(dto.itemCount).toBe(2);
      expect(dto.subtotalAmount).toBe(130.0);
      expect(dto.totalAmount).toBe(130.0);
      expect(saleRepo.saveCallCount).toBe(2);
    });

    it('adds an item with percentage discount and recalculates totals deterministically', async () => {
      const sale = createDraftSale();

      const command = new AddSaleItemCommand({
        saleId: sale.id.value,
        description: 'Therapy Band',
        quantity: 1,
        unitPriceAmount: 50.0,
        discount: {
          type: 'PERCENTAGE',
          value: 20, // 20% of 50.00 = 10.00 discount
          reason: 'VIP Athlete',
        },
      });

      const result = await handler.execute(command);

      expect(result.isSuccess).toBe(true);
      const dto = result.getValue();
      expect(dto.subtotalAmount).toBe(50.0);
      expect(dto.discountTotalAmount).toBe(10.0);
      expect(dto.totalAmount).toBe(40.0);
      expect(dto.items[0]?.discountTotalAmount).toBe(10.0);
      expect(dto.items[0]?.totalAmount).toBe(40.0);
    });

    it('adds an item to a sale with an existing order-level discount and recalculates all layers', async () => {
      // Sale with 10% order discount
      const sale = createDraftSale({
        orderDiscount: Discount.percentage(10, 'General 10% Promo'),
      });

      const command = new AddSaleItemCommand({
        saleId: sale.id.value,
        description: 'Recovery Foam Roller',
        quantity: 1,
        unitPriceAmount: 100.0,
        discount: {
          type: 'FIXED',
          value: 20.0, // Item discount: 20 -> net pre-order discount: 80
          reason: 'Clearance',
        },
      });

      const result = await handler.execute(command);

      expect(result.isSuccess).toBe(true);
      const dto = result.getValue();
      expect(dto.subtotalAmount).toBe(100.0);
      // Item discount: 20.00. Remaining: 80.00. Order discount: 10% of 80 = 8.00. Total discount = 28.00.
      expect(dto.discountTotalAmount).toBe(28.0);
      expect(dto.totalAmount).toBe(72.0);
    });

    it('inherits SaleSource from the sale when source is omitted on the item', async () => {
      const sale = createDraftSale();

      const command = new AddSaleItemCommand({
        saleId: sale.id.value,
        description: 'Inherited Origin Item',
        quantity: 1,
        unitPriceAmount: 25.0,
      });

      const result = await handler.execute(command);

      expect(result.isSuccess).toBe(true);
      const dto = result.getValue();
      expect(dto.items[0]?.sourceType).toBe(SaleSourceType.FOOD);
      expect(dto.items[0]?.sourceId).toBe('food_reg_01');
    });

    it('supports legacy SourceReference on the added item', async () => {
      const sale = createDraftSale();

      const command = new AddSaleItemCommand({
        saleId: sale.id.value,
        source: {
          sourceType: SourceType.CUSTOM_SERVICE,
          sourceId: 'service_biomech',
          sourceCode: 'CODE-99',
        },
        description: 'Biomechanical Screening',
        quantity: 1,
        unitPriceAmount: 150.0,
      });

      const result = await handler.execute(command);

      expect(result.isSuccess).toBe(true);
      const dto = result.getValue();
      expect(dto.items[0]?.sourceType).toBe(SourceType.CUSTOM_SERVICE);
      expect(dto.items[0]?.sourceId).toBe('service_biomech');
      expect(dto.items[0]?.sourceCode).toBe('CODE-99');
    });
  });

  describe('2. Request Shape & Precondition Validation', () => {
    it('fails when command is null or undefined', async () => {
      const result = await handler.execute(null as unknown as AddSaleItemCommand);

      expect(result.isSuccess).toBe(false);
      expect(result.getError()).toBeInstanceOf(InvalidSaleStateException);
      expect(getErrorMessage(result)).toContain('cannot be null or undefined');
    });

    it('fails when input is null or undefined', async () => {
      const result = await handler.execute(
        new AddSaleItemCommand(null as unknown as AddSaleItemInput),
      );

      expect(result.isSuccess).toBe(false);
      expect(result.getError()).toBeInstanceOf(InvalidSaleStateException);
    });

    it('fails when saleId is empty string or only whitespace', async () => {
      const command = new AddSaleItemCommand({
        saleId: '   ',
        description: 'Item',
        quantity: 1,
        unitPriceAmount: 10,
      });

      const result = await handler.execute(command);

      expect(result.isSuccess).toBe(false);
      expect(result.getError()).toBeInstanceOf(InvalidSaleStateException);
      expect(getErrorMessage(result)).toContain('Sale ID cannot be empty or whitespace');
    });
  });

  describe('3. Sale Not Found Handling', () => {
    it('fails with established SaleNotFoundException when sale does not exist in repository', async () => {
      const command = new AddSaleItemCommand({
        saleId: 'non_existent_sale_id',
        description: 'Item',
        quantity: 1,
        unitPriceAmount: 10,
      });

      const result = await handler.execute(command);

      expect(result.isSuccess).toBe(false);
      expect(result.getError()).toBeInstanceOf(SaleNotFoundException);
      expect(getErrorMessage(result)).toContain(
        "Sale with ID 'non_existent_sale_id' was not found",
      );
    });
  });

  describe('4. Lifecycle State Matrix (Every State Supported by Domain)', () => {
    it('allows adding item to DRAFT Sale', async () => {
      const sale = createSaleInStatus(SaleStatus.DRAFT);

      const command = new AddSaleItemCommand({
        saleId: sale.id.value,
        description: 'New draft item',
        quantity: 1,
        unitPriceAmount: 20.0,
      });

      const result = await handler.execute(command);

      expect(result.isSuccess).toBe(true);
      expect(result.getValue().status).toBe(SaleStatus.DRAFT);
      expect(result.getValue().itemCount).toBe(2);
    });

    it('rejects adding item to PENDING_PAYMENT Sale with SaleAlreadyFinalizedException', async () => {
      const sale = createSaleInStatus(SaleStatus.PENDING_PAYMENT);

      const command = new AddSaleItemCommand({
        saleId: sale.id.value,
        description: 'Late item',
        quantity: 1,
        unitPriceAmount: 20.0,
      });

      const result = await handler.execute(command);

      expect(result.isSuccess).toBe(false);
      expect(result.getError()).toBeInstanceOf(SaleAlreadyFinalizedException);
      expect(getErrorMessage(result)).toContain('Cannot mutate Sale');
      expect(getErrorMessage(result)).toContain('Commercial terms freeze upon leaving DRAFT');
    });

    it('rejects adding item to PARTIALLY_PAID Sale with SaleAlreadyFinalizedException', async () => {
      const sale = createSaleInStatus(SaleStatus.PARTIALLY_PAID);

      const command = new AddSaleItemCommand({
        saleId: sale.id.value,
        description: 'Mid-payment item',
        quantity: 1,
        unitPriceAmount: 20.0,
      });

      const result = await handler.execute(command);

      expect(result.isSuccess).toBe(false);
      expect(result.getError()).toBeInstanceOf(SaleAlreadyFinalizedException);
      expect(getErrorMessage(result)).toContain('Cannot mutate Sale');
    });

    it('rejects adding item to PAID Sale with SaleAlreadyFinalizedException', async () => {
      const sale = createSaleInStatus(SaleStatus.PAID);

      const command = new AddSaleItemCommand({
        saleId: sale.id.value,
        description: 'Post-payment item',
        quantity: 1,
        unitPriceAmount: 20.0,
      });

      const result = await handler.execute(command);

      expect(result.isSuccess).toBe(false);
      expect(result.getError()).toBeInstanceOf(SaleAlreadyFinalizedException);
      expect(getErrorMessage(result)).toContain('Cannot mutate Sale');
    });

    it('rejects adding item to COMPLETED Sale with SaleAlreadyFinalizedException', async () => {
      const sale = createSaleInStatus(SaleStatus.COMPLETED);

      const command = new AddSaleItemCommand({
        saleId: sale.id.value,
        description: 'Post-completion item',
        quantity: 1,
        unitPriceAmount: 20.0,
      });

      const result = await handler.execute(command);

      expect(result.isSuccess).toBe(false);
      expect(result.getError()).toBeInstanceOf(SaleAlreadyFinalizedException);
      expect(getErrorMessage(result)).toContain('Cannot mutate Sale');
    });

    it('rejects adding item to CANCELLED Sale with SaleAlreadyFinalizedException', async () => {
      const sale = createSaleInStatus(SaleStatus.CANCELLED);

      const command = new AddSaleItemCommand({
        saleId: sale.id.value,
        description: 'Post-cancellation item',
        quantity: 1,
        unitPriceAmount: 20.0,
      });

      const result = await handler.execute(command);

      expect(result.isSuccess).toBe(false);
      expect(result.getError()).toBeInstanceOf(SaleAlreadyFinalizedException);
      expect(getErrorMessage(result)).toContain('Cannot mutate Sale');
    });

    it('rejects adding item to REFUNDED Sale with SaleAlreadyFinalizedException', async () => {
      const sale = createSaleInStatus(SaleStatus.REFUNDED);

      const command = new AddSaleItemCommand({
        saleId: sale.id.value,
        description: 'Post-refund item',
        quantity: 1,
        unitPriceAmount: 20.0,
      });

      const result = await handler.execute(command);

      expect(result.isSuccess).toBe(false);
      expect(result.getError()).toBeInstanceOf(SaleAlreadyFinalizedException);
      expect(getErrorMessage(result)).toContain('Cannot mutate Sale');
    });
  });

  describe('5. Domain Invariant & Value Object Failures', () => {
    it('fails when unit price amount is negative', async () => {
      const sale = createDraftSale();

      const command = new AddSaleItemCommand({
        saleId: sale.id.value,
        description: 'Invalid price item',
        quantity: 1,
        unitPriceAmount: -15.0,
      });

      const result = await handler.execute(command);

      expect(result.isSuccess).toBe(false);
      expect(result.getError()).toBeInstanceOf(InvalidMoneyException);
      expect(getErrorMessage(result)).toContain('cannot be negative');
    });

    it('fails when item quantity is zero or negative', async () => {
      const sale = createDraftSale();

      const commandZero = new AddSaleItemCommand({
        saleId: sale.id.value,
        description: 'Zero qty item',
        quantity: 0,
        unitPriceAmount: 10.0,
      });

      const resultZero = await handler.execute(commandZero);
      expect(resultZero.isSuccess).toBe(false);
      expect(resultZero.getError()).toBeInstanceOf(InvalidSaleItemException);

      const commandNegative = new AddSaleItemCommand({
        saleId: sale.id.value,
        description: 'Negative qty item',
        quantity: -2,
        unitPriceAmount: 10.0,
      });

      const resultNegative = await handler.execute(commandNegative);
      expect(resultNegative.isSuccess).toBe(false);
      expect(resultNegative.getError()).toBeInstanceOf(InvalidSaleItemException);
    });

    it('fails when item quantity underflows 3-decimal precision (< 0.001)', async () => {
      const sale = createDraftSale();

      const command = new AddSaleItemCommand({
        saleId: sale.id.value,
        description: 'Sub-milligram item',
        quantity: 0.0001,
        unitPriceAmount: 100.0,
      });

      const result = await handler.execute(command);

      expect(result.isSuccess).toBe(false);
      expect(result.getError()).toBeInstanceOf(InvalidSaleItemException);
      expect(getErrorMessage(result)).toContain('rounds down to 0');
    });

    it('fails when item description is empty or only whitespace', async () => {
      const sale = createDraftSale();

      const command = new AddSaleItemCommand({
        saleId: sale.id.value,
        description: '   ',
        quantity: 1,
        unitPriceAmount: 10.0,
      });

      const result = await handler.execute(command);

      expect(result.isSuccess).toBe(false);
      expect(result.getError()).toBeInstanceOf(InvalidSaleItemException);
      expect(getErrorMessage(result)).toContain('description cannot be empty');
    });

    it('fails when item discount percentage exceeds 100%', async () => {
      const sale = createDraftSale();

      const command = new AddSaleItemCommand({
        saleId: sale.id.value,
        description: 'Over-discounted item',
        quantity: 1,
        unitPriceAmount: 50.0,
        discount: {
          type: 'PERCENTAGE',
          value: 150,
        },
      });

      const result = await handler.execute(command);

      expect(result.isSuccess).toBe(false);
      expect(result.getError()).toBeInstanceOf(InvalidDiscountException);
      expect(getErrorMessage(result)).toContain('Percentage discount cannot exceed 100%');
    });

    it('fails when item discount type is invalid', async () => {
      const sale = createDraftSale();

      const command = new AddSaleItemCommand({
        saleId: sale.id.value,
        description: 'Bad discount type item',
        quantity: 1,
        unitPriceAmount: 50.0,
        discount: {
          type: 'UNKNOWN_TYPE',
          value: 10,
        },
      });

      const result = await handler.execute(command);

      expect(result.isSuccess).toBe(false);
      expect(result.getError()).toBeInstanceOf(InvalidDiscountException);
      expect(getErrorMessage(result)).toContain('Invalid discount type');
    });
  });

  describe('6. Repository Failures & Orchestration Purity', () => {
    it('fails and returns failure result when repository save throws', async () => {
      const sale = createDraftSale();
      saleRepo.throwOnSave = new Error('Database disk I/O failure');

      const command = new AddSaleItemCommand({
        saleId: sale.id.value,
        description: 'Valid Item',
        quantity: 1,
        unitPriceAmount: 20.0,
      });

      const result = await handler.execute(command);

      expect(result.isSuccess).toBe(false);
      expect(getErrorMessage(result)).toBe('Database disk I/O failure');
    });

    it('verifies the application layer does not perform manual arithmetic on totals', async () => {
      const sale = createDraftSale();

      const command = new AddSaleItemCommand({
        saleId: sale.id.value,
        description: 'Floating Point Precision Item',
        quantity: 3,
        unitPriceAmount: 19.99, // 3 * 19.99 = 59.97
      });

      const result = await handler.execute(command);

      expect(result.isSuccess).toBe(true);
      const dto = result.getValue();
      // Verified exact integer arithmetic from Money value object
      expect(dto.subtotal.cents).toBe(5997);
      expect(dto.subtotal.amount).toBe(59.97);
      expect(dto.total.cents).toBe(5997);
      expect(dto.total.amount).toBe(59.97);
    });
  });
});
