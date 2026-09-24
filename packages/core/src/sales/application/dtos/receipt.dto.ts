import { MoneyDTO } from './money.dto';
import { ReceiptStatus } from '../../domain/enums/receipt-status.enum';
import { PaymentMethod } from '../../domain/enums/payment-method.enum';
import { PaymentStatus } from '../../domain/enums/payment-status.enum';

export interface ReceiptClientSnapshotDTO {
  readonly clientId: string;
  readonly referenceNumber: string | null;
  readonly fullName: string;
  readonly email: string | null;
  readonly phone: string | null;
}

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

export interface ReceiptPaymentSnapshotDTO {
  readonly paymentId: string;
  readonly method: PaymentMethod;
  readonly amount: MoneyDTO;
  readonly status: PaymentStatus;
  readonly reference: string | null;
  readonly paidAt: string | null;
}

/**
 * Immutable Application Data Transfer Object representing an issued Receipt voucher.
 * Formatted cleanly for API presentation, audit logs, and zero-loss JSON serialization.
 */
export interface ReceiptDTO {
  readonly id: string;
  readonly tenantId: string;
  readonly saleId: string;
  readonly receiptNumber: string;
  readonly saleReference: string;
  readonly issuedAt: string;
  readonly clientSnapshot: ReceiptClientSnapshotDTO | null;
  readonly items: ReadonlyArray<ReceiptItemSnapshotDTO>;
  readonly itemCount: number;
  readonly subtotal: MoneyDTO;
  readonly discountTotal: MoneyDTO;
  readonly total: MoneyDTO;
  readonly currency: string;
  readonly payments: ReadonlyArray<ReceiptPaymentSnapshotDTO>;
  readonly paymentMethod: PaymentMethod;
  readonly paymentStatus: PaymentStatus;
  readonly status: ReceiptStatus;
  readonly reprintCount: number;
  readonly lastReprintedAt: string | null;
  readonly createdAt: string;
  readonly version: number;
}
