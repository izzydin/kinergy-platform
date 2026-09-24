import { Receipt } from '../../domain/receipt.aggregate';
import { ReceiptId } from '../../domain/value-objects/receipt-id.vo';
import { SaleId } from '../../domain/value-objects/sale-id.vo';
import { ReceiptNumber } from '../../domain/value-objects/receipt-number.vo';

/**
 * Port interface for Receipt persistence and sequence generation operations.
 * Decouples domain and application logic from concrete database/ORM drivers.
 * Codified by ADR-0117.
 */
export interface ReceiptRepositoryPort {
  /**
   * Resolves a Receipt aggregate by its unique domain identifier.
   */
  findById(id: ReceiptId | string): Promise<Receipt | null>;

  /**
   * Resolves the primary Receipt associated with a given Sale.
   * Enforces 1-to-1 relationship between Sale and primary Receipt.
   */
  findBySaleId(saleId: SaleId | string): Promise<Receipt | null>;

  /**
   * Resolves a Receipt by its human-readable alphanumeric receipt number.
   */
  findByReceiptNumber(receiptNumber: ReceiptNumber | string): Promise<Receipt | null>;

  /**
   * Persists a Receipt aggregate (both initial issuance and subsequent reprint mutations).
   */
  save(receipt: Receipt): Promise<void>;

  /**
   * Atomically generates the next monotonically increasing, gap-free alphanumeric receipt number
   * partitioned by tenant and calendar year (e.g. REC-2026-000001).
   */
  getNextReceiptNumber(tenantId: string, year: number): Promise<ReceiptNumber>;
}
