import { SalesQueryHandler } from '../shared/sales-query-handler.interface';
import { SalesApplicationResult } from '../shared/sales-application-result';
import { GetSaleByIdQuery } from './get-sale-by-id.query';
import { SaleDTO } from '../dtos/sale.dto';
import { SaleMapper } from '../mappers/sale.mapper';
import { SaleRepositoryInterface } from '../../infrastructure/persistence/prisma/repositories/prisma-sale.repository';

export class GetSaleByIdHandler implements SalesQueryHandler<
  GetSaleByIdQuery,
  SalesApplicationResult<SaleDTO>
> {
  constructor(private readonly saleRepository: SaleRepositoryInterface) {}

  public async execute(query: GetSaleByIdQuery): Promise<SalesApplicationResult<SaleDTO>> {
    try {
      const saleId = query.input.saleId?.trim();
      if (!saleId) {
        return SalesApplicationResult.fail(new Error('Sale ID cannot be empty.'));
      }

      const sale = await this.saleRepository.findById(saleId);
      if (!sale) {
        return SalesApplicationResult.fail(new Error(`Sale with ID '${saleId}' was not found.`));
      }

      return SalesApplicationResult.ok(SaleMapper.toDTO(sale));
    } catch (err: unknown) {
      const error = err instanceof Error ? err : new Error(String(err));
      return SalesApplicationResult.fail(error);
    }
  }
}
