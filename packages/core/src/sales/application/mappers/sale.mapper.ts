import { Sale } from '../../domain/sale.aggregate';
import { SaleDTO, SaleSummaryDTO } from '../dtos/sale.dto';
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
      subtotal: subtotalDto,
      discountTotal: discountTotalDto,
      total: totalDto,
      subtotalAmount: subtotalDto.amount,
      discountTotalAmount: discountTotalDto.amount,
      totalAmount: totalDto.amount,
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
}
