import {
  Sale,
  SaleId,
  SourceType,
  SaleStatus,
  SaleRepositoryInterface,
  EmptySaleException,
  SaleAlreadyFinalizedException,
} from '../../../index';
import { DomainEvent } from '../../domain/shared/domain-event';
import {
  CreateSaleHandler,
  AddSaleItemHandler,
  UpdateSaleItemQuantityHandler,
  RemoveSaleItemHandler,
  ApplyItemDiscountHandler,
  RemoveItemDiscountHandler,
  ApplyOrderDiscountHandler,
  RemoveOrderDiscountHandler,
  FinalizeSaleHandler,
} from '../handlers';
import {
  CreateSaleCommand,
  AddSaleItemCommand,
  UpdateSaleItemQuantityCommand,
  RemoveSaleItemCommand,
  ApplyItemDiscountCommand,
  RemoveItemDiscountCommand,
  ApplyOrderDiscountCommand,
  RemoveOrderDiscountCommand,
  FinalizeSaleCommand,
} from '../commands';
import { GetSaleByIdQuery, GetSaleByIdHandler } from '../queries';
import { SalesEventPublisherPort } from '../ports';
import { Clock } from '../../../sales/domain/shared/clock';

class TestClock implements Clock {
  constructor(private currentTime: Date = new Date('2026-09-18T12:00:00.000Z')) {}

  now(): Date {
    return new Date(this.currentTime.getTime());
  }

  advance(ms: number): void {
    this.currentTime = new Date(this.currentTime.getTime() + ms);
  }
}

class InMemoryReconstitutingSaleRepository implements SaleRepositoryInterface {
  private readonly store = new Map<string, Sale>();

  async findById(id: SaleId | string): Promise<Sale | null> {
    const key = typeof id === 'string' ? id.trim() : id.value;
    const sale = this.store.get(key);
    if (!sale) {
      return null;
    }

    // Reconstitute from internal state to strictly verify the monetary reconciliation invariant
    return Sale.reconstitute({
      id: sale.id,
      tenantId: sale.tenantId,
      clientId: sale.clientId,
      status: sale.status,
      currency: sale.currency,
      source: sale.source,
      items: [...sale.items],
      orderDiscount: sale.orderDiscount,
      subtotal: sale.subtotal,
      discountTotal: sale.discountTotal,
      total: sale.total,
      version: sale.version,
      createdAt: sale.createdAt,
      updatedAt: sale.updatedAt,
      completedAt: sale.completedAt,
      cancelledAt: sale.cancelledAt,
      cancellationReason: sale.cancellationReason,
      refundedAt: sale.refundedAt,
    });
  }

  async save(sale: Sale): Promise<void> {
    // Also verify that what we are saving reconciles when reconstituted
    const reconciled = Sale.reconstitute({
      id: sale.id,
      tenantId: sale.tenantId,
      clientId: sale.clientId,
      status: sale.status,
      currency: sale.currency,
      source: sale.source,
      items: [...sale.items],
      orderDiscount: sale.orderDiscount,
      subtotal: sale.subtotal,
      discountTotal: sale.discountTotal,
      total: sale.total,
      version: sale.version,
      createdAt: sale.createdAt,
      updatedAt: sale.updatedAt,
      completedAt: sale.completedAt,
      cancelledAt: sale.cancelledAt,
      cancellationReason: sale.cancellationReason,
      refundedAt: sale.refundedAt,
    });
    this.store.set(sale.id.value, reconciled);
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

describe('Sales Application Layer Deterministic Totals Integration', () => {
  let repository: InMemoryReconstitutingSaleRepository;
  let eventPublisher: MockSalesEventPublisher;
  let clock: TestClock;

  let createSaleHandler: CreateSaleHandler;
  let addSaleItemHandler: AddSaleItemHandler;
  let updateQuantityHandler: UpdateSaleItemQuantityHandler;
  let removeSaleItemHandler: RemoveSaleItemHandler;
  let applyItemDiscountHandler: ApplyItemDiscountHandler;
  let removeItemDiscountHandler: RemoveItemDiscountHandler;
  let applyOrderDiscountHandler: ApplyOrderDiscountHandler;
  let removeOrderDiscountHandler: RemoveOrderDiscountHandler;
  let finalizeSaleHandler: FinalizeSaleHandler;
  let getSaleByIdHandler: GetSaleByIdHandler;

  beforeEach(() => {
    repository = new InMemoryReconstitutingSaleRepository();
    eventPublisher = new MockSalesEventPublisher();
    clock = new TestClock();

    createSaleHandler = new CreateSaleHandler(repository, clock, eventPublisher);
    addSaleItemHandler = new AddSaleItemHandler(repository, clock, eventPublisher);
    updateQuantityHandler = new UpdateSaleItemQuantityHandler(repository, clock, eventPublisher);
    removeSaleItemHandler = new RemoveSaleItemHandler(repository, clock, eventPublisher);
    applyItemDiscountHandler = new ApplyItemDiscountHandler(repository, clock, eventPublisher);
    removeItemDiscountHandler = new RemoveItemDiscountHandler(repository, clock, eventPublisher);
    applyOrderDiscountHandler = new ApplyOrderDiscountHandler(repository, clock, eventPublisher);
    removeOrderDiscountHandler = new RemoveOrderDiscountHandler(repository, clock, eventPublisher);
    finalizeSaleHandler = new FinalizeSaleHandler(repository, clock, eventPublisher);
    getSaleByIdHandler = new GetSaleByIdHandler(repository);
  });

  describe('1. Sale Creation Workflow', () => {
    it('creates a draft sale with zero initial totals when no items are provided', async () => {
      const command = new CreateSaleCommand({
        currency: 'USD',
        clientId: 'client_01',
        source: {
          sourceType: SourceType.CUSTOM_SERVICE,
          sourceId: 'pos_register_1',
        },
      });

      const result = await createSaleHandler.execute(command);

      expect(result.isSuccess).toBe(true);
      const saleDTO = result.getValue();
      expect(saleDTO.status).toBe(SaleStatus.DRAFT);
      expect(saleDTO.subtotal.cents).toBe(0);
      expect(saleDTO.subtotal.amount).toBe(0);
      expect(saleDTO.discountTotal.cents).toBe(0);
      expect(saleDTO.total.cents).toBe(0);
      expect(saleDTO.itemCount).toBe(0);
      expect(saleDTO.items).toEqual([]);

      // Verify event was published
      expect(eventPublisher.publishedEvents).toHaveLength(1);
      expect(eventPublisher.publishedEvents[0]!.eventType).toBe('SaleCreated');

      // Verify persistence and reconstitution
      const persisted = await repository.findById(saleDTO.id);
      expect(persisted).not.toBeNull();
      expect(persisted!.subtotal.cents).toBe(0);
      expect(persisted!.total.cents).toBe(0);
    });

    it('creates a draft sale with initial items and calculates deterministic totals in domain', async () => {
      const command = new CreateSaleCommand({
        currency: 'USD',
        clientId: 'client_02',
        source: {
          sourceType: SourceType.INVENTORY_ITEM,
          sourceId: 'catalog_root',
        },
        items: [
          {
            description: 'Protein Shake',
            quantity: 2,
            unitPriceAmount: 15.5,
          },
          {
            description: 'Towel Service',
            quantity: 1,
            unitPriceAmount: 5.0,
            discount: {
              type: 'PERCENTAGE',
              value: 20, // 20% of 5.00 = 1.00
              reason: 'Member Concession',
            },
          },
        ],
      });

      const result = await createSaleHandler.execute(command);
      expect(result.isSuccess).toBe(true);
      const dto = result.getValue();

      // Item 1: 2 * 15.50 = 31.00 (cents: 3100)
      // Item 2: 1 * 5.00 = 5.00 (cents: 500), disc = 1.00 (cents: 100), net = 4.00 (cents: 400)
      // Subtotal = 36.00 (cents: 3600)
      // DiscountTotal = 1.00 (cents: 100)
      // Total = 35.00 (cents: 3500)
      expect(dto.subtotal.cents).toBe(3600);
      expect(dto.subtotal.amount).toBe(36.0);
      expect(dto.discountTotal.cents).toBe(100);
      expect(dto.discountTotal.amount).toBe(1.0);
      expect(dto.total.cents).toBe(3500);
      expect(dto.total.amount).toBe(35.0);

      // Verify persisted state reconciles exactly
      const persisted = await repository.findById(dto.id);
      expect(persisted!.subtotal.cents).toBe(3600);
      expect(persisted!.discountTotal.cents).toBe(100);
      expect(persisted!.total.cents).toBe(3500);
    });
  });

  describe('2. AddSaleItem Workflow & Lifecycle Recalculation', () => {
    it('adds items sequentially, recalculating subtotal and total without stale numbers', async () => {
      // 1. Create sale
      const createRes = await createSaleHandler.execute(
        new CreateSaleCommand({
          currency: 'USD',
          source: { sourceType: SourceType.INVENTORY_ITEM, sourceId: 'pos_1' },
        }),
      );
      const saleId = createRes.getValue().id;
      eventPublisher.clear();

      // 2. Add first item: 3 units @ $25.00 = $75.00
      const addRes1 = await addSaleItemHandler.execute(
        new AddSaleItemCommand({
          saleId,
          source: { sourceType: SourceType.INVENTORY_ITEM, sourceId: 'inv_item_1' },
          description: 'Gym Hoodie',
          quantity: 3,
          unitPriceAmount: 25.0,
        }),
      );
      expect(addRes1.isSuccess).toBe(true);
      const dto1 = addRes1.getValue();
      expect(dto1.itemCount).toBe(1);
      expect(dto1.subtotal.cents).toBe(7500);
      expect(dto1.discountTotal.cents).toBe(0);
      expect(dto1.total.cents).toBe(7500);

      expect(eventPublisher.publishedEvents).toHaveLength(1);
      expect(eventPublisher.publishedEvents[0]!.eventType).toBe('SaleItemAdded');
      eventPublisher.clear();

      // 3. Add second item with discount: 2 units @ $12.50 = $25.00 with 10% discount = $2.50
      const addRes2 = await addSaleItemHandler.execute(
        new AddSaleItemCommand({
          saleId,
          source: { sourceType: SourceType.INVENTORY_ITEM, sourceId: 'inv_item_2' },
          description: 'Energy Drink 6-Pack',
          quantity: 2,
          unitPriceAmount: 12.5,
          discount: {
            type: 'PERCENTAGE',
            value: 10,
            reason: 'Happy Hour',
          },
        }),
      );
      expect(addRes2.isSuccess).toBe(true);
      const dto2 = addRes2.getValue();
      expect(dto2.itemCount).toBe(2);
      expect(dto2.subtotal.cents).toBe(10000); // 75.00 + 25.00 = 100.00
      expect(dto2.discountTotal.cents).toBe(250); // 2.50
      expect(dto2.total.cents).toBe(9750); // 97.50

      // Verify repository reload matches exactly
      const reloaded = await getSaleByIdHandler.execute(new GetSaleByIdQuery({ saleId }));
      expect(reloaded.getValue().subtotal.cents).toBe(10000);
      expect(reloaded.getValue().total.cents).toBe(9750);
    });
  });

  describe('3. UpdateSaleItemQuantity Workflow', () => {
    it('immediately updates line and parent totals when quantity changes', async () => {
      const createRes = await createSaleHandler.execute(
        new CreateSaleCommand({
          currency: 'USD',
          source: { sourceType: SourceType.INVENTORY_ITEM, sourceId: 'pos_1' },
          items: [
            {
              description: 'Protein Tub',
              quantity: 4,
              unitPriceAmount: 30.0, // 4 * 30 = 120.00
            },
          ],
        }),
      );
      const saleId = createRes.getValue().id;
      const itemId = createRes.getValue().items[0]!.id;

      // Initial verify
      expect(createRes.getValue().total.cents).toBe(12000);

      // Change quantity from 4 to 2
      const updateRes = await updateQuantityHandler.execute(
        new UpdateSaleItemQuantityCommand({
          saleId,
          itemId,
          newQuantity: 2,
        }),
      );

      expect(updateRes.isSuccess).toBe(true);
      const updatedDto = updateRes.getValue();
      expect(updatedDto.items[0]!.quantity).toBe(2);
      expect(updatedDto.items[0]!.subtotal.cents).toBe(6000); // 2 * 30 = 60.00
      expect(updatedDto.subtotal.cents).toBe(6000);
      expect(updatedDto.total.cents).toBe(6000);

      // Verify persisted snapshot leaves zero stale totals
      const persisted = await repository.findById(saleId);
      expect(persisted!.subtotal.cents).toBe(6000);
      expect(persisted!.total.cents).toBe(6000);
    });
  });

  describe('4. Line Item and Order Discount Application & Removal', () => {
    it('applies and removes line discounts and order discounts with exact composite precision', async () => {
      // 1. Create sale with 1 item: 1 unit @ $100.00
      const createRes = await createSaleHandler.execute(
        new CreateSaleCommand({
          currency: 'USD',
          source: { sourceType: SourceType.INVENTORY_ITEM, sourceId: 'pos_1' },
          items: [
            {
              description: 'Annual Locker Rental',
              quantity: 1,
              unitPriceAmount: 100.0,
            },
          ],
        }),
      );
      const saleId = createRes.getValue().id;
      const itemId = createRes.getValue().items[0]!.id;

      // 2. Apply line discount: $15.00 fixed
      const applyLineRes = await applyItemDiscountHandler.execute(
        new ApplyItemDiscountCommand({
          saleId,
          itemId,
          discount: {
            type: 'FIXED',
            value: 15.0,
            reason: 'Loyalty Reward',
          },
        }),
      );
      expect(applyLineRes.isSuccess).toBe(true);
      expect(applyLineRes.getValue().subtotal.cents).toBe(10000);
      expect(applyLineRes.getValue().discountTotal.cents).toBe(1500);
      expect(applyLineRes.getValue().total.cents).toBe(8500);

      // 3. Apply order discount: 10% on remaining net ($85.00) = $8.50
      const applyOrderRes = await applyOrderDiscountHandler.execute(
        new ApplyOrderDiscountCommand({
          saleId,
          discount: {
            type: 'PERCENTAGE',
            value: 10,
            reason: 'VIP Checkout 10%',
          },
        }),
      );
      expect(applyOrderRes.isSuccess).toBe(true);
      const withOrderDisc = applyOrderRes.getValue();
      // Line discount = 15.00, order discount = 8.50 -> discountTotal = 23.50 (cents: 2350)
      // Total = 100.00 - 23.50 = 76.50 (cents: 7650)
      expect(withOrderDisc.subtotal.cents).toBe(10000);
      expect(withOrderDisc.discountTotal.cents).toBe(2350);
      expect(withOrderDisc.total.cents).toBe(7650);

      // 4. Remove order discount
      const removeOrderRes = await removeOrderDiscountHandler.execute(
        new RemoveOrderDiscountCommand({ saleId }),
      );
      expect(removeOrderRes.isSuccess).toBe(true);
      expect(removeOrderRes.getValue().discountTotal.cents).toBe(1500);
      expect(removeOrderRes.getValue().total.cents).toBe(8500);

      // 5. Remove line discount
      const removeLineRes = await removeItemDiscountHandler.execute(
        new RemoveItemDiscountCommand({ saleId, itemId }),
      );
      expect(removeLineRes.isSuccess).toBe(true);
      expect(removeLineRes.getValue().discountTotal.cents).toBe(0);
      expect(removeLineRes.getValue().total.cents).toBe(10000);
    });
  });

  describe('5. RemoveSaleItem Workflow', () => {
    it('removes an item and updates totals deterministically', async () => {
      const createRes = await createSaleHandler.execute(
        new CreateSaleCommand({
          currency: 'USD',
          source: { sourceType: SourceType.INVENTORY_ITEM, sourceId: 'pos_1' },
          items: [
            { description: 'Item 1', quantity: 1, unitPriceAmount: 40.0 },
            { description: 'Item 2', quantity: 1, unitPriceAmount: 60.0 },
          ],
        }),
      );
      const saleId = createRes.getValue().id;
      const item1Id = createRes.getValue().items[0]!.id;

      expect(createRes.getValue().total.cents).toBe(10000);

      // Remove Item 1
      const removeRes = await removeSaleItemHandler.execute(
        new RemoveSaleItemCommand({ saleId, itemId: item1Id }),
      );
      expect(removeRes.isSuccess).toBe(true);
      const dto = removeRes.getValue();
      expect(dto.itemCount).toBe(1);
      expect(dto.subtotal.cents).toBe(6000);
      expect(dto.total.cents).toBe(6000);

      // Verify event was recorded
      expect(eventPublisher.publishedEvents.some((e) => e.eventType === 'SaleItemRemoved')).toBe(
        true,
      );
    });
  });

  describe('6. FinalizeSale Workflow & Commercial Immutability', () => {
    it('finalizes a sale with items, freezes commercial terms, and forbids further mutations', async () => {
      const createRes = await createSaleHandler.execute(
        new CreateSaleCommand({
          currency: 'USD',
          source: { sourceType: SourceType.INVENTORY_ITEM, sourceId: 'pos_1' },
          items: [{ description: 'Gym Membership Pass', quantity: 1, unitPriceAmount: 50.0 }],
        }),
      );
      const saleId = createRes.getValue().id;
      const itemId = createRes.getValue().items[0]!.id;

      // Finalize
      const finalizeRes = await finalizeSaleHandler.execute(new FinalizeSaleCommand({ saleId }));
      expect(finalizeRes.isSuccess).toBe(true);
      const finalizedDTO = finalizeRes.getValue();
      expect(finalizedDTO.status).toBe(SaleStatus.PENDING_PAYMENT);

      // Attempting to add an item must fail and reject
      const addRes = await addSaleItemHandler.execute(
        new AddSaleItemCommand({
          saleId,
          source: { sourceType: SourceType.INVENTORY_ITEM, sourceId: 'extra_1' },
          description: 'Water Bottle',
          quantity: 1,
          unitPriceAmount: 3.0,
        }),
      );
      expect(addRes.isFailure).toBe(true);
      expect(addRes.getError()).toBeInstanceOf(SaleAlreadyFinalizedException);

      // Attempting to update item quantity must fail
      const updateRes = await updateQuantityHandler.execute(
        new UpdateSaleItemQuantityCommand({
          saleId,
          itemId,
          newQuantity: 5,
        }),
      );
      expect(updateRes.isFailure).toBe(true);
      expect(updateRes.getError()).toBeInstanceOf(SaleAlreadyFinalizedException);

      // Attempting to apply discount must fail
      const discRes = await applyOrderDiscountHandler.execute(
        new ApplyOrderDiscountCommand({
          saleId,
          discount: { type: 'PERCENTAGE', value: 10 },
        }),
      );
      expect(discRes.isFailure).toBe(true);
      expect(discRes.getError()).toBeInstanceOf(SaleAlreadyFinalizedException);
    });

    it('fails to finalize an empty sale, upholding the EMPTY_SALE invariant', async () => {
      const createRes = await createSaleHandler.execute(
        new CreateSaleCommand({
          currency: 'USD',
          source: { sourceType: SourceType.CUSTOM_SERVICE, sourceId: 'pos_1' },
        }),
      );
      const saleId = createRes.getValue().id;

      const finalizeRes = await finalizeSaleHandler.execute(new FinalizeSaleCommand({ saleId }));
      expect(finalizeRes.isFailure).toBe(true);
      expect(finalizeRes.getError()).toBeInstanceOf(EmptySaleException);
    });
  });

  describe('7. Error Handling & Guardrails', () => {
    it('returns a failed result when sale ID is empty or not found', async () => {
      const resEmpty = await getSaleByIdHandler.execute(new GetSaleByIdQuery({ saleId: '' }));
      expect(resEmpty.isFailure).toBe(true);
      const errEmpty = resEmpty.getError();
      const emptyMsg = errEmpty instanceof Error ? errEmpty.message : String(errEmpty);
      expect(emptyMsg).toContain('cannot be empty');

      const resNotFound = await getSaleByIdHandler.execute(
        new GetSaleByIdQuery({ saleId: 'non_existent_id' }),
      );
      expect(resNotFound.isFailure).toBe(true);
      const errNotFound = resNotFound.getError();
      const notFoundMsg = errNotFound instanceof Error ? errNotFound.message : String(errNotFound);
      expect(notFoundMsg).toContain('was not found');
    });
  });
});
