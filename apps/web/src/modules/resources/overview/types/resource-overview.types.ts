/**
 * Resource Overview Domain View Models & Query Parameters
 *
 * Defines strongly-typed contracts for the executive Resource Overview Dashboard (Milestone 6.14).
 * Strictly mirrors NestJS backend ResourceOverviewResponseDto (/api/v1/resources/overview).
 *
 * Semantic Rule:
 * Preserves strict conceptual separation between:
 * - Consumable Inventory (working capital available for sale/consumption)
 * - Fixed Assets (capital equipment owned by the enterprise)
 * - Combined Resource Value (enterprise balance sheet aggregate)
 */

export interface ConsumableInventoryOverviewVM {
  /** Total working capital acquisition value in dollars */
  totalValueAmount: number;
  /** Count of inventory items at or below reorder threshold */
  lowStockItemCount: number;
  /** Total number of distinct inventory products / SKUs */
  totalDistinctItems: number;
  /** Total physical quantity units on hand across all items */
  totalQuantityUnits: number;
}

export interface FixedAssetsOverviewVM {
  /** Total carrying book value of fixed assets in dollars */
  totalCarryingValueAmount: number;
  /** Total number of active fixed assets */
  activeAssetCount: number;
  /** Total number of assets currently undergoing maintenance */
  underMaintenanceAssetCount: number;
  /** Total number of damaged assets awaiting repair or disposal */
  damagedAssetCount: number;
  /** Total number of retired / decommissioned assets */
  retiredAssetCount: number;
  /** Total number of fixed assets across all lifecycle statuses */
  totalAssetCount: number;
}

export interface CombinedResourceOverviewVM {
  /**
   * Total combined resource balance sheet value
   * (Inventory Working Capital + Fixed Asset Carrying Value)
   *
   * STRICT SEMANTIC RULE:
   * Must NEVER be labeled as "Inventory" or "Inventory Value".
   */
  totalCombinedValueAmount: number;
}

export interface ResourceOverviewVM {
  /** Domain A: Consumable inventory operational overview and working capital telemetry */
  consumableInventory: ConsumableInventoryOverviewVM;
  /** Domain B: Fixed assets operational overview and carrying value telemetry */
  fixedAssets: FixedAssetsOverviewVM;
  /** Combined enterprise balance sheet resource valuation */
  combined: CombinedResourceOverviewVM;
  /** ISO currency code (e.g. 'USD') */
  currency: string;
  /** ISO 8601 calculation timestamp */
  calculatedAt: string;
}

export interface GetResourceOverviewParams {
  /** Whether to include soft-archived items in overview calculations */
  includeArchived?: boolean;
}
