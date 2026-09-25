import { ReceiptCurrentUser } from '../shared/receipt-authorization';
import { ClientSummaryPayload } from '../ports/client-facade.port';

export interface IssueReceiptInput {
  /**
   * Optional client-specified idempotency receipt domain identifier.
   */
  readonly receiptId?: string;

  /**
   * Target Sale domain identifier.
   */
  readonly saleId: string;

  /**
   * Optional multi-tenant isolation context.
   */
  readonly tenantId?: string;

  /**
   * Optional security principal context.
   */
  readonly currentUser?: ReceiptCurrentUser;

  /**
   * Optional client presentation summary. If omitted, will be queried via ClientFacadePort.
   */
  readonly clientSummary?: ClientSummaryPayload | null;

  /**
   * Optional human-readable order reference override. Defaults to saleId.
   */
  readonly saleReference?: string;
}

/**
 * Command to issue an immutable customer receipt voucher for an already-settled Sale.
 * Strictly idempotent: repeatedly executing this command returns the existing receipt.
 * Codified by ADR-0117.
 */
export class IssueReceiptCommand {
  constructor(public readonly input: IssueReceiptInput) {}
}
