import {
  Sale,
  SaleId,
  SaleStatus,
  SaleSource,
  SaleSourceType,
  Payment,
  PaymentId,
  PaymentStatus,
  PaymentMethod,
  Money,
  CreateSaleHandler,
  CreateSaleCommand,
  CreatePaymentHandler,
  CreatePaymentCommand,
  CompletePaymentHandler,
  CompletePaymentCommand,
  CancelSaleHandler,
  CancelSaleCommand,
  FailPaymentHandler,
  FailPaymentCommand,
  CancelPaymentHandler,
  CancelPaymentCommand,
  GetSalePaymentHistoryHandler,
  GetSalePaymentHistoryQuery,
  SaleRepositoryPort,
  PaymentRepositoryPort,
  IUnitOfWork,
  SalesEventPublisherPort,
  SaleNotFoundException,
  SaleCannotBeMarkedPaidException,
  InvalidSaleTransitionException,
  PaymentFailedEvent,
  PaymentCancelledEvent,
} from '../index';
import { DomainEvent } from '../domain/shared/domain-event';
import { SystemClock } from '../domain/shared/clock';
import * as fs from 'fs';
import * as path from 'path';

/**
 * In-memory Sale repository for architectural integration testing.
 */
class InMemorySaleRepository implements SaleRepositoryPort {
  private readonly items = new Map<string, Sale>();

  public async findById(id: SaleId | string): Promise<Sale | null> {
    const key = typeof id === 'string' ? id : id.value;
    return this.items.get(key) ?? null;
  }

  public async save(sale: Sale): Promise<void> {
    this.items.set(sale.id.value, sale);
  }

  public async delete(id: SaleId | string): Promise<void> {
    const key = typeof id === 'string' ? id : id.value;
    this.items.delete(key);
  }

  public getRaw(id: string): Sale | undefined {
    return this.items.get(id);
  }
}

/**
 * In-memory Payment repository for architectural integration testing.
 */
class InMemoryPaymentRepository implements PaymentRepositoryPort {
  private readonly items = new Map<string, Payment>();

  public async findById(id: PaymentId | string): Promise<Payment | null> {
    const key = typeof id === 'string' ? id : id.value;
    return this.items.get(key) ?? null;
  }

  public async findBySaleId(saleId: SaleId | string): Promise<Payment[]> {
    const key = typeof saleId === 'string' ? saleId : saleId.value;
    const res: Payment[] = [];
    for (const payment of this.items.values()) {
      if (payment.saleId.value === key) {
        res.push(payment);
      }
    }
    return res;
  }

  public async save(payment: Payment): Promise<void> {
    this.items.set(payment.id.value, payment);
  }

  public getRaw(id: string): Payment | undefined {
    return this.items.get(id);
  }
}

/**
 * Mock Unit of Work recording execution.
 */
class MockUnitOfWork implements IUnitOfWork {
  public executedTransactionsCount = 0;

  public async executeInTransaction<T>(work: () => Promise<T>): Promise<T> {
    this.executedTransactionsCount++;
    return work();
  }
}

/**
 * Test Event Publisher collecting domain events.
 */
class TestEventPublisher implements SalesEventPublisherPort {
  public publishedEvents: DomainEvent[] = [];

  public async publish(events: ReadonlyArray<DomainEvent>): Promise<void> {
    this.publishedEvents.push(...events);
  }
}

describe('Architectural Audit: Milestones 7.10, 7.11 & 7.12 Interaction Invariants', () => {
  const TENANT_ID = 'tenant-audit-1';
  const USER_OWNER = {
    id: 'user-owner',
    roles: ['Owner'],
    permissions: [
      'sales.create',
      'sales.read',
      'sales.manage',
      'payments.create',
      'payments.read',
      'payments.manage',
    ],
    tenantId: TENANT_ID,
  };

  let saleRepo: InMemorySaleRepository;
  let paymentRepo: InMemoryPaymentRepository;
  let uow: MockUnitOfWork;
  let publisher: TestEventPublisher;
  let clock: SystemClock;

  beforeEach(() => {
    saleRepo = new InMemorySaleRepository();
    paymentRepo = new InMemoryPaymentRepository();
    uow = new MockUnitOfWork();
    publisher = new TestEventPublisher();
    clock = new SystemClock();
  });

  describe('1. Architectural Dependency Direction & Structural Boundaries', () => {
    const salesDomainDir = path.resolve(__dirname, '../domain');

    it('proves Sale Domain has zero imports of Payment aggregate or Payment domain entities', () => {
      const saleAggregatePath = path.resolve(salesDomainDir, 'sale.aggregate.ts');
      const content = fs.readFileSync(saleAggregatePath, 'utf-8');

      // Sale aggregate root must not know about Payment aggregate, PaymentId, or PaymentMethod
      expect(content).not.toMatch(/from\s+['"].*payment\.aggregate['"]/i);
      expect(content).not.toMatch(/from\s+['"].*payment-id\.vo['"]/i);
      expect(content).not.toMatch(/from\s+['"].*payment-method\.enum['"]/i);
      expect(content).not.toMatch(/from\s+['"].*payment-status\.enum['"]/i);
      expect(content).not.toMatch(/\bclass\s+Payment\b/);
    });

    it('proves Payment Domain has zero imports of Sale aggregate', () => {
      const paymentAggregatePath = path.resolve(salesDomainDir, 'payment.aggregate.ts');
      const content = fs.readFileSync(paymentAggregatePath, 'utf-8');

      // Payment aggregate holds only scalar SaleId value object, never Sale aggregate
      expect(content).not.toMatch(/from\s+['"].*sale\.aggregate['"]/i);
      expect(content).toMatch(/SaleId/);
      expect(content).not.toMatch(/\bclass\s+Sale\b/);
    });

    it('proves preferred dependency direction: Handlers orchestrate both domains independently', () => {
      const handlersDir = path.resolve(__dirname, '../application/handlers');
      const completePaymentHandlerPath = path.resolve(handlersDir, 'complete-payment.handler.ts');
      const content = fs.readFileSync(completePaymentHandlerPath, 'utf-8');

      // CompletePaymentHandler orchestrates PaymentRepositoryPort + SaleRepositoryPort
      expect(content).toMatch(/PaymentRepositoryPort/);
      expect(content).toMatch(/SaleRepositoryPort/);
    });
  });

  describe('2. Interaction Matrix Audit', () => {
    it('Flow 1: CreateSale → Sale persisted with initial commercial terms', async () => {
      const createSaleHandler = new CreateSaleHandler(saleRepo, clock, publisher);

      const command = new CreateSaleCommand({
        tenantId: TENANT_ID,
        currency: 'USD',
        source: {
          sourceType: SaleSourceType.FOOD,
          sourceId: 'pos-terminal-1',
        },
        items: [
          {
            description: 'Protein Shake',
            quantity: 2,
            unitPriceAmount: 5.0,
          },
        ],
      });

      const result = await createSaleHandler.execute(command);

      expect(result.isSuccess).toBe(true);
      const saleDto = result.getValue();
      expect(saleDto.id).toBeDefined();
      expect(saleDto.total.amount).toBe(10.0);
      expect(saleDto.status).toBe(SaleStatus.DRAFT);

      // Verify persistence in repository
      const persistedSale = await saleRepo.findById(saleDto.id);
      expect(persistedSale).not.toBeNull();
      expect(persistedSale!.total.amount).toBe(10.0);
      expect(persistedSale!.status).toBe(SaleStatus.DRAFT);
    });

    it('Flow 2: CreatePayment → Payment references persisted Sale in payable state', async () => {
      // 1. Create and finalize Sale to PENDING_PAYMENT
      const sale = Sale.create({
        tenantId: TENANT_ID,
        currency: 'USD',
        source: SaleSource.create(SaleSourceType.GYM_MEMBERSHIP, 'register-1'),
      });
      sale.addItem({
        source: SaleSource.create(SaleSourceType.GYM_MEMBERSHIP, 'pass-1'),
        description: 'Gym Pass',
        quantity: 1,
        unitPrice: Money.create(50.0, 'USD'),
      });
      sale.finalize(clock);
      await saleRepo.save(sale);

      // 2. Create Payment against the persisted Sale
      const createPaymentHandler = new CreatePaymentHandler(
        paymentRepo,
        saleRepo,
        clock,
        publisher,
      );

      const command = new CreatePaymentCommand({
        saleId: sale.id.value,
        tenantId: TENANT_ID,
        amount: 50.0,
        currency: 'USD',
        method: PaymentMethod.QR,
        status: PaymentStatus.PENDING,
        currentUser: USER_OWNER,
      });

      const result = await createPaymentHandler.execute(command);

      expect(result.isSuccess).toBe(true);
      const paymentDto = result.getValue();
      expect(paymentDto.id).toBeDefined();
      expect(paymentDto.saleId).toBe(sale.id.value);
      expect(paymentDto.status).toBe(PaymentStatus.PENDING);
      expect(paymentDto.amount.amount).toBe(50.0);

      // Verify Payment persistence referencing Sale
      const persistedPayment = await paymentRepo.findById(paymentDto.id);
      expect(persistedPayment).not.toBeNull();
      expect(persistedPayment!.saleId.value).toBe(sale.id.value);
      expect(persistedPayment!.amount.amount).toBe(50.0);
    });

    it('Flow 2b: CreatePayment → Rejects payment if Sale does not exist', async () => {
      const createPaymentHandler = new CreatePaymentHandler(
        paymentRepo,
        saleRepo,
        clock,
        publisher,
      );

      const command = new CreatePaymentCommand({
        saleId: 'non-existent-sale-id',
        tenantId: TENANT_ID,
        amount: 50.0,
        currency: 'USD',
        method: PaymentMethod.QR,
        status: PaymentStatus.PENDING,
        currentUser: USER_OWNER,
      });

      const result = await createPaymentHandler.execute(command);
      expect(result.isFailure).toBe(true);
      expect(result.getError()).toBeInstanceOf(SaleNotFoundException);
    });

    it('Flow 3: CompletePayment → Payment becomes COMPLETED and Sale becomes PAID atomically in UoW', async () => {
      // 1. Setup finalized Sale
      const sale = Sale.create({
        tenantId: TENANT_ID,
        currency: 'USD',
        source: SaleSource.create(SaleSourceType.GYM_MEMBERSHIP, 'register-1'),
      });
      sale.addItem({
        source: SaleSource.create(SaleSourceType.GYM_MEMBERSHIP, 'session-1'),
        description: 'Personal Training Session',
        quantity: 1,
        unitPrice: Money.create(100.0, 'USD'),
      });
      sale.finalize(clock);
      await saleRepo.save(sale);

      // 2. Setup pending Payment
      const payment = Payment.createPending({
        saleId: sale.id,
        tenantId: TENANT_ID,
        amount: Money.create(100.0, 'USD'),
        method: PaymentMethod.QR,
      });
      await paymentRepo.save(payment);

      // 3. Complete payment
      const completePaymentHandler = new CompletePaymentHandler(
        paymentRepo,
        saleRepo,
        clock,
        publisher,
        uow,
      );

      const command = new CompletePaymentCommand({
        paymentId: payment.id.value,
        saleId: sale.id.value,
        tenantId: TENANT_ID,
        reference: 'BANK-TXN-9988',
        currentUser: USER_OWNER,
      });

      const result = await completePaymentHandler.execute(command);

      expect(result.isSuccess).toBe(true);
      expect(uow.executedTransactionsCount).toBe(1);

      // Verify exact persisted aggregate states
      const reloadedPayment = await paymentRepo.findById(payment.id);
      expect(reloadedPayment!.status).toBe(PaymentStatus.COMPLETED);
      expect(reloadedPayment!.reference?.value).toBe('BANK-TXN-9988');

      const reloadedSale = await saleRepo.findById(sale.id);
      expect(reloadedSale!.status).toBe(SaleStatus.PAID);
    });

    it('Flow 4: CancelSale → does NOT silently corrupt Payment state', async () => {
      // 1. Setup finalized Sale with pending Payment
      const sale = Sale.create({
        tenantId: TENANT_ID,
        currency: 'USD',
        source: SaleSource.create(SaleSourceType.FOOD, 'register-1'),
      });
      sale.addItem({
        source: SaleSource.create(SaleSourceType.FOOD, 'towel-1'),
        description: 'Towel Service',
        quantity: 1,
        unitPrice: Money.create(20.0, 'USD'),
      });
      sale.finalize(clock);
      await saleRepo.save(sale);

      const payment = Payment.createPending({
        saleId: sale.id,
        tenantId: TENANT_ID,
        amount: Money.create(20.0, 'USD'),
        method: PaymentMethod.QR,
      });
      await paymentRepo.save(payment);

      // 2. Cancel Sale
      const cancelSaleHandler = new CancelSaleHandler(saleRepo, clock, publisher);
      const cancelCommand = new CancelSaleCommand({
        saleId: sale.id.value,
        tenantId: TENANT_ID,
        reason: 'Customer left without completing transaction',
      });

      const cancelResult = await cancelSaleHandler.execute(cancelCommand);
      expect(cancelResult.isSuccess).toBe(true);

      // Verify Sale is CANCELLED
      const reloadedSale = await saleRepo.findById(sale.id);
      expect(reloadedSale!.status).toBe(SaleStatus.CANCELLED);
      expect(reloadedSale!.cancellationReason).toBe('Customer left without completing transaction');

      // Verify Payment state was NOT corrupted or altered
      const reloadedPayment = await paymentRepo.findById(payment.id);
      expect(reloadedPayment!.status).toBe(PaymentStatus.PENDING);
      expect(reloadedPayment!.saleId.value).toBe(sale.id.value);

      // Invariant: Trying to Complete payment against cancelled sale must fail
      const completePaymentHandler = new CompletePaymentHandler(
        paymentRepo,
        saleRepo,
        clock,
        publisher,
        uow,
      );
      const completeCommand = new CompletePaymentCommand({
        paymentId: payment.id.value,
        saleId: sale.id.value,
        tenantId: TENANT_ID,
        currentUser: USER_OWNER,
      });

      const completeResult = await completePaymentHandler.execute(completeCommand);
      expect(completeResult.isFailure).toBe(true);
      expect(completeResult.getError()).toBeInstanceOf(SaleCannotBeMarkedPaidException);
    });

    it('Flow 4b: CancelSale → Domain rejects cancelling a PAID or COMPLETED sale', async () => {
      const sale = Sale.create({
        tenantId: TENANT_ID,
        currency: 'USD',
        source: SaleSource.create(SaleSourceType.FOOD, 'register-1'),
      });
      sale.addItem({
        source: SaleSource.create(SaleSourceType.FOOD, 'shake-1'),
        description: 'Shake',
        quantity: 1,
        unitPrice: Money.create(5.0, 'USD'),
      });
      sale.finalize(clock);
      sale.markPaid(clock);
      await saleRepo.save(sale);

      const cancelSaleHandler = new CancelSaleHandler(saleRepo, clock, publisher);
      const cancelCommand = new CancelSaleCommand({
        saleId: sale.id.value,
        tenantId: TENANT_ID,
        reason: 'Attempt invalid cancel',
      });

      const cancelResult = await cancelSaleHandler.execute(cancelCommand);
      expect(cancelResult.isFailure).toBe(true);
      expect(cancelResult.getError()).toBeInstanceOf(InvalidSaleTransitionException);
    });

    it('Flow 5: FailPayment → does NOT silently cancel Sale', async () => {
      // 1. Setup finalized Sale
      const sale = Sale.create({
        tenantId: TENANT_ID,
        currency: 'USD',
        source: SaleSource.create(SaleSourceType.FOOD, 'register-1'),
      });
      sale.addItem({
        source: SaleSource.create(SaleSourceType.FOOD, 'bar-1'),
        description: 'Energy Bar',
        quantity: 2,
        unitPrice: Money.create(4.0, 'USD'),
      });
      sale.finalize(clock);
      await saleRepo.save(sale);

      // 2. Setup pending Payment
      const payment = Payment.createPending({
        saleId: sale.id,
        tenantId: TENANT_ID,
        amount: Money.create(8.0, 'USD'),
        method: PaymentMethod.QR,
      });
      await paymentRepo.save(payment);

      // 3. Fail Payment (e.g. user scanned wrong QR or card declined)
      const failPaymentHandler = new FailPaymentHandler(paymentRepo, saleRepo, clock, publisher);
      const failCommand = new FailPaymentCommand({
        paymentId: payment.id.value,
        saleId: sale.id.value,
        tenantId: TENANT_ID,
        reason: 'Payment rail timeout / card declined',
        currentUser: USER_OWNER,
      });

      const failResult = await failPaymentHandler.execute(failCommand);
      expect(failResult.isSuccess).toBe(true);

      // Verify Payment became FAILED
      const reloadedPayment = await paymentRepo.findById(payment.id);
      expect(reloadedPayment!.status).toBe(PaymentStatus.FAILED);
      expect(reloadedPayment!.isFailed()).toBe(true);

      // Verify event was emitted with reason
      expect(publisher.publishedEvents.some((e) => e instanceof PaymentFailedEvent)).toBe(true);

      // Verify Sale is STILL in PENDING_PAYMENT (not cancelled! cashier can retry tender)
      const reloadedSale = await saleRepo.findById(sale.id);
      expect(reloadedSale!.status).toBe(SaleStatus.PENDING_PAYMENT);
      expect(reloadedSale!.cancelledAt).toBeUndefined();
    });

    it('Flow 6: CancelPayment → does NOT silently cancel Sale', async () => {
      // 1. Setup finalized Sale
      const sale = Sale.create({
        tenantId: TENANT_ID,
        currency: 'USD',
        source: SaleSource.create(SaleSourceType.ROOM_RENTAL, 'register-1'),
      });
      sale.addItem({
        source: SaleSource.create(SaleSourceType.ROOM_RENTAL, 'locker-1'),
        description: 'Locker Rental',
        quantity: 1,
        unitPrice: Money.create(15.0, 'USD'),
      });
      sale.finalize(clock);
      await saleRepo.save(sale);

      // 2. Setup pending Payment
      const payment = Payment.createPending({
        saleId: sale.id,
        tenantId: TENANT_ID,
        amount: Money.create(15.0, 'USD'),
        method: PaymentMethod.QR,
      });
      await paymentRepo.save(payment);

      // 3. Cancel Payment tender
      const cancelPaymentHandler = new CancelPaymentHandler(
        paymentRepo,
        saleRepo,
        clock,
        publisher,
      );
      const cancelCommand = new CancelPaymentCommand({
        paymentId: payment.id.value,
        saleId: sale.id.value,
        tenantId: TENANT_ID,
        reason: 'Customer switched tender method from QR to Cash',
        currentUser: USER_OWNER,
      });

      const cancelResult = await cancelPaymentHandler.execute(cancelCommand);
      expect(cancelResult.isSuccess).toBe(true);

      // Verify Payment became CANCELLED
      const reloadedPayment = await paymentRepo.findById(payment.id);
      expect(reloadedPayment!.status).toBe(PaymentStatus.CANCELLED);
      expect(reloadedPayment!.isCancelled()).toBe(true);

      // Verify event was emitted
      expect(publisher.publishedEvents.some((e) => e instanceof PaymentCancelledEvent)).toBe(true);

      // Verify Sale is STILL in PENDING_PAYMENT (not cancelled! ready for cash tender)
      const reloadedSale = await saleRepo.findById(sale.id);
      expect(reloadedSale!.status).toBe(SaleStatus.PENDING_PAYMENT);
      expect(reloadedSale!.cancelledAt).toBeUndefined();
    });

    it('Flow 7: GetSalePaymentHistory → correctly retrieves Payment records without aggregate leaks', async () => {
      // 1. Setup finalized Sale
      const sale = Sale.create({
        tenantId: TENANT_ID,
        currency: 'USD',
        source: SaleSource.create(SaleSourceType.GYM_MEMBERSHIP, 'register-1'),
      });
      sale.addItem({
        source: SaleSource.create(SaleSourceType.GYM_MEMBERSHIP, 'monthly-1'),
        description: 'Monthly Pass',
        quantity: 1,
        unitPrice: Money.create(100.0, 'USD'),
      });
      sale.finalize(clock);
      await saleRepo.save(sale);

      // 2. Add multiple payments across different lifecycles (one failed, one completed)
      const payment1 = Payment.createPending({
        saleId: sale.id,
        tenantId: TENANT_ID,
        amount: Money.create(50.0, 'USD'),
        method: PaymentMethod.QR,
      });
      payment1.fail('Declined by issuer', clock);
      await paymentRepo.save(payment1);

      const payment2 = Payment.createCompleted({
        saleId: sale.id,
        tenantId: TENANT_ID,
        amount: Money.create(100.0, 'USD'),
        method: PaymentMethod.CASH,
      });
      await paymentRepo.save(payment2);

      // 3. Query history
      const historyHandler = new GetSalePaymentHistoryHandler(paymentRepo, saleRepo);
      const query = new GetSalePaymentHistoryQuery({
        saleId: sale.id.value,
        tenantId: TENANT_ID,
        currentUser: USER_OWNER,
      });

      const historyResult = await historyHandler.execute(query);
      expect(historyResult.isSuccess).toBe(true);
      const payments = historyResult.getValue();

      expect(payments).toHaveLength(2);
      expect(
        payments.some((p: { status: PaymentStatus }) => p.status === PaymentStatus.FAILED),
      ).toBe(true);
      expect(
        payments.some((p: { status: PaymentStatus }) => p.status === PaymentStatus.COMPLETED),
      ).toBe(true);
      expect(payments.every((p: { saleId: string }) => p.saleId === sale.id.value)).toBe(true);
      // Pure DTO output
      expect(payments[0]?.amount?.amount).toBeDefined();
      expect(payments[0]?.amount?.currency).toBe('USD');
    });
  });
});
