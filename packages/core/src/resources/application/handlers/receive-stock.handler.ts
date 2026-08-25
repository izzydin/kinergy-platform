import { CommandHandler } from '../shared/command-handler.interface';
import { ApplicationResult } from '../shared/application-result';
import { ReceiveStockCommand } from '../commands/receive-stock.command';
import { StockMutationResultDTO } from '../dtos/stock-mutation-result.dto';
import { InventoryItemMapper } from '../mappers/inventory-item.mapper';
import { InventoryItemRepository } from '../../domain/inventory/repositories/inventory-item.repository.interface';
import { ResourcesEventPublisherPort } from '../ports/resources-event-publisher.port';

/**
 * Use case handler orchestrating vendor purchase receipt of stock.
 * Operation: PURCHASE.
 */
export class ReceiveStockHandler implements CommandHandler<
  ReceiveStockCommand,
  ApplicationResult<StockMutationResultDTO>
> {
  constructor(
    private readonly repository: InventoryItemRepository,
    private readonly eventPublisher?: ResourcesEventPublisherPort,
  ) {}

  public async execute(
    command: ReceiveStockCommand,
  ): Promise<ApplicationResult<StockMutationResultDTO>> {
    try {
      const { input } = command;

      const itemId = input.itemId?.trim();
      if (!itemId) {
        return ApplicationResult.fail('Item ID is required.');
      }
      const actorId = input.actorId?.trim();
      if (!actorId) {
        return ApplicationResult.fail('Actor ID is required.');
      }
      const reason = input.reason?.trim();
      if (!reason || reason.length < 3) {
        return ApplicationResult.fail(
          'A valid reason (minimum 3 characters) is required for receiving stock.',
        );
      }
      if (typeof input.quantity !== 'number' || isNaN(input.quantity) || input.quantity <= 0) {
        return ApplicationResult.fail(
          'Received quantity must be a positive number greater than zero.',
        );
      }

      const item = await this.repository.findById(itemId);
      if (!item) {
        return ApplicationResult.fail(`Inventory item with id '${itemId}' not found.`);
      }

      // Domain mutation (generates StockMovement and increments version)
      const movement = item.receiveStock({
        quantity: input.quantity,
        unitCost: input.unitCost,
        referenceId: input.referenceId,
        reason,
        actorId,
      });

      // Atomic persistence inside transaction with OCC check
      await this.repository.save(item);

      if (this.eventPublisher && item.getUncommittedEvents().length > 0) {
        await this.eventPublisher.publish(item.getUncommittedEvents());
      }
      item.clearEvents();

      return ApplicationResult.ok({
        item: InventoryItemMapper.toDTO(item),
        movement: InventoryItemMapper.toMovementDTO(movement),
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to receive stock.';
      return ApplicationResult.fail(message);
    }
  }
}
