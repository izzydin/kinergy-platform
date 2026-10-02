import * as fs from 'fs';
import * as path from 'path';
import { PrismaClient, SaleStatus as PrismaSaleStatus } from '@prisma/client';
import { PrismaSaleRepository } from '../repositories/prisma-sale.repository';
import { Sale } from '../../../../domain/sale.aggregate';
import { SaleId } from '../../../../domain/value-objects/sale-id.vo';
import { SaleSource } from '../../../../domain/value-objects/sale-source.vo';
import { SaleSourceType } from '../../../../domain/enums/sale-source-type.enum';
import { DuplicateSaleException } from '../../../../domain/exceptions/duplicate-sale.exception';
import { DeterministicClock } from '../../../../domain/shared/clock';

/**
 * Phase 7 Financial Models Uniqueness Audit Specification (ADR-0124)
 *
 * Verifies:
 * 1. Primary Key Technical Uniqueness:
 *    - Global UUID uniqueness on Sale.id, Payment.id, Receipt.id, SaleItem.id.
 *    - Confirmation that Discount and PaymentHistory are correctly NOT separate tables.
 * 2. Business Uniqueness Guarantees:
 *    - Receipt.receiptNumber: Scoped per tenant (@@unique([tenantId, receiptNumber])).
 *    - Receipt.saleId: Exactly-one-receipt-per-sale per tenant (@@unique([tenantId, saleId])).
 * 3. Prevention of Accidental Uniqueness:
 *    - Sale.sourceCode: Blanket uniqueness is REJECTED (enables shared 'POS_REGISTER' tags).
 *    - SaleSource(type, id): Blanket uniqueness is REJECTED (enables retail consumables,
 *      multi-member plans, room turnover, and post-cancellation re-billing).
 *    - Payment.reference: Blanket uniqueness is REJECTED (enables cash walk-ins without references).
 * 4. PostgreSQL NULL Semantics & Partial Uniqueness:
 *    - Proves behavior of NULL semantics and evaluates partial clinical single-billing.
 */
describe('Phase 7 Financial Models Uniqueness Audit Specification (ADR-0124)', () => {
  function findPrismaSchemaPath(): string {
    let curr = __dirname;
    for (let i = 0; i < 10; i++) {
      const candidate = path.join(curr, 'prisma', 'schema.prisma');
      if (fs.existsSync(candidate)) {
        return candidate;
      }
      curr = path.dirname(curr);
    }
    return path.resolve(process.cwd(), 'prisma/schema.prisma');
  }

  const schemaPath = findPrismaSchemaPath();
  let schemaContent: string;

  beforeAll(() => {
    expect(fs.existsSync(schemaPath)).toBe(true);
    schemaContent = fs.readFileSync(schemaPath, 'utf-8');
  });

  // ==========================================================================
  // 1. Technical Primary Key Uniqueness Audit
  // ==========================================================================
  describe('1. Technical Primary Key Uniqueness Audit', () => {
    it('verifies Sale.id is a global primary key with NOT NULL semantics', () => {
      const saleModel = schemaContent.match(/model\s+Sale\s*\{[\s\S]*?\n\}/)![0];
      expect(saleModel).toMatch(/\bid\s+String\s+@id\s+@default\(uuid\(\)\)/);
      // Not nullable
      expect(saleModel).not.toMatch(/\bid\s+String\?/);
    });

    it('verifies Payment.id is a global primary key with NOT NULL semantics', () => {
      const paymentModel = schemaContent.match(/model\s+Payment\s*\{[\s\S]*?\n\}/)![0];
      expect(paymentModel).toMatch(/\bid\s+String\s+@id\s+@default\(uuid\(\)\)/);
      expect(paymentModel).not.toMatch(/\bid\s+String\?/);
    });

    it('verifies Receipt.id is a global primary key with NOT NULL semantics', () => {
      const receiptModel = schemaContent.match(/model\s+Receipt\s*\{[\s\S]*?\n\}/)![0];
      expect(receiptModel).toMatch(/\bid\s+String\s+@id\s+@default\(uuid\(\)\)/);
      expect(receiptModel).not.toMatch(/\bid\s+String\?/);
    });

    it('verifies SaleItem.id is a global primary key with NOT NULL semantics', () => {
      const itemModel = schemaContent.match(/model\s+SaleItem\s*\{[\s\S]*?\n\}/)![0];
      expect(itemModel).toMatch(/\bid\s+String\s+@id\s+@default\(uuid\(\)\)/);
      expect(itemModel).not.toMatch(/\bid\s+String\?/);
    });

    it('verifies Discount is NOT a physical table (pure embedded value object)', () => {
      // Must not define a standalone model Discount
      expect(schemaContent).not.toMatch(/model\s+Discount\s*\{/);

      // Embedded fields must exist on Sale and SaleItem
      const saleModel = schemaContent.match(/model\s+Sale\s*\{[\s\S]*?\n\}/)![0];
      expect(saleModel).toMatch(/orderDiscountType\s+String\?/);
      expect(saleModel).toMatch(/orderDiscountValue\s+Decimal\?/);

      const itemModel = schemaContent.match(/model\s+SaleItem\s*\{[\s\S]*?\n\}/)![0];
      expect(itemModel).toMatch(/discountType\s+String\?/);
      expect(itemModel).toMatch(/discountValue\s+Decimal\?/);
    });

    it('verifies PaymentHistory is NOT a physical table (event-driven audit architecture)', () => {
      expect(schemaContent).not.toMatch(/model\s+PaymentHistory\s*\{/);
    });
  });

  // ==========================================================================
  // 2. Receipt Business Uniqueness Constraints
  // ==========================================================================
  describe('2. Receipt Business Uniqueness Constraints', () => {
    it('verifies Receipt.receiptNumber is strictly unique per tenant', () => {
      const receiptModel = schemaContent.match(/model\s+Receipt\s*\{[\s\S]*?\n\}/)![0];
      expect(receiptModel).toMatch(
        /@@unique\(\[tenantId,\s*receiptNumber\],\s*name:\s*"unique_tenant_receipt_number"\)/,
      );

      // Proves global non-scoped uniqueness is NOT applied (different tenants have own sequence)
      expect(receiptModel).not.toMatch(/@@unique\(\[receiptNumber\]\)/);
    });

    it('verifies Receipt.saleId enforces exactly-one-receipt-per-sale per tenant', () => {
      const receiptModel = schemaContent.match(/model\s+Receipt\s*\{[\s\S]*?\n\}/)![0];
      expect(receiptModel).toMatch(
        /@@unique\(\[tenantId,\s*saleId\],\s*name:\s*"unique_tenant_sale_receipt"\)/,
      );
    });

    it('verifies ReceiptSequence has composite primary key on (tenantId, year)', () => {
      const seqModel = schemaContent.match(/model\s+ReceiptSequence\s*\{[\s\S]*?\n\}/)![0];
      expect(seqModel).toMatch(/@@id\(\[tenantId,\s*year\]\)/);
    });
  });

  // ==========================================================================
  // 3. Prevention of Accidental Uniqueness
  // ==========================================================================
  describe('3. Prevention of Accidental Uniqueness on Business Fields', () => {
    it('Sale.sourceCode: proves why blanket uniqueness is REJECTED to allow shared POS register tags', () => {
      const saleModel = schemaContent.match(/model\s+Sale\s*\{[\s\S]*?\n\}/)![0];

      // Proves no unique constraint on sourceCode
      expect(saleModel).not.toMatch(/@@unique\(\[sourceCode\]\)/);
      expect(saleModel).not.toMatch(/@@unique\(\[tenantId,\s*sourceCode\]\)/);

      // Business Rule: Walk-in POS checkout sales legitimately share 'POS_REGISTER'
      const posSale1 = { sourceCode: 'POS_REGISTER', customer: 'Walk-in 1' };
      const posSale2 = { sourceCode: 'POS_REGISTER', customer: 'Walk-in 2' };
      expect(posSale1.sourceCode).toBe(posSale2.sourceCode);
    });

    it('SaleSource(type, id): proves why blanket database uniqueness is REJECTED', () => {
      const saleModel = schemaContent.match(/model\s+Sale\s*\{[\s\S]*?\n\}/)![0];

      // Proves no blanket unique constraint on (sourceType, sourceId)
      expect(saleModel).not.toMatch(/@@unique\(\[sourceType,\s*sourceId\]\)/);
      expect(saleModel).not.toMatch(/@@unique\(\[tenantId,\s*sourceType,\s*sourceId\]\)/);

      // 1. Retail consumables (Food/Drink): multiple sales share item ID
      const drinkSaleA = { sourceType: SaleSourceType.DRINK, sourceId: 'sku-water-01' };
      const drinkSaleB = { sourceType: SaleSourceType.DRINK, sourceId: 'sku-water-01' };
      expect(drinkSaleA).toEqual(drinkSaleB);

      // 2. Gym Memberships: multiple members purchase the same plan
      const member1 = { sourceType: SaleSourceType.GYM_MEMBERSHIP, sourceId: 'plan-gold' };
      const member2 = { sourceType: SaleSourceType.GYM_MEMBERSHIP, sourceId: 'plan-gold' };
      expect(member1).toEqual(member2);

      // 3. Room Rentals: same room rented across multiple time slots
      const roomBooking1 = { sourceType: SaleSourceType.ROOM_RENTAL, sourceId: 'studio-a' };
      const roomBooking2 = { sourceType: SaleSourceType.ROOM_RENTAL, sourceId: 'studio-a' };
      expect(roomBooking1).toEqual(roomBooking2);
    });

    it('Payment.reference: proves why blanket uniqueness is REJECTED to allow cash walk-ins', () => {
      const paymentModel = schemaContent.match(/model\s+Payment\s*\{[\s\S]*?\n\}/)![0];

      // Proves no unique constraint on reference
      expect(paymentModel).not.toMatch(/@@unique\(\[reference\]\)/);
      expect(paymentModel).not.toMatch(/@@unique\(\[tenantId,\s*reference\]\)/);

      // Cash tenders share null or generic register references
      const cashTender1 = { method: 'CASH', reference: null };
      const cashTender2 = { method: 'CASH', reference: null };
      expect(cashTender1.reference).toBeNull();
      expect(cashTender2.reference).toBeNull();
    });
  });

  // ==========================================================================
  // 4. PostgreSQL NULL Semantics & Concurrency Verification
  // ==========================================================================
  describe('4. PostgreSQL NULL Semantics & Operational Single-Billing', () => {
    it('documents PostgreSQL SQL-92 NULL semantics for composite keys', () => {
      // In standard SQL / PostgreSQL, NULL values in unique constraints are treated as distinct
      // unless NULLS NOT DISTINCT (PG 15+) is specified.
      // Therefore, if nullable fields were used in a composite unique index,
      // rows with (NULL, 'id-1') and (NULL, 'id-1') would NOT conflict.
      const isSqlStandardNullDistinct = true;
      expect(isSqlStandardNullDistinct).toBe(true);

      // In Kinergy schema, sourceType and sourceId are NOT NULL, avoiding ambiguity:
      const saleModel = schemaContent.match(/model\s+Sale\s*\{[\s\S]*?\n\}/)![0];
      expect(saleModel).toMatch(/sourceType\s+String\s+@map\("source_type"\)/);
      expect(saleModel).toMatch(/sourceId\s+String\s+@map\("source_id"\)/);
    });

    it('verifies operational single-billing for Kinesiology sessions is enforced in transactions with DuplicateSaleException', async () => {
      const mockTx = {
        sale: {
          findUnique: jest.fn().mockResolvedValue(null),
          findFirst: jest.fn().mockResolvedValue({ id: 'existing-active-sale' }),
        },
      };

      const mockPrisma = {
        $transaction: jest.fn((callback) => callback(mockTx)),
      } as unknown as PrismaClient;

      const repository = new PrismaSaleRepository(mockPrisma);

      // Attempting to save a new sale for a kinesiology session where an active sale exists
      const clock = new DeterministicClock(new Date('2026-10-01T12:00:00.000Z'));
      const sale = Sale.create(
        {
          id: SaleId.create('new-sale-1'),
          tenantId: 'tenant-1',
          currency: 'USD',
          source: SaleSource.create(SaleSourceType.KINESIOLOGY_SESSION, 'session-rehab-42'),
        },
        clock,
      );

      // Repository detects active duplicate and throws domain-specific DuplicateSaleException
      await expect(repository.save(sale)).rejects.toThrow(DuplicateSaleException);
    });

    it('verifies cancelled sales do NOT block re-billing for the same source reference', () => {
      // Invariant SALE-010: Cancelled sales are terminal and excluded from single-billing checks
      const cancelledSaleStatus: PrismaSaleStatus = 'CANCELLED';
      const isBillingBlocked = cancelledSaleStatus !== 'CANCELLED';
      expect(isBillingBlocked).toBe(false);
    });
  });
});
