import { SalesQueryHandler } from '../shared/sales-query-handler.interface';
import { SalesApplicationResult } from '../shared/sales-application-result';
import { GetReceiptBySaleQuery } from '../queries/get-receipt-by-sale.query';
import { ReceiptDTO } from '../dtos/receipt.dto';
import { ReceiptMapper } from '../mappers/receipt.mapper';
import { ReceiptRepositoryPort } from '../ports/receipt-repository.port';
import { SaleRepositoryPort } from '../ports/sale-repository.port';
import { ReceiptNotFoundException } from '../exceptions/receipt-not-found.exception';
import { SaleNotFoundException } from '../exceptions/sale-not-found.exception';
import {
  checkReceiptAuthorization,
  enforceReceiptTenantIsolation,
} from '../shared/receipt-authorization';

/**
 * Query handler that retrieves the primary Receipt document associated with a specific Sale.
 * Validates sale existence, checks authorization (receipts.read), enforces multi-tenant boundaries,
 * and returns the canonical immutable ReceiptDTO.
 * Codified by ADR-0117 (Invariant 4 & 11) and Milestone 7.7.
 */
export class GetReceiptBySaleHandler implements SalesQueryHandler<
  GetReceiptBySaleQuery,
  SalesApplicationResult<ReceiptDTO>
> {
  constructor(
    private readonly receiptRepository: ReceiptRepositoryPort,
    private readonly saleRepository?: SaleRepositoryPort,
  ) {}

  public async execute(query: GetReceiptBySaleQuery): Promise<SalesApplicationResult<ReceiptDTO>> {
    try {
      const { input } = query;

      // 1. Authorization: receipts.read (or higher)
      checkReceiptAuthorization(input.currentUser, ['receipts.read']);

      const saleId = input.saleId?.trim();
      if (!saleId) {
        return SalesApplicationResult.fail(new Error('Sale ID cannot be empty.'));
      }

      // 2. Validate Sale existence if saleRepository is supplied
      if (this.saleRepository) {
        const sale = await this.saleRepository.findById(saleId);
        if (!sale) {
          return SalesApplicationResult.fail(new SaleNotFoundException(saleId));
        }
        enforceReceiptTenantIsolation(sale.tenantId, input.tenantId);
      }

      // 3. Resolve Receipt by associated Sale ID
      const receipt = await this.receiptRepository.findBySaleId(saleId);
      if (!receipt) {
        return SalesApplicationResult.fail(new ReceiptNotFoundException(`sale:${saleId}`));
      }

      // 4. Multi-Tenant Boundary Enforcement
      enforceReceiptTenantIsolation(receipt.tenantId, input.tenantId);

      // 5. Return canonical read-only DTO
      return SalesApplicationResult.ok(ReceiptMapper.toDTO(receipt));
    } catch (err: unknown) {
      const error = err instanceof Error ? err : new Error(String(err));
      return SalesApplicationResult.fail(error);
    }
  }
}
