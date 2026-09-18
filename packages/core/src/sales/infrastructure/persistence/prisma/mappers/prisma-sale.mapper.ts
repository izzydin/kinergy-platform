import {
  Sale as PrismaSaleModel,
  SaleItem as PrismaSaleItemModel,
  SaleStatus as PrismaSaleStatus,
  Prisma,
} from '@prisma/client';
import { Sale } from '../../../../domain/sale.aggregate';
import { SaleId } from '../../../../domain/value-objects/sale-id.vo';
import { SourceReference } from '../../../../domain/value-objects/source-reference.vo';
import { SourceType } from '../../../../domain/enums/source-type.enum';
import { SaleStatus } from '../../../../domain/enums/sale-status.enum';
import { Discount } from '../../../../domain/value-objects/discount.vo';
import { DiscountType } from '../../../../domain/enums/discount-type.enum';
import { PrismaMoneyMapper } from './prisma-money.mapper';
import { PrismaSaleItemMapper } from './prisma-sale-item.mapper';

export type PrismaSaleWithItems = PrismaSaleModel & {
  items?: PrismaSaleItemModel[];
};

export class PrismaSaleMapper {
  public static toDomain(raw: PrismaSaleWithItems): Sale {
    const currency = raw.currency;

    let orderDiscount: Discount | null = null;
    if (
      raw.orderDiscountType &&
      raw.orderDiscountValue !== null &&
      raw.orderDiscountValue !== undefined
    ) {
      const orderDiscountValueNum = parseFloat(raw.orderDiscountValue.toString());
      orderDiscount = Discount.create({
        type: raw.orderDiscountType as DiscountType,
        value: orderDiscountValueNum,
        reason: raw.orderDiscountReason ?? null,
      });
    }

    const items = raw.items ? raw.items.map(PrismaSaleItemMapper.toDomain) : [];

    return Sale.reconstitute({
      id: SaleId.create(raw.id),
      tenantId: raw.tenantId ?? undefined,
      clientId: raw.clientId ?? undefined,
      status: raw.status as unknown as SaleStatus,
      currency,
      source: SourceReference.create({
        sourceType: raw.sourceType as SourceType,
        sourceId: raw.sourceId,
        sourceCode: raw.sourceCode ?? undefined,
      }),
      orderDiscount,
      items,
      subtotal: PrismaMoneyMapper.toMoney(raw.subtotalAmount, currency),
      discountTotal: PrismaMoneyMapper.toMoney(raw.discountTotalAmount, currency),
      total: PrismaMoneyMapper.toMoney(raw.totalAmount, currency),
      cancellationReason: raw.cancellationReason ?? undefined,
      cancelledAt: raw.cancelledAt ?? undefined,
      completedAt: raw.completedAt ?? undefined,
      refundedAt: raw.refundedAt ?? undefined,
      version: raw.version,
      createdAt: raw.createdAt,
      updatedAt: raw.updatedAt,
    });
  }

  public static toPersistence(sale: Sale): {
    sale: Omit<PrismaSaleModel, 'createdAt' | 'updatedAt'>;
    items: Omit<PrismaSaleItemModel, 'createdAt' | 'updatedAt'>[];
  } {
    const saleData: Omit<PrismaSaleModel, 'createdAt' | 'updatedAt'> = {
      id: sale.id.value,
      tenantId: sale.tenantId ?? null,
      clientId: sale.clientId ?? null,
      status: sale.status as unknown as PrismaSaleStatus,
      currency: sale.currency,
      sourceType: sale.source.sourceType,
      sourceId: sale.source.sourceId,
      sourceCode: sale.source.sourceCode ?? null,
      subtotalAmount: PrismaMoneyMapper.toDecimal(sale.subtotal),
      discountTotalAmount: PrismaMoneyMapper.toDecimal(sale.discountTotal),
      totalAmount: PrismaMoneyMapper.toDecimal(sale.total),
      orderDiscountType: sale.orderDiscount ? sale.orderDiscount.type : null,
      orderDiscountValue: sale.orderDiscount
        ? new Prisma.Decimal(sale.orderDiscount.value.toFixed(2))
        : null,
      orderDiscountReason: sale.orderDiscount ? sale.orderDiscount.reason : null,
      cancellationReason: sale.cancellationReason ?? null,
      cancelledAt: sale.cancelledAt ?? null,
      completedAt: sale.completedAt ?? null,
      refundedAt: sale.refundedAt ?? null,
      version: sale.version,
    };

    const itemsData = sale.items.map((item) =>
      PrismaSaleItemMapper.toPersistence(item, sale.id.value),
    );

    return {
      sale: saleData,
      items: itemsData,
    };
  }
}
