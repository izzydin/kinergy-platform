import { ValueObject } from '../shared/value-object';
import { Money } from './money.vo';
import { PaymentMethod, assertValidPaymentMethod } from '../enums/payment-method.enum';
import { PaymentStatus, assertValidPaymentStatus } from '../enums/payment-status.enum';
import { ReceiptDomainException } from '../exceptions/receipt-domain.exception';

export interface ReceiptPaymentSnapshotProps {
  paymentId: string;
  method: PaymentMethod;
  amount: Money;
  status: PaymentStatus;
  reference?: string | null;
  paidAt?: Date | null;
}

/**
 * Immutable Value Object capturing point-in-time settled payment tender details
 * within an issued Receipt.
 *
 * Enforces:
 * - Only fully settled payments (COMPLETED or SETTLED) can be referenced by a Receipt.
 * - Exact monetary amount using canonical Money VO.
 * - Permanent historical evidence of tender collection.
 */
export class ReceiptPaymentSnapshot implements ValueObject<ReceiptPaymentSnapshotProps> {
  private readonly _paymentId: string;
  private readonly _method: PaymentMethod;
  private readonly _amount: Money;
  private readonly _status: PaymentStatus;
  private readonly _reference: string | null;
  private readonly _paidAt: Date | null;

  private constructor(props: ReceiptPaymentSnapshotProps) {
    if (!props) {
      throw new ReceiptDomainException(
        'ReceiptPaymentSnapshotProps cannot be null or undefined.',
        'INVALID_RECEIPT_PAYMENTS',
      );
    }

    if (
      !props.paymentId ||
      typeof props.paymentId !== 'string' ||
      props.paymentId.trim().length === 0
    ) {
      throw new ReceiptDomainException(
        'Receipt payment paymentId must be a non-empty string.',
        'INVALID_RECEIPT_PAYMENTS',
      );
    }

    assertValidPaymentMethod(props.method);
    assertValidPaymentStatus(props.status);

    if (props.status !== PaymentStatus.COMPLETED) {
      throw new ReceiptDomainException(
        `Receipt payment status must be COMPLETED, got: '${props.status}'. Unsettled payments cannot evidence a Receipt.`,
        'INVALID_RECEIPT_PAYMENTS',
      );
    }

    if (!props.amount || !(props.amount instanceof Money)) {
      throw new ReceiptDomainException(
        'Receipt payment amount must be an instance of canonical Money VO.',
        'INVALID_RECEIPT_PAYMENTS',
      );
    }

    if (!props.amount.isPositive()) {
      throw new ReceiptDomainException(
        `Receipt payment amount must be strictly positive, got: ${props.amount.toString()}.`,
        'INVALID_RECEIPT_PAYMENTS',
      );
    }

    if (props.paidAt !== undefined && props.paidAt !== null) {
      if (!(props.paidAt instanceof Date) || isNaN(props.paidAt.getTime())) {
        throw new ReceiptDomainException(
          'Receipt payment paidAt must be a valid Date if provided.',
          'INVALID_RECEIPT_PAYMENTS',
        );
      }
    }

    this._paymentId = props.paymentId.trim();
    this._method = props.method;
    this._amount = props.amount;
    this._status = props.status;
    this._reference =
      props.reference && typeof props.reference === 'string' ? props.reference.trim() : null;
    this._paidAt = props.paidAt ? new Date(props.paidAt.getTime()) : null;

    Object.freeze(this);
  }

  public static create(props: ReceiptPaymentSnapshotProps): ReceiptPaymentSnapshot {
    return new ReceiptPaymentSnapshot(props);
  }

  public get paymentId(): string {
    return this._paymentId;
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

  public get reference(): string | null {
    return this._reference;
  }

  public get paidAt(): Date | null {
    return this._paidAt ? new Date(this._paidAt.getTime()) : null;
  }

  public getValue(): ReceiptPaymentSnapshotProps {
    return {
      paymentId: this._paymentId,
      method: this._method,
      amount: this._amount,
      status: this._status,
      reference: this._reference,
      paidAt: this.paidAt,
    };
  }

  public equals(other: ValueObject<ReceiptPaymentSnapshotProps> | undefined | null): boolean {
    if (!other || !(other instanceof ReceiptPaymentSnapshot)) {
      return false;
    }
    return (
      this._paymentId === other.paymentId &&
      this._method === other.method &&
      this._amount.equals(other.amount) &&
      this._status === other.status &&
      this._reference === other.reference &&
      ((this._paidAt === null && other.paidAt === null) ||
        (this._paidAt !== null &&
          other.paidAt !== null &&
          this._paidAt.getTime() === other.paidAt.getTime()))
    );
  }
}
