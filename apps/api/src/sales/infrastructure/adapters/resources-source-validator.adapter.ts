import { Injectable, Optional } from '@nestjs/common';
import {
  GetInventoryItemByIdHandler,
  GetInventoryItemByIdQuery,
  INVENTORY_CATEGORY_REGISTRY,
  InventoryCategory,
  SaleSourceType,
  SourceType,
} from '@kinergy-platform/core';
import {
  ValidateSourceInput,
  SaleSourceValidationResult,
  SourceCommercialDetails,
} from '@kinergy-platform/core';

/**
 * Adapter validating consumable inventory (food, drinks, retail) commercial eligibility for Sales checkout.
 * Adheres strictly to ADR-0110, ADR-0121, and ADR-0139.
 */
@Injectable()
export class ResourcesSourceValidatorAdapter {
  constructor(
    @Optional()
    private readonly getItemByIdHandler?: GetInventoryItemByIdHandler,
  ) {}

  public async validate(input: ValidateSourceInput): Promise<SaleSourceValidationResult> {
    const rawType = String(input.sourceType);
    const isResources =
      rawType === SaleSourceType.FOOD ||
      rawType === SaleSourceType.DRINK ||
      rawType === SourceType.INVENTORY_ITEM ||
      rawType === 'FOOD' ||
      rawType === 'DRINK' ||
      rawType === 'INVENTORY_ITEM';

    if (!isResources) {
      return {
        isValid: false,
        exists: false,
        belongsToContext: false,
        actualContext: 'unknown',
        errorMessage: `Source type '${rawType}' is not managed by Resources Management.`,
      };
    }

    const itemId = input.sourceId.trim();
    if (!itemId) {
      return {
        isValid: false,
        exists: false,
        belongsToContext: true,
        actualContext: 'resources',
        errorMessage: 'Inventory item ID cannot be empty.',
      };
    }

    if (!this.getItemByIdHandler) {
      return {
        isValid: false,
        exists: false,
        belongsToContext: true,
        actualContext: 'resources',
        errorMessage: 'Resources inventory query handler is not configured.',
      };
    }

    try {
      const query = new GetInventoryItemByIdQuery({
        id: itemId,
        tenantId: input.tenantId?.trim(),
      });
      const result = await this.getItemByIdHandler.execute(query);

      if (result.isFailure) {
        return {
          isValid: false,
          exists: false,
          belongsToContext: true,
          actualContext: 'resources',
          errorMessage: result.getError(),
        };
      }

      const item = result.getValue();

      // Lifecycle Invariant: Only ACTIVE items can be sold (ADR-0139 §3.3)
      if (item.status.toUpperCase() !== 'ACTIVE') {
        return {
          isValid: false,
          exists: true,
          belongsToContext: true,
          actualContext: 'resources',
          errorMessage: `Inventory item '${item.name}' is in '${item.status}' status. Only ACTIVE items can be sold.`,
        };
      }

      // Retail Eligibility Invariant: Only retail-eligible inventory items can be sold (ADR-0088, ADR-0121, ADR-0139)
      const categoryDesc = INVENTORY_CATEGORY_REGISTRY[item.category as InventoryCategory];
      if (categoryDesc && !categoryDesc.isRetailEligible) {
        return {
          isValid: false,
          exists: true,
          belongsToContext: true,
          actualContext: 'resources',
          errorMessage: `Inventory item '${item.name}' belonging to category '${item.category}' is not eligible for retail sale.`,
        };
      }

      // Stock Invariant: Verify sufficient on-hand quantity if requested
      const requestedQty = input.requestedQuantity ?? 1;
      if (item.quantityOnHand < requestedQty) {
        return {
          isValid: false,
          exists: true,
          belongsToContext: true,
          actualContext: 'resources',
          errorMessage: `Insufficient stock for '${item.name}'. Available: ${item.quantityOnHand}, Requested: ${requestedQty}.`,
        };
      }

      // Authoritative Price Resolution from inventory catalog (converted to integer cents)
      const unitPriceCents = Math.round(Number(item.sellingPriceAmount) * 100);

      const commercialDetails: SourceCommercialDetails = {
        unitPriceCents,
        currency: item.sellingPriceCurrency || 'USD',
        description: item.name,
        skuOrCode: item.sku,
        version: item.version,
      };

      return {
        isValid: true,
        exists: true,
        belongsToContext: true,
        actualContext: 'resources',
        commercialDetails,
      };
    } catch (err: unknown) {
      const message =
        err instanceof Error
          ? err.message
          : 'Unexpected infrastructure failure during resources validation.';
      return {
        isValid: false,
        exists: false,
        belongsToContext: true,
        actualContext: 'resources',
        errorMessage: message,
      };
    }
  }
}
