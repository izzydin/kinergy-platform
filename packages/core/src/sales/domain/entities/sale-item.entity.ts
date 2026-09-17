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
  lineSubtotal: Money;
  lineDiscountTotal: Money;
  lineTotal: Money;
}

/**
 * SaleItem is an internal entity owned exclusively by the Sale aggregate root.
 * Snapshots commercial terms (description, code, price, discount) at the moment of sale.
 */
export class SaleItem {
  private readonly _id: SaleItemId;
  private readonly _source: SourceReference;
  private readonly _description: string;
  private readonly _skuOrCode: string | null;
  private _quantity: number;
  private _unitPrice: Money;
  private _discount: Discount | null;
  private _lineSubtotal: Money;
  private _lineDiscountTotal: Money;
  private _lineTotal: Money;

  private constructor(props: ReconstituteSaleItemProps) {
    this._id = props.id;
    this._source = props.source;
    this._description = props.description;
    this._skuOrCode = props.skuOrCode ?? null;
    this._quantity = props.quantity;
    this._unitPrice = props.unitPrice;
    this._discount = props.discount ?? null;
    this._lineSubtotal = props.lineSubtotal;
    this._lineDiscountTotal = props.lineDiscountTotal;
    this._lineTotal = props.lineTotal;
  }

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
    if (!props.unitPrice || !(props.unitPrice instanceof Money)) {
      throw new InvalidSaleItemException('SaleItem unitPrice must be a valid Money instance.');
    }

    const id = props.id ?? SaleItemId.create();
    const currency = props.unitPrice.currency;
    const lineSubtotal = props.unitPrice.multiply(props.quantity);
    const lineDiscountTotal = props.discount
      ? props.discount.calculateReduction(lineSubtotal)
      : Money.zero(currency);
    const lineTotal = lineSubtotal.subtract(lineDiscountTotal);

    return new SaleItem({
      id,
      source: props.source,
      description: props.description.trim(),
      skuOrCode: props.skuOrCode ? props.skuOrCode.trim() : null,
      quantity: props.quantity,
      unitPrice: props.unitPrice,
      discount: props.discount ?? null,
      lineSubtotal,
      lineDiscountTotal,
      lineTotal,
    });
  }

  public static reconstitute(props: ReconstituteSaleItemProps): SaleItem {
    return new SaleItem(props);
  }

  public get id(): SaleItemId {
    return this._id;
  }

  public get source(): SourceReference {
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

  public get lineSubtotal(): Money {
    return this._lineSubtotal;
  }

  public get lineDiscountTotal(): Money {
    return this._lineDiscountTotal;
  }

  public get lineTotal(): Money {
    return this._lineTotal;
  }

  public updateQuantity(newQuantity: number): void {
    SaleItem.assertValidQuantity(newQuantity);
    this._quantity = newQuantity;
    this.recalculateLineTotals();
  }

  public applyDiscount(discount: Discount): void {
    if (!discount) {
      throw new InvalidSaleItemException('Discount cannot be null or undefined.');
    }
    this._discount = discount;
    this.recalculateLineTotals();
  }

  public removeDiscount(): void {
    this._discount = null;
    this.recalculateLineTotals();
  }

  private recalculateLineTotals(): void {
    this._lineSubtotal = this._unitPrice.multiply(this._quantity);
    this._lineDiscountTotal = this._discount
      ? this._discount.calculateReduction(this._lineSubtotal)
      : Money.zero(this._unitPrice.currency);
    this._lineTotal = this._lineSubtotal.subtract(this._lineDiscountTotal);
  }

  private static assertValidQuantity(quantity: number): void {
    if (typeof quantity !== 'number' || isNaN(quantity) || !isFinite(quantity) || quantity <= 0) {
      throw new InvalidSaleItemException(
        `Quantity must be a finite positive number (> 0), got: ${quantity}.`,
      );
    }
  }
}
