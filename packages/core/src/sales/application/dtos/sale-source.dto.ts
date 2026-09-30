/**
 * DTO representation of Sale commercial origin reference.
 * Defined by ADR-0121 §4.19 ("References Over Ownership").
 */
export interface SaleSourceDTO {
  readonly sourceType: string;
  readonly sourceId: string;
  readonly sourceCode: string | null;
  readonly type: string;
  readonly referenceId: string;
  readonly referenceCode: string | null;
}
