import { CommandHandler } from '../shared/command-handler.interface';
import { ApplicationResult } from '../shared/application-result';
import { AdjustStockOutCommand } from '../commands/adjust-stock-out.command';
import { StockMutationResultDTO } from '../dtos/stock-mutation-result.dto';
import { InventoryItemRepository } from '../../domain/inventory/repositories/inventory-item.repository.interface';
import { ResourcesEventPublisherPort } from '../ports/resources-event-publisher.port';
import { StockOperationOrchestrator } from '../shared/stock-operation-orchestrator';

/**
 * Use case handler orchestrating negative inventory adjustments (audit shrinkage, discrepancies).
 * Operation: ADJUSTMENT_OUT.
 */
export class AdjustStockOutHandler implements CommandHandler<
  AdjustStockOutCommand,
  ApplicationResult<StockMutationResultDTO>
> {
  private readonly orchestrator: StockOperationOrchestrator;

  constructor(repository: InventoryItemRepository, eventPublisher?: ResourcesEventPublisherPort) {
    this.orchestrator = new StockOperationOrchestrator(repository, eventPublisher);
  }

  public async execute(
    command: AdjustStockOutCommand,
  ): Promise<ApplicationResult<StockMutationResultDTO>> {
    const { input } = command;

    const reason = input.reason?.trim();
    if (!reason || reason.length < 3) {
      return ApplicationResult.fail(
        'A valid reason (minimum 3 characters) is required for negative stock adjustment.',
      );
    }
    if (typeof input.quantity !== 'number' || isNaN(input.quantity) || input.quantity <= 0) {
      return ApplicationResult.fail(
        'Adjusted quantity must be a positive number greater than zero.',
      );
    }

    return this.orchestrator.executeMutation({
      itemId: input.itemId,
      actorId: input.actorId,
      mutate: (item) =>
        item.adjustStockOut({
          quantity: input.quantity,
          reason,
          actorId: input.actorId,
        }),
    });
  }
}
