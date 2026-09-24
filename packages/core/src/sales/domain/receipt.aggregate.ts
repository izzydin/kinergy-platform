import { Entity } from './shared/entity';
import { AggregateRoot } from './shared/aggregate-root';
import { DomainEvent } from './shared/domain-event';
import { Clock, SystemClock } from './shared/clock';
import { ReceiptId } from './value-objects/receipt-id.vo';
import { ReceiptNumber } from './value-objects/receipt-number.vo';
import { SaleId } from './value-objects/sale-id.vo';
import { Money } from './value-objects/money.vo';
import { ReceiptClientSnapshot } from './value-objects/receipt-client-snapshot.vo';
import { ReceiptItemSnapshot } from './value-objects/receipt-item-snapshot.vo';
import { ReceiptPaymentSnapshot } from './value-objects/receipt-payment-snapshot.vo';
import { ReceiptStatus, isValidReceiptStatus } from './enums/receipt-status.enum';
import { SaleStatus } from './enums/sale-status.enum';
import { PaymentMethod } from './enums/payment-method.enum';
import { PaymentStatus } from './enums/payment-status.enum';
import { ReceiptDomainException } from './exceptions/receipt-domain.exception';
import { ReceiptIssuedEvent, ReceiptReprintedEvent } from './events';
import { Sale } from './sale.aggregate';
import { Payment } from './payment.aggregate';

export interface CreateReceiptProps {
  id?: ReceiptId | string;
  tenantId: string;
  saleId: SaleId | string;
  receiptNumber: ReceiptNumber | string;
  saleReference: string;
  issuedAt?: Date;
  clientSnapshot?: ReceiptClientSnapshot | null;
  items: ReceiptItemSnapshot[];
  subtotal: Money;
  discountTotal?: Money;
  total: Money;
  payments: ReceiptPaymentSnapshot[];
}

export interface FromSettledSaleParams {
  sale: Sale;
  payments: Payment[];
  clientSummary?: {
    id: string;
    referenceNumber?: string | null;
    fullName: string;
    email?: string | null;
    phone?: string | null;
  } | null;
  receiptNumber: ReceiptNumber | string;
  saleReference?: string;
  id?: ReceiptId | string;
}

export interface ReconstituteReceiptProps {
  id: ReceiptId;
  tenantId: string;
  saleId: SaleId;
  receiptNumber: ReceiptNumber;
  saleReference: string;
  issuedAt: Date;
  clientSnapshot: ReceiptClientSnapshot | null;
  items: ReceiptItemSnapshot[];
  subtotal: Money;
  discountTotal: Money;
  total: Money;
  payments: ReceiptPaymentSnapshot[];
  status: ReceiptStatus;
  reprintCount: number;
  lastReprintedAt: Date | null;
  version: number;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Autonomous Receipt Document Entity and Aggregate Root for the Sales & Payments Bounded Context.
 * Codified by ADR-0110 and ADR-0117.
 *
 * Nature of a Receipt:
 * - A Receipt is NOT a financial source of truth (commercial truth resides in Sale; tender truth in Payment).
 * - A Receipt is an immutable, customer-facing legal proof-of-purchase voucher documenting an already-settled sale.
 * - Permanent data immutability: once created, all commercial, item, client, and tender snapshots are write-once.
 * - The only permitted state transition is recording duplicate reprints (incrementing reprintCount).
 */
export class Receipt implements Entity<ReceiptId>, AggregateRoot<ReceiptId> {
  private readonly _id: ReceiptId;
  private readonly _tenantId: string;
  private readonly _saleId: SaleId;
  private readonly _receiptNumber: ReceiptNumber;
  private readonly _saleReference: string;
  private readonly _issuedAt: Date;
  private readonly _clientSnapshot: ReceiptClientSnapshot | null;
  private readonly _items: ReceiptItemSnapshot[];
  private readonly _subtotal: Money;
  private readonly _discountTotal: Money;
  private readonly _total: Money;
  private readonly _payments: ReceiptPaymentSnapshot[];
  private _status: ReceiptStatus;
  private _reprintCount: number;
  private _lastReprintedAt: Date | null;
  private _version: number;
  private readonly _createdAt: Date;
  private _updatedAt: Date;
  private _uncommittedEvents: DomainEvent[] = [];

  private constructor(props: ReconstituteReceiptProps) {
    Receipt.validateProps(props);

    this._id = props.id;
    this._tenantId = props.tenantId.trim();
    this._saleId = props.saleId;
    this._receiptNumber = props.receiptNumber;
    this._saleReference = props.saleReference.trim();
    this._issuedAt = new Date(props.issuedAt.getTime());
    this._clientSnapshot = props.clientSnapshot;
    this._items = [...props.items];
    this._subtotal = props.subtotal;
    this._discountTotal = props.discountTotal;
    this._total = props.total;
    this._payments = [...props.payments];
    this._status = props.status;
    this._reprintCount = props.reprintCount;
    this._lastReprintedAt = props.lastReprintedAt
      ? new Date(props.lastReprintedAt.getTime())
      : null;
    this._version = props.version;
    this._createdAt = new Date(props.createdAt.getTime());
    this._updatedAt = new Date(props.updatedAt.getTime());
  }

  /**
   * Factory method to create a new Receipt aggregate root in ISSUED status.
   */
  public static create(props: CreateReceiptProps, clock: Clock = new SystemClock()): Receipt {
    if (!props) {
      throw new ReceiptDomainException(
        'CreateReceiptProps cannot be null or undefined.',
        'INVALID_RECEIPT_PROPS',
      );
    }

    const id =
      props.id instanceof ReceiptId
        ? props.id
        : ReceiptId.create(typeof props.id === 'string' ? props.id : undefined);

    const saleId =
      props.saleId instanceof SaleId
        ? props.saleId
        : SaleId.create(typeof props.saleId === 'string' ? props.saleId : undefined);

    const receiptNumber =
      props.receiptNumber instanceof ReceiptNumber
        ? props.receiptNumber
        : ReceiptNumber.create(props.receiptNumber);

    const currency = props.total?.currency ?? Money.DEFAULT_CURRENCY;
    const discountTotal = props.discountTotal ?? Money.zero(currency);
    const now = clock.now();
    const issuedAt = props.issuedAt ? new Date(props.issuedAt.getTime()) : now;

    const receipt = new Receipt({
      id,
      tenantId: props.tenantId,
      saleId,
      receiptNumber,
      saleReference: props.saleReference,
      issuedAt,
      clientSnapshot: props.clientSnapshot ?? null,
      items: props.items ?? [],
      subtotal: props.subtotal,
      discountTotal,
      total: props.total,
      payments: props.payments ?? [],
      status: ReceiptStatus.ISSUED,
      reprintCount: 0,
      lastReprintedAt: null,
      version: 1,
      createdAt: now,
      updatedAt: now,
    });

    receipt.recordEvent(
      new ReceiptIssuedEvent(
        receipt.id.value,
        1,
        {
          receiptId: receipt.id.value,
          receiptNumber: receipt.receiptNumber.value,
          saleId: receipt.saleId.value,
          tenantId: receipt.tenantId,
          totalAmount: receipt.total.amount,
          totalCents: receipt.total.cents,
          currency: receipt.total.currency,
          issuedAt: receipt.issuedAt,
        },
        now,
      ),
    );

    return receipt;
  }

  /**
   * Authoritative factory method to issue a Receipt from a settled Sale and its tender Payments.
   *
   * Enforces:
   * - Sale must be in PAID or COMPLETED status (ADR-0117 Invariant 9).
   * - Creates point-in-time snapshots of Client, SaleItems, and Payments.
   * - Decouples receipt permanently from subsequent mutations to Client or Catalog.
   */
  public static fromSettledSale(
    params: FromSettledSaleParams,
    clock: Clock = new SystemClock(),
  ): Receipt {
    if (!params) {
      throw new ReceiptDomainException(
        'FromSettledSaleParams cannot be null or undefined.',
        'INVALID_RECEIPT_PROPS',
      );
    }

    if (!params.sale) {
      throw new ReceiptDomainException(
        'Sale is required to issue a receipt.',
        'INVALID_RECEIPT_PROPS',
      );
    }

    if (params.sale.status !== SaleStatus.PAID && params.sale.status !== SaleStatus.COMPLETED) {
      throw new ReceiptDomainException(
        `Cannot issue receipt for sale '${params.sale.id.value}' in status '${params.sale.status}'. Receipt issuance requires PAID or COMPLETED sale.`,
        'INVALID_RECEIPT_SALE_STATUS',
      );
    }

    if (!params.sale.tenantId) {
      throw new ReceiptDomainException(
        'Sale must have a valid tenantId to issue a receipt.',
        'INVALID_RECEIPT_PROPS',
      );
    }

    if (!Array.isArray(params.payments) || params.payments.length === 0) {
      throw new ReceiptDomainException(
        'At least one settled Payment is required to issue a receipt.',
        'INVALID_RECEIPT_PAYMENTS',
      );
    }

    const items = params.sale.items.map((item) => ReceiptItemSnapshot.fromSaleItem(item));
    const payments = params.payments.map((p) => ReceiptPaymentSnapshot.fromPayment(p));
    const clientSnapshot = params.clientSummary
      ? ReceiptClientSnapshot.fromSummary(params.clientSummary)
      : null;

    return Receipt.create(
      {
        id: params.id,
        tenantId: params.sale.tenantId,
        saleId: params.sale.id,
        receiptNumber: params.receiptNumber,
        saleReference: params.saleReference ?? params.sale.id.value,
        clientSnapshot,
        items,
        subtotal: params.sale.subtotal,
        discountTotal: params.sale.discountTotal,
        total: params.sale.total,
        payments,
      },
      clock,
    );
  }

  /**
   * Reconstitutes an existing Receipt aggregate root from persistence.
   */
  public static reconstitute(props: ReconstituteReceiptProps): Receipt {
    return new Receipt(props);
  }

  private static validateProps(props: ReconstituteReceiptProps): void {
    if (!props) {
      throw new ReceiptDomainException(
        'Receipt properties cannot be null or undefined.',
        'INVALID_RECEIPT_PROPS',
      );
    }

    if (!props.id || !(props.id instanceof ReceiptId)) {
      throw new ReceiptDomainException(
        'Receipt must have a valid ReceiptId instance.',
        'INVALID_RECEIPT_ID',
      );
    }

    if (
      !props.tenantId ||
      typeof props.tenantId !== 'string' ||
      props.tenantId.trim().length === 0
    ) {
      throw new ReceiptDomainException(
        'Receipt must have a valid non-empty tenantId.',
        'INVALID_TENANT_ID',
      );
    }

    if (!props.saleId || !(props.saleId instanceof SaleId)) {
      throw new ReceiptDomainException(
        'Receipt must reference a valid SaleId instance.',
        'INVALID_RECEIPT_SALE_ID',
      );
    }

    if (!props.receiptNumber || !(props.receiptNumber instanceof ReceiptNumber)) {
      throw new ReceiptDomainException(
        'Receipt must have a valid ReceiptNumber instance.',
        'INVALID_RECEIPT_NUMBER',
      );
    }

    if (
      !props.saleReference ||
      typeof props.saleReference !== 'string' ||
      props.saleReference.trim().length === 0
    ) {
      throw new ReceiptDomainException(
        'Receipt saleReference must be a non-empty string.',
        'INVALID_RECEIPT_SALE_REFERENCE',
      );
    }

    if (!props.issuedAt || !(props.issuedAt instanceof Date) || isNaN(props.issuedAt.getTime())) {
      throw new ReceiptDomainException(
        'Receipt issuedAt must be a valid Date.',
        'INVALID_RECEIPT_DATE',
      );
    }

    if (!props.status || !isValidReceiptStatus(props.status)) {
      throw new ReceiptDomainException(
        `Invalid Receipt status '${props.status}'.`,
        'INVALID_RECEIPT_STATUS',
      );
    }

    // Client snapshot validation
    if (props.clientSnapshot !== null && !(props.clientSnapshot instanceof ReceiptClientSnapshot)) {
      throw new ReceiptDomainException(
        'Receipt clientSnapshot must be an instance of ReceiptClientSnapshot or null.',
        'INVALID_RECEIPT_CLIENT_SNAPSHOT',
      );
    }

    // Line items validation
    if (!Array.isArray(props.items) || props.items.length === 0) {
      throw new ReceiptDomainException(
        'Receipt must contain at least one line item snapshot.',
        'INVALID_RECEIPT_ITEMS',
      );
    }

    for (const item of props.items) {
      if (!item || !(item instanceof ReceiptItemSnapshot)) {
        throw new ReceiptDomainException(
          'Every Receipt line item must be an instance of ReceiptItemSnapshot.',
          'INVALID_RECEIPT_ITEMS',
        );
      }
    }

    // Monetary totals validation
    if (!props.subtotal || !(props.subtotal instanceof Money)) {
      throw new ReceiptDomainException(
        'Receipt subtotal must be an instance of canonical Money VO.',
        'INVALID_RECEIPT_TOTALS',
      );
    }

    if (!props.discountTotal || !(props.discountTotal instanceof Money)) {
      throw new ReceiptDomainException(
        'Receipt discountTotal must be an instance of canonical Money VO.',
        'INVALID_RECEIPT_TOTALS',
      );
    }

    if (!props.total || !(props.total instanceof Money)) {
      throw new ReceiptDomainException(
        'Receipt total must be an instance of canonical Money VO.',
        'INVALID_RECEIPT_TOTALS',
      );
    }

    const currency = props.total.currency;

    if (props.subtotal.currency !== currency) {
      throw new ReceiptDomainException(
        `Receipt currency mismatch: total is '${currency}' but subtotal is '${props.subtotal.currency}'.`,
        'INVALID_RECEIPT_TOTALS',
      );
    }

    if (props.discountTotal.currency !== currency) {
      throw new ReceiptDomainException(
        `Receipt currency mismatch: total is '${currency}' but discountTotal is '${props.discountTotal.currency}'.`,
        'INVALID_RECEIPT_TOTALS',
      );
    }

    // Validate currency homogeneity across all line items
    for (const item of props.items) {
      if (item.unitPrice.currency !== currency) {
        throw new ReceiptDomainException(
          `Receipt item '${item.description}' currency '${item.unitPrice.currency}' does not match Receipt currency '${currency}'.`,
          'INVALID_RECEIPT_ITEMS',
        );
      }
    }

    // Exact integer cents mathematical reconciliation
    const calculatedItemsSubtotalCents = props.items.reduce(
      (sum, item) => sum + item.subtotal.cents,
      0,
    );
    if (props.subtotal.cents !== calculatedItemsSubtotalCents) {
      throw new ReceiptDomainException(
        `Receipt subtotal (${props.subtotal.cents} cents) does not equal sum of item subtotals (${calculatedItemsSubtotalCents} cents).`,
        'INVALID_RECEIPT_TOTALS',
      );
    }

    const calculatedItemsDiscountCents = props.items.reduce(
      (sum, item) => sum + item.discountTotal.cents,
      0,
    );
    // Note: discountTotal can include order-level discount beyond item discounts, so discountTotal.cents >= calculatedItemsDiscountCents
    if (props.discountTotal.cents < calculatedItemsDiscountCents) {
      throw new ReceiptDomainException(
        `Receipt discountTotal (${props.discountTotal.cents} cents) cannot be less than sum of item discounts (${calculatedItemsDiscountCents} cents).`,
        'INVALID_RECEIPT_TOTALS',
      );
    }

    const expectedTotalCents = Math.max(0, props.subtotal.cents - props.discountTotal.cents);
    if (props.total.cents !== expectedTotalCents) {
      throw new ReceiptDomainException(
        `Receipt total (${props.total.cents} cents) does not match subtotal minus discountTotal (${expectedTotalCents} cents).`,
        'INVALID_RECEIPT_TOTALS',
      );
    }

    // Payments validation
    if (!Array.isArray(props.payments) || props.payments.length === 0) {
      throw new ReceiptDomainException(
        'Receipt must evidence at least one settled payment snapshot.',
        'INVALID_RECEIPT_PAYMENTS',
      );
    }

    for (const payment of props.payments) {
      if (!payment || !(payment instanceof ReceiptPaymentSnapshot)) {
        throw new ReceiptDomainException(
          'Every Receipt payment must be an instance of ReceiptPaymentSnapshot.',
          'INVALID_RECEIPT_PAYMENTS',
        );
      }

      if (payment.amount.currency !== currency) {
        throw new ReceiptDomainException(
          `Receipt payment tender currency '${payment.amount.currency}' does not match Receipt currency '${currency}'.`,
          'INVALID_RECEIPT_PAYMENTS',
        );
      }
    }

    // Full financial settlement verification (sum of payments >= receipt total)
    const totalSettledPaymentCents = props.payments.reduce((sum, p) => sum + p.amount.cents, 0);
    if (totalSettledPaymentCents < props.total.cents) {
      throw new ReceiptDomainException(
        `Receipt total payments (${totalSettledPaymentCents} cents) do not cover total payable amount (${props.total.cents} cents). Cannot issue receipt for underpaid sale.`,
        'INVALID_RECEIPT_PAYMENTS',
      );
    }

    // Reprint counters validation
    if (
      typeof props.reprintCount !== 'number' ||
      !Number.isInteger(props.reprintCount) ||
      props.reprintCount < 0
    ) {
      throw new ReceiptDomainException(
        'Receipt reprintCount must be a non-negative integer.',
        'INVALID_RECEIPT_PROPS',
      );
    }

    if (props.reprintCount === 0 && props.lastReprintedAt !== null) {
      throw new ReceiptDomainException(
        'Receipt with zero reprints cannot have a lastReprintedAt timestamp.',
        'INVALID_RECEIPT_PROPS',
      );
    }

    if (props.reprintCount > 0 && props.lastReprintedAt === null) {
      throw new ReceiptDomainException(
        'Reprinted receipt must have a valid lastReprintedAt timestamp.',
        'INVALID_RECEIPT_PROPS',
      );
    }

    if (
      typeof props.version !== 'number' ||
      !Number.isInteger(props.version) ||
      props.version < 1
    ) {
      throw new ReceiptDomainException(
        'Receipt version must be an integer >= 1.',
        'INVALID_RECEIPT_PROPS',
      );
    }

    if (
      !props.createdAt ||
      !(props.createdAt instanceof Date) ||
      isNaN(props.createdAt.getTime())
    ) {
      throw new ReceiptDomainException(
        'Receipt createdAt must be a valid Date.',
        'INVALID_RECEIPT_DATE',
      );
    }

    if (
      !props.updatedAt ||
      !(props.updatedAt instanceof Date) ||
      isNaN(props.updatedAt.getTime())
    ) {
      throw new ReceiptDomainException(
        'Receipt updatedAt must be a valid Date.',
        'INVALID_RECEIPT_DATE',
      );
    }
  }

  // --- Aggregate Root & Entity Contracts ---

  public get id(): ReceiptId {
    return this._id;
  }

  public get version(): number {
    return this._version;
  }

  public getUncommittedEvents(): ReadonlyArray<DomainEvent> {
    return Object.freeze([...this._uncommittedEvents]);
  }

  public clearEvents(): void {
    this._uncommittedEvents = [];
  }

  protected recordEvent(event: DomainEvent): void {
    this._uncommittedEvents.push(event);
  }

  public equals(other: Entity<ReceiptId> | undefined | null): boolean {
    if (!other || !(other instanceof Receipt)) {
      return false;
    }
    return this._id.equals(other.id);
  }

  // --- Read-Only Snapshot Getters ---

  public get tenantId(): string {
    return this._tenantId;
  }

  public get saleId(): SaleId {
    return this._saleId;
  }

  public get receiptNumber(): ReceiptNumber {
    return this._receiptNumber;
  }

  public get saleReference(): string {
    return this._saleReference;
  }

  public get issuedAt(): Date {
    return new Date(this._issuedAt.getTime());
  }

  public get clientSnapshot(): ReceiptClientSnapshot | null {
    return this._clientSnapshot;
  }

  public get items(): ReadonlyArray<ReceiptItemSnapshot> {
    return Object.freeze([...this._items]);
  }

  public get itemCount(): number {
    return this._items.length;
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

  public get currency(): string {
    return this._total.currency;
  }

  public get payments(): ReadonlyArray<ReceiptPaymentSnapshot> {
    return Object.freeze([...this._payments]);
  }

  /**
   * Convenience getter: Payment method of the primary settled tender.
   */
  public get paymentMethod(): PaymentMethod {
    return this._payments[0]!.method;
  }

  /**
   * Convenience getter: Payment status of the primary settled tender.
   */
  public get paymentStatus(): PaymentStatus {
    return this._payments[0]!.status;
  }

  public get status(): ReceiptStatus {
    return this._status;
  }

  public get isReprint(): boolean {
    return this._status === ReceiptStatus.REPRINTED || this._reprintCount > 0;
  }

  public get reprintCount(): number {
    return this._reprintCount;
  }

  public get lastReprintedAt(): Date | null {
    return this._lastReprintedAt ? new Date(this._lastReprintedAt.getTime()) : null;
  }

  public get createdAt(): Date {
    return new Date(this._createdAt.getTime());
  }

  public get updatedAt(): Date {
    return new Date(this._updatedAt.getTime());
  }

  // --- Domain Lifecycle Methods ---

  /**
   * Records a duplicate reprint of this existing receipt voucher.
   *
   * Business Rules (REC-05, REC-06):
   * - Does NOT mutate commercial totals, line items, customer info, or tender snapshots.
   * - Transitions status to REPRINTED.
   * - Increments reprintCount by 1.
   * - Updates lastReprintedAt to the current timestamp.
   * - Records ReceiptReprintedEvent for audit attribution.
   */
  public recordReprint(clock: Clock = new SystemClock()): void {
    const now = clock.now();
    this._status = ReceiptStatus.REPRINTED;
    this._reprintCount++;
    this._lastReprintedAt = now;
    this._version++;
    this._updatedAt = now;

    this.recordEvent(
      new ReceiptReprintedEvent(
        this._id.value,
        this._version,
        {
          receiptId: this._id.value,
          receiptNumber: this._receiptNumber.value,
          saleId: this._saleId.value,
          tenantId: this._tenantId,
          reprintCount: this._reprintCount,
          reprintedAt: now,
        },
        now,
      ),
    );
  }
}
