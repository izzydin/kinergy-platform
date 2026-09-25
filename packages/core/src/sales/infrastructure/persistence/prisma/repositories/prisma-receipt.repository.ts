import { Prisma, PrismaClient } from '@prisma/client';
import { Receipt } from '../../../../domain/receipt.aggregate';
import { ReceiptId } from '../../../../domain/value-objects/receipt-id.vo';
import { SaleId } from '../../../../domain/value-objects/sale-id.vo';
import { ReceiptNumber } from '../../../../domain/value-objects/receipt-number.vo';
import { ReceiptRepositoryPort } from '../../../../application/ports/receipt-repository.port';
import { PrismaReceiptMapper } from '../mappers/prisma-receipt.mapper';
import { PrismaReceiptSequenceGenerator } from '../services/prisma-receipt-sequence.generator';
import { ReceiptOptimisticLockException } from '../../../../domain/exceptions/optimistic-lock.exception';
import { DuplicateReceiptException } from '../../../../domain/exceptions/duplicate-receipt.exception';

/**
 * PostgreSQL and Prisma implementation of the ReceiptRepositoryPort.
 *
 * Enforces:
 * - Isolation and loose references: scalar SaleId foreign reference with onDelete: RESTRICT.
 * - Exact PostgreSQL DECIMAL(12, 2) monetary storage via PrismaReceiptMapper & PrismaMoneyMapper.
 * - Point-in-time embedded JSON snapshots for Client, SaleItems, and Payments (zero runtime joins).
 * - Immutability enforcement: financial snapshot fields are permanently write-once;
 *   only operational reprint metadata can be updated.
 * - Optimistic Concurrency Control (OCC) on reprint updates.
 * - Strict uniqueness and idempotency per (tenantId, saleId).
 * - Atomic gap-free sequence generation via PrismaReceiptSequenceGenerator.
 *
 * Codified by ADR-0110, ADR-0117, and ADR-0118.
 */
export class PrismaReceiptRepository implements ReceiptRepositoryPort {
  private readonly sequenceGenerator: PrismaReceiptSequenceGenerator;

  constructor(private readonly prisma: PrismaClient) {
    this.sequenceGenerator = new PrismaReceiptSequenceGenerator(prisma);
  }

  public async findById(id: ReceiptId | string): Promise<Receipt | null> {
    const receiptIdStr = typeof id === 'string' ? id.trim() : id.value;

    const raw = await this.prisma.receipt.findUnique({
      where: { id: receiptIdStr },
    });

    if (!raw) {
      return null;
    }

    return PrismaReceiptMapper.toDomain(raw);
  }

  public async findBySaleId(saleId: SaleId | string): Promise<Receipt | null> {
    const saleIdStr = typeof saleId === 'string' ? saleId.trim() : saleId.value;

    const raw = await this.prisma.receipt.findFirst({
      where: { saleId: saleIdStr },
    });

    if (!raw) {
      return null;
    }

    return PrismaReceiptMapper.toDomain(raw);
  }

  public async findByReceiptNumber(receiptNumber: ReceiptNumber | string): Promise<Receipt | null> {
    const numberStr =
      typeof receiptNumber === 'string' ? receiptNumber.trim() : receiptNumber.value;

    const raw = await this.prisma.receipt.findFirst({
      where: { receiptNumber: numberStr },
    });

    if (!raw) {
      return null;
    }

    return PrismaReceiptMapper.toDomain(raw);
  }

  public async save(receipt: Receipt): Promise<void> {
    const persistenceData = PrismaReceiptMapper.toPersistence(receipt);

    try {
      await this.prisma.$transaction(async (tx) => {
        if (receipt.version === 1) {
          // Initial issuance: verify uniqueness per (tenantId, saleId)
          const existing = await tx.receipt.findUnique({
            where: {
              unique_tenant_sale_receipt: {
                tenantId: receipt.tenantId,
                saleId: receipt.saleId.value,
              },
            },
            select: { id: true, version: true },
          });

          if (existing) {
            throw new DuplicateReceiptException(receipt.saleId.value, receipt.tenantId);
          }

          await tx.receipt.create({
            data: persistenceData,
          });
        } else {
          // Reprint mutation: explicit immutability protection.
          // Financial totals, items, client, and payment snapshots are strictly read-only.
          const priorVersion = receipt.version - 1;

          const result = await tx.receipt.updateMany({
            where: {
              id: receipt.id.value,
              version: priorVersion,
            },
            data: {
              status: persistenceData.status,
              reprintCount: persistenceData.reprintCount,
              lastReprintedAt: persistenceData.lastReprintedAt,
              version: persistenceData.version,
              updatedAt: persistenceData.updatedAt,
            },
          });

          if (result.count === 0) {
            throw new ReceiptOptimisticLockException(receipt.id.value, priorVersion);
          }
        }
      });
    } catch (error: unknown) {
      if (
        error instanceof DuplicateReceiptException ||
        error instanceof ReceiptOptimisticLockException
      ) {
        throw error;
      }

      if (this.isUniqueConstraintError(error)) {
        throw new DuplicateReceiptException(receipt.saleId.value, receipt.tenantId);
      }

      throw error;
    }
  }

  private isUniqueConstraintError(error: unknown): boolean {
    if (!error || typeof error !== 'object') {
      return false;
    }

    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return true;
    }

    const err = error as { code?: string; message?: string };
    if (err.code === 'P2002' || err.code === '23505') {
      return true;
    }

    if (
      typeof err.message === 'string' &&
      (err.message.includes('unique_tenant_sale_receipt') ||
        err.message.includes('unique_tenant_receipt_number') ||
        err.message.includes('Unique constraint failed'))
    ) {
      return true;
    }

    return false;
  }

  public async getNextReceiptNumber(tenantId: string, year: number): Promise<ReceiptNumber> {
    return this.sequenceGenerator.getNextReceiptNumber(tenantId, year);
  }
}
