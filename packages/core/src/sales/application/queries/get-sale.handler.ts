import { SalesQueryHandler } from '../shared/sales-query-handler.interface';
import { SalesApplicationResult } from '../shared/sales-application-result';
import { GetSaleQuery } from './get-sale.query';
import { SaleDTO } from '../dtos/sale.dto';
import { SaleMapper } from '../mappers/sale.mapper';
import { SaleRepositoryPort } from '../ports/sale-repository.port';
import { SaleNotFoundException } from '../exceptions/sale-not-found.exception';
import { InvalidSaleStateException } from '../../domain/exceptions/invalid-sale-state.exception';
import {
  checkSaleAuthorization,
  enforceSaleTenantIsolation,
  enforceSaleOwnershipBoundary,
} from '../shared/sale-authorization';

/**
 * GetSaleHandler executes the GetSale query, retrieving the authoritative
 * commercial state of a Sale Aggregate without leaking domain internals or ORM entities.
 *
 * Responsibilities:
 * 1. Accept GetSaleQuery (or GetSaleByIdQuery alias).
 * 2. Validate caller authorization (sales.read) and identifier shape.
 * 3. Load the Sale Aggregate through SaleRepositoryPort.findById(saleId).
 *    - Never uses direct Prisma access or raw SQL.
 *    - Eagerly loads only the Sale aggregate boundary (Sale, SaleItems, Discounts, SourceReference).
 *    - Does NOT eagerly load unrelated aggregates (Payment, Receipt, Client).
 * 4. Map not-found conditions to the established SaleNotFoundException.
 * 5. Enforce multi-tenant boundary and object-level ownership scoping.
 * 6. Return the application DTO representation (SaleDTO) via SaleMapper.toDTO(sale).
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

      // 1. Authorization: sales.read
      checkSaleAuthorization(query.input.currentUser, ['sales.read']);

      const saleId = query.input.saleId?.trim();
      if (!saleId) {
        return SalesApplicationResult.fail(
          new InvalidSaleStateException('Sale ID cannot be empty or whitespace.'),
        );
      }

      // 2. Load Sale through SaleRepositoryPort (prefers domain-oriented getById, falls back to findById)
      const loadFn = this.saleRepository.getById
        ? this.saleRepository.getById.bind(this.saleRepository)
        : this.saleRepository.findById.bind(this.saleRepository);
      const sale = await loadFn(saleId);

      // 3. Validate Sale existence & map to established error
      if (!sale) {
        return SalesApplicationResult.fail(new SaleNotFoundException(saleId));
      }

      // 4. Multi-Tenant Boundary Enforcement (Uniform 404 per ADR-0135 Section 9)
      enforceSaleTenantIsolation(
        sale.tenantId,
        query.input.tenantId ?? query.input.currentUser?.tenantId,
        saleId,
      );

      // 5. Object-Level Ownership Boundary Enforcement
      enforceSaleOwnershipBoundary(sale, query.input.currentUser);

      // 6. Return appropriate application DTO representation without business logic
      return SalesApplicationResult.ok(SaleMapper.toDTO(sale));
    } catch (err: unknown) {
      const error = err instanceof Error ? err : new Error(String(err));
      return SalesApplicationResult.fail(error);
    }
  }
}

export const GetSaleByIdHandler = GetSaleHandler;
export type GetSaleByIdHandler = GetSaleHandler;
