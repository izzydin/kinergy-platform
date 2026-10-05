import { Sale } from '../../domain/sale.aggregate';
import { SaleDTO, SaleSummaryDTO } from '../dtos/sale.dto';
import { SaleTotalsDTO } from '../dtos/sale-totals.dto';
import { MoneyMapper } from './money.mapper';
import { SaleItemMapper } from './sale-item.mapper';

/**
 * Maps Sale aggregate root to API-safe DTOs without precision loss.
 */
export class SaleMapper {
  /**
   * Maps full Sale aggregate to SaleDTO.
   */
  public static toDTO(sale: Sale): SaleDTO {
    const subtotalDto = MoneyMapper.toDTO(sale.subtotal);
    const discountTotalDto = MoneyMapper.toDTO(sale.discountTotal);
    const totalDto = MoneyMapper.toDTO(sale.total);

    return {
      id: sale.id.value,
      tenantId: sale.tenantId,
      clientId: sale.clientId,
      currency: sale.currency,
      status: sale.status,
      source: {
        sourceType: sale.source.sourceType,
        sourceId: sale.source.sourceId,
        sourceCode: sale.source.sourceCode,
        type: sale.source.sourceType,
        referenceId: sale.source.sourceId,
        referenceCode: sale.source.sourceCode,
      },
      sourceReference: {
        sourceType: sale.source.sourceType,
        sourceId: sale.source.sourceId,
        sourceCode: sale.source.sourceCode,
        type: sale.source.sourceType,
        referenceId: sale.source.sourceId,
        referenceCode: sale.source.sourceCode,
      },
      subtotal: subtotalDto,
      discountTotal: discountTotalDto,
      total: totalDto,
      subtotalAmount: subtotalDto.amount,
      discountTotalAmount: discountTotalDto.amount,
      totalAmount: totalDto.amount,
      orderDiscount: sale.orderDiscount
        ? {
            type: sale.orderDiscount.type,
            value: sale.orderDiscount.value,
            reason: sale.orderDiscount.reason,
          }
        : null,
      itemCount: sale.itemCount,
      items: sale.items.map((item) => SaleItemMapper.toDTO(item)),
      version: sale.version,
      createdAt: sale.createdAt.toISOString(),
      updatedAt: sale.updatedAt.toISOString(),
      completedAt: sale.completedAt ? sale.completedAt.toISOString() : null,
      cancelledAt: sale.cancelledAt ? sale.cancelledAt.toISOString() : null,
      cancellationReason: sale.cancellationReason ?? null,
      refundedAt: sale.refundedAt ? sale.refundedAt.toISOString() : null,
    };
  }

  /**
   * Maps Sale aggregate to lightweight SaleSummaryDTO.
   */
  public static toSummaryDTO(sale: Sale): SaleSummaryDTO {
    const subtotalDto = MoneyMapper.toDTO(sale.subtotal);
    const discountTotalDto = MoneyMapper.toDTO(sale.discountTotal);
    const totalDto = MoneyMapper.toDTO(sale.total);

    return {
      id: sale.id.value,
      tenantId: sale.tenantId,
      clientId: sale.clientId,
      currency: sale.currency,
      status: sale.status,
      source: {
        sourceType: sale.source.sourceType,
        sourceId: sale.source.sourceId,
        sourceCode: sale.source.sourceCode,
        type: sale.source.sourceType,
        referenceId: sale.source.sourceId,
        referenceCode: sale.source.sourceCode,
      },
      subtotal: subtotalDto,
      discountTotal: discountTotalDto,
      total: totalDto,
      subtotalAmount: subtotalDto.amount,
      discountTotalAmount: discountTotalDto.amount,
      totalAmount: totalDto.amount,
      itemCount: sale.itemCount,
      createdAt: sale.createdAt.toISOString(),
      updatedAt: sale.updatedAt.toISOString(),
    };
  }

  /**
   * Maps Sale aggregate to authoritative SaleTotalsDTO.
   */
  public static toTotalsDTO(sale: Sale): SaleTotalsDTO {
    const subtotalDto = MoneyMapper.toDTO(sale.subtotal);
    const discountTotalDto = MoneyMapper.toDTO(sale.discountTotal);
    const totalDto = MoneyMapper.toDTO(sale.total);

    return {
      saleId: sale.id.value,
      currency: sale.currency,
      subtotal: subtotalDto,
      discountTotal: discountTotalDto,
      total: totalDto,
      subtotalAmount: subtotalDto.amount,
      discountTotalAmount: discountTotalDto.amount,
      totalAmount: totalDto.amount,
      itemCount: sale.itemCount,
      orderDiscount: sale.orderDiscount
        ? {
            type: sale.orderDiscount.type,
            value: sale.orderDiscount.value,
            reason: sale.orderDiscount.reason,
          }
        : null,
    };
  }
}
