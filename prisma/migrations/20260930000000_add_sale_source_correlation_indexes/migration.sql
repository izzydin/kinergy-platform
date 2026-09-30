-- CreateIndex
CREATE INDEX "sales_tenant_id_source_type_source_id_idx" ON "sales"("tenant_id", "source_type", "source_id");

-- CreateIndex
CREATE INDEX "sales_source_type_source_id_idx" ON "sales"("source_type", "source_id");

-- CreateIndex
CREATE INDEX "sale_items_source_type_source_id_idx" ON "sale_items"("source_type", "source_id");
