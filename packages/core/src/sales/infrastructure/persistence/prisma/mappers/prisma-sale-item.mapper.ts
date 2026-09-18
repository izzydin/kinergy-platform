import { SaleItem as PrismaSaleItemModel, Prisma } from '@prisma/client';
import { SaleItem } from '../../../../domain/entities/sale-item.entity';
import { SaleItemId } from '../../../../domain/value-objects/sale-item-id.vo';
import { SaleId } from '../../../../domain/value-objects/sale-id.vo';
import { SourceReference } from '../../../../domain/value-objects/source-reference.vo';
import { SourceType } from '../../../../domain/enums/source-type.enum';
import { Discount } from '../../../../domain/value-objects/discount.vo';
import { DiscountType } from '../../../../domain/enums/discount-type.enum';
import { PrismaMoneyMapper } from './prisma-money.mapper';

export class PrismaSaleItemMapper {
  public static toDomain(raw: PrismaSaleItemModel): SaleItem {
    const currency = raw.unitPriceCurrency;

    let discount: Discount | null = null;
    if (raw.discountType && raw.discountValue !== null && raw.discountValue !== undefined) {
      const discountValueNum = parseFloat(raw.discountValue.toString());
      discount = Discount.create({
        type: raw.discountType as DiscountType,
        value: discountValueNum,
        reason: raw.discountReason ?? null,
      });
    }

    const quantityNum = parseFloat(raw.quantity.toString());

    return SaleItem.reconstitute({
      id: SaleItemId.create(raw.id),
      saleId: raw.saleId ? SaleId.create(raw.saleId) : undefined,
      source: SourceReference.create({
        sourceType: raw.sourceType as SourceType,
        sourceId: raw.sourceId,
        sourceCode: raw.sourceCode ?? undefined,
      }),
      description: raw.description,
      skuOrCode: raw.skuOrCode ?? null,
      quantity: quantityNum,
      unitPrice: PrismaMoneyMapper.toMoney(raw.unitPriceAmount, currency),
      discount,
      subtotal: PrismaMoneyMapper.toMoney(raw.subtotalAmount, currency),
      discountTotal: PrismaMoneyMapper.toMoney(raw.discountTotalAmount, currency),
      total: PrismaMoneyMapper.toMoney(raw.totalAmount, currency),
    });
  }

  public static toPersistence(
    item: SaleItem,
    parentSaleId?: string,
  ): Omit<PrismaSaleItemModel, 'createdAt' | 'updatedAt'> {
    const saleId = parentSaleId ?? item.saleId?.value ?? '';

    return {
      id: item.id.value,
      saleId,
      sourceType: item.source.sourceType,
      sourceId: item.source.sourceId,
      sourceCode: item.source.sourceCode ?? null,
      description: item.description,
      skuOrCode: item.skuOrCode ?? null,
      quantity: new Prisma.Decimal(item.quantity.toFixed(3)),
      unitPriceAmount: PrismaMoneyMapper.toDecimal(item.unitPrice),
      unitPriceCurrency: item.unitPrice.currency,
      subtotalAmount: PrismaMoneyMapper.toDecimal(item.subtotal),
      discountTotalAmount: PrismaMoneyMapper.toDecimal(item.discountTotal),
      totalAmount: PrismaMoneyMapper.toDecimal(item.total),
      discountType: item.discount ? item.discount.type : null,
      discountValue: item.discount ? new Prisma.Decimal(item.discount.value.toFixed(2)) : null,
      discountReason: item.discount ? item.discount.reason : null,
    };
  }
}
