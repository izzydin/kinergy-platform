import { CommandHandler } from '../shared/command-handler.interface';
import { ApplicationResult } from '../shared/application-result';
import { SellStockCommand } from '../commands/sell-stock.command';
import { StockMutationResultDTO } from '../dtos/stock-mutation-result.dto';
import { InventoryItemRepository } from '../../domain/inventory/repositories/inventory-item.repository.interface';
import { ResourcesEventPublisherPort } from '../ports/resources-event-publisher.port';
import {
  InventoryStockDecrementPort,
  DecrementStockParams,
} from '../ports/inventory-stock-decrement.port';
import { StockOperationOrchestrator } from '../shared/stock-operation-orchestrator';

/**
 * Use case handler orchestrating retail point-of-sale stock deduction.
 * Operation: SALE.
 *
 * Implements InventoryStockDecrementPort as the authoritative application boundary
 * for external commercial or order-taking contexts.
 */
export class SellStockHandler
  implements
    CommandHandler<SellStockCommand, ApplicationResult<StockMutationResultDTO>>,
    InventoryStockDecrementPort
{
  private readonly orchestrator: StockOperationOrchestrator;

  constructor(repository: InventoryItemRepository, eventPublisher?: ResourcesEventPublisherPort) {
    this.orchestrator = new StockOperationOrchestrator(repository, eventPublisher);
  }

  /**
   * Application port method allowing external domains (Sales, POS, Orders) to request
   * stock deductions without manipulating inventory models or tables directly.
   */
  public async sellStock(
    params: DecrementStockParams,
  ): Promise<ApplicationResult<StockMutationResultDTO>> {
    return this.execute(new SellStockCommand(params));
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
    if (
      typeof input.quantity !== 'number' ||
      isNaN(input.quantity) ||
      !isFinite(input.quantity) ||
      input.quantity <= 0
    ) {
      return ApplicationResult.fail('Sale quantity must be a positive number greater than zero.');
    }

    return this.orchestrator.executeMutation({
      itemId: input.itemId,
      actorId: input.actorId,
      tenantId: input.tenantId,
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
