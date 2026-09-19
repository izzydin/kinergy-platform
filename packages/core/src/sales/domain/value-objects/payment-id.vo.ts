import { ValueObject } from '../shared/value-object';
import { PaymentDomainException } from '../exceptions/payment-domain.exception';

/**
 * Value Object representing a unique identifier for a Payment aggregate root.
 */
export class PaymentId implements ValueObject<string> {
  private readonly _value: string;

  private constructor(id: string) {
    if (!id || typeof id !== 'string' || id.trim().length === 0) {
      throw new PaymentDomainException('Payment ID cannot be empty.', 'INVALID_PAYMENT_ID');
    }
    this._value = id.trim();
    Object.freeze(this);
  }

  public static create(id?: string): PaymentId {
    if (id !== undefined) {
      return new PaymentId(id);
    }
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 9);
    return new PaymentId(`pay_${timestamp}_${random}`);
  }

  public getValue(): string {
    return this._value;
  }

  public get value(): string {
    return this._value;
  }

  public equals(other: ValueObject<string> | undefined | null): boolean {
    if (!other || !(other instanceof PaymentId)) {
      return false;
    }
    return this._value === other.getValue();
  }

  public toString(): string {
    return this._value;
  }
}
