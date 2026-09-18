import { MoneyDTO } from './money.dto';

export interface ItemDiscountDTO {
  readonly type: string;
  readonly value: number;
  readonly reason: string | null;
}

export interface SaleItemDTO {
  readonly id: string;
  readonly sourceType: string;
  readonly sourceId: string;
  readonly sourceCode: string | null;
  readonly description: string;
  readonly skuOrCode: string | null;
  readonly quantity: number;
  readonly unitPrice: MoneyDTO;
  readonly unitPriceAmount: number;
  readonly subtotal: MoneyDTO;
  readonly subtotalAmount: number;
  readonly discount: ItemDiscountDTO | null;
  readonly discountTotal: MoneyDTO;
  readonly discountTotalAmount: number;
  readonly total: MoneyDTO;
  readonly totalAmount: number;
  readonly currency: string;
}
