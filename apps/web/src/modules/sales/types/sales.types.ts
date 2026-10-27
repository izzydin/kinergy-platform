import type { SaleStatus } from './sales-query.types';

/**
 * Structured monetary representation ensuring zero IEEE-754 floating point drift
 */
export interface MoneyDTO {
  readonly amount: number;
  readonly currency: string;
  readonly formatted?: string;
  readonly cents?: number;
}

/**
 * Supported commercial origin source types per ADR-0121
 */
export type SaleSourceType =
  | 'INVENTORY_ITEM'
  | 'MEMBERSHIP_PLAN'
  | 'TREATMENT_SESSION'
  | 'CUSTOM_SERVICE'
  | 'FOOD'
  | 'DRINK'
  | 'ROOM_RENTAL'
  | 'POINT_OF_SALE'
  | 'ECOMMERCE';

export const VALID_SALE_SOURCE_TYPES: readonly SaleSourceType[] = [
  'INVENTORY_ITEM',
  'MEMBERSHIP_PLAN',
  'TREATMENT_SESSION',
  'CUSTOM_SERVICE',
  'FOOD',
  'DRINK',
  'ROOM_RENTAL',
  'POINT_OF_SALE',
  'ECOMMERCE',
] as const;

/**
 * Origin source reference payload
 */
export interface SaleSourceReferenceDTO {
  readonly type: string;
  readonly referenceId: string;
  readonly referenceCode?: string | null;
  readonly sourceType?: string;
  readonly sourceId?: string;
  readonly sourceCode?: string | null;
}

export type DiscountType = 'PERCENTAGE' | 'FIXED';

/**
 * Discount specification (item-level or order-level)
 */
export interface OrderDiscountDTO {
  readonly type: DiscountType;
  readonly value: number;
  readonly reason?: string | null;
  readonly amount?: MoneyDTO;
}

/**
 * Sale line item entity projection
 */
export interface SaleItemDTO {
  readonly id: string;
  readonly saleId: string;
  readonly sourceType: string;
  readonly sourceId: string;
  readonly description: string;
  readonly skuOrCode?: string | null;
  readonly quantity: number;
  readonly unitPrice: MoneyDTO;
  readonly discountTotal: MoneyDTO;
  readonly subtotal: MoneyDTO;
  readonly total: MoneyDTO;
  readonly unitPriceAmount?: number;
  readonly discountTotalAmount?: number;
  readonly subtotalAmount?: number;
  readonly totalAmount?: number;
  readonly discount?: OrderDiscountDTO | null;
}

/**
 * Full commercial sale aggregate projection (SaleResponseDto)
 */
export interface SaleDTO {
  readonly id: string;
  readonly tenantId?: string;
  readonly clientId?: string | null;
  readonly currency: string;
  readonly status: SaleStatus;
  readonly sourceReference?: SaleSourceReferenceDTO | null;
  readonly source?: {
    sourceType: string;
    sourceId: string;
    sourceCode?: string | null;
  } | null;
  readonly subtotal: MoneyDTO;
  readonly discountTotal: MoneyDTO;
  readonly total: MoneyDTO;
  readonly subtotalAmount: number;
  readonly discountTotalAmount: number;
  readonly totalAmount: number;
  readonly orderDiscount?: OrderDiscountDTO | null;
  readonly itemCount: number;
  readonly items: SaleItemDTO[];
  readonly version: number;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly completedAt?: string | null;
  readonly cancelledAt?: string | null;
  readonly cancellationReason?: string | null;
  readonly refundedAt?: string | null;
}

/**
 * Compact sale summary representation for tabular listing (SaleSummaryResponseDto)
 */
export interface SaleSummaryDTO {
  readonly id: string;
  readonly tenantId?: string;
  readonly clientId?: string | null;
  readonly currency: string;
  readonly status: SaleStatus;
  readonly sourceReference?: SaleSourceReferenceDTO | null;
  readonly source?: SaleSourceReferenceDTO | null;
  readonly subtotalAmount: number;
  readonly discountTotalAmount: number;
  readonly totalAmount: number;
  readonly subtotal: MoneyDTO;
  readonly discountTotal: MoneyDTO;
  readonly total: MoneyDTO;
  readonly itemCount: number;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly completedAt?: string | null;
  readonly cancelledAt?: string | null;
}

/**
 * Paginated sales response envelope (PaginatedSalesResponseDto)
 */
export interface PaginatedSalesDTO {
  readonly items: SaleSummaryDTO[];
  readonly total: number;
  readonly page: number;
  readonly limit: number;
  readonly totalPages: number;
  readonly hasNextPage: boolean;
  readonly hasPreviousPage: boolean;
}

/**
 * Calculation totals query response (SaleTotalsResponseDto)
 */
export interface SaleTotalsDTO {
  readonly subtotal: MoneyDTO;
  readonly discountTotal: MoneyDTO;
  readonly total: MoneyDTO;
  readonly itemCount: number;
}

/**
 * Request payload for adding a line item to a sale
 */
export interface AddSaleItemInputDTO {
  readonly sourceType: string;
  readonly sourceId: string;
  readonly description: string;
  readonly unitPrice: number;
  readonly quantity: number;
  readonly discount?: {
    type: DiscountType;
    value: number;
    reason?: string;
  };
}

/**
 * Request payload for applying order discount
 */
export interface ApplyDiscountInputDTO {
  readonly type: DiscountType;
  readonly value: number;
  readonly reason?: string;
}

/**
 * Request payload for creating a new sale (CreateSaleRequestDto)
 */
export interface CreateSaleInputDTO {
  readonly clientId?: string;
  readonly currency?: string;
  readonly sourceReference?: {
    type: string;
    referenceId: string;
    referenceCode?: string;
  };
  readonly source?: {
    sourceType: string;
    sourceId: string;
    sourceCode?: string;
  };
  readonly items?: AddSaleItemInputDTO[];
  readonly orderDiscount?: ApplyDiscountInputDTO;
}

/**
 * Request payload for cancelling a sale
 */
export interface CancelSaleInputDTO {
  readonly reason: string;
}

/**
 * Request payload for assigning or updating commercial origin source reference (AssignSaleSourceRequestDto)
 */
export interface AssignSaleSourceInputDTO {
  readonly sourceReference?: {
    readonly type: string;
    readonly referenceId: string;
    readonly referenceCode?: string | null;
  };
  readonly source?: {
    readonly sourceType: string;
    readonly sourceId: string;
    readonly sourceCode?: string | null;
  };
}

/**
 * Request payload for coordinating payment settlement against a sale (CoordinateSalePaymentRequestDto)
 */
export interface CoordinateSalePaymentInputDTO {
  readonly paymentId: string;
}
