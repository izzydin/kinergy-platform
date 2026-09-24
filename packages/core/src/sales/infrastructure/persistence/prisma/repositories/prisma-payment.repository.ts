import { PrismaClient } from '@prisma/client';
import { Payment } from '../../../../domain/payment.aggregate';
import { PaymentId } from '../../../../domain/value-objects/payment-id.vo';
import { SaleId } from '../../../../domain/value-objects/sale-id.vo';
import { PaymentOptimisticLockException } from '../../../../domain/exceptions/optimistic-lock.exception';
import { PrismaPaymentMapper } from '../mappers/prisma-payment.mapper';

import { PaymentRepositoryPort } from '../../../../application/ports/payment-repository.port';

/**
 * Domain repository port contract for autonomous Payment Aggregate Roots.
 * Re-exported for backward compatibility.
 */
export type PaymentRepositoryInterface = PaymentRepositoryPort;

/**
 * Prisma and PostgreSQL implementation of the PaymentRepositoryPort.
 * Enforces:
 * - Isolation from Sale aggregate instances (scalar SaleId reference only).
 * - Exact PostgreSQL DECIMAL(12, 2) monetary storage via PrismaPaymentMapper.
 * - Optimistic Concurrency Control (OCC) against version collisions.
 * - Multi-payment retrieval per Sale (1 Sale -> N Payments).
 */
export class PrismaPaymentRepository implements PaymentRepositoryPort {
  constructor(private readonly prisma: PrismaClient) {}

  public async findById(id: PaymentId | string): Promise<Payment | null> {
    const paymentIdStr = typeof id === 'string' ? id.trim() : id.value;

    const raw = await this.prisma.payment.findUnique({
      where: { id: paymentIdStr },
    });

    if (!raw) {
      return null;
    }

    return PrismaPaymentMapper.toDomain(raw);
  }

  public async findBySaleId(saleId: SaleId | string): Promise<Payment[]> {
    const saleIdStr = typeof saleId === 'string' ? saleId.trim() : saleId.value;

    const records = await this.prisma.payment.findMany({
      where: { saleId: saleIdStr },
      orderBy: { createdAt: 'asc' },
    });

    return records.map((record) => PrismaPaymentMapper.toDomain(record));
  }

  public async save(payment: Payment): Promise<void> {
    const paymentData = PrismaPaymentMapper.toPersistence(payment);

    await this.prisma.$transaction(async (tx) => {
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
  }
}
