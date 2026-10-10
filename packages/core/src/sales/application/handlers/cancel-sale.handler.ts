import { SalesCommandHandler } from '../shared/sales-command-handler.interface';
import { SalesApplicationResult } from '../shared/sales-application-result';
import { CancelSaleCommand } from '../commands/cancel-sale.command';
import { SaleDTO } from '../dtos/sale.dto';
import { SaleMapper } from '../mappers/sale.mapper';
import { SaleRepositoryPort } from '../ports/sale-repository.port';
import { SalesEventPublisherPort } from '../ports/sales-event-publisher.port';
import { DomainEvent } from '../../domain/shared/domain-event';
import { Clock, SystemClock } from '../../domain/shared/clock';
import { SaleNotFoundException } from '../exceptions/sale-not-found.exception';
import { InvalidSaleStateException } from '../../domain/exceptions/invalid-sale-state.exception';
import { enforceTenantIsolation } from '../shared/payment-authorization';
import {
  checkSaleAuthorization,
  enforceSaleTenantIsolation,
  SALE_CANCELLATION_ROLES,
} from '../shared/sale-authorization';

/**
 * Application command handler orchestrating explicit Sale cancellation.
 *
 * Responsibilities:
 * 1. Accept and validate the CancelSaleCommand input shape (saleId required).
 * 2. Load the Sale Aggregate through SaleRepositoryPort inside a transaction boundary.
 * 3. Verify Sale exists (and enforce tenant isolation when tenantId is supplied).
 * 4. Invoke domain operation: sale.cancel(reason, clock).
 *    - Never directly sets status = CANCELLED.
 *    - Never duplicates cancellation validation in the application layer.
 *    - The Sale Aggregate owns whether cancellation is allowed, valid lifecycle transitions,
 *      and cancellation invariants.
 *    - Preserves aggregate boundaries without silently mutating Payment or Receipt states.
 * 5. Persist the updated aggregate via SaleRepositoryPort.save() atomically.
 *    - Guarantees the Sale cannot be left in a partially modified state on failure.
 * 6. Publish uncommitted domain events (SaleCancelledEvent) strictly after transaction commit.
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

      const runInTx = this.saleRepository.withTransaction
        ? (fn: (repo: SaleRepositoryPort) => Promise<SalesApplicationResult<SaleDTO>>) =>
            this.saleRepository.withTransaction!(fn)
        : (fn: (repo: SaleRepositoryPort) => Promise<SalesApplicationResult<SaleDTO>>) =>
            fn(this.saleRepository);

      let eventsToPublish: ReadonlyArray<DomainEvent> = [];

      const result = await runInTx(async (repo) => {
        // 1. Load Sale from transactional repository
        const sale = await repo.findById(saleId);

        // 2. Verify Sale exists
        if (!sale) {
          return SalesApplicationResult.fail(new SaleNotFoundException(saleId));
        }

        // Enforce multi-tenant isolation if tenantId is provided in command
        if (input.tenantId) {
          enforceTenantIsolation(sale.tenantId, input.tenantId);
        } else if (input.currentUser?.tenantId) {
          enforceSaleTenantIsolation(sale.tenantId, input.currentUser.tenantId, saleId);
        }

        // Caller authorization check: sales.manage (ADR-0135)
        checkSaleAuthorization(input.currentUser, ['sales.manage'], SALE_CANCELLATION_ROLES);

        // 3. Invoke domain operation - domain owns lifecycle rules and cancellation invariants
        sale.cancel(input.reason, this.clock);

        // 4. Persist aggregate through repository atomically
        await repo.save(sale);

        // Capture uncommitted domain events to dispatch only after successful transaction commit
        eventsToPublish = sale.getUncommittedEvents();
        sale.clearEvents();

        // Return updated representation
        return SalesApplicationResult.ok(SaleMapper.toDTO(sale));
      });

      // 5. Publish domain events (SaleCancelledEvent) strictly after successful transaction commit
      if (result.isSuccess && this.eventPublisher && eventsToPublish.length > 0) {
        await this.eventPublisher.publish(eventsToPublish);
      }

      // 6. Return updated representation
      return result;
    } catch (err: unknown) {
      const error = err instanceof Error ? err : new Error(String(err));
      return SalesApplicationResult.fail(error);
    }
  }
}
