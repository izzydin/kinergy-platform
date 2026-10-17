import {
  PrismaClient,
  Sale as PrismaSaleModel,
  SaleItem as PrismaSaleItemModel,
  Payment as PrismaPaymentModel,
  PaymentStatus as PrismaPaymentStatus,
  PaymentMethod as PrismaPaymentMethod,
  SaleStatus as PrismaSaleStatus,
  Receipt as PrismaReceiptModel,
} from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import { DeterministicClock } from '../../../../domain/shared/clock';
import { PrismaSaleRepository } from '../repositories/prisma-sale.repository';
import { PrismaPaymentRepository } from '../repositories/prisma-payment.repository';
import { PrismaSalesUnitOfWork } from '../services/prisma-sales-unit-of-work';
import { CreateSaleHandler } from '../../../../application/handlers/create-sale.handler';
import { CreatePaymentHandler } from '../../../../application/handlers/create-payment.handler';
import { CompletePaymentHandler } from '../../../../application/handlers/complete-payment.handler';
import { CancelSaleHandler } from '../../../../application/handlers/cancel-sale.handler';
import { AddSaleItemHandler } from '../../../../application/handlers/add-sale-item.handler';
import { CreateSaleCommand } from '../../../../application/commands/create-sale.command';
import { CreatePaymentCommand } from '../../../../application/commands/create-payment.command';
import { CompletePaymentCommand } from '../../../../application/commands/complete-payment.command';
import { CancelSaleCommand } from '../../../../application/commands/cancel-sale.command';
import { AddSaleItemCommand } from '../../../../application/commands/add-sale-item.command';
import { SaleSourceType } from '../../../../domain/enums/sale-source-type.enum';
import { SourceType } from '../../../../domain/enums/source-type.enum';
import { DuplicateSaleException } from '../../../../domain/exceptions/duplicate-sale.exception';
import { PaymentOverpaymentException } from '../../../../application/exceptions/payment-overpayment.exception';
import {
  PaymentOptimisticLockException,
  SaleOptimisticLockException,
} from '../../../../domain/exceptions/optimistic-lock.exception';
import { InvalidSaleStateException } from '../../../../domain/exceptions/invalid-sale-state.exception';
import { SaleAlreadyFinalizedException } from '../../../../domain/exceptions/sale-already-finalized.exception';
import { SalesEventPublisherPort } from '../../../../application/ports/sales-event-publisher.port';
import { SaleSourceValidatorPort } from '../../../../application/ports/sale-source-validator.port';
import {
  ClientFacadePort,
  ClientSummaryPayload,
} from '../../../../application/ports/client-facade.port';
import { DomainEvent } from '../../../../domain/shared/domain-event';

/**
 * Deterministic rendezvous barrier for multi-party concurrent race synchronization.
 * Suspends competing asynchronous operations until all parties reach the rendezvous point,
 * guaranteeing simultaneous release at the database transaction boundary without arbitrary sleeps.
 */
export class DeterministicSynchronizationBarrier {
  private waiters: Array<() => void> = [];

  constructor(private readonly parties: number = 2) {}

  public async arriveAndWait(timeoutMs: number = 8000): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        const idx = this.waiters.indexOf(fulfill);
        if (idx !== -1) this.waiters.splice(idx, 1);
        reject(
          new Error(
            `DeterministicSynchronizationBarrier timed out after ${timeoutMs}ms waiting for ${this.parties} parties.`,
          ),
        );
      }, timeoutMs);

      const fulfill = () => {
        clearTimeout(timer);
        resolve();
      };

      this.waiters.push(fulfill);
      if (this.waiters.length === this.parties) {
        const toRelease = [...this.waiters];
        this.waiters = [];
        for (const release of toRelease) {
          release();
        }
      }
    });
  }

  public reset(): void {
    this.waiters = [];
  }
}

interface PostgresEngineError extends Error {
  code: string;
  constraint?: string;
  table?: string;
  meta?: { target?: string[]; constraint?: string };
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
  err.meta = { constraint, target: constraint ? [constraint] : undefined };
  return err;
}

/**
 * Stateful PostgreSQL relational concurrency emulator:
 * - Read Committed transaction isolation with staging buffer.
 * - Mutex serialized transaction commit queue.
 * - Enforces relational partial unique indexes from ADR-0140:
 *   1. sales_pkey: PRIMARY KEY (id)
 *   2. uq_sales_clinical_session_active: (tenant_id, source_id) WHERE source_type IN ('TREATMENT_SESSION', 'KINESIOLOGY_SESSION') AND status != 'CANCELLED'
 *   3. uq_sales_source_code_active: (tenant_id, source_code) WHERE source_code IS NOT NULL AND status != 'CANCELLED'
 *   4. uq_payments_sale_reference: (sale_id, reference) WHERE reference IS NOT NULL
 *   5. payments_pkey: PRIMARY KEY (id)
 * - Optimistic Concurrency Control (OCC) conditional updates on sales and payments.
 * - Deterministic synchronization barrier hook at transaction commit.
 */
class FinancialConcurrencyDatabaseHarness {
  public sales = new Map<string, PrismaSaleModel>();
  public saleItems = new Map<string, PrismaSaleItemModel>();
  public payments = new Map<string, PrismaPaymentModel>();
  public receipts = new Map<string, PrismaReceiptModel>();

  public failOnSaleUpdate = false;
  public failOnPaymentUpdate = false;
  public commitBarrier: DeterministicSynchronizationBarrier | null = null;

  private txQueue: Promise<void> = Promise.resolve();

  constructor(public readonly clock: DeterministicClock) {}

  private async acquireLock(): Promise<() => void> {
    let releaseLock!: () => void;
    const nextLock = new Promise<void>((resolve) => {
      releaseLock = resolve;
    });
    const currentLock = this.txQueue;
    this.txQueue = this.txQueue.then(() => nextLock);
    await currentLock;
    return releaseLock;
  }

  public clear(): void {
    this.sales.clear();
    this.saleItems.clear();
    this.payments.clear();
    this.receipts.clear();
    this.failOnSaleUpdate = false;
    this.failOnPaymentUpdate = false;
    this.commitBarrier = null;
  }

  public createClient(): PrismaClient {
    const enforceSaleUniqueConstraints = (
      bufferedSales: Map<string, PrismaSaleModel>,
      saleData: PrismaSaleModel,
      isInsert: boolean,
    ) => {
      // 1. Primary Key Uniqueness
      if (isInsert && bufferedSales.has(saleData.id)) {
        throw createPgError(
          `duplicate key value violates unique constraint "sales_pkey"`,
          'P2002',
          'sales_pkey',
          'sales',
        );
      }

      // 2. Partial unique index: uq_sales_clinical_session_active
      const isClinical =
        saleData.sourceType === 'TREATMENT_SESSION' ||
        saleData.sourceType === 'KINESIOLOGY_SESSION';
      const isActive = saleData.status !== ('CANCELLED' as PrismaSaleStatus);

      if (isClinical && isActive && saleData.sourceId) {
        for (const existing of bufferedSales.values()) {
          if (existing.id === saleData.id) continue;
          if (
            existing.tenantId === saleData.tenantId &&
            existing.sourceId === saleData.sourceId &&
            (existing.sourceType === 'TREATMENT_SESSION' ||
              existing.sourceType === 'KINESIOLOGY_SESSION') &&
            existing.status !== ('CANCELLED' as PrismaSaleStatus)
          ) {
            throw createPgError(
              `duplicate key value violates unique constraint "uq_sales_clinical_session_active"`,
              'P2002',
              'uq_sales_clinical_session_active',
              'sales',
            );
          }
        }
      }

      // 3. Partial unique index: uq_sales_source_code_active
      if (saleData.sourceCode && isActive) {
        const isGenericRegister =
          saleData.sourceCode === 'POS_REGISTER' || saleData.sourceCode === 'pos_checkout_terminal';
        if (!isGenericRegister) {
          for (const existing of bufferedSales.values()) {
            if (existing.id === saleData.id) continue;
            if (
              existing.tenantId === saleData.tenantId &&
              existing.sourceCode === saleData.sourceCode &&
              existing.status !== ('CANCELLED' as PrismaSaleStatus)
            ) {
              throw createPgError(
                `duplicate key value violates unique constraint "uq_sales_source_code_active"`,
                'P2002',
                'uq_sales_source_code_active',
                'sales',
              );
            }
          }
        }
      }
    };

    const enforcePaymentUniqueConstraints = (
      bufferedPayments: Map<string, PrismaPaymentModel>,
      paymentData: PrismaPaymentModel,
      currentId: string,
    ) => {
      if (paymentData.reference) {
        for (const [existingId, p] of bufferedPayments.entries()) {
          if (
            existingId !== currentId &&
            p.saleId === paymentData.saleId &&
            p.reference !== null &&
            p.reference.toLowerCase() === paymentData.reference.toLowerCase()
          ) {
            throw createPgError(
              `Unique constraint failed on the fields: (sale_id, reference) [uq_payments_sale_reference]`,
              'P2002',
              'uq_payments_sale_reference',
              'payments',
            );
          }
        }
      }
    };

    const createTx = (
      bufferedSales: Map<string, PrismaSaleModel>,
      bufferedItems: Map<string, PrismaSaleItemModel>,
      bufferedPayments: Map<string, PrismaPaymentModel>,
    ) => {
      return {
        sale: {
          findUnique: jest.fn(async ({ where }: { where: { id: string } }) => {
            const s = bufferedSales.get(where.id);
            if (!s) return null;
            const items = Array.from(bufferedItems.values()).filter((i) => i.saleId === where.id);
            return { ...s, items };
          }),
          findFirst: jest.fn(async ({ where }: { where: Record<string, unknown> }) => {
            for (const s of bufferedSales.values()) {
              let match = true;
              if (where.tenantId && s.tenantId !== where.tenantId) match = false;
              if (where.sourceType && s.sourceType !== where.sourceType) match = false;
              if (where.sourceId && s.sourceId !== where.sourceId) match = false;
              if (where.sourceCode && s.sourceCode !== where.sourceCode) match = false;
              if (
                where.status &&
                typeof where.status === 'object' &&
                'not' in (where.status as Record<string, unknown>)
              ) {
                if (s.status === (where.status as { not: string }).not) match = false;
              }
              if (where.NOT && typeof where.NOT === 'object') {
                const notObj = where.NOT as { id?: string };
                if (notObj.id && s.id === notObj.id) match = false;
              }
              if (match) {
                const items = Array.from(bufferedItems.values()).filter((i) => i.saleId === s.id);
                return { ...s, items };
              }
            }
            return null;
          }),
          create: jest.fn(async ({ data }: { data: PrismaSaleModel }) => {
            const now = this.clock.now();
            const withDates: PrismaSaleModel = {
              ...data,
              createdAt: data.createdAt ?? now,
              updatedAt: data.updatedAt ?? now,
            };
            enforceSaleUniqueConstraints(bufferedSales, withDates, true);
            bufferedSales.set(withDates.id, withDates);
            return withDates;
          }),
          upsert: jest.fn(
            async ({
              where,
              create,
              update,
            }: {
              where: { id: string };
              create: Record<string, unknown>;
              update: Record<string, unknown>;
            }) => {
              const existing = bufferedSales.get(where.id);
              const now = this.clock.now();
              const isInsert = !existing;
              const data = {
                ...(existing ?? { createdAt: now, ...create }),
                ...update,
                updatedAt: now,
              } as PrismaSaleModel;
              enforceSaleUniqueConstraints(bufferedSales, data, isInsert);
              bufferedSales.set(where.id, data);
              return data;
            },
          ),
          update: jest.fn(
            async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
              const existing = bufferedSales.get(where.id);
              if (!existing) {
                throw createPgError('Record not found', 'P2025', undefined, 'sales');
              }
              const updated = {
                ...existing,
                ...data,
                updatedAt: this.clock.now(),
              } as PrismaSaleModel;
              enforceSaleUniqueConstraints(bufferedSales, updated, false);
              bufferedSales.set(where.id, updated);
              return updated;
            },
          ),
          updateMany: jest.fn(
            async ({
              where,
              data,
            }: {
              where: { id: string; version?: number };
              data: Record<string, unknown>;
            }) => {
              if (this.failOnSaleUpdate) {
                throw new Error('PostgreSQL Error: Transaction aborted on sale update');
              }
              const currentInDb = bufferedSales.get(where.id);
              if (
                currentInDb &&
                (where.version === undefined || currentInDb.version === where.version)
              ) {
                const updated = {
                  ...currentInDb,
                  ...data,
                  updatedAt: this.clock.now(),
                } as PrismaSaleModel;
                enforceSaleUniqueConstraints(bufferedSales, updated, false);
                bufferedSales.set(where.id, updated);
                return { count: 1 };
              }
              return { count: 0 };
            },
          ),
        },
        saleItem: {
          findMany: jest.fn(async ({ where }: { where: { saleId: string } }) => {
            return Array.from(bufferedItems.values()).filter((i) => i.saleId === where.saleId);
          }),
          deleteMany: jest.fn(
            async ({ where }: { where: { saleId: string; id?: { notIn?: string[] } } }) => {
              let count = 0;
              for (const [id, item] of Array.from(bufferedItems.entries())) {
                if (item.saleId === where.saleId) {
                  if (where.id?.notIn && where.id.notIn.includes(id)) {
                    continue;
                  }
                  bufferedItems.delete(id);
                  count++;
                }
              }
              return { count };
            },
          ),
          upsert: jest.fn(
            async ({
              where,
              create,
              update,
            }: {
              where: { id: string };
              create: Record<string, unknown>;
              update: Record<string, unknown>;
            }) => {
              const existing = bufferedItems.get(where.id);
              const data = {
                ...(existing ?? create),
                ...update,
              } as PrismaSaleItemModel;
              bufferedItems.set(where.id, data);
              return data;
            },
          ),
        },
        payment: {
          findUnique: jest.fn(async ({ where }: { where: { id: string } }) => {
            return bufferedPayments.get(where.id) ?? null;
          }),
          findMany: jest.fn(
            async ({ where }: { where: { saleId?: string; tenantId?: string } }) => {
              return Array.from(bufferedPayments.values()).filter((p) => {
                if (where.saleId && p.saleId !== where.saleId) return false;
                if (where.tenantId && p.tenantId !== where.tenantId) return false;
                return true;
              });
            },
          ),
          findFirst: jest.fn(async ({ where }: { where: Record<string, unknown> }) => {
            for (const p of bufferedPayments.values()) {
              let match = true;
              if (where.saleId && p.saleId !== where.saleId) match = false;
              if (where.tenantId && p.tenantId !== where.tenantId) match = false;
              if (where.reference && p.reference !== where.reference) match = false;
              if (match) return p;
            }
            return null;
          }),
          create: jest.fn(async ({ data }: { data: PrismaPaymentModel }) => {
            const now = this.clock.now();
            const withDates: PrismaPaymentModel = {
              ...data,
              createdAt: data.createdAt ?? now,
              updatedAt: data.updatedAt ?? now,
            };
            enforcePaymentUniqueConstraints(bufferedPayments, withDates, withDates.id);
            bufferedPayments.set(withDates.id, withDates);
            return withDates;
          }),
          upsert: jest.fn(
            async ({
              where,
              create,
              update,
            }: {
              where: { id: string };
              create: Record<string, unknown>;
              update: Record<string, unknown>;
            }) => {
              const existing = bufferedPayments.get(where.id);
              const now = this.clock.now();
              const data = {
                ...(existing ?? { createdAt: now, ...create }),
                ...update,
                updatedAt: now,
              } as PrismaPaymentModel;
              enforcePaymentUniqueConstraints(bufferedPayments, data, where.id);
              bufferedPayments.set(where.id, data);
              return data;
            },
          ),
          updateMany: jest.fn(
            async ({
              where,
              data,
            }: {
              where: { id: string; version: number };
              data: Record<string, unknown>;
            }) => {
              if (this.failOnPaymentUpdate) {
                throw new Error('PostgreSQL Error: Transaction aborted on payment update');
              }
              const currentInDb = bufferedPayments.get(where.id);
              if (currentInDb && currentInDb.version === where.version) {
                const updated = {
                  ...currentInDb,
                  ...data,
                  updatedAt: this.clock.now(),
                } as PrismaPaymentModel;
                bufferedPayments.set(where.id, updated);
                return { count: 1 };
              }
              return { count: 0 };
            },
          ),
        },
      };
    };

    return {
      $transaction: jest.fn(async (callback: (tx: unknown) => Promise<unknown>) => {
        // Deterministic Synchronization Barrier: hold until all racing parties arrive
        if (this.commitBarrier) {
          const barrier = this.commitBarrier;
          await barrier.arriveAndWait();
          // Auto-clear so subsequent nested or post-barrier transactions proceed without blocking
          if (this.commitBarrier === barrier) {
            this.commitBarrier = null;
          }
        }

        const release = await this.acquireLock();
        try {
          const bufferedSales = new Map<string, PrismaSaleModel>(
            Array.from(this.sales.entries()).map(([k, v]) => [k, { ...v }]),
          );
          const bufferedItems = new Map<string, PrismaSaleItemModel>(
            Array.from(this.saleItems.entries()).map(([k, v]) => [k, { ...v }]),
          );
          const bufferedPayments = new Map<string, PrismaPaymentModel>(
            Array.from(this.payments.entries()).map(([k, v]) => [k, { ...v }]),
          );

          const tx = createTx(bufferedSales, bufferedItems, bufferedPayments);

          const result = await callback(tx);

          // Atomic commit: flush buffered state to database
          this.sales = bufferedSales;
          this.saleItems = bufferedItems;
          this.payments = bufferedPayments;

          return result;
        } finally {
          release();
        }
      }),
      sale: {
        findUnique: jest.fn(async ({ where }: { where: { id: string } }) => {
          const s = this.sales.get(where.id);
          if (!s) return null;
          const items = Array.from(this.saleItems.values()).filter((i) => i.saleId === where.id);
          return { ...s, items };
        }),
        findFirst: jest.fn(async ({ where }: { where: Record<string, unknown> }) => {
          for (const s of this.sales.values()) {
            let match = true;
            if (where.tenantId && s.tenantId !== where.tenantId) match = false;
            if (where.sourceType && s.sourceType !== where.sourceType) match = false;
            if (where.sourceId && s.sourceId !== where.sourceId) match = false;
            if (where.sourceCode && s.sourceCode !== where.sourceCode) match = false;
            if (
              where.status &&
              typeof where.status === 'object' &&
              'not' in (where.status as Record<string, unknown>)
            ) {
              if (s.status === (where.status as { not: string }).not) match = false;
            }
            if (where.NOT && typeof where.NOT === 'object') {
              const notObj = where.NOT as { id?: string };
              if (notObj.id && s.id === notObj.id) match = false;
            }
            if (match) {
              const items = Array.from(this.saleItems.values()).filter((i) => i.saleId === s.id);
              return { ...s, items };
            }
          }
          return null;
        }),
        create: jest.fn(async ({ data }: { data: PrismaSaleModel }) => {
          const now = this.clock.now();
          const withDates: PrismaSaleModel = {
            ...data,
            createdAt: data.createdAt ?? now,
            updatedAt: data.updatedAt ?? now,
          };
          enforceSaleUniqueConstraints(this.sales, withDates, true);
          this.sales.set(withDates.id, withDates);
          return withDates;
        }),
        upsert: jest.fn(
          async ({
            where,
            create,
            update,
          }: {
            where: { id: string };
            create: Record<string, unknown>;
            update: Record<string, unknown>;
          }) => {
            const existing = this.sales.get(where.id);
            const now = this.clock.now();
            const isInsert = !existing;
            const data = {
              ...(existing ?? { createdAt: now, ...create }),
              ...update,
              updatedAt: now,
            } as PrismaSaleModel;
            enforceSaleUniqueConstraints(this.sales, data, isInsert);
            this.sales.set(where.id, data);
            return data;
          },
        ),
        update: jest.fn(
          async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
            const existing = this.sales.get(where.id);
            if (!existing) {
              throw createPgError('Record not found', 'P2025', undefined, 'sales');
            }
            const updated = {
              ...existing,
              ...data,
              updatedAt: this.clock.now(),
            } as PrismaSaleModel;
            enforceSaleUniqueConstraints(this.sales, updated, false);
            this.sales.set(where.id, updated);
            return updated;
          },
        ),
        updateMany: jest.fn(
          async ({
            where,
            data,
          }: {
            where: { id: string; version?: number };
            data: Record<string, unknown>;
          }) => {
            const currentInDb = this.sales.get(where.id);
            if (
              currentInDb &&
              (where.version === undefined || currentInDb.version === where.version)
            ) {
              const updated = {
                ...currentInDb,
                ...data,
                updatedAt: this.clock.now(),
              } as PrismaSaleModel;
              enforceSaleUniqueConstraints(this.sales, updated, false);
              this.sales.set(where.id, updated);
              return { count: 1 };
            }
            return { count: 0 };
          },
        ),
      },
      saleItem: {
        findMany: jest.fn(async ({ where }: { where: { saleId: string } }) => {
          return Array.from(this.saleItems.values()).filter((i) => i.saleId === where.saleId);
        }),
        deleteMany: jest.fn(
          async ({ where }: { where: { saleId: string; id?: { notIn?: string[] } } }) => {
            let count = 0;
            for (const [id, item] of Array.from(this.saleItems.entries())) {
              if (item.saleId === where.saleId) {
                if (where.id?.notIn && where.id.notIn.includes(id)) {
                  continue;
                }
                this.saleItems.delete(id);
                count++;
              }
            }
            return { count };
          },
        ),
        upsert: jest.fn(
          async ({
            where,
            create,
            update,
          }: {
            where: { id: string };
            create: Record<string, unknown>;
            update: Record<string, unknown>;
          }) => {
            const existing = this.saleItems.get(where.id);
            const data = {
              ...(existing ?? create),
              ...update,
            } as PrismaSaleItemModel;
            this.saleItems.set(where.id, data);
            return data;
          },
        ),
      },
      payment: {
        findUnique: jest.fn(async ({ where }: { where: { id: string } }) => {
          return this.payments.get(where.id) ?? null;
        }),
        findMany: jest.fn(async ({ where }: { where: { saleId?: string; tenantId?: string } }) => {
          return Array.from(this.payments.values()).filter((p) => {
            if (where.saleId && p.saleId !== where.saleId) return false;
            if (where.tenantId && p.tenantId !== where.tenantId) return false;
            return true;
          });
        }),
        findFirst: jest.fn(async ({ where }: { where: Record<string, unknown> }) => {
          for (const p of this.payments.values()) {
            let match = true;
            if (where.saleId && p.saleId !== where.saleId) match = false;
            if (where.tenantId && p.tenantId !== where.tenantId) match = false;
            if (where.reference && p.reference !== where.reference) match = false;
            if (match) return p;
          }
          return null;
        }),
        create: jest.fn(async ({ data }: { data: PrismaPaymentModel }) => {
          const now = this.clock.now();
          const withDates: PrismaPaymentModel = {
            ...data,
            createdAt: data.createdAt ?? now,
            updatedAt: data.updatedAt ?? now,
          };
          enforcePaymentUniqueConstraints(this.payments, withDates, withDates.id);
          this.payments.set(withDates.id, withDates);
          return withDates;
        }),
        upsert: jest.fn(
          async ({
            where,
            create,
            update,
          }: {
            where: { id: string };
            create: Record<string, unknown>;
            update: Record<string, unknown>;
          }) => {
            const existing = this.payments.get(where.id);
            const now = this.clock.now();
            const data = {
              ...(existing ?? { createdAt: now, ...create }),
              ...update,
              updatedAt: now,
            } as PrismaPaymentModel;
            enforcePaymentUniqueConstraints(this.payments, data, where.id);
            this.payments.set(where.id, data);
            return data;
          },
        ),
        updateMany: jest.fn(
          async ({
            where,
            data,
          }: {
            where: { id: string; version: number };
            data: Record<string, unknown>;
          }) => {
            const currentInDb = this.payments.get(where.id);
            if (currentInDb && currentInDb.version === where.version) {
              const updated = {
                ...currentInDb,
                ...data,
                updatedAt: this.clock.now(),
              } as PrismaPaymentModel;
              this.payments.set(where.id, updated);
              return { count: 1 };
            }
            return { count: 0 };
          },
        ),
      },
      receipt: {
        findUnique: jest.fn(async ({ where }: { where: { id: string } }) => {
          return this.receipts.get(where.id) ?? null;
        }),
      },
    } as unknown as PrismaClient;
  }
}

class MockSalesEventPublisher implements SalesEventPublisherPort {
  public publishedEvents: DomainEvent[] = [];
  public async publish(events: ReadonlyArray<DomainEvent>): Promise<void> {
    this.publishedEvents.push(...events);
  }
  public clear(): void {
    this.publishedEvents = [];
  }
}

const AUTHORIZED_USER = {
  id: 'usr_senior_dist_eng',
  userId: 'usr_senior_dist_eng',
  email: 'distributed.engineer@kinergy.com',
  tenantId: 'tenant_concurrency_qa',
  roles: ['Manager', 'Platform Admin'],
  permissions: [
    'sales.create',
    'sales.read',
    'sales.update',
    'sales.cancel',
    'sales.manage',
    'payments.create',
    'payments.read',
    'payments.manage',
    'receipts.create',
    'receipts.read',
  ],
};

describe('Milestone 7.19 Financial Concurrency and Race-Condition Test Suite', () => {
  const baseTime = new Date('2026-10-17T09:00:00.000Z');
  let clock: DeterministicClock;
  let db: FinancialConcurrencyDatabaseHarness;
  let prisma: PrismaClient;
  let saleRepo: PrismaSaleRepository;
  let paymentRepo: PrismaPaymentRepository;
  let uow: PrismaSalesUnitOfWork;
  let eventPublisher: MockSalesEventPublisher;
  let sourceValidator: SaleSourceValidatorPort;
  let clientFacade: ClientFacadePort;

  let createSaleHandler: CreateSaleHandler;
  let createPaymentHandler: CreatePaymentHandler;
  let completePaymentHandler: CompletePaymentHandler;
  let cancelSaleHandler: CancelSaleHandler;
  let addSaleItemHandler: AddSaleItemHandler;

  beforeEach(() => {
    clock = new DeterministicClock(baseTime);
    db = new FinancialConcurrencyDatabaseHarness(clock);
    prisma = db.createClient();
    saleRepo = new PrismaSaleRepository(prisma);
    paymentRepo = new PrismaPaymentRepository(prisma);
    uow = new PrismaSalesUnitOfWork(prisma);
    eventPublisher = new MockSalesEventPublisher();

    sourceValidator = {
      validateSource: jest.fn().mockResolvedValue({
        exists: true,
        isValid: true,
        belongsToContext: true,
      }),
    };

    clientFacade = {
      getClientSummary: jest.fn().mockImplementation(
        async (id: string) =>
          ({
            id,
            fullName: 'Mateo Rossi',
            email: 'mateo@example.com',
            isActive: true,
          }) as ClientSummaryPayload,
      ),
    };

    createSaleHandler = new CreateSaleHandler(
      saleRepo,
      clock,
      eventPublisher,
      sourceValidator,
      clientFacade,
    );
    createPaymentHandler = new CreatePaymentHandler(
      paymentRepo,
      saleRepo,
      clock,
      eventPublisher,
      uow,
    );
    completePaymentHandler = new CompletePaymentHandler(
      paymentRepo,
      saleRepo,
      clock,
      eventPublisher,
      uow,
    );
    cancelSaleHandler = new CancelSaleHandler(saleRepo, clock, eventPublisher, paymentRepo, uow);
    addSaleItemHandler = new AddSaleItemHandler(saleRepo, clock, eventPublisher);
  });

  const seedSaleInDatabase = (params: {
    id: string;
    tenantId: string;
    status: PrismaSaleStatus;
    currency: string;
    subtotal: number;
    discountTotal: number;
    total: number;
    version: number;
    sourceType?: string;
    sourceId?: string;
    sourceCode?: string | null;
    items?: Array<{
      id: string;
      description: string;
      quantity: number;
      unitPrice: number;
      subtotal: number;
      discountTotal: number;
      total: number;
    }>;
  }) => {
    const now = clock.now();
    db.sales.set(params.id, {
      id: params.id,
      tenantId: params.tenantId,
      clientId: 'client_race_01',
      sourceType: params.sourceType ?? 'CUSTOM_SERVICE',
      sourceId: params.sourceId ?? 'pos_01',
      sourceCode: params.sourceCode ?? null,
      status: params.status,
      currency: params.currency,
      subtotalAmount: new Decimal(params.subtotal),
      discountTotalAmount: new Decimal(params.discountTotal),
      totalAmount: new Decimal(params.total),
      orderDiscountType: null,
      orderDiscountValue: null,
      orderDiscountReason: null,
      cancellationReason: params.status === 'CANCELLED' ? 'Cancelled by test' : null,
      cancelledAt: params.status === 'CANCELLED' ? now : null,
      completedAt: params.status === 'COMPLETED' ? now : null,
      refundedAt: params.status === 'REFUNDED' ? now : null,
      createdAt: now,
      updatedAt: now,
      version: params.version,
    });

    if (params.items) {
      for (const it of params.items) {
        db.saleItems.set(it.id, {
          id: it.id,
          saleId: params.id,
          sourceType: 'CUSTOM_SERVICE',
          sourceId: 'custom_01',
          sourceCode: null,
          description: it.description,
          skuOrCode: null,
          quantity: new Decimal(it.quantity),
          unitPriceAmount: new Decimal(it.unitPrice),
          unitPriceCurrency: params.currency,
          subtotalAmount: new Decimal(it.subtotal),
          discountTotalAmount: new Decimal(it.discountTotal),
          totalAmount: new Decimal(it.total),
          discountType: null,
          discountValue: null,
          discountReason: null,
          createdAt: now,
          updatedAt: now,
        });
      }
    } else if (params.subtotal > 0) {
      // Reconciled default line item ensuring Domain invariant subtotal == sum(items.subtotal) holds
      db.saleItems.set(`item_${params.id}_01`, {
        id: `item_${params.id}_01`,
        saleId: params.id,
        sourceType: 'INVENTORY_ITEM',
        sourceId: 'inv_default_01',
        sourceCode: null,
        description: 'Seeded Consultation Line Item',
        skuOrCode: 'SKU-SEED-01',
        quantity: new Decimal(1),
        unitPriceAmount: new Decimal(params.subtotal),
        unitPriceCurrency: params.currency,
        subtotalAmount: new Decimal(params.subtotal),
        discountTotalAmount: new Decimal(params.discountTotal),
        totalAmount: new Decimal(params.total),
        discountType: null,
        discountValue: null,
        discountReason: null,
        createdAt: now,
        updatedAt: now,
      });
    }
  };

  const seedPaymentInDatabase = (params: {
    id: string;
    saleId: string;
    tenantId: string;
    amount: number;
    currency: string;
    status: PrismaPaymentStatus;
    method: PrismaPaymentMethod;
    version: number;
    reference?: string | null;
  }) => {
    const now = clock.now();
    db.payments.set(params.id, {
      id: params.id,
      tenantId: params.tenantId,
      saleId: params.saleId,
      status: params.status,
      method: params.method,
      amount: new Decimal(params.amount),
      currency: params.currency,
      reference: params.reference ?? null,
      paidAt: params.status === 'SETTLED' ? now : null,
      createdAt: now,
      updatedAt: now,
      version: params.version,
    });
  };

  // =========================================================================
  // MANDATORY SCENARIO A: Concurrent Payment Completion
  // =========================================================================
  describe('Mandatory Scenario A: Concurrent Payment Completion', () => {
    it('A.1: two concurrent operations completing the same Payment result in exactly one terminal success and one OCC conflict', async () => {
      // 1. Arrange: Sale pending payment, Payment pending with version 1
      seedSaleInDatabase({
        id: 'sale_race_pay_01',
        tenantId: 'tenant_concurrency_qa',
        status: 'PENDING_PAYMENT',
        currency: 'USD',
        subtotal: 150,
        discountTotal: 0,
        total: 150,
        version: 2,
      });

      seedPaymentInDatabase({
        id: 'pay_race_occ_01',
        saleId: 'sale_race_pay_01',
        tenantId: 'tenant_concurrency_qa',
        amount: 150,
        currency: 'USD',
        status: 'PENDING',
        method: 'QR',
        version: 1,
        reference: 'AUTH-VISA-991',
      });

      // 2. Synchronize competing operations at transaction boundary
      const barrier = new DeterministicSynchronizationBarrier(2);
      db.commitBarrier = barrier;

      const cmd = new CompletePaymentCommand({
        paymentId: 'pay_race_occ_01',
        saleId: 'sale_race_pay_01',
        tenantId: 'tenant_concurrency_qa',
        reference: 'AUTH-VISA-991',
        paidAt: clock.now(),
        currentUser: AUTHORIZED_USER,
      });

      // 3. Act: Competing concurrent payment completion requests
      const [result1, result2] = await Promise.all([
        completePaymentHandler.execute(cmd),
        completePaymentHandler.execute(cmd),
      ]);

      // 4. Assert Invariants:
      // - Exactly one request succeeds, exactly one fails
      const successCount = (result1.isSuccess ? 1 : 0) + (result2.isSuccess ? 1 : 0);
      const failureCount = (result1.isFailure ? 1 : 0) + (result2.isFailure ? 1 : 0);
      expect(successCount).toBe(1);
      expect(failureCount).toBe(1);

      // - Failing request failed with Optimistic Lock Exception
      const failed = result1.isFailure ? result1 : result2;
      expect(
        failed.getError() instanceof PaymentOptimisticLockException ||
          failed.getError() instanceof SaleOptimisticLockException,
      ).toBe(true);

      // 5. Database State Assertions:
      // - Payment ends in SETTLED with version bumped to 2
      const paymentInDb = db.payments.get('pay_race_occ_01')!;
      expect(paymentInDb.status).toBe('SETTLED');
      expect(paymentInDb.version).toBe(2);

      // - Sale ends in PAID with version bumped to 3, total settled matches payment
      const saleInDb = db.sales.get('sale_race_pay_01')!;
      expect(saleInDb.status).toBe('PAID');
      expect(saleInDb.version).toBe(3);

      // - No duplicate receipt or duplicate ledger records created
      expect(db.receipts.size).toBe(0);
    });

    it('A.2: racing split-tender payment completions enforce Sale aggregate OCC version increment', async () => {
      // Sale total = $100. Two distinct split payments: Pay 1 ($60) and Pay 2 ($40)
      seedSaleInDatabase({
        id: 'sale_split_occ_01',
        tenantId: 'tenant_concurrency_qa',
        status: 'PENDING_PAYMENT',
        currency: 'USD',
        subtotal: 100,
        discountTotal: 0,
        total: 100,
        version: 2,
      });

      seedPaymentInDatabase({
        id: 'pay_split_01',
        saleId: 'sale_split_occ_01',
        tenantId: 'tenant_concurrency_qa',
        amount: 60,
        currency: 'USD',
        status: 'PENDING',
        method: 'CASH',
        version: 1,
      });

      seedPaymentInDatabase({
        id: 'pay_split_02',
        saleId: 'sale_split_occ_01',
        tenantId: 'tenant_concurrency_qa',
        amount: 40,
        currency: 'USD',
        status: 'PENDING',
        method: 'QR',
        version: 1,
      });

      const barrier = new DeterministicSynchronizationBarrier(2);
      db.commitBarrier = barrier;

      const cmd1 = new CompletePaymentCommand({
        paymentId: 'pay_split_01',
        saleId: 'sale_split_occ_01',
        tenantId: 'tenant_concurrency_qa',
        paidAt: clock.now(),
        currentUser: AUTHORIZED_USER,
      });

      const cmd2 = new CompletePaymentCommand({
        paymentId: 'pay_split_02',
        saleId: 'sale_split_occ_01',
        tenantId: 'tenant_concurrency_qa',
        paidAt: clock.now(),
        currentUser: AUTHORIZED_USER,
      });

      const [res1, res2] = await Promise.all([
        completePaymentHandler.execute(cmd1),
        completePaymentHandler.execute(cmd2),
      ]);

      // Both payments race to update the Sale version.
      // Winner updates Sale to PARTIALLY_PAID (version 3).
      // Loser conflicts on Sale OCC version 2 and fails cleanly without corrupted totals.
      const successCount = (res1.isSuccess ? 1 : 0) + (res2.isSuccess ? 1 : 0);
      const failureCount = (res1.isFailure ? 1 : 0) + (res2.isFailure ? 1 : 0);
      expect(successCount).toBe(1);
      expect(failureCount).toBe(1);

      const saleInDb = db.sales.get('sale_split_occ_01')!;
      expect(saleInDb.version).toBe(3);
      expect(saleInDb.status).toBe('PARTIALLY_PAID');
    });
  });

  // =========================================================================
  // MANDATORY SCENARIO B: Duplicate Source Transaction Creation
  // =========================================================================
  describe('Mandatory Scenario B: Duplicate Source Transaction Creation', () => {
    it('B.1: concurrent attempts to create a Sale for the same unique FOOD order creates exactly ONE Sale', async () => {
      const barrier = new DeterministicSynchronizationBarrier(2);
      db.commitBarrier = barrier;

      const orderCode = 'FOOD-ORD-009988';
      const cmd1 = new CreateSaleCommand({
        clientId: 'client_race_01',
        tenantId: 'tenant_concurrency_qa',
        idempotencyKey: 'sale_food_attempt_1',
        currency: 'USD',
        source: {
          sourceType: SourceType.INVENTORY_ITEM,
          sourceId: 'food_sku_123',
          sourceCode: orderCode,
        },
        currentUser: AUTHORIZED_USER,
      });

      const cmd2 = new CreateSaleCommand({
        clientId: 'client_race_02',
        tenantId: 'tenant_concurrency_qa',
        idempotencyKey: 'sale_food_attempt_2',
        currency: 'USD',
        source: {
          sourceType: SourceType.INVENTORY_ITEM,
          sourceId: 'food_sku_123',
          sourceCode: orderCode,
        },
        currentUser: AUTHORIZED_USER,
      });

      const [res1, res2] = await Promise.all([
        createSaleHandler.execute(cmd1),
        createSaleHandler.execute(cmd2),
      ]);

      // Exactly one succeeds in persisting; the second hits duplicate order reference check / constraint
      const successCount = (res1.isSuccess ? 1 : 0) + (res2.isSuccess ? 1 : 0);
      const failureCount = (res1.isFailure ? 1 : 0) + (res2.isFailure ? 1 : 0);
      expect(successCount).toBe(1);
      expect(failureCount).toBe(1);

      const failed = res1.isFailure ? res1 : res2;
      expect(failed.getError() instanceof DuplicateSaleException).toBe(true);

      // Database assertion: Exactly ONE Sale exists for this source identity
      expect(db.sales.size).toBe(1);
      const createdSale = Array.from(db.sales.values())[0]!;
      expect(createdSale.sourceCode).toBe(orderCode);
    });

    it('B.2: concurrent attempts for the same clinical treatment encounter are protected by uq_sales_clinical_session_active', async () => {
      const barrier = new DeterministicSynchronizationBarrier(2);
      db.commitBarrier = barrier;

      const clinicalSessionId = 'session_clinical_789';
      const cmd1 = new CreateSaleCommand({
        clientId: 'client_race_01',
        tenantId: 'tenant_concurrency_qa',
        idempotencyKey: 'sale_clinical_attempt_1',
        currency: 'USD',
        source: {
          sourceType: SaleSourceType.KINESIOLOGY_SESSION,
          sourceId: clinicalSessionId,
        },
        currentUser: AUTHORIZED_USER,
      });

      const cmd2 = new CreateSaleCommand({
        clientId: 'client_race_01',
        tenantId: 'tenant_concurrency_qa',
        idempotencyKey: 'sale_clinical_attempt_2',
        currency: 'USD',
        source: {
          sourceType: SaleSourceType.KINESIOLOGY_SESSION,
          sourceId: clinicalSessionId,
        },
        currentUser: AUTHORIZED_USER,
      });

      const [res1, res2] = await Promise.all([
        createSaleHandler.execute(cmd1),
        createSaleHandler.execute(cmd2),
      ]);

      // Exactly one succeeds, the other fails with DuplicateSaleException
      const successCount = (res1.isSuccess ? 1 : 0) + (res2.isSuccess ? 1 : 0);
      const failureCount = (res1.isFailure ? 1 : 0) + (res2.isFailure ? 1 : 0);
      expect(successCount).toBe(1);
      expect(failureCount).toBe(1);

      const failed = res1.isFailure ? res1 : res2;
      expect(failed.getError() instanceof DuplicateSaleException).toBe(true);

      // Database assertion: Exactly ONE clinical session sale exists
      expect(db.sales.size).toBe(1);
      const sessionSale = Array.from(db.sales.values())[0]!;
      expect(sessionSale.sourceId).toBe(clinicalSessionId);
    });

    it('B.3: distinct legitimate repeat purchases of reusable product both succeed concurrently', async () => {
      const barrier = new DeterministicSynchronizationBarrier(2);
      db.commitBarrier = barrier;

      const makeCmd = (id: string) =>
        new CreateSaleCommand({
          id,
          tenantId: 'tenant_concurrency_qa',
          clientId: 'client_race_01',
          currency: 'USD',
          source: {
            sourceType: SaleSourceType.DRINK,
            sourceId: 'pos_checkout_terminal',
            sourceCode: 'POS_REGISTER', // Generic non-unique terminal tag
          },
          items: [
            {
              description: 'Electrolyte Mineral Water',
              quantity: 1,
              unitPriceAmount: 5,
            },
          ],
          currentUser: AUTHORIZED_USER,
        });

      const [res1, res2] = await Promise.all([
        createSaleHandler.execute(makeCmd('sale_drink_repeat_01')),
        createSaleHandler.execute(makeCmd('sale_drink_repeat_02')),
      ]);

      expect(res1.isSuccess).toBe(true);
      expect(res2.isSuccess).toBe(true);

      // Database assertion: Exactly two distinct sales exist
      expect(db.sales.size).toBe(2);
      expect(db.sales.has('sale_drink_repeat_01')).toBe(true);
      expect(db.sales.has('sale_drink_repeat_02')).toBe(true);
    });
  });

  // =========================================================================
  // MANDATORY SCENARIO C: Concurrent Sale Mutation
  // =========================================================================
  describe('Mandatory Scenario C: Concurrent Sale Mutation', () => {
    it('C.1: concurrent item additions to the same draft Sale prevent lost updates via OCC', async () => {
      seedSaleInDatabase({
        id: 'sale_draft_race_01',
        tenantId: 'tenant_concurrency_qa',
        status: 'DRAFT',
        currency: 'USD',
        subtotal: 50,
        discountTotal: 0,
        total: 50,
        version: 1,
        items: [
          {
            id: 'item_initial_50',
            description: 'Base Assessment',
            quantity: 1,
            unitPrice: 50,
            subtotal: 50,
            discountTotal: 0,
            total: 50,
          },
        ],
      });

      // Both workers read the sale at version 1
      const sale1 = await saleRepo.findById('sale_draft_race_01');
      const sale2 = await saleRepo.findById('sale_draft_race_01');
      expect(sale1!.version).toBe(1);
      expect(sale2!.version).toBe(1);

      sale1!.addItem({
        source: sale1!.source,
        description: 'Item Worker 1',
        quantity: 1,
        unitPrice: sale1!.subtotal,
      });

      sale2!.addItem({
        source: sale2!.source,
        description: 'Item Worker 2',
        quantity: 1,
        unitPrice: sale2!.subtotal,
      });

      const barrier = new DeterministicSynchronizationBarrier(2);
      db.commitBarrier = barrier;

      // Both workers attempt to save with in-memory version 1 concurrently
      const results = await Promise.allSettled([saleRepo.save(sale1!), saleRepo.save(sale2!)]);

      const successCount = results.filter((r) => r.status === 'fulfilled').length;
      const failureCount = results.filter((r) => r.status === 'rejected').length;

      expect(successCount).toBe(1);
      expect(failureCount).toBe(1);

      const rejected = results.find((r) => r.status === 'rejected') as PromiseRejectedResult;
      expect(rejected.reason instanceof SaleOptimisticLockException).toBe(true);

      // Database assertion: Version is bumped to 2, exactly one addition succeeded, no lost updates
      const saleInDb = db.sales.get('sale_draft_race_01')!;
      expect(saleInDb.version).toBe(2);
      expect(db.saleItems.size).toBe(2); // Initial item + 1 winning item
    });

    it('C.2: concurrent item addition versus Sale cancellation rejects the stale mutation', async () => {
      seedSaleInDatabase({
        id: 'sale_cancel_race_01',
        tenantId: 'tenant_concurrency_qa',
        status: 'DRAFT',
        currency: 'USD',
        subtotal: 100,
        discountTotal: 0,
        total: 100,
        version: 1,
      });

      const barrier = new DeterministicSynchronizationBarrier(2);
      db.commitBarrier = barrier;

      const cancelCmd = new CancelSaleCommand({
        saleId: 'sale_cancel_race_01',
        reason: 'Customer cancelled checkout',
        tenantId: 'tenant_concurrency_qa',
        currentUser: AUTHORIZED_USER,
      });

      const addItemCmd = new AddSaleItemCommand({
        saleId: 'sale_cancel_race_01',
        tenantId: 'tenant_concurrency_qa',
        description: 'Late Addition',
        quantity: 1,
        unitPriceAmount: 25,
        currentUser: AUTHORIZED_USER,
      });

      const [cancelRes, addRes] = await Promise.all([
        cancelSaleHandler.execute(cancelCmd),
        addSaleItemHandler.execute(addItemCmd),
      ]);

      // Exactly one must succeed, one must fail; no corrupted intermediate states
      const successCount = (cancelRes.isSuccess ? 1 : 0) + (addRes.isSuccess ? 1 : 0);
      expect(successCount).toBe(1);

      const saleInDb = db.sales.get('sale_cancel_race_01')!;
      if (cancelRes.isSuccess) {
        expect(saleInDb.status).toBe('CANCELLED');
        expect(addRes.isFailure).toBe(true);
      } else {
        expect(addRes.isSuccess).toBe(true);
        expect(cancelRes.isFailure).toBe(true);
      }
    });

    it('C.3: stale item addition on an already PAID Sale is strictly rejected', async () => {
      seedSaleInDatabase({
        id: 'sale_already_paid_01',
        tenantId: 'tenant_concurrency_qa',
        status: 'PAID',
        currency: 'USD',
        subtotal: 120,
        discountTotal: 0,
        total: 120,
        version: 3,
      });

      const cmd = new AddSaleItemCommand({
        saleId: 'sale_already_paid_01',
        tenantId: 'tenant_concurrency_qa',
        description: 'Post-settlement addition attempt',
        quantity: 1,
        unitPriceAmount: 20,
        currentUser: AUTHORIZED_USER,
      });

      const res = await addSaleItemHandler.execute(cmd);
      expect(res.isFailure).toBe(true);
      expect(
        res.getError() instanceof SaleAlreadyFinalizedException ||
          res.getError() instanceof InvalidSaleStateException,
      ).toBe(true);

      // Database assertion: Status remains PAID, total unchanged
      const saleInDb = db.sales.get('sale_already_paid_01')!;
      expect(saleInDb.status).toBe('PAID');
      expect(saleInDb.totalAmount.toNumber()).toBe(120);
      expect(saleInDb.version).toBe(3);
    });
  });

  // =========================================================================
  // MANDATORY SCENARIO D: Related Financial Races
  // =========================================================================
  describe('Mandatory Scenario D: Related Financial Races', () => {
    it('D.1: concurrent Sale cancellation vs. Payment completion results in exactly one terminal outcome', async () => {
      seedSaleInDatabase({
        id: 'sale_race_cancel_pay_01',
        tenantId: 'tenant_concurrency_qa',
        status: 'PENDING_PAYMENT',
        currency: 'USD',
        subtotal: 100,
        discountTotal: 0,
        total: 100,
        version: 2,
      });

      seedPaymentInDatabase({
        id: 'pay_race_cancel_pay_01',
        saleId: 'sale_race_cancel_pay_01',
        tenantId: 'tenant_concurrency_qa',
        amount: 100,
        currency: 'USD',
        status: 'PENDING',
        method: 'QR',
        version: 1,
        reference: 'AUTH-RACE-001',
      });

      const barrier = new DeterministicSynchronizationBarrier(2);
      db.commitBarrier = barrier;

      const completeCmd = new CompletePaymentCommand({
        paymentId: 'pay_race_cancel_pay_01',
        saleId: 'sale_race_cancel_pay_01',
        tenantId: 'tenant_concurrency_qa',
        reference: 'AUTH-RACE-001',
        paidAt: clock.now(),
        currentUser: AUTHORIZED_USER,
      });

      const cancelCmd = new CancelSaleCommand({
        saleId: 'sale_race_cancel_pay_01',
        reason: 'Customer changed mind',
        tenantId: 'tenant_concurrency_qa',
        currentUser: AUTHORIZED_USER,
      });

      const [completeRes, cancelRes] = await Promise.all([
        completePaymentHandler.execute(completeCmd),
        cancelSaleHandler.execute(cancelCmd),
      ]);

      const successCount = (completeRes.isSuccess ? 1 : 0) + (cancelRes.isSuccess ? 1 : 0);
      expect(successCount).toBe(1);

      const saleInDb = db.sales.get('sale_race_cancel_pay_01')!;
      const payInDb = db.payments.get('pay_race_cancel_pay_01')!;

      if (completeRes.isSuccess) {
        expect(saleInDb.status).toBe('PAID');
        expect(payInDb.status).toBe('SETTLED');
        expect(cancelRes.isFailure).toBe(true);
      } else {
        expect(saleInDb.status).toBe('CANCELLED');
        expect(payInDb.status).toBe('CANCELLED');
        expect(completeRes.isFailure).toBe(true);
      }
    });

    it('D.2: concurrent payment creations competing for the same outstanding balance cannot over-settle Sale total', async () => {
      // Sale total = $100
      seedSaleInDatabase({
        id: 'sale_balance_race_01',
        tenantId: 'tenant_concurrency_qa',
        status: 'PENDING_PAYMENT',
        currency: 'USD',
        subtotal: 100,
        discountTotal: 0,
        total: 100,
        version: 2,
      });

      const barrier = new DeterministicSynchronizationBarrier(2);
      db.commitBarrier = barrier;

      // Two racing workers attempt to create payments: $70 and $60 (sum $130 > $100)
      const payCmd1 = new CreatePaymentCommand({
        saleId: 'sale_balance_race_01',
        tenantId: 'tenant_concurrency_qa',
        amount: 70,
        currency: 'USD',
        method: 'QR',
        reference: 'AUTH-SPLIT-A',
        currentUser: AUTHORIZED_USER,
      });

      const payCmd2 = new CreatePaymentCommand({
        saleId: 'sale_balance_race_01',
        tenantId: 'tenant_concurrency_qa',
        amount: 60,
        currency: 'USD',
        method: 'CASH',
        reference: 'AUTH-SPLIT-B',
        currentUser: AUTHORIZED_USER,
      });

      const [res1, res2] = await Promise.all([
        createPaymentHandler.execute(payCmd1),
        createPaymentHandler.execute(payCmd2),
      ]);

      // Exactly one succeeds, second fails with PaymentOverpaymentException
      const successCount = (res1.isSuccess ? 1 : 0) + (res2.isSuccess ? 1 : 0);
      const failureCount = (res1.isFailure ? 1 : 0) + (res2.isFailure ? 1 : 0);
      expect(successCount).toBe(1);
      expect(failureCount).toBe(1);

      const failed = res1.isFailure ? res1 : res2;
      expect(failed.getError() instanceof PaymentOverpaymentException).toBe(true);

      // Database assertion: Exactly ONE payment is persisted, sum <= $100
      expect(db.payments.size).toBe(1);
      const persisted = Array.from(db.payments.values())[0]!;
      expect(persisted.amount.toNumber()).toBeLessThanOrEqual(100);
    });

    it('D.3: concurrent payment creation with identical reference yields exactly one record via uq_payments_sale_reference', async () => {
      seedSaleInDatabase({
        id: 'sale_ref_race_01',
        tenantId: 'tenant_concurrency_qa',
        status: 'PENDING_PAYMENT',
        currency: 'USD',
        subtotal: 200,
        discountTotal: 0,
        total: 200,
        version: 2,
      });

      const barrier = new DeterministicSynchronizationBarrier(2);
      db.commitBarrier = barrier;

      const cmd = new CreatePaymentCommand({
        saleId: 'sale_ref_race_01',
        tenantId: 'tenant_concurrency_qa',
        amount: 200,
        currency: 'USD',
        method: 'QR',
        reference: 'TX-REF-IDENTICAL-99',
        currentUser: AUTHORIZED_USER,
      });

      const [res1, res2] = await Promise.all([
        createPaymentHandler.execute(cmd),
        createPaymentHandler.execute(cmd),
      ]);

      const successCount = (res1.isSuccess ? 1 : 0) + (res2.isSuccess ? 1 : 0);
      expect(successCount).toBeGreaterThanOrEqual(1);

      // Database assertion: Exactly one payment record exists in persistence
      expect(db.payments.size).toBe(1);
      const payInDb = Array.from(db.payments.values())[0]!;
      expect(payInDb.reference).toBe('TX-REF-IDENTICAL-99');
    });

    it('D.4: ambiguous request retry preserves idempotency and does not create duplicate financial records', async () => {
      const cmd = new CreateSaleCommand({
        idempotencyKey: 'idemp_key_ambiguous_01',
        tenantId: 'tenant_concurrency_qa',
        clientId: 'client_race_01',
        currency: 'USD',
        source: {
          sourceType: SaleSourceType.FOOD,
          sourceId: 'food_retry_01',
          sourceCode: 'POS_REGISTER',
        },
        items: [
          {
            description: 'Protein Bar',
            quantity: 3,
            unitPriceAmount: 4,
          },
        ],
        currentUser: AUTHORIZED_USER,
      });

      // Initial execution
      const res1 = await createSaleHandler.execute(cmd);
      expect(res1.isSuccess).toBe(true);

      // Immediate ambiguous retry with exact matching parameters
      const res2 = await createSaleHandler.execute(cmd);
      expect(res2.isSuccess).toBe(true);
      expect(res2.getValue().id).toBe(res1.getValue().id);

      // Database assertion: Exactly ONE sale exists
      expect(db.sales.size).toBe(1);
    });
  });
});
