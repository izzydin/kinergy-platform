import {
  Prisma,
  Sale as PrismaSaleModel,
  SaleItem as PrismaSaleItemModel,
  Payment as PrismaPaymentModel,
  Receipt as PrismaReceiptModel,
  PaymentStatus as PrismaPaymentStatus,
  SaleStatus as PrismaSaleStatus,
  ReceiptStatus as PrismaReceiptStatus,
} from '@prisma/client';
import { Sale } from '../../../../domain/sale.aggregate';
import { SaleItem } from '../../../../domain/entities/sale-item.entity';
import { SaleId } from '../../../../domain/value-objects/sale-id.vo';
import { SaleItemId } from '../../../../domain/value-objects/sale-item-id.vo';
import { Money } from '../../../../domain/value-objects/money.vo';
import { Discount } from '../../../../domain/value-objects/discount.vo';
import { DiscountType } from '../../../../domain/enums/discount-type.enum';
import { SourceReference } from '../../../../domain/value-objects/source-reference.vo';
import { SaleSource } from '../../../../domain/value-objects/sale-source.vo';
import { SourceType } from '../../../../domain/enums/source-type.enum';
import { SaleSourceType } from '../../../../domain/enums/sale-source-type.enum';
import { SaleStatus } from '../../../../domain/enums/sale-status.enum';
import { InvalidSaleStateException } from '../../../../domain/exceptions/invalid-sale-state.exception';
import { Payment } from '../../../../domain/payment.aggregate';
import { PaymentId } from '../../../../domain/value-objects/payment-id.vo';
import { PaymentStatus } from '../../../../domain/enums/payment-status.enum';
import { PaymentMethod } from '../../../../domain/enums/payment-method.enum';
import { Receipt } from '../../../../domain/receipt.aggregate';
import { ReceiptId } from '../../../../domain/value-objects/receipt-id.vo';
import { ReceiptNumber } from '../../../../domain/value-objects/receipt-number.vo';
import { ReceiptClientSnapshot } from '../../../../domain/value-objects/receipt-client-snapshot.vo';
import { ReceiptItemSnapshot } from '../../../../domain/value-objects/receipt-item-snapshot.vo';
import { ReceiptPaymentSnapshot } from '../../../../domain/value-objects/receipt-payment-snapshot.vo';
import { ReceiptStatus } from '../../../../domain/enums/receipt-status.enum';
import { PrismaMoneyMapper } from '../mappers/prisma-money.mapper';
import { PrismaPaymentMapper } from '../mappers/prisma-payment.mapper';
import { PrismaSaleMapper, PrismaSaleWithItems } from '../mappers/prisma-sale.mapper';
import { PrismaSaleItemMapper } from '../mappers/prisma-sale-item.mapper';
import { PrismaReceiptMapper } from '../mappers/prisma-receipt.mapper';
import { Clock, DeterministicClock } from '../../../../domain/shared/clock';

/**
 * Emulates the PostgreSQL persistence layer serialization, storage, and retrieval:
 * - DECIMAL(12, 2) exact precision columns
 * - DECIMAL(12, 3) quantity precision columns
 * - JSONB snapshot serialization and deserialization
 * - Nullable and default timestamp semantics
 */
class MockPostgresRelationalStorage {
  public static simulateSaleRoundtrip(
    persistenceData: {
      sale: Omit<PrismaSaleModel, 'createdAt' | 'updatedAt'>;
      items: Omit<PrismaSaleItemModel, 'createdAt' | 'updatedAt'>[];
    },
    clock: Clock,
  ): PrismaSaleWithItems {
    const now = clock.now();

    // Emulate PostgreSQL INSERT into "sales"
    const storedSale: PrismaSaleModel = {
      ...persistenceData.sale,
      // PostgreSQL DECIMAL columns retain exact fixed precision
      subtotalAmount: new Prisma.Decimal(persistenceData.sale.subtotalAmount.toFixed(2)),
      discountTotalAmount: new Prisma.Decimal(persistenceData.sale.discountTotalAmount.toFixed(2)),
      totalAmount: new Prisma.Decimal(persistenceData.sale.totalAmount.toFixed(2)),
      orderDiscountValue: persistenceData.sale.orderDiscountValue
        ? new Prisma.Decimal(persistenceData.sale.orderDiscountValue.toFixed(2))
        : null,
      createdAt: now,
      updatedAt: now,
    };

    // Emulate PostgreSQL INSERT into "sale_items"
    const storedItems: PrismaSaleItemModel[] = persistenceData.items.map((item) => ({
      ...item,
      quantity: new Prisma.Decimal(item.quantity.toFixed(3)),
      unitPriceAmount: new Prisma.Decimal(item.unitPriceAmount.toFixed(2)),
      subtotalAmount: new Prisma.Decimal(item.subtotalAmount.toFixed(2)),
      discountTotalAmount: new Prisma.Decimal(item.discountTotalAmount.toFixed(2)),
      totalAmount: new Prisma.Decimal(item.totalAmount.toFixed(2)),
      discountValue: item.discountValue ? new Prisma.Decimal(item.discountValue.toFixed(2)) : null,
      createdAt: now,
      updatedAt: now,
    }));

    return {
      ...storedSale,
      items: storedItems,
    };
  }

  public static simulatePaymentRoundtrip(
    persistenceData: Omit<PrismaPaymentModel, 'createdAt' | 'updatedAt'>,
    clock: Clock,
  ): PrismaPaymentModel {
    const now = clock.now();

    // Emulate PostgreSQL INSERT into "payments"
    return {
      ...persistenceData,
      amount: new Prisma.Decimal(persistenceData.amount.toFixed(2)),
      createdAt: now,
      updatedAt: now,
    };
  }

  public static simulateReceiptRoundtrip(receipt: Receipt, clock: Clock): PrismaReceiptModel {
    const now = clock.now();
    const persistenceData = PrismaReceiptMapper.toPersistence(receipt);

    // Emulate PostgreSQL JSONB stringify & parse roundtrip
    const clientSnapshot =
      persistenceData.clientSnapshot === Prisma.DbNull
        ? null
        : JSON.parse(JSON.stringify(persistenceData.clientSnapshot));
    const itemsSnapshot = JSON.parse(JSON.stringify(persistenceData.itemsSnapshot));
    const paymentsSnapshot = JSON.parse(JSON.stringify(persistenceData.paymentsSnapshot));

    // Emulate PostgreSQL INSERT into "receipts"
    return {
      id: persistenceData.id,
      tenantId: persistenceData.tenantId,
      saleId: persistenceData.saleId,
      receiptNumber: persistenceData.receiptNumber,
      saleReference: persistenceData.saleReference,
      issuedAt: persistenceData.issuedAt,
      clientSnapshot,
      itemsSnapshot,
      paymentsSnapshot,
      subtotalAmount: new Prisma.Decimal(persistenceData.subtotalAmount.toFixed(2)),
      discountTotalAmount: new Prisma.Decimal(persistenceData.discountTotalAmount.toFixed(2)),
      totalAmount: new Prisma.Decimal(persistenceData.totalAmount.toFixed(2)),
      currency: persistenceData.currency,
      status: persistenceData.status,
      reprintCount: persistenceData.reprintCount,
      lastReprintedAt: persistenceData.lastReprintedAt,
      version: persistenceData.version,
      createdAt: now,
      updatedAt: now,
    };
  }
}

describe('Prisma Persistence & Domain Model Full Mapping Roundtrip Specification', () => {
  const t0 = new Date('2026-10-02T12:00:00.000Z');
  const clock = new DeterministicClock(t0);

  const inventorySource = SourceReference.create({
    sourceType: SourceType.INVENTORY_ITEM,
    sourceId: 'inv-item-701',
    sourceCode: 'REHAB-BAND-01',
  });

  // ==========================================================================
  // 1. Sale and SaleItem Mapping Roundtrip
  // ==========================================================================
  describe('1. Sale and SaleItem Full Roundtrip Mapping', () => {
    it('roundtrips a complex Sale with multiple items, discounts, and optional fields with exact cents parity', () => {
      // 1. Construct Domain Sale Aggregate
      const sale = Sale.create(
        {
          id: SaleId.create('sale-rt-001'),
          source: inventorySource,
          tenantId: 'tenant-kinergy-main',
          clientId: 'client-usr-44',
          currency: 'USD',
        },
        clock,
      );

      // Add Item 1 with an item-level discount (10% off $50.00 = $5.00 discount, total $45.00)
      const item1 = SaleItem.create({
        id: SaleItemId.create('item-rt-1'),
        source: inventorySource,
        description: 'Resistance Band Heavy',
        skuOrCode: 'BAND-HVY',
        quantity: 1,
        unitPrice: Money.create(50.0, 'USD'),
        discount: Discount.create({
          type: DiscountType.PERCENTAGE,
          value: 10,
          reason: 'Member Promo',
        }),
      });
      sale.addItem(item1);

      // Add Item 2 with fixed item discount ($5.00 off $30.00 = $25.00)
      const item2 = SaleItem.create({
        id: SaleItemId.create('item-rt-2'),
        source: inventorySource,
        description: 'Foam Roller Pro',
        skuOrCode: 'ROLLER-PRO',
        quantity: 1,
        unitPrice: Money.create(30.0, 'USD'),
        discount: Discount.create({
          type: DiscountType.FIXED_AMOUNT,
          value: 5.0,
          reason: 'Clearance',
        }),
      });
      sale.addItem(item2);

      // Apply Order-Level Discount (Fixed $10.00 off remaining $70.00 = $60.00)
      sale.applyOrderDiscount(
        Discount.create({
          type: DiscountType.FIXED_AMOUNT,
          value: 10.0,
          reason: 'Seasonal Coupon',
        }),
      );

      // Finalize agreement
      sale.finalize(clock);

      // Verify domain invariants prior to persistence
      expect(sale.subtotal.cents).toBe(8000); // $50 + $30 = $80
      expect(sale.discountTotal.cents).toBe(2000); // $5 + $5 + $10 = $20
      expect(sale.total.cents).toBe(6000); // $80 - $20 = $60

      // 2. Map Domain → Prisma Persistence Model
      const persistenceData = PrismaSaleMapper.toPersistence(sale);

      expect(persistenceData.sale.id).toBe('sale-rt-001');
      expect(persistenceData.sale.tenantId).toBe('tenant-kinergy-main');
      expect(persistenceData.sale.clientId).toBe('client-usr-44');
      expect(persistenceData.sale.status).toBe(PrismaSaleStatus.PENDING_PAYMENT);
      expect(persistenceData.sale.currency).toBe('USD');
      expect(persistenceData.sale.sourceType).toBe(SourceType.INVENTORY_ITEM);
      expect(persistenceData.sale.sourceId).toBe('inv-item-701');
      expect(persistenceData.sale.sourceCode).toBe('REHAB-BAND-01');
      expect(persistenceData.sale.subtotalAmount.toFixed(2)).toBe('80.00');
      expect(persistenceData.sale.discountTotalAmount.toFixed(2)).toBe('20.00');
      expect(persistenceData.sale.totalAmount.toFixed(2)).toBe('60.00');
      expect(persistenceData.sale.orderDiscountType).toBe(DiscountType.FIXED_AMOUNT);
      expect(persistenceData.sale.orderDiscountValue?.toFixed(2)).toBe('10.00');
      expect(persistenceData.sale.orderDiscountReason).toBe('Seasonal Coupon');

      expect(persistenceData.items.length).toBe(2);
      expect(persistenceData.items[0]?.id).toBe('item-rt-1');
      expect(persistenceData.items[0]?.discountType).toBe(DiscountType.PERCENTAGE);
      expect(persistenceData.items[0]?.discountValue?.toFixed(2)).toBe('10.00');
      expect(persistenceData.items[1]?.id).toBe('item-rt-2');
      expect(persistenceData.items[1]?.discountType).toBe(DiscountType.FIXED_AMOUNT);
      expect(persistenceData.items[1]?.discountValue?.toFixed(2)).toBe('5.00');

      // 3. Emulate PostgreSQL Storage Roundtrip
      const dbRow = MockPostgresRelationalStorage.simulateSaleRoundtrip(persistenceData, clock);

      // 4. Map Prisma Result → Domain Reconstituted Aggregate
      const reconstituted = PrismaSaleMapper.toDomain(dbRow);

      // 5. Assert Exact Equivalence (zero floating-point deviation)
      expect(reconstituted.id.value).toBe(sale.id.value);
      expect(reconstituted.tenantId).toBe(sale.tenantId);
      expect(reconstituted.clientId).toBe(sale.clientId);
      expect(reconstituted.status).toBe(sale.status);
      expect(reconstituted.currency).toBe(sale.currency);
      expect(reconstituted.version).toBe(sale.version);

      // Monetary values must match down to the exact integer cents
      expect(reconstituted.subtotal.cents).toBe(sale.subtotal.cents);
      expect(reconstituted.subtotal.amount).toBe(sale.subtotal.amount);
      expect(reconstituted.discountTotal.cents).toBe(sale.discountTotal.cents);
      expect(reconstituted.discountTotal.amount).toBe(sale.discountTotal.amount);
      expect(reconstituted.total.cents).toBe(sale.total.cents);
      expect(reconstituted.total.amount).toBe(sale.total.amount);

      // Order discount
      expect(reconstituted.orderDiscount).not.toBeNull();
      expect(reconstituted.orderDiscount?.type).toBe(DiscountType.FIXED_AMOUNT);
      expect(reconstituted.orderDiscount?.value).toBe(10.0);
      expect(reconstituted.orderDiscount?.reason).toBe('Seasonal Coupon');

      // Line items
      expect(reconstituted.items.length).toBe(2);
      const reItem1 = reconstituted.items[0]!;
      expect(reItem1.id.value).toBe('item-rt-1');
      expect(reItem1.description).toBe('Resistance Band Heavy');
      expect(reItem1.skuOrCode).toBe('BAND-HVY');
      expect(reItem1.quantity).toBe(1);
      expect(reItem1.unitPrice.cents).toBe(5000);
      expect(reItem1.subtotal.cents).toBe(5000);
      expect(reItem1.discountTotal.cents).toBe(500);
      expect(reItem1.total.cents).toBe(4500);
      expect(reItem1.discount?.type).toBe(DiscountType.PERCENTAGE);
      expect(reItem1.discount?.value).toBe(10);
      expect(reItem1.discount?.reason).toBe('Member Promo');

      const reItem2 = reconstituted.items[1]!;
      expect(reItem2.id.value).toBe('item-rt-2');
      expect(reItem2.quantity).toBe(1);
      expect(reItem2.unitPrice.cents).toBe(3000);
      expect(reItem2.subtotal.cents).toBe(3000);
      expect(reItem2.discountTotal.cents).toBe(500);
      expect(reItem2.total.cents).toBe(2500);
      expect(reItem2.discount?.type).toBe(DiscountType.FIXED_AMOUNT);
      expect(reItem2.discount?.value).toBe(5.0);
    });

    it('roundtrips a CANCELLED Sale preserving cancellationReason and cancelledAt timestamp', () => {
      const sale = Sale.create(
        { id: SaleId.create('sale-cancel-01'), source: inventorySource, tenantId: 't-1' },
        clock,
      );
      sale.addItem({
        id: SaleItemId.create('i-1'),
        source: inventorySource,
        description: 'Towel',
        quantity: 1,
        unitPrice: Money.create(15.0, 'USD'),
      });
      sale.cancel('Customer changed mind', clock);

      expect(sale.status).toBe(SaleStatus.CANCELLED);
      expect(sale.cancellationReason).toBe('Customer changed mind');

      const persistence = PrismaSaleMapper.toPersistence(sale);
      expect(persistence.sale.cancellationReason).toBe('Customer changed mind');
      expect(persistence.sale.cancelledAt).toEqual(clock.now());

      const dbRow = MockPostgresRelationalStorage.simulateSaleRoundtrip(persistence, clock);
      const reconstituted = PrismaSaleMapper.toDomain(dbRow);

      expect(reconstituted.status).toBe(SaleStatus.CANCELLED);
      expect(reconstituted.cancellationReason).toBe('Customer changed mind');
      expect(reconstituted.cancelledAt).toEqual(clock.now());
    });
  });

  // ==========================================================================
  // 2. Discount Value Object Mapping Roundtrip
  // ==========================================================================
  describe('2. Discount Value Object Mapping Roundtrip', () => {
    it('roundtrips percentage and fixed amount discounts across edge values (0, boundary, fractions)', () => {
      // Case A: 0% discount
      const zeroPct = Discount.create({ type: DiscountType.PERCENTAGE, value: 0 });
      const decimalZero = new Prisma.Decimal(zeroPct.value.toFixed(2));
      expect(decimalZero.toFixed(2)).toBe('0.00');
      const reconZeroPct = Discount.create({
        type: DiscountType.PERCENTAGE,
        value: parseFloat(decimalZero.toString()),
      });
      expect(reconZeroPct.value).toBe(0);

      // Case B: 100% full discount
      const fullPct = Discount.create({
        type: DiscountType.PERCENTAGE,
        value: 100,
        reason: 'Full comp',
      });
      const decimalFull = new Prisma.Decimal(fullPct.value.toFixed(2));
      expect(decimalFull.toFixed(2)).toBe('100.00');
      const reconFull = Discount.create({
        type: DiscountType.PERCENTAGE,
        value: parseFloat(decimalFull.toString()),
        reason: 'Full comp',
      });
      expect(reconFull.value).toBe(100);
      expect(reconFull.reason).toBe('Full comp');

      // Case C: Fractional percentage (e.g. 12.5%)
      const fracPct = Discount.create({ type: DiscountType.PERCENTAGE, value: 12.5 });
      const decimalFrac = new Prisma.Decimal(fracPct.value.toFixed(2));
      expect(decimalFrac.toFixed(2)).toBe('12.50');
      const reconFrac = Discount.create({
        type: DiscountType.PERCENTAGE,
        value: parseFloat(decimalFrac.toString()),
      });
      expect(reconFrac.value).toBe(12.5);

      // Case D: Fixed amount with fractional cents ($33.33)
      const fixedDisc = Discount.create({
        type: DiscountType.FIXED_AMOUNT,
        value: 33.33,
        reason: 'Promo Voucher',
      });
      const decimalFixed = new Prisma.Decimal(fixedDisc.value.toFixed(2));
      expect(decimalFixed.toFixed(2)).toBe('33.33');
      const reconFixed = Discount.create({
        type: DiscountType.FIXED_AMOUNT,
        value: parseFloat(decimalFixed.toString()),
        reason: 'Promo Voucher',
      });
      expect(reconFixed.value).toBe(33.33);
      expect(reconFixed.reason).toBe('Promo Voucher');
    });
  });

  // ==========================================================================
  // 3. Payment Aggregate Mapping Roundtrip
  // ==========================================================================
  describe('3. Payment Aggregate Mapping Roundtrip', () => {
    it('roundtrips a COMPLETED Payment mapping to Prisma SETTLED status and preserving paidAt', () => {
      const payment = Payment.createCompleted(
        {
          id: PaymentId.create('pay-comp-01'),
          saleId: SaleId.create('sale-pay-01'),
          amount: Money.create(125.75, 'USD'),
          method: PaymentMethod.QR,
          reference: 'QR-TX-998877',
          tenantId: 'tenant-alpha',
        },
        clock,
      );

      expect(payment.status).toBe(PaymentStatus.COMPLETED);
      expect(payment.amount.cents).toBe(12575);
      expect(payment.paidAt).toEqual(clock.now());

      // Map to persistence
      const persistence = PrismaPaymentMapper.toPersistence(payment);
      expect(persistence.id).toBe('pay-comp-01');
      expect(persistence.saleId).toBe('sale-pay-01');
      expect(persistence.tenantId).toBe('tenant-alpha');
      expect(persistence.method).toBe(PaymentMethod.QR);
      expect(persistence.status).toBe(PrismaPaymentStatus.SETTLED); // Domain COMPLETED -> Prisma SETTLED
      expect(persistence.amount.toFixed(2)).toBe('125.75');
      expect(persistence.reference).toBe('QR-TX-998877');
      expect(persistence.paidAt).toEqual(clock.now());

      // Emulate PostgreSQL storage
      const dbRow = MockPostgresRelationalStorage.simulatePaymentRoundtrip(persistence, clock);

      // Reconstitute back to domain
      const reconstituted = PrismaPaymentMapper.toDomain(dbRow);

      expect(reconstituted.id.value).toBe(payment.id.value);
      expect(reconstituted.saleId.value).toBe(payment.saleId.value);
      expect(reconstituted.tenantId).toBe(payment.tenantId);
      expect(reconstituted.method).toBe(payment.method);
      expect(reconstituted.status).toBe(PaymentStatus.COMPLETED); // Prisma SETTLED -> Domain COMPLETED
      expect(reconstituted.amount.cents).toBe(12575);
      expect(reconstituted.amount.amount).toBe(125.75);
      expect(reconstituted.reference?.value).toBe('QR-TX-998877');
      expect(reconstituted.paidAt).toEqual(clock.now());
      expect(reconstituted.version).toBe(payment.version);
    });

    it('roundtrips a PENDING Payment with null reference and null paidAt', () => {
      const payment = Payment.createPending(
        {
          id: PaymentId.create('pay-pend-01'),
          saleId: SaleId.create('sale-pend-01'),
          amount: Money.create(40.0, 'USD'),
          method: PaymentMethod.CASH,
          tenantId: 'tenant-beta',
        },
        clock,
      );

      expect(payment.status).toBe(PaymentStatus.PENDING);
      expect(payment.reference).toBeNull();
      expect(payment.paidAt).toBeNull();

      const persistence = PrismaPaymentMapper.toPersistence(payment);
      expect(persistence.status).toBe(PrismaPaymentStatus.PENDING);
      expect(persistence.reference).toBeNull();
      expect(persistence.paidAt).toBeNull();

      const dbRow = MockPostgresRelationalStorage.simulatePaymentRoundtrip(persistence, clock);
      const reconstituted = PrismaPaymentMapper.toDomain(dbRow);

      expect(reconstituted.status).toBe(PaymentStatus.PENDING);
      expect(reconstituted.reference).toBeNull();
      expect(reconstituted.paidAt).toBeNull();
      expect(reconstituted.amount.cents).toBe(4000);
    });
  });

  // ==========================================================================
  // 4. Receipt Document Model & Snapshots Roundtrip
  // ==========================================================================
  describe('4. Receipt Document Model and Snapshots Roundtrip', () => {
    it('roundtrips a full Receipt preserving client, item, and payment historical snapshots', () => {
      const receipt = Receipt.create(
        {
          id: ReceiptId.create('rcpt-hist-01'),
          receiptNumber: ReceiptNumber.create('REC-2026-000088'),
          saleId: SaleId.create('sale-hist-01'),
          saleReference: 'ORD-2026-HIST-01',
          tenantId: 'tenant-wellness',
          clientSnapshot: ReceiptClientSnapshot.create({
            clientId: 'cli-hist-1',
            referenceNumber: 'CLI-REF-001',
            fullName: 'Alexander Hamilton',
            email: 'alex@treasury.gov',
            phone: '+1-555-0100',
          }),
          items: [
            ReceiptItemSnapshot.create({
              itemId: 'i-snap-1',
              sourceType: SourceType.INVENTORY_ITEM,
              sourceId: 'inv-item-1',
              description: 'Physiotherapy Manual',
              skuOrCode: 'MANUAL-01',
              quantity: 2,
              unitPrice: Money.create(35.0, 'USD'),
              discountTotal: Money.create(10.0, 'USD'),
              subtotal: Money.create(70.0, 'USD'),
              total: Money.create(60.0, 'USD'),
            }),
          ],
          payments: [
            ReceiptPaymentSnapshot.create({
              paymentId: 'pay-snap-1',
              method: PaymentMethod.CASH,
              status: PaymentStatus.COMPLETED,
              amount: Money.create(60.0, 'USD'),
              reference: 'CASH-RECEIPT-88',
              paidAt: clock.now(),
            }),
          ],
          subtotal: Money.create(70.0, 'USD'),
          discountTotal: Money.create(10.0, 'USD'),
          total: Money.create(60.0, 'USD'),
        },
        clock,
      );

      expect(receipt.status).toBe(ReceiptStatus.ISSUED);
      expect(receipt.reprintCount).toBe(0);
      expect(receipt.lastReprintedAt).toBeNull();

      // Emulate PostgreSQL Storage
      const dbRow = MockPostgresRelationalStorage.simulateReceiptRoundtrip(receipt, clock);
      expect(dbRow.status).toBe(PrismaReceiptStatus.ISSUED);

      // Reconstitute back to domain
      const reconstituted = PrismaReceiptMapper.toDomain(dbRow);

      expect(reconstituted.id.value).toBe('rcpt-hist-01');
      expect(reconstituted.receiptNumber.value).toBe('REC-2026-000088');
      expect(reconstituted.saleId.value).toBe('sale-hist-01');
      expect(reconstituted.saleReference).toBe('ORD-2026-HIST-01');
      expect(reconstituted.tenantId).toBe('tenant-wellness');

      // Client snapshot
      expect(reconstituted.clientSnapshot).not.toBeNull();
      expect(reconstituted.clientSnapshot?.clientId).toBe('cli-hist-1');
      expect(reconstituted.clientSnapshot?.fullName).toBe('Alexander Hamilton');
      expect(reconstituted.clientSnapshot?.email).toBe('alex@treasury.gov');
      expect(reconstituted.clientSnapshot?.phone).toBe('+1-555-0100');
      expect(reconstituted.clientSnapshot?.referenceNumber).toBe('CLI-REF-001');

      // Item snapshot
      expect(reconstituted.items.length).toBe(1);
      const reItem = reconstituted.items[0]!;
      expect(reItem.itemId).toBe('i-snap-1');
      expect(reItem.description).toBe('Physiotherapy Manual');
      expect(reItem.quantity).toBe(2);
      expect(reItem.unitPrice.cents).toBe(3500);
      expect(reItem.subtotal.cents).toBe(7000);
      expect(reItem.discountTotal?.cents).toBe(1000);
      expect(reItem.total.cents).toBe(6000);

      // Payment snapshot
      expect(reconstituted.payments.length).toBe(1);
      const rePay = reconstituted.payments[0]!;
      expect(rePay.paymentId).toBe('pay-snap-1');
      expect(rePay.method).toBe(PaymentMethod.CASH);
      expect(rePay.status).toBe(PaymentStatus.COMPLETED);
      expect(rePay.amount.cents).toBe(6000);
      expect(rePay.reference).toBe('CASH-RECEIPT-88');
      expect(rePay.paidAt).toEqual(clock.now());

      // Totals
      expect(reconstituted.subtotal.cents).toBe(7000);
      expect(reconstituted.discountTotal.cents).toBe(1000);
      expect(reconstituted.total.cents).toBe(6000);
    });
  });

  // ==========================================================================
  // 5. SaleSource and SourceReference Mapping Roundtrip
  // ==========================================================================
  describe('5. SaleSource & SourceReference Commercial Origin Mapping', () => {
    it.each([
      [SaleSourceType.KINESIOLOGY_SESSION, 'kinesio-sess-100'],
      [SaleSourceType.GYM_MEMBERSHIP, 'gym-member-plan-200'],
      [SaleSourceType.FOOD, 'protein-snack-300'],
      [SaleSourceType.DRINK, 'hydration-electrolyte-400'],
      [SaleSourceType.ROOM_RENTAL, 'studio-b-hourly-500'],
    ])('roundtrips typed SaleSource with sourceType %s and sourceId %s', (sourceType, sourceId) => {
      const source = SaleSource.create(sourceType, sourceId);
      const sale = Sale.create(
        { id: SaleId.create(`sale-src-${sourceId}`), source, tenantId: 't-src' },
        clock,
      );

      const persistence = PrismaSaleMapper.toPersistence(sale);
      expect(persistence.sale.sourceType).toBe(sourceType);
      expect(persistence.sale.sourceId).toBe(sourceId);

      const dbRow = MockPostgresRelationalStorage.simulateSaleRoundtrip(persistence, clock);
      const reconstituted = PrismaSaleMapper.toDomain(dbRow);

      expect(reconstituted.source).toBeInstanceOf(SaleSource);
      expect(reconstituted.source.sourceType).toBe(sourceType);
      expect(reconstituted.source.sourceId).toBe(sourceId);
    });

    it('roundtrips legacy SourceReference with optional sourceCode', () => {
      const source = SourceReference.create({
        sourceType: SourceType.INVENTORY_ITEM,
        sourceId: 'inv-legacy-01',
        sourceCode: 'CODE-LEGACY-99',
      });
      const sale = Sale.create(
        { id: SaleId.create('sale-legacy-01'), source, tenantId: 't-legacy' },
        clock,
      );

      const persistence = PrismaSaleMapper.toPersistence(sale);
      expect(persistence.sale.sourceCode).toBe('CODE-LEGACY-99');

      const dbRow = MockPostgresRelationalStorage.simulateSaleRoundtrip(persistence, clock);
      const reconstituted = PrismaSaleMapper.toDomain(dbRow);

      expect(reconstituted.source).toBeInstanceOf(SourceReference);
      expect(reconstituted.source.sourceType).toBe(SourceType.INVENTORY_ITEM);
      expect(reconstituted.source.sourceId).toBe('inv-legacy-01');
      expect(reconstituted.source.sourceCode).toBe('CODE-LEGACY-99');
    });
  });

  // ==========================================================================
  // 6. Boundary Values, Precision, and Floating-Point Hazards
  // ==========================================================================
  describe('6. Boundary Values and Precision Drift Hazards', () => {
    it('roundtrips minimum positive monetary values ($0.01 / 1 cent) without precision loss', () => {
      const penny = Money.create(0.01, 'USD');
      expect(penny.cents).toBe(1);

      const decimal = PrismaMoneyMapper.toDecimal(penny);
      expect(decimal.toFixed(2)).toBe('0.01');

      const reconstituted = PrismaMoneyMapper.toMoney(decimal, 'USD');
      expect(reconstituted.cents).toBe(1);
      expect(reconstituted.amount).toBe(0.01);
      expect(reconstituted.equals(penny)).toBe(true);
    });

    it('roundtrips zero monetary value ($0.00 / 0 cents) without precision loss', () => {
      const zero = Money.zero('USD');
      expect(zero.cents).toBe(0);

      const decimal = PrismaMoneyMapper.toDecimal(zero);
      expect(decimal.toFixed(2)).toBe('0.00');

      const reconstituted = PrismaMoneyMapper.toMoney(decimal, 'USD');
      expect(reconstituted.cents).toBe(0);
      expect(reconstituted.amount).toBe(0.0);
      expect(reconstituted.isZero()).toBe(true);
    });

    it('roundtrips classical IEEE-754 hazard values ($0.10, $0.20, $0.70) without binary float artifacts', () => {
      // In binary floating-point, 0.1 + 0.2 = 0.30000000000000004
      const m1 = Money.create(0.1, 'USD');
      const m2 = Money.create(0.2, 'USD');
      const sum = m1.add(m2);

      expect(sum.cents).toBe(30);
      expect(sum.amount).toBe(0.3);

      const decimal = PrismaMoneyMapper.toDecimal(sum);
      expect(decimal.toFixed(2)).toBe('0.30');

      const recon = PrismaMoneyMapper.toMoney(decimal, 'USD');
      expect(recon.cents).toBe(30);
      expect(recon.amount).toBe(0.3);
      expect(recon.equals(sum)).toBe(true);
    });

    it('roundtrips large valid financial amounts ($99,999,999.99) without overflow or truncation', () => {
      const large = Money.create('99999999.99', 'USD');
      expect(large.cents).toBe(9999999999);

      const decimal = PrismaMoneyMapper.toDecimal(large);
      expect(decimal.toFixed(2)).toBe('99999999.99');

      const recon = PrismaMoneyMapper.toMoney(decimal, 'USD');
      expect(recon.cents).toBe(9999999999);
      expect(recon.amount).toBe(99999999.99);
      expect(recon.equals(large)).toBe(true);
    });

    it('preserves 3-decimal-place quantity precision on line items (e.g. 2.750 kg/hours)', () => {
      const rawItem: PrismaSaleItemModel = {
        id: 'item-qty-01',
        saleId: 'sale-qty-01',
        sourceType: SourceType.INVENTORY_ITEM,
        sourceId: 'inv-item-powder',
        sourceCode: null,
        description: 'Bulk Protein Powder',
        skuOrCode: 'BULK-WHEY',
        quantity: new Prisma.Decimal('2.750'),
        unitPriceAmount: new Prisma.Decimal('20.00'),
        unitPriceCurrency: 'USD',
        subtotalAmount: new Prisma.Decimal('55.00'),
        discountType: null,
        discountValue: null,
        discountReason: null,
        discountTotalAmount: new Prisma.Decimal('0.00'),
        totalAmount: new Prisma.Decimal('55.00'),
        createdAt: clock.now(),
        updatedAt: clock.now(),
      };

      const domainItem = PrismaSaleItemMapper.toDomain(rawItem);
      expect(domainItem.quantity).toBe(2.75);

      const backToPersistence = PrismaSaleItemMapper.toPersistence(
        domainItem,
        'sale-qty-01',
        'USD',
      );
      expect(backToPersistence.quantity.toFixed(3)).toBe('2.750');
    });
  });

  // ==========================================================================
  // 7. Optional and Nullable Field Semantics
  // ==========================================================================
  describe('7. Optional and Nullable Field Semantics', () => {
    it('roundtrips a minimal Sale where all optional fields are undefined/null', () => {
      const minimalSale = Sale.create(
        {
          id: SaleId.create('sale-min-01'),
          source: inventorySource,
          // clientId omitted
          // tenantId omitted
          // orderDiscount omitted
        },
        clock,
      );

      const persistence = PrismaSaleMapper.toPersistence(minimalSale);
      expect(persistence.sale.clientId).toBeNull();
      expect(persistence.sale.tenantId).toBeNull();
      expect(persistence.sale.sourceCode).toBe('REHAB-BAND-01');
      expect(persistence.sale.orderDiscountType).toBeNull();
      expect(persistence.sale.orderDiscountValue).toBeNull();
      expect(persistence.sale.orderDiscountReason).toBeNull();
      expect(persistence.sale.cancellationReason).toBeNull();
      expect(persistence.sale.cancelledAt).toBeNull();
      expect(persistence.sale.completedAt).toBeNull();
      expect(persistence.sale.refundedAt).toBeNull();

      const dbRow = MockPostgresRelationalStorage.simulateSaleRoundtrip(persistence, clock);
      const reconstituted = PrismaSaleMapper.toDomain(dbRow);

      expect(reconstituted.clientId).toBeUndefined();
      expect(reconstituted.tenantId).toBeUndefined();
      expect(reconstituted.orderDiscount).toBeNull();
      expect(reconstituted.cancellationReason).toBeUndefined();
      expect(reconstituted.cancelledAt).toBeUndefined();
    });

    it('roundtrips a minimal Receipt where clientSnapshot is null', () => {
      const receipt = Receipt.create(
        {
          id: ReceiptId.create('rcpt-anon-01'),
          receiptNumber: ReceiptNumber.create('REC-2026-000009'),
          saleId: SaleId.create('sale-anon-01'),
          saleReference: 'ORD-ANON-09',
          tenantId: 'tenant-gym',
          clientSnapshot: null, // Walk-in anonymous client
          items: [
            ReceiptItemSnapshot.create({
              itemId: 'item-anon-1',
              sourceType: SourceType.INVENTORY_ITEM,
              sourceId: 'inv-water',
              description: 'Spring Water 500ml',
              quantity: 1,
              unitPrice: Money.create(2.5, 'USD'),
              subtotal: Money.create(2.5, 'USD'),
              total: Money.create(2.5, 'USD'),
            }),
          ],
          payments: [
            ReceiptPaymentSnapshot.create({
              paymentId: 'pay-anon-1',
              method: PaymentMethod.CASH,
              status: PaymentStatus.COMPLETED,
              amount: Money.create(2.5, 'USD'),
              paidAt: clock.now(),
            }),
          ],
          subtotal: Money.create(2.5, 'USD'),
          total: Money.create(2.5, 'USD'),
        },
        clock,
      );

      const dbRow = MockPostgresRelationalStorage.simulateReceiptRoundtrip(receipt, clock);
      expect(dbRow.clientSnapshot).toBeNull();

      const reconstituted = PrismaReceiptMapper.toDomain(dbRow);
      expect(reconstituted.clientSnapshot).toBeNull();
      expect(reconstituted.items.length).toBe(1);
      expect(reconstituted.payments.length).toBe(1);
      expect(reconstituted.total.cents).toBe(250);
    });

    it('reconstitution strictly asserts that database totals reconcile with line items', () => {
      const clock = new DeterministicClock(new Date('2026-09-28T12:00:00.000Z'));
      const validSource = SourceReference.create({
        sourceType: SourceType.INVENTORY_ITEM,
        sourceId: 'inv-item-001',
      });
      const sale = Sale.create(
        { id: SaleId.create('sale-recon-tamper'), source: validSource },
        clock,
      );
      sale.addItem(
        {
          source: validSource,
          description: 'Item',
          quantity: 1,
          unitPrice: Money.create(50.0, 'USD'),
        },
        clock,
      );

      const { sale: persistedSale, items: persistedItems } = PrismaSaleMapper.toPersistence(sale);

      // Simulate malicious tampering of totalAmount directly in PostgreSQL
      const tamperedSale = {
        ...persistedSale,
        totalAmount: new Prisma.Decimal('0.01'), // Tampered!
        createdAt: new Date(),
        updatedAt: new Date(),
        items: persistedItems.map((i) => ({ ...i, createdAt: new Date(), updatedAt: new Date() })),
      };

      expect(() => PrismaSaleMapper.toDomain(tamperedSale)).toThrow(InvalidSaleStateException);
      expect(() => PrismaSaleMapper.toDomain(tamperedSale)).toThrow(
        /Persisted total .* does not reconcile with subtotal - discountTotal/,
      );
    });
  });
});
