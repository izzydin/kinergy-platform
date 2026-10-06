import { PrismaClient, Prisma, SaleStatus as PrismaSaleStatus } from '@prisma/client';
import { Sale } from '../../../../domain/sale.aggregate';
import { SaleId } from '../../../../domain/value-objects/sale-id.vo';
import { Money } from '../../../../domain/value-objects/money.vo';
import { SourceType } from '../../../../domain/enums/source-type.enum';
import { SaleSourceType } from '../../../../domain/enums/sale-source-type.enum';
import { SaleOptimisticLockException } from '../../../../domain/exceptions/optimistic-lock.exception';
import { InvalidSaleStateException } from '../../../../domain/exceptions/invalid-sale-state.exception';
import { DuplicateSaleException } from '../../../../domain/exceptions/duplicate-sale.exception';
import { PrismaSaleMapper } from '../mappers/prisma-sale.mapper';
import { PrismaDatabaseErrorMapper } from '../mappers/prisma-database-error.mapper';

import {
  SaleRepositoryPort,
  FindSalesCriteria,
  FindSalesPagination,
  FindSalesSort,
  FindSalesResult,
} from '../../../../application/ports/sale-repository.port';
import { SaleSummaryDTO } from '../../../../application/dtos/sale.dto';
import { MoneyMapper } from '../../../../application/mappers/money.mapper';

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

  public async getById(id: SaleId | string): Promise<Sale | null> {
    return this.findById(id);
  }

  public async findBySourceReference(
    sourceType: SourceType | SaleSourceType | string,
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

  public async findMany(
    criteria: FindSalesCriteria,
    pagination: FindSalesPagination,
    sort: FindSalesSort,
  ): Promise<FindSalesResult> {
    const page = Math.max(1, pagination.page);
    const limit = Math.max(1, pagination.limit);
    const skip = (page - 1) * limit;

    const where: Prisma.SaleWhereInput = {};

    if (criteria.tenantId) {
      where.tenantId = criteria.tenantId;
    }
    if (criteria.clientId) {
      where.clientId = criteria.clientId;
    }
    if (criteria.status) {
      where.status = criteria.status as PrismaSaleStatus;
    }
    if (criteria.sourceType) {
      where.sourceType = criteria.sourceType;
    }
    if (criteria.sourceReferenceId) {
      where.sourceId = criteria.sourceReferenceId;
    }
    if (criteria.fromDate || criteria.toDate) {
      where.createdAt = {
        ...(criteria.fromDate ? { gte: criteria.fromDate } : {}),
        ...(criteria.toDate ? { lte: criteria.toDate } : {}),
      };
    }

    const direction: 'asc' | 'desc' = sort.direction === 'asc' ? 'asc' : 'desc';
    let orderBy: Prisma.SaleOrderByWithRelationInput[];

    switch (sort.field) {
      case 'total':
        orderBy = [{ totalAmount: direction }, { id: 'asc' }];
        break;
      case 'status':
        orderBy = [{ status: direction }, { id: 'asc' }];
        break;
      case 'createdAt':
      default:
        orderBy = [{ createdAt: direction }, { id: 'asc' }];
        break;
    }

    const [records, total] = await Promise.all([
      this.prisma.sale.findMany({
        where,
        orderBy,
        skip,
        take: limit,
        include: {
          _count: {
            select: { items: true },
          },
        },
      }),
      this.prisma.sale.count({ where }),
    ]);

    const items: SaleSummaryDTO[] = records.map((record) => {
      const currency = record.currency;
      const subtotalDto = MoneyMapper.toDTO(
        Money.create(record.subtotalAmount.toString(), currency),
      );
      const discountTotalDto = MoneyMapper.toDTO(
        Money.create(record.discountTotalAmount.toString(), currency),
      );
      const totalDto = MoneyMapper.toDTO(Money.create(record.totalAmount.toString(), currency));

      return {
        id: record.id,
        tenantId: record.tenantId ?? undefined,
        clientId: record.clientId ?? undefined,
        currency,
        status: record.status,
        source: {
          sourceType: record.sourceType,
          sourceId: record.sourceId,
          sourceCode: record.sourceCode ?? null,
          type: record.sourceType,
          referenceId: record.sourceId,
          referenceCode: record.sourceCode ?? null,
        },
        subtotal: subtotalDto,
        discountTotal: discountTotalDto,
        total: totalDto,
        subtotalAmount: subtotalDto.amount,
        discountTotalAmount: discountTotalDto.amount,
        totalAmount: totalDto.amount,
        itemCount: record._count?.items ?? 0,
        createdAt: record.createdAt.toISOString(),
        updatedAt: record.updatedAt.toISOString(),
      };
    });

    return {
      items,
      total,
    };
  }

  public async list(
    criteria: FindSalesCriteria,
    pagination: FindSalesPagination,
    sort: FindSalesSort,
  ): Promise<FindSalesResult> {
    return this.findMany(criteria, pagination, sort);
  }

  public async withTransaction<T>(work: (repo: SaleRepositoryPort) => Promise<T>): Promise<T> {
    const client = this.prisma;
    if (typeof (client as unknown as { $transaction: unknown }).$transaction === 'function') {
      return (
        client as unknown as {
          $transaction: (cb: (tx: PrismaClient) => Promise<T>) => Promise<T>;
        }
      ).$transaction(async (tx: PrismaClient) => {
        const transactionalRepo = new PrismaSaleRepository(tx);
        return work(transactionalRepo);
      });
    }
    return work(this);
  }

  public async save(sale: Sale): Promise<void> {
    const { sale: saleData, items: itemsData } = PrismaSaleMapper.toPersistence(sale);

    const client = this.prisma;
    const runInTx =
      typeof (client as unknown as { $transaction: unknown }).$transaction === 'function'
        ? (cb: (tx: PrismaClient) => Promise<void>) =>
            (
              client as unknown as {
                $transaction: (cb: (tx: PrismaClient) => Promise<void>) => Promise<void>;
              }
            ).$transaction(cb)
        : (cb: (tx: PrismaClient) => Promise<void>) => cb(client);

    try {
      await runInTx(async (tx) => {
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
          const isClinicalSession =
            sale.source.sourceType === SourceType.TREATMENT_SESSION ||
            (sale.source.sourceType as unknown) === 'KINESIOLOGY_SESSION' ||
            (sale.source.sourceType as unknown) === 'TREATMENT_SESSION';

          if (
            isClinicalSession &&
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

          // Initial insert or draft update with full child line-item synchronization.
          // On update of existing draft record, atomically advance version to 2 so concurrent v1 updates collide.
          const targetVersion = existing ? 2 : 1;

          await tx.sale.upsert({
            where: { id: saleData.id },
            create: {
              ...saleData,
              version: 1,
              items: {
                create: itemsData,
              },
            },
            update: {
              ...saleData,
              version: targetVersion,
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
          // Optimistic concurrency control check:
          // 1. If status is NOT DRAFT (finalize, cancel, markPaid, markCompleted, markRefunded):
          //    The domain explicitly incremented this._version++ on state transition.
          //    Expected prior version is strictly sale.version - 1, targetVersion is sale.version.
          // 2. If status IS DRAFT (consecutive intra-draft mutations like AddSaleItem, RemoveSaleItem, ApplyDiscount):
          //    The domain did not increment version. Expected prior version is existing.version,
          //    and targetVersion is existing.version + 1.
          const isTransition = sale.status !== 'DRAFT';
          const priorVersion = isTransition ? sale.version - 1 : sale.version;
          const targetVersion = priorVersion + 1;

          const result = await tx.sale.updateMany({
            where: {
              id: saleData.id,
              version: priorVersion,
            },
            data: {
              ...saleData,
              version: targetVersion,
            },
          });

          if (result.count === 0) {
            throw new SaleOptimisticLockException('Sale', saleData.id, priorVersion);
          }

          // Keep in-memory aggregate version synchronized
          (sale as unknown as { _version: number })._version = targetVersion;

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

      const checkError = PrismaDatabaseErrorMapper.mapCheckConstraintError(error);
      if (checkError) {
        throw checkError;
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
