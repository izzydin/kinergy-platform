import { Sale } from '../../domain/sale.aggregate';
import { SaleId } from '../../domain/value-objects/sale-id.vo';

/**
 * Port interface for Sale persistence operations within the Sales bounded context.
 * Decouples domain and application logic from concrete database/ORM drivers.
 */
export interface SaleRepositoryPort {
  /**
   * Resolves a Sale aggregate by its unique domain identifier.
   */
  findById(id: SaleId | string): Promise<Sale | null>;

  /**
   * Persists a Sale aggregate (handles initial insertion, line item mutations, and status transitions).
   */
  save(sale: Sale): Promise<void>;
}
