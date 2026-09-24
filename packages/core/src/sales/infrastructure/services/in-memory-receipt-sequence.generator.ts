import { ReceiptNumber } from '../../domain/value-objects/receipt-number.vo';
import { ReceiptSequenceGeneratorPort } from '../../application/ports/receipt-sequence-generator.port';
import { ReceiptDomainException } from '../../domain/exceptions/receipt-domain.exception';

/**
 * Concurrency-safe, deterministic, tenant-partitioned in-memory sequence generator.
 *
 * Implements an asynchronous queue-based critical section (mutex) per `(tenantId, year)` partition.
 * Guarantees:
 * - 100% collision-free sequence numbers under heavy parallel asynchronous load.
 * - Gap-free strictly monotonic integer increment (1, 2, 3, ...).
 * - Multi-tenant isolation: parallel requests for tenant A and tenant B execute concurrently without mutual blocking.
 * - Calendar year partitioning: sequences reset cleanly to 1 on year turnover.
 * - Zero timestamps as uniqueness, zero Math.random(), zero floating point.
 *
 * Codified by ADR-0117 and ADR-0118.
 */
export class InMemoryReceiptSequenceGenerator implements ReceiptSequenceGeneratorPort {
  private readonly counters = new Map<string, number>();
  private readonly queues = new Map<string, Promise<unknown>>();

  /**
   * Generates the next sequential ReceiptNumber for the given tenant and calendar year.
   *
   * @param tenantId The multi-tenant boundary identifier (non-empty).
   * @param year The calendar year (integer between 2000 and 2100).
   * @returns Monotonically incremented, zero-padded ReceiptNumber (e.g. REC-2026-000001).
   */
  public async getNextReceiptNumber(tenantId: string, year: number): Promise<ReceiptNumber> {
    if (!tenantId || typeof tenantId !== 'string' || tenantId.trim().length === 0) {
      throw new ReceiptDomainException(
        'Tenant ID is required to generate a receipt sequence number.',
        'INVALID_TENANT_ID',
      );
    }

    if (!Number.isInteger(year) || year < 2000 || year > 2100) {
      throw new ReceiptDomainException(
        `Invalid calendar year for receipt sequence: '${year}'. Must be an integer between 2000 and 2100.`,
        'INVALID_RECEIPT_NUMBER',
      );
    }

    const partitionKey = `${tenantId.trim()}:${year}`;

    // Queue-based critical section per partition key to prevent race conditions during asynchronous dispatch
    const currentQueue = this.queues.get(partitionKey) ?? Promise.resolve();

    let releaseLock!: () => void;
    const lockPromise = new Promise<void>((resolve) => {
      releaseLock = resolve;
    });

    this.queues.set(
      partitionKey,
      currentQueue.then(
        () => lockPromise,
        () => lockPromise,
      ),
    );

    await currentQueue;

    try {
      const current = this.counters.get(partitionKey) ?? 0;
      const next = current + 1;
      this.counters.set(partitionKey, next);

      return ReceiptNumber.fromParts(year, next);
    } finally {
      releaseLock();
    }
  }

  /**
   * Retrieves the current sequence counter value for a given tenant and year without incrementing it.
   */
  public getCounterValue(tenantId: string, year: number): number {
    return this.counters.get(`${tenantId.trim()}:${year}`) ?? 0;
  }

  /**
   * Resets all sequence counters and lock queues (useful between isolated test fixtures).
   */
  public reset(): void {
    this.counters.clear();
    this.queues.clear();
  }
}
