import { ReceiptDomainException } from './receipt-domain.exception';

/**
 * Domain exception thrown when an attempt is made to issue a duplicate primary receipt
 * for an already evidencing Sale within the same tenant.
 * Codified by ADR-0117 (Invariant 10 & 11) and Milestone 7.7.
 */
export class DuplicateReceiptException extends ReceiptDomainException {
  constructor(saleId: string, tenantId: string) {
    super(
      `A primary receipt already exists for sale '${saleId}' in tenant '${tenantId}'. Duplicate receipt issuance is prohibited.`,
      'DUPLICATE_RECEIPT',
    );
    this.name = 'DuplicateReceiptException';
  }
}
