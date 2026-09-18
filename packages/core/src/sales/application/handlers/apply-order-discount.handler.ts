import { SalesCommandHandler } from '../shared/sales-command-handler.interface';
import { SalesApplicationResult } from '../shared/sales-application-result';
import { ApplyOrderDiscountCommand } from '../commands/apply-order-discount.command';
import { SaleDTO } from '../dtos/sale.dto';
import { SaleMapper } from '../mappers/sale.mapper';
import { Discount } from '../../domain/value-objects/discount.vo';
import { SaleRepositoryInterface } from '../../infrastructure/persistence/prisma/repositories/prisma-sale.repository';
import { SalesEventPublisherPort } from '../ports/sales-event-publisher.port';
import { Clock, SystemClock } from '../../domain/shared/clock';

export class ApplyOrderDiscountHandler implements SalesCommandHandler<
  ApplyOrderDiscountCommand,
  SalesApplicationResult<SaleDTO>
> {
  constructor(
    private readonly saleRepository: SaleRepositoryInterface,
    private readonly clock: Clock = new SystemClock(),
    private readonly eventPublisher?: SalesEventPublisherPort,
  ) {}

  public async execute(
    command: ApplyOrderDiscountCommand,
  ): Promise<SalesApplicationResult<SaleDTO>> {
    try {
      const { input } = command;
      const saleId = input.saleId?.trim();
      if (!saleId) {
        return SalesApplicationResult.fail(new Error('Sale ID cannot be empty.'));
      }
      if (!input.discount) {
        return SalesApplicationResult.fail(new Error('Discount payload cannot be empty.'));
      }

      const sale = await this.saleRepository.findById(saleId);
      if (!sale) {
        return SalesApplicationResult.fail(new Error(`Sale with ID '${saleId}' was not found.`));
      }

      const typeStr = input.discount.type?.toUpperCase();
      let discount: Discount;
      if (typeStr === 'PERCENTAGE') {
        discount = Discount.percentage(input.discount.value, input.discount.reason);
      } else {
        discount = Discount.fixed(input.discount.value, input.discount.reason);
      }

      sale.applyOrderDiscount(discount, this.clock);

      await this.saleRepository.save(sale);

      const events = sale.getUncommittedEvents();
      if (this.eventPublisher && events.length > 0) {
        await this.eventPublisher.publish(events);
      }
      sale.clearEvents();

      return SalesApplicationResult.ok(SaleMapper.toDTO(sale));
    } catch (err: unknown) {
      const error = err instanceof Error ? err : new Error(String(err));
      return SalesApplicationResult.fail(error);
    }
  }
}
