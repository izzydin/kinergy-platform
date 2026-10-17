import type { MoneyDTO } from './sales.types';

/**
 * Supported payment tender methods (matches backend PaymentMethod enum)
 */
export type PaymentMethod =
  | 'CASH'
  | 'CARD'
  | 'BANK_TRANSFER'
  | 'QR'
  | 'WALLET'
  | 'CREDIT_BALANCE'
  | 'COMPLIMENTARY'
  | 'OTHER';

export const VALID_PAYMENT_METHODS: readonly PaymentMethod[] = [
  'CASH',
  'CARD',
  'BANK_TRANSFER',
  'QR',
  'WALLET',
  'CREDIT_BALANCE',
  'COMPLIMENTARY',
  'OTHER',
] as const;

/**
 * Payment lifecycle state (matches backend PaymentStatus enum)
 */
export type PaymentStatus = 'PENDING' | 'COMPLETED' | 'FAILED' | 'CANCELLED';

export const VALID_PAYMENT_STATUSES: readonly PaymentStatus[] = [
  'PENDING',
  'COMPLETED',
  'FAILED',
  'CANCELLED',
] as const;

/**
 * Summary payment response for listings and order histories (PaymentSummaryResponseDto)
 */
export interface PaymentSummaryDTO {
  readonly id: string;
  readonly saleId: string;
  readonly method: PaymentMethod;
  readonly amount: MoneyDTO;
  readonly amountValue: number;
  readonly status: PaymentStatus;
  readonly reference: string | null;
  readonly paidAt: string | null;
  readonly createdAt: string;
}

/**
 * Full payment aggregate response (PaymentResponseDto)
 */
export interface PaymentDTO extends PaymentSummaryDTO {
  readonly version: number;
}

/**
 * Payment detail projection (PaymentDetailResponseDto)
 */
export type PaymentDetailDTO = PaymentDTO;

/**
 * Query filter parameters for payments listing (ListPaymentsQueryDto)
 */
export interface ListPaymentsQueryParams {
  readonly page?: number;
  readonly limit?: number;
  readonly sort?: string;
  readonly saleId?: string;
  readonly status?: PaymentStatus;
  readonly method?: PaymentMethod;
  readonly fromDate?: string;
  readonly toDate?: string;
}

/**
 * Paginated payments response envelope (PaginatedPaymentsResponseDto)
 */
export interface PaginatedPaymentsDTO {
  readonly items: PaymentSummaryDTO[];
  readonly total: number;
  readonly page: number;
  readonly limit: number;
  readonly totalPages: number;
  readonly hasNextPage: boolean;
  readonly hasPreviousPage: boolean;
}

/**
 * Request payload to record a tender payment (RecordPaymentRequestDto)
 */
export interface RecordPaymentInputDTO {
  readonly saleId?: string;
  readonly amount: number | { amount: number; currency: string; cents?: number };
  readonly method: PaymentMethod;
  readonly reference?: string;
  readonly status?: PaymentStatus;
}

/**
 * Request payload to complete/settle a pending payment (SettlePaymentRequestDto)
 */
export interface SettlePaymentInputDTO {
  readonly paidAt?: string;
  readonly reference?: string;
}

/**
 * Request payload to cancel/void a pending payment (CancelPaymentRequestDto)
 */
export interface CancelPaymentInputDTO {
  readonly reason?: string;
}
