import { Entity } from './shared/entity';
import { AggregateRoot } from './shared/aggregate-root';
import { DomainEvent } from './shared/domain-event';
import { PaymentId } from './value-objects/payment-id.vo';
import { SaleId } from './value-objects/sale-id.vo';
import { Money } from './value-objects/money.vo';
import { PaymentReference } from './value-objects/payment-reference.vo';
import { PaymentMethod, assertValidPaymentMethod } from './enums/payment-method.enum';
import {
  PaymentStatus,
  assertValidPaymentStatus,
  canTransitionPaymentStatus,
} from './enums/payment-status.enum';
import { PaymentDomainException } from './exceptions/payment-domain.exception';
import { InvalidPaymentTransitionException } from './exceptions/invalid-payment-transition.exception';
import { Clock, SystemClock } from './shared/clock';
import { PaymentSettledEvent, PaymentFailedEvent, PaymentCancelledEvent } from './events';

export interface CreateSettledPaymentParams {
  id?: PaymentId | string;
  tenantId?: string;
  saleId: SaleId | string;
  method: PaymentMethod;
  amount: Money;
  reference?: string | PaymentReference | null;
}

export interface CreatePendingPaymentParams {
  id?: PaymentId | string;
  tenantId?: string;
  saleId: SaleId | string;
  method: PaymentMethod;
  amount: Money;
  reference?: string | PaymentReference | null;
}

export interface SettlePaymentOptions {
  reference?: string | PaymentReference | null;
  paidAt?: Date;
  clock?: Clock;
}

export interface PaymentReconstituteProps {
  id: PaymentId;
  tenantId: string;
  saleId: SaleId;
  method: PaymentMethod;
  amount: Money;
  status: PaymentStatus;
  reference: PaymentReference | null;
  paidAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  version: number;
}

/**
 * Autonomous Payment Aggregate Root and Entity for the Sales & Payments Bounded Context.
 * Conforms strictly to ADR-0115:
 * - Couples to Sale solely via scalar SaleId (identifier-based coupling).
 * - Reuses canonical Phase 7.4 Money VO for all monetary values.
 * - Does NOT calculate commercial subtotals, item discounts, or taxes.
 * - Enforces append-only progressive immutability once SETTLED.
 * - Manages discrete domain events for lifecycle milestones.
 */
export class Payment implements Entity<PaymentId>, AggregateRoot<PaymentId> {
  private readonly _id: PaymentId;
  private readonly _tenantId: string;
  private readonly _saleId: SaleId;
  private readonly _method: PaymentMethod;
  private readonly _amount: Money;
  private _status: PaymentStatus;
  private _reference: PaymentReference | null;
  private _paidAt: Date | null;
  private readonly _createdAt: Date;
  private _updatedAt: Date;
  private _version: number;
  private readonly _uncommittedEvents: DomainEvent[] = [];

  private constructor(props: PaymentReconstituteProps) {
    Payment.validateProps(props);

    this._id = props.id;
    this._tenantId = props.tenantId.trim();
    this._saleId = props.saleId;
    this._method = props.method;
    this._amount = props.amount;
    this._status = props.status;
    this._reference = props.reference;
    this._paidAt = props.paidAt ? new Date(props.paidAt.getTime()) : null;
    this._createdAt = new Date(props.createdAt.getTime());
    this._updatedAt = new Date(props.updatedAt.getTime());
    this._version = props.version;
  }

  private static validateProps(props: PaymentReconstituteProps): void {
    if (!props.id || !(props.id instanceof PaymentId)) {
      throw new PaymentDomainException(
        'Payment must have a valid PaymentId.',
        'INVALID_PAYMENT_ID',
      );
    }

    if (
      !props.tenantId ||
      typeof props.tenantId !== 'string' ||
      props.tenantId.trim().length === 0
    ) {
      throw new PaymentDomainException(
        'Payment must have a valid non-empty tenantId.',
        'INVALID_TENANT_ID',
      );
    }

    if (!props.saleId || !(props.saleId instanceof SaleId)) {
      throw new PaymentDomainException('Payment must reference a valid SaleId.', 'INVALID_SALE_ID');
    }

    assertValidPaymentMethod(props.method);
    assertValidPaymentStatus(props.status);

    if (!props.amount || !(props.amount instanceof Money)) {
      throw new PaymentDomainException(
        'Payment amount must be an instance of canonical Money VO.',
        'INVALID_PAYMENT_AMOUNT',
      );
    }

    if (props.amount.cents <= 0) {
      throw new PaymentDomainException(
        `Payment amount must be strictly greater than zero. Received: ${props.amount.toString()}.`,
        'PAYMENT_AMOUNT_MUST_BE_POSITIVE',
      );
    }

    if (props.reference !== null && !(props.reference instanceof PaymentReference)) {
      throw new PaymentDomainException(
        'Payment reference must be a PaymentReference instance or null.',
        'INVALID_PAYMENT_REFERENCE',
      );
    }

    if (
      !props.createdAt ||
      !(props.createdAt instanceof Date) ||
      isNaN(props.createdAt.getTime())
    ) {
      throw new PaymentDomainException(
        'Payment createdAt must be a valid Date.',
        'INVALID_CREATED_AT',
      );
    }

    if (
      !props.updatedAt ||
      !(props.updatedAt instanceof Date) ||
      isNaN(props.updatedAt.getTime())
    ) {
      throw new PaymentDomainException(
        'Payment updatedAt must be a valid Date.',
        'INVALID_UPDATED_AT',
      );
    }

    if (props.updatedAt.getTime() < props.createdAt.getTime()) {
      throw new PaymentDomainException(
        'Payment updatedAt cannot be earlier than createdAt.',
        'INVALID_TIMESTAMP_SEQUENCE',
      );
    }

    // Invariant: Status and paidAt alignment
    if (props.status === PaymentStatus.SETTLED) {
      if (!props.paidAt || !(props.paidAt instanceof Date) || isNaN(props.paidAt.getTime())) {
        throw new PaymentDomainException(
          'Settled payment must have a valid paidAt timestamp.',
          'SETTLED_PAYMENT_MISSING_PAID_AT',
        );
      }
    } else {
      if (props.paidAt !== null) {
        throw new PaymentDomainException(
          `Non-settled payment in status '${props.status}' must have paidAt set to null.`,
          'NON_SETTLED_PAYMENT_HAS_PAID_AT',
        );
      }
    }

    if (
      typeof props.version !== 'number' ||
      props.version < 1 ||
      !Number.isInteger(props.version)
    ) {
      throw new PaymentDomainException(
        `Payment version must be a positive integer >= 1. Received: ${props.version}.`,
        'INVALID_PAYMENT_VERSION',
      );
    }
  }

  // ---------------------------------------------------------------------------
  // Factory Methods
  // ---------------------------------------------------------------------------

  /**
   * Factory method to create an immediately settled payment (e.g. physical CASH or confirmed counter QR).
   */
  public static createSettled(
    params: CreateSettledPaymentParams,
    clock: Clock = new SystemClock(),
  ): Payment {
    const now = clock.now();
    const id =
      params.id instanceof PaymentId
        ? params.id
        : PaymentId.create(typeof params.id === 'string' ? params.id : undefined);

    const saleId = params.saleId instanceof SaleId ? params.saleId : SaleId.create(params.saleId);

    const reference =
      params.reference instanceof PaymentReference
        ? params.reference
        : PaymentReference.from(params.reference);

    const tenantId = params.tenantId ? params.tenantId.trim() : 'default';

    const payment = new Payment({
      id,
      tenantId,
      saleId,
      method: params.method,
      amount: params.amount,
      status: PaymentStatus.SETTLED,
      reference,
      paidAt: now,
      createdAt: now,
      updatedAt: now,
      version: 1,
    });

    payment.recordEvent(
      new PaymentSettledEvent(
        id.value,
        1,
        {
          paymentId: id.value,
          saleId: saleId.value,
          tenantId,
          method: params.method,
          amount: params.amount.amount,
          cents: params.amount.cents,
          currency: params.amount.currency,
          reference: reference ? reference.value : null,
          paidAt: now,
        },
        now,
      ),
    );

    return payment;
  }

  /**
   * Factory method to create a pending payment attempt (e.g. dynamic QR code displayed awaiting customer scan).
   */
  public static createPending(
    params: CreatePendingPaymentParams,
    clock: Clock = new SystemClock(),
  ): Payment {
    const now = clock.now();
    const id =
      params.id instanceof PaymentId
        ? params.id
        : PaymentId.create(typeof params.id === 'string' ? params.id : undefined);

    const saleId = params.saleId instanceof SaleId ? params.saleId : SaleId.create(params.saleId);

    const reference =
      params.reference instanceof PaymentReference
        ? params.reference
        : PaymentReference.from(params.reference);

    const tenantId = params.tenantId ? params.tenantId.trim() : 'default';

    return new Payment({
      id,
      tenantId,
      saleId,
      method: params.method,
      amount: params.amount,
      status: PaymentStatus.PENDING,
      reference,
      paidAt: null,
      createdAt: now,
      updatedAt: now,
      version: 1,
    });
  }

  /**
   * Reconstitutes an existing Payment aggregate from persistence.
   */
  public static reconstitute(props: PaymentReconstituteProps): Payment {
    return new Payment(props);
  }

  // ---------------------------------------------------------------------------
  // Lifecycle Transitions (Domain-Driven Mutation Only)
  // ---------------------------------------------------------------------------

  /**
   * Transitions a PENDING payment to SETTLED when customer funds are confirmed.
   * Settled payments are permanently immutable.
   *
   * @param optionsOrClock Optional settlement options ({ reference?, paidAt?, clock? }) or a Clock instance.
   * @param fallbackClock Optional Clock instance if options object was provided without its own clock.
   */
  public settle(optionsOrClock?: SettlePaymentOptions | Clock, fallbackClock?: Clock): void {
    if (!canTransitionPaymentStatus(this._status, PaymentStatus.SETTLED)) {
      throw new InvalidPaymentTransitionException(
        this._status,
        PaymentStatus.SETTLED,
        this._status === PaymentStatus.SETTLED
          ? 'Settled payments are permanently immutable'
          : `Cannot settle a payment that is ${this._status}`,
      );
    }

    let clock: Clock;
    let explicitPaidAt: Date | undefined;
    let newReference: PaymentReference | null | undefined;

    if (optionsOrClock && 'now' in optionsOrClock && typeof optionsOrClock.now === 'function') {
      clock = optionsOrClock as Clock;
    } else if (optionsOrClock && typeof optionsOrClock === 'object') {
      const opts = optionsOrClock as SettlePaymentOptions;
      clock = opts.clock ?? fallbackClock ?? new SystemClock();
      if (opts.reference !== undefined) {
        newReference =
          opts.reference instanceof PaymentReference || opts.reference === null
            ? opts.reference
            : PaymentReference.from(opts.reference);
      }
      if (opts.paidAt !== undefined) {
        if (!(opts.paidAt instanceof Date) || isNaN(opts.paidAt.getTime())) {
          throw new PaymentDomainException(
            'Explicit paidAt timestamp must be a valid Date.',
            'INVALID_PAID_AT_TIMESTAMP',
          );
        }
        explicitPaidAt = opts.paidAt;
      }
    } else {
      clock = fallbackClock ?? new SystemClock();
    }

    const now = clock.now();
    const effectivePaidAt = explicitPaidAt ?? now;

    if (effectivePaidAt.getTime() < this._createdAt.getTime()) {
      throw new PaymentDomainException(
        'Payment paidAt cannot be earlier than createdAt.',
        'INVALID_TIMESTAMP_SEQUENCE',
      );
    }

    if (newReference !== undefined) {
      this._reference = newReference;
    }

    this._status = PaymentStatus.SETTLED;
    this._paidAt = new Date(effectivePaidAt.getTime());
    this._updatedAt = new Date(now.getTime());
    this._version += 1;

    this.recordEvent(
      new PaymentSettledEvent(
        this._id.value,
        this._version,
        {
          paymentId: this._id.value,
          saleId: this._saleId.value,
          tenantId: this._tenantId,
          method: this._method,
          amount: this._amount.amount,
          cents: this._amount.cents,
          currency: this._amount.currency,
          reference: this._reference ? this._reference.value : null,
          paidAt: this._paidAt,
        },
        now,
      ),
    );
  }

  /**
   * Domain method alias for settle(). Marks the payment as paid.
   */
  public markAsPaid(optionsOrClock?: SettlePaymentOptions | Clock, fallbackClock?: Clock): void {
    this.settle(optionsOrClock, fallbackClock);
  }

  /**
   * Domain command alias for settle(). Marks the payment as paid.
   */
  public pay(optionsOrClock?: SettlePaymentOptions | Clock, fallbackClock?: Clock): void {
    this.settle(optionsOrClock, fallbackClock);
  }

  /**
   * Transitions a PENDING payment to FAILED when the rail declines or times out.
   */
  public fail(reasonOrClock?: string | Clock, maybeClock?: Clock): void {
    let reason: string | undefined;
    let clock: Clock;

    if (reasonOrClock && typeof reasonOrClock === 'object' && 'now' in reasonOrClock) {
      clock = reasonOrClock as Clock;
      reason = undefined;
    } else {
      reason = typeof reasonOrClock === 'string' ? reasonOrClock : undefined;
      clock = maybeClock ?? new SystemClock();
    }

    if (!canTransitionPaymentStatus(this._status, PaymentStatus.FAILED)) {
      throw new InvalidPaymentTransitionException(
        this._status,
        PaymentStatus.FAILED,
        this._status === PaymentStatus.SETTLED
          ? 'Settled payments are permanently immutable'
          : `Cannot fail a payment that is ${this._status}`,
      );
    }

    const now = clock.now();
    this._status = PaymentStatus.FAILED;
    this._updatedAt = new Date(now.getTime());
    this._version += 1;

    this.recordEvent(
      new PaymentFailedEvent(
        this._id.value,
        this._version,
        {
          paymentId: this._id.value,
          saleId: this._saleId.value,
          tenantId: this._tenantId,
          method: this._method,
          amount: this._amount.amount,
          cents: this._amount.cents,
          currency: this._amount.currency,
          reason,
        },
        now,
      ),
    );
  }

  /**
   * Domain method alias for fail(). Marks the payment as failed.
   */
  public markAsFailed(reasonOrClock?: string | Clock, maybeClock?: Clock): void {
    this.fail(reasonOrClock, maybeClock);
  }

  /**
   * Transitions a PENDING payment to CANCELLED when aborted by the cashier or customer.
   */
  public cancel(reasonOrClock?: string | Clock, maybeClock?: Clock): void {
    let reason: string | undefined;
    let clock: Clock;

    if (reasonOrClock && typeof reasonOrClock === 'object' && 'now' in reasonOrClock) {
      clock = reasonOrClock as Clock;
      reason = undefined;
    } else {
      reason = typeof reasonOrClock === 'string' ? reasonOrClock : undefined;
      clock = maybeClock ?? new SystemClock();
    }

    if (!canTransitionPaymentStatus(this._status, PaymentStatus.CANCELLED)) {
      throw new InvalidPaymentTransitionException(
        this._status,
        PaymentStatus.CANCELLED,
        this._status === PaymentStatus.SETTLED
          ? 'Settled payments are permanently immutable'
          : `Cannot cancel a payment that is ${this._status}`,
      );
    }

    const now = clock.now();
    this._status = PaymentStatus.CANCELLED;
    this._updatedAt = new Date(now.getTime());
    this._version += 1;

    this.recordEvent(
      new PaymentCancelledEvent(
        this._id.value,
        this._version,
        {
          paymentId: this._id.value,
          saleId: this._saleId.value,
          tenantId: this._tenantId,
          method: this._method,
          amount: this._amount.amount,
          cents: this._amount.cents,
          currency: this._amount.currency,
          reason,
        },
        now,
      ),
    );
  }

  // ---------------------------------------------------------------------------
  // AggregateRoot Protocol & Entity Equality
  // ---------------------------------------------------------------------------

  public getUncommittedEvents(): ReadonlyArray<DomainEvent> {
    return [...this._uncommittedEvents];
  }

  public clearEvents(): void {
    this._uncommittedEvents.length = 0;
  }

  protected recordEvent(event: DomainEvent): void {
    this._uncommittedEvents.push(event);
  }

  public equals(other: Entity<PaymentId> | undefined | null): boolean {
    if (!other || !(other instanceof Payment)) {
      return false;
    }
    return this._id.equals(other.id);
  }

  // ---------------------------------------------------------------------------
  // Getters (Defensive Copies for Dates)
  // ---------------------------------------------------------------------------

  public get id(): PaymentId {
    return this._id;
  }

  public get tenantId(): string {
    return this._tenantId;
  }

  public get saleId(): SaleId {
    return this._saleId;
  }

  public get method(): PaymentMethod {
    return this._method;
  }

  public get amount(): Money {
    return this._amount;
  }

  public get status(): PaymentStatus {
    return this._status;
  }

  public get reference(): PaymentReference | null {
    return this._reference;
  }

  public get paidAt(): Date | null {
    return this._paidAt ? new Date(this._paidAt.getTime()) : null;
  }

  public get createdAt(): Date {
    return new Date(this._createdAt.getTime());
  }

  public get updatedAt(): Date {
    return new Date(this._updatedAt.getTime());
  }

  public get version(): number {
    return this._version;
  }

  public isSettled(): boolean {
    return this._status === PaymentStatus.SETTLED;
  }

  public isPending(): boolean {
    return this._status === PaymentStatus.PENDING;
  }

  public isFailed(): boolean {
    return this._status === PaymentStatus.FAILED;
  }

  public isCancelled(): boolean {
    return this._status === PaymentStatus.CANCELLED;
  }
}
