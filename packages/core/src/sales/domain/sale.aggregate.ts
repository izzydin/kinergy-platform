import { AggregateRoot } from './shared/aggregate-root';
import { DomainEvent } from './shared/domain-event';
import { Clock, SystemClock } from './shared/clock';
import { SaleId } from './value-objects/sale-id.vo';
import { SaleItemId } from './value-objects/sale-item-id.vo';
import { SourceReference } from './value-objects/source-reference.vo';
import { Money } from './value-objects/money.vo';
import { Discount } from './value-objects/discount.vo';
import { SaleStatus, isValidSaleStatus } from './enums/sale-status.enum';
import { SaleItem, CreateSaleItemProps } from './entities/sale-item.entity';
import { EmptySaleException } from './exceptions/empty-sale.exception';
import { SaleAlreadyFinalizedException } from './exceptions/sale-already-finalized.exception';
import { InvalidSaleStateException } from './exceptions/invalid-sale-state.exception';
import { InvalidSaleTransitionException } from './exceptions/invalid-sale-transition.exception';
import {
  SaleCreatedEvent,
  SaleFinalizedEvent,
  SaleCancelledEvent,
  SaleItemAddedEvent,
  SaleItemRemovedEvent,
  SalePartiallyPaidEvent,
  SalePaidEvent,
  SaleCompletedEvent,
  SaleRefundedEvent,
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
  completedAt?: Date;
  cancelledAt?: Date;
  cancellationReason?: string;
  refundedAt?: Date;
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
  private _completedAt?: Date;
  private _cancelledAt?: Date;
  private _cancellationReason?: string;
  private _refundedAt?: Date;
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
    this._completedAt = props.completedAt ? new Date(props.completedAt.getTime()) : undefined;
    this._cancelledAt = props.cancelledAt ? new Date(props.cancelledAt.getTime()) : undefined;
    this._cancellationReason = props.cancellationReason;
    this._refundedAt = props.refundedAt ? new Date(props.refundedAt.getTime()) : undefined;
    this._createdAt = new Date(props.createdAt.getTime());
    this._updatedAt = new Date(props.updatedAt.getTime());
  }

  /**
   * Factory method to create a new Sale aggregate root in DRAFT status.
   */
  public static create(props: CreateSaleProps, clock: Clock = new SystemClock()): Sale {
    if (!props) {
      throw new InvalidSaleStateException('CreateSaleProps cannot be null or undefined.');
    }
    if (!props.source || !(props.source instanceof SourceReference)) {
      throw new InvalidSaleStateException(
        'SourceReference is required and must be a valid SourceReference instance.',
      );
    }
    if (props.id !== undefined && !(props.id instanceof SaleId)) {
      throw new InvalidSaleStateException('SaleId must be a valid SaleId instance.');
    }

    const tenantId = props.tenantId !== undefined ? props.tenantId.trim() : undefined;
    if (props.tenantId !== undefined && tenantId === '') {
      throw new InvalidSaleStateException('tenantId cannot be empty or whitespace.');
    }

    const clientId = props.clientId !== undefined ? props.clientId.trim() : undefined;
    if (props.clientId !== undefined && clientId === '') {
      throw new InvalidSaleStateException('clientId cannot be empty or whitespace.');
    }

    const rawCurrency = props.currency ?? 'USD';
    if (typeof rawCurrency !== 'string') {
      throw new InvalidSaleStateException('Currency must be a string.');
    }
    const currency = rawCurrency.trim().toUpperCase();
    if (!/^[A-Z]{3}$/.test(currency)) {
      throw new InvalidSaleStateException(`Invalid ISO-4217 currency code '${props.currency}'.`);
    }

    if (
      props.orderDiscount !== undefined &&
      props.orderDiscount !== null &&
      !(props.orderDiscount instanceof Discount)
    ) {
      throw new InvalidSaleStateException('Order discount must be a valid Discount instance.');
    }

    const saleId = props.id ?? SaleId.create();
    const now = clock.now();

    const sale = new Sale({
      id: saleId,
      tenantId,
      clientId,
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
   * Reconstitutes an existing Sale aggregate from persistence, strictly guaranteeing
   * that persisted snapshot totals reconcile with the sum of item subtotals and discounts.
   */
  public static reconstitute(props: ReconstituteSaleProps): Sale {
    if (!props) {
      throw new InvalidSaleStateException('ReconstituteSaleProps cannot be null or undefined.');
    }
    if (!props.id || !(props.id instanceof SaleId)) {
      throw new InvalidSaleStateException(
        'SaleId is required and must be a valid SaleId instance.',
      );
    }
    if (!props.source || !(props.source instanceof SourceReference)) {
      throw new InvalidSaleStateException(
        'SourceReference is required and must be a valid SourceReference instance.',
      );
    }
    if (!props.status || !isValidSaleStatus(props.status)) {
      throw new InvalidSaleStateException(`Invalid Sale status '${props.status}'.`);
    }
    if (
      !props.currency ||
      typeof props.currency !== 'string' ||
      !/^[A-Z]{3}$/.test(props.currency.trim().toUpperCase())
    ) {
      throw new InvalidSaleStateException(
        `Invalid currency '${props.currency}'. Must be 3-letter ISO code.`,
      );
    }
    const currency = props.currency.trim().toUpperCase();

    const tenantId = props.tenantId !== undefined ? props.tenantId.trim() : undefined;
    if (props.tenantId !== undefined && tenantId === '') {
      throw new InvalidSaleStateException('tenantId cannot be empty or whitespace.');
    }

    const clientId = props.clientId !== undefined ? props.clientId.trim() : undefined;
    if (props.clientId !== undefined && clientId === '') {
      throw new InvalidSaleStateException('clientId cannot be empty or whitespace.');
    }

    if (
      typeof props.version !== 'number' ||
      isNaN(props.version) ||
      !Number.isInteger(props.version) ||
      props.version < 1
    ) {
      throw new InvalidSaleStateException(
        `Invalid version '${props.version}'. Version must be an integer >= 1.`,
      );
    }

    if (
      !props.createdAt ||
      !(props.createdAt instanceof Date) ||
      isNaN(props.createdAt.getTime())
    ) {
      throw new InvalidSaleStateException('createdAt must be a valid Date.');
    }
    if (
      !props.updatedAt ||
      !(props.updatedAt instanceof Date) ||
      isNaN(props.updatedAt.getTime())
    ) {
      throw new InvalidSaleStateException('updatedAt must be a valid Date.');
    }
    if (props.updatedAt.getTime() < props.createdAt.getTime()) {
      throw new InvalidSaleStateException('updatedAt cannot be earlier than createdAt.');
    }

    if (props.status === SaleStatus.CANCELLED) {
      if (
        !props.cancellationReason ||
        typeof props.cancellationReason !== 'string' ||
        !props.cancellationReason.trim()
      ) {
        throw new InvalidSaleStateException(
          'Reconstituted CANCELLED sale must have a non-empty cancellationReason.',
        );
      }
      if (
        !props.cancelledAt ||
        !(props.cancelledAt instanceof Date) ||
        isNaN(props.cancelledAt.getTime())
      ) {
        throw new InvalidSaleStateException(
          'Reconstituted CANCELLED sale must have a valid cancelledAt timestamp.',
        );
      }
    }

    if (props.status === SaleStatus.COMPLETED) {
      if (
        !props.completedAt ||
        !(props.completedAt instanceof Date) ||
        isNaN(props.completedAt.getTime())
      ) {
        throw new InvalidSaleStateException(
          'Reconstituted COMPLETED sale must have a valid completedAt timestamp.',
        );
      }
    }

    if (props.status === SaleStatus.REFUNDED) {
      if (
        !props.refundedAt ||
        !(props.refundedAt instanceof Date) ||
        isNaN(props.refundedAt.getTime())
      ) {
        throw new InvalidSaleStateException(
          'Reconstituted REFUNDED sale must have a valid refundedAt timestamp.',
        );
      }
    }

    if (props.status === SaleStatus.DRAFT) {
      if (props.completedAt || props.cancelledAt || props.refundedAt) {
        throw new InvalidSaleStateException(
          'DRAFT sale cannot have completedAt, cancelledAt, or refundedAt timestamps.',
        );
      }
    }

    if (!Array.isArray(props.items)) {
      throw new InvalidSaleStateException('Items must be an array.');
    }

    if (
      props.orderDiscount !== undefined &&
      props.orderDiscount !== null &&
      !(props.orderDiscount instanceof Discount)
    ) {
      throw new InvalidSaleStateException('Order discount must be a valid Discount instance.');
    }

    if (!props.subtotal || !(props.subtotal instanceof Money)) {
      throw new InvalidSaleStateException(
        'Subtotal is required and must be a valid Money instance.',
      );
    }
    if (!props.discountTotal || !(props.discountTotal instanceof Money)) {
      throw new InvalidSaleStateException(
        'DiscountTotal is required and must be a valid Money instance.',
      );
    }
    if (!props.total || !(props.total instanceof Money)) {
      throw new InvalidSaleStateException('Total is required and must be a valid Money instance.');
    }

    if (
      props.subtotal.currency !== currency ||
      props.discountTotal.currency !== currency ||
      props.total.currency !== currency
    ) {
      throw new InvalidSaleStateException(
        `Financial currency mismatch in persisted totals for Sale '${props.id.value}'.`,
      );
    }

    const itemIds = new Set<string>();
    let calculatedSubtotal = Money.zero(currency);
    let calculatedLineDiscounts = Money.zero(currency);

    for (const item of props.items) {
      if (!item || !(item instanceof SaleItem)) {
        throw new InvalidSaleStateException('All items must be valid SaleItem instances.');
      }
      if (itemIds.has(item.id.value)) {
        throw new InvalidSaleStateException(
          `Duplicate SaleItem ID '${item.id.value}' detected in Sale '${props.id.value}'.`,
        );
      }
      itemIds.add(item.id.value);

      if (item.saleId && !item.saleId.equals(props.id)) {
        throw new InvalidSaleStateException(
          `SaleItem '${item.id.value}' belongs to Sale '${item.saleId.value}', not '${props.id.value}'.`,
        );
      }
      if (item.unitPrice.currency !== currency) {
        throw new InvalidSaleStateException(
          `Item currency '${item.unitPrice.currency}' does not match Sale currency '${currency}'.`,
        );
      }
      calculatedSubtotal = calculatedSubtotal.add(item.subtotal);
      calculatedLineDiscounts = calculatedLineDiscounts.add(item.discountTotal);
    }

    const netPreOrderDisc = calculatedSubtotal.subtract(calculatedLineDiscounts);
    const orderDiscountAmount = props.orderDiscount
      ? props.orderDiscount.calculateReduction(netPreOrderDisc)
      : Money.zero(currency);

    const calculatedDiscountTotal = calculatedLineDiscounts.add(orderDiscountAmount);
    const calculatedTotal = calculatedSubtotal.subtract(calculatedDiscountTotal);

    if (!props.subtotal.equals(calculatedSubtotal)) {
      throw new InvalidSaleStateException(
        `Persisted subtotal (${props.subtotal}) does not reconcile with sum of item subtotals (${calculatedSubtotal}). Invariant violated.`,
      );
    }

    if (!props.discountTotal.equals(calculatedDiscountTotal)) {
      throw new InvalidSaleStateException(
        `Persisted discountTotal (${props.discountTotal}) does not reconcile with calculated discount total (${calculatedDiscountTotal}). Invariant violated.`,
      );
    }

    if (!props.total.equals(calculatedTotal)) {
      throw new InvalidSaleStateException(
        `Persisted total (${props.total}) does not reconcile with subtotal - discountTotal (${calculatedTotal}). Invariant violated.`,
      );
    }

    return new Sale({
      ...props,
      tenantId,
      clientId,
      currency,
    });
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

  public get completedAt(): Date | undefined {
    return this._completedAt ? new Date(this._completedAt.getTime()) : undefined;
  }

  public get cancelledAt(): Date | undefined {
    return this._cancelledAt ? new Date(this._cancelledAt.getTime()) : undefined;
  }

  public get cancellationReason(): string | undefined {
    return this._cancellationReason;
  }

  public get refundedAt(): Date | undefined {
    return this._refundedAt ? new Date(this._refundedAt.getTime()) : undefined;
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

    if (!props) {
      throw new InvalidSaleStateException('AddSaleItemProps cannot be null or undefined.');
    }
    if (!props.unitPrice || !(props.unitPrice instanceof Money)) {
      throw new InvalidSaleStateException('SaleItem unitPrice must be a valid Money instance.');
    }
    if (props.unitPrice.currency !== this._currency) {
      throw new InvalidSaleStateException(
        `Cannot add item with currency '${props.unitPrice.currency}' to a Sale with currency '${this._currency}'.`,
      );
    }
    if (props.id && this._items.some((i) => i.id.equals(props.id!))) {
      throw new InvalidSaleStateException(
        `SaleItem with ID '${props.id.value}' already exists in Sale '${this._id.value}'.`,
      );
    }

    const item = SaleItem.create({ ...props, saleId: this._id });
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

    const idStr = typeof itemId === 'string' ? itemId.trim() : (itemId?.value ?? '');
    if (!idStr) {
      throw new InvalidSaleStateException('SaleItemId is required.');
    }

    const index = this._items.findIndex((item) => item.id.value === idStr);
    if (index === -1) {
      throw new InvalidSaleStateException(
        `SaleItem with ID '${idStr}' not found in Sale '${this._id.value}'.`,
      );
    }

    const currentItem = this._items[index]!;
    this._items[index] = currentItem.withQuantity(newQuantity);
    this.recalculateTotals();
    this._updatedAt = clock.now();
  }

  /**
   * Applies a line-item discount to a specific item. Permitted only while in DRAFT status.
   */
  public applyItemDiscount(
    itemId: SaleItemId | string,
    discount: Discount,
    clock: Clock = new SystemClock(),
  ): void {
    this.assertDraftState();

    const idStr = typeof itemId === 'string' ? itemId.trim() : (itemId?.value ?? '');
    if (!idStr) {
      throw new InvalidSaleStateException('SaleItemId is required.');
    }
    if (!discount || !(discount instanceof Discount)) {
      throw new InvalidSaleStateException('Item discount must be a valid Discount instance.');
    }

    const index = this._items.findIndex((item) => item.id.value === idStr);
    if (index === -1) {
      throw new InvalidSaleStateException(
        `SaleItem with ID '${idStr}' not found in Sale '${this._id.value}'.`,
      );
    }

    const currentItem = this._items[index]!;
    this._items[index] = currentItem.withDiscount(discount);
    this.recalculateTotals();
    this._updatedAt = clock.now();
  }

  /**
   * Removes a line-item discount from a specific item. Permitted only while in DRAFT status.
   */
  public removeItemDiscount(itemId: SaleItemId | string, clock: Clock = new SystemClock()): void {
    this.assertDraftState();

    const idStr = typeof itemId === 'string' ? itemId.trim() : (itemId?.value ?? '');
    if (!idStr) {
      throw new InvalidSaleStateException('SaleItemId is required.');
    }

    const index = this._items.findIndex((item) => item.id.value === idStr);
    if (index === -1) {
      throw new InvalidSaleStateException(
        `SaleItem with ID '${idStr}' not found in Sale '${this._id.value}'.`,
      );
    }

    const currentItem = this._items[index]!;
    this._items[index] = currentItem.withDiscount(null);
    this.recalculateTotals();
    this._updatedAt = clock.now();
  }

  /**
   * Removes a line item from the Sale. Permitted only while in DRAFT status.
   */
  public removeItem(itemId: SaleItemId | string, clock: Clock = new SystemClock()): void {
    this.assertDraftState();

    const idStr = typeof itemId === 'string' ? itemId.trim() : (itemId?.value ?? '');
    if (!idStr) {
      throw new InvalidSaleStateException('SaleItemId is required.');
    }

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
    if (!discount || !(discount instanceof Discount)) {
      throw new InvalidSaleStateException('Order discount must be a valid Discount instance.');
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
   * Finalizes the commercial agreement, transitioning from DRAFT to PENDING_PAYMENT.
   * Freezes commercial terms permanently against further item and discount adjustments.
   * Invariant: Requires at least one line item (SALE-05).
   */
  public finalize(clock: Clock = new SystemClock()): void {
    if (this._status !== SaleStatus.DRAFT) {
      throw new InvalidSaleTransitionException(
        this._status,
        SaleStatus.PENDING_PAYMENT,
        'Sale can only be finalized from DRAFT status.',
      );
    }

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
   * Transitions status to PARTIALLY_PAID upon receiving a partial payment tender.
   * Permitted only from PENDING_PAYMENT.
   */
  public markPartiallyPaid(clock: Clock = new SystemClock()): void {
    if (this._status !== SaleStatus.PENDING_PAYMENT) {
      throw new InvalidSaleTransitionException(
        this._status,
        SaleStatus.PARTIALLY_PAID,
        'Sale can only transition to PARTIALLY_PAID from PENDING_PAYMENT.',
      );
    }

    const now = clock.now();
    this._status = SaleStatus.PARTIALLY_PAID;
    this._version++;
    this._updatedAt = now;

    this.recordEvent(
      new SalePartiallyPaidEvent(
        this._id.value,
        this._version,
        {
          saleId: this._id.value,
          totalAmount: this._total.amount,
          currency: this._currency,
        },
        now,
      ),
    );
  }

  /**
   * Transitions status to PAID upon full settlement confirmation.
   * Permitted from PENDING_PAYMENT or PARTIALLY_PAID.
   */
  public markPaid(clock: Clock = new SystemClock()): void {
    if (this._status !== SaleStatus.PENDING_PAYMENT && this._status !== SaleStatus.PARTIALLY_PAID) {
      throw new InvalidSaleTransitionException(
        this._status,
        SaleStatus.PAID,
        'Sale can only transition to PAID from PENDING_PAYMENT or PARTIALLY_PAID.',
      );
    }

    const now = clock.now();
    this._status = SaleStatus.PAID;
    this._version++;
    this._updatedAt = now;

    this.recordEvent(
      new SalePaidEvent(
        this._id.value,
        this._version,
        {
          saleId: this._id.value,
          totalAmount: this._total.amount,
          currency: this._currency,
        },
        now,
      ),
    );
  }

  /**
   * Transitions status to COMPLETED upon fulfillment confirmation of all physical items and service memberships.
   * Permitted only from PAID.
   */
  public markCompleted(clock: Clock = new SystemClock()): void {
    if (this._status !== SaleStatus.PAID) {
      throw new InvalidSaleTransitionException(
        this._status,
        SaleStatus.COMPLETED,
        'Sale can only transition to COMPLETED from PAID status upon fulfillment confirmation.',
      );
    }

    const now = clock.now();
    this._status = SaleStatus.COMPLETED;
    this._completedAt = now;
    this._version++;
    this._updatedAt = now;

    this.recordEvent(
      new SaleCompletedEvent(
        this._id.value,
        this._version,
        {
          saleId: this._id.value,
          totalAmount: this._total.amount,
          currency: this._currency,
        },
        now,
      ),
    );
  }

  /**
   * Transitions status to REFUNDED upon execution of a full compensating refund.
   * Permitted from PAID or COMPLETED.
   */
  public markRefunded(reason?: string, clock: Clock = new SystemClock()): void {
    if (this._status !== SaleStatus.PAID && this._status !== SaleStatus.COMPLETED) {
      throw new InvalidSaleTransitionException(
        this._status,
        SaleStatus.REFUNDED,
        'Sale can only transition to REFUNDED from PAID or COMPLETED status.',
      );
    }
    if (reason !== undefined && (typeof reason !== 'string' || !reason.trim())) {
      throw new InvalidSaleStateException(
        'Refund reason, if provided, must be a non-empty string.',
        'INVALID_REFUND_REASON',
      );
    }

    const now = clock.now();
    this._status = SaleStatus.REFUNDED;
    this._refundedAt = now;
    this._version++;
    this._updatedAt = now;

    this.recordEvent(
      new SaleRefundedEvent(
        this._id.value,
        this._version,
        {
          saleId: this._id.value,
          totalAmount: this._total.amount,
          currency: this._currency,
          reason: reason ? reason.trim() : undefined,
        },
        now,
      ),
    );
  }

  /**
   * Cancels the Sale transaction. Permitted from DRAFT, PENDING_PAYMENT, or PARTIALLY_PAID.
   * Requires a non-empty cancellationReason (Rule SALE-09).
   */
  public cancel(reason: string, clock: Clock = new SystemClock()): void {
    if (!reason || typeof reason !== 'string' || !reason.trim()) {
      throw new InvalidSaleStateException(
        'Cancellation reason is required to cancel a Sale.',
        'INVALID_CANCELLATION_REASON',
      );
    }

    if (
      this._status !== SaleStatus.DRAFT &&
      this._status !== SaleStatus.PENDING_PAYMENT &&
      this._status !== SaleStatus.PARTIALLY_PAID
    ) {
      throw new InvalidSaleTransitionException(
        this._status,
        SaleStatus.CANCELLED,
        `Sale in status '${this._status}' cannot be cancelled. Only DRAFT, PENDING_PAYMENT, or PARTIALLY_PAID sales can be cancelled.`,
      );
    }

    const now = clock.now();
    this._status = SaleStatus.CANCELLED;
    this._cancelledAt = now;
    this._cancellationReason = reason.trim();
    this._version++;
    this._updatedAt = now;

    this.recordEvent(
      new SaleCancelledEvent(
        this._id.value,
        this._version,
        {
          saleId: this._id.value,
          reason: this._cancellationReason,
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
      subtotal = subtotal.add(item.subtotal);
      totalLineDiscounts = totalLineDiscounts.add(item.discountTotal);
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
