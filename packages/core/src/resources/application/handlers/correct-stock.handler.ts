import { CommandHandler } from '../shared/command-handler.interface';
import { ApplicationResult } from '../shared/application-result';
import { CorrectStockCommand } from '../commands/correct-stock.command';
import { StockMutationResultDTO } from '../dtos/stock-mutation-result.dto';
import { InventoryItemRepository } from '../../domain/inventory/repositories/inventory-item.repository.interface';
import { ResourcesEventPublisherPort } from '../ports/resources-event-publisher.port';
import { StockOperationOrchestrator } from '../shared/stock-operation-orchestrator';

/**
 * Use case handler orchestrating direct stock count reconciliation (inventory audit counts).
 * Operation: CORRECTION.
 */
export class CorrectStockHandler implements CommandHandler<
  CorrectStockCommand,
  ApplicationResult<StockMutationResultDTO>
> {
  private readonly orchestrator: StockOperationOrchestrator;

  constructor(repository: InventoryItemRepository, eventPublisher?: ResourcesEventPublisherPort) {
    this.orchestrator = new StockOperationOrchestrator(repository, eventPublisher);
  }

  public async execute(
    command: CorrectStockCommand,
  ): Promise<ApplicationResult<StockMutationResultDTO>> {
    const { input } = command;

    const reason = input.reason?.trim();
    if (!reason || reason.length < 3) {
      return ApplicationResult.fail(
        'A valid reason (minimum 3 characters) is required for stock count correction.',
      );
    }
    if (
      typeof input.targetCount !== 'number' ||
      isNaN(input.targetCount) ||
      !isFinite(input.targetCount) ||
      input.targetCount < 0
    ) {
      return ApplicationResult.fail('Target stock count must be a non-negative number.');
    }

    return this.orchestrator.executeMutation({
      itemId: input.itemId,
      actorId: input.actorId,
      tenantId: input.tenantId,
      mutate: (item) =>
        item.correctStock({
          targetCount: input.targetCount,
          reason,
          actorId: input.actorId,
        }),
    });
  }
}
