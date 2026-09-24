-- CreateTable
CREATE TABLE "receipt_sequences" (
    "tenant_id" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "current_value" INTEGER NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "receipt_sequences_pkey" PRIMARY KEY ("tenant_id", "year")
);

-- CreateEnum
CREATE TYPE "ReceiptStatus" AS ENUM ('ISSUED', 'REPRINTED');

-- CreateTable
CREATE TABLE "receipts" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "sale_id" TEXT NOT NULL,
    "receipt_number" VARCHAR(50) NOT NULL,
    "sale_reference" VARCHAR(100) NOT NULL,
    "issued_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "client_snapshot" JSONB,
    "items_snapshot" JSONB NOT NULL,
    "payments_snapshot" JSONB NOT NULL,
    "subtotal_amount" DECIMAL(12,2) NOT NULL,
    "discount_total_amount" DECIMAL(12,2) NOT NULL,
    "total_amount" DECIMAL(12,2) NOT NULL,
    "currency" VARCHAR(3) NOT NULL DEFAULT 'USD',
    "status" "ReceiptStatus" NOT NULL DEFAULT 'ISSUED',
    "reprint_count" INTEGER NOT NULL DEFAULT 0,
    "last_reprinted_at" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "receipts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "receipts_tenant_id_sale_id_key" ON "receipts"("tenant_id", "sale_id");

-- CreateIndex
CREATE UNIQUE INDEX "receipts_tenant_id_receipt_number_key" ON "receipts"("tenant_id", "receipt_number");

-- CreateIndex
CREATE INDEX "receipts_tenant_id_idx" ON "receipts"("tenant_id");

-- CreateIndex
CREATE INDEX "receipts_sale_id_idx" ON "receipts"("sale_id");

-- CreateIndex
CREATE INDEX "receipts_issued_at_idx" ON "receipts"("issued_at" DESC);

-- AddForeignKey
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_sale_id_fkey" FOREIGN KEY ("sale_id") REFERENCES "sales"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
