import { SalesQueryHandler } from '../shared/sales-query-handler.interface';
import { SalesCommandHandler } from '../shared/sales-command-handler.interface';
import { SalesApplicationResult } from '../shared/sales-application-result';
import { CalculateSaleQuery } from './calculate-sale.query';
import { SaleTotalsDTO } from '../dtos/sale-totals.dto';
import { SaleMapper } from '../mappers/sale.mapper';
import { SaleRepositoryPort } from '../ports/sale-repository.port';
import { SaleNotFoundException } from '../exceptions/sale-not-found.exception';
import { InvalidSaleStateException } from '../../domain/exceptions/invalid-sale-state.exception';

/**
 * CalculateSaleHandler exposes the Sale Aggregate's authoritative financial calculation
 * through the application boundary.
 *
 * Responsibilities:
 * 1. Load Sale from SaleRepositoryPort.
 * 2. Validate Sale existence (fail with SaleNotFoundException if missing).
 * 3. Invoke the domain calculation behavior (sale.calculateTotals()).
 *    - All calculations originate strictly from the Milestone 7.4 domain formulas in Sale.
 *    - The application layer does NOT calculate subtotal, discountTotal, or total.
 *    - Zero JavaScript floating-point arithmetic or custom Money calculators.
 * 4. Persistence Determination:
 *    - In Kinergy's DDD & CQRS architecture (ADR-0114, ADR-0119, ADR-0132), persisted totals
 *      are maintained atomically by mutating commands and guaranteed reconciled upon reconstitution.
 *    - Therefore, CalculateSale is a pure, side-effect-free QUERY without database writes.
 * 5. Return the authoritative totals via SaleTotalsDTO.
 */
export class CalculateSaleHandler
  implements
    SalesQueryHandler<CalculateSaleQuery, SalesApplicationResult<SaleTotalsDTO>>,
    SalesCommandHandler<CalculateSaleQuery, SalesApplicationResult<SaleTotalsDTO>>
{
  constructor(private readonly saleRepository: SaleRepositoryPort) {}

  public async execute(query: CalculateSaleQuery): Promise<SalesApplicationResult<SaleTotalsDTO>> {
    try {
      if (!query || !query.input) {
        return SalesApplicationResult.fail(
          new InvalidSaleStateException('CalculateSale input cannot be null or undefined.'),
        );
      }

      const saleId = query.input.saleId?.trim();
      if (!saleId) {
        return SalesApplicationResult.fail(
          new InvalidSaleStateException('Sale ID cannot be empty or whitespace.'),
        );
      }

      // 1. Load Sale
      const sale = await this.saleRepository.findById(saleId);

      // 2. Validate Sale existence
      if (!sale) {
        return SalesApplicationResult.fail(new SaleNotFoundException(saleId));
      }

      // 3. Invoke domain calculation behavior
      // All totals are calculated authoritatively by the domain aggregate (Milestone 7.4)
      sale.calculateTotals();

      // 4. Persistence: Zero writes. Read-only query preserving side-effect freedom.

      // 5. Return authoritative totals
      return SalesApplicationResult.ok(SaleMapper.toTotalsDTO(sale));
    } catch (err: unknown) {
      const error = err instanceof Error ? err : new Error(String(err));
      return SalesApplicationResult.fail(error);
    }
  }
}
