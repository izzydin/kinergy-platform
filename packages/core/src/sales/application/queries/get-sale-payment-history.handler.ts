import { SalesQueryHandler } from '../shared/sales-query-handler.interface';
import { SalesApplicationResult } from '../shared/sales-application-result';
import { GetSalePaymentHistoryQuery } from './get-sale-payment-history.query';
import { PaymentDTO } from '../dtos/payment.dto';
import { PaymentMapper } from '../mappers/payment.mapper';
import { PaymentRepositoryPort } from '../ports/payment-repository.port';
import { SaleRepositoryPort } from '../ports/sale-repository.port';
import { SaleNotFoundException } from '../exceptions/sale-not-found.exception';
import { checkPaymentAuthorization, enforceTenantIsolation } from '../shared/payment-authorization';
import { enforceSaleOwnershipBoundary } from '../shared/sale-authorization';

/**
 * GetSalePaymentHistoryHandler retrieves the payment history associated with one Sale.
 *
 * Architectural Invariants:
 * 1. "Payment History" Semantics:
 *    - In Kinergy's DDD aggregate architecture (Milestones 7.5, 7.6, 7.8, 7.10, ADR-0115, ADR-0122 §5),
 *      a speculative 'PaymentHistory' relational table was formally REJECTED.
 *    - "Payment History" refers to the complete collection of all autonomous Payment aggregate records
 *      across ALL lifecycle states (PENDING, COMPLETED, FAILED, CANCELLED) referencing the target Sale.
 * 2. Deterministic Ordering:
 *    - Primary sort: chronological order (createdAt ASC by default, or DESC if explicitly requested).
 *    - Secondary tie-breaker: id ASC, guaranteeing deterministic ordering even for concurrent records
 *      sharing identical timestamp values.
 * 3. Sale Existence & Tenant Isolation:
 *    - Validates saleId identifier.
 *    - When SaleRepository is provided, verifies Sale exists in persistence; throws SaleNotFoundException if absent.
 *    - Enforces strict multi-tenant boundary isolation.
 * 4. Purity & Decoupling:
 *    - Pure DTO return shape (PaymentDTO[]) with zero exposure of Prisma models or Prisma.Decimal.
 *    - Does not eagerly load the full Sale aggregate inside payments.
 */
export class GetSalePaymentHistoryHandler implements SalesQueryHandler<
  GetSalePaymentHistoryQuery,
  SalesApplicationResult<PaymentDTO[]>
> {
  constructor(
    private readonly paymentRepository: PaymentRepositoryPort,
    private readonly saleRepository?: SaleRepositoryPort,
  ) {}

  public async execute(
    query: GetSalePaymentHistoryQuery,
  ): Promise<SalesApplicationResult<PaymentDTO[]>> {
    try {
      if (!query || !query.input) {
        return SalesApplicationResult.fail(
          new Error('Query and input cannot be null or undefined.'),
        );
      }

      const { input } = query;

      // 1. Authorization
      checkPaymentAuthorization(input.currentUser, ['payments.read']);

      // 2. Validate Sale Identifier
      const saleId = input.saleId?.trim();
      if (!saleId) {
        return SalesApplicationResult.fail(new Error('Sale ID cannot be empty.'));
      }

      // 3. Verify Sale Existence, Multi-Tenant Boundary & Sale Access Restrictions
      if (this.saleRepository) {
        const sale = await this.saleRepository.findById(saleId);
        if (!sale) {
          return SalesApplicationResult.fail(new SaleNotFoundException(saleId));
        }
        enforceTenantIsolation(sale.tenantId, input.tenantId);
        enforceSaleOwnershipBoundary(sale, input.currentUser);
      }

      // 4. Retrieve All Payments Associated with the Sale
      let payments = await this.paymentRepository.findBySaleId(saleId);

      // 5. Multi-Tenant Filter if specified
      if (input.tenantId) {
        const tenantId = input.tenantId.trim();
        payments = payments.filter((p) => p.tenantId === tenantId);
      }

      // 6. Apply Deterministic Ordering (createdAt ASC/DESC + id ASC tie-breaker)
      const rawDirection = input.order ?? input.sortDirection ?? 'asc';
      const isDesc = String(rawDirection).trim().toLowerCase() === 'desc';

      payments.sort((a, b) => {
        const timeA = a.createdAt.getTime();
        const timeB = b.createdAt.getTime();
        if (timeA !== timeB) {
          return isDesc ? timeB - timeA : timeA - timeB;
        }
        // Deterministic secondary tie-breaker: id ASC
        return a.id.value.localeCompare(b.id.value);
      });

      // 7. Return Approved Application Representation (PaymentDTO[])
      return SalesApplicationResult.ok(payments.map((p) => PaymentMapper.toDTO(p)));
    } catch (err: unknown) {
      const error = err instanceof Error ? err : new Error(String(err));
      return SalesApplicationResult.fail(error);
    }
  }
}
