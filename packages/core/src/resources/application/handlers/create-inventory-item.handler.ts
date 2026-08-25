import { CommandHandler } from '../shared/command-handler.interface';
import { ApplicationResult } from '../shared/application-result';
import { CreateInventoryItemCommand } from '../commands/create-inventory-item.command';
import { InventoryItemDTO } from '../dtos/inventory-item.dto';
import { InventoryItemMapper } from '../mappers/inventory-item.mapper';
import { InventoryItemRepository } from '../../domain/inventory/repositories/inventory-item.repository.interface';
import { ResourcesEventPublisherPort } from '../ports/resources-event-publisher.port';
import { InventoryItem } from '../../domain/inventory/inventory-item.aggregate';

/**
 * Use case handler orchestrating the creation of a new catalog inventory product.
 */
export class CreateInventoryItemHandler implements CommandHandler<
  CreateInventoryItemCommand,
  ApplicationResult<InventoryItemDTO>
> {
  constructor(
    private readonly repository: InventoryItemRepository,
    private readonly eventPublisher?: ResourcesEventPublisherPort,
  ) {}

  public async execute(
    command: CreateInventoryItemCommand,
  ): Promise<ApplicationResult<InventoryItemDTO>> {
    try {
      const { input } = command;

      const sku = input.sku?.trim();
      if (!sku) {
        return ApplicationResult.fail('SKU is required.');
      }
      const name = input.name?.trim();
      if (!name) {
        return ApplicationResult.fail('Item name is required.');
      }
      const actorId = input.actorId?.trim();
      if (!actorId) {
        return ApplicationResult.fail('Actor ID is required.');
      }

      // Check unique SKU per tenant
      const existing = await this.repository.findBySku(sku, input.tenantId);
      if (existing) {
        return ApplicationResult.fail(`Inventory item with SKU '${sku}' already exists.`);
      }

      // Construct aggregate
      const item = InventoryItem.create({
        sku,
        name,
        description: input.description,
        category: input.category,
        unit: input.unit,
        minimumStock: input.minimumStock,
        initialStock: input.initialStock,
        purchaseCost: input.purchaseCost,
        sellingPrice: input.sellingPrice,
        locationRef: input.locationRef,
        tenantId: input.tenantId,
        recordedByUserId: actorId,
      });

      await this.repository.save(item);

      if (this.eventPublisher && item.getUncommittedEvents().length > 0) {
        await this.eventPublisher.publish(item.getUncommittedEvents());
      }
      item.clearEvents();

      return ApplicationResult.ok(InventoryItemMapper.toDTO(item));
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to create inventory item.';
      return ApplicationResult.fail(message);
    }
  }
}
