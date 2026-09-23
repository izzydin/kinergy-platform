import { Prisma } from '@prisma/client';
import { Payment } from '../domain/payment.aggregate';
import { Sale } from '../domain/sale.aggregate';
import { PaymentId } from '../domain/value-objects/payment-id.vo';
import { SaleId } from '../domain/value-objects/sale-id.vo';
import { Money } from '../domain/value-objects/money.vo';
import { PaymentReference } from '../domain/value-objects/payment-reference.vo';
import {
  PaymentMethod,
  SUPPORTED_PAYMENT_METHODS,
  isValidPaymentMethod,
} from '../domain/enums/payment-method.enum';
import {
  PaymentStatus,
  SUPPORTED_PAYMENT_STATUSES,
  PAYMENT_TRANSITION_MATRIX,
  canTransitionPaymentStatus,
  isTerminalPaymentStatus,
} from '../domain/enums/payment-status.enum';
import { SaleStatus } from '../domain/enums/sale-status.enum';
import { SourceReference } from '../domain/value-objects/source-reference.vo';
import { SourceType } from '../domain/enums/source-type.enum';
import { Discount } from '../domain/value-objects/discount.vo';
import {
  PaymentDomainException,
  InvalidPaymentMethodException,
  InvalidPaymentTransitionException,
  InvalidPaymentReferenceException,
} from '../domain/exceptions';
import { SaleNotFoundException } from '../application/exceptions/sale-not-found.exception';
import { PaymentSettledEvent, PaymentFailedEvent, PaymentCancelledEvent } from '../domain/events';
import { DeterministicClock } from '../domain/shared/clock';
import { DomainEvent } from '../domain/shared/domain-event';

import {
  RecordPaymentCommand,
  RecordPaymentHandler,
  SettlePaymentCommand,
  SettlePaymentHandler,
  CancelPaymentCommand,
  CancelPaymentHandler,
} from '../application';
import {
  GetPaymentByIdQuery,
  GetPaymentByIdHandler,
  GetPaymentsBySaleIdQuery,
  GetPaymentsBySaleIdHandler,
} from '../application';
import {
  PaymentRepositoryPort,
  SaleRepositoryPort,
  SalesEventPublisherPort,
} from '../application/ports';
import { PaymentUnauthorizedException } from '../application/exceptions/payment-unauthorized.exception';
import { PaymentOverpaymentException } from '../application/exceptions/payment-overpayment.exception';
import { PrismaPaymentMapper } from '../infrastructure/persistence/prisma/mappers/prisma-payment.mapper';

// ============================================================================
// Test Doubles
// ============================================================================

class InMemoryPaymentRepository implements PaymentRepositoryPort {
  public readonly items = new Map<string, Payment>();

  async findById(id: PaymentId | string): Promise<Payment | null> {
    const key = typeof id === 'string' ? id.trim() : id.value;
    return this.items.get(key) ?? null;
  }

  async findBySaleId(saleId: SaleId | string): Promise<Payment[]> {
    const key = typeof saleId === 'string' ? saleId.trim() : saleId.value;
    return Array.from(this.items.values()).filter((p) => p.saleId.value === key);
  }

  async save(payment: Payment): Promise<void> {
    this.items.set(payment.id.value, payment);
  }
}

class InMemorySaleRepository implements SaleRepositoryPort {
  public readonly items = new Map<string, Sale>();

  async findById(id: SaleId | string): Promise<Sale | null> {
    const key = typeof id === 'string' ? id.trim() : id.value;
    return this.items.get(key) ?? null;
  }

  async save(sale: Sale): Promise<void> {
    this.items.set(sale.id.value, sale);
  }
}

class MockSalesEventPublisher implements SalesEventPublisherPort {
  public publishedEvents: DomainEvent[] = [];

  async publish(events: ReadonlyArray<DomainEvent>): Promise<void> {
    this.publishedEvents.push(...events);
  }

  clear(): void {
    this.publishedEvents = [];
  }
}

// ============================================================================
// QA Safety Net Suite for Phase 7.5
// ============================================================================

describe('Phase 7.5 Payment Complete Test Safety Net (Domain, Lifecycle, Money, Persistence, Application, Independence, Multiple Payments, Overpayment, Regression)', () => {
  const tenantId = 'tenant_kinergy_qa';
  const saleId = SaleId.create('sale_01j9876543210abcdef001');
  const t0 = new Date('2026-09-21T10:00:00.000Z');
  let clock: DeterministicClock;

  beforeEach(() => {
    clock = new DeterministicClock(t0);
  });

  const createPayableSale = (totalAmount: number = 100.0, currency: string = 'USD'): Sale => {
    const sale = Sale.create(
      {
        id: saleId,
        tenantId,
        currency,
        source: SourceReference.create({
          sourceType: SourceType.MEMBERSHIP_PLAN,
          sourceId: 'mem_qa_001',
        }),
      },
      clock,
    );
    sale.addItem({
      source: SourceReference.create({
        sourceType: SourceType.MEMBERSHIP_PLAN,
        sourceId: 'mem_qa_001',
      }),
      description: 'Monthly Wellness Plan',
      quantity: 1,
      unitPrice: Money.create(totalAmount, currency),
    });
    sale.finalize(clock);
    sale.clearEvents();
    return sale;
  };

  // ==========================================================================
  // SECTION 1: DOMAIN TESTS
  // ==========================================================================
  describe('1. Domain Tests (Payment Aggregate Invariants)', () => {
    describe('Valid Creation', () => {
      it('creates settled Payment with valid Sale ID, method, exact Money amount, reference, and timestamps', () => {
        const amount = Money.create(125.5, 'USD');
        const payment = Payment.createSettled(
          {
            id: 'pay_valid_001',
            tenantId,
            saleId,
            method: PaymentMethod.CASH,
            amount,
            reference: 'DRAWER-A-TX-100',
          },
          clock,
        );

        expect(payment.id.value).toBe('pay_valid_001');
        expect(payment.saleId.value).toBe(saleId.value);
        expect(payment.method).toBe(PaymentMethod.CASH);
        expect(payment.amount.cents).toBe(12550);
        expect(payment.reference?.value).toBe('DRAWER-A-TX-100');
        expect(payment.status).toBe(PaymentStatus.COMPLETED);
        expect(payment.paidAt).toEqual(t0);
        expect(payment.createdAt).toEqual(t0);
        expect(payment.updatedAt).toEqual(t0);
        expect(payment.version).toBe(1);
      });

      it('creates pending Payment with omitted reference and null paidAt', () => {
        const amount = Money.create(50.0, 'USD');
        const payment = Payment.createPending(
          {
            id: 'pay_pending_002',
            tenantId,
            saleId,
            method: PaymentMethod.QR,
            amount,
          },
          clock,
        );

        expect(payment.status).toBe(PaymentStatus.PENDING);
        expect(payment.reference).toBeNull();
        expect(payment.paidAt).toBeNull();
        expect(payment.createdAt).toEqual(t0);
      });

      it('supports all approved PaymentMethod enum values (CASH, QR)', () => {
        for (const method of SUPPORTED_PAYMENT_METHODS) {
          const p = Payment.createSettled(
            {
              tenantId,
              saleId,
              method,
              amount: Money.create(10.0, 'USD'),
            },
            clock,
          );
          expect(p.method).toBe(method);
        }
      });
    });

    describe('Invalid Creation & Boundary Rejections', () => {
      it('rejects malformed or empty payment ID', () => {
        expect(() => PaymentId.create('')).toThrow(PaymentDomainException);
        expect(() => PaymentId.create('   ')).toThrow(PaymentDomainException);
      });

      it('rejects invalid or unsupported payment methods at domain boundary', () => {
        expect(isValidPaymentMethod('BITCOIN')).toBe(false);
        expect(isValidPaymentMethod('CHECK')).toBe(false);
        expect(isValidPaymentMethod('CARD')).toBe(false);
        expect(isValidPaymentMethod('TRANSFER')).toBe(false);

        expect(() =>
          Payment.createSettled(
            {
              tenantId,
              saleId,
              // @ts-expect-error - testing runtime type guard
              method: 'BITCOIN',
              amount: Money.create(50, 'USD'),
            },
            clock,
          ),
        ).toThrow(InvalidPaymentMethodException);
      });

      it('rejects invalid, zero, or negative amounts', () => {
        // Zero amount
        expect(() =>
          Payment.createSettled(
            {
              tenantId,
              saleId,
              method: PaymentMethod.CASH,
              amount: Money.zero('USD'),
            },
            clock,
          ),
        ).toThrow(PaymentDomainException);

        // Negative amount
        const negativeMoney = Money.fromCents(-100, 'USD', { allowNegative: true });
        expect(() =>
          Payment.createSettled(
            {
              tenantId,
              saleId,
              method: PaymentMethod.CASH,
              amount: negativeMoney,
            },
            clock,
          ),
        ).toThrow(PaymentDomainException);

        // Raw primitive number
        expect(() =>
          Payment.createSettled(
            {
              tenantId,
              saleId,
              method: PaymentMethod.CASH,
              // @ts-expect-error - testing primitive rejection
              amount: 50.0,
            },
            clock,
          ),
        ).toThrow(PaymentDomainException);
      });

      it('rejects malformed references (empty, whitespace, excessive length, or PAN credit card numbers)', () => {
        expect(() => PaymentReference.create('')).toThrow(InvalidPaymentReferenceException);
        expect(() => PaymentReference.create('   ')).toThrow(InvalidPaymentReferenceException);
        expect(() => PaymentReference.create('a'.repeat(101))).toThrow(
          InvalidPaymentReferenceException,
        );

        // PCI-DSS Non-Storage compliance: PAN rejection
        expect(() => PaymentReference.create('4111222233334444')).toThrow(
          InvalidPaymentReferenceException,
        );
        expect(() => PaymentReference.create('4111-2222-3333-4444')).toThrow(
          InvalidPaymentReferenceException,
        );
      });

      it('rejects contradictory timestamp/status combinations on reconstitution', () => {
        // SETTLED without paidAt
        expect(() =>
          Payment.reconstitute({
            id: PaymentId.create('pay_bad_01'),
            tenantId,
            saleId,
            method: PaymentMethod.CASH,
            amount: Money.create(50, 'USD'),
            reference: null,
            status: PaymentStatus.COMPLETED,
            paidAt: null, // Contradiction!
            createdAt: t0,
            updatedAt: t0,
            version: 1,
          }),
        ).toThrow(PaymentDomainException);

        // PENDING with paidAt
        expect(() =>
          Payment.reconstitute({
            id: PaymentId.create('pay_bad_02'),
            tenantId,
            saleId,
            method: PaymentMethod.CASH,
            amount: Money.create(50, 'USD'),
            reference: null,
            status: PaymentStatus.PENDING,
            paidAt: t0, // Contradiction!
            createdAt: t0,
            updatedAt: t0,
            version: 1,
          }),
        ).toThrow(PaymentDomainException);
      });
    });
  });

  // ==========================================================================
  // SECTION 2: STATE MACHINE TESTS
  // ==========================================================================
  describe('2. State Machine & Transition Matrix Tests (4x4 Matrix)', () => {
    it('defines exactly 16 discrete transition cells covering the 4x4 matrix', () => {
      expect(PAYMENT_TRANSITION_MATRIX).toHaveLength(16);
      for (const from of SUPPORTED_PAYMENT_STATUSES) {
        for (const to of SUPPORTED_PAYMENT_STATUSES) {
          const rule = PAYMENT_TRANSITION_MATRIX.find((r) => r.from === from && r.to === to);
          expect(rule).toBeDefined();
          expect(rule?.allowed).toBe(canTransitionPaymentStatus(from, to));
        }
      }
    });

    it('identifies terminal states accurately', () => {
      expect(isTerminalPaymentStatus(PaymentStatus.PENDING)).toBe(false);
      expect(isTerminalPaymentStatus(PaymentStatus.COMPLETED)).toBe(true);
      expect(isTerminalPaymentStatus(PaymentStatus.FAILED)).toBe(true);
      expect(isTerminalPaymentStatus(PaymentStatus.CANCELLED)).toBe(true);
    });

    describe('Valid Transitions from PENDING', () => {
      it('transitions PENDING -> SETTLED: sets paidAt, increments version, emits PaymentSettledEvent', () => {
        const payment = Payment.createPending(
          { tenantId, saleId, method: PaymentMethod.QR, amount: Money.create(75, 'USD') },
          clock,
        );

        clock.advanceSeconds(30);
        const settleTime = clock.now();
        payment.settle(clock);

        expect(payment.status).toBe(PaymentStatus.COMPLETED);
        expect(payment.paidAt).toEqual(settleTime);
        expect(payment.updatedAt).toEqual(settleTime);
        expect(payment.version).toBe(2);

        const events = payment.getUncommittedEvents();
        expect(events).toHaveLength(1);
        expect(events[0]).toBeInstanceOf(PaymentSettledEvent);
      });

      it('transitions PENDING -> FAILED: leaves paidAt null, increments version, emits PaymentFailedEvent', () => {
        const payment = Payment.createPending(
          { tenantId, saleId, method: PaymentMethod.QR, amount: Money.create(75, 'USD') },
          clock,
        );

        clock.advanceSeconds(10);
        payment.fail('QR network timed out', clock);

        expect(payment.status).toBe(PaymentStatus.FAILED);
        expect(payment.paidAt).toBeNull();
        expect(payment.version).toBe(2);

        const events = payment.getUncommittedEvents();
        expect(events).toHaveLength(1);
        expect(events[0]).toBeInstanceOf(PaymentFailedEvent);
      });

      it('transitions PENDING -> CANCELLED: leaves paidAt null, increments version, emits PaymentCancelledEvent', () => {
        const payment = Payment.createPending(
          { tenantId, saleId, method: PaymentMethod.QR, amount: Money.create(75, 'USD') },
          clock,
        );

        clock.advanceSeconds(15);
        payment.cancel('Customer abandoned QR session', clock);

        expect(payment.status).toBe(PaymentStatus.CANCELLED);
        expect(payment.paidAt).toBeNull();
        expect(payment.version).toBe(2);

        const events = payment.getUncommittedEvents();
        expect(events).toHaveLength(1);
        expect(events[0]).toBeInstanceOf(PaymentCancelledEvent);
      });
    });

    describe('Invalid Transitions & Aggregate Immutability on Failure', () => {
      it('prohibits PENDING -> PENDING and leaves aggregate unchanged', () => {
        const payment = Payment.createPending(
          { tenantId, saleId, method: PaymentMethod.CASH, amount: Money.create(100, 'USD') },
          clock,
        );
        const originalVersion = payment.version;
        const originalUpdatedAt = payment.updatedAt;

        expect(canTransitionPaymentStatus(PaymentStatus.PENDING, PaymentStatus.PENDING)).toBe(
          false,
        );
        expect(payment.status).toBe(PaymentStatus.PENDING);
        expect(payment.version).toBe(originalVersion);
        expect(payment.updatedAt).toEqual(originalUpdatedAt);
        expect(payment.getUncommittedEvents()).toHaveLength(0);
      });

      it('prohibits transitions from SETTLED (terminal state) and leaves aggregate unchanged', () => {
        const payment = Payment.createSettled(
          { tenantId, saleId, method: PaymentMethod.CASH, amount: Money.create(100, 'USD') },
          clock,
        );
        payment.clearEvents();
        const originalPaidAt = payment.paidAt;
        const originalVersion = payment.version;

        // Try settling again
        expect(() => payment.settle(clock)).toThrow(InvalidPaymentTransitionException);
        // Try failing
        expect(() => payment.fail('declined', clock)).toThrow(InvalidPaymentTransitionException);
        // Try cancelling
        expect(() => payment.cancel('customer left', clock)).toThrow(
          InvalidPaymentTransitionException,
        );

        expect(payment.status).toBe(PaymentStatus.COMPLETED);
        expect(payment.paidAt).toEqual(originalPaidAt);
        expect(payment.version).toBe(originalVersion);
        expect(payment.getUncommittedEvents()).toHaveLength(0);
      });

      it('prohibits transitions from FAILED (terminal state) and leaves aggregate unchanged', () => {
        const payment = Payment.createPending(
          { tenantId, saleId, method: PaymentMethod.QR, amount: Money.create(100, 'USD') },
          clock,
        );
        payment.fail('declined', clock);
        payment.clearEvents();
        const originalVersion = payment.version;

        expect(() => payment.settle(clock)).toThrow(InvalidPaymentTransitionException);
        expect(() => payment.cancel('cancelled', clock)).toThrow(InvalidPaymentTransitionException);

        expect(payment.status).toBe(PaymentStatus.FAILED);
        expect(payment.version).toBe(originalVersion);
        expect(payment.getUncommittedEvents()).toHaveLength(0);
      });

      it('prohibits transitions from CANCELLED (terminal state) and leaves aggregate unchanged', () => {
        const payment = Payment.createPending(
          { tenantId, saleId, method: PaymentMethod.QR, amount: Money.create(100, 'USD') },
          clock,
        );
        payment.cancel('timeout', clock);
        payment.clearEvents();
        const originalVersion = payment.version;

        expect(() => payment.settle(clock)).toThrow(InvalidPaymentTransitionException);
        expect(() => payment.fail('declined', clock)).toThrow(InvalidPaymentTransitionException);

        expect(payment.status).toBe(PaymentStatus.CANCELLED);
        expect(payment.version).toBe(originalVersion);
        expect(payment.getUncommittedEvents()).toHaveLength(0);
      });
    });
  });

  // ==========================================================================
  // SECTION 3: MONEY TESTS
  // ==========================================================================
  describe('3. Money Tests (Precision, Arithmetic & Floating-Point Defense)', () => {
    it('uses Phase 7.4 Money VO preserving exact cents without binary floating-point drift', () => {
      // 0.1 + 0.2 in JS float is 0.30000000000000004. In Money VO it is exactly 30 cents.
      const m1 = Money.create(0.1, 'USD');
      const m2 = Money.create(0.2, 'USD');
      const sum = m1.add(m2);

      const payment = Payment.createSettled(
        { tenantId, saleId, method: PaymentMethod.CASH, amount: sum },
        clock,
      );

      expect(payment.amount.cents).toBe(30);
      expect(payment.amount.amount).toBe(0.3);
      expect(payment.amount.toString()).toBe('0.30 USD');
    });

    it('preserves exact fractional cents during multiplication without rounding leaks', () => {
      // 19.99 * 3 in float is 59.970000000000006
      const unit = Money.create(19.99, 'USD');
      const multiplied = unit.multiply(3);

      const payment = Payment.createSettled(
        { tenantId, saleId, method: PaymentMethod.QR, amount: multiplied },
        clock,
      );

      expect(payment.amount.cents).toBe(5997);
      expect(payment.amount.amount).toBe(59.97);
      expect(payment.amount.toString()).toBe('59.97 USD');
    });

    it('handles large monetary amounts ($1,000,000.00) without integer overflow or drift', () => {
      const largeMoney = Money.create(1_000_000.0, 'USD');
      const payment = Payment.createSettled(
        { tenantId, saleId, method: PaymentMethod.CASH, amount: largeMoney },
        clock,
      );

      expect(payment.amount.cents).toBe(100_000_000);
      expect(payment.amount.amount).toBe(1_000_000.0);
      expect(payment.amount.toString()).toBe('1000000.00 USD');
    });

    it('handles single-cent precision boundary ($0.01)', () => {
      const cent = Money.create(0.01, 'USD');
      const payment = Payment.createSettled(
        { tenantId, saleId, method: PaymentMethod.CASH, amount: cent },
        clock,
      );

      expect(payment.amount.cents).toBe(1);
      expect(payment.amount.amount).toBe(0.01);
      expect(payment.amount.toString()).toBe('0.01 USD');
    });
  });

  // ==========================================================================
  // SECTION 4: REPOSITORY & PERSISTENCE TESTS
  // ==========================================================================
  describe('4. Repository Tests (Persistence Mapping, Round-Trip & Optional Fields)', () => {
    it('performs bidirectional round-trip mapping via PrismaPaymentMapper with exact fidelity', () => {
      const payment = Payment.createSettled(
        {
          id: 'pay_repo_001',
          tenantId,
          saleId,
          method: PaymentMethod.CASH,
          amount: Money.create(49.99, 'USD'),
          reference: 'POS-REC-4999',
        },
        clock,
      );

      // Map domain -> persistence model
      const persistence = PrismaPaymentMapper.toPersistence(payment);
      expect(persistence.amount).toBeInstanceOf(Prisma.Decimal);
      expect(persistence.amount.toFixed(2)).toBe('49.99');
      expect(persistence.currency).toBe('USD');
      expect(persistence.reference).toBe('POS-REC-4999');
      expect(persistence.paidAt).toEqual(t0);

      // Map persistence -> domain
      const reconstituted = PrismaPaymentMapper.toDomain({
        ...persistence,
        createdAt: payment.createdAt,
        updatedAt: payment.updatedAt,
      });

      expect(reconstituted.id.value).toBe(payment.id.value);
      expect(reconstituted.saleId.value).toBe(payment.saleId.value);
      expect(reconstituted.tenantId).toBe(payment.tenantId);
      expect(reconstituted.amount.cents).toBe(4999);
      expect(reconstituted.amount.amount).toBe(49.99);
      expect(reconstituted.amount.currency).toBe('USD');
      expect(reconstituted.method).toBe(PaymentMethod.CASH);
      expect(reconstituted.status).toBe(PaymentStatus.COMPLETED);
      expect(reconstituted.reference?.value).toBe('POS-REC-4999');
      expect(reconstituted.paidAt).toEqual(t0);
      expect(reconstituted.version).toBe(1);
    });

    it('maps optional fields (null reference, null paidAt) accurately', () => {
      const pendingPayment = Payment.createPending(
        {
          id: 'pay_repo_pending_002',
          tenantId,
          saleId,
          method: PaymentMethod.QR,
          amount: Money.create(15.0, 'USD'),
        },
        clock,
      );

      const persistence = PrismaPaymentMapper.toPersistence(pendingPayment);
      expect(persistence.reference).toBeNull();
      expect(persistence.paidAt).toBeNull();

      const reconstituted = PrismaPaymentMapper.toDomain({
        ...persistence,
        createdAt: pendingPayment.createdAt,
        updatedAt: pendingPayment.updatedAt,
      });

      expect(reconstituted.reference).toBeNull();
      expect(reconstituted.paidAt).toBeNull();
      expect(reconstituted.status).toBe(PaymentStatus.PENDING);
    });

    it('handles create, findById, and findBySaleId via repository port', async () => {
      const repo = new InMemoryPaymentRepository();
      const payment1 = Payment.createSettled(
        { id: 'p1', tenantId, saleId, method: PaymentMethod.CASH, amount: Money.create(20, 'USD') },
        clock,
      );
      const payment2 = Payment.createPending(
        { id: 'p2', tenantId, saleId, method: PaymentMethod.QR, amount: Money.create(30, 'USD') },
        clock,
      );

      await repo.save(payment1);
      await repo.save(payment2);

      const foundP1 = await repo.findById('p1');
      expect(foundP1).not.toBeNull();
      expect(foundP1?.amount.amount).toBe(20);

      const salePayments = await repo.findBySaleId(saleId);
      expect(salePayments).toHaveLength(2);
      expect(salePayments.map((p) => p.id.value)).toEqual(['p1', 'p2']);

      const notFound = await repo.findById('non_existent');
      expect(notFound).toBeNull();
    });
  });

  // ==========================================================================
  // SECTION 5: APPLICATION TESTS
  // ==========================================================================
  describe('5. Application Tests (Handlers, Use Cases & Failure Handling)', () => {
    let paymentRepo: InMemoryPaymentRepository;
    let saleRepo: InMemorySaleRepository;
    let eventPublisher: MockSalesEventPublisher;

    let recordPaymentHandler: RecordPaymentHandler;
    let getPaymentByIdHandler: GetPaymentByIdHandler;
    let getPaymentsBySaleIdHandler: GetPaymentsBySaleIdHandler;
    let settlePaymentHandler: SettlePaymentHandler;
    let cancelPaymentHandler: CancelPaymentHandler;

    let payableSale: Sale;

    beforeEach(async () => {
      paymentRepo = new InMemoryPaymentRepository();
      saleRepo = new InMemorySaleRepository();
      eventPublisher = new MockSalesEventPublisher();

      payableSale = createPayableSale(100.0, 'USD');
      await saleRepo.save(payableSale);

      recordPaymentHandler = new RecordPaymentHandler(paymentRepo, saleRepo, clock, eventPublisher);
      getPaymentByIdHandler = new GetPaymentByIdHandler(paymentRepo);
      getPaymentsBySaleIdHandler = new GetPaymentsBySaleIdHandler(paymentRepo, saleRepo);
      settlePaymentHandler = new SettlePaymentHandler(paymentRepo, saleRepo, clock, eventPublisher);
      cancelPaymentHandler = new CancelPaymentHandler(paymentRepo, saleRepo, clock, eventPublisher);
    });

    it('records a settled payment successfully and emits events', async () => {
      const command = new RecordPaymentCommand({
        saleId: saleId.value,
        method: 'CASH',
        amount: 50.0,
        currency: 'USD',
        reference: 'CASH-REGISTER-01',
        status: PaymentStatus.COMPLETED,
        tenantId,
        currentUser: { roles: ['Receptionist'], permissions: ['payments.create'] },
      });

      const result = await recordPaymentHandler.execute(command);
      expect(result.isSuccess).toBe(true);
      const dto = result.getValue();

      expect(dto.id).toBeDefined();
      expect(dto.saleId).toBe(saleId.value);
      expect(dto.method).toBe(PaymentMethod.CASH);
      expect(dto.amount.cents).toBe(5000);
      expect(dto.status).toBe(PaymentStatus.COMPLETED);

      expect(eventPublisher.publishedEvents.some((e) => e.eventType === 'PaymentSettled')).toBe(
        true,
      );
    });

    it('retrieves payment by ID with tenant isolation verification', async () => {
      const payment = Payment.createSettled(
        {
          id: 'pay_app_001',
          tenantId,
          saleId,
          method: PaymentMethod.CASH,
          amount: Money.create(50, 'USD'),
        },
        clock,
      );
      await paymentRepo.save(payment);

      const query = new GetPaymentByIdQuery({
        paymentId: 'pay_app_001',
        tenantId,
        currentUser: { roles: ['Receptionist'], permissions: ['payments.read'] },
      });
      const result = await getPaymentByIdHandler.execute(query);
      expect(result.isSuccess).toBe(true);
      const dto = result.getValue();

      expect(dto.id).toBe('pay_app_001');
      expect(dto.amount.formatted).toBe('50.00');
    });

    it('lists payments for a sale after verifying sale existence', async () => {
      const p1 = Payment.createSettled(
        { id: 'p1', tenantId, saleId, method: PaymentMethod.CASH, amount: Money.create(25, 'USD') },
        clock,
      );
      await paymentRepo.save(p1);

      const query = new GetPaymentsBySaleIdQuery({
        saleId: saleId.value,
        tenantId,
        currentUser: { roles: ['Receptionist'], permissions: ['payments.read'] },
      });
      const result = await getPaymentsBySaleIdHandler.execute(query);
      expect(result.isSuccess).toBe(true);
      const list = result.getValue();

      expect(list).toHaveLength(1);
      expect(list[0]!.id).toBe('p1');
    });

    it('transitions lifecycle: settles a pending payment via SettlePaymentHandler', async () => {
      const p = Payment.createPending(
        {
          id: 'p_pending',
          tenantId,
          saleId,
          method: PaymentMethod.QR,
          amount: Money.create(40, 'USD'),
        },
        clock,
      );
      await paymentRepo.save(p);

      const command = new SettlePaymentCommand({
        paymentId: 'p_pending',
        saleId: saleId.value,
        reference: 'QR-SETTLED-REF',
        tenantId,
        currentUser: { roles: ['Receptionist'], permissions: ['payments.create'] },
      });
      const result = await settlePaymentHandler.execute(command);
      expect(result.isSuccess).toBe(true);
      const dto = result.getValue();

      expect(dto.status).toBe(PaymentStatus.COMPLETED);
      expect(dto.reference).toBe('QR-SETTLED-REF');
    });

    it('transitions lifecycle: cancels a pending payment via CancelPaymentHandler with payments.manage', async () => {
      const p = Payment.createPending(
        {
          id: 'p_to_cancel',
          tenantId,
          saleId,
          method: PaymentMethod.QR,
          amount: Money.create(40, 'USD'),
        },
        clock,
      );
      await paymentRepo.save(p);

      const command = new CancelPaymentCommand({
        paymentId: 'p_to_cancel',
        saleId: saleId.value,
        reason: 'Customer abandoned checkout',
        tenantId,
        currentUser: { roles: ['Gym Manager'], permissions: ['payments.manage'] },
      });
      const result = await cancelPaymentHandler.execute(command);
      expect(result.isSuccess).toBe(true);
      const dto = result.getValue();

      expect(dto.status).toBe(PaymentStatus.CANCELLED);
    });

    it('rejects recording payment when Sale does not exist', async () => {
      const command = new RecordPaymentCommand({
        saleId: 'non_existent_sale',
        method: 'CASH',
        amount: 50.0,
        currency: 'USD',
        status: PaymentStatus.COMPLETED,
        tenantId,
        currentUser: { roles: ['Receptionist'], permissions: ['payments.create'] },
      });

      const result = await recordPaymentHandler.execute(command);
      expect(result.isFailure).toBe(true);
      expect(result.getError()).toBeInstanceOf(SaleNotFoundException);
    });

    it('rejects listing payments when referenced Sale does not exist', async () => {
      const query = new GetPaymentsBySaleIdQuery({
        saleId: 'non_existent_sale',
        tenantId,
        currentUser: { roles: ['Receptionist'], permissions: ['payments.read'] },
      });

      const result = await getPaymentsBySaleIdHandler.execute(query);
      expect(result.isFailure).toBe(true);
      expect(result.getError()).toBeInstanceOf(SaleNotFoundException);
    });

    it('rejects cancellation when user lacks payments.manage permission', async () => {
      const p = Payment.createPending(
        {
          id: 'p_no_perm',
          tenantId,
          saleId,
          method: PaymentMethod.QR,
          amount: Money.create(40, 'USD'),
        },
        clock,
      );
      await paymentRepo.save(p);

      const command = new CancelPaymentCommand({
        paymentId: 'p_no_perm',
        saleId: saleId.value,
        reason: 'Attempted by receptionist',
        tenantId,
        currentUser: { roles: ['Receptionist'], permissions: ['payments.create', 'payments.read'] }, // lacks payments.manage
      });

      const result = await cancelPaymentHandler.execute(command);
      expect(result.isFailure).toBe(true);
      expect(result.getError()).toBeInstanceOf(PaymentUnauthorizedException);
    });
  });

  // ==========================================================================
  // SECTION 8: INDEPENDENCE FROM SALE TOTALS
  // ==========================================================================
  describe('8. Independence from Sale Totals Invariant', () => {
    it('proves Payment recording does NOT calculate or mutate Sale.subtotal, discountTotal, or total', async () => {
      // Create a Sale with items totaling $100.00
      const sale = Sale.create(
        {
          id: saleId,
          tenantId,
          currency: 'USD',
          source: SourceReference.create({
            sourceType: SourceType.INVENTORY_ITEM,
            sourceId: 'DIRECT-POS',
          }),
        },
        clock,
      );
      sale.addItem({
        source: SourceReference.create({
          sourceType: SourceType.INVENTORY_ITEM,
          sourceId: 'DIRECT-POS',
        }),
        description: 'Protein Shake',
        unitPrice: Money.create(50.0, 'USD'),
        quantity: 2,
      });

      // Apply a fixed $10 discount
      sale.applyOrderDiscount(Discount.fixed(10));

      expect(sale.subtotal.amount).toBe(100.0);
      expect(sale.discountTotal.amount).toBe(10.0);
      expect(sale.total.amount).toBe(90.0);

      // Snapshot Sale totals
      const subtotalBefore = sale.subtotal;
      const discountBefore = sale.discountTotal;
      const totalBefore = sale.total;

      // Record a Payment of $40.00 in domain
      const payment1 = Payment.createSettled(
        {
          tenantId,
          saleId: sale.id,
          method: PaymentMethod.CASH,
          amount: Money.create(40.0, 'USD'),
        },
        clock,
      );

      // Record a second Payment of $50.00 in domain
      const payment2 = Payment.createSettled(
        {
          tenantId,
          saleId: sale.id,
          method: PaymentMethod.QR,
          amount: Money.create(50.0, 'USD'),
        },
        clock,
      );

      // Assert Sale aggregate totals are completely untouched and independent
      expect(sale.subtotal.equals(subtotalBefore)).toBe(true);
      expect(sale.discountTotal.equals(discountBefore)).toBe(true);
      expect(sale.total.equals(totalBefore)).toBe(true);
      expect(sale.subtotal.amount).toBe(100.0);
      expect(sale.discountTotal.amount).toBe(10.0);
      expect(sale.total.amount).toBe(90.0);

      // Payment amount is its own recorded monetary tender
      expect(payment1.amount.amount).toBe(40.0);
      expect(payment2.amount.amount).toBe(50.0);
    });
  });

  // ==========================================================================
  // SECTION 9: MULTIPLE PAYMENTS (SPLIT TENDER & INDEPENDENT LIFECYCLES)
  // ==========================================================================
  describe('9. Multiple Payments & Split-Tender Support', () => {
    it('supports multiple independent payments for a single Sale with distinct methods and statuses', async () => {
      const repo = new InMemoryPaymentRepository();

      // Split tender for Sale:
      // 1. $30.00 Cash (Settled)
      // 2. $50.00 QR (Pending)
      // 3. $20.00 QR (Cancelled)
      const pay1 = Payment.createSettled(
        {
          id: 'pay_split_01',
          tenantId,
          saleId,
          method: PaymentMethod.CASH,
          amount: Money.create(30.0, 'USD'),
          reference: 'DRAWER-1',
        },
        clock,
      );

      clock.advanceSeconds(10);
      const pay2 = Payment.createPending(
        {
          id: 'pay_split_02',
          tenantId,
          saleId,
          method: PaymentMethod.QR,
          amount: Money.create(50.0, 'USD'),
          reference: 'QR-PROMPT-50',
        },
        clock,
      );

      clock.advanceSeconds(10);
      const pay3 = Payment.createPending(
        {
          id: 'pay_split_03',
          tenantId,
          saleId,
          method: PaymentMethod.QR,
          amount: Money.create(20.0, 'USD'),
        },
        clock,
      );
      pay3.cancel('Customer declined QR fee', clock);

      await repo.save(pay1);
      await repo.save(pay2);
      await repo.save(pay3);

      const allPayments = await repo.findBySaleId(saleId);
      expect(allPayments).toHaveLength(3);

      // Assert independent IDs
      expect(new Set(allPayments.map((p) => p.id.value)).size).toBe(3);

      // Assert independent methods
      expect(allPayments.map((p) => p.method)).toEqual([
        PaymentMethod.CASH,
        PaymentMethod.QR,
        PaymentMethod.QR,
      ]);

      // Assert independent statuses
      expect(allPayments.map((p) => p.status)).toEqual([
        PaymentStatus.COMPLETED,
        PaymentStatus.PENDING,
        PaymentStatus.CANCELLED,
      ]);

      // Assert independent amounts
      expect(allPayments.map((p) => p.amount.amount)).toEqual([30.0, 50.0, 20.0]);
    });
  });

  // ==========================================================================
  // SECTION 10: NO ACCIDENTAL OVERPAYMENT LOGIC (MILESTONE BOUNDARY)
  // ==========================================================================
  describe('10. No Accidental Overpayment Logic (Phase 7.5 Architectural Boundary)', () => {
    it('demonstrates domain Payment aggregate allows recording independent tenders regardless of Sale totals', async () => {
      // In Phase 7.5, Payment is an independent financial record.
      // Domain Payment aggregate does NOT couple to Sale.total.
      const pay1 = Payment.createSettled(
        {
          tenantId,
          saleId,
          method: PaymentMethod.CASH,
          amount: Money.create(100.0, 'USD'),
        },
        clock,
      );
      const pay2 = Payment.createSettled(
        {
          tenantId,
          saleId,
          method: PaymentMethod.CASH,
          amount: Money.create(50.0, 'USD'),
        },
        clock,
      );

      // In domain aggregate, sum of tenders (150) can exist for a $100 sale
      expect(pay1.amount.amount + pay2.amount.amount).toBe(150.0);
    });

    it('documents application layer boundary: checks balance against Sale total when payable', async () => {
      const paymentRepo = new InMemoryPaymentRepository();
      const saleRepo = new InMemorySaleRepository();
      const eventPublisher = new MockSalesEventPublisher();

      const sale = createPayableSale(100.0, 'USD');
      await saleRepo.save(sale);

      const handler = new RecordPaymentHandler(paymentRepo, saleRepo, clock, eventPublisher);

      // First payment of $80 succeeds
      const result1 = await handler.execute(
        new RecordPaymentCommand({
          saleId: sale.id.value,
          method: 'CASH',
          amount: 80.0,
          currency: 'USD',
          status: PaymentStatus.COMPLETED,
          tenantId,
          currentUser: { roles: ['Receptionist'], permissions: ['payments.create'] },
        }),
      );
      expect(result1.isSuccess).toBe(true);

      // Second payment of $50 exceeds remaining balance of $20 -> fails with PaymentOverpaymentException
      const result2 = await handler.execute(
        new RecordPaymentCommand({
          saleId: sale.id.value,
          method: 'CASH',
          amount: 50.0,
          currency: 'USD',
          status: PaymentStatus.COMPLETED,
          tenantId,
          currentUser: { roles: ['Receptionist'], permissions: ['payments.create'] },
        }),
      );
      expect(result2.isFailure).toBe(true);
      expect(result2.getError()).toBeInstanceOf(PaymentOverpaymentException);
    });
  });

  // ==========================================================================
  // SECTION 11: REGRESSION SAFETY FOR PHASE 7.4 SALE TOTALS
  // ==========================================================================
  describe('11. Regression Safety for Phase 7.4 Sale Totals', () => {
    it('verifies Phase 7.4 Sale item, discount, and total calculations remain 100% deterministic', () => {
      const sale = Sale.create(
        {
          id: SaleId.create('sale_phase74_reg_01'),
          tenantId,
          currency: 'USD',
          source: SourceReference.create({
            sourceType: SourceType.INVENTORY_ITEM,
            sourceId: 'REG-74',
          }),
        },
        clock,
      );

      // Add item 1: 3 x $25.00 = $75.00
      sale.addItem({
        source: SourceReference.create({
          sourceType: SourceType.INVENTORY_ITEM,
          sourceId: 'REG-74-ITEM1',
        }),
        description: 'T-Shirt',
        unitPrice: Money.create(25.0, 'USD'),
        quantity: 3,
      });

      // Add item 2: 2 x $12.50 = $25.00
      sale.addItem({
        source: SourceReference.create({
          sourceType: SourceType.INVENTORY_ITEM,
          sourceId: 'REG-74-ITEM2',
        }),
        description: 'Water Bottle',
        unitPrice: Money.create(12.5, 'USD'),
        quantity: 2,
      });

      expect(sale.subtotal.amount).toBe(100.0);
      expect(sale.subtotal.cents).toBe(10000);

      // Apply 15% order discount: 15% of $100.00 = $15.00
      sale.applyOrderDiscount(Discount.percentage(15));

      expect(sale.discountTotal.amount).toBe(15.0);
      expect(sale.discountTotal.cents).toBe(1500);

      // Final total: $100.00 - $15.00 = $85.00
      expect(sale.total.amount).toBe(85.0);
      expect(sale.total.cents).toBe(8500);

      // Finalize sale
      sale.finalize(clock);
      expect(sale.status).toBe(SaleStatus.PENDING_PAYMENT);
    });
  });
});
