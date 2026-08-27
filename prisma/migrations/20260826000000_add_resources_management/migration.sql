-- CreateEnum
CREATE TYPE "InventoryItemStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "StockMovementType" AS ENUM ('PURCHASE', 'SALE', 'CONSUMPTION', 'ADJUSTMENT_IN', 'ADJUSTMENT_OUT', 'CORRECTION', 'SCRAP');

-- CreateEnum
CREATE TYPE "UnitOfMeasure" AS ENUM ('UNITS', 'BOXES', 'BOTTLES', 'ROLLS', 'MILLILITERS', 'GRAMS');

-- CreateEnum
CREATE TYPE "InventoryCategory" AS ENUM ('HEALTHY_MEALS', 'HEALTHY_DRINKS', 'CLEANING_SUPPLIES', 'OFFICE_SUPPLIES', 'SUPPLEMENTS', 'CLINICAL_SUPPLIES', 'THERAPY_CONSUMABLES', 'RETAIL_PRODUCTS');

-- CreateEnum
CREATE TYPE "AssetCategory" AS ENUM ('GYM_EQUIPMENT', 'THERAPY_EQUIPMENT', 'KITCHEN_EQUIPMENT', 'OFFICE_FURNITURE', 'ELECTRONICS', 'CLEANING_EQUIPMENT');

-- CreateEnum
CREATE TYPE "AssetStatus" AS ENUM ('ACTIVE', 'UNDER_MAINTENANCE', 'DAMAGED', 'RETIRED', 'SOLD');

-- CreateEnum
CREATE TYPE "AssetCondition" AS ENUM ('EXCELLENT', 'GOOD', 'FAIR', 'NEEDS_REPAIR', 'OUT_OF_SERVICE');

-- CreateEnum
CREATE TYPE "AssetHistoryEventType" AS ENUM ('CREATED', 'UPDATED', 'TRANSFERRED', 'STATUS_CHANGED', 'CONDITION_CHANGED', 'VALUE_UPDATED', 'MAINTENANCE_RECORDED', 'RETIRED', 'SOLD');

-- CreateTable
CREATE TABLE "inventory_items" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT,
    "sku" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "category" "InventoryCategory" NOT NULL DEFAULT 'CLINICAL_SUPPLIES',
    "unit" "UnitOfMeasure" NOT NULL DEFAULT 'UNITS',
    "minimum_stock" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "quantity_on_hand" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "purchase_cost_amount" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "purchase_cost_currency" TEXT NOT NULL DEFAULT 'USD',
    "selling_price_amount" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "selling_price_currency" TEXT NOT NULL DEFAULT 'USD',
    "status" "InventoryItemStatus" NOT NULL DEFAULT 'ACTIVE',
    "location_ref" JSONB,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "inventory_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_movements" (
    "id" TEXT NOT NULL,
    "inventory_item_id" TEXT NOT NULL,
    "movement_type" "StockMovementType" NOT NULL,
    "quantity_delta" DECIMAL(10,2) NOT NULL,
    "balance_after" DECIMAL(10,2) NOT NULL,
    "unit_cost_amount" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "unit_cost_currency" TEXT NOT NULL DEFAULT 'USD',
    "reason" TEXT NOT NULL,
    "recorded_by_user_id" TEXT NOT NULL,
    "reference_id" TEXT,
    "recorded_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stock_movements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fixed_assets" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT,
    "asset_tag" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "category" "AssetCategory" NOT NULL,
    "purchase_date" TIMESTAMP(3) NOT NULL,
    "purchase_value_amount" DECIMAL(10,2) NOT NULL,
    "purchase_value_currency" TEXT NOT NULL DEFAULT 'USD',
    "current_estimated_value_amount" DECIMAL(10,2) NOT NULL,
    "current_estimated_value_currency" TEXT NOT NULL DEFAULT 'USD',
    "condition" "AssetCondition" NOT NULL DEFAULT 'EXCELLENT',
    "status" "AssetStatus" NOT NULL DEFAULT 'ACTIVE',
    "location" JSONB NOT NULL,
    "notes" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "fixed_assets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "asset_history_events" (
    "id" TEXT NOT NULL,
    "asset_id" TEXT NOT NULL,
    "event_type" "AssetHistoryEventType" NOT NULL,
    "description" TEXT NOT NULL,
    "details" JSONB,
    "recorded_by_user_id" TEXT NOT NULL,
    "recorded_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "asset_history_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "asset_maintenance_records" (
    "id" TEXT NOT NULL,
    "asset_id" TEXT NOT NULL,
    "service_date" TIMESTAMP(3) NOT NULL,
    "description" TEXT NOT NULL,
    "cost_amount" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "cost_currency" TEXT NOT NULL DEFAULT 'USD',
    "performed_by" TEXT NOT NULL,
    "notes" TEXT,
    "recorded_by_user_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "asset_maintenance_records_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "inventory_items_sku_key" ON "inventory_items"("sku");

-- CreateIndex
CREATE INDEX "inventory_items_sku_idx" ON "inventory_items"("sku");

-- CreateIndex
CREATE INDEX "inventory_items_tenant_id_idx" ON "inventory_items"("tenant_id");

-- CreateIndex
CREATE INDEX "inventory_items_tenant_id_status_idx" ON "inventory_items"("tenant_id", "status");

-- CreateIndex
CREATE INDEX "inventory_items_status_idx" ON "inventory_items"("status");

-- CreateIndex
CREATE INDEX "inventory_items_category_idx" ON "inventory_items"("category");

-- CreateIndex
CREATE INDEX "inventory_items_quantity_on_hand_idx" ON "inventory_items"("quantity_on_hand");

-- CreateIndex
CREATE INDEX "stock_movements_inventory_item_id_recorded_at_idx" ON "stock_movements"("inventory_item_id", "recorded_at" DESC);

-- CreateIndex
CREATE INDEX "stock_movements_recorded_by_user_id_idx" ON "stock_movements"("recorded_by_user_id");

-- CreateIndex
CREATE INDEX "stock_movements_movement_type_idx" ON "stock_movements"("movement_type");

-- CreateIndex
CREATE INDEX "stock_movements_reference_id_idx" ON "stock_movements"("reference_id");

-- CreateIndex
CREATE UNIQUE INDEX "fixed_assets_asset_tag_key" ON "fixed_assets"("asset_tag");

-- CreateIndex
CREATE INDEX "fixed_assets_asset_tag_idx" ON "fixed_assets"("asset_tag");

-- CreateIndex
CREATE INDEX "fixed_assets_tenant_id_idx" ON "fixed_assets"("tenant_id");

-- CreateIndex
CREATE INDEX "fixed_assets_tenant_id_status_idx" ON "fixed_assets"("tenant_id", "status");

-- CreateIndex
CREATE INDEX "fixed_assets_status_idx" ON "fixed_assets"("status");

-- CreateIndex
CREATE INDEX "fixed_assets_category_idx" ON "fixed_assets"("category");

-- CreateIndex
CREATE INDEX "fixed_assets_condition_idx" ON "fixed_assets"("condition");

-- CreateIndex
CREATE INDEX "asset_history_events_asset_id_recorded_at_idx" ON "asset_history_events"("asset_id", "recorded_at" DESC);

-- CreateIndex
CREATE INDEX "asset_history_events_event_type_idx" ON "asset_history_events"("event_type");

-- CreateIndex
CREATE INDEX "asset_history_events_recorded_by_user_id_idx" ON "asset_history_events"("recorded_by_user_id");

-- CreateIndex
CREATE INDEX "asset_maintenance_records_asset_id_service_date_idx" ON "asset_maintenance_records"("asset_id", "service_date" DESC);

-- CreateIndex
CREATE INDEX "asset_maintenance_records_recorded_by_user_id_idx" ON "asset_maintenance_records"("recorded_by_user_id");

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_inventory_item_id_fkey" FOREIGN KEY ("inventory_item_id") REFERENCES "inventory_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asset_history_events" ADD CONSTRAINT "asset_history_events_asset_id_fkey" FOREIGN KEY ("asset_id") REFERENCES "fixed_assets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asset_maintenance_records" ADD CONSTRAINT "asset_maintenance_records_asset_id_fkey" FOREIGN KEY ("asset_id") REFERENCES "fixed_assets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddCheckConstraints (Domain Integrity Invariants)
ALTER TABLE "inventory_items" ADD CONSTRAINT "chk_inventory_items_non_negative_stock" CHECK ("quantity_on_hand" >= 0.00);
ALTER TABLE "inventory_items" ADD CONSTRAINT "chk_inventory_items_non_negative_min_stock" CHECK ("minimum_stock" >= 0.00);
ALTER TABLE "inventory_items" ADD CONSTRAINT "chk_inventory_items_non_negative_cost" CHECK ("purchase_cost_amount" >= 0.00);
ALTER TABLE "inventory_items" ADD CONSTRAINT "chk_inventory_items_non_negative_price" CHECK ("selling_price_amount" >= 0.00);

ALTER TABLE "fixed_assets" ADD CONSTRAINT "chk_fixed_assets_non_negative_purchase_val" CHECK ("purchase_value_amount" >= 0.00);
ALTER TABLE "fixed_assets" ADD CONSTRAINT "chk_fixed_assets_non_negative_est_val" CHECK ("current_estimated_value_amount" >= 0.00);

ALTER TABLE "asset_maintenance_records" ADD CONSTRAINT "chk_asset_maintenance_non_negative_cost" CHECK ("cost_amount" >= 0.00);
