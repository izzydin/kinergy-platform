import { Prisma, PrismaClient } from '@prisma/client';
import { IssueReceiptHandler } from '../application/handlers/issue-receipt.handler';
import { IssueReceiptCommand } from '../application/commands/issue-receipt.command';
import { ReceiptRepositoryPort } from '../application/ports/receipt-repository.port';
import { SaleRepositoryPort } from '../application/ports/sale-repository.port';
import { PaymentRepositoryPort } from '../application/ports/payment-repository.port';
import { Sale } from '../domain/sale.aggregate';
import { SaleId } from '../domain/value-objects/sale-id.vo';
import { SaleStatus } from '../domain/enums/sale-status.enum';
import { Payment } from '../domain/payment.aggregate';
import { PaymentId } from '../domain/value-objects/payment-id.vo';
import { PaymentStatus } from '../domain/enums/payment-status.enum';
import { PaymentMethod } from '../domain/enums/payment-method.enum';
import { PaymentReference } from '../domain/value-objects/payment-reference.vo';
import { Money } from '../domain/value-objects/money.vo';
import { Discount } from '../domain/value-objects/discount.vo';
import { SaleItem } from '../domain/entities/sale-item.entity';
import { SaleItemId } from '../domain/value-objects/sale-item-id.vo';
import { SourceReference } from '../domain/value-objects/source-reference.vo';
import { SourceType } from '../domain/enums/source-type.enum';
import { DeterministicClock } from '../domain/shared/clock';
import { Receipt } from '../domain/receipt.aggregate';
import { ReceiptId } from '../domain/value-objects/receipt-id.vo';
import { ReceiptNumber } from '../domain/value-objects/receipt-number.vo';
import { DuplicateReceiptException } from '../domain/exceptions/duplicate-receipt.exception';
import { PrismaReceiptRepository } from '../infrastructure/persistence/prisma/repositories/prisma-receipt.repository';
import { PrismaReceiptMapper } from '../infrastructure/persistence/prisma/mappers/prisma-receipt.mapper';

// ============================================================================
// Test Support & Concurrency Harness
// ============================================================================

/**
 * Concurrency-aware ThreadSafeAsyncReceiptRepository that simulates
 * real database I/O latency, concurrency interleaving, and unique constraint
 * enforcement on (tenantId, saleId).
 */
class ThreadSafeAsyncReceiptRepository implements ReceiptRepositoryPort {
  private readonly store = new Map<string, Receipt>();
  private readonly sequenceCounters = new Map<string, number>();
  public sequenceCalls = 0;
  public saveCalls = 0;
  public uniqueCollisionsSimulated = 0;

  constructor(private readonly simulatedIoLatencyMs = 5) {}

  public async findById(id: ReceiptId | string): Promise<Receipt | null> {
    await this.delay();
    const idStr = typeof id === 'string' ? id.trim() : id.value;
    for (const r of this.store.values()) {
      if (r.id.value === idStr) return r;
    }
    return null;
  }

  public async findBySaleId(saleId: SaleId | string): Promise<Receipt | null> {
    await this.delay();
    const sId = typeof saleId === 'string' ? saleId.trim() : saleId.value;
    for (const r of this.store.values()) {
      if (r.saleId.value === sId) return r;
    }
    return null;
  }

  public async findByReceiptNumber(receiptNumber: ReceiptNumber | string): Promise<Receipt | null> {
    await this.delay();
    const num = typeof receiptNumber === 'string' ? receiptNumber.trim() : receiptNumber.value;
    for (const r of this.store.values()) {
      if (r.receiptNumber.value === num) return r;
    }
    return null;
  }

  public async getNextReceiptNumber(tenantId: string, year: number): Promise<ReceiptNumber> {
    this.sequenceCalls++;
    await this.delay();
    const key = `${tenantId}:${year}`;
    const nextVal = (this.sequenceCounters.get(key) ?? 0) + 1;
    this.sequenceCounters.set(key, nextVal);
    return ReceiptNumber.fromParts(year, nextVal);
  }

  public async save(receipt: Receipt): Promise<void> {
    this.saveCalls++;
    await this.delay();

    const compositeKey = `${receipt.tenantId}:${receipt.saleId.value}`;

    if (receipt.version === 1) {
      // Simulate PostgreSQL unique constraint check on (tenantId, saleId)
      if (this.store.has(compositeKey)) {
        this.uniqueCollisionsSimulated++;
        throw new DuplicateReceiptException(receipt.saleId.value, receipt.tenantId);
      }
      this.store.set(compositeKey, receipt);
    } else {
      this.store.set(compositeKey, receipt);
    }
  }

  public getPersistedCount(): number {
    return this.store.size;
  }

  public getAll(): Receipt[] {
    return Array.from(this.store.values());
  }

  private async delay(): Promise<void> {
    if (this.simulatedIoLatencyMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, this.simulatedIoLatencyMs));
    }
  }
}

class InMemorySaleRepository implements SaleRepositoryPort {
  private readonly sales = new Map<string, Sale>();

  public add(sale: Sale): void {
    this.sales.set(sale.id.value, sale);
  }

  public async findById(id: SaleId | string): Promise<Sale | null> {
    const sId = typeof id === 'string' ? id.trim() : id.value;
    return this.sales.get(sId) ?? null;
  }

  public async save(sale: Sale): Promise<void> {
    this.sales.set(sale.id.value, sale);
  }
}

class InMemoryPaymentRepository implements PaymentRepositoryPort {
  private readonly payments = new Map<string, Payment[]>();

  public add(payment: Payment): void {
    const list = this.payments.get(payment.saleId.value) ?? [];
    list.push(payment);
    this.payments.set(payment.saleId.value, list);
  }

  public async findById(): Promise<Payment | null> {
    return null;
  }

  public async findBySaleId(saleId: SaleId | string): Promise<Payment[]> {
    const sId = typeof saleId === 'string' ? saleId.trim() : saleId.value;
    return this.payments.get(sId) ?? [];
  }

  public async save(payment: Payment): Promise<void> {
    this.add(payment);
  }
}

// ============================================================================
// Fixture Factories
// ============================================================================

const t0 = new Date('2026-09-25T11:00:00.000Z');

function createSettledSaleFixture(opts?: {
  saleId?: string;
  tenantId?: string;
  subtotal?: number;
  discountTotal?: number;
  total?: number;
  status?: SaleStatus;
}): Sale {
  const saleId = SaleId.create(opts?.saleId ?? 'sale_race_100');
  const tenantId = opts?.tenantId ?? 'tenant_wellness_center';
  const status = opts?.status ?? SaleStatus.PAID;

  const subtotalAmount = opts?.subtotal ?? opts?.total ?? 150.0;
  const discountAmount = opts?.discountTotal ?? 0.0;
  const totalAmount = opts?.total ?? subtotalAmount - discountAmount;

  const item = SaleItem.create({
    id: SaleItemId.create('item_race_1'),
    source: SourceReference.create({
      sourceType: SourceType.MEMBERSHIP_PLAN,
      sourceId: 'mem_plan_001',
    }),
    description: 'Annual Gym Membership',
    skuOrCode: 'GYM-ANN',
    quantity: 1,
    unitPrice: Money.create(subtotalAmount, 'USD'),
  });

  const subtotal = Money.create(subtotalAmount, 'USD');
  const discountTotal = Money.create(discountAmount, 'USD');
  const total = Money.create(totalAmount, 'USD');

  return Sale.reconstitute({
    id: saleId,
    tenantId,
    clientId: 'client_marathoner',
    status,
    currency: 'USD',
    source: SourceReference.create({
      sourceType: SourceType.MEMBERSHIP_PLAN,
      sourceId: 'mem_order_1',
    }),
    items: [item],
    orderDiscount: discountTotal.isPositive() ? Discount.fixed(discountTotal.amount) : null,
    subtotal,
    discountTotal,
    total,
    version: 1,
    completedAt: status === SaleStatus.COMPLETED ? t0 : undefined,
    cancelledAt: status === SaleStatus.CANCELLED ? t0 : undefined,
    cancellationReason: status === SaleStatus.CANCELLED ? 'Cancelled in race test' : undefined,
    createdAt: t0,
    updatedAt: t0,
  });
}

function createCompletedPaymentFixture(sale: Sale, amount?: Money): Payment {
  return Payment.reconstitute({
    id: PaymentId.create('pay_race_' + Math.random().toString(36).substring(7)),
    saleId: sale.id,
    tenantId: sale.tenantId ?? 'tenant_wellness_center',
    method: PaymentMethod.CASH,
    status: PaymentStatus.COMPLETED,
    amount: amount ?? sale.total,
    reference: PaymentReference.create('REF-RACE-001'),
    paidAt: t0,
    version: 1,
    createdAt: t0,
    updatedAt: t0,
  });
}

const AUTHORIZED_USER = {
  id: 'usr_cashier_01',
  roles: ['Receptionist'],
  permissions: ['receipts.manage'],
};

function extractErrorMessage(result: { getError(): unknown }): string {
  const err = result.getError();
  return err instanceof Error ? err.message : String(err);
}

// ============================================================================
// CONCURRENCY & IDEMPOTENCY TEST SUITE
// ============================================================================

describe('Receipt Issuance Concurrency, Idempotency & Database Integrity', () => {
  let clock: DeterministicClock;
  let receiptRepo: ThreadSafeAsyncReceiptRepository;
  let saleRepo: InMemorySaleRepository;
  let paymentRepo: InMemoryPaymentRepository;
  let handler: IssueReceiptHandler;

  beforeEach(() => {
    clock = new DeterministicClock(t0);
    receiptRepo = new ThreadSafeAsyncReceiptRepository(5); // 5ms simulated async delay
    saleRepo = new InMemorySaleRepository();
    paymentRepo = new InMemoryPaymentRepository();
    handler = new IssueReceiptHandler(receiptRepo, saleRepo, paymentRepo, undefined, clock);
  });

  // ==========================================================================
  // 1. The Critical Race: Request A and Request B racing simultaneously
  // ==========================================================================
  describe('1. The Critical Race: Concurrent Issuance for the Same Sale', () => {
    it('prevents duplicate Receipts when Request A and Request B race past in-memory check', async () => {
      const sale = createSettledSaleFixture({ saleId: 'sale_critical_race_1' });
      const payment = createCompletedPaymentFixture(sale);
      saleRepo.add(sale);
      paymentRepo.add(payment);

      const commandA = new IssueReceiptCommand({
        saleId: sale.id.value,
        tenantId: sale.tenantId,
        currentUser: AUTHORIZED_USER,
      });

      const commandB = new IssueReceiptCommand({
        saleId: sale.id.value,
        tenantId: sale.tenantId,
        currentUser: AUTHORIZED_USER,
      });

      // Execute both requests concurrently via Promise.all
      const [resultA, resultB] = await Promise.all([
        handler.execute(commandA),
        handler.execute(commandB),
      ]);

      // Both callers must succeed
      expect(resultA.isSuccess).toBe(true);
      expect(resultB.isSuccess).toBe(true);

      const receiptA = resultA.getValue();
      const receiptB = resultB.getValue();

      // Invariant: Both requests receive the exact SAME receipt voucher
      expect(receiptA.id).toBe(receiptB.id);
      expect(receiptA.receiptNumber).toBe(receiptB.receiptNumber);
      expect(receiptA.total.amount).toBe(receiptB.total.amount);
      expect(receiptA.subtotal.amount).toBe(receiptB.subtotal.amount);
      expect(receiptA.saleId).toBe(sale.id.value);

      // Invariant: Exactly ONE Receipt entity is stored in the database
      expect(receiptRepo.getPersistedCount()).toBe(1);

      // Invariant: Exactly one unique collision was intercepted and safely recovered
      expect(receiptRepo.uniqueCollisionsSimulated).toBe(1);
    });

    it('ensures source Sale and Payment entities remain completely unchanged during race', async () => {
      const sale = createSettledSaleFixture({ saleId: 'sale_immutability_race' });
      const payment = createCompletedPaymentFixture(sale);
      saleRepo.add(sale);
      paymentRepo.add(payment);

      const originalSaleTotal = sale.total.amount;
      const originalSaleStatus = sale.status;
      const originalPaymentStatus = payment.status;

      const cmd1 = new IssueReceiptCommand({
        saleId: sale.id.value,
        tenantId: sale.tenantId,
        currentUser: AUTHORIZED_USER,
      });
      const cmd2 = new IssueReceiptCommand({
        saleId: sale.id.value,
        tenantId: sale.tenantId,
        currentUser: AUTHORIZED_USER,
      });

      await Promise.all([handler.execute(cmd1), handler.execute(cmd2)]);

      const persistedSale = await saleRepo.findById(sale.id);
      const persistedPayments = await paymentRepo.findBySaleId(sale.id);

      expect(persistedSale?.total.amount).toBe(originalSaleTotal);
      expect(persistedSale?.status).toBe(originalSaleStatus);
      expect(persistedPayments[0]?.status).toBe(originalPaymentStatus);
    });
  });

  // ==========================================================================
  // 2. High-Volume Parallel Issuance Storm (10 Concurrent Callers)
  // ==========================================================================
  describe('2. High-Volume Parallel Issuance Storm', () => {
    it('safely serializes 10 concurrent requests for the same Sale with zero duplicate records', async () => {
      const sale = createSettledSaleFixture({ saleId: 'sale_storm_10' });
      const payment = createCompletedPaymentFixture(sale);
      saleRepo.add(sale);
      paymentRepo.add(payment);

      const concurrentCommands = Array.from(
        { length: 10 },
        () =>
          new IssueReceiptCommand({
            saleId: sale.id.value,
            tenantId: sale.tenantId,
            currentUser: AUTHORIZED_USER,
          }),
      );

      const results = await Promise.all(concurrentCommands.map((c) => handler.execute(c)));

      // Assert all 10 callers received success
      results.forEach((res) => {
        expect(res.isSuccess).toBe(true);
      });

      // Assert all 10 callers received the identical voucher number and ID
      const firstReceipt = results[0]?.getValue();
      expect(firstReceipt).toBeDefined();
      results.forEach((res) => {
        expect(res.getValue().id).toBe(firstReceipt!.id);
        expect(res.getValue().receiptNumber).toBe(firstReceipt!.receiptNumber);
      });

      // Assert database holds exactly 1 record
      expect(receiptRepo.getPersistedCount()).toBe(1);
    });
  });

  // ==========================================================================
  // 3. Database-Level Unique Constraint (PostgreSQL / Prisma P2002) Enforcement
  // ==========================================================================
  describe('3. Database-Level Unique Constraint Enforcement (PostgreSQL / Prisma P2002)', () => {
    it('handles Prisma P2002 unique constraint error and recovers the winning receipt deterministically', async () => {
      const sale = createSettledSaleFixture({ saleId: 'sale_prisma_p2002_race' });
      const payment = createCompletedPaymentFixture(sale);

      const existingReceiptDomain = Receipt.fromSettledSale(
        {
          sale,
          payments: [payment],
          clientSummary: null,
          receiptNumber: ReceiptNumber.fromParts(2026, 77),
          saleReference: sale.id.value,
        },
        clock,
      );

      // Mock Prisma client where tx.receipt.create throws P2002 (simulating race collision)
      const p2002Error = new Prisma.PrismaClientKnownRequestError(
        'Unique constraint failed on the fields: (`tenant_id`, `sale_id`)',
        {
          code: 'P2002',
          clientVersion: '6.19.3',
        },
      );

      type MockDbClient = {
        $transaction: jest.Mock<Promise<unknown>, [(tx: MockDbClient) => Promise<unknown>]>;
        $queryRawUnsafe: jest.Mock;
        receipt: {
          create: jest.Mock;
          findUnique: jest.Mock;
          findFirst: jest.Mock;
          updateMany: jest.Mock;
        };
      };

      const mockPrisma: MockDbClient = {
        $transaction: jest.fn(async (cb) => cb(mockPrisma)),
        $queryRawUnsafe: jest.fn().mockResolvedValue([{ current_value: 78 }]),
        receipt: {
          findUnique: jest.fn().mockResolvedValue(null), // Pre-check returned null during race!
          create: jest.fn().mockRejectedValue(p2002Error), // PostgreSQL rejects duplicate insert!
          findFirst: jest.fn(),
          updateMany: jest.fn(),
        },
      };

      const prismaRepo = new PrismaReceiptRepository(mockPrisma as unknown as PrismaClient);

      // When saving directly via repository, P2002 is converted to DuplicateReceiptException
      await expect(prismaRepo.save(existingReceiptDomain)).rejects.toThrow(
        DuplicateReceiptException,
      );

      // Verify that findBySaleId afterwards successfully loads the winning receipt
      const persistenceData = PrismaReceiptMapper.toPersistence(existingReceiptDomain);
      mockPrisma.receipt.findFirst.mockResolvedValueOnce({
        ...persistenceData,
        createdAt: clock.now(),
      });

      const recovered = await prismaRepo.findBySaleId(sale.id);
      expect(recovered).not.toBeNull();
      expect(recovered?.receiptNumber.value).toBe('REC-2026-000077');
    });

    it('recovers cleanly in IssueReceiptHandler when repository raises DuplicateReceiptException during race', async () => {
      const sale = createSettledSaleFixture({ saleId: 'sale_handler_p2002_recovery' });
      const payment = createCompletedPaymentFixture(sale);
      saleRepo.add(sale);
      paymentRepo.add(payment);

      let saveAttempts = 0;
      let winningReceipt: Receipt | null = null;

      // Custom repository that simulates race on save()
      const racingRepo: ReceiptRepositoryPort = {
        findById: async () => null,
        findByReceiptNumber: async () => null,
        findBySaleId: async () => winningReceipt, // Returns the winning receipt once committed
        getNextReceiptNumber: async (_t, year) => ReceiptNumber.fromParts(year, 1),
        save: async (receipt) => {
          saveAttempts++;
          if (saveAttempts === 1) {
            // Winner saves
            winningReceipt = receipt;
          } else {
            // Loser encounters P2002 collision
            throw new DuplicateReceiptException(receipt.saleId.value, receipt.tenantId);
          }
        },
      };

      const customHandler = new IssueReceiptHandler(
        racingRepo,
        saleRepo,
        paymentRepo,
        undefined,
        clock,
      );

      // Caller 1 and Caller 2 run
      const cmd1 = new IssueReceiptCommand({
        saleId: sale.id.value,
        tenantId: sale.tenantId,
        currentUser: AUTHORIZED_USER,
      });
      const cmd2 = new IssueReceiptCommand({
        saleId: sale.id.value,
        tenantId: sale.tenantId,
        currentUser: AUTHORIZED_USER,
      });

      const [res1, res2] = await Promise.all([
        customHandler.execute(cmd1),
        customHandler.execute(cmd2),
      ]);

      expect(res1.isSuccess).toBe(true);
      expect(res2.isSuccess).toBe(true);
      expect(res1.getValue().receiptNumber).toBe(res2.getValue().receiptNumber);
      expect(res1.getValue().id).toBe(res2.getValue().id);
    });
  });

  // ==========================================================================
  // 4. Repeated Issuance (Serial Idempotency)
  // ==========================================================================
  describe('4. Repeated Issuance (Serial Idempotency)', () => {
    it('returns existing Receipt immediately on repeated issuance without incrementing sequence counter', async () => {
      const sale = createSettledSaleFixture({ saleId: 'sale_serial_retry' });
      const payment = createCompletedPaymentFixture(sale);
      saleRepo.add(sale);
      paymentRepo.add(payment);

      const command = new IssueReceiptCommand({
        saleId: sale.id.value,
        tenantId: sale.tenantId,
        currentUser: AUTHORIZED_USER,
      });

      // 1. Initial issuance
      const result1 = await handler.execute(command);
      expect(result1.isSuccess).toBe(true);
      const initialDto = result1.getValue();
      expect(receiptRepo.sequenceCalls).toBe(1);
      expect(receiptRepo.saveCalls).toBe(1);

      // 2. Second issuance (simulated client retry / refresh)
      clock.advanceSeconds(30);
      const result2 = await handler.execute(command);
      expect(result2.isSuccess).toBe(true);
      const retryDto = result2.getValue();

      // Deterministic identical response
      expect(retryDto.id).toBe(initialDto.id);
      expect(retryDto.receiptNumber).toBe(initialDto.receiptNumber);
      expect(retryDto.issuedAt).toEqual(initialDto.issuedAt);

      // Crucial: sequence generator and save were NOT called on second invocation
      expect(receiptRepo.sequenceCalls).toBe(1);
      expect(receiptRepo.saveCalls).toBe(1);
      expect(receiptRepo.getPersistedCount()).toBe(1);
    });
  });

  // ==========================================================================
  // 5. Multi-Tenant Concurrent Independence
  // ==========================================================================
  describe('5. Multi-Tenant Concurrent Independence', () => {
    it('processes concurrent issuances across different tenants independently without collisions', async () => {
      const saleTenantA = createSettledSaleFixture({
        saleId: 'sale_tenant_A',
        tenantId: 'tenant_alpha',
      });
      const paymentA = createCompletedPaymentFixture(saleTenantA);
      saleRepo.add(saleTenantA);
      paymentRepo.add(paymentA);

      const saleTenantB = createSettledSaleFixture({
        saleId: 'sale_tenant_B',
        tenantId: 'tenant_beta',
      });
      const paymentB = createCompletedPaymentFixture(saleTenantB);
      saleRepo.add(saleTenantB);
      paymentRepo.add(paymentB);

      const cmdA = new IssueReceiptCommand({
        saleId: saleTenantA.id.value,
        tenantId: 'tenant_alpha',
        currentUser: { id: 'u_a', roles: ['Receptionist'], permissions: ['receipts.manage'] },
      });

      const cmdB = new IssueReceiptCommand({
        saleId: saleTenantB.id.value,
        tenantId: 'tenant_beta',
        currentUser: { id: 'u_b', roles: ['Receptionist'], permissions: ['receipts.manage'] },
      });

      const [resA, resB] = await Promise.all([handler.execute(cmdA), handler.execute(cmdB)]);

      expect(resA.isSuccess).toBe(true);
      expect(resB.isSuccess).toBe(true);

      // Both tenants independently receive sequence #1
      expect(resA.getValue().receiptNumber).toBe('REC-2026-000001');
      expect(resB.getValue().receiptNumber).toBe('REC-2026-000001');

      // Database holds both receipts
      expect(receiptRepo.getPersistedCount()).toBe(2);
      expect(receiptRepo.uniqueCollisionsSimulated).toBe(0);
    });
  });

  // ==========================================================================
  // 6. Bounded Deterministic Retries & Failure Modes
  // ==========================================================================
  describe('6. Bounded Deterministic Retries & Failure Modes', () => {
    it('retries findBySaleId when DuplicateReceiptException occurs and succeeds on subsequent poll', async () => {
      const sale = createSettledSaleFixture({ saleId: 'sale_delayed_commit_recovery' });
      const payment = createCompletedPaymentFixture(sale);
      saleRepo.add(sale);
      paymentRepo.add(payment);

      let findPollCount = 0;
      const committedReceipt = Receipt.fromSettledSale(
        {
          sale,
          payments: [payment],
          clientSummary: null,
          receiptNumber: ReceiptNumber.fromParts(2026, 99),
          saleReference: sale.id.value,
        },
        clock,
      );

      const delayedRepo: ReceiptRepositoryPort = {
        findById: async () => null,
        findByReceiptNumber: async () => null,
        findBySaleId: async () => {
          findPollCount++;
          // First poll returns null (simulating async commit latency), second poll returns receipt
          if (findPollCount >= 2) {
            return committedReceipt;
          }
          return null;
        },
        getNextReceiptNumber: async (_t, year) => ReceiptNumber.fromParts(year, 100),
        save: async (r) => {
          // Throws duplicate exception simulating race
          throw new DuplicateReceiptException(r.saleId.value, r.tenantId);
        },
      };

      const retryHandler = new IssueReceiptHandler(
        delayedRepo,
        saleRepo,
        paymentRepo,
        undefined,
        clock,
      );

      const cmd = new IssueReceiptCommand({
        saleId: sale.id.value,
        tenantId: sale.tenantId,
        currentUser: AUTHORIZED_USER,
      });

      const res = await retryHandler.execute(cmd);

      expect(res.isSuccess).toBe(true);
      expect(res.getValue().receiptNumber).toBe('REC-2026-000099');
      expect(findPollCount).toBeGreaterThanOrEqual(2);
    });

    it('fails deterministically with DuplicateReceiptException if retries are completely exhausted', async () => {
      const sale = createSettledSaleFixture({ saleId: 'sale_exhausted_retries' });
      const payment = createCompletedPaymentFixture(sale);
      saleRepo.add(sale);
      paymentRepo.add(payment);

      const unrecoverableRepo: ReceiptRepositoryPort = {
        findById: async () => null,
        findByReceiptNumber: async () => null,
        findBySaleId: async () => null, // Never finds receipt
        getNextReceiptNumber: async (_t, year) => ReceiptNumber.fromParts(year, 101),
        save: async (r) => {
          throw new DuplicateReceiptException(r.saleId.value, r.tenantId);
        },
      };

      const retryHandler = new IssueReceiptHandler(
        unrecoverableRepo,
        saleRepo,
        paymentRepo,
        undefined,
        clock,
      );

      const cmd = new IssueReceiptCommand({
        saleId: sale.id.value,
        tenantId: sale.tenantId,
        currentUser: AUTHORIZED_USER,
      });

      const res = await retryHandler.execute(cmd);

      expect(res.isFailure).toBe(true);
      expect(extractErrorMessage(res)).toContain('Duplicate receipt issuance is prohibited');
    });
  });

  // ==========================================================================
  // 7. Negative Invariants During Concurrency
  // ==========================================================================
  describe('7. Negative Invariants During Concurrency', () => {
    it('rejects all concurrent requests if Sale is in unfinalized DRAFT or CANCELLED status', async () => {
      const draftSale = createSettledSaleFixture({
        saleId: 'sale_draft_race',
        status: SaleStatus.DRAFT,
      });
      saleRepo.add(draftSale);

      const cmds = Array.from(
        { length: 5 },
        () =>
          new IssueReceiptCommand({
            saleId: draftSale.id.value,
            tenantId: draftSale.tenantId,
            currentUser: AUTHORIZED_USER,
          }),
      );

      const results = await Promise.all(cmds.map((c) => handler.execute(c)));

      results.forEach((res) => {
        expect(res.isFailure).toBe(true);
        expect(extractErrorMessage(res)).toContain('Receipt issuance requires PAID or COMPLETED');
      });

      expect(receiptRepo.getPersistedCount()).toBe(0);
      expect(receiptRepo.saveCalls).toBe(0);
    });

    it('rejects all concurrent requests if Payment is FAILED or CANCELLED', async () => {
      const sale = createSettledSaleFixture({ saleId: 'sale_failed_pay_race' });
      const failedPayment = Payment.reconstitute({
        id: PaymentId.create('pay_failed_1'),
        saleId: sale.id,
        tenantId: sale.tenantId ?? 'tenant_wellness_center',
        method: PaymentMethod.QR,
        status: PaymentStatus.FAILED,
        amount: sale.total,
        reference: PaymentReference.create('REF-FAILED'),
        paidAt: null,
        version: 1,
        createdAt: t0,
        updatedAt: t0,
      });

      saleRepo.add(sale);
      paymentRepo.add(failedPayment);

      const cmds = Array.from(
        { length: 5 },
        () =>
          new IssueReceiptCommand({
            saleId: sale.id.value,
            tenantId: sale.tenantId,
            currentUser: AUTHORIZED_USER,
          }),
      );

      const results = await Promise.all(cmds.map((c) => handler.execute(c)));

      results.forEach((res) => {
        expect(res.isFailure).toBe(true);
        expect(extractErrorMessage(res)).toContain('No COMPLETED payment tenders found');
      });

      expect(receiptRepo.getPersistedCount()).toBe(0);
      expect(receiptRepo.saveCalls).toBe(0);
    });
  });
});
