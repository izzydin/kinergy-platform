import {
  Receipt as PrismaReceiptModel,
  ReceiptStatus as PrismaReceiptStatus,
  Prisma,
} from '@prisma/client';
import { Receipt } from '../../../../domain/receipt.aggregate';
import { ReceiptId } from '../../../../domain/value-objects/receipt-id.vo';
import { ReceiptNumber } from '../../../../domain/value-objects/receipt-number.vo';
import { SaleId } from '../../../../domain/value-objects/sale-id.vo';
import { Money } from '../../../../domain/value-objects/money.vo';
import { ReceiptClientSnapshot } from '../../../../domain/value-objects/receipt-client-snapshot.vo';
import { ReceiptItemSnapshot } from '../../../../domain/value-objects/receipt-item-snapshot.vo';
import { ReceiptPaymentSnapshot } from '../../../../domain/value-objects/receipt-payment-snapshot.vo';
import { ReceiptStatus } from '../../../../domain/enums/receipt-status.enum';
import { PaymentMethod } from '../../../../domain/enums/payment-method.enum';
import { PaymentStatus } from '../../../../domain/enums/payment-status.enum';
import { PrismaMoneyMapper } from './prisma-money.mapper';
import { ReceiptDomainException } from '../../../../domain/exceptions/receipt-domain.exception';

export interface SerializedClientSnapshot {
  clientId: string;
  referenceNumber: string | null;
  fullName: string;
  email: string | null;
  phone: string | null;
}

export interface SerializedItemSnapshot {
  itemId: string;
  sourceType: string;
  sourceId: string;
  description: string;
  skuOrCode: string | null;
  quantity: number;
  unitPrice: {
    amount: number;
    cents: number;
    currency: string;
  };
  discountTotal?: {
    amount: number;
    cents: number;
    currency: string;
  } | null;
  subtotal: {
    amount: number;
    cents: number;
    currency: string;
  };
  total: {
    amount: number;
    cents: number;
    currency: string;
  };
}

export interface SerializedPaymentSnapshot {
  paymentId: string;
  method: string;
  status: string;
  amount: {
    amount: number;
    cents: number;
    currency: string;
  };
  reference: string | null;
  paidAt: string | null;
}

export type PrismaReceiptPersistenceInput = {
  id: string;
  tenantId: string;
  saleId: string;
  receiptNumber: string;
  saleReference: string;
  issuedAt: Date;
  clientSnapshot: Prisma.InputJsonValue | Prisma.NullableJsonNullValueInput;
  itemsSnapshot: Prisma.InputJsonValue;
  paymentsSnapshot: Prisma.InputJsonValue;
  subtotalAmount: Prisma.Decimal;
  discountTotalAmount: Prisma.Decimal;
  totalAmount: Prisma.Decimal;
  currency: string;
  status: PrismaReceiptStatus;
  reprintCount: number;
  lastReprintedAt: Date | null;
  version: number;
  createdAt: Date;
  updatedAt: Date;
};

/**
 * Bidirectional mapper between Domain Receipt Aggregate and Prisma Receipt Persistence Model.
 *
 * Guarantees:
 * - Operates entirely without IEEE-754 binary floating-point conversions.
 * - Stores canonical exact monetary values in PostgreSQL DECIMAL(12, 2) columns via PrismaMoneyMapper.
 * - Preserves self-contained point-in-time snapshots for Client, SaleItems, and Payments.
 * - Enforces legal immutability and write-once data integrity.
 * Codified by ADR-0110, ADR-0117, and ADR-0118.
 */
export class PrismaReceiptMapper {
  public static toPersistence(receipt: Receipt): PrismaReceiptPersistenceInput {
    let clientSnapshot: Prisma.InputJsonValue | Prisma.NullableJsonNullValueInput = Prisma.DbNull;

    if (receipt.clientSnapshot) {
      const serializedClient: SerializedClientSnapshot = {
        clientId: receipt.clientSnapshot.clientId,
        referenceNumber: receipt.clientSnapshot.referenceNumber,
        fullName: receipt.clientSnapshot.fullName,
        email: receipt.clientSnapshot.email,
        phone: receipt.clientSnapshot.phone,
      };
      clientSnapshot = serializedClient as unknown as Prisma.InputJsonValue;
    }

    const itemsSnapshot: SerializedItemSnapshot[] = receipt.items.map((item) => ({
      itemId: item.itemId,
      sourceType: item.sourceType,
      sourceId: item.sourceId,
      description: item.description,
      skuOrCode: item.skuOrCode,
      quantity: item.quantity,
      unitPrice: {
        amount: item.unitPrice.amount,
        cents: item.unitPrice.cents,
        currency: item.unitPrice.currency,
      },
      discountTotal: item.discountTotal
        ? {
            amount: item.discountTotal.amount,
            cents: item.discountTotal.cents,
            currency: item.discountTotal.currency,
          }
        : null,
      subtotal: {
        amount: item.subtotal.amount,
        cents: item.subtotal.cents,
        currency: item.subtotal.currency,
      },
      total: {
        amount: item.total.amount,
        cents: item.total.cents,
        currency: item.total.currency,
      },
    }));

    const paymentsSnapshot: SerializedPaymentSnapshot[] = receipt.payments.map((p) => ({
      paymentId: p.paymentId,
      method: p.method,
      status: p.status,
      amount: {
        amount: p.amount.amount,
        cents: p.amount.cents,
        currency: p.amount.currency,
      },
      reference: p.reference,
      paidAt: p.paidAt ? p.paidAt.toISOString() : null,
    }));

    return {
      id: receipt.id.value,
      tenantId: receipt.tenantId,
      saleId: receipt.saleId.value,
      receiptNumber: receipt.receiptNumber.value,
      saleReference: receipt.saleReference,
      issuedAt: receipt.issuedAt,
      clientSnapshot,
      itemsSnapshot: itemsSnapshot as unknown as Prisma.InputJsonValue,
      paymentsSnapshot: paymentsSnapshot as unknown as Prisma.InputJsonValue,
      subtotalAmount: PrismaMoneyMapper.toDecimal(receipt.subtotal),
      discountTotalAmount: PrismaMoneyMapper.toDecimal(receipt.discountTotal),
      totalAmount: PrismaMoneyMapper.toDecimal(receipt.total),
      currency: receipt.total.currency,
      status: receipt.status as unknown as PrismaReceiptStatus,
      reprintCount: receipt.reprintCount,
      lastReprintedAt: receipt.lastReprintedAt,
      version: receipt.version,
      createdAt: receipt.createdAt,
      updatedAt: receipt.updatedAt,
    };
  }

  public static toDomain(raw: PrismaReceiptModel): Receipt {
    const currency = raw.currency;

    let clientSnapshot: ReceiptClientSnapshot | null = null;
    if (raw.clientSnapshot && typeof raw.clientSnapshot === 'object') {
      const cs = raw.clientSnapshot as unknown as SerializedClientSnapshot;
      if (cs.clientId && cs.fullName) {
        clientSnapshot = ReceiptClientSnapshot.create({
          clientId: cs.clientId,
          referenceNumber: cs.referenceNumber ?? null,
          fullName: cs.fullName,
          email: cs.email ?? null,
          phone: cs.phone ?? null,
        });
      }
    }

    if (!Array.isArray(raw.itemsSnapshot)) {
      throw new ReceiptDomainException(
        `Corrupted itemsSnapshot in receipt '${raw.id}': expected array.`,
        'CORRUPTED_PERSISTENCE_STATE',
      );
    }

    const items: ReceiptItemSnapshot[] = (
      raw.itemsSnapshot as unknown as SerializedItemSnapshot[]
    ).map((rawItem) => {
      const unitPrice = Money.create(rawItem.unitPrice.amount, currency);
      const subtotal = Money.create(rawItem.subtotal.amount, currency);
      const total = Money.create(rawItem.total.amount, currency);
      const discountTotal =
        rawItem.discountTotal && rawItem.discountTotal.amount > 0
          ? Money.create(rawItem.discountTotal.amount, currency)
          : undefined;

      return ReceiptItemSnapshot.create({
        itemId: rawItem.itemId,
        sourceType: rawItem.sourceType,
        sourceId: rawItem.sourceId,
        description: rawItem.description,
        skuOrCode: rawItem.skuOrCode ?? null,
        quantity: rawItem.quantity,
        unitPrice,
        discountTotal,
        subtotal,
        total,
      });
    });

    if (!Array.isArray(raw.paymentsSnapshot) || raw.paymentsSnapshot.length === 0) {
      throw new ReceiptDomainException(
        `Corrupted paymentsSnapshot in receipt '${raw.id}': expected non-empty array.`,
        'CORRUPTED_PERSISTENCE_STATE',
      );
    }

    const payments: ReceiptPaymentSnapshot[] = (
      raw.paymentsSnapshot as unknown as SerializedPaymentSnapshot[]
    ).map((rawPayment) => {
      const amount = Money.create(rawPayment.amount.amount, currency);
      const paidAt = rawPayment.paidAt ? new Date(rawPayment.paidAt) : null;

      return ReceiptPaymentSnapshot.create({
        paymentId: rawPayment.paymentId,
        method: rawPayment.method as PaymentMethod,
        status: PaymentStatus.COMPLETED,
        amount,
        reference: rawPayment.reference ?? null,
        paidAt,
      });
    });

    return Receipt.reconstitute({
      id: ReceiptId.create(raw.id),
      tenantId: raw.tenantId,
      saleId: SaleId.create(raw.saleId),
      receiptNumber: ReceiptNumber.create(raw.receiptNumber),
      saleReference: raw.saleReference,
      issuedAt: new Date(raw.issuedAt),
      clientSnapshot,
      items,
      subtotal: PrismaMoneyMapper.toMoney(raw.subtotalAmount, currency),
      discountTotal: PrismaMoneyMapper.toMoney(raw.discountTotalAmount, currency),
      total: PrismaMoneyMapper.toMoney(raw.totalAmount, currency),
      payments,
      status: raw.status as unknown as ReceiptStatus,
      reprintCount: raw.reprintCount,
      lastReprintedAt: raw.lastReprintedAt ? new Date(raw.lastReprintedAt) : null,
      version: raw.version,
      createdAt: new Date(raw.createdAt),
      updatedAt: new Date(raw.updatedAt),
    });
  }
}
