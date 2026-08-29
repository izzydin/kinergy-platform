import { ApplicationResult } from './application-result';
import { StockMutationResultDTO } from '../dtos/stock-mutation-result.dto';
import { InventoryItemMapper } from '../mappers/inventory-item.mapper';
import { InventoryItemRepository } from '../../domain/inventory/repositories/inventory-item.repository.interface';
import { ResourcesEventPublisherPort } from '../ports/resources-event-publisher.port';
import { InventoryItem } from '../../domain/inventory/inventory-item.aggregate';
import { StockMovement } from '../../domain/inventory/entities/stock-movement.entity';
import {
  InventoryOptimisticLockException,
  InsufficientStockException,
  InvalidInventoryItemStateException,
  InvalidQuantityException,
  InventoryDomainException,
} from '../../domain/inventory/exceptions';

/**
 * Common parameter contract for orchestrating domain stock mutations.
 */
export interface ExecuteStockMutationParams {
  itemId: string;
  actorId: string;
  tenantId?: string;
  mutate: (item: InventoryItem) => StockMovement;
}

/**
 * Shared transactional orchestrator for all consumable inventory stock mutations.
 *
 * Implements the authoritative 10-step sequence:
 * 1. Validate inputs (item ID, actor ID)
 * 2. Load aggregate from repository
 * 3. Verify tenant boundary
 * 4. Execute typed domain mutation closure (enforcing non-negative stock and state invariants)
 * 5. Persist aggregate atomically with Optimistic Concurrency Control (OCC) version check
 * 6. Publish domain events only after successful persistence commit
 * 7. Map resulting aggregate and movement to StockMutationResultDTO
 */
export class StockOperationOrchestrator {
  constructor(
    private readonly repository: InventoryItemRepository,
    private readonly eventPublisher?: ResourcesEventPublisherPort,
  ) {}

  public async executeMutation(
    params: ExecuteStockMutationParams,
  ): Promise<ApplicationResult<StockMutationResultDTO>> {
    try {
      const itemId = params.itemId?.trim();
      if (!itemId) {
        return ApplicationResult.fail('Item ID is required.');
      }
      const actorId = params.actorId?.trim();
      if (!actorId) {
        return ApplicationResult.fail('Actor ID is required.');
      }

      const item = await this.repository.findById(itemId);
      if (!item) {
        return ApplicationResult.fail(`Inventory item with id '${itemId}' not found.`);
      }

      if (params.tenantId && item.tenantId !== params.tenantId) {
        return ApplicationResult.fail(`Inventory item with id '${itemId}' not found.`);
      }

      // Execute domain mutation (asserts state, balances, creates movement, increments version)
      const movement = params.mutate(item);

      // Atomic persistence inside transaction with OCC check
      await this.repository.save(item);

      // Publish uncommitted domain events
      if (this.eventPublisher && item.getUncommittedEvents().length > 0) {
        await this.eventPublisher.publish(item.getUncommittedEvents());
      }
      item.clearEvents();

      return ApplicationResult.ok({
        item: InventoryItemMapper.toDTO(item),
        movement: InventoryItemMapper.toMovementDTO(movement),
      });
    } catch (err: unknown) {
      if (
        err instanceof InsufficientStockException ||
        err instanceof InvalidInventoryItemStateException ||
        err instanceof InvalidQuantityException ||
        err instanceof InventoryOptimisticLockException ||
        err instanceof InventoryDomainException
      ) {
        return ApplicationResult.fail(err.message);
      }
      const message = err instanceof Error ? err.message : 'Failed to execute stock operation.';
      return ApplicationResult.fail(message);
    }
  }
}
