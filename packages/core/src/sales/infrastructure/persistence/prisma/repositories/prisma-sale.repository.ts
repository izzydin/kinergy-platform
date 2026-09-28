import { PrismaClient, Prisma, SaleStatus as PrismaSaleStatus } from '@prisma/client';
import { Sale } from '../../../../domain/sale.aggregate';
import { SaleId } from '../../../../domain/value-objects/sale-id.vo';
import { SourceType } from '../../../../domain/enums/source-type.enum';
import { SaleOptimisticLockException } from '../../../../domain/exceptions/optimistic-lock.exception';
import { InvalidSaleStateException } from '../../../../domain/exceptions/invalid-sale-state.exception';
import { DuplicateSaleException } from '../../../../domain/exceptions/duplicate-sale.exception';
import { PrismaSaleMapper } from '../mappers/prisma-sale.mapper';

import { SaleRepositoryPort } from '../../../../application/ports/sale-repository.port';

export type SaleRepositoryInterface = SaleRepositoryPort;

export class PrismaSaleRepository implements SaleRepositoryPort {
  constructor(private readonly prisma: PrismaClient) {}

  public async findById(id: SaleId | string): Promise<Sale | null> {
    const saleIdStr = typeof id === 'string' ? id.trim() : id.value;

    const raw = await this.prisma.sale.findUnique({
      where: { id: saleIdStr },
      include: {
        items: true,
      },
    });

    if (!raw) {
      return null;
    }

    return PrismaSaleMapper.toDomain(raw);
  }

  public async findBySourceReference(
    sourceType: SourceType,
    sourceId: string,
    tenantId?: string,
  ): Promise<Sale | null> {
    const raw = await this.prisma.sale.findFirst({
      where: {
        sourceType,
        sourceId,
        ...(tenantId ? { tenantId } : {}),
        status: { not: 'CANCELLED' as PrismaSaleStatus },
      },
      include: {
        items: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    if (!raw) {
      return null;
    }

    return PrismaSaleMapper.toDomain(raw);
  }

  public async findBySourceCode(sourceCode: string, tenantId?: string): Promise<Sale | null> {
    const raw = await this.prisma.sale.findFirst({
      where: {
        sourceCode,
        ...(tenantId ? { tenantId } : {}),
        status: { not: 'CANCELLED' as PrismaSaleStatus },
      },
      include: {
        items: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    if (!raw) {
      return null;
    }

    return PrismaSaleMapper.toDomain(raw);
  }

  public async save(sale: Sale): Promise<void> {
    const { sale: saleData, items: itemsData } = PrismaSaleMapper.toPersistence(sale);

    try {
      await this.prisma.$transaction(async (tx) => {
        // Persistence Guard: If record in persistence is already CANCELLED or REFUNDED, reject any mutation.
        // CANCELLED and REFUNDED sales are immutable terminal states; no persistence updates may alter them.
        const existing = await tx.sale.findUnique({
          where: { id: saleData.id },
          select: { status: true, version: true },
        });

        if (existing && (existing.status === 'CANCELLED' || existing.status === 'REFUNDED')) {
          throw new InvalidSaleStateException(
            `Cannot update Sale '${saleData.id}': Sale is already in terminal ${existing.status} status in persistence.`,
            'TERMINAL_SALE_IMMUTABLE',
          );
        }

        if (sale.version === 1) {
          // Concurrency & Status Guard for Version 1:
          // If record already exists with version > 1, reject stale version 1 draft update.
          if (existing && existing.version > 1) {
            throw new SaleOptimisticLockException('Sale', saleData.id, existing.version);
          }

          if (existing && existing.status !== 'DRAFT' && saleData.status === 'DRAFT') {
            throw new InvalidSaleStateException(
              `Cannot regress Sale '${saleData.id}' from status '${existing.status}' back to '${saleData.status}'.`,
              'ILLEGAL_STATUS_REGRESSION',
            );
          }
          // Invariant SALE-010: Operational Single-Billing Entity Protection
          if (
            sale.source.sourceType === SourceType.TREATMENT_SESSION &&
            typeof (tx.sale as unknown as { findFirst?: unknown }).findFirst === 'function'
          ) {
            const existingBySource = await tx.sale.findFirst({
              where: {
                sourceType: sale.source.sourceType,
                sourceId: sale.source.sourceId,
                ...(sale.tenantId ? { tenantId: sale.tenantId } : {}),
                status: { not: 'CANCELLED' as PrismaSaleStatus },
                NOT: { id: saleData.id },
              },
              select: { id: true },
            });

            if (existingBySource) {
              throw new DuplicateSaleException(
                `An active Sale ('${existingBySource.id}') already exists for ${sale.source.sourceType} '${sale.source.sourceId}'. Duplicate sale creation is prohibited.`,
                existingBySource.id,
                saleData.tenantId ?? undefined,
              );
            }
          }

          // Invariant SALE-010: External Order Reference Uniqueness (non-generic POS terminal tag)
          if (
            sale.source.sourceCode &&
            sale.source.sourceCode !== 'POS_REGISTER' &&
            sale.source.sourceCode !== 'pos_checkout_terminal' &&
            typeof (tx.sale as unknown as { findFirst?: unknown }).findFirst === 'function'
          ) {
            const existingByCode = await tx.sale.findFirst({
              where: {
                sourceCode: sale.source.sourceCode,
                ...(sale.tenantId ? { tenantId: sale.tenantId } : {}),
                status: { not: 'CANCELLED' as PrismaSaleStatus },
                NOT: { id: saleData.id },
              },
              select: { id: true },
            });

            if (existingByCode) {
              throw new DuplicateSaleException(
                `An active Sale ('${existingByCode.id}') already exists with order reference '${sale.source.sourceCode}'. Duplicate sale creation is prohibited.`,
                existingByCode.id,
                saleData.tenantId ?? undefined,
              );
            }
          }

          // Initial insert or draft update with full child line-item synchronization
          await tx.sale.upsert({
            where: { id: saleData.id },
            create: {
              ...saleData,
              items: {
                create: itemsData,
              },
            },
            update: {
              ...saleData,
            },
          });

          // Synchronize child items to ensure draft additions at version 1 persist correctly
          const currentItemIds = itemsData.map((item) => item.id);
          await tx.saleItem.deleteMany({
            where: {
              saleId: saleData.id,
              id: { notIn: currentItemIds },
            },
          });

          for (const itemData of itemsData) {
            await tx.saleItem.upsert({
              where: { id: itemData.id },
              create: itemData,
              update: itemData,
            });
          }
        } else {
          // Optimistic concurrency control check against prior version
          const priorVersion = sale.version - 1;
          const result = await tx.sale.updateMany({
            where: {
              id: saleData.id,
              version: priorVersion,
            },
            data: {
              ...saleData,
            },
          });

          if (result.count === 0) {
            throw new SaleOptimisticLockException('Sale', saleData.id, priorVersion);
          }

          // Synchronize child line items: delete removed items and upsert current items
          const currentItemIds = itemsData.map((item) => item.id);
          await tx.saleItem.deleteMany({
            where: {
              saleId: saleData.id,
              id: { notIn: currentItemIds },
            },
          });

          for (const itemData of itemsData) {
            await tx.saleItem.upsert({
              where: { id: itemData.id },
              create: itemData,
              update: itemData,
            });
          }
        }
      });
    } catch (error: unknown) {
      if (
        error instanceof DuplicateSaleException ||
        error instanceof SaleOptimisticLockException ||
        error instanceof InvalidSaleStateException
      ) {
        throw error;
      }

      if (this.isUniqueConstraintError(error)) {
        throw new DuplicateSaleException(
          `Unique constraint violation: A Sale with ID '${sale.id.value}' already exists in persistence.`,
          sale.id.value,
          sale.tenantId,
        );
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
      (err.message.includes('Unique constraint failed') ||
        err.message.includes('duplicate key value'))
    ) {
      return true;
    }

    return false;
  }
}
