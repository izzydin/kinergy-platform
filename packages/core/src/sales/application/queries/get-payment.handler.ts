import { SalesQueryHandler } from '../shared/sales-query-handler.interface';
import { SalesApplicationResult } from '../shared/sales-application-result';
import { GetPaymentQuery } from './get-payment.query';
import { PaymentDTO } from '../dtos/payment.dto';
import { PaymentMapper } from '../mappers/payment.mapper';
import { PaymentRepositoryPort } from '../ports/payment-repository.port';
import { SaleRepositoryPort } from '../ports/sale-repository.port';
import { PaymentNotFoundException } from '../exceptions/payment-not-found.exception';
import { checkPaymentAuthorization, enforceTenantIsolation } from '../shared/payment-authorization';
import { enforceSaleOwnershipBoundary } from '../shared/sale-authorization';

/**
 * GetPaymentHandler executes the GetPayment query, retrieving the authoritative
 * application representation of a Payment Aggregate without leaking domain internals
 * or ORM entities.
 *
 * Responsibilities:
 * 1. Accept GetPaymentQuery (or GetPaymentByIdQuery alias).
 * 2. Validate Payment identifier at the application boundary (reject empty/whitespace).
 * 3. Enforce authorization checks (payments.read privilege).
 * 4. Load Payment aggregate strictly through PaymentRepositoryPort.
 *    - Never uses direct Prisma access or raw SQL.
 *    - Never returns Prisma models or exposes Prisma.Decimal.
 *    - Adheres to scalar aggregate decoupling (does not eagerly load Sale aggregate).
 * 5. Map not-found conditions to the established PaymentNotFoundException.
 * 6. Enforce multi-tenant isolation boundaries.
 * 7. Enforce related Sale access and resource ownership restrictions when saleRepository is provided.
 * 8. Return the approved application representation (PaymentDTO) via PaymentMapper.toDTO(payment).
 *    - Contains zero business rule logic.
 *    - Pure read-only operation: zero side-effects, zero mutations, zero events.
 */
export class GetPaymentHandler implements SalesQueryHandler<
  GetPaymentQuery,
  SalesApplicationResult<PaymentDTO>
> {
  constructor(
    private readonly paymentRepository: PaymentRepositoryPort,
    private readonly saleRepository?: SaleRepositoryPort,
  ) {}

  public async execute(query: GetPaymentQuery): Promise<SalesApplicationResult<PaymentDTO>> {
    try {
      if (!query || !query.input) {
        return SalesApplicationResult.fail(
          new Error('GetPayment input cannot be null or undefined.'),
        );
      }

      const { input } = query;

      // 1. Authorization: payments.read or higher
      checkPaymentAuthorization(input.currentUser, ['payments.read']);

      const paymentId = input.paymentId?.trim();
      if (!paymentId) {
        return SalesApplicationResult.fail(new Error('Payment ID cannot be empty or whitespace.'));
      }

      // 2. Resolve Payment through repository port (clean architectural boundary)
      const payment = await this.paymentRepository.findById(paymentId);
      if (!payment) {
        return SalesApplicationResult.fail(new PaymentNotFoundException(paymentId));
      }

      // 3. Multi-Tenant Boundary Enforcement
      enforceTenantIsolation(payment.tenantId, input.tenantId);

      // 4. Related Sale access and resource ownership boundary enforcement
      if (this.saleRepository && payment.saleId) {
        const sale = await this.saleRepository.findById(payment.saleId.value);
        if (sale) {
          enforceTenantIsolation(sale.tenantId, input.tenantId);
          try {
            enforceSaleOwnershipBoundary(sale, input.currentUser);
          } catch {
            return SalesApplicationResult.fail(new PaymentNotFoundException(paymentId));
          }
        }
      }

      // 5. Return approved application representation DTO
      return SalesApplicationResult.ok(PaymentMapper.toDTO(payment));
    } catch (err: unknown) {
      const error = err instanceof Error ? err : new Error(String(err));
      return SalesApplicationResult.fail(error);
    }
  }
}

export const GetPaymentByIdHandler = GetPaymentHandler;
export type GetPaymentByIdHandler = GetPaymentHandler;
