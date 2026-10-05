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
import { PaymentUnauthorizedException } from '../exceptions/payment-unauthorized.exception';
import { InvalidSaleTransitionException } from '../../domain/exceptions/invalid-sale-transition.exception';
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
    if (this.throwOnSave) {
      throw this.throwOnSave;
    }
    this.saveCallCount++;
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

describe('CancelSaleHandler Specification (Milestone 7.11 & ADR-0132 Section 4.8)', () => {
  const baseTime = new Date('2026-10-05T12:00:00.000Z');
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

  const createTestSale = (
    status: SaleStatus = SaleStatus.DRAFT,
    tenantId = 'tenant_kinergy',
  ): Sale => {
    const sale = Sale.create(
      {
        id: SaleId.create('sale_cancel_test_01'),
        tenantId,
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
        description: 'Personal Training Session',
        quantity: 2,
        unitPrice: Money.create(50, 'USD'),
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
    } else if (status === SaleStatus.COMPLETED) {
      sale.finalize(clock);
      sale.markPaid(clock);
      sale.markCompleted(clock);
    } else if (status === SaleStatus.CANCELLED) {
      sale.cancel('Initial pre-cancellation for testing', clock);
    } else if (status === SaleStatus.REFUNDED) {
      sale.finalize(clock);
      sale.markPaid(clock);
      sale.markRefunded('Refunded for testing', clock);
    }

    sale.clearEvents();
    saleRepo.store.set(sale.id.value, sale);
    return sale;
  };

  describe('Lifecycle State Transitions (All 7 Domain-Supported States)', () => {
    it('1. cancels a DRAFT Sale and records cancellation audit data', async () => {
      createTestSale(SaleStatus.DRAFT);

      const command = new CancelSaleCommand({
        saleId: 'sale_cancel_test_01',
        reason: 'Customer walked away before submitting tender',
      });

      const result = await handler.execute(command);

      expect(result.isSuccess).toBe(true);
      const dto = result.getValue();
      expect(dto.status).toBe(SaleStatus.CANCELLED);
      expect(dto.cancellationReason).toBe('Customer walked away before submitting tender');
      expect(dto.cancelledAt).toBe(baseTime.toISOString());
      expect(dto.items).toHaveLength(1);
      expect(dto.totalAmount).toBe(100);

      const persisted = saleRepo.store.get('sale_cancel_test_01');
      expect(persisted?.status).toBe(SaleStatus.CANCELLED);
      expect(persisted?.cancellationReason).toBe('Customer walked away before submitting tender');
      expect(persisted?.cancelledAt).toEqual(baseTime);

      expect(eventPublisher.publishedEvents).toHaveLength(1);
      expect(eventPublisher.publishedEvents[0]?.eventType).toBe('SaleCancelled');
      expect(eventPublisher.publishedEvents[0]?.aggregateId).toBe('sale_cancel_test_01');
    });

    it('2. cancels a PENDING_PAYMENT Sale when gateway or customer declines payment', async () => {
      createTestSale(SaleStatus.PENDING_PAYMENT);

      const command = new CancelSaleCommand({
        saleId: 'sale_cancel_test_01',
        reason: 'Credit card transaction declined by issuing bank',
      });

      const result = await handler.execute(command);

      expect(result.isSuccess).toBe(true);
      const dto = result.getValue();
      expect(dto.status).toBe(SaleStatus.CANCELLED);
      expect(dto.cancellationReason).toBe('Credit card transaction declined by issuing bank');
      expect(dto.cancelledAt).toBe(baseTime.toISOString());

      const persisted = saleRepo.store.get('sale_cancel_test_01');
      expect(persisted?.status).toBe(SaleStatus.CANCELLED);
      expect(eventPublisher.publishedEvents).toHaveLength(1);
    });

    it('3. cancels a PARTIALLY_PAID Sale (commercial void prior to full settlement)', async () => {
      createTestSale(SaleStatus.PARTIALLY_PAID);

      const command = new CancelSaleCommand({
        saleId: 'sale_cancel_test_01',
        reason: 'Customer unable to complete remaining balance',
      });

      const result = await handler.execute(command);

      expect(result.isSuccess).toBe(true);
      const dto = result.getValue();
      expect(dto.status).toBe(SaleStatus.CANCELLED);
      expect(dto.cancellationReason).toBe('Customer unable to complete remaining balance');

      const persisted = saleRepo.store.get('sale_cancel_test_01');
      expect(persisted?.status).toBe(SaleStatus.CANCELLED);
      expect(eventPublisher.publishedEvents).toHaveLength(1);
    });

    it('4. strictly REJECTS cancellation of a PAID Sale (settled debt cannot be cancelled)', async () => {
      createTestSale(SaleStatus.PAID);

      const command = new CancelSaleCommand({
        saleId: 'sale_cancel_test_01',
        reason: 'Customer wants to cancel after paying in full',
      });

      const result = await handler.execute(command);

      expect(result.isSuccess).toBe(false);
      expect(result.getError()).toBeInstanceOf(InvalidSaleTransitionException);
      const err = result.getError() as InvalidSaleTransitionException;
      expect(err.currentState).toBe(SaleStatus.PAID);
      expect(err.targetState).toBe(SaleStatus.CANCELLED);

      // Verify aggregate status was NOT mutated
      const persisted = saleRepo.store.get('sale_cancel_test_01');
      expect(persisted?.status).toBe(SaleStatus.PAID);
      expect(eventPublisher.publishedEvents).toHaveLength(0);
    });

    it('5. strictly REJECTS cancellation of a COMPLETED Sale', async () => {
      createTestSale(SaleStatus.COMPLETED);

      const command = new CancelSaleCommand({
        saleId: 'sale_cancel_test_01',
        reason: 'Attempting cancellation after order fulfillment',
      });

      const result = await handler.execute(command);

      expect(result.isSuccess).toBe(false);
      expect(result.getError()).toBeInstanceOf(InvalidSaleTransitionException);
      const err = result.getError() as InvalidSaleTransitionException;
      expect(err.currentState).toBe(SaleStatus.COMPLETED);

      const persisted = saleRepo.store.get('sale_cancel_test_01');
      expect(persisted?.status).toBe(SaleStatus.COMPLETED);
      expect(eventPublisher.publishedEvents).toHaveLength(0);
    });

    it('6. strictly REJECTS repeated cancellation of an already CANCELLED Sale (self-transition guard)', async () => {
      createTestSale(SaleStatus.CANCELLED);

      const command = new CancelSaleCommand({
        saleId: 'sale_cancel_test_01',
        reason: 'Second cancellation attempt',
      });

      const result = await handler.execute(command);

      expect(result.isSuccess).toBe(false);
      expect(result.getError()).toBeInstanceOf(InvalidSaleTransitionException);
      const err = result.getError() as InvalidSaleTransitionException;
      expect(err.currentState).toBe(SaleStatus.CANCELLED);
      expect(eventPublisher.publishedEvents).toHaveLength(0);
    });

    it('7. strictly REJECTS cancellation of a REFUNDED Sale (terminal status)', async () => {
      createTestSale(SaleStatus.REFUNDED);

      const command = new CancelSaleCommand({
        saleId: 'sale_cancel_test_01',
        reason: 'Attempting cancellation on refunded order',
      });

      const result = await handler.execute(command);

      expect(result.isSuccess).toBe(false);
      expect(result.getError()).toBeInstanceOf(InvalidSaleTransitionException);
      const err = result.getError() as InvalidSaleTransitionException;
      expect(err.currentState).toBe(SaleStatus.REFUNDED);
      expect(eventPublisher.publishedEvents).toHaveLength(0);
    });
  });

  describe('Validation & Boundary Preconditions', () => {
    it('fails with SaleNotFoundException when Sale does not exist in repository', async () => {
      const command = new CancelSaleCommand({
        saleId: 'non_existent_sale_999',
        reason: 'Order abort',
      });

      const result = await handler.execute(command);

      expect(result.isSuccess).toBe(false);
      expect(result.getError()).toBeInstanceOf(SaleNotFoundException);
      expect(saleRepo.saveCallCount).toBe(0);
    });

    it('propagates domain validation error when reason is empty or whitespace', async () => {
      createTestSale(SaleStatus.DRAFT);

      const command = new CancelSaleCommand({
        saleId: 'sale_cancel_test_01',
        reason: '     ',
      });

      const result = await handler.execute(command);

      expect(result.isSuccess).toBe(false);
      expect(result.getError()).toBeInstanceOf(InvalidSaleStateException);
      const err = result.getError() as InvalidSaleStateException;
      expect(err.code).toBe('INVALID_CANCELLATION_REASON');
      expect(saleRepo.saveCallCount).toBe(0);
    });

    it('rejects empty or whitespace saleId', async () => {
      const command = new CancelSaleCommand({
        saleId: '   ',
        reason: 'Valid reason',
      });

      const result = await handler.execute(command);

      expect(result.isSuccess).toBe(false);
      expect(result.getError()).toBeInstanceOf(InvalidSaleStateException);
      expect(saleRepo.saveCallCount).toBe(0);
    });

    it('rejects null or undefined command input', async () => {
      const result = await handler.execute(null as unknown as CancelSaleCommand);
      expect(result.isSuccess).toBe(false);
      expect(result.getError()).toBeInstanceOf(InvalidSaleStateException);
    });

    it('enforces multi-tenant isolation when tenantId is specified in command', async () => {
      createTestSale(SaleStatus.DRAFT, 'tenant_gym_A');

      const command = new CancelSaleCommand({
        saleId: 'sale_cancel_test_01',
        reason: 'Cross tenant attempt',
        tenantId: 'tenant_gym_B', // Mismatched tenant
      });

      const result = await handler.execute(command);

      expect(result.isSuccess).toBe(false);
      expect(result.getError()).toBeInstanceOf(PaymentUnauthorizedException);
      expect((result.getError() as Error).message).toContain('Cross-tenant access forbidden');
      expect(saleRepo.saveCallCount).toBe(0);
    });

    it('allows cancellation when tenantId matches target sale tenant', async () => {
      createTestSale(SaleStatus.DRAFT, 'tenant_gym_A');

      const command = new CancelSaleCommand({
        saleId: 'sale_cancel_test_01',
        reason: 'Legitimate cancellation by authorized tenant manager',
        tenantId: 'tenant_gym_A',
      });

      const result = await handler.execute(command);

      expect(result.isSuccess).toBe(true);
      expect(result.getValue().status).toBe(SaleStatus.CANCELLED);
    });

    it('propagates repository persistence failure gracefully', async () => {
      createTestSale(SaleStatus.DRAFT);
      saleRepo.throwOnSave = new Error('Database disk full or constraint error');

      const command = new CancelSaleCommand({
        saleId: 'sale_cancel_test_01',
        reason: 'Valid reason with failing persistence',
      });

      const result = await handler.execute(command);

      expect(result.isSuccess).toBe(false);
      expect((result.getError() as Error).message).toBe('Database disk full or constraint error');
    });
  });

  describe('Non-Coupling & Architectural Invariants', () => {
    it('does not directly assign status or bypass aggregate invariants', async () => {
      const sale = createTestSale(SaleStatus.DRAFT);
      expect(sale.status).toBe(SaleStatus.DRAFT);

      const command = new CancelSaleCommand({
        saleId: 'sale_cancel_test_01',
        reason: 'Proper domain method invocation',
      });

      const result = await handler.execute(command);

      expect(result.isSuccess).toBe(true);
      const updatedSale = saleRepo.store.get('sale_cancel_test_01')!;
      expect(updatedSale.status).toBe(SaleStatus.CANCELLED);
      // Aggregate invariant: version incremented from 1 to 2
      expect(updatedSale.version).toBe(2);
      expect(updatedSale.isTerminal()).toBe(true);
    });

    it('preserves line items and financial snapshot upon cancellation without mutating or discarding items', async () => {
      createTestSale(SaleStatus.DRAFT);

      const command = new CancelSaleCommand({
        saleId: 'sale_cancel_test_01',
        reason: 'Preserve cart items for forensic audit',
      });

      const result = await handler.execute(command);

      expect(result.isSuccess).toBe(true);
      const dto = result.getValue();
      expect(dto.itemCount).toBe(1);
      expect(dto.items).toHaveLength(1);
      expect(dto.items[0]?.description).toBe('Personal Training Session');
      expect(dto.subtotalAmount).toBe(100);
      expect(dto.totalAmount).toBe(100);
    });
  });
});
