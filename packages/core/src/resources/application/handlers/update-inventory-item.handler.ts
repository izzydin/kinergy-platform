import { CommandHandler } from '../shared/command-handler.interface';
import { ApplicationResult } from '../shared/application-result';
import { UpdateInventoryItemCommand } from '../commands/update-inventory-item.command';
import { InventoryItemDTO } from '../dtos/inventory-item.dto';
import { InventoryItemMapper } from '../mappers/inventory-item.mapper';
import { InventoryItemRepository } from '../../domain/inventory/repositories/inventory-item.repository.interface';
import { ResourcesEventPublisherPort } from '../ports/resources-event-publisher.port';

/**
 * Use case handler orchestrating non-stock product metadata updates.
 * Direct stock balance mutations are forbidden through this handler.
 */
export class UpdateInventoryItemHandler implements CommandHandler<
  UpdateInventoryItemCommand,
  ApplicationResult<InventoryItemDTO>
> {
  constructor(
    private readonly repository: InventoryItemRepository,
    private readonly eventPublisher?: ResourcesEventPublisherPort,
  ) {}

  public async execute(
    command: UpdateInventoryItemCommand,
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
        return ApplicationResult.fail('Cross-tenant inventory update forbidden.');
      }

      item.updateCatalogDetails({
        name: input.name,
        description: input.description,
        category: input.category,
        unit: input.unit,
        minimumStock: input.minimumStock,
        purchaseCost: input.purchaseCost,
        sellingPrice: input.sellingPrice,
        locationRef: input.locationRef,
      });

      await this.repository.save(item);

      if (this.eventPublisher && item.getUncommittedEvents().length > 0) {
        await this.eventPublisher.publish(item.getUncommittedEvents());
      }
      item.clearEvents();

      return ApplicationResult.ok(InventoryItemMapper.toDTO(item));
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to update inventory item.';
      return ApplicationResult.fail(message);
    }
  }
}
