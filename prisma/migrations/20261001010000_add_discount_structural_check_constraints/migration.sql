-- Phase 7.3: Discount Structural Constraints
-- Enforce structural integrity of embedded Discount Value Objects on sales and sale_items tables (ADR-0122)

-- 1. Sales Table Embedded Order Discount Constraints
ALTER TABLE "sales"
  ADD CONSTRAINT "chk_sales_discount_type_supported"
    CHECK ("order_discount_type" IS NULL OR "order_discount_type" IN ('PERCENTAGE', 'FIXED', 'FIXED_AMOUNT')),
  ADD CONSTRAINT "chk_sales_discount_percentage_max"
    CHECK ("order_discount_type" IS NULL OR "order_discount_type" != 'PERCENTAGE' OR "order_discount_value" <= 100.00),
  ADD CONSTRAINT "chk_sales_discount_co_presence"
    CHECK (
      ("order_discount_type" IS NULL AND "order_discount_value" IS NULL) OR
      ("order_discount_type" IS NOT NULL AND "order_discount_value" IS NOT NULL)
    );

-- 2. Sale Items Table Embedded Line Discount Constraints
ALTER TABLE "sale_items"
  ADD CONSTRAINT "chk_sale_items_discount_type_supported"
    CHECK ("discount_type" IS NULL OR "discount_type" IN ('PERCENTAGE', 'FIXED', 'FIXED_AMOUNT')),
  ADD CONSTRAINT "chk_sale_items_discount_percentage_max"
    CHECK ("discount_type" IS NULL OR "discount_type" != 'PERCENTAGE' OR "discount_value" <= 100.00),
  ADD CONSTRAINT "chk_sale_items_discount_co_presence"
    CHECK (
      ("discount_type" IS NULL AND "discount_value" IS NULL) OR
      ("discount_type" IS NOT NULL AND "discount_value" IS NOT NULL)
    );
