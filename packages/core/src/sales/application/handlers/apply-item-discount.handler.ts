import { SalesCommandHandler } from '../shared/sales-command-handler.interface';
import { SalesApplicationResult } from '../shared/sales-application-result';
import { ApplyItemDiscountCommand } from '../commands/apply-item-discount.command';
import { SaleDTO } from '../dtos/sale.dto';
import { SaleMapper } from '../mappers/sale.mapper';
import { Discount } from '../../domain/value-objects/discount.vo';
import { SaleRepositoryInterface } from '../../infrastructure/persistence/prisma/repositories/prisma-sale.repository';
import { SalesEventPublisherPort } from '../ports/sales-event-publisher.port';
import { Clock, SystemClock } from '../../domain/shared/clock';

export class ApplyItemDiscountHandler implements SalesCommandHandler<
  ApplyItemDiscountCommand,
  SalesApplicationResult<SaleDTO>
> {
  constructor(
    private readonly saleRepository: SaleRepositoryInterface,
    private readonly clock: Clock = new SystemClock(),
    private readonly eventPublisher?: SalesEventPublisherPort,
  ) {}

  public async execute(
    command: ApplyItemDiscountCommand,
  ): Promise<SalesApplicationResult<SaleDTO>> {
    try {
      const { input } = command;
      const saleId = input.saleId?.trim();
      if (!saleId) {
        return SalesApplicationResult.fail(new Error('Sale ID cannot be empty.'));
      }
      const itemId = input.itemId?.trim();
      if (!itemId) {
        return SalesApplicationResult.fail(new Error('Item ID cannot be empty.'));
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

      sale.applyItemDiscount(itemId, discount, this.clock);

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
