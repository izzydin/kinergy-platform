import {
  Prisma,
  PrismaClient,
  Sale as PrismaSaleModel,
  SaleItem as PrismaSaleItemModel,
  Payment as PrismaPaymentModel,
  Receipt as PrismaReceiptModel,
} from '@prisma/client';
import { Sale, CreateSaleProps } from '../../../../domain/sale.aggregate';
import { SaleItem } from '../../../../domain/entities/sale-item.entity';
import { SaleId } from '../../../../domain/value-objects/sale-id.vo';
import { Money } from '../../../../domain/value-objects/money.vo';
import { Discount } from '../../../../domain/value-objects/discount.vo';
import { SaleSource } from '../../../../domain/value-objects/sale-source.vo';
import { SaleSourceType } from '../../../../domain/enums/sale-source-type.enum';
import { SaleStatus } from '../../../../domain/enums/sale-status.enum';
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
import { PrismaSaleRepository } from '../repositories/prisma-sale.repository';
import { PrismaPaymentRepository } from '../repositories/prisma-payment.repository';
import { PrismaReceiptRepository } from '../repositories/prisma-receipt.repository';
import { PrismaReceiptSequenceGenerator } from '../services/prisma-receipt-sequence.generator';
import { PrismaSaleItemMapper } from '../mappers/prisma-sale-item.mapper';
import {
  InvalidSaleStateException,
  DuplicateReceiptException,
  SaleOptimisticLockException,
} from '../../../../domain/exceptions';
import { Clock, DeterministicClock } from '../../../../domain/shared/clock';

/**
 * PostgreSQL Custom Error representation matching pg driver and Prisma errors.
 */
interface PostgresEngineError extends Error {
  code: string; // SQLSTATE e.g. '23503' (foreign_key_violation), '23505' (unique_violation), '23514' (check_violation)
  constraint?: string;
  table?: string;
}

function createPgError(
  message: string,
  code: string,
  constraint?: string,
  table?: string,
): PostgresEngineError {
  const err = new Error(message) as PostgresEngineError;
  err.code = code;
  err.constraint = constraint;
  err.table = table;
  return err;
}

/**
 * High-fidelity PostgreSQL Relational & Transactional Database Engine Emulator.
 * Enforces PostgreSQL schema invariants:
 * - Foreign Keys: sale_items -> sales (CASCADE), payments -> sales (RESTRICT), receipts -> sales (RESTRICT).
 * - Primary Key & Unique Constraints: unique_tenant_sale_receipt, unique_tenant_receipt_number.
 * - PostgreSQL Check Constraints: non-negative monetary amounts, positive payment amount, positive quantities.
 * - Exact DECIMAL(12, 2) arithmetic and JSONB snapshots.
 * - ACID Transaction isolation with complete rollback upon error.
 */
class PostgreSqlPhase7TestDatabase {
  public sales = new Map<string, PrismaSaleModel>();
  public saleItems = new Map<string, PrismaSaleItemModel>();
  public payments = new Map<string, PrismaPaymentModel>();
  public receipts = new Map<string, PrismaReceiptModel>();
  public receiptSequences = new Map<string, number>();

  // Diagnostic fault-injection hooks
  public failNextOperationWith: PostgresEngineError | null = null;

  public clear(): void {
    // Reverse dependency cleanup order respecting RESTRICT foreign keys
    this.receipts.clear();
    this.payments.clear();
    this.saleItems.clear();
    this.sales.clear();
    this.receiptSequences.clear();
    this.failNextOperationWith = null;
  }

  public createClient(): PrismaClient {
    const executeWithFaultCheck = <T>(op: () => T): T => {
      if (this.failNextOperationWith) {
        const error = this.failNextOperationWith;
        this.failNextOperationWith = null;
        throw error;
      }
      return op();
    };

    const buildScopedMethods = (
      bufferedSales: Map<string, PrismaSaleModel>,
      bufferedItems: Map<string, PrismaSaleItemModel>,
      bufferedPayments: Map<string, PrismaPaymentModel>,
      bufferedReceipts: Map<string, PrismaReceiptModel>,
      bufferedSequences: Map<string, number>,
    ): Record<string, unknown> => {
      const validateSaleCheckConstraints = (data: Partial<PrismaSaleModel>) => {
        if (
          data.subtotalAmount &&
          new Prisma.Decimal(data.subtotalAmount.toString()).isNegative()
        ) {
          throw createPgError(
            'Check constraint violation: subtotal_amount >= 0',
            '23514',
            'chk_sales_non_negative_subtotal',
            'sales',
          );
        }
        if (
          data.discountTotalAmount &&
          new Prisma.Decimal(data.discountTotalAmount.toString()).isNegative()
        ) {
          throw createPgError(
            'Check constraint violation: discount_total_amount >= 0',
            '23514',
            'chk_sales_non_negative_discount_total',
            'sales',
          );
        }
        if (data.totalAmount && new Prisma.Decimal(data.totalAmount.toString()).isNegative()) {
          throw createPgError(
            'Check constraint violation: total_amount >= 0',
            '23514',
            'chk_sales_non_negative_total',
            'sales',
          );
        }
        if (data.orderDiscountType === 'PERCENTAGE' && data.orderDiscountValue) {
          const val = new Prisma.Decimal(data.orderDiscountValue.toString());
          if (val.isNegative() || val.greaterThan(100)) {
            throw createPgError(
              'Check constraint violation: percentage discount must be between 0 and 100',
              '23514',
              'chk_sales_valid_percentage_discount',
              'sales',
            );
          }
        }
      };

      const validatePaymentCheckConstraints = (data: Partial<PrismaPaymentModel>) => {
        if (
          data.amount !== undefined &&
          new Prisma.Decimal(data.amount.toString()).lessThanOrEqualTo(0)
        ) {
          throw createPgError(
            'Check constraint violation: payment amount must be strictly positive',
            '23514',
            'chk_payments_positive_amount',
            'payments',
          );
        }
      };

      const validateItemCheckConstraints = (data: Partial<PrismaSaleItemModel>) => {
        if (
          data.quantity !== undefined &&
          new Prisma.Decimal(data.quantity.toString()).lessThanOrEqualTo(0)
        ) {
          throw createPgError(
            'Check constraint violation: item quantity must be strictly positive',
            '23514',
            'chk_sale_items_positive_quantity',
            'sale_items',
          );
        }
        if (
          data.unitPriceAmount &&
          new Prisma.Decimal(data.unitPriceAmount.toString()).isNegative()
        ) {
          throw createPgError(
            'Check constraint violation: unit_price_amount >= 0',
            '23514',
            'chk_sale_items_non_negative_unit_price',
            'sale_items',
          );
        }
        if (data.totalAmount && new Prisma.Decimal(data.totalAmount.toString()).isNegative()) {
          throw createPgError(
            'Check constraint violation: total_amount >= 0',
            '23514',
            'chk_sale_items_non_negative_total',
            'sale_items',
          );
        }
      };

      return {
        $queryRawUnsafe: jest.fn(async (sql: string, ...params: unknown[]) => {
          return executeWithFaultCheck(() => {
            if (sql.includes('receipt_sequences')) {
              const tenant = String(params[0]);
              const yr = Number(params[1]);
              const key = `${tenant}_${yr}`;
              const current = bufferedSequences.get(key) ?? 0;
              const nextVal = current + 1;
              bufferedSequences.set(key, nextVal);
              return [{ current_value: nextVal }];
            }
            return [];
          });
        }),
        sale: {
          findUnique: jest.fn(
            async ({
              where,
              include,
            }: {
              where: { id: string };
              include?: { items?: boolean };
            }) => {
              return executeWithFaultCheck(() => {
                const sale = bufferedSales.get(where.id);
                if (!sale) return null;
                if (include?.items) {
                  const items = Array.from(bufferedItems.values()).filter(
                    (i) => i.saleId === sale.id,
                  );
                  return { ...sale, items };
                }
                return { ...sale };
              });
            },
          ),
          findFirst: jest.fn(async ({ where }: { where: Record<string, unknown> }) => {
            return executeWithFaultCheck(() => {
              for (const sale of bufferedSales.values()) {
                let match = true;
                for (const [k, v] of Object.entries(where)) {
                  if ((sale as Record<string, unknown>)[k] !== v) {
                    match = false;
                    break;
                  }
                }
                if (match) return { ...sale };
              }
              return null;
            });
          }),
          upsert: jest.fn(
            async ({
              where,
              create,
              update,
            }: {
              where: { id: string };
              create: PrismaSaleModel;
              update: PrismaSaleModel;
            }) => {
              return executeWithFaultCheck(() => {
                const existing = bufferedSales.get(where.id);
                if (existing) {
                  validateSaleCheckConstraints(update);
                  const updated = { ...existing, ...update, updatedAt: new Date() };
                  bufferedSales.set(where.id, updated);
                  return updated;
                } else {
                  validateSaleCheckConstraints(create);
                  const created = { ...create, createdAt: new Date(), updatedAt: new Date() };
                  bufferedSales.set(where.id, created);
                  return created;
                }
              });
            },
          ),
          updateMany: jest.fn(
            async ({
              where,
              data,
            }: {
              where: { id: string; version?: number };
              data: Partial<PrismaSaleModel>;
            }) => {
              return executeWithFaultCheck(() => {
                const existing = bufferedSales.get(where.id);
                if (!existing) return { count: 0 };
                if (where.version !== undefined && existing.version !== where.version) {
                  return { count: 0 };
                }
                validateSaleCheckConstraints(data);
                const updated = {
                  ...existing,
                  ...data,
                  version: existing.version + 1,
                  updatedAt: new Date(),
                };
                bufferedSales.set(where.id, updated);
                return { count: 1 };
              });
            },
          ),
          delete: jest.fn(async ({ where }: { where: { id: string } }) => {
            return executeWithFaultCheck(() => {
              const sale = bufferedSales.get(where.id);
              if (!sale) throw createPgError('Record not found', 'P2025');

              // Enforce ON DELETE RESTRICT for payments
              for (const p of bufferedPayments.values()) {
                if (p.saleId === where.id) {
                  throw createPgError(
                    'Foreign key violation: onDelete: Restrict on payments',
                    '23503',
                    'fk_payments_sale_id',
                    'payments',
                  );
                }
              }

              // Enforce ON DELETE RESTRICT for receipts
              for (const r of bufferedReceipts.values()) {
                if (r.saleId === where.id) {
                  throw createPgError(
                    'Foreign key violation: onDelete: Restrict on receipts',
                    '23503',
                    'fk_receipts_sale_id',
                    'receipts',
                  );
                }
              }

              // Enforce ON DELETE CASCADE for sale_items
              for (const [itemId, item] of Array.from(bufferedItems.entries())) {
                if (item.saleId === where.id) {
                  bufferedItems.delete(itemId);
                }
              }

              bufferedSales.delete(where.id);
              return sale;
            });
          }),
        },
        saleItem: {
          findMany: jest.fn(async ({ where }: { where: { saleId: string } }) => {
            return executeWithFaultCheck(() => {
              return Array.from(bufferedItems.values()).filter((i) => i.saleId === where.saleId);
            });
          }),
          upsert: jest.fn(
            async ({
              where,
              create,
              update,
            }: {
              where: { id: string };
              create: PrismaSaleItemModel;
              update: PrismaSaleItemModel;
            }) => {
              return executeWithFaultCheck(() => {
                const targetSaleId = create?.saleId ?? update?.saleId;
                // Foreign key validation: saleId must exist in sales
                if (!bufferedSales.has(targetSaleId)) {
                  throw createPgError(
                    'Foreign key constraint violation: sale_id does not exist',
                    '23503',
                    'fk_sale_items_sale_id',
                    'sale_items',
                  );
                }
                const existing = bufferedItems.get(where.id);
                if (existing) {
                  validateItemCheckConstraints(update);
                  const updated = { ...existing, ...update, updatedAt: new Date() };
                  bufferedItems.set(where.id, updated);
                  return updated;
                } else {
                  validateItemCheckConstraints(create);
                  const created = { ...create, createdAt: new Date(), updatedAt: new Date() };
                  bufferedItems.set(where.id, created);
                  return created;
                }
              });
            },
          ),
          deleteMany: jest.fn(
            async ({ where }: { where: { saleId: string; id?: { notIn?: string[] } } }) => {
              return executeWithFaultCheck(() => {
                let count = 0;
                for (const [itemId, item] of Array.from(bufferedItems.entries())) {
                  if (item.saleId === where.saleId) {
                    if (where.id?.notIn && where.id.notIn.includes(itemId)) {
                      continue;
                    }
                    bufferedItems.delete(itemId);
                    count++;
                  }
                }
                return { count };
              });
            },
          ),
        },
        payment: {
          findUnique: jest.fn(async ({ where }: { where: { id: string } }) => {
            return executeWithFaultCheck(() => bufferedPayments.get(where.id) ?? null);
          }),
          findMany: jest.fn(
            async ({ where }: { where?: { saleId?: string; tenantId?: string } }) => {
              return executeWithFaultCheck(() => {
                return Array.from(bufferedPayments.values()).filter((p) => {
                  if (where?.saleId && p.saleId !== where.saleId) return false;
                  if (where?.tenantId && p.tenantId !== where.tenantId) return false;
                  return true;
                });
              });
            },
          ),
          upsert: jest.fn(
            async ({
              where,
              create,
              update,
            }: {
              where: { id: string };
              create: PrismaPaymentModel;
              update: PrismaPaymentModel;
            }) => {
              return executeWithFaultCheck(() => {
                const targetSaleId = create?.saleId ?? update?.saleId;
                if (!bufferedSales.has(targetSaleId)) {
                  throw createPgError(
                    'Foreign key constraint violation: sale_id does not exist in sales',
                    '23503',
                    'fk_payments_sale_id',
                    'payments',
                  );
                }
                const existing = bufferedPayments.get(where.id);
                if (existing) {
                  validatePaymentCheckConstraints(update);
                  const updated = { ...existing, ...update, updatedAt: new Date() };
                  bufferedPayments.set(where.id, updated);
                  return updated;
                } else {
                  validatePaymentCheckConstraints(create);
                  const created = { ...create, createdAt: new Date(), updatedAt: new Date() };
                  bufferedPayments.set(where.id, created);
                  return created;
                }
              });
            },
          ),
          updateMany: jest.fn(
            async ({
              where,
              data,
            }: {
              where: { id: string; version?: number };
              data: Partial<PrismaPaymentModel>;
            }) => {
              return executeWithFaultCheck(() => {
                const existing = bufferedPayments.get(where.id);
                if (!existing) return { count: 0 };
                if (where.version !== undefined && existing.version !== where.version) {
                  return { count: 0 };
                }
                validatePaymentCheckConstraints(data);
                const updated = {
                  ...existing,
                  ...data,
                  version: existing.version + 1,
                  updatedAt: new Date(),
                };
                bufferedPayments.set(where.id, updated);
                return { count: 1 };
              });
            },
          ),
        },
        receipt: {
          findFirst: jest.fn(async ({ where }: { where: Record<string, unknown> }) => {
            return executeWithFaultCheck(() => {
              for (const r of bufferedReceipts.values()) {
                let match = true;
                for (const [k, v] of Object.entries(where)) {
                  if ((r as Record<string, unknown>)[k] !== v) {
                    match = false;
                    break;
                  }
                }
                if (match) return { ...r };
              }
              return null;
            });
          }),
          findUnique: jest.fn(
            async ({
              where,
            }: {
              where: {
                id?: string;
                tenantId_saleId?: { tenantId: string; saleId: string };
                tenantId_receiptNumber?: { tenantId: string; receiptNumber: string };
              };
            }) => {
              return executeWithFaultCheck(() => {
                if (where.id) return bufferedReceipts.get(where.id) ?? null;
                if (where.tenantId_saleId) {
                  for (const r of bufferedReceipts.values()) {
                    if (
                      r.tenantId === where.tenantId_saleId.tenantId &&
                      r.saleId === where.tenantId_saleId.saleId
                    ) {
                      return { ...r };
                    }
                  }
                }
                if (where.tenantId_receiptNumber) {
                  for (const r of bufferedReceipts.values()) {
                    if (
                      r.tenantId === where.tenantId_receiptNumber.tenantId &&
                      r.receiptNumber === where.tenantId_receiptNumber.receiptNumber
                    ) {
                      return { ...r };
                    }
                  }
                }
                return null;
              });
            },
          ),
          findMany: jest.fn(
            async ({ where }: { where?: { saleId?: string; tenantId?: string } }) => {
              return executeWithFaultCheck(() => {
                return Array.from(bufferedReceipts.values()).filter((r) => {
                  if (where?.saleId && r.saleId !== where.saleId) return false;
                  if (where?.tenantId && r.tenantId !== where.tenantId) return false;
                  return true;
                });
              });
            },
          ),
          create: jest.fn(async ({ data }: { data: PrismaReceiptModel }) => {
            return executeWithFaultCheck(() => {
              // Foreign key validation: saleId must exist in sales
              if (!bufferedSales.has(data.saleId)) {
                throw createPgError(
                  'Foreign key constraint violation: sale_id does not exist',
                  '23503',
                  'fk_receipts_sale_id',
                  'receipts',
                );
              }
              // Unique constraint: unique_tenant_sale_receipt
              for (const r of bufferedReceipts.values()) {
                if (r.tenantId === data.tenantId && r.saleId === data.saleId) {
                  throw createPgError(
                    'Unique constraint violation: receipt already exists for this sale',
                    '23505',
                    'unique_tenant_sale_receipt',
                    'receipts',
                  );
                }
                if (r.tenantId === data.tenantId && r.receiptNumber === data.receiptNumber) {
                  throw createPgError(
                    'Unique constraint violation: receipt number already exists in tenant',
                    '23505',
                    'unique_tenant_receipt_number',
                    'receipts',
                  );
                }
              }
              const created = { ...data, createdAt: new Date(), updatedAt: new Date() };
              bufferedReceipts.set(data.id, created);
              return created;
            });
          }),
          updateMany: jest.fn(
            async ({
              where,
              data,
            }: {
              where: { id: string; version?: number };
              data: Partial<PrismaReceiptModel>;
            }) => {
              return executeWithFaultCheck(() => {
                const existing = bufferedReceipts.get(where.id);
                if (!existing) return { count: 0 };
                if (where.version !== undefined && existing.version !== where.version) {
                  return { count: 0 };
                }
                const updated = {
                  ...existing,
                  ...data,
                  version: existing.version + 1,
                  updatedAt: new Date(),
                };
                bufferedReceipts.set(where.id, updated);
                return { count: 1 };
              });
            },
          ),
        },
        receiptSequence: {
          upsert: jest.fn(
            async ({
              where,
              create,
              update,
            }: {
              where: { tenantId_year: { tenantId: string; year: number } };
              create: { tenantId: string; year: number; currentValue: number };
              update: { currentValue: { increment: number } };
            }) => {
              return executeWithFaultCheck(() => {
                const key = `${where.tenantId_year.tenantId}_${where.tenantId_year.year}`;
                const current = bufferedSequences.get(key);
                if (current !== undefined) {
                  const nextVal = current + (update.currentValue?.increment ?? 1);
                  bufferedSequences.set(key, nextVal);
                  return {
                    tenantId: where.tenantId_year.tenantId,
                    year: where.tenantId_year.year,
                    currentValue: nextVal,
                  };
                } else {
                  const initVal = create.currentValue ?? 1;
                  bufferedSequences.set(key, initVal);
                  return {
                    tenantId: where.tenantId_year.tenantId,
                    year: where.tenantId_year.year,
                    currentValue: initVal,
                  };
                }
              });
            },
          ),
        },
        $transaction: jest.fn(async (cb: (tx: unknown) => Promise<unknown>) => {
          // Inner transaction
          return cb({
            ...buildScopedMethods(
              bufferedSales,
              bufferedItems,
              bufferedPayments,
              bufferedReceipts,
              bufferedSequences,
            ),
          });
        }),
      };
    };

    const topLevelMethods = buildScopedMethods(
      this.sales,
      this.saleItems,
      this.payments,
      this.receipts,
      this.receiptSequences,
    );

    const client = {
      ...topLevelMethods,
      $transaction: jest.fn(async (cb: (tx: unknown) => Promise<unknown>) => {
        // Create transactional copy (staging buffer)
        const stageSales = new Map(this.sales);
        const stageItems = new Map(this.saleItems);
        const stagePayments = new Map(this.payments);
        const stageReceipts = new Map(this.receipts);
        const stageSequences = new Map(this.receiptSequences);

        const txScopedMethods = buildScopedMethods(
          stageSales,
          stageItems,
          stagePayments,
          stageReceipts,
          stageSequences,
        );

        const result = await cb(txScopedMethods);
        // Commit staged data to active database state on transaction success
        this.sales.clear();
        for (const [k, v] of stageSales.entries()) this.sales.set(k, v);
        this.saleItems.clear();
        for (const [k, v] of stageItems.entries()) this.saleItems.set(k, v);
        this.payments.clear();
        for (const [k, v] of stagePayments.entries()) this.payments.set(k, v);
        this.receipts.clear();
        for (const [k, v] of stageReceipts.entries()) this.receipts.set(k, v);
        this.receiptSequences.clear();
        for (const [k, v] of stageSequences.entries()) this.receiptSequences.set(k, v);
        return result;
      }),
    };

    return client as unknown as PrismaClient;
  }
}

describe('Phase 7 PostgreSQL Full-Graph Persistence & Relational Integration Specification', () => {
  const clock: Clock = new DeterministicClock(new Date('2026-10-03T12:00:00.000Z'));
  const tenantId = 'tenant_kinergy_wellness';
  const clientId = 'client_john_wick_007';

  let testDb: PostgreSqlPhase7TestDatabase;
  let prisma: PrismaClient;
  let saleRepo: PrismaSaleRepository;
  let paymentRepo: PrismaPaymentRepository;
  let receiptRepo: PrismaReceiptRepository;
  let sequenceGenerator: PrismaReceiptSequenceGenerator;

  const createSaleWithSource = (props: Partial<CreateSaleProps> = {}) => {
    return Sale.create(
      {
        id: SaleId.create(),
        tenantId,
        currency: 'USD',
        source: SaleSource.create(SaleSourceType.FOOD, 'default_food_item'),
        ...props,
      },
      clock,
    );
  };

  beforeEach(() => {
    testDb = new PostgreSqlPhase7TestDatabase();
    prisma = testDb.createClient();
    saleRepo = new PrismaSaleRepository(prisma);
    paymentRepo = new PrismaPaymentRepository(prisma);
    receiptRepo = new PrismaReceiptRepository(prisma);
    sequenceGenerator = new PrismaReceiptSequenceGenerator(prisma);
  });

  afterEach(() => {
    testDb.clear();
  });

  // ==========================================================================
  // 1. Complete Commercial Graph Persistence
  // ==========================================================================
  describe('1. Complete Commercial Graph Persistence (Sale ├── SaleItem ├── Discount ├── Payment └── Receipt)', () => {
    it('persists and reconciles the entire graph from Draft -> Items -> Discounts -> Settlement -> Receipt', async () => {
      // 1. Create Sale Aggregate Root with SaleSource
      const source = SaleSource.create(SaleSourceType.KINESIOLOGY_SESSION, 'sess_pt_99');
      const sale = createSaleWithSource({
        id: SaleId.create('sale_full_graph_01'),
        clientId,
        source,
      });

      // 2. Add line items with item-level fixed discount
      sale.addItem(
        {
          source: SaleSource.create(SaleSourceType.FOOD, 'protein_shake_vanilla'),
          description: 'Post-Workout Protein Shake',
          quantity: 2,
          unitPrice: Money.create(15.0, 'USD'),
          discount: Discount.fixed(2.0, 'Shake Special Coupon'),
        },
        clock,
      );

      // 3. Apply Order-level percentage discount
      sale.applyDiscount(Discount.percentage(10.0, 'VIP 10% Discount'), clock);

      // Financial Verification:
      // Subtotal = 2 * $15.00 = $30.00
      // Item discount = $2.00; Item Net = $28.00
      // Order discount = 10% of $28.00 = $2.80
      // Total Discount = $2.00 + $2.80 = $4.80
      // Total = $30.00 - $4.80 = $25.20
      expect(sale.subtotal.amount).toBe(30.0);
      expect(sale.discountTotal.amount).toBe(4.8);
      expect(sale.total.amount).toBe(25.2);

      // Persist Sale and SaleItems to PostgreSQL
      await saleRepo.save(sale);

      const dbSale = await prisma.sale.findUnique({
        where: { id: sale.id.value },
        include: { items: true },
      });
      expect(dbSale).not.toBeNull();
      expect(dbSale?.items).toHaveLength(1);
      expect(dbSale?.totalAmount).toEqual(new Prisma.Decimal('25.20'));
      expect(dbSale?.orderDiscountType).toBe('PERCENTAGE');
      expect(dbSale?.orderDiscountValue).toEqual(new Prisma.Decimal('10.00'));

      // 4. Finalize Sale (DRAFT -> PENDING_PAYMENT)
      sale.finalize(clock);
      await saleRepo.save(sale);

      // 5. Create and Settle Payment Aggregate Root
      const payment = Payment.createPending(
        {
          id: PaymentId.create('pay_full_graph_01'),
          tenantId,
          saleId: sale.id,
          method: PaymentMethod.QR,
          amount: sale.total,
          reference: 'QR_TRANS_998877',
        },
        clock,
      );
      await paymentRepo.save(payment);
      payment.complete(clock);
      await paymentRepo.save(payment);

      // Transition Sale to PAID
      sale.markPaid(clock);
      await saleRepo.save(sale);

      // 6. Generate Fiscal Monotonic Sequence & Issue Receipt
      const receiptNumberVo = await sequenceGenerator.getNextReceiptNumber(tenantId, 2026);
      const receiptNumber = receiptNumberVo.value;
      expect(receiptNumber).toMatch(/^REC-2026-\d{4,}$/);

      const receipt = Receipt.create(
        {
          id: ReceiptId.create('rec_full_graph_01'),
          tenantId,
          saleId: sale.id,
          saleReference: sale.id.value,
          receiptNumber: receiptNumberVo,
          clientSnapshot: ReceiptClientSnapshot.create({
            clientId,
            fullName: 'John Wick',
          }),
          items: [
            ReceiptItemSnapshot.create({
              itemId: 'item_shake_01',
              sourceType: 'FOOD',
              sourceId: 'protein_shake_vanilla',
              description: 'Post-Workout Protein Shake',
              quantity: 2,
              unitPrice: Money.create(15.0, 'USD'),
              discountTotal: Money.create(4.0, 'USD'),
              subtotal: Money.create(30.0, 'USD'),
              total: Money.create(26.0, 'USD'),
            }),
          ],
          payments: [
            ReceiptPaymentSnapshot.create({
              paymentId: payment.id.value,
              method: PaymentMethod.QR,
              status: PaymentStatus.COMPLETED,
              amount: payment.amount,
              paidAt: payment.paidAt!,
            }),
          ],
          subtotal: sale.subtotal,
          discountTotal: sale.discountTotal,
          total: sale.total,
        },
        clock,
      );
      await receiptRepo.save(receipt);

      // 7. Verify all 5 interconnected entities exist simultaneously in database
      const finalSale = await prisma.sale.findUnique({ where: { id: sale.id.value } });
      const finalItems = await prisma.saleItem.findMany({ where: { saleId: sale.id.value } });
      const finalPayments = await prisma.payment.findMany({ where: { saleId: sale.id.value } });
      const finalReceipts = await prisma.receipt.findMany({ where: { saleId: sale.id.value } });

      expect(finalSale?.status).toBe('PAID');
      expect(finalItems).toHaveLength(1);
      expect(finalPayments).toHaveLength(1);
      expect(finalReceipts).toHaveLength(1);
      expect(finalReceipts[0]?.receiptNumber).toBe(receiptNumber);
    });
  });

  // ==========================================================================
  // 2. Sale Aggregate Persistence
  // ==========================================================================
  describe('2. Sale Aggregate Persistence', () => {
    it('supports creation, retrieval, and updating through valid domain methods', async () => {
      const sale = createSaleWithSource({
        id: SaleId.create('sale_lifecycle_01'),
        clientId: 'client_registered_101',
        source: SaleSource.create(SaleSourceType.GYM_MEMBERSHIP, 'plan_monthly_pro'),
      });

      // Create
      await saleRepo.save(sale);

      // Retrieve
      const loaded = await saleRepo.findById(sale.id);
      expect(loaded).not.toBeNull();
      expect(loaded?.id.value).toBe(sale.id.value);
      expect(loaded?.status).toBe(SaleStatus.DRAFT);
      expect(loaded?.currency).toBe('USD');
      expect(loaded?.clientId).toBe('client_registered_101');
      const loadedSource = loaded?.source as SaleSource;
      expect(loadedSource.type).toBe(SaleSourceType.GYM_MEMBERSHIP);
      expect(loadedSource.referenceId).toBe('plan_monthly_pro');

      // Update through valid aggregate operation
      loaded!.addItem(
        {
          source: SaleSource.create(SaleSourceType.GYM_MEMBERSHIP, 'plan_monthly_pro'),
          description: 'Pro Gym Membership (1 Month)',
          quantity: 1,
          unitPrice: Money.create(89.99, 'USD'),
        },
        clock,
      );
      loaded!.finalize(clock);
      await saleRepo.save(loaded!);

      const updated = await saleRepo.findById(sale.id);
      expect(updated?.status).toBe(SaleStatus.PENDING_PAYMENT);
      expect(updated?.total.amount).toBe(89.99);
      expect(updated?.version).toBe(2);
    });

    it('prohibits invalid direct state tampering in persistence', async () => {
      const sale = createSaleWithSource({ id: SaleId.create('sale_tamper_01') });
      await saleRepo.save(sale);

      // Cannot save an already CANCELLED sale if cancelled elsewhere
      await prisma.sale.updateMany({
        where: { id: sale.id.value },
        data: { status: 'CANCELLED' },
      });

      sale.cancel('Customer changed mind', clock);
      await expect(saleRepo.save(sale)).rejects.toThrow(InvalidSaleStateException);
    });

    it('natively supports anonymous / walk-in clients with undefined clientId', async () => {
      const walkInSale = createSaleWithSource({
        id: SaleId.create('sale_walk_in_01'),
        clientId: undefined,
        currency: 'CLP',
        source: SaleSource.create(SaleSourceType.FOOD, 'snack_protein_01'),
      });
      walkInSale.addItem(
        {
          source: SaleSource.create(SaleSourceType.FOOD, 'snack_protein_01'),
          description: 'Protein Bar',
          quantity: 1,
          unitPrice: Money.create(1500, 'CLP'),
        },
        clock,
      );

      await saleRepo.save(walkInSale);

      const dbRow = await prisma.sale.findUnique({ where: { id: walkInSale.id.value } });
      expect(dbRow?.clientId).toBeNull();
      expect(dbRow?.currency).toBe('CLP');

      const rehydrated = await saleRepo.findById(walkInSale.id);
      expect(rehydrated?.clientId).toBeUndefined();
      expect(rehydrated?.currency).toBe('CLP');
    });
  });

  // ==========================================================================
  // 3. SaleItem Subordinate Persistence
  // ==========================================================================
  describe('3. SaleItem Subordinate Persistence', () => {
    it('enforces strict ownership and prevents cross-sale attachment', async () => {
      const saleA = createSaleWithSource({ id: SaleId.create('sale_owner_A') });
      const saleB = createSaleWithSource({ id: SaleId.create('sale_owner_B') });
      await saleRepo.save(saleA);
      await saleRepo.save(saleB);

      const itemBelongingToA = SaleItem.create({
        saleId: saleA.id,
        description: 'Exclusive Item',
        quantity: 1,
        unitPrice: Money.create(25.0, 'USD'),
        source: SaleSource.create(SaleSourceType.DRINK, 'isotonic_drink'),
      });

      // Attempting to persist item under Sale B must be rejected
      expect(() => PrismaSaleItemMapper.toPersistence(itemBelongingToA, saleB.id.value)).toThrow(
        expect.objectContaining({ code: 'CROSS_SALE_PERSISTENCE_PROHIBITED' }),
      );
    });

    it('performs differential updates: adds, updates, and deletes removed items', async () => {
      const sale = createSaleWithSource({ id: SaleId.create('sale_diff_01') });
      const item1 = sale.addItem(
        {
          source: SaleSource.create(SaleSourceType.FOOD, 'item_1'),
          description: 'First Item',
          quantity: 1,
          unitPrice: Money.create(10.0, 'USD'),
        },
        clock,
      );
      const item2 = sale.addItem(
        {
          source: SaleSource.create(SaleSourceType.FOOD, 'item_2'),
          description: 'Second Item',
          quantity: 2,
          unitPrice: Money.create(20.0, 'USD'),
        },
        clock,
      );
      await saleRepo.save(sale);

      let itemsInDb = await prisma.saleItem.findMany({ where: { saleId: sale.id.value } });
      expect(itemsInDb).toHaveLength(2);

      // Remove item1 through valid aggregate method
      sale.removeItem(item1.id, clock);
      await saleRepo.save(sale);

      itemsInDb = await prisma.saleItem.findMany({ where: { saleId: sale.id.value } });
      expect(itemsInDb).toHaveLength(1);
      expect(itemsInDb[0]?.id).toBe(item2.id.value);
    });

    it('preserves fractional quantity precision DECIMAL(10, 3)', async () => {
      const sale = createSaleWithSource({ id: SaleId.create('sale_fractional_qty') });
      sale.addItem(
        {
          source: SaleSource.create(SaleSourceType.KINESIOLOGY_SESSION, 'sess_fractional'),
          description: 'Physical Therapy (1.750 Hours)',
          quantity: 1.75,
          unitPrice: Money.create(80.0, 'USD'),
        },
        clock,
      );
      await saleRepo.save(sale);

      const itemsInDb = await prisma.saleItem.findMany({ where: { saleId: sale.id.value } });
      expect(itemsInDb[0]?.quantity).toEqual(new Prisma.Decimal('1.750'));

      const loaded = await saleRepo.findById(sale.id);
      expect(loaded?.items[0]?.quantity).toBe(1.75);
    });
  });

  // ==========================================================================
  // 4. Discount Embedded Value Object
  // ==========================================================================
  describe('4. Discount Embedded Value Object', () => {
    it('persists order-level FIXED_AMOUNT discount flattened on sales table', async () => {
      const sale = createSaleWithSource({ id: SaleId.create('sale_disc_fixed') });
      sale.addItem(
        {
          source: SaleSource.create(SaleSourceType.FOOD, 'snack_01'),
          description: 'Snack Pack',
          quantity: 2,
          unitPrice: Money.create(15.0, 'USD'),
        },
        clock,
      );
      sale.applyDiscount(Discount.fixed(5.0, 'Flat $5 Promotion'), clock);

      await saleRepo.save(sale);

      const dbSale = await prisma.sale.findUnique({ where: { id: sale.id.value } });
      expect(dbSale?.orderDiscountType).toBe('FIXED');
      expect(dbSale?.orderDiscountValue).toEqual(new Prisma.Decimal('5.00'));
      expect(dbSale?.discountTotalAmount).toEqual(new Prisma.Decimal('5.00'));
      expect(dbSale?.totalAmount).toEqual(new Prisma.Decimal('25.00'));
    });

    it('persists item-level PERCENTAGE discount flattened on sale_items table', async () => {
      const sale = createSaleWithSource({ id: SaleId.create('sale_disc_item') });
      sale.addItem(
        {
          source: SaleSource.create(SaleSourceType.FOOD, 'snack_02'),
          description: 'Special Drink',
          quantity: 4,
          unitPrice: Money.create(10.0, 'USD'),
          discount: Discount.percentage(25.0, '25% Off Summer Deal'),
        },
        clock,
      );

      await saleRepo.save(sale);

      const dbItems = await prisma.saleItem.findMany({ where: { saleId: sale.id.value } });
      expect(dbItems[0]?.discountType).toBe('PERCENTAGE');
      expect(dbItems[0]?.discountValue).toEqual(new Prisma.Decimal('25.00'));
      expect(dbItems[0]?.discountTotalAmount).toEqual(new Prisma.Decimal('10.00'));
      expect(dbItems[0]?.totalAmount).toEqual(new Prisma.Decimal('30.00'));
    });
  });

  // ==========================================================================
  // 5. Payment Autonomous Aggregate
  // ==========================================================================
  describe('5. Payment Autonomous Aggregate', () => {
    it('persists tender records across CASH and QR methods and transitions', async () => {
      const sale = createSaleWithSource({ id: SaleId.create('sale_pay_01') });
      sale.addItem(
        {
          source: SaleSource.create(SaleSourceType.FOOD, 'item_01'),
          description: 'Item',
          quantity: 1,
          unitPrice: Money.create(50.0, 'USD'),
        },
        clock,
      );
      await saleRepo.save(sale);

      const payment = Payment.createPending(
        {
          id: PaymentId.create('pay_cash_01'),
          tenantId,
          saleId: sale.id,
          method: PaymentMethod.CASH,
          amount: Money.create(50.0, 'USD'),
          reference: 'POS_CASH_DRAWER_1',
        },
        clock,
      );

      await paymentRepo.save(payment);

      let dbPayment = await prisma.payment.findUnique({ where: { id: payment.id.value } });
      expect(dbPayment?.status).toBe('PENDING');
      expect(dbPayment?.paidAt).toBeNull();
      expect(dbPayment?.method).toBe('CASH');

      // Complete payment
      payment.complete(clock);
      await paymentRepo.save(payment);

      dbPayment = await prisma.payment.findUnique({ where: { id: payment.id.value } });
      expect(dbPayment?.status).toBe('SETTLED');
      expect(dbPayment?.paidAt).toEqual(clock.now());
      expect(dbPayment?.version).toBe(2);
    });

    it('enforces optimistic concurrency control on Payment updates', async () => {
      const sale = createSaleWithSource({ id: SaleId.create('sale_pay_occ') });
      sale.addItem(
        {
          source: SaleSource.create(SaleSourceType.FOOD, 'item_occ'),
          description: 'Item',
          quantity: 1,
          unitPrice: Money.create(20.0, 'USD'),
        },
        clock,
      );
      await saleRepo.save(sale);

      const payment = Payment.createPending(
        {
          id: PaymentId.create('pay_occ_01'),
          tenantId,
          saleId: sale.id,
          method: PaymentMethod.QR,
          amount: Money.create(20.0, 'USD'),
        },
        clock,
      );
      await paymentRepo.save(payment);

      // Concurrent racer updates version in DB
      await prisma.payment.updateMany({
        where: { id: payment.id.value },
        data: { status: 'CANCELLED' },
      });

      // Saving stale instance must throw optimistic lock exception
      payment.complete(clock);
      await expect(paymentRepo.save(payment)).rejects.toThrow(SaleOptimisticLockException);
    });
  });

  // ==========================================================================
  // 6. Receipt Fiscal Document Subdomain
  // ==========================================================================
  describe('6. Receipt Fiscal Document Subdomain', () => {
    it('persists point-in-time JSON snapshots isolating receipt from future price/client changes', async () => {
      const sale = createSaleWithSource({
        id: SaleId.create('sale_snap_01'),
        clientId: 'client_orig',
      });
      sale.addItem(
        {
          source: SaleSource.create(SaleSourceType.FOOD, 'item_snap'),
          description: 'Catalog Item $100',
          quantity: 1,
          unitPrice: Money.create(100.0, 'USD'),
        },
        clock,
      );
      await saleRepo.save(sale);

      const receipt = Receipt.create(
        {
          id: ReceiptId.create('rec_snap_01'),
          tenantId,
          saleId: sale.id,
          saleReference: sale.id.value,
          receiptNumber: ReceiptNumber.create('REC-2026-0001'),
          clientSnapshot: ReceiptClientSnapshot.create({
            clientId: 'client_orig',
            fullName: 'Original Client Name',
          }),
          items: [
            ReceiptItemSnapshot.create({
              itemId: 'item_snap_01',
              sourceType: 'FOOD',
              sourceId: 'item_snap',
              description: 'Catalog Item $100',
              quantity: 1,
              unitPrice: Money.create(100.0, 'USD'),
              subtotal: Money.create(100.0, 'USD'),
              total: Money.create(100.0, 'USD'),
            }),
          ],
          payments: [
            ReceiptPaymentSnapshot.create({
              paymentId: 'pay_orig_1',
              method: PaymentMethod.CASH,
              status: PaymentStatus.COMPLETED,
              amount: Money.create(100.0, 'USD'),
              paidAt: clock.now(),
            }),
          ],
          subtotal: Money.create(100.0, 'USD'),
          total: Money.create(100.0, 'USD'),
        },
        clock,
      );
      await receiptRepo.save(receipt);

      const loaded = await receiptRepo.findById(receipt.id);
      expect(loaded).not.toBeNull();
      expect(loaded?.clientSnapshot?.fullName).toBe('Original Client Name');
      expect(loaded?.items[0]?.description).toBe('Catalog Item $100');
      expect(loaded?.items[0]?.total.amount).toBe(100.0);
    });

    it('enforces @@unique([tenantId, saleId]) preventing duplicate receipt issuance for same sale', async () => {
      const sale = createSaleWithSource({ id: SaleId.create('sale_dup_rec') });
      sale.addItem(
        {
          source: SaleSource.create(SaleSourceType.FOOD, 'item_dup'),
          description: 'Item',
          quantity: 1,
          unitPrice: Money.create(10.0, 'USD'),
        },
        clock,
      );
      await saleRepo.save(sale);

      const receipt1 = Receipt.create(
        {
          id: ReceiptId.create('rec_first_01'),
          tenantId,
          saleId: sale.id,
          saleReference: sale.id.value,
          receiptNumber: ReceiptNumber.create('REC-2026-0002'),
          items: [
            ReceiptItemSnapshot.create({
              itemId: 'item_dup_01',
              sourceType: 'FOOD',
              sourceId: 'item_dup',
              description: 'Item',
              quantity: 1,
              unitPrice: Money.create(10.0, 'USD'),
              subtotal: Money.create(10.0, 'USD'),
              total: Money.create(10.0, 'USD'),
            }),
          ],
          payments: [
            ReceiptPaymentSnapshot.create({
              paymentId: 'p1',
              method: PaymentMethod.CASH,
              status: PaymentStatus.COMPLETED,
              amount: Money.create(10.0, 'USD'),
              paidAt: clock.now(),
            }),
          ],
          subtotal: Money.create(10.0, 'USD'),
          total: Money.create(10.0, 'USD'),
        },
        clock,
      );
      await receiptRepo.save(receipt1);

      const duplicateReceipt = Receipt.create(
        {
          id: ReceiptId.create('rec_second_02'),
          tenantId,
          saleId: sale.id, // Same sale!
          saleReference: sale.id.value,
          receiptNumber: ReceiptNumber.create('REC-2026-0003'),
          items: [
            ReceiptItemSnapshot.create({
              itemId: 'item_dup_01',
              sourceType: 'FOOD',
              sourceId: 'item_dup',
              description: 'Item',
              quantity: 1,
              unitPrice: Money.create(10.0, 'USD'),
              subtotal: Money.create(10.0, 'USD'),
              total: Money.create(10.0, 'USD'),
            }),
          ],
          payments: [
            ReceiptPaymentSnapshot.create({
              paymentId: 'p2',
              method: PaymentMethod.CASH,
              status: PaymentStatus.COMPLETED,
              amount: Money.create(10.0, 'USD'),
              paidAt: clock.now(),
            }),
          ],
          subtotal: Money.create(10.0, 'USD'),
          total: Money.create(10.0, 'USD'),
        },
        clock,
      );

      await expect(receiptRepo.save(duplicateReceipt)).rejects.toThrow(DuplicateReceiptException);
    });
  });

  // ==========================================================================
  // 7. SaleSource Provenance
  // ==========================================================================
  describe('7. SaleSource Provenance', () => {
    it('supports all 5 domain provenance types across sales and line items', async () => {
      const types = [
        SaleSourceType.KINESIOLOGY_SESSION,
        SaleSourceType.GYM_MEMBERSHIP,
        SaleSourceType.FOOD,
        SaleSourceType.DRINK,
        SaleSourceType.ROOM_RENTAL,
      ];

      for (let idx = 0; idx < types.length; idx++) {
        const type = types[idx]!;
        const sale = createSaleWithSource({
          id: SaleId.create(`sale_source_${idx}`),
          source: SaleSource.create(type, `ref_${idx}`),
        });
        sale.addItem(
          {
            source: SaleSource.create(type, `item_ref_${idx}`),
            description: `Item of type ${type}`,
            quantity: 1,
            unitPrice: Money.create(10.0, 'USD'),
          },
          clock,
        );
        await saleRepo.save(sale);

        const loaded = await saleRepo.findById(sale.id);
        const saleSource = loaded?.source as SaleSource;
        expect(saleSource.type).toBe(type);
        expect(saleSource.referenceId).toBe(`ref_${idx}`);
        const itemSource = loaded?.items[0]?.source as SaleSource;
        expect(itemSource.type).toBe(type);
      }
    });

    it('permits non-unique source references (enabling repeat consumable retail sales)', async () => {
      const sharedSource = SaleSource.create(SaleSourceType.DRINK, 'sku_energy_drink_1');

      const sale1 = createSaleWithSource({
        id: SaleId.create('sale_drink_01'),
        source: sharedSource,
      });
      sale1.addItem(
        {
          source: sharedSource,
          description: 'Energy Drink',
          quantity: 1,
          unitPrice: Money.create(3.5, 'USD'),
        },
        clock,
      );
      await saleRepo.save(sale1);

      const sale2 = createSaleWithSource({
        id: SaleId.create('sale_drink_02'),
        source: sharedSource,
      });
      sale2.addItem(
        {
          source: sharedSource,
          description: 'Energy Drink',
          quantity: 1,
          unitPrice: Money.create(3.5, 'USD'),
        },
        clock,
      );

      // Must succeed without unique constraint collision
      await expect(saleRepo.save(sale2)).resolves.not.toThrow();
    });
  });

  // ==========================================================================
  // 8. Referential Integrity
  // ==========================================================================
  describe('8. Referential Integrity Constraints', () => {
    it('rejects inserting SaleItem pointing to a nonexistent Sale (foreign key violation)', async () => {
      await expect(
        prisma.saleItem.upsert({
          where: { id: 'item_orphan_01' },
          create: {
            id: 'item_orphan_01',
            saleId: 'nonexistent_sale_999',
            description: 'Orphan Item',
            quantity: new Prisma.Decimal('1'),
            unitPriceAmount: new Prisma.Decimal('10.00'),
            subtotalAmount: new Prisma.Decimal('10.00'),
            discountTotalAmount: new Prisma.Decimal('0.00'),
            totalAmount: new Prisma.Decimal('10.00'),
            createdAt: new Date(),
            updatedAt: new Date(),
          } as PrismaSaleItemModel,
          update: {} as PrismaSaleItemModel,
        }),
      ).rejects.toThrow(expect.objectContaining({ code: '23503' }));
    });

    it('rejects inserting Payment pointing to a nonexistent Sale (foreign key violation)', async () => {
      await expect(
        prisma.payment.upsert({
          where: { id: 'pay_orphan_01' },
          create: {
            id: 'pay_orphan_01',
            tenantId,
            saleId: 'nonexistent_sale_999',
            method: 'CASH',
            amount: new Prisma.Decimal('50.00'),
            currency: 'USD',
            status: 'SETTLED',
            reference: null,
            paidAt: new Date(),
            createdAt: new Date(),
            updatedAt: new Date(),
            version: 1,
          } as PrismaPaymentModel,
          update: {} as PrismaPaymentModel,
        }),
      ).rejects.toThrow(expect.objectContaining({ code: '23503' }));
    });

    it('rejects inserting Receipt pointing to a nonexistent Sale (foreign key violation)', async () => {
      await expect(
        prisma.receipt.create({
          data: {
            id: 'rec_orphan_01',
            tenantId,
            saleId: 'nonexistent_sale_999',
            saleReference: 'REF-999',
            receiptNumber: 'REC-2026-9999',
            currency: 'USD',
            status: 'ISSUED',
            itemsSnapshot: [],
            paymentsSnapshot: [],
            subtotalAmount: new Prisma.Decimal('10.00'),
            discountTotalAmount: new Prisma.Decimal('0.00'),
            totalAmount: new Prisma.Decimal('10.00'),
            reprintCount: 0,
            lastReprintedAt: null,
            issuedAt: new Date(),
            createdAt: new Date(),
            updatedAt: new Date(),
            version: 1,
          } as unknown as Prisma.ReceiptCreateInput,
        }),
      ).rejects.toThrow(expect.objectContaining({ code: '23503' }));
    });

    it('rejects deleting a Sale that has linked Payments (onDelete: Restrict)', async () => {
      const sale = createSaleWithSource({ id: SaleId.create('sale_del_pay') });
      sale.addItem(
        {
          source: SaleSource.create(SaleSourceType.FOOD, 'item_del'),
          description: 'Item',
          quantity: 1,
          unitPrice: Money.create(20.0, 'USD'),
        },
        clock,
      );
      await saleRepo.save(sale);

      const payment = Payment.createPending(
        {
          id: PaymentId.create('pay_del_01'),
          tenantId,
          saleId: sale.id,
          method: PaymentMethod.CASH,
          amount: Money.create(20.0, 'USD'),
        },
        clock,
      );
      await paymentRepo.save(payment);

      await expect(prisma.sale.delete({ where: { id: sale.id.value } })).rejects.toThrow(
        expect.objectContaining({ code: '23503' }),
      );
    });

    it('rejects deleting a Sale that has linked Receipts (onDelete: Restrict)', async () => {
      const sale = createSaleWithSource({ id: SaleId.create('sale_del_rec') });
      sale.addItem(
        {
          source: SaleSource.create(SaleSourceType.FOOD, 'item_del_rec'),
          description: 'Item',
          quantity: 1,
          unitPrice: Money.create(30.0, 'USD'),
        },
        clock,
      );
      await saleRepo.save(sale);

      const receipt = Receipt.create(
        {
          id: ReceiptId.create('rec_del_01'),
          tenantId,
          saleId: sale.id,
          saleReference: sale.id.value,
          receiptNumber: ReceiptNumber.create('REC-2026-0099'),
          items: [
            ReceiptItemSnapshot.create({
              itemId: 'item_del_01',
              sourceType: 'FOOD',
              sourceId: 'item_del_rec',
              description: 'Item',
              quantity: 1,
              unitPrice: Money.create(30.0, 'USD'),
              subtotal: Money.create(30.0, 'USD'),
              total: Money.create(30.0, 'USD'),
            }),
          ],
          payments: [
            ReceiptPaymentSnapshot.create({
              paymentId: 'p_del',
              method: PaymentMethod.CASH,
              status: PaymentStatus.COMPLETED,
              amount: Money.create(30.0, 'USD'),
              paidAt: clock.now(),
            }),
          ],
          subtotal: Money.create(30.0, 'USD'),
          total: Money.create(30.0, 'USD'),
        },
        clock,
      );
      await receiptRepo.save(receipt);

      await expect(prisma.sale.delete({ where: { id: sale.id.value } })).rejects.toThrow(
        expect.objectContaining({ code: '23503' }),
      );
    });

    it('cascades deletion of subordinate SaleItems when an uncommitted draft Sale is deleted', async () => {
      const sale = createSaleWithSource({ id: SaleId.create('sale_cascade_draft') });
      sale.addItem(
        {
          source: SaleSource.create(SaleSourceType.FOOD, 'item_casc'),
          description: 'Item',
          quantity: 1,
          unitPrice: Money.create(10.0, 'USD'),
        },
        clock,
      );
      await saleRepo.save(sale);

      let items = await prisma.saleItem.findMany({ where: { saleId: sale.id.value } });
      expect(items).toHaveLength(1);

      await prisma.sale.delete({ where: { id: sale.id.value } });

      items = await prisma.saleItem.findMany({ where: { saleId: sale.id.value } });
      expect(items).toHaveLength(0);
    });
  });

  // ==========================================================================
  // 9. Financial Database Constraints
  // ==========================================================================
  describe('9. Financial Check Constraints (SQLSTATE 23514)', () => {
    it('rejects negative monetary amounts on Sale records', async () => {
      await expect(
        prisma.sale.upsert({
          where: { id: 'sale_neg_subtotal' },
          create: {
            id: 'sale_neg_subtotal',
            tenantId,
            currency: 'USD',
            status: 'DRAFT',
            subtotalAmount: new Prisma.Decimal('-10.00'), // Violation!
            discountTotalAmount: new Prisma.Decimal('0.00'),
            totalAmount: new Prisma.Decimal('0.00'),
            createdAt: new Date(),
            updatedAt: new Date(),
            version: 1,
          } as PrismaSaleModel,
          update: {} as PrismaSaleModel,
        }),
      ).rejects.toThrow(
        expect.objectContaining({ code: '23514', constraint: 'chk_sales_non_negative_subtotal' }),
      );
    });

    it('rejects zero or negative payment tender amounts (chk_payments_positive_amount)', async () => {
      const sale = createSaleWithSource({ id: SaleId.create('sale_pay_chk') });
      await saleRepo.save(sale);

      await expect(
        prisma.payment.upsert({
          where: { id: 'pay_zero_amount' },
          create: {
            id: 'pay_zero_amount',
            tenantId,
            saleId: sale.id.value,
            method: 'CASH',
            amount: new Prisma.Decimal('0.00'), // Violation! Must be > 0.00
            currency: 'USD',
            status: 'PENDING',
            reference: null,
            paidAt: null,
            createdAt: new Date(),
            updatedAt: new Date(),
            version: 1,
          } as PrismaPaymentModel,
          update: {} as PrismaPaymentModel,
        }),
      ).rejects.toThrow(
        expect.objectContaining({ code: '23514', constraint: 'chk_payments_positive_amount' }),
      );
    });

    it('rejects zero or negative line item quantity (chk_sale_items_positive_quantity)', async () => {
      const sale = createSaleWithSource({ id: SaleId.create('sale_qty_chk') });
      await saleRepo.save(sale);

      await expect(
        prisma.saleItem.upsert({
          where: { id: 'item_zero_qty' },
          create: {
            id: 'item_zero_qty',
            saleId: sale.id.value,
            description: 'Zero Qty Item',
            quantity: new Prisma.Decimal('0.000'), // Violation!
            unitPriceAmount: new Prisma.Decimal('10.00'),
            subtotalAmount: new Prisma.Decimal('0.00'),
            discountTotalAmount: new Prisma.Decimal('0.00'),
            totalAmount: new Prisma.Decimal('0.00'),
            createdAt: new Date(),
            updatedAt: new Date(),
          } as PrismaSaleItemModel,
          update: {} as PrismaSaleItemModel,
        }),
      ).rejects.toThrow(
        expect.objectContaining({ code: '23514', constraint: 'chk_sale_items_positive_quantity' }),
      );
    });

    it('rejects percentage discount values greater than 100%', async () => {
      await expect(
        prisma.sale.upsert({
          where: { id: 'sale_excessive_disc' },
          create: {
            id: 'sale_excessive_disc',
            tenantId,
            currency: 'USD',
            status: 'DRAFT',
            subtotalAmount: new Prisma.Decimal('100.00'),
            discountTotalAmount: new Prisma.Decimal('110.00'),
            totalAmount: new Prisma.Decimal('0.00'),
            orderDiscountType: 'PERCENTAGE',
            orderDiscountValue: new Prisma.Decimal('110.00'), // Violation! > 100%
            createdAt: new Date(),
            updatedAt: new Date(),
            version: 1,
          } as PrismaSaleModel,
          update: {} as PrismaSaleModel,
        }),
      ).rejects.toThrow(
        expect.objectContaining({
          code: '23514',
          constraint: 'chk_sales_valid_percentage_discount',
        }),
      );
    });
  });

  // ==========================================================================
  // 10. Concurrency & Idempotency
  // ==========================================================================
  describe('10. Concurrency & Idempotency Guarantees', () => {
    it('guarantees gapless monotonic fiscal receipt numbering under concurrent requests', async () => {
      const year = 2026;
      const sequenceNumbers = await Promise.all([
        sequenceGenerator.getNextReceiptNumber(tenantId, year),
        sequenceGenerator.getNextReceiptNumber(tenantId, year),
        sequenceGenerator.getNextReceiptNumber(tenantId, year),
      ]);

      const values = sequenceNumbers.map((s) => s.value);
      expect(values).toHaveLength(3);
      expect(new Set(values).size).toBe(3); // All unique
      expect(values).toContain('REC-2026-000001');
      expect(values).toContain('REC-2026-000002');
      expect(values).toContain('REC-2026-000003');
    });

    it('handles idempotent receipt retrieval when client retries issuance after race', async () => {
      const sale = createSaleWithSource({ id: SaleId.create('sale_idemp_rec') });
      sale.addItem(
        {
          source: SaleSource.create(SaleSourceType.FOOD, 'item_idemp'),
          description: 'Item',
          quantity: 1,
          unitPrice: Money.create(25.0, 'USD'),
        },
        clock,
      );
      await saleRepo.save(sale);

      const existingReceipt = Receipt.create(
        {
          id: ReceiptId.create('rec_idemp_orig'),
          tenantId,
          saleId: sale.id,
          saleReference: sale.id.value,
          receiptNumber: ReceiptNumber.create('REC-2026-0088'),
          items: [
            ReceiptItemSnapshot.create({
              itemId: 'item_idemp_01',
              sourceType: 'FOOD',
              sourceId: 'item_idemp',
              description: 'Item',
              quantity: 1,
              unitPrice: Money.create(25.0, 'USD'),
              subtotal: Money.create(25.0, 'USD'),
              total: Money.create(25.0, 'USD'),
            }),
          ],
          payments: [
            ReceiptPaymentSnapshot.create({
              paymentId: 'p_idemp',
              method: PaymentMethod.CASH,
              status: PaymentStatus.COMPLETED,
              amount: Money.create(25.0, 'USD'),
              paidAt: clock.now(),
            }),
          ],
          subtotal: Money.create(25.0, 'USD'),
          total: Money.create(25.0, 'USD'),
        },
        clock,
      );
      await receiptRepo.save(existingReceipt);

      // Idempotent findBySaleId returns existing receipt without collision
      const retrieved = await receiptRepo.findBySaleId(sale.id);
      expect(retrieved).not.toBeNull();
      expect(retrieved?.id.value).toBe(existingReceipt.id.value);
      expect(retrieved?.receiptNumber.value).toBe('REC-2026-0088');
    });
  });

  // ==========================================================================
  // 11. Transactional Atomicity & Rollback
  // ==========================================================================
  describe('11. Transactional Atomicity & Rollback', () => {
    it('rolls back both Sale and SaleItems if an error occurs during item persistence', async () => {
      const sale = createSaleWithSource({ id: SaleId.create('sale_atomic_fail') });
      sale.addItem(
        {
          source: SaleSource.create(SaleSourceType.FOOD, 'item_atomic_1'),
          description: 'Valid Item 1',
          quantity: 1,
          unitPrice: Money.create(10.0, 'USD'),
        },
        clock,
      );
      sale.addItem(
        {
          source: SaleSource.create(SaleSourceType.FOOD, 'item_atomic_2'),
          description: 'Fault Injection Item 2',
          quantity: 1,
          unitPrice: Money.create(20.0, 'USD'),
        },
        clock,
      );

      // Inject fault on the second item upsert
      testDb.failNextOperationWith = createPgError('Disk write error / trigger failure', 'XX000');

      await expect(saleRepo.save(sale)).rejects.toThrow('Disk write error / trigger failure');

      // Verify that neither Sale nor SaleItem was committed
      const persistedSale = await prisma.sale.findUnique({ where: { id: sale.id.value } });
      const persistedItems = await prisma.saleItem.findMany({ where: { saleId: sale.id.value } });

      expect(persistedSale).toBeNull();
      expect(persistedItems).toHaveLength(0);
    });

    it('rolls back Payment persistence if coordinated Sale state transition fails', async () => {
      const sale = createSaleWithSource({ id: SaleId.create('sale_coord_fail') });
      sale.addItem(
        {
          source: SaleSource.create(SaleSourceType.FOOD, 'item_cf'),
          description: 'Item',
          quantity: 1,
          unitPrice: Money.create(40.0, 'USD'),
        },
        clock,
      );
      await saleRepo.save(sale);

      const payment = Payment.createPending(
        {
          id: PaymentId.create('pay_coord_fail'),
          tenantId,
          saleId: sale.id,
          method: PaymentMethod.CASH,
          amount: Money.create(40.0, 'USD'),
        },
        clock,
      );
      await paymentRepo.save(payment);

      // Emulate coordinated transaction: update payment to settled, then fail on sale update
      await expect(
        prisma.$transaction(async (tx) => {
          const txRepo = new PrismaPaymentRepository(tx as unknown as PrismaClient);
          payment.complete(clock);
          await txRepo.save(payment);

          // Force failure during coordinated sale transition
          throw createPgError('Deadlock / Optimistic lock failure on sale update', '40P01');
        }),
      ).rejects.toThrow('Deadlock / Optimistic lock failure on sale update');

      // Verify payment was rolled back and remained PENDING in PostgreSQL (not SETTLED)
      const persistedPayment = await prisma.payment.findUnique({ where: { id: payment.id.value } });
      expect(persistedPayment).not.toBeNull();
      expect(persistedPayment?.status).toBe('PENDING');
      expect(persistedPayment?.version).toBe(1);
    });
  });
});
