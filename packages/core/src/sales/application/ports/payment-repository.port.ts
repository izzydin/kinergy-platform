import { Payment } from '../../domain/payment.aggregate';
import { PaymentId } from '../../domain/value-objects/payment-id.vo';
import { SaleId } from '../../domain/value-objects/sale-id.vo';

/**
 * Port interface for Payment persistence operations.
 * Decouples domain and application logic from concrete database/ORM drivers.
 */
export interface PaymentRepositoryPort {
  /**
   * Resolves a Payment aggregate by its unique domain identifier.
   */
  findById(id: PaymentId | string): Promise<Payment | null>;

  /**
   * Retrieves all Payment aggregates associated with a given Sale.
   */
  findBySaleId(saleId: SaleId | string): Promise<Payment[]>;

  /**
   * Persists a Payment aggregate (handles both initial creation and lifecycle updates).
   */
  save(payment: Payment): Promise<void>;
}
