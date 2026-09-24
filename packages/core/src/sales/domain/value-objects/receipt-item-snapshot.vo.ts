import { ValueObject } from '../shared/value-object';
import { Money } from './money.vo';
import { ReceiptDomainException } from '../exceptions/receipt-domain.exception';

export interface ReceiptItemSnapshotProps {
  itemId: string;
  sourceType: string;
  sourceId: string;
  description: string;
  skuOrCode?: string | null;
  quantity: number;
  unitPrice: Money;
  discountTotal?: Money;
  subtotal: Money;
  total: Money;
}

/**
 * Immutable Value Object capturing point-in-time commercial line item details
 * within an issued Receipt.
 *
 * Enforces:
 * - Integer minor units (cents) determinism.
 * - Single currency homogeneity across item monetary values.
 * - Exact mathematical reconciliation: subtotal = round(quantity * unitPrice), total = subtotal - discountTotal.
 * - Permanent point-in-time snapshotting (zero runtime catalog joins).
 */
export class ReceiptItemSnapshot implements ValueObject<ReceiptItemSnapshotProps> {
  private readonly _itemId: string;
  private readonly _sourceType: string;
  private readonly _sourceId: string;
  private readonly _description: string;
  private readonly _skuOrCode: string | null;
  private readonly _quantity: number;
  private readonly _unitPrice: Money;
  private readonly _discountTotal: Money;
  private readonly _subtotal: Money;
  private readonly _total: Money;

  private constructor(props: ReceiptItemSnapshotProps) {
    if (!props) {
      throw new ReceiptDomainException(
        'ReceiptItemSnapshotProps cannot be null or undefined.',
        'INVALID_RECEIPT_ITEMS',
      );
    }

    if (!props.itemId || typeof props.itemId !== 'string' || props.itemId.trim().length === 0) {
      throw new ReceiptDomainException(
        'Receipt item itemId must be a non-empty string.',
        'INVALID_RECEIPT_ITEMS',
      );
    }

    if (
      !props.sourceType ||
      typeof props.sourceType !== 'string' ||
      props.sourceType.trim().length === 0
    ) {
      throw new ReceiptDomainException(
        'Receipt item sourceType must be a non-empty string.',
        'INVALID_RECEIPT_ITEMS',
      );
    }

    if (
      !props.sourceId ||
      typeof props.sourceId !== 'string' ||
      props.sourceId.trim().length === 0
    ) {
      throw new ReceiptDomainException(
        'Receipt item sourceId must be a non-empty string.',
        'INVALID_RECEIPT_ITEMS',
      );
    }

    if (
      !props.description ||
      typeof props.description !== 'string' ||
      props.description.trim().length === 0
    ) {
      throw new ReceiptDomainException(
        'Receipt item description must be a non-empty string.',
        'INVALID_RECEIPT_ITEMS',
      );
    }

    if (
      typeof props.quantity !== 'number' ||
      !isFinite(props.quantity) ||
      isNaN(props.quantity) ||
      props.quantity <= 0
    ) {
      throw new ReceiptDomainException(
        `Receipt item quantity must be a positive finite number, got: ${props.quantity}.`,
        'INVALID_RECEIPT_ITEMS',
      );
    }

    if (!props.unitPrice || !(props.unitPrice instanceof Money)) {
      throw new ReceiptDomainException(
        'Receipt item unitPrice must be an instance of canonical Money VO.',
        'INVALID_RECEIPT_ITEMS',
      );
    }

    const currency = props.unitPrice.currency;
    const discountTotal = props.discountTotal ?? Money.zero(currency);

    if (!(discountTotal instanceof Money)) {
      throw new ReceiptDomainException(
        'Receipt item discountTotal must be an instance of canonical Money VO.',
        'INVALID_RECEIPT_ITEMS',
      );
    }

    if (discountTotal.currency !== currency) {
      throw new ReceiptDomainException(
        `Receipt item currency mismatch: unitPrice is '${currency}' but discountTotal is '${discountTotal.currency}'.`,
        'INVALID_RECEIPT_ITEMS',
      );
    }

    if (!props.subtotal || !(props.subtotal instanceof Money)) {
      throw new ReceiptDomainException(
        'Receipt item subtotal must be an instance of canonical Money VO.',
        'INVALID_RECEIPT_ITEMS',
      );
    }

    if (props.subtotal.currency !== currency) {
      throw new ReceiptDomainException(
        `Receipt item currency mismatch: unitPrice is '${currency}' but subtotal is '${props.subtotal.currency}'.`,
        'INVALID_RECEIPT_ITEMS',
      );
    }

    if (!props.total || !(props.total instanceof Money)) {
      throw new ReceiptDomainException(
        'Receipt item total must be an instance of canonical Money VO.',
        'INVALID_RECEIPT_ITEMS',
      );
    }

    if (props.total.currency !== currency) {
      throw new ReceiptDomainException(
        `Receipt item currency mismatch: unitPrice is '${currency}' but total is '${props.total.currency}'.`,
        'INVALID_RECEIPT_ITEMS',
      );
    }

    // Mathematical reconciliation in integer minor units (cents)
    const expectedSubtotalCents = Math.round(
      props.quantity * props.unitPrice.cents + Number.EPSILON,
    );
    if (props.subtotal.cents !== expectedSubtotalCents) {
      throw new ReceiptDomainException(
        `Receipt item '${props.description}' subtotal reconciliation failed: expected ${expectedSubtotalCents} cents, got ${props.subtotal.cents} cents.`,
        'INVALID_RECEIPT_TOTALS',
      );
    }

    const expectedTotalCents = Math.max(0, expectedSubtotalCents - discountTotal.cents);
    if (props.total.cents !== expectedTotalCents) {
      throw new ReceiptDomainException(
        `Receipt item '${props.description}' total reconciliation failed: expected ${expectedTotalCents} cents, got ${props.total.cents} cents.`,
        'INVALID_RECEIPT_TOTALS',
      );
    }

    this._itemId = props.itemId.trim();
    this._sourceType = props.sourceType.trim();
    this._sourceId = props.sourceId.trim();
    this._description = props.description.trim();
    this._skuOrCode =
      props.skuOrCode && typeof props.skuOrCode === 'string' ? props.skuOrCode.trim() : null;
    this._quantity = props.quantity;
    this._unitPrice = props.unitPrice;
    this._discountTotal = discountTotal;
    this._subtotal = props.subtotal;
    this._total = props.total;

    Object.freeze(this);
  }

  public static create(props: ReceiptItemSnapshotProps): ReceiptItemSnapshot {
    return new ReceiptItemSnapshot(props);
  }

  public get itemId(): string {
    return this._itemId;
  }

  public get sourceType(): string {
    return this._sourceType;
  }

  public get sourceId(): string {
    return this._sourceId;
  }

  public get description(): string {
    return this._description;
  }

  public get skuOrCode(): string | null {
    return this._skuOrCode;
  }

  public get quantity(): number {
    return this._quantity;
  }

  public get unitPrice(): Money {
    return this._unitPrice;
  }

  public get discountTotal(): Money {
    return this._discountTotal;
  }

  public get subtotal(): Money {
    return this._subtotal;
  }

  public get total(): Money {
    return this._total;
  }

  public getValue(): ReceiptItemSnapshotProps {
    return {
      itemId: this._itemId,
      sourceType: this._sourceType,
      sourceId: this._sourceId,
      description: this._description,
      skuOrCode: this._skuOrCode,
      quantity: this._quantity,
      unitPrice: this._unitPrice,
      discountTotal: this._discountTotal,
      subtotal: this._subtotal,
      total: this._total,
    };
  }

  public equals(other: ValueObject<ReceiptItemSnapshotProps> | undefined | null): boolean {
    if (!other || !(other instanceof ReceiptItemSnapshot)) {
      return false;
    }
    return (
      this._itemId === other.itemId &&
      this._sourceType === other.sourceType &&
      this._sourceId === other.sourceId &&
      this._description === other.description &&
      this._skuOrCode === other.skuOrCode &&
      this._quantity === other.quantity &&
      this._unitPrice.equals(other.unitPrice) &&
      this._discountTotal.equals(other.discountTotal) &&
      this._subtotal.equals(other.subtotal) &&
      this._total.equals(other.total)
    );
  }
}
