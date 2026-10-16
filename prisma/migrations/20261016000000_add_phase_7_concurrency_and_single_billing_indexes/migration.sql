-- Phase 7: Financial Concurrency & Settlement Integrity (ADR-0140)
-- 1. Enforce partial uniqueness for clinical treatment session sales (single-billing invariant)
-- Prevents race conditions from creating duplicate active sales for the same treatment session in Read Committed isolation.
-- Ignores CANCELLED sales to allow legitimate re-billing, and excludes repeat retail consumable / membership sales.
CREATE UNIQUE INDEX IF NOT EXISTS "uq_sales_clinical_session_active"
  ON "sales"("tenant_id", "source_id")
  WHERE "source_type" IN ('TREATMENT_SESSION', 'KINESIOLOGY_SESSION')
    AND "status" != 'CANCELLED';

-- 2. Enforce partial uniqueness for external order references
-- Prevents duplicate sale creation for external orders with non-generic reference codes.
CREATE UNIQUE INDEX IF NOT EXISTS "uq_sales_source_code_active"
  ON "sales"("tenant_id", "source_code")
  WHERE "source_code" IS NOT NULL
    AND "source_code" NOT IN ('POS_REGISTER', 'pos_checkout_terminal')
    AND "status" != 'CANCELLED';

-- 3. Enforce tender reference uniqueness per sale for non-cash tenders
-- Prevents duplicate card/QR authorizations on the same sale while allowing unreferenced cash splits.
CREATE UNIQUE INDEX IF NOT EXISTS "uq_payments_sale_reference"
  ON "payments"("sale_id", "reference")
  WHERE "reference" IS NOT NULL;
