import { SaleItem } from '../../domain/entities/sale-item.entity';
import { SaleItemDTO } from '../dtos/sale-item.dto';
import { MoneyMapper } from './money.mapper';

/**
 * Maps SaleItem domain entity to SaleItemDTO.
 */
export class SaleItemMapper {
  public static toDTO(item: SaleItem): SaleItemDTO {
    const unitPriceDto = MoneyMapper.toDTO(item.unitPrice);
    const subtotalDto = MoneyMapper.toDTO(item.subtotal);
    const discountTotalDto = MoneyMapper.toDTO(item.discountTotal);
    const totalDto = MoneyMapper.toDTO(item.total);

    return {
      id: item.id.value,
      sourceType: item.source.sourceType,
      sourceId: item.source.sourceId,
      sourceCode: item.source.sourceCode ?? null,
      description: item.description,
      skuOrCode: item.skuOrCode,
      quantity: item.quantity,
      unitPrice: unitPriceDto,
      unitPriceAmount: unitPriceDto.amount,
      subtotal: subtotalDto,
      subtotalAmount: subtotalDto.amount,
      discount: item.discount
        ? {
            type: item.discount.type,
            value: item.discount.value,
            reason: item.discount.reason ?? null,
          }
        : null,
      discountTotal: discountTotalDto,
      discountTotalAmount: discountTotalDto.amount,
      total: totalDto,
      totalAmount: totalDto.amount,
      currency: item.currency,
    };
  }
}
