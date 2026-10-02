-- DropIndex
DROP INDEX IF EXISTS "sales_client_id_idx";

-- DropIndex
DROP INDEX IF EXISTS "sales_status_idx";

-- DropIndex
DROP INDEX IF EXISTS "payments_sale_id_idx";

-- DropIndex
DROP INDEX IF EXISTS "payments_status_idx";

-- CreateIndex: Sale by client ordered by createdAt (subsumes clientId filter while eliminating in-memory Sort)
CREATE INDEX "sales_client_id_created_at_idx" ON "sales"("client_id", "created_at" DESC);

-- CreateIndex: Sale by status ordered by createdAt (optimizes cashier active order queue and pending payments)
CREATE INDEX "sales_status_created_at_idx" ON "sales"("status", "created_at" DESC);

-- CreateIndex: Payment history for a Sale (enforces foreign key check and satisfies findBySaleId ORDER BY createdAt ASC)
CREATE INDEX "payments_sale_id_created_at_idx" ON "payments"("sale_id", "created_at");

-- CreateIndex: Payment records by status ordered by createdAt (supports audit and exception queues)
CREATE INDEX "payments_status_created_at_idx" ON "payments"("status", "created_at" DESC);
