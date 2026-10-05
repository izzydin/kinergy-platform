import { SalesCommandHandler } from '../shared/sales-command-handler.interface';
import { SalesApplicationResult } from '../shared/sales-application-result';
import { RemoveSaleItemCommand } from '../commands/remove-sale-item.command';
import { SaleDTO } from '../dtos/sale.dto';
import { SaleMapper } from '../mappers/sale.mapper';
import { SaleRepositoryPort } from '../ports/sale-repository.port';
import { SalesEventPublisherPort } from '../ports/sales-event-publisher.port';
import { Clock, SystemClock } from '../../domain/shared/clock';
import { SaleNotFoundException } from '../exceptions/sale-not-found.exception';
import { InvalidSaleStateException } from '../../domain/exceptions/invalid-sale-state.exception';

export class RemoveSaleItemHandler implements SalesCommandHandler<
  RemoveSaleItemCommand,
  SalesApplicationResult<SaleDTO>
> {
  constructor(
    private readonly saleRepository: SaleRepositoryPort,
    private readonly clock: Clock = new SystemClock(),
    private readonly eventPublisher?: SalesEventPublisherPort,
  ) {}

  public async execute(command: RemoveSaleItemCommand): Promise<SalesApplicationResult<SaleDTO>> {
    try {
      if (!command || !command.input) {
        return SalesApplicationResult.fail(
          new InvalidSaleStateException('RemoveSaleItemCommand input cannot be null or undefined.'),
        );
      }

      const { input } = command;
      const saleId = input.saleId?.trim();
      if (!saleId) {
        return SalesApplicationResult.fail(
          new InvalidSaleStateException('Sale ID cannot be empty or whitespace.'),
        );
      }
      if (!input.itemId || input.itemId.trim().length === 0) {
        return SalesApplicationResult.fail(
          new InvalidSaleStateException('SaleItem ID cannot be empty or whitespace.'),
        );
      }

      // 1. Load Sale
      const sale = await this.saleRepository.findById(saleId);

      // 2. Validate Sale existence
      if (!sale) {
        return SalesApplicationResult.fail(new SaleNotFoundException(saleId));
      }

      // 3. Identify the requested SaleItem & 4. Invoke approved domain operation for removal
      // 5. Recalculates totals through domain recalculateTotals() inside sale.removeItem
      sale.removeItem(input.itemId.trim(), this.clock);

      // 6. Persist the modified aggregate
      await this.saleRepository.save(sale);

      // Dispatch domain events
      const events = sale.getUncommittedEvents();
      if (this.eventPublisher && events.length > 0) {
        await this.eventPublisher.publish(events);
      }
      sale.clearEvents();

      // 7. Return the approved Sale representation
      return SalesApplicationResult.ok(SaleMapper.toDTO(sale));
    } catch (err: unknown) {
      const error = err instanceof Error ? err : new Error(String(err));
      return SalesApplicationResult.fail(error);
    }
  }
}
