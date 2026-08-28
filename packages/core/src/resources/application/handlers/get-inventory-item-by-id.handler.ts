import { QueryHandler } from '../shared/query-handler.interface';
import { ApplicationResult } from '../shared/application-result';
import { GetInventoryItemByIdQuery } from '../queries/get-inventory-item-by-id.query';
import { InventoryItemDTO } from '../dtos/inventory-item.dto';
import { InventoryItemMapper } from '../mappers/inventory-item.mapper';
import { InventoryItemRepository } from '../../domain/inventory/repositories/inventory-item.repository.interface';
import { InventoryItemStatus } from '../../domain/inventory/enums/inventory-item-status.enum';

/**
 * Use case handler retrieving a single inventory product by ID.
 * Respects tenant boundaries and archive visibility rules.
 */
export class GetInventoryItemByIdHandler implements QueryHandler<
  GetInventoryItemByIdQuery,
  ApplicationResult<InventoryItemDTO>
> {
  constructor(private readonly repository: InventoryItemRepository) {}

  public async execute(
    query: GetInventoryItemByIdQuery,
  ): Promise<ApplicationResult<InventoryItemDTO>> {
    try {
      const { input } = query;

      const id = input.id?.trim();
      if (!id) {
        return ApplicationResult.fail('Inventory item ID is required.');
      }

      const item = await this.repository.findById(id);
      if (!item) {
        return ApplicationResult.fail(`Inventory item with ID '${id}' not found.`);
      }

      if (input.tenantId && item.tenantId && input.tenantId !== item.tenantId) {
        return ApplicationResult.fail(`Inventory item with ID '${id}' not found.`);
      }

      if (item.status === InventoryItemStatus.ARCHIVED && !input.includeArchived) {
        return ApplicationResult.fail(
          `Inventory item with ID '${id}' is archived and excluded by query parameters.`,
        );
      }

      return ApplicationResult.ok(InventoryItemMapper.toDTO(item));
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to retrieve inventory item.';
      return ApplicationResult.fail(message);
    }
  }
}
