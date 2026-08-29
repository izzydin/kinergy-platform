import { CommandHandler } from '../shared/command-handler.interface';
import { ApplicationResult } from '../shared/application-result';
import { AdjustStockInCommand } from '../commands/adjust-stock-in.command';
import { StockMutationResultDTO } from '../dtos/stock-mutation-result.dto';
import { InventoryItemRepository } from '../../domain/inventory/repositories/inventory-item.repository.interface';
import { ResourcesEventPublisherPort } from '../ports/resources-event-publisher.port';
import { StockOperationOrchestrator } from '../shared/stock-operation-orchestrator';

/**
 * Use case handler orchestrating positive inventory adjustments (audit counts, found stock).
 * Operation: ADJUSTMENT_IN.
 */
export class AdjustStockInHandler implements CommandHandler<
  AdjustStockInCommand,
  ApplicationResult<StockMutationResultDTO>
> {
  private readonly orchestrator: StockOperationOrchestrator;

  constructor(repository: InventoryItemRepository, eventPublisher?: ResourcesEventPublisherPort) {
    this.orchestrator = new StockOperationOrchestrator(repository, eventPublisher);
  }

  public async execute(
    command: AdjustStockInCommand,
  ): Promise<ApplicationResult<StockMutationResultDTO>> {
    const { input } = command;

    const reason = input.reason?.trim();
    if (!reason || reason.length < 3) {
      return ApplicationResult.fail(
        'A valid reason (minimum 3 characters) is required for positive stock adjustment.',
      );
    }
    if (
      typeof input.quantity !== 'number' ||
      isNaN(input.quantity) ||
      !isFinite(input.quantity) ||
      input.quantity <= 0
    ) {
      return ApplicationResult.fail(
        'Adjusted quantity must be a positive number greater than zero.',
      );
    }

    return this.orchestrator.executeMutation({
      itemId: input.itemId,
      actorId: input.actorId,
      tenantId: input.tenantId,
      mutate: (item) =>
        item.adjustStockIn({
          quantity: input.quantity,
          reason,
          actorId: input.actorId,
        }),
    });
  }
}
