import { CancelSaleHandler } from '../handlers/cancel-sale.handler';
import { CancelSaleCommand } from '../commands/cancel-sale.command';
import { SaleRepositoryPort } from '../ports/sale-repository.port';
import { SalesEventPublisherPort } from '../ports/sales-event-publisher.port';
import { Sale } from '../../domain/sale.aggregate';
import { SaleId } from '../../domain/value-objects/sale-id.vo';
import { SourceReference } from '../../domain/value-objects/source-reference.vo';
import { SourceType } from '../../domain/enums/source-type.enum';
import { SaleStatus } from '../../domain/enums/sale-status.enum';
import { Money } from '../../domain/value-objects/money.vo';
import { DeterministicClock } from '../../domain/shared/clock';
import { DomainEvent } from '../../domain/shared/domain-event';
import { SaleNotFoundException } from '../exceptions/sale-not-found.exception';
import { InvalidSaleTransitionException } from '../../domain/exceptions/invalid-sale-transition.exception';

class InMemorySaleRepository implements SaleRepositoryPort {
  public store = new Map<string, Sale>();

  async findById(id: SaleId | string): Promise<Sale | null> {
    const key = typeof id === 'string' ? id.trim() : id.value;
    return this.store.get(key) ?? null;
  }

  async save(sale: Sale): Promise<void> {
    this.store.set(sale.id.value, sale);
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

describe('CancelSaleHandler Specification', () => {
  const baseTime = new Date('2026-09-28T12:00:00.000Z');
  let clock: DeterministicClock;
  let saleRepo: InMemorySaleRepository;
  let eventPublisher: MockSalesEventPublisher;
  let handler: CancelSaleHandler;

  beforeEach(() => {
    clock = new DeterministicClock(baseTime);
    saleRepo = new InMemorySaleRepository();
    eventPublisher = new MockSalesEventPublisher();
    handler = new CancelSaleHandler(saleRepo, clock, eventPublisher);
  });

  const createTestSale = (status: SaleStatus = SaleStatus.DRAFT): Sale => {
    const sale = Sale.create(
      {
        id: SaleId.create('sale_cancel_test_01'),
        currency: 'USD',
        source: SourceReference.create({
          sourceType: SourceType.CUSTOM_SERVICE,
          sourceId: 'pos_1',
        }),
      },
      clock,
    );

    sale.addItem(
      {
        source: SourceReference.create({
          sourceType: SourceType.CUSTOM_SERVICE,
          sourceId: 'pos_1',
        }),
        description: 'Session',
        quantity: 1,
        unitPrice: Money.create(100, 'USD'),
      },
      clock,
    );

    if (status === SaleStatus.PENDING_PAYMENT) {
      sale.finalize(clock);
    } else if (status === SaleStatus.PARTIALLY_PAID) {
      sale.finalize(clock);
      sale.markPartiallyPaid(clock);
    } else if (status === SaleStatus.PAID) {
      sale.finalize(clock);
      sale.markPaid(clock);
    }

    sale.clearEvents();
    saleRepo.store.set(sale.id.value, sale);
    return sale;
  };

  it('cancels a DRAFT Sale with valid audit reason', async () => {
    createTestSale(SaleStatus.DRAFT);

    const command = new CancelSaleCommand({
      saleId: 'sale_cancel_test_01',
      reason: 'Customer declined service before tender',
    });

    const result = await handler.execute(command);

    expect(result.isSuccess).toBe(true);
    expect(result.getValue().status).toBe(SaleStatus.CANCELLED);
    expect(saleRepo.store.get('sale_cancel_test_01')?.status).toBe(SaleStatus.CANCELLED);
    expect(eventPublisher.publishedEvents).toHaveLength(1);
    expect(eventPublisher.publishedEvents[0]?.eventType).toBe('SaleCancelled');
  });

  it('cancels a PENDING_PAYMENT Sale with valid audit reason', async () => {
    createTestSale(SaleStatus.PENDING_PAYMENT);

    const command = new CancelSaleCommand({
      saleId: 'sale_cancel_test_01',
      reason: 'Payment rail timed out; customer walked out',
    });

    const result = await handler.execute(command);

    expect(result.isSuccess).toBe(true);
    expect(result.getValue().status).toBe(SaleStatus.CANCELLED);
  });

  it('rejects cancellation when Sale ID is not found', async () => {
    const command = new CancelSaleCommand({
      saleId: 'non_existent_sale',
      reason: 'Abort',
    });

    const result = await handler.execute(command);

    expect(result.isSuccess).toBe(false);
    expect(result.getError()).toBeInstanceOf(SaleNotFoundException);
  });

  it('rejects cancellation without reason', async () => {
    createTestSale(SaleStatus.DRAFT);

    const command = new CancelSaleCommand({
      saleId: 'sale_cancel_test_01',
      reason: '   ',
    });

    const result = await handler.execute(command);

    expect(result.isSuccess).toBe(false);
    const err = result.getError();
    expect(err instanceof Error ? err.message : String(err)).toContain(
      'Cancellation reason cannot be empty',
    );
  });

  it('rejects cancellation on PAID Sale', async () => {
    createTestSale(SaleStatus.PAID);

    const command = new CancelSaleCommand({
      saleId: 'sale_cancel_test_01',
      reason: 'Customer wants money back',
    });

    const result = await handler.execute(command);

    expect(result.isSuccess).toBe(false);
    expect(result.getError()).toBeInstanceOf(InvalidSaleTransitionException);
  });
});
