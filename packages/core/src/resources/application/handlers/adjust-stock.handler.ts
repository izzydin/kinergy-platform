import { CommandHandler } from '../shared/command-handler.interface';
import { ApplicationResult } from '../shared/application-result';
import { AdjustStockCommand } from '../commands/adjust-stock.command';
import { StockMutationResultDTO } from '../dtos/stock-mutation-result.dto';
import { InventoryItemRepository } from '../../domain/inventory/repositories/inventory-item.repository.interface';
import { ResourcesEventPublisherPort } from '../ports/resources-event-publisher.port';
import { StockOperationOrchestrator } from '../shared/stock-operation-orchestrator';

/**
 * Use case handler orchestrating explicit directional stock adjustments (Audit In / Audit Out).
 * Enforces mandatory business reason justification and zero silent edits.
 */
export class AdjustStockHandler implements CommandHandler<
  AdjustStockCommand,
  ApplicationResult<StockMutationResultDTO>
> {
  private readonly orchestrator: StockOperationOrchestrator;

  constructor(repository: InventoryItemRepository, eventPublisher?: ResourcesEventPublisherPort) {
    this.orchestrator = new StockOperationOrchestrator(repository, eventPublisher);
  }

  public async execute(
    command: AdjustStockCommand,
  ): Promise<ApplicationResult<StockMutationResultDTO>> {
    const { input } = command;

    // 1. Mandatory audit reason validation
    const reason = input.reason?.trim();
    if (!reason || reason.length < 3) {
      return ApplicationResult.fail(
        'A mandatory, meaningful reason (minimum 3 characters) is required for stock adjustments.',
      );
    }

    // 2. Explicit direction type validation
    if (input.type !== 'ADJUSTMENT_IN' && input.type !== 'ADJUSTMENT_OUT') {
      return ApplicationResult.fail(
        "Invalid adjustment type. Must be either 'ADJUSTMENT_IN' or 'ADJUSTMENT_OUT'.",
      );
    }

    // 3. Positive finite quantity validation
    if (
      typeof input.quantity !== 'number' ||
      isNaN(input.quantity) ||
      !isFinite(input.quantity) ||
      input.quantity <= 0
    ) {
      return ApplicationResult.fail(
        'Adjustment quantity must be a positive finite number greater than zero.',
      );
    }

    // 4. Delegate to domain mutation via shared orchestrator
    return this.orchestrator.executeMutation({
      itemId: input.itemId,
      actorId: input.actorId,
      tenantId: input.tenantId,
      mutate: (item) => {
        if (input.type === 'ADJUSTMENT_IN') {
          return item.adjustStockIn({
            quantity: input.quantity,
            reason,
            actorId: input.actorId,
          });
        } else {
          return item.adjustStockOut({
            quantity: input.quantity,
            reason,
            actorId: input.actorId,
          });
        }
      },
    });
  }
}
