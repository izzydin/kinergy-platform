import { CommandHandler } from '../shared/command-handler.interface';
import { ApplicationResult } from '../shared/application-result';
import { ConsumeStockCommand } from '../commands/consume-stock.command';
import { StockMutationResultDTO } from '../dtos/stock-mutation-result.dto';
import { InventoryItemRepository } from '../../domain/inventory/repositories/inventory-item.repository.interface';
import { ResourcesEventPublisherPort } from '../ports/resources-event-publisher.port';
import { StockOperationOrchestrator } from '../shared/stock-operation-orchestrator';

/**
 * Use case handler orchestrating clinical or operational stock consumption.
 * Operation: CONSUMPTION.
 */
export class ConsumeStockHandler implements CommandHandler<
  ConsumeStockCommand,
  ApplicationResult<StockMutationResultDTO>
> {
  private readonly orchestrator: StockOperationOrchestrator;

  constructor(repository: InventoryItemRepository, eventPublisher?: ResourcesEventPublisherPort) {
    this.orchestrator = new StockOperationOrchestrator(repository, eventPublisher);
  }

  public async execute(
    command: ConsumeStockCommand,
  ): Promise<ApplicationResult<StockMutationResultDTO>> {
    const { input } = command;

    const reason = input.reason?.trim();
    if (!reason || reason.length < 3) {
      return ApplicationResult.fail(
        'A valid reason (minimum 3 characters) is required for stock consumption.',
      );
    }
    if (
      typeof input.quantity !== 'number' ||
      isNaN(input.quantity) ||
      !isFinite(input.quantity) ||
      input.quantity <= 0
    ) {
      return ApplicationResult.fail(
        'Consumed quantity must be a positive number greater than zero.',
      );
    }

    return this.orchestrator.executeMutation({
      itemId: input.itemId,
      actorId: input.actorId,
      tenantId: input.tenantId,
      mutate: (item) =>
        item.consumeStock({
          quantity: input.quantity,
          referenceId: input.referenceId,
          reason,
          actorId: input.actorId,
        }),
    });
  }
}
