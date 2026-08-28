import { CommandHandler } from '../shared/command-handler.interface';
import { ApplicationResult } from '../shared/application-result';
import { ArchiveInventoryItemCommand } from '../commands/archive-inventory-item.command';
import { InventoryItemDTO } from '../dtos/inventory-item.dto';
import { InventoryItemMapper } from '../mappers/inventory-item.mapper';
import { InventoryItemRepository } from '../../domain/inventory/repositories/inventory-item.repository.interface';
import { ResourcesEventPublisherPort } from '../ports/resources-event-publisher.port';

/**
 * Use case handler orchestrating the permanent archival of a product.
 * Invariant: Product must have zero stock on hand (quantityOnHand == 0.00).
 */
export class ArchiveInventoryItemHandler implements CommandHandler<
  ArchiveInventoryItemCommand,
  ApplicationResult<InventoryItemDTO>
> {
  constructor(
    private readonly repository: InventoryItemRepository,
    private readonly eventPublisher?: ResourcesEventPublisherPort,
  ) {}

  public async execute(
    command: ArchiveInventoryItemCommand,
  ): Promise<ApplicationResult<InventoryItemDTO>> {
    try {
      const { input } = command;

      const id = input.id?.trim();
      if (!id) {
        return ApplicationResult.fail('Inventory item ID is required.');
      }
      const actorId = input.actorId?.trim();
      if (!actorId) {
        return ApplicationResult.fail('Actor ID is required.');
      }

      const item = await this.repository.findById(id);
      if (!item) {
        return ApplicationResult.fail(`Inventory item with ID '${id}' not found.`);
      }

      if (input.tenantId && item.tenantId && input.tenantId !== item.tenantId) {
        return ApplicationResult.fail('Cross-tenant inventory archival forbidden.');
      }

      item.archive(actorId, input.reason);

      await this.repository.save(item);

      if (this.eventPublisher && item.getUncommittedEvents().length > 0) {
        await this.eventPublisher.publish(item.getUncommittedEvents());
      }
      item.clearEvents();

      return ApplicationResult.ok(InventoryItemMapper.toDTO(item));
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to archive inventory item.';
      return ApplicationResult.fail(message);
    }
  }
}
