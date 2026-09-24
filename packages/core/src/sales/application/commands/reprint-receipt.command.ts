import { ReceiptCurrentUser } from '../shared/receipt-authorization';

export interface ReprintReceiptInput {
  /**
   * Receipt domain identifier. Either receiptId or saleId must be provided.
   */
  readonly receiptId?: string;

  /**
   * Sale domain identifier to locate the receipt.
   */
  readonly saleId?: string;

  /**
   * Multi-tenant isolation boundary identifier.
   */
  readonly tenantId?: string;

  /**
   * Security principal requesting duplicate reprint.
   */
  readonly currentUser?: ReceiptCurrentUser;

  /**
   * Optional operational justification for audit logging.
   */
  readonly reason?: string;
}

/**
 * Command to record a duplicate reprint of an existing Receipt voucher.
 * Increments operational reprintCount and updates lastReprintedAt without altering commercial data.
 * Codified by ADR-0117.
 */
export class ReprintReceiptCommand {
  constructor(public readonly input: ReprintReceiptInput) {}
}
