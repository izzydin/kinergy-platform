import {
  Payment as PrismaPaymentModel,
  PaymentMethod as PrismaPaymentMethod,
  PaymentStatus as PrismaPaymentStatus,
} from '@prisma/client';
import { Payment } from '../../../../domain/payment.aggregate';
import { PaymentId } from '../../../../domain/value-objects/payment-id.vo';
import { SaleId } from '../../../../domain/value-objects/sale-id.vo';
import { PaymentReference } from '../../../../domain/value-objects/payment-reference.vo';
import { PaymentMethod } from '../../../../domain/enums/payment-method.enum';
import {
  PaymentStatus,
  assertValidPaymentStatus,
} from '../../../../domain/enums/payment-status.enum';
import { InvalidPaymentStatusException } from '../../../../domain/exceptions/invalid-payment-status.exception';
import { PrismaMoneyMapper } from './prisma-money.mapper';

/**
 * Bidirectional mapper between Domain Payment Aggregate and Prisma Payment Persistence Model.
 *
 * Invariant Guarantees:
 * - Operates entirely without IEEE-754 binary floating-point conversions.
 * - Does NOT calculate payment amounts, subtotals, or discounts.
 * - Reconstitutes pure domain value objects (PaymentId, SaleId, Money, PaymentReference).
 * - Enforces explicit status conversion between Domain PaymentStatus (ADR-0116) and PrismaPaymentStatus.
 */
export class PrismaPaymentMapper {
  /**
   * Converts a Prisma persistence payment status enum to the canonical Domain PaymentStatus.
   * Maps Prisma SETTLED to domain COMPLETED.
   */
  public static toDomainStatus(rawStatus: PrismaPaymentStatus | string): PaymentStatus {
    switch (rawStatus) {
      case PrismaPaymentStatus.PENDING:
      case 'PENDING':
        return PaymentStatus.PENDING;
      case PrismaPaymentStatus.SETTLED:
      case 'COMPLETED':
      case 'SETTLED':
        return PaymentStatus.COMPLETED;
      case PrismaPaymentStatus.FAILED:
      case 'FAILED':
        return PaymentStatus.FAILED;
      case PrismaPaymentStatus.CANCELLED:
      case 'CANCELLED':
        return PaymentStatus.CANCELLED;
      default:
        throw new InvalidPaymentStatusException(rawStatus);
    }
  }

  /**
   * Converts a canonical Domain PaymentStatus to the Prisma persistence enum.
   * Maps domain COMPLETED to Prisma SETTLED.
   */
  public static toPersistenceStatus(domainStatus: PaymentStatus): PrismaPaymentStatus {
    assertValidPaymentStatus(domainStatus);
    switch (domainStatus) {
      case PaymentStatus.PENDING:
        return PrismaPaymentStatus.PENDING;
      case PaymentStatus.COMPLETED:
        return PrismaPaymentStatus.SETTLED;
      case PaymentStatus.FAILED:
        return PrismaPaymentStatus.FAILED;
      case PaymentStatus.CANCELLED:
        return PrismaPaymentStatus.CANCELLED;
    }
  }

  /**
   * Reconstitutes a pure Domain Payment aggregate from a database Prisma record.
   */
  public static toDomain(raw: PrismaPaymentModel): Payment {
    const currency = raw.currency;
    const amount = PrismaMoneyMapper.toMoney(raw.amount, currency);
    const reference = raw.reference ? PaymentReference.create(raw.reference) : null;
    const status = PrismaPaymentMapper.toDomainStatus(raw.status);

    return Payment.reconstitute({
      id: PaymentId.create(raw.id),
      tenantId: raw.tenantId ? raw.tenantId.trim() : 'default',
      saleId: SaleId.create(raw.saleId),
      method: raw.method as unknown as PaymentMethod,
      amount,
      status,
      reference,
      paidAt: raw.paidAt,
      createdAt: raw.createdAt,
      updatedAt: raw.updatedAt,
      version: raw.version,
    });
  }

  /**
   * Converts a pure Domain Payment aggregate into a Prisma persistence model data shape.
   * Preserves exact monetary representation via PrismaMoneyMapper (no IEEE-754 floats).
   */
  public static toPersistence(
    payment: Payment,
  ): Omit<PrismaPaymentModel, 'createdAt' | 'updatedAt'> {
    return {
      id: payment.id.value,
      tenantId: payment.tenantId || null,
      saleId: payment.saleId.value,
      method: payment.method as unknown as PrismaPaymentMethod,
      amount: PrismaMoneyMapper.toDecimal(payment.amount),
      currency: payment.amount.currency,
      status: PrismaPaymentMapper.toPersistenceStatus(payment.status),
      reference: payment.reference ? payment.reference.value : null,
      paidAt: payment.paidAt,
      version: payment.version,
    };
  }
}
