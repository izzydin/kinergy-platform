import { SalesQueryHandler } from '../shared/sales-query-handler.interface';
import { SalesApplicationResult } from '../shared/sales-application-result';
import { GetSaleQuery } from './get-sale.query';
import { SaleDTO } from '../dtos/sale.dto';
import { SaleMapper } from '../mappers/sale.mapper';
import { SaleRepositoryPort } from '../ports/sale-repository.port';
import { SaleNotFoundException } from '../exceptions/sale-not-found.exception';
import { InvalidSaleStateException } from '../../domain/exceptions/invalid-sale-state.exception';

/**
 * GetSaleHandler executes the GetSale query, retrieving the authoritative
 * commercial state of a Sale Aggregate without leaking domain internals or ORM entities.
 *
 * Responsibilities:
 * 1. Accept GetSaleQuery (or GetSaleByIdQuery alias).
 * 2. Validate identifier shape at the application boundary (reject empty/whitespace).
 * 3. Load the Sale Aggregate through SaleRepositoryPort.findById(saleId).
 *    - Never uses direct Prisma access or raw SQL.
 *    - Eagerly loads only the Sale aggregate boundary (Sale, SaleItems, Discounts, SourceReference).
 *    - Does NOT eagerly load unrelated aggregates (Payment, Receipt, Client).
 * 4. Map not-found conditions to the established SaleNotFoundException.
 * 5. Return the application DTO representation (SaleDTO) via SaleMapper.toDTO(sale).
 *    - Contains zero business rule logic.
 *    - Preserves side-effect freedom (zero mutations, zero events, zero writes).
 */
export class GetSaleHandler implements SalesQueryHandler<
  GetSaleQuery,
  SalesApplicationResult<SaleDTO>
> {
  constructor(private readonly saleRepository: SaleRepositoryPort) {}

  public async execute(query: GetSaleQuery): Promise<SalesApplicationResult<SaleDTO>> {
    try {
      if (!query || !query.input) {
        return SalesApplicationResult.fail(
          new InvalidSaleStateException('GetSale input cannot be null or undefined.'),
        );
      }

      const saleId = query.input.saleId?.trim();
      if (!saleId) {
        return SalesApplicationResult.fail(
          new InvalidSaleStateException('Sale ID cannot be empty or whitespace.'),
        );
      }

      // 1. Load Sale through SaleRepositoryPort
      const sale = await this.saleRepository.findById(saleId);

      // 2. Validate Sale existence & map to established error
      if (!sale) {
        return SalesApplicationResult.fail(new SaleNotFoundException(saleId));
      }

      // 3. Return appropriate application DTO representation without business logic
      return SalesApplicationResult.ok(SaleMapper.toDTO(sale));
    } catch (err: unknown) {
      const error = err instanceof Error ? err : new Error(String(err));
      return SalesApplicationResult.fail(error);
    }
  }
}

export const GetSaleByIdHandler = GetSaleHandler;
export type GetSaleByIdHandler = GetSaleHandler;
