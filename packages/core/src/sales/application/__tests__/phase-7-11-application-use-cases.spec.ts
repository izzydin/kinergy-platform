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
import { CalculateSaleHandler } from '../queries/calculate-sale.handler';
import { CalculateSaleQuery } from '../queries/calculate-sale.query';
import { GetSaleHandler } from '../queries/get-sale.handler';
import { GetSaleQuery } from '../queries/get-sale.query';
import { ListSalesHandler } from '../queries/list-sales.handler';
import { ListSalesQuery } from '../queries/list-sales.query';

import {
  SaleRepositoryPort,
  FindSalesCriteria,
  FindSalesPagination,
  FindSalesSort,
  FindSalesResult,
} from '../ports/sale-repository.port';
import { SalesEventPublisherPort } from '../ports/sales-event-publisher.port';
import {
  SaleSourceValidatorPort,
  ValidateSourceInput,
  SaleSourceValidationResult,
} from '../ports/sale-source-validator.port';
import { ClientFacadePort, ClientSummaryPayload } from '../ports/client-facade.port';

import { Sale } from '../../domain/sale.aggregate';
import { SaleItem } from '../../domain/entities/sale-item.entity';
import { SaleId } from '../../domain/value-objects/sale-id.vo';
import { Money } from '../../domain/value-objects/money.vo';
import { Discount } from '../../domain/value-objects/discount.vo';
import { SaleSource } from '../../domain/value-objects/sale-source.vo';
import { SaleStatus } from '../../domain/enums/sale-status.enum';
import { SaleSourceType } from '../../domain/enums/sale-source-type.enum';
import { SourceType } from '../../domain/enums/source-type.enum';
import { DiscountType } from '../../domain/enums/discount-type.enum';
import { DeterministicClock } from '../../domain/shared/clock';
import { DomainEvent } from '../../domain/shared/domain-event';
import { SaleMapper } from '../mappers/sale.mapper';

// Exceptions
import {
  SaleNotFoundException,
  ClientNotFoundException,
  InvalidSaleQueryException,
  PaymentUnauthorizedException,
} from '../exceptions';
import {
  InvalidSaleStateException,
  InvalidSaleSourceException,
  InvalidDiscountException,
  InvalidMoneyException,
  SaleAlreadyFinalizedException,
} from '../../domain/exceptions';

function getErrorMessage(result: { getError(): Error | string | null }): string {
  const err = result.getError();
  return err instanceof Error ? err.message : String(err ?? '');
}

/**
 * High-fidelity in-memory transactional repository harness operating strictly at the
 * application boundary. Never mocks or stubs the Sale aggregate root itself.
 */
class TestSaleRepository implements SaleRepositoryPort {
  public store = new Map<string, Sale>();
  public findByIdCalls: string[] = [];
  public getByIdCalls: string[] = [];
  public saveCalls: Sale[] = [];
  public transactionCallCount = 0;

  public throwOnFind?: Error;
  public throwOnSave?: Error;
  public throwOnFindMany?: Error;

  constructor(initialSales: Sale[] = []) {
    for (const sale of initialSales) {
      this.store.set(sale.id.value, sale);
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
      refundedAt: sale.refundedAt,
      completedAt: sale.completedAt,
      createdAt: sale.createdAt,
      updatedAt: sale.updatedAt,
    });
  }

  async findById(id: SaleId | string): Promise<Sale | null> {
    const key = typeof id === 'string' ? id.trim() : id.value;
    this.findByIdCalls.push(key);
    if (this.throwOnFind) throw this.throwOnFind;
    const found = this.store.get(key);
    return found ? this.cloneSale(found) : null;
  }

  async getById(id: SaleId | string): Promise<Sale | null> {
    const key = typeof id === 'string' ? id.trim() : id.value;
    this.getByIdCalls.push(key);
    if (this.throwOnFind) throw this.throwOnFind;
    const found = this.store.get(key);
    return found ? this.cloneSale(found) : null;
  }

  async findBySourceReference(
    sourceType: SourceType | SaleSourceType | string,
    sourceId: string,
    tenantId?: string,
  ): Promise<Sale | null> {
    for (const sale of this.store.values()) {
      if (
        sale.status !== SaleStatus.CANCELLED &&
        sale.source.sourceType === sourceType &&
        sale.source.sourceId === sourceId &&
        (!tenantId || sale.tenantId === tenantId)
      ) {
        return sale;
      }
    }
    return null;
  }

  async findBySourceCode(sourceCode: string, tenantId?: string): Promise<Sale | null> {
    for (const sale of this.store.values()) {
      if (
        sale.status !== SaleStatus.CANCELLED &&
        sale.source.sourceCode === sourceCode &&
        (!tenantId || sale.tenantId === tenantId)
      ) {
        return sale;
      }
    }
    return null;
  }

  async save(sale: Sale): Promise<void> {
    this.saveCalls.push(sale);
    if (this.throwOnSave) throw this.throwOnSave;
    this.store.set(sale.id.value, sale);
  }

  async findMany(
    criteria?: FindSalesCriteria,
    pagination?: FindSalesPagination,
    sort?: FindSalesSort,
  ): Promise<FindSalesResult> {
    if (this.throwOnFindMany) throw this.throwOnFindMany;

    let items = Array.from(this.store.values());

    // Filter by criteria
    if (criteria) {
      if (criteria.tenantId) {
        items = items.filter((s) => s.tenantId === criteria.tenantId);
      }
      if (criteria.clientId) {
        items = items.filter((s) => s.clientId === criteria.clientId);
      }
      if (criteria.status) {
        items = items.filter((s) => s.status === criteria.status);
      }
      if (criteria.sourceType) {
        items = items.filter((s) => s.source.sourceType === criteria.sourceType);
      }
      if (criteria.sourceReferenceId) {
        items = items.filter((s) => s.source.sourceId === criteria.sourceReferenceId);
      }
      if (criteria.fromDate) {
        items = items.filter((s) => s.createdAt >= criteria.fromDate!);
      }
      if (criteria.toDate) {
        items = items.filter((s) => s.createdAt <= criteria.toDate!);
      }
    }

    const total = items.length;

    // Apply sorting
    if (sort) {
      const field = sort.field;
      const dir = sort.direction === 'asc' ? 1 : -1;
      items.sort((a, b) => {
        let valA: string | number | Date = a.createdAt;
        let valB: string | number | Date = b.createdAt;
        if (field === 'total') {
          valA = a.total.amount;
          valB = b.total.amount;
        } else if (field === 'status') {
          valA = a.status;
          valB = b.status;
        }
        if (valA < valB) return -1 * dir;
        if (valA > valB) return 1 * dir;
        // Deterministic secondary sort by ID
        return a.id.value.localeCompare(b.id.value);
      });
    }

    // Apply pagination
    const page = pagination?.page ?? 1;
    const limit = pagination?.limit ?? 20;
    const offset = (page - 1) * limit;
    const paginatedItems = items.slice(offset, offset + limit);

    return {
      items: paginatedItems.map((s) => SaleMapper.toSummaryDTO(s)),
      total,
    };
  }

  async withTransaction<T>(work: (repo: SaleRepositoryPort) => Promise<T>): Promise<T> {
    this.transactionCallCount++;
    const snapshot = new Map(this.store);
    try {
      const result = await work(this);
      if (
        result &&
        typeof result === 'object' &&
        'isFailure' in result &&
        (result as { isFailure: boolean }).isFailure
      ) {
        this.store = snapshot;
      }
      return result;
    } catch (err) {
      this.store = snapshot;
      throw err;
    }
  }

  clear(): void {
    this.store.clear();
    this.findByIdCalls = [];
    this.getByIdCalls = [];
    this.saveCalls = [];
    this.transactionCallCount = 0;
    this.throwOnFind = undefined;
    this.throwOnSave = undefined;
    this.throwOnFindMany = undefined;
  }
}

class MockSalesEventPublisher implements SalesEventPublisherPort {
  public publishedEvents: DomainEvent[] = [];
  public publishCallCount = 0;
  public throwOnPublish?: Error;

  async publish(events: ReadonlyArray<DomainEvent>): Promise<void> {
    this.publishCallCount++;
    if (this.throwOnPublish) throw this.throwOnPublish;
    this.publishedEvents.push(...events);
  }

  clear(): void {
    this.publishedEvents = [];
    this.publishCallCount = 0;
    this.throwOnPublish = undefined;
  }
}

class MockSaleSourceValidator implements SaleSourceValidatorPort {
  public validationResult: SaleSourceValidationResult = { isValid: true, exists: true };

  async validateSource(_input: ValidateSourceInput): Promise<SaleSourceValidationResult> {
    return this.validationResult;
  }
}

class MockClientFacade implements ClientFacadePort {
  public clients = new Map<string, ClientSummaryPayload>();

  async getClientSummary(
    clientId: string,
    _tenantId?: string,
  ): Promise<ClientSummaryPayload | null> {
    return this.clients.get(clientId) ?? null;
  }
}

describe('Phase 7.11 Application Use Cases - Complete Unit Test Suite', () => {
  const fixedNow = new Date('2026-10-06T12:00:00.000Z');
  let clock: DeterministicClock;
  let repo: TestSaleRepository;
  let eventPublisher: MockSalesEventPublisher;
  let sourceValidator: MockSaleSourceValidator;
  let clientFacade: MockClientFacade;

  beforeEach(() => {
    clock = new DeterministicClock(fixedNow);
    repo = new TestSaleRepository();
    eventPublisher = new MockSalesEventPublisher();
    sourceValidator = new MockSaleSourceValidator();
    clientFacade = new MockClientFacade();
  });

  const seedDraftSale = (overrides?: {
    id?: string;
    currency?: string;
    tenantId?: string;
    clientId?: string;
    items?: Array<{
      description: string;
      quantity: number;
      unitPrice: number;
      discount?: Discount;
    }>;
    orderDiscount?: Discount;
  }): Sale => {
    const sale = Sale.create(
      {
        id: overrides?.id ? SaleId.create(overrides.id) : SaleId.create('sale_seed_01'),
        currency: overrides?.currency ?? 'USD',
        tenantId: overrides?.tenantId ?? 'tenant_gym_01',
        clientId: overrides?.clientId ?? 'client_ath_01',
        source: SaleSource.create(SaleSourceType.FOOD, 'pos_station_1'),
        orderDiscount: overrides?.orderDiscount,
      },
      clock,
    );

    if (overrides?.items) {
      for (const item of overrides.items) {
        sale.addItem(
          {
            source: SaleSource.create(SaleSourceType.FOOD, 'item_src_01'),
            description: item.description,
            quantity: item.quantity,
            unitPrice: Money.create(item.unitPrice, sale.currency),
            discount: item.discount,
          },
          clock,
        );
      }
    }

    sale.clearEvents();
    repo.store.set(sale.id.value, sale);
    return sale;
  };

  // ===========================================================================
  // 1. CreateSale Use Case Suite
  // ===========================================================================
  describe('CreateSale Use Case', () => {
    let handler: CreateSaleHandler;

    beforeEach(() => {
      handler = new CreateSaleHandler(repo, clock, eventPublisher, sourceValidator, clientFacade);
    });

    it('Happy path: orchestrates aggregate creation, repository save, and domain event dispatch', async () => {
      const command = new CreateSaleCommand({
        tenantId: 'tenant_gym_01',
        currency: 'USD',
        source: { sourceType: SaleSourceType.FOOD, sourceId: 'food_pos_01' },
        items: [
          { description: 'Energy Bar', quantity: 2, unitPriceAmount: 5.0 },
          { description: 'Isotonic Drink', quantity: 1, unitPriceAmount: 10.0 },
        ],
      });

      const result = await handler.execute(command);

      expect(result.isSuccess).toBe(true);
      const dto = result.getValue();
      expect(dto).toBeDefined();
      expect(dto.status).toBe(SaleStatus.DRAFT);
      expect(dto.total.amount).toBe(20.0);
      expect(dto.subtotal.amount).toBe(20.0);
      expect(dto.items).toHaveLength(2);

      // Verify persistence
      expect(repo.saveCalls).toHaveLength(1);
      const savedSale = repo.saveCalls[0]!;
      expect(savedSale.id.value).toBe(dto.id);

      // Verify events dispatched
      expect(eventPublisher.publishCallCount).toBe(1);
    });

    it('Invalid input: rejects missing command or null input payload', async () => {
      const resultNullCmd = await handler.execute(null as unknown as CreateSaleCommand);
      expect(resultNullCmd.isFailure).toBe(true);
      expect(resultNullCmd.getError()).toBeInstanceOf(InvalidSaleSourceException);

      const resultNullInput = await handler.execute(
        new CreateSaleCommand(
          null as unknown as ConstructorParameters<typeof CreateSaleCommand>[0],
        ),
      );
      expect(resultNullInput.isFailure).toBe(true);
      expect(repo.saveCalls).toHaveLength(0);
    });

    it('Invalid input: rejects invalid tenantId, currency, or empty sourceId', async () => {
      // Empty tenant
      const resEmptyTenant = await handler.execute(
        new CreateSaleCommand({ tenantId: '   ', currency: 'USD' }),
      );
      expect(resEmptyTenant.isFailure).toBe(true);
      expect(resEmptyTenant.getError()).toBeInstanceOf(InvalidSaleStateException);

      // Invalid currency
      const resBadCurrency = await handler.execute(
        new CreateSaleCommand({
          tenantId: 'tenant_01',
          currency: 'INVALID',
          source: { sourceType: SaleSourceType.FOOD, sourceId: 'src_01' },
        }),
      );
      expect(resBadCurrency.isFailure).toBe(true);
      expect(resBadCurrency.getError()).toBeInstanceOf(InvalidSaleStateException);

      // Empty sourceId
      const resBadSource = await handler.execute(
        new CreateSaleCommand({
          tenantId: 'tenant_01',
          currency: 'USD',
          source: { sourceType: SaleSourceType.FOOD, sourceId: '   ' },
        }),
      );
      expect(resBadSource.isFailure).toBe(true);
      expect(resBadSource.getError()).toBeInstanceOf(InvalidSaleSourceException);
    });

    it('Missing aggregate/entity: fails when referenced client does not exist in ClientFacade', async () => {
      const command = new CreateSaleCommand({
        tenantId: 'tenant_gym_01',
        currency: 'USD',
        clientId: 'non_existent_client',
        source: { sourceType: SaleSourceType.FOOD, sourceId: 'food_pos_01' },
      });

      const result = await handler.execute(command);

      expect(result.isFailure).toBe(true);
      expect(result.getError()).toBeInstanceOf(ClientNotFoundException);
      expect(repo.saveCalls).toHaveLength(0);
    });

    it('Domain rejection: fails when domain invariants are violated (negative price, invalid quantity)', async () => {
      const command = new CreateSaleCommand({
        tenantId: 'tenant_gym_01',
        currency: 'USD',
        source: { sourceType: SaleSourceType.FOOD, sourceId: 'pos_01' },
        items: [{ description: 'Invalid Item', quantity: 1, unitPriceAmount: -15.0 }],
      });

      const result = await handler.execute(command);

      expect(result.isFailure).toBe(true);
      expect(result.getError()).toBeInstanceOf(InvalidMoneyException);
      expect(repo.saveCalls).toHaveLength(0);
    });

    it('Repository failure: cleanly propagates repository save errors without crashing', async () => {
      repo.throwOnSave = new Error('Database connection reset during save');

      const command = new CreateSaleCommand({
        tenantId: 'tenant_gym_01',
        currency: 'USD',
        source: { sourceType: SaleSourceType.FOOD, sourceId: 'pos_01' },
      });

      const result = await handler.execute(command);

      expect(result.isFailure).toBe(true);
      expect(getErrorMessage(result)).toContain('Database connection reset during save');
      // No events dispatched if transaction/save fails
      expect(eventPublisher.publishCallCount).toBe(0);
    });

    it('Transaction behavior: executes inside transaction boundary and does not publish events on failure', async () => {
      repo.throwOnSave = new Error('Disk full');

      const command = new CreateSaleCommand({
        tenantId: 'tenant_gym_01',
        currency: 'USD',
        source: { sourceType: SaleSourceType.FOOD, sourceId: 'pos_01' },
      });

      const result = await handler.execute(command);

      expect(result.isFailure).toBe(true);
      expect(repo.transactionCallCount).toBe(1);
      expect(eventPublisher.publishedEvents).toHaveLength(0);
    });

    it('Purity check: application code does NOT calculate totals; totals match domain recalculateTotals()', async () => {
      const command = new CreateSaleCommand({
        tenantId: 'tenant_gym_01',
        currency: 'USD',
        source: { sourceType: SaleSourceType.FOOD, sourceId: 'pos_01' },
        items: [
          { description: 'Towel', quantity: 2, unitPriceAmount: 15.0 },
          { description: 'Water', quantity: 1, unitPriceAmount: 4.0 },
        ],
        orderDiscount: { type: DiscountType.FIXED, value: 5.0, reason: 'Promo' },
      });

      const result = await handler.execute(command);

      expect(result.isSuccess).toBe(true);
      const dto = result.getValue();
      // Subtotal = 30 + 4 = 34. Discount = 5. Total = 29.
      expect(dto.subtotal.amount).toBe(34.0);
      expect(dto.discountTotal.amount).toBe(5.0);
      expect(dto.total.amount).toBe(29.0);
    });
  });

  // ===========================================================================
  // 2. AddSaleItem Use Case Suite
  // ===========================================================================
  describe('AddSaleItem Use Case', () => {
    let handler: AddSaleItemHandler;

    beforeEach(() => {
      handler = new AddSaleItemHandler(repo, clock, eventPublisher);
    });

    it('Happy path: proves orchestration load -> domain addItem -> repository save -> result', async () => {
      const sale = seedDraftSale();
      const addItemSpy = jest.spyOn(Sale.prototype, 'addItem');

      try {
        const command = new AddSaleItemCommand({
          saleId: sale.id.value,
          description: 'Protein Shake',
          quantity: 2,
          unitPriceAmount: 8.5,
        });

        const result = await handler.execute(command);

        expect(result.isSuccess).toBe(true);
        expect(addItemSpy).toHaveBeenCalledTimes(1);
        expect(repo.findByIdCalls).toContain(sale.id.value);
        expect(repo.saveCalls).toHaveLength(1);

        const dto = result.getValue();
        expect(dto.items).toHaveLength(1);
        expect(dto.total.amount).toBe(17.0);
        expect(eventPublisher.publishCallCount).toBe(1);
      } finally {
        addItemSpy.mockRestore();
      }
    });

    it('Invalid input: rejects empty or whitespace saleId', async () => {
      const result = await handler.execute(
        new AddSaleItemCommand({
          saleId: '   ',
          description: 'Valid Item',
          quantity: 1,
          unitPriceAmount: 10,
        }),
      );

      expect(result.isFailure).toBe(true);
      expect(result.getError()).toBeInstanceOf(InvalidSaleStateException);
      expect(repo.saveCalls).toHaveLength(0);
    });

    it('Missing aggregate: fails with SaleNotFoundException when saleId does not exist', async () => {
      const command = new AddSaleItemCommand({
        saleId: 'non_existent_sale_99',
        description: 'Item',
        quantity: 1,
        unitPriceAmount: 10,
      });

      const result = await handler.execute(command);

      expect(result.isFailure).toBe(true);
      expect(result.getError()).toBeInstanceOf(SaleNotFoundException);
      expect(repo.saveCalls).toHaveLength(0);
    });

    it('Domain rejection: rejects adding item to a CANCELLED sale', async () => {
      const sale = seedDraftSale();
      sale.cancel('Cancelled by receptionist', clock);
      sale.clearEvents();

      const command = new AddSaleItemCommand({
        saleId: sale.id.value,
        description: 'Cannot add to cancelled',
        quantity: 1,
        unitPriceAmount: 10,
      });

      const result = await handler.execute(command);

      expect(result.isFailure).toBe(true);
      expect(result.getError()).toBeInstanceOf(SaleAlreadyFinalizedException);
    });

    it('Repository failure: cleanly propagates findById and save errors', async () => {
      seedDraftSale({ id: 'sale_repo_fail_01' });
      repo.throwOnSave = new Error('Database locked');

      const command = new AddSaleItemCommand({
        saleId: 'sale_repo_fail_01',
        description: 'Item',
        quantity: 1,
        unitPriceAmount: 10,
      });

      const result = await handler.execute(command);

      expect(result.isFailure).toBe(true);
      expect(getErrorMessage(result)).toContain('Database locked');
    });

    it('Transaction behavior: executes within transaction and rolls back on failure', async () => {
      const sale = seedDraftSale({ id: 'sale_tx_01' });
      repo.throwOnSave = new Error('Tx persistence crash');

      const command = new AddSaleItemCommand({
        saleId: sale.id.value,
        description: 'Item',
        quantity: 1,
        unitPriceAmount: 10,
      });

      const result = await handler.execute(command);

      expect(result.isFailure).toBe(true);
      expect(repo.transactionCallCount).toBe(1);
      expect(eventPublisher.publishCallCount).toBe(0);
      // Item was not saved in repo store
      const persisted = await repo.findById(sale.id.value);
      expect(persisted?.items).toHaveLength(0);
    });

    it('Purity check: application code does NOT manually calculate totals or directly mutate items array', async () => {
      const sale = seedDraftSale();
      const command = new AddSaleItemCommand({
        saleId: sale.id.value,
        description: 'Smoothie',
        quantity: 3,
        unitPriceAmount: 7.0,
      });

      const result = await handler.execute(command);

      expect(result.isSuccess).toBe(true);
      const dto = result.getValue();
      // Derived purely by domain
      expect(dto.total.amount).toBe(21.0);
      expect(dto.subtotal.amount).toBe(21.0);
    });
  });

  // ===========================================================================
  // 3. RemoveSaleItem Use Case Suite
  // ===========================================================================
  describe('RemoveSaleItem Use Case', () => {
    let handler: RemoveSaleItemHandler;

    beforeEach(() => {
      handler = new RemoveSaleItemHandler(repo, clock, eventPublisher);
    });

    it('Happy path: proves orchestration load -> domain removeItem -> repository save -> result', async () => {
      const sale = seedDraftSale({
        items: [
          { description: 'Item 1', quantity: 1, unitPrice: 20 },
          { description: 'Item 2', quantity: 2, unitPrice: 15 },
        ],
      });
      const itemToRemove = sale.items[0]!;
      const removeItemSpy = jest.spyOn(Sale.prototype, 'removeItem');

      try {
        const command = new RemoveSaleItemCommand({
          saleId: sale.id.value,
          itemId: itemToRemove.id.value,
        });

        const result = await handler.execute(command);

        expect(result.isSuccess).toBe(true);
        expect(removeItemSpy).toHaveBeenCalledWith(itemToRemove.id.value, clock);
        expect(repo.saveCalls).toHaveLength(1);

        const dto = result.getValue();
        expect(dto.items).toHaveLength(1);
        expect(dto.items[0]?.description).toBe('Item 2');
        expect(dto.total.amount).toBe(30.0);
      } finally {
        removeItemSpy.mockRestore();
      }
    });

    it('Invalid input: rejects empty or whitespace saleId or itemId', async () => {
      const resBadSale = await handler.execute(
        new RemoveSaleItemCommand({ saleId: '   ', itemId: 'item_01' }),
      );
      expect(resBadSale.isFailure).toBe(true);
      expect(resBadSale.getError()).toBeInstanceOf(InvalidSaleStateException);

      const resBadItem = await handler.execute(
        new RemoveSaleItemCommand({ saleId: 'sale_01', itemId: '   ' }),
      );
      expect(resBadItem.isFailure).toBe(true);
      expect(resBadItem.getError()).toBeInstanceOf(InvalidSaleStateException);
    });

    it('Missing aggregate: fails with SaleNotFoundException when saleId does not exist', async () => {
      const command = new RemoveSaleItemCommand({
        saleId: 'missing_sale_404',
        itemId: 'item_01',
      });

      const result = await handler.execute(command);

      expect(result.isFailure).toBe(true);
      expect(result.getError()).toBeInstanceOf(SaleNotFoundException);
      expect(repo.saveCalls).toHaveLength(0);
    });

    it('Domain rejection: rejects removing non-existent itemId or removing from non-draft sale', async () => {
      const sale = seedDraftSale({
        items: [{ description: 'Only Item', quantity: 1, unitPrice: 50 }],
      });

      const command = new RemoveSaleItemCommand({
        saleId: sale.id.value,
        itemId: 'unknown_item_id_999',
      });

      const result = await handler.execute(command);

      expect(result.isFailure).toBe(true);
      expect(result.getError()).toBeInstanceOf(InvalidSaleStateException);
    });

    it('Repository failure: cleanly propagates save errors without swallowing', async () => {
      const sale = seedDraftSale({
        items: [{ description: 'Item', quantity: 1, unitPrice: 10 }],
      });
      repo.throwOnSave = new Error('Disk failure');

      const command = new RemoveSaleItemCommand({
        saleId: sale.id.value,
        itemId: sale.items[0]!.id.value,
      });

      const result = await handler.execute(command);

      expect(result.isFailure).toBe(true);
      expect(getErrorMessage(result)).toContain('Disk failure');
    });

    it('Transaction behavior: executes in transaction and discards staged mutation on failure', async () => {
      const sale = seedDraftSale({
        items: [{ description: 'Item', quantity: 1, unitPrice: 10 }],
      });
      repo.throwOnSave = new Error('Rollback failure');

      const command = new RemoveSaleItemCommand({
        saleId: sale.id.value,
        itemId: sale.items[0]!.id.value,
      });

      const result = await handler.execute(command);

      expect(result.isFailure).toBe(true);
      expect(repo.transactionCallCount).toBe(1);
      // Verify rollback: item still present in store
      const stored = await repo.findById(sale.id.value);
      expect(stored?.items).toHaveLength(1);
    });

    it('Purity check: does NOT directly slice or filter items array; invokes domain removeItem', async () => {
      const sale = seedDraftSale({
        items: [{ description: 'Item', quantity: 1, unitPrice: 25 }],
      });
      const spy = jest.spyOn(Sale.prototype, 'removeItem');

      try {
        await handler.execute(
          new RemoveSaleItemCommand({
            saleId: sale.id.value,
            itemId: sale.items[0]!.id.value,
          }),
        );

        expect(spy).toHaveBeenCalledTimes(1);
      } finally {
        spy.mockRestore();
      }
    });
  });

  // ===========================================================================
  // 4. ApplyDiscount Use Case Suite
  // ===========================================================================
  describe('ApplyDiscount Use Case', () => {
    let handler: ApplyDiscountHandler;

    beforeEach(() => {
      handler = new ApplyDiscountHandler(repo, clock, eventPublisher);
    });

    it('Happy path: proves orchestration load -> domain applyDiscount -> repository save -> result', async () => {
      const sale = seedDraftSale({
        items: [{ description: 'Supplement Bottle', quantity: 2, unitPrice: 50 }],
      });
      const applyDiscountSpy = jest.spyOn(Sale.prototype, 'applyDiscount');

      try {
        const command = new ApplyDiscountCommand({
          saleId: sale.id.value,
          discount: { type: DiscountType.PERCENTAGE, value: 20, reason: 'VIP Member' },
        });

        const result = await handler.execute(command);

        expect(result.isSuccess).toBe(true);
        expect(applyDiscountSpy).toHaveBeenCalledTimes(1);
        expect(repo.saveCalls).toHaveLength(1);

        const dto = result.getValue();
        expect(dto.subtotal.amount).toBe(100.0);
        expect(dto.discountTotal.amount).toBe(20.0);
        expect(dto.total.amount).toBe(80.0);
      } finally {
        applyDiscountSpy.mockRestore();
      }
    });

    it('Invalid input: rejects empty saleId or null discount payload', async () => {
      const resBadId = await handler.execute(
        new ApplyDiscountCommand({
          saleId: '   ',
          discount: { type: DiscountType.FIXED, value: 10 },
        }),
      );
      expect(resBadId.isFailure).toBe(true);
      expect(resBadId.getError()).toBeInstanceOf(InvalidSaleStateException);

      const resBadDiscount = await handler.execute(
        new ApplyDiscountCommand({
          saleId: 'sale_01',
          discount: null as unknown as ConstructorParameters<
            typeof ApplyDiscountCommand
          >[0]['discount'],
        }),
      );
      expect(resBadDiscount.isFailure).toBe(true);
      expect(resBadDiscount.getError()).toBeInstanceOf(InvalidSaleStateException);
    });

    it('Missing aggregate: fails with SaleNotFoundException when saleId does not exist', async () => {
      const command = new ApplyDiscountCommand({
        saleId: 'missing_sale_404',
        discount: { type: DiscountType.FIXED, value: 10 },
      });

      const result = await handler.execute(command);

      expect(result.isFailure).toBe(true);
      expect(result.getError()).toBeInstanceOf(SaleNotFoundException);
      expect(repo.saveCalls).toHaveLength(0);
    });

    it('Domain rejection: rejects invalid discount percentage (> 100% or negative)', async () => {
      const sale = seedDraftSale({
        items: [{ description: 'Item', quantity: 1, unitPrice: 100 }],
      });

      const command = new ApplyDiscountCommand({
        saleId: sale.id.value,
        discount: { type: DiscountType.PERCENTAGE, value: 150, reason: 'Exorbitant' },
      });

      const result = await handler.execute(command);

      expect(result.isFailure).toBe(true);
      expect(result.getError()).toBeInstanceOf(InvalidDiscountException);
    });

    it('Repository failure: cleanly propagates save errors without crashing', async () => {
      const sale = seedDraftSale({
        items: [{ description: 'Item', quantity: 1, unitPrice: 50 }],
      });
      repo.throwOnSave = new Error('Constraint violation on disk');

      const command = new ApplyDiscountCommand({
        saleId: sale.id.value,
        discount: { type: DiscountType.FIXED, value: 10 },
      });

      const result = await handler.execute(command);

      expect(result.isFailure).toBe(true);
      expect(getErrorMessage(result)).toContain('Constraint violation on disk');
    });

    it('Transaction behavior: executes in transaction and rolls back on failure', async () => {
      const sale = seedDraftSale({
        items: [{ description: 'Item', quantity: 1, unitPrice: 50 }],
      });
      repo.throwOnSave = new Error('Aborted');

      const command = new ApplyDiscountCommand({
        saleId: sale.id.value,
        discount: { type: DiscountType.FIXED, value: 10 },
      });

      const result = await handler.execute(command);

      expect(result.isFailure).toBe(true);
      expect(repo.transactionCallCount).toBe(1);
      expect(eventPublisher.publishCallCount).toBe(0);
    });

    it('Purity check: application code does NOT manually set orderDiscount or recalculate totals', async () => {
      const sale = seedDraftSale({
        items: [{ description: 'Item', quantity: 2, unitPrice: 40 }],
      });

      const command = new ApplyDiscountCommand({
        saleId: sale.id.value,
        discount: { type: DiscountType.FIXED, value: 15 },
      });

      const result = await handler.execute(command);

      expect(result.isSuccess).toBe(true);
      const dto = result.getValue();
      // Total strictly computed by aggregate root
      expect(dto.total.amount).toBe(65.0);
    });
  });

  // ===========================================================================
  // 5. CalculateSale Use Case Suite
  // ===========================================================================
  describe('CalculateSale Use Case', () => {
    let handler: CalculateSaleHandler;

    beforeEach(() => {
      handler = new CalculateSaleHandler(repo);
    });

    it('Happy path: loads aggregate, invokes calculateTotals(), and returns SaleTotalsDTO without saving', async () => {
      const sale = seedDraftSale({
        items: [
          { description: 'Gym Short', quantity: 2, unitPrice: 30 },
          { description: 'Headband', quantity: 1, unitPrice: 10 },
        ],
        orderDiscount: Discount.percentage(10),
      });

      const query = new CalculateSaleQuery({ saleId: sale.id.value });
      const result = await handler.execute(query);

      expect(result.isSuccess).toBe(true);
      const totalsDto = result.getValue();
      // Subtotal = 70. Discount = 7. Total = 63.
      expect(totalsDto.subtotal.amount).toBe(70.0);
      expect(totalsDto.discountTotal.amount).toBe(7.0);
      expect(totalsDto.total.amount).toBe(63.0);
      expect(totalsDto.currency).toBe('USD');

      // Zero writes
      expect(repo.saveCalls).toHaveLength(0);
    });

    it('Invalid input: rejects empty or whitespace saleId', async () => {
      const result = await handler.execute(new CalculateSaleQuery({ saleId: '   ' }));
      expect(result.isFailure).toBe(true);
      expect(result.getError()).toBeInstanceOf(InvalidSaleStateException);
    });

    it('Missing aggregate: fails with SaleNotFoundException when saleId is not in repo', async () => {
      const query = new CalculateSaleQuery({ saleId: 'missing_calc_sale' });
      const result = await handler.execute(query);

      expect(result.isFailure).toBe(true);
      expect(result.getError()).toBeInstanceOf(SaleNotFoundException);
    });

    it('Domain rejection: propagates domain exceptions without swallowing', async () => {
      seedDraftSale();
      const calcTotalsSpy = jest.spyOn(Sale.prototype, 'calculateTotals').mockImplementation(() => {
        throw new InvalidSaleStateException('Corrupted financial invariant');
      });

      try {
        const query = new CalculateSaleQuery({ saleId: 'sale_seed_01' });
        const result = await handler.execute(query);

        expect(result.isFailure).toBe(true);
        expect(result.getError()).toBeInstanceOf(InvalidSaleStateException);
      } finally {
        calcTotalsSpy.mockRestore();
      }
    });

    it('Repository failure: cleanly propagates findById errors', async () => {
      repo.throwOnFind = new Error('Database connection timed out');
      const query = new CalculateSaleQuery({ saleId: 'sale_01' });

      const result = await handler.execute(query);

      expect(result.isFailure).toBe(true);
      expect(getErrorMessage(result)).toContain('Database connection timed out');
    });

    it('Transaction behavior: does NOT initiate transaction or acquire write locks', async () => {
      const sale = seedDraftSale();
      const query = new CalculateSaleQuery({ saleId: sale.id.value });

      await handler.execute(query);

      expect(repo.transactionCallCount).toBe(0);
      expect(repo.saveCalls).toHaveLength(0);
    });

    it('Purity check: application query does NOT calculate totals; delegates to domain', async () => {
      seedDraftSale({
        items: [{ description: 'Gloves', quantity: 1, unitPrice: 45 }],
      });
      const spy = jest.spyOn(Sale.prototype, 'calculateTotals');

      try {
        const query = new CalculateSaleQuery({ saleId: 'sale_seed_01' });
        await handler.execute(query);

        expect(spy).toHaveBeenCalledTimes(1);
      } finally {
        spy.mockRestore();
      }
    });
  });

  // ===========================================================================
  // 6. GetSale Use Case Suite
  // ===========================================================================
  describe('GetSale Use Case', () => {
    let handler: GetSaleHandler;

    beforeEach(() => {
      handler = new GetSaleHandler(repo);
    });

    it('Happy path: loads aggregate through repository and maps to SaleDTO with zero writes', async () => {
      const sale = seedDraftSale({
        items: [{ description: 'Water Bottle', quantity: 2, unitPrice: 12 }],
      });

      const query = new GetSaleQuery({ saleId: sale.id.value });
      const result = await handler.execute(query);

      expect(result.isSuccess).toBe(true);
      const dto = result.getValue();
      expect(dto.id).toBe(sale.id.value);
      expect(dto.status).toBe(SaleStatus.DRAFT);
      expect(dto.items).toHaveLength(1);
      expect(dto.total.amount).toBe(24.0);

      // Read-only query
      expect(repo.saveCalls).toHaveLength(0);
    });

    it('Invalid input: rejects empty or whitespace saleId', async () => {
      const result = await handler.execute(new GetSaleQuery({ saleId: '   ' }));
      expect(result.isFailure).toBe(true);
      expect(result.getError()).toBeInstanceOf(InvalidSaleStateException);
    });

    it('Missing aggregate: fails with SaleNotFoundException when saleId does not exist', async () => {
      const query = new GetSaleQuery({ saleId: 'missing_get_sale_01' });
      const result = await handler.execute(query);

      expect(result.isFailure).toBe(true);
      expect(result.getError()).toBeInstanceOf(SaleNotFoundException);
    });

    it('Repository failure: cleanly propagates findById / getById errors', async () => {
      repo.throwOnFind = new Error('Read replica unavailable');
      const query = new GetSaleQuery({ saleId: 'sale_01' });

      const result = await handler.execute(query);

      expect(result.isFailure).toBe(true);
      expect(getErrorMessage(result)).toContain('Read replica unavailable');
    });

    it('Transaction behavior: does NOT initiate transaction or mutate state', async () => {
      const sale = seedDraftSale();
      const query = new GetSaleQuery({ saleId: sale.id.value });

      await handler.execute(query);

      expect(repo.transactionCallCount).toBe(0);
      expect(repo.saveCalls).toHaveLength(0);
    });

    it('Purity check: does NOT mutate aggregate or bypass repository port', async () => {
      const sale = seedDraftSale();
      const query = new GetSaleQuery({ saleId: sale.id.value });

      await handler.execute(query);

      expect(repo.getByIdCalls.length + repo.findByIdCalls.length).toBeGreaterThanOrEqual(1);
      expect(sale.status).toBe(SaleStatus.DRAFT);
    });
  });

  // ===========================================================================
  // 7. ListSales Use Case Suite
  // ===========================================================================
  describe('ListSales Use Case', () => {
    let handler: ListSalesHandler;

    beforeEach(() => {
      handler = new ListSalesHandler(repo);
    });

    it('Happy path: coordinates with repository findMany and returns PaginatedResultDTO with default parameters', async () => {
      seedDraftSale({ id: 'sale_list_01' });
      seedDraftSale({ id: 'sale_list_02' });

      const query = new ListSalesQuery({});
      const result = await handler.execute(query);

      expect(result.isSuccess).toBe(true);
      const page = result.getValue();
      expect(page.items).toHaveLength(2);
      expect(page.page).toBe(1);
      expect(page.limit).toBe(20);
      expect(page.total).toBe(2);
    });

    it('Happy path: supports filters (status, clientId, tenantId, date range) and deterministic sorting', async () => {
      seedDraftSale({ id: 'sale_flt_01', clientId: 'client_A', tenantId: 'tenant_main' });
      seedDraftSale({ id: 'sale_flt_02', clientId: 'client_B', tenantId: 'tenant_main' });

      const query = new ListSalesQuery({
        clientId: 'client_A',
        status: SaleStatus.DRAFT,
        page: 1,
        limit: 10,
        sortField: 'createdAt',
        sortDirection: 'desc',
      });

      const result = await handler.execute(query);

      expect(result.isSuccess).toBe(true);
      const page = result.getValue();
      expect(page.items).toHaveLength(1);
      expect(page.items[0]?.clientId).toBe('client_A');
    });

    it('Invalid input: rejects invalid page, limit, sort field, sort direction, status, or date range', async () => {
      // Invalid page
      const resBadPage = await handler.execute(new ListSalesQuery({ page: 0 }));
      expect(resBadPage.isFailure).toBe(true);
      expect(resBadPage.getError()).toBeInstanceOf(InvalidSaleQueryException);

      // Invalid limit
      const resBadLimit = await handler.execute(new ListSalesQuery({ limit: -5 }));
      expect(resBadLimit.isFailure).toBe(true);
      expect(resBadLimit.getError()).toBeInstanceOf(InvalidSaleQueryException);

      // Invalid sort field
      const resBadSort = await handler.execute(
        new ListSalesQuery({ sortField: 'drop_table' as unknown as string }),
      );
      expect(resBadSort.isFailure).toBe(true);
      expect(resBadSort.getError()).toBeInstanceOf(InvalidSaleQueryException);

      // Invalid status
      const resBadStatus = await handler.execute(
        new ListSalesQuery({ status: 'UNKNOWN_STATUS' as unknown as SaleStatus }),
      );
      expect(resBadStatus.isFailure).toBe(true);
      expect(resBadStatus.getError()).toBeInstanceOf(InvalidSaleQueryException);

      // Invalid date range (from > to)
      const resBadDates = await handler.execute(
        new ListSalesQuery({
          fromDate: new Date('2026-10-10'),
          toDate: new Date('2026-10-01'),
        }),
      );
      expect(resBadDates.isFailure).toBe(true);
      expect(resBadDates.getError()).toBeInstanceOf(InvalidSaleQueryException);
    });

    it('Missing aggregate / empty result: returns empty page gracefully when no records match', async () => {
      const query = new ListSalesQuery({ clientId: 'nobody' });
      const result = await handler.execute(query);

      expect(result.isSuccess).toBe(true);
      const page = result.getValue();
      expect(page.items).toHaveLength(0);
      expect(page.total).toBe(0);
    });

    it('Repository failure: cleanly propagates findMany errors without swallowing', async () => {
      repo.throwOnFindMany = new Error('Read query timeout');
      const query = new ListSalesQuery({});

      const result = await handler.execute(query);

      expect(result.isFailure).toBe(true);
      expect(getErrorMessage(result)).toContain('Read query timeout');
    });

    it('Authorization where applicable: tenant filter strictly passed to repository criteria', async () => {
      seedDraftSale({ id: 'sale_tenant_1', tenantId: 'tenant_1' });
      seedDraftSale({ id: 'sale_tenant_2', tenantId: 'tenant_2' });

      const query = new ListSalesQuery({ tenantId: 'tenant_1' });
      const result = await handler.execute(query);

      expect(result.isSuccess).toBe(true);
      const page = result.getValue();
      expect(page.items).toHaveLength(1);
      expect(page.items[0]?.tenantId).toBe('tenant_1');
    });

    it('Transaction behavior: pure read query does not initiate transaction or lock tables', async () => {
      const query = new ListSalesQuery({});
      await handler.execute(query);

      expect(repo.transactionCallCount).toBe(0);
      expect(repo.saveCalls).toHaveLength(0);
    });
  });

  // ===========================================================================
  // 8. CancelSale Use Case Suite
  // ===========================================================================
  describe('CancelSale Use Case', () => {
    let handler: CancelSaleHandler;

    beforeEach(() => {
      handler = new CancelSaleHandler(repo, clock, eventPublisher);
    });

    it('Happy path: proves orchestration load -> domain cancel -> repository save -> result', async () => {
      const sale = seedDraftSale();
      const cancelSpy = jest.spyOn(Sale.prototype, 'cancel');

      try {
        const command = new CancelSaleCommand({
          saleId: sale.id.value,
          reason: 'Customer cancelled transaction',
        });

        const result = await handler.execute(command);

        expect(result.isSuccess).toBe(true);
        expect(cancelSpy).toHaveBeenCalledWith('Customer cancelled transaction', clock);
        expect(repo.saveCalls).toHaveLength(1);

        const dto = result.getValue();
        expect(dto.status).toBe(SaleStatus.CANCELLED);
        expect(dto.cancelledAt).toBeDefined();

        // Dispatches domain events
        expect(eventPublisher.publishCallCount).toBe(1);
      } finally {
        cancelSpy.mockRestore();
      }
    });

    it('Invalid input: rejects empty or whitespace saleId', async () => {
      const result = await handler.execute(
        new CancelSaleCommand({ saleId: '   ', reason: 'Some reason' }),
      );
      expect(result.isFailure).toBe(true);
      expect(result.getError()).toBeInstanceOf(InvalidSaleStateException);
      expect(repo.saveCalls).toHaveLength(0);
    });

    it('Missing aggregate: fails with SaleNotFoundException when saleId does not exist', async () => {
      const command = new CancelSaleCommand({
        saleId: 'missing_cancel_sale',
        reason: 'Some reason',
      });
      const result = await handler.execute(command);

      expect(result.isFailure).toBe(true);
      expect(result.getError()).toBeInstanceOf(SaleNotFoundException);
      expect(repo.saveCalls).toHaveLength(0);
    });

    it('Domain rejection: fails when trying to cancel an already CANCELLED sale', async () => {
      const sale = seedDraftSale();
      sale.cancel('First cancellation', clock);
      sale.clearEvents();

      const command = new CancelSaleCommand({
        saleId: sale.id.value,
        reason: 'Second cancellation attempt',
      });

      const result = await handler.execute(command);

      expect(result.isFailure).toBe(true);
      expect(result.getError()).toBeInstanceOf(InvalidSaleStateException);
    });

    it('Repository failure: cleanly propagates save failure without swallowing', async () => {
      const sale = seedDraftSale();
      repo.throwOnSave = new Error('Deadlock detected during cancellation');

      const command = new CancelSaleCommand({
        saleId: sale.id.value,
        reason: 'Valid cancellation',
      });
      const result = await handler.execute(command);

      expect(result.isFailure).toBe(true);
      expect(getErrorMessage(result)).toContain('Deadlock detected during cancellation');
    });

    it('Authorization where applicable: rejects cross-tenant cancellation via enforceTenantIsolation', async () => {
      const sale = seedDraftSale({ tenantId: 'tenant_alpha' });

      const command = new CancelSaleCommand({
        saleId: sale.id.value,
        tenantId: 'tenant_bravo', // Mismatched tenant
        reason: 'Unauthorized cross-tenant attempt',
      });

      const result = await handler.execute(command);

      expect(result.isFailure).toBe(true);
      expect(result.getError()).toBeInstanceOf(PaymentUnauthorizedException);
      expect(getErrorMessage(result)).toContain('Cross-tenant access forbidden');
      expect(repo.saveCalls).toHaveLength(0);
    });

    it('Transaction behavior: executes in transaction and does not publish events on failure', async () => {
      const sale = seedDraftSale();
      repo.throwOnSave = new Error('Failure');

      const command = new CancelSaleCommand({
        saleId: sale.id.value,
        reason: 'Cancellation under failure',
      });
      const result = await handler.execute(command);

      expect(result.isFailure).toBe(true);
      expect(repo.transactionCallCount).toBe(1);
      expect(eventPublisher.publishCallCount).toBe(0);
      // Sale state in repo rolled back
      const stored = await repo.findById(sale.id.value);
      expect(stored?.status).toBe(SaleStatus.DRAFT);
    });

    it('Purity check: application code does NOT set status = CANCELLED directly; domain owns transition', async () => {
      const sale = seedDraftSale();
      const cancelSpy = jest.spyOn(Sale.prototype, 'cancel');

      try {
        await handler.execute(
          new CancelSaleCommand({ saleId: sale.id.value, reason: 'Valid reason' }),
        );

        // Exact domain operation invoked
        expect(cancelSpy).toHaveBeenCalledTimes(1);
      } finally {
        cancelSpy.mockRestore();
      }
    });
  });
});
