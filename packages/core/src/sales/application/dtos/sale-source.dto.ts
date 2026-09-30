/**
 * DTO representation of Sale commercial origin reference.
 * Defined by ADR-0121 §4.19.
 */
export interface SaleSourceDTO {
  readonly sourceType: string;
  readonly sourceId: string;
  readonly sourceCode: string | null;
}
