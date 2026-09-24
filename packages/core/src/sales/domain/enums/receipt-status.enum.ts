/**
 * Canonical lifecycle state for the Receipt document entity.
 * Codified by ADR-0117.
 *
 * - ISSUED: Official primary legal voucher issued upon full financial settlement of a Sale. Permanently frozen.
 * - REPRINTED: Duplicate copy re-rendered for customer with mandatory duplicate watermark and audit attribution.
 */
export enum ReceiptStatus {
  ISSUED = 'ISSUED',
  REPRINTED = 'REPRINTED',
}

export const VALID_RECEIPT_STATUSES: ReadonlySet<string> = new Set(Object.values(ReceiptStatus));

export function isValidReceiptStatus(status: unknown): status is ReceiptStatus {
  return typeof status === 'string' && VALID_RECEIPT_STATUSES.has(status);
}

export function assertValidReceiptStatus(status: unknown): asserts status is ReceiptStatus {
  if (!isValidReceiptStatus(status)) {
    throw new Error(
      `Invalid ReceiptStatus: '${status}'. Must be one of: ${Array.from(VALID_RECEIPT_STATUSES).join(', ')}.`,
    );
  }
}
