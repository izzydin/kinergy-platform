import { CreateSaleHandler } from '../handlers/create-sale.handler';
import { CreateSaleCommand } from '../commands/create-sale.command';
import { AddSaleItemHandler } from '../handlers/add-sale-item.handler';
import { AddSaleItemCommand } from '../commands/add-sale-item.command';
import { RemoveSaleItemHandler } from '../handlers/remove-sale-item.handler';
import { RemoveSaleItemCommand } from '../commands/remove-sale-item.command';
import { ApplyDiscountHandler } from '../handlers/apply-discount.handler';
import { ApplyDiscountCommand } from '../commands/apply-discount.command';
import { CancelSaleHandler } from '../handlers/cancel-sale.handler';
import { CancelSaleCommand } from '../commands/cancel-sale.command';
import { GetSaleHandler } from '../queries/get-sale.handler';
import { GetSaleQuery } from '../queries/get-sale.query';
import { CalculateSaleHandler } from '../queries/calculate-sale.handler';
import { CalculateSaleQuery } from '../queries/calculate-sale.query';
import { SaleRepositoryPort } from '../ports/sale-repository.port';
import { SalesEventPublisherPort } from '../ports/sales-event-publisher.port';
import { Sale } from '../../domain/sale.aggregate';
import { SaleItem } from '../../domain/entities/sale-item.entity';
import { SaleId } from '../../domain/value-objects/sale-id.vo';
import { Money } from '../../domain/value-objects/money.vo';
import { SaleSource } from '../../domain/value-objects/sale-source.vo';
import { SaleSourceType } from '../../domain/enums/sale-source-type.enum';
import { SaleStatus } from '../../domain/enums/sale-status.enum';
import { DiscountType } from '../../domain/enums/discount-type.enum';
import { DeterministicClock } from '../../domain/shared/clock';
import { DomainEvent } from '../../domain/shared/domain-event';

/**
 * High-fidelity transactional in-memory repository harness.
 * Emulates ACID transaction semantics:
 * - Isolation: withTransaction creates a staged snapshot.
 * - Atomicity: any error thrown inside work discards all staged writes.
 * - Commit: staged writes are applied only upon successful completion.
 */
class MockTransactionalSaleRepository implements SaleRepositoryPort {
  private storage = new Map<string, Sale>();
  public transactionCallCount = 0;
  public failOnSave = false;
  public failMessage = 'Simulated database transaction failure during persistence';

  constructor(initialSales: Sale[] = []) {
    for (const sale of initialSales) {
      this.storage.set(sale.id.value, this.cloneSale(sale));
    }
  }

  private cloneSale(sale: Sale): Sale {
    return Sale.reconstitute({
      id: sale.id,
      tenantId: sale.tenantId,
      clientId: sale.clientId,
      currency: sale.currency,
      status: sale.status,
      source: sale.source,
      items: sale.items.map((i) =>
        SaleItem.reconstitute({
          id: i.id,
          saleId: i.saleId,
          source: i.source,
          description: i.description,
          skuOrCode: i.skuOrCode,
          quantity: i.quantity,
          unitPrice: i.unitPrice,
          discount: i.discount,
          subtotal: i.subtotal,
          discountTotal: i.discountTotal,
          total: i.total,
        }),
      ),
      orderDiscount: sale.orderDiscount,
      subtotal: sale.subtotal,
      discountTotal: sale.discountTotal,
      total: sale.total,
      version: sale.version,
      cancelledAt: sale.cancelledAt,
      cancellationReason: sale.cancellationReason,
      createdAt: sale.createdAt,
      updatedAt: sale.updatedAt,
    });
  }

  public async findById(id: string): Promise<Sale | null> {
    const sale = this.storage.get(id);
    return sale ? this.cloneSale(sale) : null;
  }

  public async getById(id: string): Promise<Sale | null> {
    return this.findById(id);
  }

  public async save(sale: Sale): Promise<void> {
    if (this.failOnSave) {
      throw new Error(this.failMessage);
    }
    this.storage.set(sale.id.value, this.cloneSale(sale));
  }

  public async findMany(): Promise<never> {
    throw new Error('Not implemented');
  }

  public async withTransaction<T>(
    work: (transactionalRepo: SaleRepositoryPort) => Promise<T>,
  ): Promise<T> {
    this.transactionCallCount++;

    // Create transactional staged buffer
    const stagedStorage = new Map<string, Sale>();
    for (const [key, value] of this.storage.entries()) {
      stagedStorage.set(key, this.cloneSale(value));
    }

    const stagedRepo: SaleRepositoryPort = {
      findById: async (id: string) => {
        const sale = stagedStorage.get(id);
        return sale ? this.cloneSale(sale) : null;
      },
      getById: async (id: string) => {
        const sale = stagedStorage.get(id);
        return sale ? this.cloneSale(sale) : null;
      },
      save: async (sale: Sale) => {
        if (this.failOnSave) {
          throw new Error(this.failMessage);
        }
        stagedStorage.set(sale.id.value, this.cloneSale(sale));
      },
      findMany: this.findMany.bind(this),
      withTransaction: async (subWork) => subWork(stagedRepo),
    };

    const result = await work(stagedRepo);
    // Atomic Commit: apply staged changes to persistent storage
    this.storage.clear();
    for (const [key, value] of stagedStorage.entries()) {
      this.storage.set(key, this.cloneSale(value));
    }
    return result;
  }

  // Inspection helpers for testing
  public getStoredSale(id: string): Sale | undefined {
    const sale = this.storage.get(id);
    return sale ? this.cloneSale(sale) : undefined;
  }

  public getAllStoredSales(): Sale[] {
    return Array.from(this.storage.values()).map((s) => this.cloneSale(s));
  }
}

describe('Phase 7.11 Command Transactional Boundaries & Rollback Suite', () => {
  const clock = new DeterministicClock(new Date('2026-10-06T12:00:00.000Z'));
  let publishedEvents: DomainEvent[] = [];
  const eventPublisher: SalesEventPublisherPort = {
    publish: jest.fn(async (events: ReadonlyArray<DomainEvent>) => {
      publishedEvents.push(...events);
    }),
  };

  beforeEach(() => {
    publishedEvents = [];
    jest.clearAllMocks();
  });

  const createSampleSale = (id: string): Sale => {
    const source = SaleSource.create(SaleSourceType.DRINK, 'pos-reg-1');
    return Sale.create(
      {
        id: SaleId.create(id),
        tenantId: 'tenant-clin-1',
        clientId: 'client-101',
        currency: 'USD',
        source,
        items: [
          {
            source,
            description: 'Protein Shake',
            quantity: 2,
            unitPrice: Money.create('15.00', 'USD'),
          },
        ],
      },
      clock,
    );
  };

  describe('1. CreateSale Command Transaction Requirements', () => {
    it('requires a transaction: atomicity prevents partial persistence of nested SaleItems on failure', async () => {
      const repo = new MockTransactionalSaleRepository();
      repo.failOnSave = true; // Simulates persistence crash while writing items
      const handler = new CreateSaleHandler(repo, clock, eventPublisher);

      const command = new CreateSaleCommand({
        id: 'sale-create-atomic-1',
        tenantId: 'tenant-clin-1',
        clientId: 'client-101',
        currency: 'USD',
        allowWalkInWithoutSource: true,
        items: [
          { description: 'Electrolyte Water', quantity: 2, unitPriceAmount: 5.0 },
          { description: 'Energy Bar', quantity: 1, unitPriceAmount: 3.5 },
        ],
      });

      const result = await handler.execute(command);

      // 1. Command handler must report failure gracefully
      expect(result.isFailure).toBe(true);
      const error = result.getError();
      const errorMessage = error instanceof Error ? error.message : String(error);
      expect(errorMessage).toContain('Simulated database transaction failure');

      // 2. Transaction wrapper must have been engaged
      expect(repo.transactionCallCount).toBe(1);

      // 3. Rollback guarantee: No orphan Sale or partial SaleItems persisted
      expect(repo.getStoredSale('sale-create-atomic-1')).toBeUndefined();
      expect(repo.getAllStoredSales()).toHaveLength(0);

      // 4. Invariant: Events are NOT published on rolled-back transaction
      expect(publishedEvents).toHaveLength(0);
      expect(eventPublisher.publish).not.toHaveBeenCalled();
    });

    it('successfully commits Sale and all nested SaleItems in one atomic transaction', async () => {
      const repo = new MockTransactionalSaleRepository();
      const handler = new CreateSaleHandler(repo, clock, eventPublisher);

      const command = new CreateSaleCommand({
        id: 'sale-create-success-1',
        tenantId: 'tenant-clin-1',
        currency: 'USD',
        allowWalkInWithoutSource: true,
        items: [
          { description: 'Electrolyte Water', quantity: 2, unitPriceAmount: 5.0 },
          { description: 'Energy Bar', quantity: 1, unitPriceAmount: 3.5 },
        ],
      });

      const result = await handler.execute(command);

      expect(result.isSuccess).toBe(true);
      expect(repo.transactionCallCount).toBe(1);

      // Verified committed in storage
      const stored = repo.getStoredSale('sale-create-success-1');
      expect(stored).toBeDefined();
      expect(stored!.items).toHaveLength(2);
      expect(stored!.total.amount.toFixed(2)).toBe('13.50');

      // Events published post-commit
      expect(publishedEvents.length).toBeGreaterThan(0);
      expect(eventPublisher.publish).toHaveBeenCalled();
    });
  });

  describe('2. AddSaleItem Command Transaction Requirements', () => {
    it('requires a transaction: surrounds load aggregate -> domain mutation -> persistence to prevent partial item insertion', async () => {
      const initialSale = createSampleSale('sale-add-item-1');
      const repo = new MockTransactionalSaleRepository([initialSale]);
      repo.failOnSave = true; // Simulate failure during item persistence / totals update

      const handler = new AddSaleItemHandler(repo, clock, eventPublisher);
      const command = new AddSaleItemCommand({
        saleId: 'sale-add-item-1',
        description: 'Recovery Foam Roller',
        quantity: 1,
        unitPriceAmount: 45.0,
      });

      const result = await handler.execute(command);

      // 1. Result should indicate failure
      expect(result.isFailure).toBe(true);
      const error = result.getError();
      const errorMessage = error instanceof Error ? error.message : String(error);
      expect(errorMessage).toContain('Simulated database transaction failure');

      // 2. withTransaction was used
      expect(repo.transactionCallCount).toBe(1);

      // 3. Rollback guarantee: Storage still reflects EXACT initial state (1 item, $30.00 total)
      const stored = repo.getStoredSale('sale-add-item-1');
      expect(stored).toBeDefined();
      expect(stored!.items).toHaveLength(1);
      const firstItem = stored!.items[0];
      expect(firstItem?.description).toBe('Protein Shake');
      expect(stored!.total.amount.toFixed(2)).toBe('30.00');

      // 4. Invariant: Events are NOT published
      expect(publishedEvents).toHaveLength(0);
      expect(eventPublisher.publish).not.toHaveBeenCalled();
    });

    it('successfully commits new item and recalculated totals atomically', async () => {
      const initialSale = createSampleSale('sale-add-item-ok');
      const repo = new MockTransactionalSaleRepository([initialSale]);

      const handler = new AddSaleItemHandler(repo, clock, eventPublisher);
      const command = new AddSaleItemCommand({
        saleId: 'sale-add-item-ok',
        description: 'Recovery Foam Roller',
        quantity: 1,
        unitPriceAmount: 45.0,
      });

      const result = await handler.execute(command);

      expect(result.isSuccess).toBe(true);
      expect(repo.transactionCallCount).toBe(1);

      const stored = repo.getStoredSale('sale-add-item-ok');
      expect(stored!.items).toHaveLength(2);
      expect(stored!.total.amount.toFixed(2)).toBe('75.00');
      expect(publishedEvents.length).toBeGreaterThan(0);
    });
  });

  describe('3. RemoveSaleItem Command Transaction Requirements', () => {
    it('requires a transaction: surrounds load -> domain mutation -> persistence to prevent orphan item deletion on error', async () => {
      const initialSale = createSampleSale('sale-remove-item-1');
      const itemIdToRemove = initialSale.items[0]?.id.value ?? '';

      const repo = new MockTransactionalSaleRepository([initialSale]);
      repo.failOnSave = true; // Simulate persistence failure

      const handler = new RemoveSaleItemHandler(repo, clock, eventPublisher);
      const command = new RemoveSaleItemCommand({
        saleId: 'sale-remove-item-1',
        itemId: itemIdToRemove,
      });

      const result = await handler.execute(command);

      expect(result.isFailure).toBe(true);
      expect(repo.transactionCallCount).toBe(1);

      // Rollback guarantee: The item is still present in storage with original totals
      const stored = repo.getStoredSale('sale-remove-item-1');
      expect(stored).toBeDefined();
      expect(stored!.items).toHaveLength(1);
      expect(stored!.items[0]?.id.value).toBe(itemIdToRemove);
      expect(stored!.total.amount.toFixed(2)).toBe('30.00');

      // No events published on rollback
      expect(publishedEvents).toHaveLength(0);
    });

    it('successfully removes item and updates totals in an atomic transaction', async () => {
      const initialSale = createSampleSale('sale-remove-item-ok');
      const itemIdToRemove = initialSale.items[0]?.id.value ?? '';

      const repo = new MockTransactionalSaleRepository([initialSale]);
      const handler = new RemoveSaleItemHandler(repo, clock, eventPublisher);
      const command = new RemoveSaleItemCommand({
        saleId: 'sale-remove-item-ok',
        itemId: itemIdToRemove,
      });

      const result = await handler.execute(command);

      expect(result.isSuccess).toBe(true);
      expect(repo.transactionCallCount).toBe(1);

      const stored = repo.getStoredSale('sale-remove-item-ok');
      expect(stored!.items).toHaveLength(0);
      expect(stored!.total.amount.toFixed(2)).toBe('0.00');
      expect(publishedEvents.length).toBeGreaterThan(0);
    });
  });

  describe('4. ApplyDiscount Command Transaction Requirements', () => {
    it('requires a transaction: ensures Sale discount mutation and recalculated totals persistence are atomic', async () => {
      const initialSale = createSampleSale('sale-discount-atomic-1');
      const repo = new MockTransactionalSaleRepository([initialSale]);
      repo.failOnSave = true; // Simulate persistence crash

      const handler = new ApplyDiscountHandler(repo, clock, eventPublisher);
      const command = new ApplyDiscountCommand({
        saleId: 'sale-discount-atomic-1',
        discount: {
          type: DiscountType.PERCENTAGE,
          value: 20,
          reason: 'VIP Promotion',
        },
      });

      const result = await handler.execute(command);

      expect(result.isFailure).toBe(true);
      expect(repo.transactionCallCount).toBe(1);

      // Rollback guarantee: Sale discount in storage remains null, total remains unmodified $30.00
      const stored = repo.getStoredSale('sale-discount-atomic-1');
      expect(stored).toBeDefined();
      expect(stored!.orderDiscount).toBeNull();
      expect(stored!.total.amount.toFixed(2)).toBe('30.00');
      expect(stored!.discountTotal.amount.toFixed(2)).toBe('0.00');

      // No events published
      expect(publishedEvents).toHaveLength(0);
    });

    it('successfully commits discount and recalculated totals atomically', async () => {
      const initialSale = createSampleSale('sale-discount-atomic-ok');
      const repo = new MockTransactionalSaleRepository([initialSale]);

      const handler = new ApplyDiscountHandler(repo, clock, eventPublisher);
      const command = new ApplyDiscountCommand({
        saleId: 'sale-discount-atomic-ok',
        discount: {
          type: DiscountType.PERCENTAGE,
          value: 20,
          reason: 'VIP Promotion',
        },
      });

      const result = await handler.execute(command);

      expect(result.isSuccess).toBe(true);
      expect(repo.transactionCallCount).toBe(1);

      const stored = repo.getStoredSale('sale-discount-atomic-ok');
      expect(stored!.orderDiscount).not.toBeNull();
      expect(stored!.total.amount.toFixed(2)).toBe('24.00');
      expect(stored!.discountTotal.amount.toFixed(2)).toBe('6.00');
    });
  });

  describe('5. CancelSale Command Transaction Requirements', () => {
    it('requires a transaction: guarantees the Sale cannot be left in a partially modified state if persistence fails', async () => {
      const initialSale = createSampleSale('sale-cancel-atomic-1');
      const repo = new MockTransactionalSaleRepository([initialSale]);
      repo.failOnSave = true; // Simulate crash during status update in database

      const handler = new CancelSaleHandler(repo, clock, eventPublisher);
      const command = new CancelSaleCommand({
        saleId: 'sale-cancel-atomic-1',
        tenantId: 'tenant-clin-1',
        reason: 'Customer cancelled order before fulfillment',
      });

      const result = await handler.execute(command);

      expect(result.isFailure).toBe(true);
      expect(repo.transactionCallCount).toBe(1);

      // Rollback guarantee: Sale in storage remains DRAFT, NOT CANCELLED!
      const stored = repo.getStoredSale('sale-cancel-atomic-1');
      expect(stored).toBeDefined();
      expect(stored!.status).toBe(SaleStatus.DRAFT);
      expect(stored!.cancelledAt).toBeFalsy();
      expect(stored!.cancellationReason).toBeFalsy();

      // Events NOT published
      expect(publishedEvents).toHaveLength(0);
    });

    it('successfully commits cancellation status transition in an atomic transaction', async () => {
      const initialSale = createSampleSale('sale-cancel-atomic-ok');
      const repo = new MockTransactionalSaleRepository([initialSale]);

      const handler = new CancelSaleHandler(repo, clock, eventPublisher);
      const command = new CancelSaleCommand({
        saleId: 'sale-cancel-atomic-ok',
        tenantId: 'tenant-clin-1',
        reason: 'Customer cancelled order before fulfillment',
      });

      const result = await handler.execute(command);

      expect(result.isSuccess).toBe(true);
      expect(repo.transactionCallCount).toBe(1);

      const stored = repo.getStoredSale('sale-cancel-atomic-ok');
      expect(stored!.status).toBe(SaleStatus.CANCELLED);
      expect(stored!.cancellationReason).toBe('Customer cancelled order before fulfillment');
      expect(stored!.cancelledAt).not.toBeNull();
      expect(publishedEvents.length).toBeGreaterThan(0);
    });
  });

  describe('6. Read-Only Query Transaction Verification', () => {
    it('GetSale does NOT open a database transaction (zero transactional overhead)', async () => {
      const initialSale = createSampleSale('sale-query-1');
      const repo = new MockTransactionalSaleRepository([initialSale]);

      const handler = new GetSaleHandler(repo);
      const result = await handler.execute(new GetSaleQuery({ saleId: 'sale-query-1' }));

      expect(result.isSuccess).toBe(true);
      expect(result.getValue().id).toBe('sale-query-1');
      // Must NOT initiate transaction
      expect(repo.transactionCallCount).toBe(0);
    });

    it('CalculateSale does NOT open a database transaction (read-only query)', async () => {
      const initialSale = createSampleSale('sale-calc-1');
      const repo = new MockTransactionalSaleRepository([initialSale]);

      const handler = new CalculateSaleHandler(repo);
      const result = await handler.execute(
        new CalculateSaleQuery({
          saleId: 'sale-calc-1',
        }),
      );

      expect(result.isSuccess).toBe(true);
      // Read-only query must not initiate a transaction
      expect(repo.transactionCallCount).toBe(0);
    });
  });
});
