import { SaleItemId } from '../value-objects/sale-item-id.vo';
import { SourceReference } from '../value-objects/source-reference.vo';
import { Money } from '../value-objects/money.vo';
import { Discount } from '../value-objects/discount.vo';
import { InvalidSaleItemException } from '../exceptions/invalid-sale-item.exception';

export interface CreateSaleItemProps {
  id?: SaleItemId;
  source: SourceReference;
  description: string;
  skuOrCode?: string | null;
  quantity: number;
  unitPrice: Money;
  discount?: Discount | null;
}

export interface ReconstituteSaleItemProps {
  id: SaleItemId;
  source: SourceReference;
  description: string;
  skuOrCode?: string | null;
  quantity: number;
  unitPrice: Money;
  discount?: Discount | null;
  subtotal?: Money;
  discountTotal?: Money;
  total?: Money;
  lineSubtotal?: Money;
  lineDiscountTotal?: Money;
  lineTotal?: Money;
}

/**
 * SaleItem is an immutable child entity exclusively owned and governed by the Sale aggregate root.
 * Permanently snapshots commercial information (description, SKU/code, unit price, quantity, discount)
 * at the moment of checkout, ensuring historical financial transactions remain unaffected by subsequent
 * source catalog modifications.
 */
export class SaleItem {
  private readonly _id: SaleItemId;
  private readonly _source: SourceReference;
  private readonly _description: string;
  private readonly _skuOrCode: string | null;
  private readonly _quantity: number;
  private readonly _unitPrice: Money;
  private readonly _discount: Discount | null;
  private readonly _subtotal: Money;
  private readonly _discountTotal: Money;
  private readonly _total: Money;

  private constructor(props: {
    id: SaleItemId;
    source: SourceReference;
    description: string;
    skuOrCode: string | null;
    quantity: number;
    unitPrice: Money;
    discount: Discount | null;
    subtotal: Money;
    discountTotal: Money;
    total: Money;
  }) {
    this._id = props.id;
    this._source = props.source;
    this._description = props.description;
    this._skuOrCode = props.skuOrCode;
    this._quantity = props.quantity;
    this._unitPrice = props.unitPrice;
    this._discount = props.discount;
    this._subtotal = props.subtotal;
    this._discountTotal = props.discountTotal;
    this._total = props.total;
    Object.freeze(this);
  }

  /**
   * Factory to create a new SaleItem with full domain invariant enforcement.
   */
  public static create(props: CreateSaleItemProps): SaleItem {
    if (!props.source) {
      throw new InvalidSaleItemException('SourceReference is required for SaleItem.');
    }
    if (
      !props.description ||
      typeof props.description !== 'string' ||
      props.description.trim().length === 0
    ) {
      throw new InvalidSaleItemException('SaleItem description cannot be empty.');
    }
    SaleItem.assertValidQuantity(props.quantity);
    SaleItem.assertValidUnitPrice(props.unitPrice);

    if (
      props.discount !== undefined &&
      props.discount !== null &&
      !(props.discount instanceof Discount)
    ) {
      throw new InvalidSaleItemException('SaleItem discount must be a valid Discount instance.');
    }

    const id = props.id ?? SaleItemId.create();
    const currency = props.unitPrice.currency;
    const normalizedQuantity = Math.round((props.quantity + Number.EPSILON) * 1000) / 1000;
    const subtotal = props.unitPrice.multiply(normalizedQuantity);
    const discountTotal = props.discount
      ? props.discount.calculateReduction(subtotal)
      : Money.zero(currency);
    const total = subtotal.subtract(discountTotal);

    return new SaleItem({
      id,
      source: props.source,
      description: props.description.trim(),
      skuOrCode: props.skuOrCode ? props.skuOrCode.trim() : null,
      quantity: normalizedQuantity,
      unitPrice: props.unitPrice,
      discount: props.discount ?? null,
      subtotal,
      discountTotal,
      total,
    });
  }

  /**
   * Reconstitutes an existing SaleItem from persistence, asserting exact mathematical reconciliation.
   */
  public static reconstitute(props: ReconstituteSaleItemProps): SaleItem {
    if (!props.id) {
      throw new InvalidSaleItemException('SaleItemId is required to reconstitute SaleItem.');
    }
    if (!props.source) {
      throw new InvalidSaleItemException('SourceReference is required to reconstitute SaleItem.');
    }
    if (
      !props.description ||
      typeof props.description !== 'string' ||
      props.description.trim().length === 0
    ) {
      throw new InvalidSaleItemException(
        'Description cannot be empty when reconstituting SaleItem.',
      );
    }
    SaleItem.assertValidQuantity(props.quantity);
    SaleItem.assertValidUnitPrice(props.unitPrice);

    const normalizedQuantity = Math.round((props.quantity + Number.EPSILON) * 1000) / 1000;
    const currency = props.unitPrice.currency;
    const expectedSubtotal = props.unitPrice.multiply(normalizedQuantity);
    const expectedDiscountTotal = props.discount
      ? props.discount.calculateReduction(expectedSubtotal)
      : Money.zero(currency);
    const expectedTotal = expectedSubtotal.subtract(expectedDiscountTotal);

    const providedSubtotal = props.subtotal ?? props.lineSubtotal;
    if (providedSubtotal && !providedSubtotal.equals(expectedSubtotal)) {
      throw new InvalidSaleItemException(
        `Persisted subtotal (${providedSubtotal}) does not reconcile with unitPrice * quantity (${expectedSubtotal}).`,
      );
    }

    const providedDiscountTotal = props.discountTotal ?? props.lineDiscountTotal;
    if (providedDiscountTotal && !providedDiscountTotal.equals(expectedDiscountTotal)) {
      throw new InvalidSaleItemException(
        `Persisted discountTotal (${providedDiscountTotal}) does not reconcile with discount reduction (${expectedDiscountTotal}).`,
      );
    }

    const providedTotal = props.total ?? props.lineTotal;
    if (providedTotal && !providedTotal.equals(expectedTotal)) {
      throw new InvalidSaleItemException(
        `Persisted total (${providedTotal}) does not reconcile with subtotal - discountTotal (${expectedTotal}).`,
      );
    }

    return new SaleItem({
      id: props.id,
      source: props.source,
      description: props.description.trim(),
      skuOrCode: props.skuOrCode ? props.skuOrCode.trim() : null,
      quantity: normalizedQuantity,
      unitPrice: props.unitPrice,
      discount: props.discount ?? null,
      subtotal: expectedSubtotal,
      discountTotal: expectedDiscountTotal,
      total: expectedTotal,
    });
  }

  // --- Getters ---

  public get id(): SaleItemId {
    return this._id;
  }

  public get source(): SourceReference {
    return this._source;
  }

  public get sourceReference(): SourceReference {
    return this._source;
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

  public get discount(): Discount | null {
    return this._discount;
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

  // Compatibility aliases
  public get lineSubtotal(): Money {
    return this._subtotal;
  }

  public get lineDiscountTotal(): Money {
    return this._discountTotal;
  }

  public get lineTotal(): Money {
    return this._total;
  }

  // --- Immutable Mutation Helpers ---

  /**
   * Returns a new SaleItem with updated quantity, preserving entity identity.
   */
  public withQuantity(newQuantity: number): SaleItem {
    SaleItem.assertValidQuantity(newQuantity);
    return SaleItem.create({
      id: this._id,
      source: this._source,
      description: this._description,
      skuOrCode: this._skuOrCode,
      quantity: newQuantity,
      unitPrice: this._unitPrice,
      discount: this._discount,
    });
  }

  /**
   * Returns a new SaleItem with updated line discount, preserving entity identity.
   */
  public withDiscount(discount: Discount | null): SaleItem {
    return SaleItem.create({
      id: this._id,
      source: this._source,
      description: this._description,
      skuOrCode: this._skuOrCode,
      quantity: this._quantity,
      unitPrice: this._unitPrice,
      discount,
    });
  }

  /**
   * @internal Convenience alias returning a new SaleItem with updated quantity.
   */
  public updateQuantity(newQuantity: number): SaleItem {
    return this.withQuantity(newQuantity);
  }

  /**
   * @internal Convenience alias returning a new SaleItem with updated discount.
   */
  public applyDiscount(discount: Discount): SaleItem {
    return this.withDiscount(discount);
  }

  /**
   * @internal Convenience alias returning a new SaleItem with discount removed.
   */
  public removeDiscount(): SaleItem {
    return this.withDiscount(null);
  }

  // --- Invariant Validation Helpers ---

  private static assertValidQuantity(quantity: number): void {
    if (typeof quantity !== 'number' || isNaN(quantity) || !isFinite(quantity)) {
      throw new InvalidSaleItemException(
        `Quantity must be a valid finite number, got: ${quantity}.`,
      );
    }
    if (quantity <= 0) {
      throw new InvalidSaleItemException(
        `Quantity must be strictly positive (> 0), got: ${quantity}.`,
      );
    }
  }

  private static assertValidUnitPrice(unitPrice: Money): void {
    if (!unitPrice || !(unitPrice instanceof Money)) {
      throw new InvalidSaleItemException('SaleItem unitPrice must be a valid Money instance.');
    }
    if (unitPrice.amount < 0) {
      throw new InvalidSaleItemException(
        `SaleItem unitPrice cannot be negative, got: ${unitPrice.amount}.`,
      );
    }
  }
}
