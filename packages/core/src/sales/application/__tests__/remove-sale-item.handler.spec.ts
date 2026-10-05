import { RemoveSaleItemHandler } from '../handlers/remove-sale-item.handler';
import { RemoveSaleItemCommand, RemoveSaleItemInput } from '../commands/remove-sale-item.command';
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
import { EmptySaleException } from '../../domain/exceptions/empty-sale.exception';
import { InvalidSaleStateException } from '../../domain/exceptions/invalid-sale-state.exception';

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

describe('RemoveSaleItemHandler Specification (Milestone 7.11 & ADR-0132)', () => {
  const fixedNow = new Date('2026-10-03T11:00:00.000Z');
  let clock: DeterministicClock;
  let saleRepo: InMemorySaleRepository;
  let eventPublisher: MockSalesEventPublisher;
  let handler: RemoveSaleItemHandler;

  beforeEach(() => {
    clock = new DeterministicClock(fixedNow);
    saleRepo = new InMemorySaleRepository();
    eventPublisher = new MockSalesEventPublisher();
    handler = new RemoveSaleItemHandler(saleRepo, clock, eventPublisher);
  });

  const createSaleWithItems = (
    itemDefinitions: Array<{ description: string; quantity: number; unitPriceAmount: number }>,
    orderDiscount?: Discount,
  ): Sale => {
    const sale = Sale.create(
      {
        id: SaleId.create('sale_remove_test_01'),
        currency: 'USD',
        tenantId: 'tenant_kinergy_main',
        clientId: 'client_01',
        source: SaleSource.create(SaleSourceType.FOOD, 'pos_station_1'),
        orderDiscount,
      },
      clock,
    );

    for (const itemDef of itemDefinitions) {
      sale.addItem(
        {
          source: SaleSource.create(SaleSourceType.FOOD, 'food_stock'),
          description: itemDef.description,
          quantity: itemDef.quantity,
          unitPrice: Money.create(itemDef.unitPriceAmount, 'USD'),
        },
        clock,
      );
    }

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
        source: SaleSource.create(SaleSourceType.FOOD, 'pos_terminal'),
      },
      clock,
    );

    sale.addItem(
      {
        source: SaleSource.create(SaleSourceType.FOOD, 'stock_01'),
        description: 'Baseline item',
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

  describe('1. Valid RemoveSaleItem Execution', () => {
    it('removes a line item from a multi-item DRAFT sale, recalculating domain totals and emitting events', async () => {
      const sale = createSaleWithItems([
        { description: 'Item A', quantity: 2, unitPriceAmount: 20.0 }, // 40.00
        { description: 'Item B', quantity: 1, unitPriceAmount: 30.0 }, // 30.00 -> total 70.00
      ]);

      const itemToRemoveId = sale.items[0]!.id.value;

      const command = new RemoveSaleItemCommand({
        saleId: sale.id.value,
        itemId: itemToRemoveId,
      });

      const result = await handler.execute(command);

      expect(result.isSuccess).toBe(true);
      const dto = result.getValue();
      expect(dto.id).toBe(sale.id.value);
      expect(dto.status).toBe(SaleStatus.DRAFT);
      expect(dto.itemCount).toBe(1);
      expect(dto.subtotalAmount).toBe(30.0);
      expect(dto.totalAmount).toBe(30.0);
      expect(dto.items).toHaveLength(1);
      expect(dto.items[0]?.description).toBe('Item B');

      // Verify repository persistence
      expect(saleRepo.saveCallCount).toBe(1);
      const persisted = saleRepo.store.get(sale.id.value);
      expect(persisted?.itemCount).toBe(1);
      expect(persisted?.total.amount).toBe(30.0);
      expect(persisted?.hasItem(itemToRemoveId)).toBe(false);

      // Verify domain event published and cleared from aggregate
      expect(eventPublisher.publishedEvents).toHaveLength(1);
      expect(eventPublisher.publishedEvents[0]?.eventType).toBe('SaleItemRemoved');
      expect(persisted?.getUncommittedEvents()).toHaveLength(0);
    });

    it('recalculates order discount deterministically upon item removal', async () => {
      // 10% order discount on 2 items totaling 100 (50 + 50) -> subtotal 100, discount 10, total 90
      const sale = createSaleWithItems(
        [
          { description: 'Locker Rental', quantity: 1, unitPriceAmount: 50.0 },
          { description: 'Towel Service', quantity: 1, unitPriceAmount: 50.0 },
        ],
        Discount.percentage(10, 'Promo 10%'),
      );

      expect(sale.total.amount).toBe(90.0);

      const itemToRemoveId = sale.items[0]!.id.value;
      const command = new RemoveSaleItemCommand({
        saleId: sale.id.value,
        itemId: itemToRemoveId,
      });

      const result = await handler.execute(command);

      expect(result.isSuccess).toBe(true);
      const dto = result.getValue();
      expect(dto.itemCount).toBe(1);
      expect(dto.subtotalAmount).toBe(50.0);
      // Remaining 50.00 with 10% discount = 5.00 discount -> total 45.00
      expect(dto.discountTotalAmount).toBe(5.0);
      expect(dto.totalAmount).toBe(45.0);
    });

    it('allows removing all items in DRAFT down to 0, which prevents finalization until re-populated', async () => {
      const sale = createSaleWithItems([
        { description: 'Single Pass', quantity: 1, unitPriceAmount: 25.0 },
      ]);
      const itemId = sale.items[0]!.id.value;

      const command = new RemoveSaleItemCommand({
        saleId: sale.id.value,
        itemId,
      });

      const result = await handler.execute(command);

      expect(result.isSuccess).toBe(true);
      const dto = result.getValue();
      expect(dto.itemCount).toBe(0);
      expect(dto.subtotalAmount).toBe(0.0);
      expect(dto.totalAmount).toBe(0.0);

      // Verify domain invariant SALE-001: Commercial Non-Emptiness
      // Finalization of the now-empty sale is strictly rejected by domain
      const persisted = saleRepo.store.get(sale.id.value)!;
      expect(() => persisted.finalize(clock)).toThrow(EmptySaleException);
    });
  });

  describe('2. Request Shape & Precondition Validation', () => {
    it('fails when command is null or undefined', async () => {
      const result = await handler.execute(null as unknown as RemoveSaleItemCommand);

      expect(result.isSuccess).toBe(false);
      expect(result.getError()).toBeInstanceOf(InvalidSaleStateException);
      expect(getErrorMessage(result)).toContain('cannot be null or undefined');
    });

    it('fails when input is null or undefined', async () => {
      const result = await handler.execute(
        new RemoveSaleItemCommand(null as unknown as RemoveSaleItemInput),
      );

      expect(result.isSuccess).toBe(false);
      expect(result.getError()).toBeInstanceOf(InvalidSaleStateException);
    });

    it('fails when saleId is empty string or only whitespace', async () => {
      const command = new RemoveSaleItemCommand({
        saleId: '   ',
        itemId: 'item_1',
      });

      const result = await handler.execute(command);

      expect(result.isSuccess).toBe(false);
      expect(result.getError()).toBeInstanceOf(InvalidSaleStateException);
      expect(getErrorMessage(result)).toContain('Sale ID cannot be empty or whitespace');
    });

    it('fails when itemId is empty string or only whitespace', async () => {
      const command = new RemoveSaleItemCommand({
        saleId: 'sale_1',
        itemId: '   ',
      });

      const result = await handler.execute(command);

      expect(result.isSuccess).toBe(false);
      expect(result.getError()).toBeInstanceOf(InvalidSaleStateException);
      expect(getErrorMessage(result)).toContain('SaleItem ID cannot be empty or whitespace');
    });
  });

  describe('3. Sale Not Found Handling', () => {
    it('fails with established SaleNotFoundException when sale does not exist in repository', async () => {
      const command = new RemoveSaleItemCommand({
        saleId: 'non_existent_sale_999',
        itemId: 'item_01',
      });

      const result = await handler.execute(command);

      expect(result.isSuccess).toBe(false);
      expect(result.getError()).toBeInstanceOf(SaleNotFoundException);
      expect(getErrorMessage(result)).toContain(
        "Sale with ID 'non_existent_sale_999' was not found",
      );
    });
  });

  describe('4. Non-Existent Item on Sale', () => {
    it('fails with domain InvalidSaleStateException when itemId does not exist on this sale', async () => {
      const sale = createSaleWithItems([
        { description: 'Item 1', quantity: 1, unitPriceAmount: 20.0 },
      ]);

      const command = new RemoveSaleItemCommand({
        saleId: sale.id.value,
        itemId: 'non_existent_item_id',
      });

      const result = await handler.execute(command);

      expect(result.isSuccess).toBe(false);
      expect(result.getError()).toBeInstanceOf(InvalidSaleStateException);
      expect(getErrorMessage(result)).toContain(
        "SaleItem with ID 'non_existent_item_id' not found in Sale",
      );
    });
  });

  describe('5. Lifecycle State Matrix (Every State Supported by Domain)', () => {
    it('allows removing item from DRAFT Sale', async () => {
      const sale = createSaleInStatus(SaleStatus.DRAFT);
      const itemId = sale.items[0]!.id.value;

      const command = new RemoveSaleItemCommand({
        saleId: sale.id.value,
        itemId,
      });

      const result = await handler.execute(command);

      expect(result.isSuccess).toBe(true);
      expect(result.getValue().status).toBe(SaleStatus.DRAFT);
      expect(result.getValue().itemCount).toBe(0);
    });

    it('rejects removing item from PENDING_PAYMENT Sale with SaleAlreadyFinalizedException', async () => {
      const sale = createSaleInStatus(SaleStatus.PENDING_PAYMENT);
      const itemId = sale.items[0]!.id.value;

      const command = new RemoveSaleItemCommand({
        saleId: sale.id.value,
        itemId,
      });

      const result = await handler.execute(command);

      expect(result.isSuccess).toBe(false);
      expect(result.getError()).toBeInstanceOf(SaleAlreadyFinalizedException);
      expect(getErrorMessage(result)).toContain('Cannot mutate Sale');
      expect(getErrorMessage(result)).toContain('Commercial terms freeze upon leaving DRAFT');
    });

    it('rejects removing item from PARTIALLY_PAID Sale with SaleAlreadyFinalizedException', async () => {
      const sale = createSaleInStatus(SaleStatus.PARTIALLY_PAID);
      const itemId = sale.items[0]!.id.value;

      const command = new RemoveSaleItemCommand({
        saleId: sale.id.value,
        itemId,
      });

      const result = await handler.execute(command);

      expect(result.isSuccess).toBe(false);
      expect(result.getError()).toBeInstanceOf(SaleAlreadyFinalizedException);
      expect(getErrorMessage(result)).toContain('Cannot mutate Sale');
    });

    it('rejects removing item from PAID Sale with SaleAlreadyFinalizedException', async () => {
      const sale = createSaleInStatus(SaleStatus.PAID);
      const itemId = sale.items[0]!.id.value;

      const command = new RemoveSaleItemCommand({
        saleId: sale.id.value,
        itemId,
      });

      const result = await handler.execute(command);

      expect(result.isSuccess).toBe(false);
      expect(result.getError()).toBeInstanceOf(SaleAlreadyFinalizedException);
      expect(getErrorMessage(result)).toContain('Cannot mutate Sale');
    });

    it('rejects removing item from COMPLETED Sale with SaleAlreadyFinalizedException', async () => {
      const sale = createSaleInStatus(SaleStatus.COMPLETED);
      const itemId = sale.items[0]!.id.value;

      const command = new RemoveSaleItemCommand({
        saleId: sale.id.value,
        itemId,
      });

      const result = await handler.execute(command);

      expect(result.isSuccess).toBe(false);
      expect(result.getError()).toBeInstanceOf(SaleAlreadyFinalizedException);
      expect(getErrorMessage(result)).toContain('Cannot mutate Sale');
    });

    it('rejects removing item from CANCELLED Sale with SaleAlreadyFinalizedException', async () => {
      const sale = createSaleInStatus(SaleStatus.CANCELLED);
      const itemId = sale.items[0]!.id.value;

      const command = new RemoveSaleItemCommand({
        saleId: sale.id.value,
        itemId,
      });

      const result = await handler.execute(command);

      expect(result.isSuccess).toBe(false);
      expect(result.getError()).toBeInstanceOf(SaleAlreadyFinalizedException);
      expect(getErrorMessage(result)).toContain('Cannot mutate Sale');
    });

    it('rejects removing item from REFUNDED Sale with SaleAlreadyFinalizedException', async () => {
      const sale = createSaleInStatus(SaleStatus.REFUNDED);
      const itemId = sale.items[0]!.id.value;

      const command = new RemoveSaleItemCommand({
        saleId: sale.id.value,
        itemId,
      });

      const result = await handler.execute(command);

      expect(result.isSuccess).toBe(false);
      expect(result.getError()).toBeInstanceOf(SaleAlreadyFinalizedException);
      expect(getErrorMessage(result)).toContain('Cannot mutate Sale');
    });
  });

  describe('6. Repository Failure & Orchestration Purity', () => {
    it('fails and returns failure result when repository save throws', async () => {
      const sale = createSaleWithItems([
        { description: 'Valid Item', quantity: 1, unitPriceAmount: 20.0 },
      ]);
      saleRepo.throwOnSave = new Error('Database transaction deadlocked');

      const command = new RemoveSaleItemCommand({
        saleId: sale.id.value,
        itemId: sale.items[0]!.id.value,
      });

      const result = await handler.execute(command);

      expect(result.isSuccess).toBe(false);
      expect(getErrorMessage(result)).toBe('Database transaction deadlocked');
    });

    it('verifies the application layer does not perform manual array mutation on sale.items', async () => {
      const sale = createSaleWithItems([
        { description: 'Item 1', quantity: 1, unitPriceAmount: 10.0 },
        { description: 'Item 2', quantity: 2, unitPriceAmount: 15.0 }, // 30.00
      ]);

      const targetItemId = sale.items[0]!.id.value;
      const removeItemSpy = jest.spyOn(sale, 'removeItem');

      // Inject sale directly into repo
      saleRepo.store.set(sale.id.value, sale);

      const command = new RemoveSaleItemCommand({
        saleId: sale.id.value,
        itemId: targetItemId,
      });

      const result = await handler.execute(command);

      expect(result.isSuccess).toBe(true);
      // Verified that domain operation removeItem was invoked directly rather than external splice/filter
      expect(removeItemSpy).toHaveBeenCalledTimes(1);
      expect(removeItemSpy).toHaveBeenCalledWith(targetItemId, clock);
    });
  });
});
