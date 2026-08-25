import { ValueObject } from '../../shared/value-object';
import { InvalidMoneyException } from '../exceptions/invalid-money.exception';
import { Quantity } from './quantity.vo';

export interface MoneyProps {
  amount: number;
  currency: string;
}

/**
 * Value Object representing commercial and inventory valuation amounts.
 * Stores non-negative amounts with explicit ISO-4217 currency.
 */
export class Money implements ValueObject<MoneyProps> {
  private readonly _amount: number;
  private readonly _currency: string;

  private constructor(amount: number, currency: string) {
    if (typeof amount !== 'number' || isNaN(amount) || !isFinite(amount) || amount < 0) {
      throw new InvalidMoneyException(
        `Monetary amount must be a finite non-negative number, got: ${amount}.`,
      );
    }
    if (!currency || typeof currency !== 'string') {
      throw new InvalidMoneyException('Currency cannot be empty.');
    }
    const normalizedCurrency = currency.trim().toUpperCase();
    if (!/^[A-Z]{3}$/.test(normalizedCurrency)) {
      throw new InvalidMoneyException(
        `Currency '${currency}' is invalid. Must be a 3-letter ISO-4217 code (e.g. USD, CAD, EUR).`,
      );
    }

    this._amount = Math.round(amount * 100) / 100;
    this._currency = normalizedCurrency;
    Object.freeze(this);
  }

  public static create(amount: number, currency = 'USD'): Money {
    return new Money(amount, currency);
  }

  public static zero(currency = 'USD'): Money {
    return new Money(0, currency);
  }

  public get amount(): number {
    return this._amount;
  }

  public get currency(): string {
    return this._currency;
  }

  public isZero(): boolean {
    return this._amount === 0;
  }

  public add(other: Money): Money {
    if (this._currency !== other.currency) {
      throw new InvalidMoneyException(
        `Cannot add money with different currencies: ${this._currency} and ${other.currency}.`,
      );
    }
    return new Money(Math.round((this._amount + other.amount) * 100) / 100, this._currency);
  }

  public multiply(quantity: Quantity | number): Money {
    const factor = typeof quantity === 'number' ? quantity : quantity.value;
    if (factor < 0) {
      throw new InvalidMoneyException('Cannot multiply money by negative quantity.');
    }
    return new Money(Math.round(this._amount * factor * 100) / 100, this._currency);
  }

  public getValue(): MoneyProps {
    return {
      amount: this._amount,
      currency: this._currency,
    };
  }

  public equals(other: ValueObject<MoneyProps>): boolean {
    if (!other || !(other instanceof Money)) {
      return false;
    }
    return this._amount === other.amount && this._currency === other.currency;
  }

  public toString(): string {
    return `${this._amount.toFixed(2)} ${this._currency}`;
  }
}
