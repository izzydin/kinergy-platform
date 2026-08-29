import { CommandHandler } from '../shared/command-handler.interface';
import { ApplicationResult } from '../shared/application-result';
import { ScrapStockCommand } from '../commands/scrap-stock.command';
import { StockMutationResultDTO } from '../dtos/stock-mutation-result.dto';
import { InventoryItemRepository } from '../../domain/inventory/repositories/inventory-item.repository.interface';
import { ResourcesEventPublisherPort } from '../ports/resources-event-publisher.port';
import { StockOperationOrchestrator } from '../shared/stock-operation-orchestrator';

/**
 * Use case handler orchestrating scrapping of damaged or expired consumable inventory.
 * Operation: SCRAP.
 */
export class ScrapStockHandler implements CommandHandler<
  ScrapStockCommand,
  ApplicationResult<StockMutationResultDTO>
> {
  private readonly orchestrator: StockOperationOrchestrator;

  constructor(repository: InventoryItemRepository, eventPublisher?: ResourcesEventPublisherPort) {
    this.orchestrator = new StockOperationOrchestrator(repository, eventPublisher);
  }

  public async execute(
    command: ScrapStockCommand,
  ): Promise<ApplicationResult<StockMutationResultDTO>> {
    const { input } = command;

    const reason = input.reason?.trim();
    if (!reason || reason.length < 3) {
      return ApplicationResult.fail(
        'A valid reason (minimum 3 characters) is required for scrapping stock.',
      );
    }
    if (typeof input.quantity !== 'number' || isNaN(input.quantity) || input.quantity <= 0) {
      return ApplicationResult.fail(
        'Scrapped quantity must be a positive number greater than zero.',
      );
    }

    return this.orchestrator.executeMutation({
      itemId: input.itemId,
      actorId: input.actorId,
      mutate: (item) =>
        item.scrapStock({
          quantity: input.quantity,
          reason,
          actorId: input.actorId,
        }),
    });
  }
}
