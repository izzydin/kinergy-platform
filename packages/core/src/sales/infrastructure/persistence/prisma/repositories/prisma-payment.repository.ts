import { Prisma, PrismaClient, PaymentMethod as PrismaPaymentMethod } from '@prisma/client';
import { Payment } from '../../../../domain/payment.aggregate';
import { PaymentId } from '../../../../domain/value-objects/payment-id.vo';
import { SaleId } from '../../../../domain/value-objects/sale-id.vo';
import { PaymentOptimisticLockException } from '../../../../domain/exceptions/optimistic-lock.exception';
import { PrismaPaymentMapper } from '../mappers/prisma-payment.mapper';
import { PrismaDatabaseErrorMapper } from '../mappers/prisma-database-error.mapper';
import { PrismaSalesUnitOfWork } from '../services/prisma-sales-unit-of-work';
import { PaymentMapper } from '../../../../application/mappers/payment.mapper';
import {
  PaymentRepositoryPort,
  FindPaymentsCriteria,
  FindPaymentsPagination,
  FindPaymentsSort,
  FindPaymentsResult,
} from '../../../../application/ports/payment-repository.port';
import { PaymentStatus } from '../../../../domain/enums/payment-status.enum';

/**
 * Prisma and PostgreSQL implementation of the PaymentRepositoryPort.
 * Enforces:
 * - Isolation from Sale aggregate instances (scalar SaleId reference only).
 * - Exact PostgreSQL DECIMAL(12, 2) monetary storage via PrismaPaymentMapper.
 * - Optimistic Concurrency Control (OCC) against version collisions.
 * - Multi-payment retrieval per Sale (1 Sale -> N Payments).
 * - Ambient unit-of-work transaction participation without leaking ORM handles.
 */
export class PrismaPaymentRepository implements PaymentRepositoryPort {
  constructor(private readonly prisma: PrismaClient) {}

  private get client(): PrismaClient {
    const ambientTx = PrismaSalesUnitOfWork.getCurrentTransactionClient();
    if (ambientTx) {
      return ambientTx as PrismaClient;
    }
    if (
      typeof (this.prisma as unknown as { getClient?: () => PrismaClient }).getClient === 'function'
    ) {
      return (this.prisma as unknown as { getClient: () => PrismaClient }).getClient();
    }
    return this.prisma;
  }

  public async create(payment: Payment): Promise<void> {
    return this.save(payment);
  }

  public async findById(id: PaymentId | string): Promise<Payment | null> {
    const paymentIdStr = typeof id === 'string' ? id.trim() : id.value;

    try {
      const raw = await this.client.payment.findUnique({
        where: { id: paymentIdStr },
      });

      if (!raw) {
        return null;
      }

      return PrismaPaymentMapper.toDomain(raw);
    } catch (error: unknown) {
      throw PrismaDatabaseErrorMapper.mapDatabaseError(error, { paymentId: paymentIdStr });
    }
  }

  public async getById(id: PaymentId | string): Promise<Payment | null> {
    return this.findById(id);
  }

  public async findBySaleId(saleId: SaleId | string): Promise<Payment[]> {
    const saleIdStr = typeof saleId === 'string' ? saleId.trim() : saleId.value;

    try {
      const records = await this.client.payment.findMany({
        where: { saleId: saleIdStr },
        orderBy: { createdAt: 'asc' },
      });

      return records.map((record) => PrismaPaymentMapper.toDomain(record));
    } catch (error: unknown) {
      throw PrismaDatabaseErrorMapper.mapDatabaseError(error, { saleId: saleIdStr });
    }
  }

  public async listBySaleId(saleId: SaleId | string): Promise<Payment[]> {
    return this.findBySaleId(saleId);
  }

  public async findMany(
    criteria: FindPaymentsCriteria,
    pagination: FindPaymentsPagination,
    sort: FindPaymentsSort,
  ): Promise<FindPaymentsResult> {
    const page = Math.max(1, pagination.page);
    const limit = Math.max(1, pagination.limit);
    const skip = (page - 1) * limit;

    const where: Prisma.PaymentWhereInput = {};

    if (criteria.tenantId) {
      where.tenantId = criteria.tenantId;
    }
    if (criteria.saleId) {
      where.saleId = criteria.saleId;
    }
    if (criteria.status) {
      where.status = PrismaPaymentMapper.toPersistenceStatus(criteria.status as PaymentStatus);
    }
    if (criteria.method) {
      where.method = criteria.method as PrismaPaymentMethod;
    }
    if (criteria.createdAtFrom || criteria.createdAtTo) {
      where.createdAt = {
        ...(criteria.createdAtFrom ? { gte: criteria.createdAtFrom } : {}),
        ...(criteria.createdAtTo ? { lte: criteria.createdAtTo } : {}),
      };
    }
    if (criteria.paidAtFrom || criteria.paidAtTo) {
      where.paidAt = {
        ...(criteria.paidAtFrom ? { gte: criteria.paidAtFrom } : {}),
        ...(criteria.paidAtTo ? { lte: criteria.paidAtTo } : {}),
      };
    }

    const direction: 'asc' | 'desc' = sort.direction === 'asc' ? 'asc' : 'desc';
    let orderBy: Prisma.PaymentOrderByWithRelationInput[];

    switch (sort.field) {
      case 'paidAt':
        orderBy = [{ paidAt: direction }, { id: 'asc' }];
        break;
      case 'amount':
        orderBy = [{ amount: direction }, { id: 'asc' }];
        break;
      case 'status':
        orderBy = [{ status: direction }, { id: 'asc' }];
        break;
      case 'createdAt':
      default:
        orderBy = [{ createdAt: direction }, { id: 'asc' }];
        break;
    }

    try {
      const [records, total] = await Promise.all([
        this.client.payment.findMany({
          where,
          orderBy,
          skip,
          take: limit,
        }),
        this.client.payment.count({ where }),
      ]);

      const items = records.map((record) => {
        const domain = PrismaPaymentMapper.toDomain(record);
        return PaymentMapper.toDTO(domain);
      });

      return { items, total };
    } catch (error: unknown) {
      throw PrismaDatabaseErrorMapper.mapDatabaseError(error, {
        saleId: criteria.saleId,
      });
    }
  }

  public async list(
    criteria: FindPaymentsCriteria,
    pagination: FindPaymentsPagination,
    sort: FindPaymentsSort,
  ): Promise<FindPaymentsResult> {
    return this.findMany(criteria, pagination, sort);
  }

  public async withTransaction<T>(work: (repo: PaymentRepositoryPort) => Promise<T>): Promise<T> {
    const client = this.client;
    if (typeof (client as unknown as { $transaction: unknown }).$transaction === 'function') {
      return (
        client as unknown as {
          $transaction: (cb: (tx: PrismaClient) => Promise<T>) => Promise<T>;
        }
      ).$transaction(async (tx: PrismaClient) => {
        const transactionalRepo = new PrismaPaymentRepository(tx);
        return work(transactionalRepo);
      });
    }
    return work(this);
  }

  public async save(payment: Payment): Promise<void> {
    const paymentData = PrismaPaymentMapper.toPersistence(payment);

    const client = this.client;
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
        if (payment.version === 1) {
          // Initial insert or idempotent initial save
          // Guard against stale version 1 overwriting a record that has already progressed past version 1
          const existing = await tx.payment.findUnique({
            where: { id: paymentData.id },
            select: { id: true, version: true },
          });

          if (existing && existing.version > 1) {
            throw new PaymentOptimisticLockException(paymentData.id, existing.version);
          }

          await tx.payment.upsert({
            where: { id: paymentData.id },
            create: paymentData,
            update: paymentData,
          });
        } else {
          // Optimistic concurrency control check against prior version
          const priorVersion = payment.version - 1;
          const result = await tx.payment.updateMany({
            where: {
              id: paymentData.id,
              version: priorVersion,
            },
            data: paymentData,
          });

          if (result.count === 0) {
            throw new PaymentOptimisticLockException(paymentData.id, priorVersion);
          }
        }
      });
    } catch (error: unknown) {
      if (error instanceof PaymentOptimisticLockException) {
        throw error;
      }

      throw PrismaDatabaseErrorMapper.mapDatabaseError(error, {
        paymentId: payment.id.value,
        saleId: payment.saleId.value,
        reference: payment.reference?.value,
      });
    }
  }
}
