import { CommandHandler } from '../shared/command-handler.interface';
import { ApplicationResult } from '../shared/application-result';
import { SellStockCommand } from '../commands/sell-stock.command';
import { StockMutationResultDTO } from '../dtos/stock-mutation-result.dto';
import { InventoryItemRepository } from '../../domain/inventory/repositories/inventory-item.repository.interface';
import { ResourcesEventPublisherPort } from '../ports/resources-event-publisher.port';
import { StockOperationOrchestrator } from '../shared/stock-operation-orchestrator';

/**
 * Use case handler orchestrating retail point-of-sale stock deduction.
 * Operation: SALE.
 */
export class SellStockHandler implements CommandHandler<
  SellStockCommand,
  ApplicationResult<StockMutationResultDTO>
> {
  private readonly orchestrator: StockOperationOrchestrator;

  constructor(repository: InventoryItemRepository, eventPublisher?: ResourcesEventPublisherPort) {
    this.orchestrator = new StockOperationOrchestrator(repository, eventPublisher);
  }

  public async execute(
    command: SellStockCommand,
  ): Promise<ApplicationResult<StockMutationResultDTO>> {
    const { input } = command;

    const reason = input.reason?.trim();
    if (!reason || reason.length < 3) {
      return ApplicationResult.fail(
        'A valid reason (minimum 3 characters) is required for retail sale.',
      );
    }
    if (typeof input.quantity !== 'number' || isNaN(input.quantity) || input.quantity <= 0) {
      return ApplicationResult.fail('Sale quantity must be a positive number greater than zero.');
    }

    return this.orchestrator.executeMutation({
      itemId: input.itemId,
      actorId: input.actorId,
      mutate: (item) =>
        item.sellStock({
          quantity: input.quantity,
          unitCost: input.sellingPrice,
          referenceId: input.referenceId,
          reason,
          actorId: input.actorId,
        }),
    });
  }
}
