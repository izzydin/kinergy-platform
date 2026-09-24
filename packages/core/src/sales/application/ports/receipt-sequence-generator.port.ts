import { ReceiptNumber } from '../../domain/value-objects/receipt-number.vo';

/**
 * Port interface for atomic, collision-safe, tenant-partitioned sequence generation.
 * Codified by ADR-0117 and ADR-0118.
 */
export interface ReceiptSequenceGeneratorPort {
  /**
   * Atomically generates the next sequential ReceiptNumber for the given tenant and calendar year.
   * Guarantees strictly monotonic, gap-free, concurrency-safe integer sequences (REC-YYYY-XXXXXX).
   *
   * @param tenantId The tenant isolation identifier
   * @param year Calendar year of issuance
   */
  getNextReceiptNumber(tenantId: string, year: number): Promise<ReceiptNumber>;
}
