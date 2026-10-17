import type { MoneyDTO } from './sales.types';
import type { PaymentMethod, PaymentStatus } from './payments.types';

/**
 * Customer presentation details frozen at receipt issuance
 */
export interface ReceiptClientSnapshotDTO {
  readonly clientId: string;
  readonly referenceNumber: string | null;
  readonly fullName: string;
  readonly email: string | null;
  readonly phone: string | null;
}

/**
 * Line item snapshot frozen at checkout
 */
export interface ReceiptItemSnapshotDTO {
  readonly itemId: string;
  readonly sourceType: string;
  readonly sourceId: string;
  readonly description: string;
  readonly skuOrCode: string | null;
  readonly quantity: number;
  readonly unitPrice: MoneyDTO;
  readonly discountTotal: MoneyDTO;
  readonly subtotal: MoneyDTO;
  readonly total: MoneyDTO;
}

/**
 * Settled payment tender snapshot evidencing the receipt
 */
export interface ReceiptPaymentSnapshotDTO {
  readonly paymentId: string;
  readonly method: PaymentMethod;
  readonly amount: MoneyDTO;
  readonly status: PaymentStatus;
  readonly reference: string | null;
  readonly paidAt: string | null;
}

/**
 * Authoritative immutable proof-of-purchase receipt document (ReceiptResponseDto)
 */
export interface ReceiptDTO {
  readonly id: string;
  readonly tenantId: string;
  readonly saleId: string;
  readonly receiptNumber: string;
  readonly saleReference: string;
  readonly issuedAt: string;
  readonly clientSnapshot: ReceiptClientSnapshotDTO | null;
  readonly items: ReceiptItemSnapshotDTO[];
  readonly itemCount: number;
  readonly subtotal: MoneyDTO;
  readonly discountTotal: MoneyDTO;
  readonly total: MoneyDTO;
  readonly currency: string;
  readonly payments: ReceiptPaymentSnapshotDTO[];
  readonly paymentMethod: PaymentMethod;
  readonly paymentStatus: PaymentStatus;
}

/**
 * Direct receipt issuance input
 */
export interface IssueReceiptInputDTO {
  readonly saleId?: string;
}
