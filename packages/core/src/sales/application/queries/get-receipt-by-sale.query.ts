import { ReceiptCurrentUser } from '../shared/receipt-authorization';

export interface GetReceiptBySaleInput {
  readonly saleId: string;
  readonly tenantId?: string;
  readonly currentUser?: ReceiptCurrentUser;
}

/**
 * Query to retrieve the primary Receipt document associated with a specific Sale.
 * Codified by ADR-0117 (Invariant 4 & 11) and Milestone 7.7.
 */
export class GetReceiptBySaleQuery {
  constructor(public readonly input: GetReceiptBySaleInput) {}
}

/**
 * Alias for GetReceiptBySaleQuery following ById naming conventions.
 */
export class GetReceiptBySaleIdQuery extends GetReceiptBySaleQuery {}
