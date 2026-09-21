import { SalesQueryHandler } from '../shared/sales-query-handler.interface';
import { SalesApplicationResult } from '../shared/sales-application-result';
import { GetPaymentsBySaleIdQuery } from '../queries/get-payments-by-sale-id.query';
import { PaymentDTO } from '../dtos/payment.dto';
import { PaymentMapper } from '../mappers/payment.mapper';
import { PaymentRepositoryPort } from '../ports/payment-repository.port';
import { SaleRepositoryPort } from '../ports/sale-repository.port';
import { SaleNotFoundException } from '../exceptions/sale-not-found.exception';
import { checkPaymentAuthorization, enforceTenantIsolation } from '../shared/payment-authorization';

export class GetPaymentsBySaleIdHandler implements SalesQueryHandler<
  GetPaymentsBySaleIdQuery,
  SalesApplicationResult<PaymentDTO[]>
> {
  constructor(
    private readonly paymentRepository: PaymentRepositoryPort,
    private readonly saleRepository?: SaleRepositoryPort,
  ) {}

  public async execute(
    query: GetPaymentsBySaleIdQuery,
  ): Promise<SalesApplicationResult<PaymentDTO[]>> {
    try {
      const { input } = query;

      // 1. Authorization
      checkPaymentAuthorization(input.currentUser, ['payments.read']);

      const saleId = input.saleId?.trim();
      if (!saleId) {
        return SalesApplicationResult.fail(new Error('Sale ID cannot be empty.'));
      }

      // 2. Resolve Sale & Multi-Tenant Verification
      if (this.saleRepository) {
        const sale = await this.saleRepository.findById(saleId);
        if (!sale) {
          return SalesApplicationResult.fail(new SaleNotFoundException(saleId));
        }
        enforceTenantIsolation(sale.tenantId, input.tenantId);
      }

      // 3. Resolve Payments by SaleId
      let payments = await this.paymentRepository.findBySaleId(saleId);

      // 4. Multi-Tenant Filter if specified
      if (input.tenantId) {
        const tenantId = input.tenantId.trim();
        payments = payments.filter((p) => p.tenantId === tenantId);
      }

      return SalesApplicationResult.ok(payments.map((p) => PaymentMapper.toDTO(p)));
    } catch (err: unknown) {
      const error = err instanceof Error ? err : new Error(String(err));
      return SalesApplicationResult.fail(error);
    }
  }
}
