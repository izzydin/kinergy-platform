import { MoneyDTO } from './money.dto';
import { ItemDiscountDTO } from './sale-item.dto';

/**
 * Authoritative financial totals projection for a Sale Aggregate.
 * Exposes canonical structured MoneyDTO objects alongside flat numeric projections.
 */
export interface SaleTotalsDTO {
  readonly saleId: string;
  readonly currency: string;
  readonly subtotal: MoneyDTO;
  readonly discountTotal: MoneyDTO;
  readonly total: MoneyDTO;
  readonly subtotalAmount: number;
  readonly discountTotalAmount: number;
  readonly totalAmount: number;
  readonly itemCount: number;
  readonly orderDiscount?: ItemDiscountDTO | null;
}

export type SaleTotalsSummaryDTO = SaleTotalsDTO;
