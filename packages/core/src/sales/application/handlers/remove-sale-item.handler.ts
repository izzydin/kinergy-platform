import { SalesCommandHandler } from '../shared/sales-command-handler.interface';
import { SalesApplicationResult } from '../shared/sales-application-result';
import { RemoveSaleItemCommand } from '../commands/remove-sale-item.command';
import { SaleDTO } from '../dtos/sale.dto';
import { SaleMapper } from '../mappers/sale.mapper';
import { SaleRepositoryPort } from '../ports/sale-repository.port';
import { SalesEventPublisherPort } from '../ports/sales-event-publisher.port';
import { DomainEvent } from '../../domain/shared/domain-event';
import { Clock, SystemClock } from '../../domain/shared/clock';
import { SaleNotFoundException } from '../exceptions/sale-not-found.exception';
import { InvalidSaleStateException } from '../../domain/exceptions/invalid-sale-state.exception';
import {
  checkSaleAuthorization,
  enforceSaleTenantIsolation,
  SALE_MUTATION_ROLES,
} from '../shared/sale-authorization';

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

      const runInTx = this.saleRepository.withTransaction
        ? (fn: (repo: SaleRepositoryPort) => Promise<SalesApplicationResult<SaleDTO>>) =>
            this.saleRepository.withTransaction!(fn)
        : (fn: (repo: SaleRepositoryPort) => Promise<SalesApplicationResult<SaleDTO>>) =>
            fn(this.saleRepository);

      let eventsToPublish: ReadonlyArray<DomainEvent> = [];

      const result = await runInTx(async (repo) => {
        // 1. Load Sale from transactional repository
        const sale = await repo.findById(saleId);

        // 2. Validate Sale existence
        if (!sale) {
          return SalesApplicationResult.fail(new SaleNotFoundException(saleId));
        }

        // Multi-tenant boundary check (ADR-0135 Section 9)
        enforceSaleTenantIsolation(
          sale.tenantId,
          input.tenantId ?? input.currentUser?.tenantId,
          saleId,
        );

        // Caller authorization check: sales.manage (ADR-0135)
        checkSaleAuthorization(input.currentUser, ['sales.manage'], SALE_MUTATION_ROLES);

        // 3. Identify the requested SaleItem & 4. Invoke approved domain operation for removal
        // 5. Recalculates totals through domain recalculateTotals() inside sale.removeItem
        sale.removeItem(input.itemId.trim(), this.clock);

        // 6. Persist the modified aggregate (item deletion and sale totals update)
        await repo.save(sale);

        // Capture uncommitted domain events to dispatch only after successful transaction commit
        eventsToPublish = sale.getUncommittedEvents();
        sale.clearEvents();

        // Return the approved Sale representation
        return SalesApplicationResult.ok(SaleMapper.toDTO(sale));
      });

      // Dispatch domain events strictly after successful transaction commit
      if (result.isSuccess && this.eventPublisher && eventsToPublish.length > 0) {
        await this.eventPublisher.publish(eventsToPublish);
      }

      // 7. Return the approved Sale representation
      return result;
    } catch (err: unknown) {
      const error = err instanceof Error ? err : new Error(String(err));
      return SalesApplicationResult.fail(error);
    }
  }
}
