import { AggregateRoot } from './shared/aggregate-root';
import { DomainEvent } from './shared/domain-event';
import { Clock, SystemClock } from './shared/clock';
import { SaleId } from './value-objects/sale-id.vo';
import { SaleItemId } from './value-objects/sale-item-id.vo';
import { SourceReference } from './value-objects/source-reference.vo';
import { Money } from './value-objects/money.vo';
import { Discount } from './value-objects/discount.vo';
import { SaleStatus } from './enums/sale-status.enum';
import { SaleItem, CreateSaleItemProps } from './entities/sale-item.entity';
import { EmptySaleException } from './exceptions/empty-sale.exception';
import { SaleAlreadyFinalizedException } from './exceptions/sale-already-finalized.exception';
import { InvalidSaleStateException } from './exceptions/invalid-sale-state.exception';
import {
  SaleCreatedEvent,
  SaleFinalizedEvent,
  SaleCancelledEvent,
  SaleItemAddedEvent,
  SaleItemRemovedEvent,
} from './events';

export interface CreateSaleProps {
  id?: SaleId;
  tenantId?: string;
  clientId?: string;
  currency?: string;
  source: SourceReference;
  items?: CreateSaleItemProps[];
  orderDiscount?: Discount;
}

export interface ReconstituteSaleProps {
  id: SaleId;
  tenantId?: string;
  clientId?: string;
  status: SaleStatus;
  currency: string;
  source: SourceReference;
  items: SaleItem[];
  orderDiscount?: Discount | null;
  subtotal: Money;
  discountTotal: Money;
  total: Money;
  version: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface AddSaleItemProps {
  id?: SaleItemId;
  source: SourceReference;
  description: string;
  skuOrCode?: string | null;
  quantity: number;
  unitPrice: Money;
  discount?: Discount | null;
}

/**
 * Sale is the Aggregate Root representing the commercial transaction agreement.
 * Protects commercial invariants, enforces single currency homogeneity, recalculates
 * deterministic totals via cent-guarded integer arithmetic, and guarantees progressive immutability.
 */
export class Sale implements AggregateRoot<SaleId> {
  private readonly _id: SaleId;
  private readonly _tenantId?: string;
  private readonly _clientId?: string;
  private _status: SaleStatus;
  private readonly _currency: string;
  private readonly _source: SourceReference;
  private _items: SaleItem[];
  private _orderDiscount: Discount | null;
  private _subtotal: Money;
  private _discountTotal: Money;
  private _total: Money;
  private _version: number;
  private readonly _createdAt: Date;
  private _updatedAt: Date;
  private _uncommittedEvents: DomainEvent[] = [];

  private constructor(props: ReconstituteSaleProps) {
    this._id = props.id;
    this._tenantId = props.tenantId ? props.tenantId.trim() : undefined;
    this._clientId = props.clientId ? props.clientId.trim() : undefined;
    this._status = props.status;
    this._currency = props.currency;
    this._source = props.source;
    this._items = [...props.items];
    this._orderDiscount = props.orderDiscount ?? null;
    this._subtotal = props.subtotal;
    this._discountTotal = props.discountTotal;
    this._total = props.total;
    this._version = props.version;
    this._createdAt = new Date(props.createdAt.getTime());
    this._updatedAt = new Date(props.updatedAt.getTime());
  }

  /**
   * Factory method to create a new Sale aggregate root in DRAFT status.
   */
  public static create(props: CreateSaleProps, clock: Clock = new SystemClock()): Sale {
    if (!props.source) {
      throw new InvalidSaleStateException('SourceReference is required to create a Sale.');
    }

    const saleId = props.id ?? SaleId.create();
    const currency = (props.currency ?? 'USD').trim().toUpperCase();
    const now = clock.now();

    const sale = new Sale({
      id: saleId,
      tenantId: props.tenantId,
      clientId: props.clientId,
      status: SaleStatus.DRAFT,
      currency,
      source: props.source,
      items: [],
      orderDiscount: props.orderDiscount ?? null,
      subtotal: Money.zero(currency),
      discountTotal: Money.zero(currency),
      total: Money.zero(currency),
      version: 1,
      createdAt: now,
      updatedAt: now,
    });

    if (props.items && props.items.length > 0) {
      for (const itemProp of props.items) {
        sale.addItem(itemProp, clock);
      }
    }

    sale.recordEvent(
      new SaleCreatedEvent(
        saleId.value,
        1,
        {
          saleId: saleId.value,
          tenantId: sale.tenantId,
          clientId: sale.clientId,
          currency: sale.currency,
          status: sale.status,
        },
        now,
      ),
    );

    return sale;
  }

  /**
   * Reconstitutes an existing Sale aggregate from persistence without emitting domain events.
   */
  public static reconstitute(props: ReconstituteSaleProps): Sale {
    return new Sale(props);
  }

  // --- Getters ---

  public get id(): SaleId {
    return this._id;
  }

  public get tenantId(): string | undefined {
    return this._tenantId;
  }

  public get clientId(): string | undefined {
    return this._clientId;
  }

  public get status(): SaleStatus {
    return this._status;
  }

  public get currency(): string {
    return this._currency;
  }

  public get source(): SourceReference {
    return this._source;
  }

  public get items(): ReadonlyArray<SaleItem> {
    return Object.freeze([...this._items]);
  }

  public get orderDiscount(): Discount | null {
    return this._orderDiscount;
  }

  public get subtotal(): Money {
    return this._subtotal;
  }

  public get discountTotal(): Money {
    return this._discountTotal;
  }

  public get total(): Money {
    return this._total;
  }

  public get version(): number {
    return this._version;
  }

  public get createdAt(): Date {
    return new Date(this._createdAt.getTime());
  }

  public get updatedAt(): Date {
    return new Date(this._updatedAt.getTime());
  }

  // --- Aggregate Root Contract ---

  public getUncommittedEvents(): ReadonlyArray<DomainEvent> {
    return Object.freeze([...this._uncommittedEvents]);
  }

  public clearEvents(): void {
    this._uncommittedEvents = [];
  }

  // --- Business Invariant & Cart Mutation Methods ---

  /**
   * Adds a new line item to the Sale. Permitted only while in DRAFT status.
   * Validates single currency homogeneity across items and the order.
   */
  public addItem(props: AddSaleItemProps, clock: Clock = new SystemClock()): SaleItem {
    this.assertDraftState();

    if (props.unitPrice.currency !== this._currency) {
      throw new InvalidSaleStateException(
        `Cannot add item with currency '${props.unitPrice.currency}' to a Sale with currency '${this._currency}'.`,
      );
    }

    const item = SaleItem.create(props);
    this._items.push(item);
    this.recalculateTotals();

    const now = clock.now();
    this._updatedAt = now;

    this.recordEvent(
      new SaleItemAddedEvent(
        this._id.value,
        this._version,
        {
          saleId: this._id.value,
          itemId: item.id.value,
          sourceType: item.source.sourceType,
          sourceId: item.source.sourceId,
          description: item.description,
          quantity: item.quantity,
          unitPrice: item.unitPrice.amount,
          currency: this._currency,
        },
        now,
      ),
    );

    return item;
  }

  /**
   * Updates quantity of an existing line item. Permitted only while in DRAFT status.
   */
  public updateItemQuantity(
    itemId: SaleItemId | string,
    newQuantity: number,
    clock: Clock = new SystemClock(),
  ): void {
    this.assertDraftState();

    const item = this.findItemOrThrow(itemId);
    item.updateQuantity(newQuantity);
    this.recalculateTotals();
    this._updatedAt = clock.now();
  }

  /**
   * Removes a line item from the Sale. Permitted only while in DRAFT status.
   */
  public removeItem(itemId: SaleItemId | string, clock: Clock = new SystemClock()): void {
    this.assertDraftState();

    const idStr = typeof itemId === 'string' ? itemId : itemId.value;
    const index = this._items.findIndex((item) => item.id.value === idStr);
    if (index === -1) {
      throw new InvalidSaleStateException(
        `SaleItem with ID '${idStr}' not found in Sale '${this._id.value}'.`,
      );
    }

    this._items.splice(index, 1);
    this.recalculateTotals();

    const now = clock.now();
    this._updatedAt = now;

    this.recordEvent(
      new SaleItemRemovedEvent(
        this._id.value,
        this._version,
        {
          saleId: this._id.value,
          itemId: idStr,
        },
        now,
      ),
    );
  }

  /**
   * Applies an order-level discount. Permitted only while in DRAFT status.
   */
  public applyOrderDiscount(discount: Discount, clock: Clock = new SystemClock()): void {
    this.assertDraftState();
    if (!discount) {
      throw new InvalidSaleStateException('Discount cannot be null or undefined.');
    }
    this._orderDiscount = discount;
    this.recalculateTotals();
    this._updatedAt = clock.now();
  }

  /**
   * Removes order-level discount. Permitted only while in DRAFT status.
   */
  public removeOrderDiscount(clock: Clock = new SystemClock()): void {
    this.assertDraftState();
    this._orderDiscount = null;
    this.recalculateTotals();
    this._updatedAt = clock.now();
  }

  /**
   * Finalizes the order, transitioning from DRAFT to PENDING_PAYMENT.
   * Freezes commercial terms permanently against further item and discount adjustments.
   */
  public finalize(clock: Clock = new SystemClock()): void {
    this.assertDraftState();

    if (this._items.length === 0) {
      throw new EmptySaleException(
        `Sale '${this._id.value}' cannot be finalized with zero line items.`,
      );
    }

    const now = clock.now();
    this._status = SaleStatus.PENDING_PAYMENT;
    this._version++;
    this._updatedAt = now;

    this.recordEvent(
      new SaleFinalizedEvent(
        this._id.value,
        this._version,
        {
          saleId: this._id.value,
          totalAmount: this._total.amount,
          currency: this._currency,
          itemCount: this._items.length,
        },
        now,
      ),
    );
  }

  /**
   * Transitions status to PAID upon full settlement confirmation.
   */
  public markPaid(clock: Clock = new SystemClock()): void {
    if (this._status !== SaleStatus.PENDING_PAYMENT && this._status !== SaleStatus.PARTIALLY_PAID) {
      throw new InvalidSaleStateException(
        `Sale cannot transition to PAID from current state '${this._status}'. Must be PENDING_PAYMENT or PARTIALLY_PAID.`,
      );
    }

    const now = clock.now();
    this._status = SaleStatus.PAID;
    this._version++;
    this._updatedAt = now;
  }

  /**
   * Transitions status to PARTIALLY_PAID upon receiving a partial payment tender.
   */
  public markPartiallyPaid(clock: Clock = new SystemClock()): void {
    if (this._status !== SaleStatus.PENDING_PAYMENT) {
      throw new InvalidSaleStateException(
        `Sale cannot transition to PARTIALLY_PAID from current state '${this._status}'. Must be PENDING_PAYMENT.`,
      );
    }

    const now = clock.now();
    this._status = SaleStatus.PARTIALLY_PAID;
    this._version++;
    this._updatedAt = now;
  }

  /**
   * Cancels the Sale transaction. Permitted only from DRAFT or PENDING_PAYMENT.
   */
  public cancel(reason?: string, clock: Clock = new SystemClock()): void {
    if (this._status !== SaleStatus.DRAFT && this._status !== SaleStatus.PENDING_PAYMENT) {
      throw new InvalidSaleStateException(
        `Sale in status '${this._status}' cannot be cancelled. Only DRAFT or PENDING_PAYMENT can be cancelled.`,
      );
    }

    const now = clock.now();
    this._status = SaleStatus.CANCELLED;
    this._version++;
    this._updatedAt = now;

    this.recordEvent(
      new SaleCancelledEvent(
        this._id.value,
        this._version,
        {
          saleId: this._id.value,
          reason: reason ? reason.trim() : undefined,
        },
        now,
      ),
    );
  }

  // --- Internal Invariant Helpers ---

  private assertDraftState(): void {
    if (this._status !== SaleStatus.DRAFT) {
      throw new SaleAlreadyFinalizedException(
        `Cannot mutate Sale '${this._id.value}' in status '${this._status}'. Commercial terms freeze upon leaving DRAFT.`,
      );
    }
  }

  private findItemOrThrow(itemId: SaleItemId | string): SaleItem {
    const idStr = typeof itemId === 'string' ? itemId : itemId.value;
    const item = this._items.find((i) => i.id.value === idStr);
    if (!item) {
      throw new InvalidSaleStateException(
        `SaleItem with ID '${idStr}' not found in Sale '${this._id.value}'.`,
      );
    }
    return item;
  }

  /**
   * Recalculates all order totals according to the 13 exact reconciliation formulas:
   * 1. Subtotal = sum of lineSubtotals
   * 2. Line Discounts = sum of lineDiscountTotals
   * 3. Net Pre-Order Discount = Subtotal - Line Discounts
   * 4. Order Discount = orderDiscount.calculateReduction(Net Pre-Order Discount)
   * 5. Discount Total = Line Discounts + Order Discount
   * 6. Total = Subtotal - Discount Total (guaranteed >= 0.00)
   */
  private recalculateTotals(): void {
    let subtotal = Money.zero(this._currency);
    let totalLineDiscounts = Money.zero(this._currency);

    for (const item of this._items) {
      subtotal = subtotal.add(item.lineSubtotal);
      totalLineDiscounts = totalLineDiscounts.add(item.lineDiscountTotal);
    }

    const netPreOrderDisc = subtotal.subtract(totalLineDiscounts);

    const orderDiscountAmount = this._orderDiscount
      ? this._orderDiscount.calculateReduction(netPreOrderDisc)
      : Money.zero(this._currency);

    const discountTotal = totalLineDiscounts.add(orderDiscountAmount);
    const finalTotal = subtotal.subtract(discountTotal);

    this._subtotal = subtotal;
    this._discountTotal = discountTotal;
    this._total = finalTotal;
  }

  private recordEvent(event: DomainEvent): void {
    this._uncommittedEvents.push(event);
  }
}
