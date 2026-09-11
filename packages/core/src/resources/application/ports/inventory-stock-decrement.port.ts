import { ApplicationResult } from '../shared/application-result';
import { StockMutationResultDTO } from '../dtos/stock-mutation-result.dto';

export interface DecrementStockParams {
  readonly itemId: string;
  readonly quantity: number;
  readonly reason: string;
  readonly actorId: string;
  readonly referenceId?: string; // External transaction, order, or checkout ID
  readonly tenantId?: string;
  readonly sellingPrice?: {
    readonly amount: number;
    readonly currency?: string;
  };
}

/**
 * Clean architectural application port through which external domains
 * (such as future Sales, Food Orders, WhatsApp Orders, Subscriptions, or POS)
 * request inventory stock deductions without directly accessing inventory tables.
 *
 * Invariant: The Inventory domain remains the sole authority over:
 * - Current physical stock balance
 * - Non-negative stock constraints
 * - Optimistic Concurrency Control (OCC)
 * - Append-only stock movement logging
 */
export interface InventoryStockDecrementPort {
  /**
   * Requests a stock deduction for a commercial sale or external order.
   * Decrements stock balance, verifies availability, and generates a SALE movement.
   */
  sellStock(params: DecrementStockParams): Promise<ApplicationResult<StockMutationResultDTO>>;
}
