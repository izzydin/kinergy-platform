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
import { CancelSaleHandler } from '../../../../application/handlers/cancel-sale.handler';
import { CompletePaymentHandler } from '../../../../application/handlers/complete-payment.handler';
import { FinalizeSaleHandler } from '../../../../application/handlers/finalize-sale.handler';
import { CancelSaleCommand } from '../../../../application/commands/cancel-sale.command';
import { CompletePaymentCommand } from '../../../../application/commands/complete-payment.command';
import { FinalizeSaleCommand } from '../../../../application/commands/finalize-sale.command';
import { SourceReference } from '../../../../domain/value-objects/source-reference.vo';
import { SourceType } from '../../../../domain/enums/source-type.enum';
import { Money } from '../../../../domain/value-objects/money.vo';
import { Discount } from '../../../../domain/value-objects/discount.vo';
import { SaleStatus } from '../../../../domain/enums/sale-status.enum';
import { SaleOptimisticLockException } from '../../../../domain/exceptions/optimistic-lock.exception';
import { SaleAlreadyFinalizedException } from '../../../../domain/exceptions/sale-already-finalized.exception';
import { SaleCannotBeMarkedPaidException } from '../../../../domain/exceptions/sale-cannot-be-marked-paid.exception';
import { InvalidSaleTransitionException } from '../../../../domain/exceptions/invalid-sale-transition.exception';
import { InvalidPaymentTransitionException } from '../../../../domain/exceptions/invalid-payment-transition.exception';
import { DomainEvent } from '../../../../domain/shared/domain-event';
import { SalesEventPublisherPort } from '../../../../application/ports/sales-event-publisher.port';

/**
 * Transactional test database harness emulating PostgreSQL Read Committed isolation,
 * atomic commit/rollback via mutex locks, OCC version checking on sales and payments,
 * and immutable receipt snapshots.
 */
class ConcurrentLifecycleDatabaseHarness {
  public sales = new Map<string, PrismaSaleModel>();
  public saleItems = new Map<string, PrismaSaleItemModel>();
  public payments = new Map<string, PrismaPaymentModel>();
  public receipts = new Map<string, PrismaReceiptModel>();

  public failOnSaleUpdate = false;
  public failOnPaymentUpdate = false;

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
  }

  public createClient(): PrismaClient {
    const createTx = (
      bufferedSales: Map<string, PrismaSaleModel>,
      bufferedItems: Map<string, PrismaSaleItemModel>,
      bufferedPayments: Map<string, PrismaPaymentModel>,
      bufferedReceipts: Map<string, PrismaReceiptModel>,
    ) => {
      return {
        sale: {
          findUnique: jest.fn(async ({ where }: { where: { id: string } }) => {
            const s = bufferedSales.get(where.id);
            if (!s) return null;
            const items = Array.from(bufferedItems.values()).filter((i) => i.saleId === where.id);
            return { ...s, items };
          }),
          findFirst: jest.fn(async () => null),
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
              const data = {
                ...(existing ?? { createdAt: now, ...create }),
                ...update,
                updatedAt: now,
              } as PrismaSaleModel;
              bufferedSales.set(where.id, data);
              return data;
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
                throw new Error('PostgreSQL Error: Simulated transaction lock abort on sale');
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
                  if (where.id?.notIn && !where.id.notIn.includes(id)) {
                    bufferedItems.delete(id);
                    count++;
                  }
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
              const data = existing
                ? { ...existing, ...update, updatedAt: this.clock.now() }
                : {
                    ...create,
                    createdAt: (create.createdAt as Date) ?? this.clock.now(),
                    updatedAt: (create.updatedAt as Date) ?? this.clock.now(),
                  };
              bufferedItems.set(where.id, data as PrismaSaleItemModel);
              return data;
            },
          ),
        },
        payment: {
          findUnique: jest.fn(async ({ where }: { where: { id: string } }) => {
            return bufferedPayments.get(where.id) ?? null;
          }),
          findMany: jest.fn(async ({ where }: { where: { saleId: string } }) => {
            return Array.from(bufferedPayments.values()).filter((p) => p.saleId === where.saleId);
          }),
          create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
            const id = data.id as string;
            const now = this.clock.now();
            const record = {
              createdAt: now,
              updatedAt: now,
              ...data,
            } as PrismaPaymentModel;
            bufferedPayments.set(id, record);
            return record;
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
                throw new Error('PostgreSQL Error: Simulated payment deadlock');
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
        receipt: {
          findUnique: jest.fn(async ({ where }: { where: { id: string } }) => {
            return bufferedReceipts.get(where.id) ?? null;
          }),
        },
      };
    };

    return {
      $transaction: jest.fn(async (callback: (tx: unknown) => Promise<unknown>) => {
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
          const bufferedReceipts = new Map<string, PrismaReceiptModel>(
            Array.from(this.receipts.entries()).map(([k, v]) => [k, { ...v }]),
          );

          const tx = createTx(bufferedSales, bufferedItems, bufferedPayments, bufferedReceipts);

          const result = await callback(tx);

          // Atomic commit on success
          this.sales = bufferedSales;
          this.saleItems = bufferedItems;
          this.payments = bufferedPayments;
          this.receipts = bufferedReceipts;

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
        findFirst: jest.fn(async () => null),
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
            const data = {
              ...(existing ?? { createdAt: now, ...create }),
              ...update,
              updatedAt: now,
            } as PrismaSaleModel;
            this.sales.set(where.id, data);
            return data;
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
                if (where.id?.notIn && !where.id.notIn.includes(id)) {
                  this.saleItems.delete(id);
                  count++;
                }
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
            const data = existing
              ? { ...existing, ...update, updatedAt: this.clock.now() }
              : {
                  ...create,
                  createdAt: (create.createdAt as Date) ?? this.clock.now(),
                  updatedAt: (create.updatedAt as Date) ?? this.clock.now(),
                };
            this.saleItems.set(where.id, data as PrismaSaleItemModel);
            return data;
          },
        ),
      },
      payment: {
        findUnique: jest.fn(async ({ where }: { where: { id: string } }) => {
          return this.payments.get(where.id) ?? null;
        }),
        findMany: jest.fn(async ({ where }: { where: { saleId: string } }) => {
          return Array.from(this.payments.values()).filter((p) => p.saleId === where.saleId);
        }),
        create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
          const id = data.id as string;
          const now = this.clock.now();
          const record = {
            createdAt: now,
            updatedAt: now,
            ...data,
          } as PrismaPaymentModel;
          this.payments.set(id, record);
          return record;
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

class InMemoryEventPublisher implements SalesEventPublisherPort {
  public publishedEvents: DomainEvent[] = [];
  public async publish(events: ReadonlyArray<DomainEvent>): Promise<void> {
    this.publishedEvents.push(...events);
  }
  public clear(): void {
    this.publishedEvents = [];
  }
}

const AUTHORIZED_USER = {
  id: 'user_auth_01',
  tenantId: 'tenant_1',
  roles: ['Manager', 'Receptionist'],
  permissions: ['sales.create', 'sales.cancel', 'payments.create', 'payments.manage'],
};

describe('Sale Mutation and Cancellation Race Protection Integration Tests (Prompt 6 / ADR-0140)', () => {
  const baseTime = new Date('2026-10-16T19:00:00.000Z');
  let clock: DeterministicClock;
  let harness: ConcurrentLifecycleDatabaseHarness;
  let prismaClient: PrismaClient;
  let saleRepo: PrismaSaleRepository;
  let paymentRepo: PrismaPaymentRepository;
  let uow: PrismaSalesUnitOfWork;
  let eventPublisher: InMemoryEventPublisher;
  let cancelSaleHandler: CancelSaleHandler;
  let completePaymentHandler: CompletePaymentHandler;
  let finalizeSaleHandler: FinalizeSaleHandler;

  beforeEach(() => {
    clock = new DeterministicClock(baseTime);
    harness = new ConcurrentLifecycleDatabaseHarness(clock);
    prismaClient = harness.createClient();
    saleRepo = new PrismaSaleRepository(prismaClient);
    paymentRepo = new PrismaPaymentRepository(prismaClient);
    uow = new PrismaSalesUnitOfWork(prismaClient);
    eventPublisher = new InMemoryEventPublisher();

    cancelSaleHandler = new CancelSaleHandler(saleRepo, clock, eventPublisher, paymentRepo, uow);
    completePaymentHandler = new CompletePaymentHandler(
      paymentRepo,
      saleRepo,
      clock,
      eventPublisher,
      uow,
    );
    finalizeSaleHandler = new FinalizeSaleHandler(saleRepo, clock, eventPublisher);
  });

  const seedSaleInDatabase = (params: {
    id: string;
    tenantId: string;
    clientId?: string;
    status: PrismaSaleStatus;
    currency: string;
    subtotal: number;
    discountTotal: number;
    total: number;
    version: number;
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
    harness.sales.set(params.id, {
      id: params.id,
      tenantId: params.tenantId,
      clientId: params.clientId ?? 'client_01',
      sourceType: 'CUSTOM_SERVICE',
      sourceId: 'pos_01',
      sourceCode: null,
      status: params.status,
      currency: params.currency,
      subtotalAmount: new Decimal(params.subtotal),
      discountTotalAmount: new Decimal(params.discountTotal),
      totalAmount: new Decimal(params.total),
      orderDiscountType: null,
      orderDiscountValue: null,
      orderDiscountReason: null,
      cancellationReason: params.status === 'CANCELLED' ? 'Pre-seeded cancel' : null,
      cancelledAt: params.status === 'CANCELLED' ? now : null,
      completedAt: params.status === 'COMPLETED' ? now : null,
      refundedAt: params.status === 'REFUNDED' ? now : null,
      createdAt: now,
      updatedAt: now,
      version: params.version,
    });

    const items = params.items ?? [
      {
        id: `item_${params.id}_01`,
        description: 'Default Test Item',
        quantity: 1,
        unitPrice: params.subtotal,
        subtotal: params.subtotal,
        discountTotal: params.discountTotal,
        total: params.total,
      },
    ];

    for (const item of items) {
      harness.saleItems.set(item.id, {
        id: item.id,
        saleId: params.id,
        sourceType: 'INVENTORY_ITEM',
        sourceId: 'inv_01',
        sourceCode: null,
        description: item.description,
        skuOrCode: 'SKU-01',
        quantity: new Decimal(item.quantity),
        unitPriceAmount: new Decimal(item.unitPrice),
        unitPriceCurrency: params.currency,
        subtotalAmount: new Decimal(item.subtotal),
        discountTotalAmount: new Decimal(item.discountTotal),
        totalAmount: new Decimal(item.total),
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
    harness.payments.set(params.id, {
      id: params.id,
      saleId: params.saleId,
      tenantId: params.tenantId,
      amount: new Decimal(params.amount),
      currency: params.currency,
      status: params.status,
      method: params.method,
      reference: params.reference ?? null,
      paidAt: params.status === 'SETTLED' ? now : null,
      createdAt: now,
      updatedAt: now,
      version: params.version,
    });
  };

  // =========================================================================
  // SCENARIO 1: Sale Total Update vs. Payment Completion
  // =========================================================================
  describe('Scenario 1: Sale total update versus Payment completion', () => {
    it('1.1: rejects cart updates once sale is finalized into PENDING_PAYMENT (assertDraftState)', async () => {
      seedSaleInDatabase({
        id: 'sale_frozen_01',
        tenantId: 'tenant_1',
        status: 'PENDING_PAYMENT',
        currency: 'USD',
        subtotal: 100,
        discountTotal: 0,
        total: 100,
        version: 2,
        items: [
          {
            id: 'item_01',
            description: 'Massage Therapy',
            quantity: 1,
            unitPrice: 100,
            subtotal: 100,
            discountTotal: 0,
            total: 100,
          },
        ],
      });

      const loadedSale = await saleRepo.findById('sale_frozen_01');
      expect(loadedSale).not.toBeNull();
      expect(loadedSale!.status).toBe(SaleStatus.PENDING_PAYMENT);

      // Attempting to add an item must throw SaleAlreadyFinalizedException
      expect(() =>
        loadedSale!.addItem({
          source: SourceReference.create({
            sourceType: SourceType.INVENTORY_ITEM,
            sourceId: 'inv_02',
          }),
          description: 'Lotion',
          quantity: 1,
          unitPrice: Money.create(25, 'USD'),
        }),
      ).toThrow(SaleAlreadyFinalizedException);

      // Attempting to apply a discount must throw SaleAlreadyFinalizedException
      expect(() =>
        loadedSale!.applyOrderDiscount(Discount.percentage(10, 'Promo discount')),
      ).toThrow(SaleAlreadyFinalizedException);
    });

    it('1.2: prevents race between draft finalization and concurrent item addition via OCC', async () => {
      seedSaleInDatabase({
        id: 'sale_draft_race_01',
        tenantId: 'tenant_1',
        status: 'DRAFT',
        currency: 'USD',
        subtotal: 50,
        discountTotal: 0,
        total: 50,
        version: 1,
        items: [
          {
            id: 'item_01',
            description: 'Item 1',
            quantity: 1,
            unitPrice: 50,
            subtotal: 50,
            discountTotal: 0,
            total: 50,
          },
        ],
      });

      const cashier1Sale = await saleRepo.findById('sale_draft_race_01');
      const cashier2Sale = await saleRepo.findById('sale_draft_race_01');

      // Cashier 1 adds an item to the draft and saves (version: 1 -> 2 in DRAFT)
      cashier1Sale!.addItem({
        source: SourceReference.create({
          sourceType: SourceType.INVENTORY_ITEM,
          sourceId: 'inv_02',
        }),
        description: 'Item 2',
        quantity: 1,
        unitPrice: Money.create(30, 'USD'),
      });
      await saleRepo.save(cashier1Sale!);
      expect(harness.sales.get('sale_draft_race_01')!.version).toBe(2);

      // Cashier 2 (holding stale version 1) attempts to finalize
      cashier2Sale!.finalize(clock);
      await expect(saleRepo.save(cashier2Sale!)).rejects.toThrow(SaleOptimisticLockException);

      // Database state remains uncorrupted at version 2 DRAFT
      const persisted = harness.sales.get('sale_draft_race_01');
      expect(persisted!.version).toBe(2);
      expect(persisted!.status).toBe('DRAFT');
    });

    it('1.3: preserves total and currency immutability when payment completes on finalized sale', async () => {
      seedSaleInDatabase({
        id: 'sale_pay_immutable_01',
        tenantId: 'tenant_1',
        status: 'PENDING_PAYMENT',
        currency: 'USD',
        subtotal: 100,
        discountTotal: 0,
        total: 100,
        version: 2,
        items: [
          {
            id: 'item_01',
            description: 'Session',
            quantity: 1,
            unitPrice: 100,
            subtotal: 100,
            discountTotal: 0,
            total: 100,
          },
        ],
      });

      seedPaymentInDatabase({
        id: 'pay_01',
        saleId: 'sale_pay_immutable_01',
        tenantId: 'tenant_1',
        amount: 100,
        currency: 'USD',
        status: 'PENDING',
        method: 'QR',
        version: 1,
        reference: 'AUTH-1234',
      });

      const completeResult = await completePaymentHandler.execute(
        new CompletePaymentCommand({
          paymentId: 'pay_01',
          saleId: 'sale_pay_immutable_01',
          tenantId: 'tenant_1',
          reference: 'AUTH-1234',
          paidAt: clock.now(),
          currentUser: AUTHORIZED_USER,
        }),
      );

      expect(completeResult.isSuccess).toBe(true);
      const saleInDb = harness.sales.get('sale_pay_immutable_01')!;
      expect(saleInDb.status).toBe('PAID');
      expect(saleInDb.currency).toBe('USD');
      expect(Number(saleInDb.totalAmount)).toBe(100);
      expect(saleInDb.version).toBe(3);
    });
  });

  // =========================================================================
  // SCENARIO 2: Sale Cancellation vs. Payment Completion
  // =========================================================================
  describe('Scenario 2: Sale cancellation versus Payment completion', () => {
    it('2.1: Payment completes first -> subsequent Cancellation is rejected by domain', async () => {
      seedSaleInDatabase({
        id: 'sale_race_cancel_pay_01',
        tenantId: 'tenant_1',
        status: 'PENDING_PAYMENT',
        currency: 'USD',
        subtotal: 150,
        discountTotal: 0,
        total: 150,
        version: 2,
        items: [
          {
            id: 'item_01',
            description: 'Gym Pass',
            quantity: 1,
            unitPrice: 150,
            subtotal: 150,
            discountTotal: 0,
            total: 150,
          },
        ],
      });

      seedPaymentInDatabase({
        id: 'pay_concurrent_01',
        saleId: 'sale_race_cancel_pay_01',
        tenantId: 'tenant_1',
        amount: 150,
        currency: 'USD',
        status: 'PENDING',
        method: 'QR',
        version: 1,
        reference: 'CARD-REF-99',
      });

      // Thread A: Payment completes first
      const paymentResult = await completePaymentHandler.execute(
        new CompletePaymentCommand({
          paymentId: 'pay_concurrent_01',
          saleId: 'sale_race_cancel_pay_01',
          tenantId: 'tenant_1',
          reference: 'CARD-REF-99',
          paidAt: clock.now(),
          currentUser: AUTHORIZED_USER,
        }),
      );
      expect(paymentResult.isSuccess).toBe(true);
      expect(harness.sales.get('sale_race_cancel_pay_01')!.status).toBe('PAID');
      expect(harness.sales.get('sale_race_cancel_pay_01')!.version).toBe(3);

      // Thread B: Cancellation request arrives after payment completed
      const cancelResult = await cancelSaleHandler.execute(
        new CancelSaleCommand({
          saleId: 'sale_race_cancel_pay_01',
          tenantId: 'tenant_1',
          reason: 'Customer walked away',
          currentUser: AUTHORIZED_USER,
        }),
      );

      // Domain rejects cancelling a PAID sale
      expect(cancelResult.isFailure).toBe(true);
      const error = cancelResult.getError();
      expect(error).toBeInstanceOf(InvalidSaleTransitionException);
      expect((error as Error).message).toContain('PAID');

      // State remains safely PAID
      expect(harness.sales.get('sale_race_cancel_pay_01')!.status).toBe('PAID');
      expect(harness.sales.get('sale_race_cancel_pay_01')!.version).toBe(3);
    });

    it('2.2: Cancellation commits first -> subsequent Payment completion is rejected', async () => {
      seedSaleInDatabase({
        id: 'sale_race_pay_cancel_02',
        tenantId: 'tenant_1',
        status: 'PENDING_PAYMENT',
        currency: 'USD',
        subtotal: 80,
        discountTotal: 0,
        total: 80,
        version: 2,
        items: [
          {
            id: 'item_01',
            description: 'Protein Shake',
            quantity: 10,
            unitPrice: 8,
            subtotal: 80,
            discountTotal: 0,
            total: 80,
          },
        ],
      });

      seedPaymentInDatabase({
        id: 'pay_concurrent_02',
        saleId: 'sale_race_pay_cancel_02',
        tenantId: 'tenant_1',
        amount: 80,
        currency: 'USD',
        status: 'PENDING',
        method: 'QR',
        version: 1,
        reference: 'QR-REF-888',
      });

      // Thread A: Cancellation executes first
      const cancelResult = await cancelSaleHandler.execute(
        new CancelSaleCommand({
          saleId: 'sale_race_pay_cancel_02',
          tenantId: 'tenant_1',
          reason: 'Customer declined order',
          currentUser: AUTHORIZED_USER,
        }),
      );
      expect(cancelResult.isSuccess).toBe(true);
      expect(harness.sales.get('sale_race_pay_cancel_02')!.status).toBe('CANCELLED');
      expect(harness.sales.get('sale_race_pay_cancel_02')!.version).toBe(3);

      // Thread B: Payment completion attempts to execute against cancelled sale
      const paymentResult = await completePaymentHandler.execute(
        new CompletePaymentCommand({
          paymentId: 'pay_concurrent_02',
          saleId: 'sale_race_pay_cancel_02',
          tenantId: 'tenant_1',
          reference: 'QR-REF-888',
          paidAt: clock.now(),
          currentUser: AUTHORIZED_USER,
        }),
      );

      // Completion must fail with SaleCannotBeMarkedPaidException or InvalidPaymentTransitionException
      expect(paymentResult.isFailure).toBe(true);
      const error = paymentResult.getError();
      expect(
        error instanceof SaleCannotBeMarkedPaidException ||
          error instanceof InvalidPaymentTransitionException,
      ).toBe(true);

      // Sale remains CANCELLED and payment is CANCELLED (not settled)
      expect(harness.sales.get('sale_race_pay_cancel_02')!.status).toBe('CANCELLED');
      expect(harness.payments.get('pay_concurrent_02')!.status).toBe('CANCELLED');
    });

    it('2.3: ADR-0140 §3.F.3: automatically cancels active PENDING payments when Sale is cancelled', async () => {
      seedSaleInDatabase({
        id: 'sale_pending_tender_01',
        tenantId: 'tenant_1',
        status: 'PENDING_PAYMENT',
        currency: 'USD',
        subtotal: 120,
        discountTotal: 0,
        total: 120,
        version: 2,
        items: [
          {
            id: 'item_01',
            description: 'Item',
            quantity: 1,
            unitPrice: 120,
            subtotal: 120,
            discountTotal: 0,
            total: 120,
          },
        ],
      });

      seedPaymentInDatabase({
        id: 'pay_pending_tender_01',
        saleId: 'sale_pending_tender_01',
        tenantId: 'tenant_1',
        amount: 60,
        currency: 'USD',
        status: 'PENDING',
        method: 'QR',
        version: 1,
        reference: 'QR-PENDING-1',
      });

      seedPaymentInDatabase({
        id: 'pay_pending_tender_02',
        saleId: 'sale_pending_tender_01',
        tenantId: 'tenant_1',
        amount: 60,
        currency: 'USD',
        status: 'PENDING',
        method: 'CASH',
        version: 1,
      });

      const cancelResult = await cancelSaleHandler.execute(
        new CancelSaleCommand({
          saleId: 'sale_pending_tender_01',
          tenantId: 'tenant_1',
          reason: 'Customer abandoned register',
          currentUser: AUTHORIZED_USER,
        }),
      );

      expect(cancelResult.isSuccess).toBe(true);
      expect(harness.sales.get('sale_pending_tender_01')!.status).toBe('CANCELLED');

      // Both pending tenders are auto-cancelled in the same transaction
      expect(harness.payments.get('pay_pending_tender_01')!.status).toBe('CANCELLED');
      expect(harness.payments.get('pay_pending_tender_02')!.status).toBe('CANCELLED');
    });

    it('2.4: preserves historical COMPLETED payments when cancelling a PARTIALLY_PAID sale (BR-PAY-10)', async () => {
      seedSaleInDatabase({
        id: 'sale_partial_cancel_01',
        tenantId: 'tenant_1',
        status: 'PARTIALLY_PAID',
        currency: 'USD',
        subtotal: 200,
        discountTotal: 0,
        total: 200,
        version: 3,
        items: [
          {
            id: 'item_01',
            description: 'Item',
            quantity: 2,
            unitPrice: 100,
            subtotal: 200,
            discountTotal: 0,
            total: 200,
          },
        ],
      });

      // Historical completed payment: $100 cash tender
      seedPaymentInDatabase({
        id: 'pay_completed_historical_01',
        saleId: 'sale_partial_cancel_01',
        tenantId: 'tenant_1',
        amount: 100,
        currency: 'USD',
        status: 'SETTLED',
        method: 'CASH',
        version: 2,
      });

      // Active pending second split tender: $100 QR tender
      seedPaymentInDatabase({
        id: 'pay_pending_split_02',
        saleId: 'sale_partial_cancel_01',
        tenantId: 'tenant_1',
        amount: 100,
        currency: 'USD',
        status: 'PENDING',
        method: 'QR',
        version: 1,
        reference: 'QR-SPLIT-999',
      });

      const cancelResult = await cancelSaleHandler.execute(
        new CancelSaleCommand({
          saleId: 'sale_partial_cancel_01',
          tenantId: 'tenant_1',
          reason: 'Client unable to pay remaining balance',
          currentUser: AUTHORIZED_USER,
        }),
      );

      expect(cancelResult.isSuccess).toBe(true);
      expect(harness.sales.get('sale_partial_cancel_01')!.status).toBe('CANCELLED');

      // Historical completed payment is completely preserved (NOT cancelled, NOT deleted)
      expect(harness.payments.get('pay_completed_historical_01')!.status).toBe('SETTLED');

      // Pending second tender is cancelled
      expect(harness.payments.get('pay_pending_split_02')!.status).toBe('CANCELLED');
    });
  });

  // =========================================================================
  // SCENARIO 3: Two Concurrent Updates to the Same Sale
  // =========================================================================
  describe('Scenario 3: Two concurrent updates to the same Sale', () => {
    it('3.1: concurrent draft item additions on same version result in exactly one success and one OCC failure', async () => {
      seedSaleInDatabase({
        id: 'sale_concurrent_items_01',
        tenantId: 'tenant_1',
        status: 'DRAFT',
        currency: 'USD',
        subtotal: 50,
        discountTotal: 0,
        total: 50,
        version: 1,
        items: [
          {
            id: 'item_initial_01',
            description: 'Item 1',
            quantity: 1,
            unitPrice: 50,
            subtotal: 50,
            discountTotal: 0,
            total: 50,
          },
        ],
      });

      // Worker 1 and Worker 2 load the sale at version 1
      const sale1 = await saleRepo.findById('sale_concurrent_items_01');
      const sale2 = await saleRepo.findById('sale_concurrent_items_01');
      expect(sale1!.version).toBe(1);
      expect(sale2!.version).toBe(1);

      sale1!.addItem({
        source: SourceReference.create({
          sourceType: SourceType.INVENTORY_ITEM,
          sourceId: 'inv_worker_1',
        }),
        description: 'Added by Worker 1',
        quantity: 1,
        unitPrice: Money.create(20, 'USD'),
      });

      sale2!.addItem({
        source: SourceReference.create({
          sourceType: SourceType.INVENTORY_ITEM,
          sourceId: 'inv_worker_2',
        }),
        description: 'Added by Worker 2',
        quantity: 1,
        unitPrice: Money.create(40, 'USD'),
      });

      // Worker 1 saves first -> version becomes 2
      await saleRepo.save(sale1!);
      expect(harness.sales.get('sale_concurrent_items_01')!.version).toBe(2);

      // Worker 2 attempts to save with stale base version 1 -> throws SaleOptimisticLockException
      await expect(saleRepo.save(sale2!)).rejects.toThrow(SaleOptimisticLockException);

      // Verify no lost updates occurred: database total matches worker 1 addition exactly
      const reloaded = await saleRepo.findById('sale_concurrent_items_01');
      expect(reloaded!.total.amount).toBe(70);
      expect(reloaded!.items).toHaveLength(2);
    });

    it('3.2: concurrent discount application vs line item removal on DRAFT sale triggers OCC conflict', async () => {
      seedSaleInDatabase({
        id: 'sale_discount_race_01',
        tenantId: 'tenant_1',
        status: 'DRAFT',
        currency: 'USD',
        subtotal: 100,
        discountTotal: 0,
        total: 100,
        version: 1,
        items: [
          {
            id: 'item_removable_01',
            description: 'Item A',
            quantity: 2,
            unitPrice: 50,
            subtotal: 100,
            discountTotal: 0,
            total: 100,
          },
        ],
      });

      const workerA = await saleRepo.findById('sale_discount_race_01');
      const workerB = await saleRepo.findById('sale_discount_race_01');

      workerA!.applyOrderDiscount(Discount.fixedAmount(15, 'Manager voucher'));
      workerB!.removeItem(workerB!.items[0]!.id);

      // Worker A saves successfully -> v2
      await saleRepo.save(workerA!);
      expect(harness.sales.get('sale_discount_race_01')!.version).toBe(2);

      // Worker B fails OCC collision
      await expect(saleRepo.save(workerB!)).rejects.toThrow(SaleOptimisticLockException);
    });
  });

  // =========================================================================
  // SCENARIO 4: Two Concurrent Sale Cancellation Requests
  // =========================================================================
  describe('Scenario 4: Two concurrent Sale cancellation requests', () => {
    it('4.1: two racing cancellations result in exactly one success and one failure without corrupting version', async () => {
      seedSaleInDatabase({
        id: 'sale_double_cancel_01',
        tenantId: 'tenant_1',
        status: 'PENDING_PAYMENT',
        currency: 'USD',
        subtotal: 100,
        discountTotal: 0,
        total: 100,
        version: 2,
        items: [
          {
            id: 'item_01',
            description: 'Item',
            quantity: 1,
            unitPrice: 100,
            subtotal: 100,
            discountTotal: 0,
            total: 100,
          },
        ],
      });

      // Simultaneous cancel commands
      const cmd1 = new CancelSaleCommand({
        saleId: 'sale_double_cancel_01',
        tenantId: 'tenant_1',
        reason: 'Client changed mind',
        currentUser: AUTHORIZED_USER,
      });

      const cmd2 = new CancelSaleCommand({
        saleId: 'sale_double_cancel_01',
        tenantId: 'tenant_1',
        reason: 'Register timeout',
        currentUser: AUTHORIZED_USER,
      });

      const [res1, res2] = await Promise.all([
        cancelSaleHandler.execute(cmd1),
        cancelSaleHandler.execute(cmd2),
      ]);

      const successCount = (res1.isSuccess ? 1 : 0) + (res2.isSuccess ? 1 : 0);
      const failureCount = (res1.isFailure ? 1 : 0) + (res2.isFailure ? 1 : 0);

      expect(successCount).toBe(1);
      expect(failureCount).toBe(1);

      // The losing request must have thrown an optimistic lock error or transition error
      const failedResult = res1.isFailure ? res1 : res2;
      const error = failedResult.getError();
      expect(
        error instanceof SaleOptimisticLockException ||
          error instanceof InvalidSaleTransitionException,
      ).toBe(true);

      // Persisted sale is CANCELLED at version 3
      const saleInDb = harness.sales.get('sale_double_cancel_01')!;
      expect(saleInDb.status).toBe('CANCELLED');
      expect(saleInDb.version).toBe(3);
    });

    it('4.2: sequential re-cancellation cleanly fails domain transition check', async () => {
      seedSaleInDatabase({
        id: 'sale_already_cancelled_01',
        tenantId: 'tenant_1',
        status: 'CANCELLED',
        currency: 'USD',
        subtotal: 100,
        discountTotal: 0,
        total: 100,
        version: 3,
        items: [
          {
            id: 'item_canc_01',
            description: 'Item',
            quantity: 1,
            unitPrice: 100,
            subtotal: 100,
            discountTotal: 0,
            total: 100,
          },
        ],
      });

      const result = await cancelSaleHandler.execute(
        new CancelSaleCommand({
          saleId: 'sale_already_cancelled_01',
          tenantId: 'tenant_1',
          reason: 'Duplicate cancel',
          currentUser: AUTHORIZED_USER,
        }),
      );

      expect(result.isFailure).toBe(true);
      const error = result.getError();
      expect(error).toBeInstanceOf(InvalidSaleTransitionException);
      expect((error as Error).message).toContain('CANCELLED');
      expect(harness.sales.get('sale_already_cancelled_01')!.version).toBe(3);
    });
  });

  // =========================================================================
  // SCENARIO 5: Stale Version Attempting to Modify a Newer Sale
  // =========================================================================
  describe('Scenario 5: Stale version attempting to modify a newer Sale', () => {
    it('5.1: saving with an out-of-date version directly throws SaleOptimisticLockException', async () => {
      seedSaleInDatabase({
        id: 'sale_stale_occ_01',
        tenantId: 'tenant_1',
        status: 'PENDING_PAYMENT',
        currency: 'USD',
        subtotal: 100,
        discountTotal: 0,
        total: 100,
        version: 5, // Database is already at version 5
        items: [
          {
            id: 'item_01',
            description: 'Item',
            quantity: 1,
            unitPrice: 100,
            subtotal: 100,
            discountTotal: 0,
            total: 100,
          },
        ],
      });

      // Construct a Sale aggregate instance holding stale version 2
      const loaded = await saleRepo.findById('sale_stale_occ_01');
      // Intentionally simulate stale version in memory
      (loaded as unknown as { _version: number })._version = 2;

      loaded!.cancel('Late cancel', clock); // transitions status to CANCELLED, increments stale version 2 -> 3
      // When saving, priorVersion is 2, but DB has version 5
      await expect(saleRepo.save(loaded!)).rejects.toThrow(SaleOptimisticLockException);

      // Verify DB version and status remain intact at version 5
      expect(harness.sales.get('sale_stale_occ_01')!.version).toBe(5);
      expect(harness.sales.get('sale_stale_occ_01')!.status).toBe('PENDING_PAYMENT');
    });

    it('5.2: stale client attempting to finalize an already finalized sale is rejected', async () => {
      seedSaleInDatabase({
        id: 'sale_stale_finalize_01',
        tenantId: 'tenant_1',
        status: 'DRAFT',
        currency: 'USD',
        subtotal: 50,
        discountTotal: 0,
        total: 50,
        version: 1,
        items: [
          {
            id: 'item_01',
            description: 'Item',
            quantity: 1,
            unitPrice: 50,
            subtotal: 50,
            discountTotal: 0,
            total: 50,
          },
        ],
      });

      // Cashier 1 finalizes the sale
      const finalizeRes = await finalizeSaleHandler.execute(
        new FinalizeSaleCommand({
          saleId: 'sale_stale_finalize_01',
          tenantId: 'tenant_1',
          currentUser: AUTHORIZED_USER,
        }),
      );
      expect(finalizeRes.isSuccess).toBe(true);
      expect(harness.sales.get('sale_stale_finalize_01')!.version).toBe(2);

      // Cashier 2 re-attempts finalization
      const secondFinalize = await finalizeSaleHandler.execute(
        new FinalizeSaleCommand({
          saleId: 'sale_stale_finalize_01',
          tenantId: 'tenant_1',
          currentUser: AUTHORIZED_USER,
        }),
      );
      expect(secondFinalize.isFailure).toBe(true);
      expect(secondFinalize.getError()).toBeInstanceOf(InvalidSaleTransitionException);
    });
  });

  // =========================================================================
  // SCENARIO 6: Other Incompatible Transitions & Receipt Snapshot Immutability
  // =========================================================================
  describe('Scenario 6: Other incompatible transitions and Receipt snapshot immutability', () => {
    it('6.1: rejects cancellation on COMPLETED and REFUNDED terminal sales', async () => {
      seedSaleInDatabase({
        id: 'sale_completed_terminal_01',
        tenantId: 'tenant_1',
        status: 'COMPLETED',
        currency: 'USD',
        subtotal: 100,
        discountTotal: 0,
        total: 100,
        version: 4,
        items: [
          {
            id: 'item_comp_01',
            description: 'Item',
            quantity: 1,
            unitPrice: 100,
            subtotal: 100,
            discountTotal: 0,
            total: 100,
          },
        ],
      });

      const cancelCompletedRes = await cancelSaleHandler.execute(
        new CancelSaleCommand({
          saleId: 'sale_completed_terminal_01',
          tenantId: 'tenant_1',
          reason: 'Void completed order',
          currentUser: AUTHORIZED_USER,
        }),
      );
      expect(cancelCompletedRes.isFailure).toBe(true);
      const errCompleted = cancelCompletedRes.getError();
      expect(errCompleted).toBeInstanceOf(InvalidSaleTransitionException);
      expect((errCompleted as Error).message).toContain('COMPLETED');

      seedSaleInDatabase({
        id: 'sale_refunded_terminal_01',
        tenantId: 'tenant_1',
        status: 'REFUNDED',
        currency: 'USD',
        subtotal: 100,
        discountTotal: 0,
        total: 100,
        version: 5,
        items: [
          {
            id: 'item_ref_01',
            description: 'Item',
            quantity: 1,
            unitPrice: 100,
            subtotal: 100,
            discountTotal: 0,
            total: 100,
          },
        ],
      });

      const cancelRefundedRes = await cancelSaleHandler.execute(
        new CancelSaleCommand({
          saleId: 'sale_refunded_terminal_01',
          tenantId: 'tenant_1',
          reason: 'Void refunded order',
          currentUser: AUTHORIZED_USER,
        }),
      );
      expect(cancelRefundedRes.isFailure).toBe(true);
      const errRefunded = cancelRefundedRes.getError();
      expect(errRefunded).toBeInstanceOf(InvalidSaleTransitionException);
      expect((errRefunded as Error).message).toContain('REFUNDED');
    });

    it('6.2: rejects payment completion when sale is in DRAFT status', async () => {
      seedSaleInDatabase({
        id: 'sale_draft_payment_01',
        tenantId: 'tenant_1',
        status: 'DRAFT',
        currency: 'USD',
        subtotal: 50,
        discountTotal: 0,
        total: 50,
        version: 1,
        items: [
          {
            id: 'item_draft_01',
            description: 'Item',
            quantity: 1,
            unitPrice: 50,
            subtotal: 50,
            discountTotal: 0,
            total: 50,
          },
        ],
      });

      seedPaymentInDatabase({
        id: 'pay_draft_sale_01',
        saleId: 'sale_draft_payment_01',
        tenantId: 'tenant_1',
        amount: 50,
        currency: 'USD',
        status: 'PENDING',
        method: 'CASH',
        version: 1,
      });

      const completeResult = await completePaymentHandler.execute(
        new CompletePaymentCommand({
          paymentId: 'pay_draft_sale_01',
          saleId: 'sale_draft_payment_01',
          tenantId: 'tenant_1',
          currentUser: AUTHORIZED_USER,
        }),
      );

      expect(completeResult.isFailure).toBe(true);
      const error = completeResult.getError();
      expect(error).toBeInstanceOf(SaleCannotBeMarkedPaidException);
      expect((error as Error).message).toContain('DRAFT');
    });

    it('6.3: preserves historical Receipt snapshot behavior when sale or payment is subsequently mutated', async () => {
      // Seed a historical completed sale and payment
      seedSaleInDatabase({
        id: 'sale_with_receipt_01',
        tenantId: 'tenant_1',
        status: 'PAID',
        currency: 'USD',
        subtotal: 100,
        discountTotal: 0,
        total: 100,
        version: 3,
        items: [
          {
            id: 'item_rcpt_01',
            description: 'Physiotherapy Consultation',
            quantity: 1,
            unitPrice: 100,
            subtotal: 100,
            discountTotal: 0,
            total: 100,
          },
        ],
      });

      seedPaymentInDatabase({
        id: 'pay_rcpt_01',
        saleId: 'sale_with_receipt_01',
        tenantId: 'tenant_1',
        amount: 100,
        currency: 'USD',
        status: 'SETTLED',
        method: 'QR',
        version: 2,
        reference: 'AUTH-FINAL-01',
      });

      // Seed historical receipt snapshot
      const receiptId = 'rcpt_snap_001';
      harness.receipts.set(receiptId, {
        id: receiptId,
        tenantId: 'tenant_1',
        saleId: 'sale_with_receipt_01',
        receiptNumber: 'RCP-2026-0001',
        saleReference: 'REF-SALE-01',
        issuedAt: clock.now(),
        clientSnapshot: { id: 'client_01', name: 'John Doe' },
        itemsSnapshot: [{ description: 'Physiotherapy Consultation', amount: 100 }],
        paymentsSnapshot: [{ method: 'QR', amount: 100, reference: 'AUTH-FINAL-01' }],
        subtotalAmount: new Decimal(100),
        discountTotalAmount: new Decimal(0),
        totalAmount: new Decimal(100),
        currency: 'USD',
        status: 'ISSUED',
        reprintCount: 0,
        lastReprintedAt: null,
        version: 1,
        createdAt: clock.now(),
        updatedAt: clock.now(),
      });

      // Subsequent attempt to cancel the sale is rejected
      const cancelAttempt = await cancelSaleHandler.execute(
        new CancelSaleCommand({
          saleId: 'sale_with_receipt_01',
          tenantId: 'tenant_1',
          reason: 'Late cancellation attempt',
          currentUser: AUTHORIZED_USER,
        }),
      );
      expect(cancelAttempt.isFailure).toBe(true);

      // Receipt snapshot is unchanged and intact
      const receipt = harness.receipts.get(receiptId)!;
      expect(receipt.status).toBe('ISSUED');
      expect(Number(receipt.totalAmount)).toBe(100);
      expect(receipt.receiptNumber).toBe('RCP-2026-0001');
      expect(receipt.version).toBe(1);
    });
  });
});
