import { SalesQueryHandler } from '../shared/sales-query-handler.interface';
import { SalesApplicationResult } from '../shared/sales-application-result';
import { GetPaymentByIdQuery } from '../queries/get-payment-by-id.query';
import { PaymentDTO } from '../dtos/payment.dto';
import { PaymentMapper } from '../mappers/payment.mapper';
import { PaymentRepositoryPort } from '../ports/payment-repository.port';
import { PaymentNotFoundException } from '../exceptions/payment-not-found.exception';
import { checkPaymentAuthorization, enforceTenantIsolation } from '../shared/payment-authorization';

export class GetPaymentByIdHandler implements SalesQueryHandler<
  GetPaymentByIdQuery,
  SalesApplicationResult<PaymentDTO>
> {
  constructor(private readonly paymentRepository: PaymentRepositoryPort) {}

  public async execute(query: GetPaymentByIdQuery): Promise<SalesApplicationResult<PaymentDTO>> {
    try {
      const { input } = query;

      // 1. Authorization
      checkPaymentAuthorization(input.currentUser, ['payments.read']);

      const paymentId = input.paymentId?.trim();
      if (!paymentId) {
        return SalesApplicationResult.fail(new Error('Payment ID cannot be empty.'));
      }

      // 2. Resolve Payment
      const payment = await this.paymentRepository.findById(paymentId);
      if (!payment) {
        return SalesApplicationResult.fail(new PaymentNotFoundException(paymentId));
      }

      enforceTenantIsolation(payment.tenantId, input.tenantId);

      return SalesApplicationResult.ok(PaymentMapper.toDTO(payment));
    } catch (err: unknown) {
      const error = err instanceof Error ? err : new Error(String(err));
      return SalesApplicationResult.fail(error);
    }
  }
}
