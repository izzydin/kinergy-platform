import { Payment } from '../../domain/payment.aggregate';
import { PaymentDTO } from '../dtos/payment.dto';
import { MoneyMapper } from './money.mapper';

/**
 * Maps Payment aggregate root to API-safe, precision-preserving PaymentDTO.
 */
export class PaymentMapper {
  /**
   * Maps full Payment aggregate to PaymentDTO.
   */
  public static toDTO(payment: Payment): PaymentDTO {
    const amountDto = MoneyMapper.toDTO(payment.amount);

    return {
      id: payment.id.value,
      tenantId: payment.tenantId,
      saleId: payment.saleId.value,
      method: payment.method,
      amount: amountDto,
      amountValue: amountDto.amount,
      status: payment.status,
      reference: payment.reference ? payment.reference.value : null,
      paidAt: payment.paidAt ? payment.paidAt.toISOString() : null,
      createdAt: payment.createdAt.toISOString(),
      version: payment.version,
    };
  }
}
