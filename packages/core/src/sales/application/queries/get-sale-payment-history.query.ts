import { RecordPaymentCurrentUser } from '../commands/record-payment.command';

/**
 * Input contract for retrieving the payment history of a specific Sale.
 * Conforms to ADR-0133 Section 5.7 and Milestones 7.5, 7.6, 7.8, and 7.10.
 */
export interface GetSalePaymentHistoryInput {
  /**
   * Unique domain identifier of the target Sale aggregate.
   */
  readonly saleId: string;

  /**
   * Multi-tenant boundary isolation identifier.
   */
  readonly tenantId?: string;

  /**
   * Chronological ordering direction. Defaults to 'asc' (oldest first).
   */
  readonly order?: 'asc' | 'desc';

  /**
   * Alias for order direction in DataTable / REST query conventions.
   */
  readonly sortDirection?: 'asc' | 'desc';

  /**
   * Security execution context representing the authenticated caller.
   */
  readonly currentUser?: RecordPaymentCurrentUser;
}

/**
 * Query to retrieve the complete chronological payment history for a Sale.
 * Classified as a read-only QUERY without side-effects or state mutations.
 */
export class GetSalePaymentHistoryQuery {
  constructor(public readonly input: GetSalePaymentHistoryInput) {}
}
