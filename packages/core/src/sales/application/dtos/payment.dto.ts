import { PaymentMethod } from '../../domain/enums/payment-method.enum';
import { PaymentStatus } from '../../domain/enums/payment-status.enum';
import { MoneyDTO } from './money.dto';

/**
 * Immutable Application Data Transfer Object representing a Payment record.
 * Formatted cleanly for API presentation, audit logs, and zero-loss JSON serialization.
 */
export interface PaymentDTO {
  /**
   * Unique UUID domain identifier.
   */
  readonly id: string;

  /**
   * Multi-tenant boundary identifier.
   */
  readonly tenantId: string;

  /**
   * Reference to the associated Sale aggregate root by scalar identifier.
   */
  readonly saleId: string;

  /**
   * Supported payment tender method (e.g. CASH, QR).
   */
  readonly method: PaymentMethod;

  /**
   * Canonical monetary representation with exact integer cents and formatted 2-decimal string.
   */
  readonly amount: MoneyDTO;

  /**
   * Decimal major unit representation of payment amount (e.g., 49.99).
   */
  readonly amountValue: number;

  /**
   * Normalized 3-letter uppercase ISO-4217 currency code (e.g., 'USD').
   */
  readonly currency?: string;

  /**
   * Exact integer amount in minor currency units (cents, e.g., 4999).
   * Eliminates floating-point precision loss across API consumers.
   */
  readonly cents?: number;

  /**
   * Deterministic string representation with exact 2 decimal places (e.g., '49.99').
   */
  readonly formattedAmount?: string;

  /**
   * Current lifecycle state (PENDING, SETTLED, FAILED, CANCELLED).
   */
  readonly status: PaymentStatus;

  /**
   * Optional audit trace, register drawer tag, or gateway transaction reference.
   */
  readonly reference: string | null;

  /**
   * ISO 8601 UTC timestamp of financial settlement, or null if pending/unsettled.
   */
  readonly paidAt: string | null;

  /**
   * ISO 8601 UTC creation timestamp.
   */
  readonly createdAt: string;

  /**
   * ISO 8601 UTC last-modified / lifecycle transition timestamp.
   */
  readonly updatedAt?: string;

  /**
   * Optimistic Concurrency Control integer version sequence.
   */
  readonly version: number;
}
