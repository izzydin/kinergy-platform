import { ReceiptCurrentUser } from '../shared/receipt-authorization';

export interface GetReceiptInput {
  readonly receiptId?: string;
  readonly receiptNumber?: string;
  readonly tenantId?: string;
  readonly currentUser?: ReceiptCurrentUser;
}

/**
 * Query to retrieve an immutable Receipt document by either its internal UUID (receiptId)
 * or human-readable sequential voucher number (receiptNumber).
 * Codified by ADR-0117 (Invariant 10 & 20) and Rule REC-05.
 */
export class GetReceiptQuery {
  constructor(public readonly input: GetReceiptInput) {}
}

/**
 * Convenience query specifically requesting a Receipt by its internal UUID.
 */
export class GetReceiptByIdQuery extends GetReceiptQuery {
  constructor(input: {
    readonly receiptId: string;
    readonly tenantId?: string;
    readonly currentUser?: ReceiptCurrentUser;
  }) {
    super(input);
  }
}
