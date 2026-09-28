import { SalesCommandHandler } from '../shared/sales-command-handler.interface';
import { SalesApplicationResult } from '../shared/sales-application-result';
import { CancelSaleCommand } from '../commands/cancel-sale.command';
import { SaleDTO } from '../dtos/sale.dto';
import { SaleMapper } from '../mappers/sale.mapper';
import { SaleRepositoryPort } from '../ports/sale-repository.port';
import { SalesEventPublisherPort } from '../ports/sales-event-publisher.port';
import { Clock, SystemClock } from '../../domain/shared/clock';
import { SaleNotFoundException } from '../exceptions/sale-not-found.exception';

/**
 * Application command handler orchestrating explicit Sale cancellation.
 * Transitions a DRAFT, PENDING_PAYMENT, or PARTIALLY_PAID Sale to CANCELLED.
 * Enforces audit justification reason and permanent terminal immutability.
 */
export class CancelSaleHandler implements SalesCommandHandler<
  CancelSaleCommand,
  SalesApplicationResult<SaleDTO>
> {
  constructor(
    private readonly saleRepository: SaleRepositoryPort,
    private readonly clock: Clock = new SystemClock(),
    private readonly eventPublisher?: SalesEventPublisherPort,
  ) {}

  public async execute(command: CancelSaleCommand): Promise<SalesApplicationResult<SaleDTO>> {
    try {
      const { input } = command;
      const saleId = input.saleId?.trim();
      if (!saleId) {
        return SalesApplicationResult.fail(new Error('Sale ID cannot be empty.'));
      }
      if (!input.reason || typeof input.reason !== 'string' || !input.reason.trim()) {
        return SalesApplicationResult.fail(new Error('Cancellation reason cannot be empty.'));
      }

      const sale = await this.saleRepository.findById(saleId);
      if (!sale) {
        return SalesApplicationResult.fail(new SaleNotFoundException(saleId));
      }

      sale.cancel(input.reason.trim(), this.clock);

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
