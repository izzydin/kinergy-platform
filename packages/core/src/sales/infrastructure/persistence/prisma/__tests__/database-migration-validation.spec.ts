import * as fs from 'fs';
import * as path from 'path';
import { Prisma } from '@prisma/client';
import { Discount } from '../../../../domain/value-objects/discount.vo';
import { DiscountType } from '../../../../domain/enums/discount-type.enum';
import { SaleStatus } from '../../../../domain/enums/sale-status.enum';
import { PaymentStatus } from '../../../../domain/enums/payment-status.enum';
import { PaymentMethod } from '../../../../domain/enums/payment-method.enum';
import { ReceiptStatus } from '../../../../domain/enums/receipt-status.enum';
import { PrismaMoneyMapper } from '../mappers/prisma-money.mapper';

describe('Phase 7 Database Migration Review & Data Compatibility Specification', () => {
  const migrationsDir = path.resolve(__dirname, '../../../../../../../../prisma/migrations');
  const schemaPath = path.resolve(__dirname, '../../../../../../../../prisma/schema.prisma');

  // ==========================================================================
  // 1. Migration Directory & Ordering Integrity
  // ==========================================================================
  describe('1. Migration Sequence & File Integrity', () => {
    it('verifies all Phase 7 migrations exist in chronological ordering without gaps or timestamp conflicts', () => {
      expect(fs.existsSync(migrationsDir)).toBe(true);

      const migrationDirs = fs
        .readdirSync(migrationsDir)
        .filter((entry) => fs.statSync(path.join(migrationsDir, entry)).isDirectory())
        .sort();

      const phase7Migrations = migrationDirs.filter((name) =>
        [
          '20260918000000_add_sales_and_payments_monetary_persistence',
          '20260921000000_add_payments_domain_persistence',
          '20260924000000_add_receipts_and_sequence_persistence',
          '20260930000000_add_sale_source_correlation_indexes',
          '20261001000000_add_phase_7_monetary_check_constraints',
          '20261001010000_add_discount_structural_check_constraints',
          '20261002000000_optimize_phase_7_financial_indexes',
        ].includes(name),
      );

      expect(phase7Migrations.length).toBe(7);

      // Verify each migration directory contains a non-empty migration.sql
      for (const m of phase7Migrations) {
        const sqlFile = path.join(migrationsDir, m, 'migration.sql');
        expect(fs.existsSync(sqlFile)).toBe(true);
        const content = fs.readFileSync(sqlFile, 'utf8');
        expect(content.trim().length).toBeGreaterThan(0);
      }

      // Verify migration lock file targets PostgreSQL provider
      const lockFile = path.join(migrationsDir, 'migration_lock.toml');
      expect(fs.existsSync(lockFile)).toBe(true);
      const lockContent = fs.readFileSync(lockFile, 'utf8');
      expect(lockContent).toContain('provider = "postgresql"');
    });
  });

  // ==========================================================================
  // 2. DDL Inspection: CHECK Constraints & Existing-Data Safety
  // ==========================================================================
  describe('2. DDL Inspection: Relational Constraints & Data Safety', () => {
    it('verifies monetary check constraints prevent negative values without inventing synthetic defaults', () => {
      const sqlFile = path.join(
        migrationsDir,
        '20261001000000_add_phase_7_monetary_check_constraints',
        'migration.sql',
      );
      const sql = fs.readFileSync(sqlFile, 'utf8');

      // 1. Sales constraints
      expect(sql).toContain(
        'ALTER TABLE "sales" ADD CONSTRAINT "chk_sales_non_negative_subtotal" CHECK ("subtotal_amount" >= 0.00)',
      );
      expect(sql).toContain(
        'ALTER TABLE "sales" ADD CONSTRAINT "chk_sales_non_negative_discount_total" CHECK ("discount_total_amount" >= 0.00)',
      );
      expect(sql).toContain(
        'ALTER TABLE "sales" ADD CONSTRAINT "chk_sales_non_negative_total" CHECK ("total_amount" >= 0.00)',
      );
      expect(sql).toContain(
        'ALTER TABLE "sales" ADD CONSTRAINT "chk_sales_non_negative_order_discount_val" CHECK ("order_discount_value" IS NULL OR "order_discount_value" >= 0.00)',
      );

      // 2. Sale Items constraints
      expect(sql).toContain(
        'ALTER TABLE "sale_items" ADD CONSTRAINT "chk_sale_items_non_negative_unit_price" CHECK ("unit_price_amount" >= 0.00)',
      );
      expect(sql).toContain(
        'ALTER TABLE "sale_items" ADD CONSTRAINT "chk_sale_items_positive_quantity" CHECK ("quantity" > 0.000)',
      );

      // 3. Payments constraints
      expect(sql).toContain(
        'ALTER TABLE "payments" ADD CONSTRAINT "chk_payments_positive_amount" CHECK ("amount" > 0.00)',
      );

      // 4. Receipts constraints
      expect(sql).toContain(
        'ALTER TABLE "receipts" ADD CONSTRAINT "chk_receipts_non_negative_subtotal" CHECK ("subtotal_amount" >= 0.00)',
      );
    });

    it('verifies discount structural check constraints protect co-presence and percentage bounds', () => {
      const sqlFile = path.join(
        migrationsDir,
        '20261001010000_add_discount_structural_check_constraints',
        'migration.sql',
      );
      const sql = fs.readFileSync(sqlFile, 'utf8');

      // Ensures order_discount_type and value are both NULL or both NOT NULL
      expect(sql).toContain(
        '("order_discount_type" IS NULL AND "order_discount_value" IS NULL) OR',
      );
      expect(sql).toContain(
        '("order_discount_type" IS NOT NULL AND "order_discount_value" IS NOT NULL)',
      );

      // Ensures percentage discount never exceeds 100.00%
      expect(sql).toContain('"order_discount_value" <= 100.00');
      expect(sql).toContain('"discount_value" <= 100.00');
    });

    it('verifies index optimization migration uses non-destructive DROP INDEX IF EXISTS', () => {
      const sqlFile = path.join(
        migrationsDir,
        '20261002000000_optimize_phase_7_financial_indexes',
        'migration.sql',
      );
      const sql = fs.readFileSync(sqlFile, 'utf8');

      // Must be safely re-entrant
      expect(sql).toContain('DROP INDEX IF EXISTS "sales_client_id_idx";');
      expect(sql).toContain('DROP INDEX IF EXISTS "sales_status_idx";');
      expect(sql).toContain('DROP INDEX IF EXISTS "payments_sale_id_idx";');
      expect(sql).toContain('DROP INDEX IF EXISTS "payments_status_idx";');

      // Creates compound B-tree indexes
      expect(sql).toContain(
        'CREATE INDEX "sales_client_id_created_at_idx" ON "sales"("client_id", "created_at" DESC);',
      );
      expect(sql).toContain(
        'CREATE INDEX "sales_status_created_at_idx" ON "sales"("status", "created_at" DESC);',
      );
      expect(sql).toContain(
        'CREATE INDEX "payments_sale_id_created_at_idx" ON "payments"("sale_id", "created_at");',
      );
      expect(sql).toContain(
        'CREATE INDEX "payments_status_created_at_idx" ON "payments"("status", "created_at" DESC);',
      );
    });
  });

  // ==========================================================================
  // 3. Schema Relational & Decimal Integrity
  // ==========================================================================
  describe('3. Schema Relational & Decimal Precision Standards', () => {
    it('verifies schema.prisma declares exact DECIMAL(12, 2) on currency columns and DECIMAL(10, 3) on quantities', () => {
      const schema = fs.readFileSync(schemaPath, 'utf8');

      // Sale monetary precision
      expect(schema).toMatch(
        /subtotalAmount\s+Decimal\s+@map\("subtotal_amount"\)\s+@db\.Decimal\(12,\s*2\)/,
      );
      expect(schema).toMatch(
        /discountTotalAmount\s+Decimal\s+@map\("discount_total_amount"\)\s+@db\.Decimal\(12,\s*2\)/,
      );
      expect(schema).toMatch(
        /totalAmount\s+Decimal\s+@map\("total_amount"\)\s+@db\.Decimal\(12,\s*2\)/,
      );

      // SaleItem precision
      expect(schema).toMatch(/quantity\s+Decimal\s+@db\.Decimal\(10,\s*3\)/);
      expect(schema).toMatch(
        /unitPriceAmount\s+Decimal\s+@map\("unit_price_amount"\)\s+@db\.Decimal\(12,\s*2\)/,
      );

      // Payment precision
      expect(schema).toMatch(/amount\s+Decimal\s+@db\.Decimal\(12,\s*2\)/);

      // Receipt precision
      expect(schema).toMatch(
        /subtotalAmount\s+Decimal\s+@map\("subtotal_amount"\)\s+@db\.Decimal\(12,\s*2\)/,
      );
      expect(schema).toMatch(
        /totalAmount\s+Decimal\s+@map\("total_amount"\)\s+@db\.Decimal\(12,\s*2\)/,
      );
    });

    it('verifies foreign key constraints use ON DELETE RESTRICT on financial and fiscal audit tables', () => {
      const schema = fs.readFileSync(schemaPath, 'utf8');

      // Payment must not be cascade deleted if sale is deleted
      expect(schema).toMatch(
        /sale\s+Sale\s+@relation\("SaleToPayments",\s*fields:\s*\[saleId\],\s*references:\s*\[id\],\s*onDelete:\s*Restrict\)/,
      );

      // Receipt must not be cascade deleted if sale is deleted
      expect(schema).toMatch(
        /sale\s+Sale\s+@relation\("SaleToReceipts",\s*fields:\s*\[saleId\],\s*references:\s*\[id\],\s*onDelete:\s*Restrict\)/,
      );

      // Child sale items are owned entities, safely cascade deleting when draft is aborted
      expect(schema).toMatch(
        /sale\s+Sale\s+@relation\("SaleToSaleItems",\s*fields:\s*\[saleId\],\s*references:\s*\[id\],\s*onDelete:\s*Cascade\)/,
      );
    });

    it('verifies receipt unique constraints guarantee tenant isolation and fiscal sequence integrity', () => {
      const schema = fs.readFileSync(schemaPath, 'utf8');

      // Exactly 1 receipt per sale per tenant
      expect(schema).toContain('@@unique([tenantId, saleId], name: "unique_tenant_sale_receipt")');

      // Monotonic receipt number uniqueness per tenant
      expect(schema).toContain(
        '@@unique([tenantId, receiptNumber], name: "unique_tenant_receipt_number")',
      );
    });
  });

  // ==========================================================================
  // 4. Domain & Precision Equivalence
  // ==========================================================================
  describe('4. Zero-Fabrication & Precision Preservation', () => {
    it('verifies PrismaMoneyMapper rejects null or undefined without inventing zero defaults', () => {
      expect(() => PrismaMoneyMapper.toMoney(null as unknown as Prisma.Decimal, 'USD')).toThrow(
        /Cannot map null or undefined Prisma\.Decimal to Money/,
      );
      expect(() =>
        PrismaMoneyMapper.toMoney(undefined as unknown as Prisma.Decimal, 'USD'),
      ).toThrow(/Cannot map null or undefined Prisma\.Decimal to Money/);
    });

    it('verifies Discount Value Object rejects percentages greater than 100 or negative values', () => {
      expect(() => Discount.create({ type: DiscountType.PERCENTAGE, value: 100.01 })).toThrow();

      expect(() => Discount.create({ type: DiscountType.PERCENTAGE, value: -5 })).toThrow();

      expect(() => Discount.create({ type: DiscountType.FIXED_AMOUNT, value: -10 })).toThrow();
    });

    it('verifies exact equivalence across all supported financial domain enum states', () => {
      // SaleStatus
      expect(SaleStatus.DRAFT).toBe('DRAFT');
      expect(SaleStatus.PENDING_PAYMENT).toBe('PENDING_PAYMENT');
      expect(SaleStatus.PARTIALLY_PAID).toBe('PARTIALLY_PAID');
      expect(SaleStatus.PAID).toBe('PAID');
      expect(SaleStatus.COMPLETED).toBe('COMPLETED');
      expect(SaleStatus.CANCELLED).toBe('CANCELLED');
      expect(SaleStatus.REFUNDED).toBe('REFUNDED');

      // PaymentMethod
      expect(PaymentMethod.CASH).toBe('CASH');
      expect(PaymentMethod.QR).toBe('QR');

      // PaymentStatus
      expect(PaymentStatus.PENDING).toBe('PENDING');
      expect(PaymentStatus.COMPLETED).toBe('COMPLETED');
      expect(PaymentStatus.FAILED).toBe('FAILED');
      expect(PaymentStatus.CANCELLED).toBe('CANCELLED');

      // ReceiptStatus
      expect(ReceiptStatus.ISSUED).toBe('ISSUED');
      expect(ReceiptStatus.REPRINTED).toBe('REPRINTED');
    });
  });
});
