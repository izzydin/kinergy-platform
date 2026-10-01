-- Phase 7: Monetary Persistence Hardening - Check Constraints
-- Enforce non-negative and positive monetary values at the PostgreSQL relational engine layer (ADR-0108 / ADR-0114 / ADR-0122)

-- 1. Sales Table Monetary Constraints
ALTER TABLE "sales" ADD CONSTRAINT "chk_sales_non_negative_subtotal" CHECK ("subtotal_amount" >= 0.00);
ALTER TABLE "sales" ADD CONSTRAINT "chk_sales_non_negative_discount_total" CHECK ("discount_total_amount" >= 0.00);
ALTER TABLE "sales" ADD CONSTRAINT "chk_sales_non_negative_total" CHECK ("total_amount" >= 0.00);
ALTER TABLE "sales" ADD CONSTRAINT "chk_sales_non_negative_order_discount_val" CHECK ("order_discount_value" IS NULL OR "order_discount_value" >= 0.00);

-- 2. Sale Items Table Monetary Constraints
ALTER TABLE "sale_items" ADD CONSTRAINT "chk_sale_items_non_negative_unit_price" CHECK ("unit_price_amount" >= 0.00);
ALTER TABLE "sale_items" ADD CONSTRAINT "chk_sale_items_non_negative_subtotal" CHECK ("subtotal_amount" >= 0.00);
ALTER TABLE "sale_items" ADD CONSTRAINT "chk_sale_items_non_negative_discount_total" CHECK ("discount_total_amount" >= 0.00);
ALTER TABLE "sale_items" ADD CONSTRAINT "chk_sale_items_non_negative_total" CHECK ("total_amount" >= 0.00);
ALTER TABLE "sale_items" ADD CONSTRAINT "chk_sale_items_non_negative_discount_val" CHECK ("discount_value" IS NULL OR "discount_value" >= 0.00);
ALTER TABLE "sale_items" ADD CONSTRAINT "chk_sale_items_positive_quantity" CHECK ("quantity" > 0.000);

-- 3. Payments Table Monetary Constraints
ALTER TABLE "payments" ADD CONSTRAINT "chk_payments_positive_amount" CHECK ("amount" > 0.00);

-- 4. Receipts Table Monetary Constraints
ALTER TABLE "receipts" ADD CONSTRAINT "chk_receipts_non_negative_subtotal" CHECK ("subtotal_amount" >= 0.00);
ALTER TABLE "receipts" ADD CONSTRAINT "chk_receipts_non_negative_discount_total" CHECK ("discount_total_amount" >= 0.00);
ALTER TABLE "receipts" ADD CONSTRAINT "chk_receipts_non_negative_total" CHECK ("total_amount" >= 0.00);
