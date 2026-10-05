import { SalesCommandHandler } from '../shared/sales-command-handler.interface';
import { SalesApplicationResult } from '../shared/sales-application-result';
import { CancelSaleCommand } from '../commands/cancel-sale.command';
import { SaleDTO } from '../dtos/sale.dto';
import { SaleMapper } from '../mappers/sale.mapper';
import { SaleRepositoryPort } from '../ports/sale-repository.port';
import { SalesEventPublisherPort } from '../ports/sales-event-publisher.port';
import { Clock, SystemClock } from '../../domain/shared/clock';
import { SaleNotFoundException } from '../exceptions/sale-not-found.exception';
import { InvalidSaleStateException } from '../../domain/exceptions/invalid-sale-state.exception';
import { enforceTenantIsolation } from '../shared/payment-authorization';

/**
 * Application command handler orchestrating explicit Sale cancellation.
 *
 * Responsibilities:
 * 1. Accept and validate the CancelSaleCommand input shape (saleId required).
 * 2. Load the Sale Aggregate through SaleRepositoryPort.
 * 3. Verify Sale exists (and enforce tenant isolation when tenantId is supplied).
 * 4. Invoke domain operation: sale.cancel(reason, clock).
 *    - Never directly sets status = CANCELLED.
 *    - Never duplicates cancellation validation in the application layer.
 *    - The Sale Aggregate owns whether cancellation is allowed, valid lifecycle transitions,
 *      and cancellation invariants.
 *    - Preserves aggregate boundaries without silently mutating Payment or Receipt states.
 * 5. Persist the updated aggregate via SaleRepositoryPort.save().
 * 6. Publish uncommitted domain events (SaleCancelledEvent).
 * 7. Return the updated application representation (SaleDTO).
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
      if (!command || !command.input) {
        return SalesApplicationResult.fail(
          new InvalidSaleStateException('Command and input cannot be null or undefined.'),
        );
      }

      const { input } = command;
      const saleId = input.saleId?.trim();
      if (!saleId) {
        return SalesApplicationResult.fail(
          new InvalidSaleStateException('Sale ID cannot be empty or whitespace.'),
        );
      }

      // 1. Load Sale from repository
      const sale = await this.saleRepository.findById(saleId);

      // 2. Verify Sale exists
      if (!sale) {
        return SalesApplicationResult.fail(new SaleNotFoundException(saleId));
      }

      // Enforce multi-tenant isolation if tenantId is provided in command
      if (input.tenantId) {
        enforceTenantIsolation(sale.tenantId, input.tenantId);
      }

      // 3. Invoke domain operation - domain owns lifecycle rules and cancellation invariants
      sale.cancel(input.reason, this.clock);

      // 4. Persist aggregate through repository
      await this.saleRepository.save(sale);

      // 5. Publish domain events (SaleCancelledEvent)
      const events = sale.getUncommittedEvents();
      if (this.eventPublisher && events.length > 0) {
        await this.eventPublisher.publish(events);
      }
      sale.clearEvents();

      // 6. Return updated representation
      return SalesApplicationResult.ok(SaleMapper.toDTO(sale));
    } catch (err: unknown) {
      const error = err instanceof Error ? err : new Error(String(err));
      return SalesApplicationResult.fail(error);
    }
  }
}
