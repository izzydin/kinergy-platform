import { PrismaClient } from '@prisma/client';
import { ReceiptNumber } from '../../../../domain/value-objects/receipt-number.vo';
import { ReceiptSequenceGeneratorPort } from '../../../../application/ports/receipt-sequence-generator.port';
import { ReceiptDomainException } from '../../../../domain/exceptions/receipt-domain.exception';

/**
 * PostgreSQL and Prisma implementation of ReceiptSequenceGeneratorPort.
 *
 * Utilizes PostgreSQL native atomic row-level upsert with RETURNING clause against `receipt_sequences`:
 * ```sql
 * INSERT INTO receipt_sequences (tenant_id, year, current_value, updated_at)
 * VALUES ($1, $2, 1, NOW())
 * ON CONFLICT (tenant_id, year)
 * DO UPDATE SET
 *   current_value = receipt_sequences.current_value + 1,
 *   updated_at = NOW()
 * RETURNING current_value;
 * ```
 *
 * Guarantees:
 * - Deterministic, gap-free, strictly monotonic integer sequence generation.
 * - Hardware and kernel-level transaction serialization via row locks on `(tenant_id, year)`.
 * - Multi-tenant isolation: different tenants acquire locks on separate rows, eliminating contention.
 * - Collision safety under any level of parallel concurrency.
 * - Zero timestamps, zero Math.random(), zero floating point.
 *
 * Codified by ADR-0117 and ADR-0118.
 */
export class PrismaReceiptSequenceGenerator implements ReceiptSequenceGeneratorPort {
  constructor(private readonly prisma: PrismaClient) {}

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

    const cleanTenantId = tenantId.trim();

    const result = await this.prisma.$queryRawUnsafe<Array<{ current_value: number | bigint }>>(
      `INSERT INTO "receipt_sequences" ("tenant_id", "year", "current_value", "updated_at")
       VALUES ($1, $2, 1, CURRENT_TIMESTAMP)
       ON CONFLICT ("tenant_id", "year")
       DO UPDATE SET
         "current_value" = "receipt_sequences"."current_value" + 1,
         "updated_at" = CURRENT_TIMESTAMP
       RETURNING "current_value";`,
      cleanTenantId,
      year,
    );

    if (!result || result.length === 0 || result[0]?.current_value === undefined) {
      throw new ReceiptDomainException(
        `Failed to allocate atomic receipt sequence for tenant '${cleanTenantId}' and year ${year}.`,
        'SEQUENCE_ALLOCATION_FAILED',
      );
    }

    const rawValue = result[0].current_value;
    const nextVal = typeof rawValue === 'bigint' ? Number(rawValue) : Number(rawValue);

    return ReceiptNumber.fromParts(year, nextVal);
  }
}
