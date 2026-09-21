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
import { PaymentStatus } from '../../../../domain/enums/payment-status.enum';
import { PrismaMoneyMapper } from './prisma-money.mapper';

/**
 * Bidirectional mapper between Domain Payment Aggregate and Prisma Payment Persistence Model.
 *
 * Invariant Guarantees:
 * - Operates entirely without IEEE-754 binary floating-point conversions.
 * - Does NOT calculate payment amounts, subtotals, or discounts.
 * - Reconstitutes pure domain value objects (PaymentId, SaleId, Money, PaymentReference).
 */
export class PrismaPaymentMapper {
  /**
   * Reconstitutes a pure Domain Payment aggregate from a database Prisma record.
   */
  public static toDomain(raw: PrismaPaymentModel): Payment {
    const currency = raw.currency;
    const amount = PrismaMoneyMapper.toMoney(raw.amount, currency);
    const reference = raw.reference ? PaymentReference.create(raw.reference) : null;

    return Payment.reconstitute({
      id: PaymentId.create(raw.id),
      tenantId: raw.tenantId ? raw.tenantId.trim() : 'default',
      saleId: SaleId.create(raw.saleId),
      method: raw.method as unknown as PaymentMethod,
      amount,
      status: raw.status as unknown as PaymentStatus,
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
      status: payment.status as unknown as PrismaPaymentStatus,
      reference: payment.reference ? payment.reference.value : null,
      paidAt: payment.paidAt,
      version: payment.version,
    };
  }
}
