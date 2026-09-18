import { ValueObject } from '../shared/value-object';
import { InvalidMoneyException } from '../exceptions/invalid-money.exception';

export interface MoneyProps {
  amount: number;
  currency: string;
}

export interface MoneyCreateOptions {
  currency?: string;
  allowNegative?: boolean;
}

/**
 * Canonical Money Value Object for the Sales Bounded Context.
 * Defined by Milestone 7.4 Monetary Policy (ADR-0114).
 *
 * Encapsulates deterministic monetary arithmetic using integer minor units (cents).
 * Guarantees zero binary floating-point drift and strict ISO-4217 currency homogeneity.
 *
 * Immutability: Pure immutable value object (Object.freeze).
 * Precision: Fixed 2 decimal places (integer cents).
 */
export class Money implements ValueObject<MoneyProps> {
  public static readonly DEFAULT_CURRENCY = 'USD';
  private static readonly CURRENCY_REGEX = /^[A-Z]{3}$/;
  private static readonly DECIMAL_STRING_REGEX = /^-?\d+(\.\d+)?$/;

  private readonly _cents: number;
  private readonly _currency: string;

  private constructor(cents: number, currency: string, allowNegative = false) {
    if (!Number.isInteger(cents)) {
      throw new InvalidMoneyException(
        `Internal monetary minor units must be an integer, got: ${cents}.`,
      );
    }
    if (!allowNegative && cents < 0) {
      throw new InvalidMoneyException(`Monetary amount cannot be negative, got cents: ${cents}.`);
    }

    const normalizedCurrency = Money.validateCurrency(currency);

    this._cents = cents;
    this._currency = normalizedCurrency;
    Object.freeze(this);
  }

  private static validateCurrency(currency: unknown): string {
    if (!currency || typeof currency !== 'string') {
      throw new InvalidMoneyException('Currency cannot be empty and must be a string.');
    }
    const trimmed = currency.trim().toUpperCase();
    if (!Money.CURRENCY_REGEX.test(trimmed)) {
      throw new InvalidMoneyException(
        `Currency '${currency}' is invalid. Must be a 3-letter ISO-4217 code (e.g. USD, CAD, EUR).`,
      );
    }
    return trimmed;
  }

  /**
   * Creates a Money instance from a decimal number or formatted string.
   *
   * Validates:
   * - malformed values (NaN, Infinity, non-numeric strings)
   * - negative values (prohibited by default)
   * - unsupported precision (> 2 decimal places)
   * - invalid decimal representations (e.g. '12.34.56', '$10', 'abc')
   */
  public static create(
    amount: number | string,
    currencyOrOptions: string | MoneyCreateOptions = Money.DEFAULT_CURRENCY,
    maybeOptions?: MoneyCreateOptions,
  ): Money {
    let currency = Money.DEFAULT_CURRENCY;
    let allowNegative = false;

    if (currencyOrOptions !== undefined) {
      if (typeof currencyOrOptions === 'string') {
        currency = currencyOrOptions;
        allowNegative = maybeOptions?.allowNegative ?? false;
      } else if (typeof currencyOrOptions === 'object' && currencyOrOptions !== null) {
        currency = currencyOrOptions.currency ?? Money.DEFAULT_CURRENCY;
        allowNegative = currencyOrOptions.allowNegative ?? false;
      } else {
        throw new InvalidMoneyException('Currency must be a string.');
      }
    }

    if (amount === null || amount === undefined) {
      throw new InvalidMoneyException('Monetary amount cannot be null or undefined.');
    }

    let parsedCents: number;

    if (typeof amount === 'string') {
      const trimmed = amount.trim();
      if (trimmed.length === 0 || !Money.DECIMAL_STRING_REGEX.test(trimmed)) {
        throw new InvalidMoneyException(`Invalid monetary syntax: '${amount}'.`);
      }

      const isNegative = trimmed.startsWith('-');
      if (isNegative && !allowNegative) {
        throw new InvalidMoneyException(`Monetary amount cannot be negative, got: '${amount}'.`);
      }

      const cleanStr = isNegative ? trimmed.slice(1) : trimmed;
      const parts = cleanStr.split('.');
      const wholePart = parts[0] ?? '0';
      const decimalPart = parts[1] ?? '';

      if (decimalPart.length > 2) {
        throw new InvalidMoneyException(
          `Unsupported monetary precision: maximum 2 decimal places allowed, got '${amount}'.`,
        );
      }

      const wholeInt = parseInt(wholePart, 10);
      const fracInt = parseInt(decimalPart.padEnd(2, '0'), 10);
      const absCents = wholeInt * 100 + fracInt;
      parsedCents = isNegative ? -absCents : absCents;
    } else if (typeof amount === 'number') {
      if (isNaN(amount)) {
        throw new InvalidMoneyException('Monetary amount cannot be NaN.');
      }
      if (!isFinite(amount)) {
        throw new InvalidMoneyException('Monetary amount must be a finite number.');
      }
      if (amount < 0 && !allowNegative) {
        throw new InvalidMoneyException(`Monetary amount cannot be negative, got: ${amount}.`);
      }

      // Detect unsupported sub-cent precision (> 2 decimal places)
      const scaled = amount * 100;
      const nearestInt = Math.round(scaled);
      if (Math.abs(scaled - nearestInt) > 1e-7) {
        throw new InvalidMoneyException(
          `Unsupported monetary precision: maximum 2 decimal places allowed, got: ${amount}.`,
        );
      }

      const sign = amount < 0 ? -1 : 1;
      parsedCents = sign * Math.round(Math.abs(amount) * 100 + Number.EPSILON);
    } else {
      throw new InvalidMoneyException(
        `Monetary amount must be a number or string, got: ${typeof amount}.`,
      );
    }

    return new Money(parsedCents, currency, allowNegative);
  }

  /**
   * Creates a Money instance directly from integer minor units (cents).
   */
  public static fromCents(
    cents: number,
    currencyOrOptions: string | MoneyCreateOptions = Money.DEFAULT_CURRENCY,
    maybeOptions?: MoneyCreateOptions,
  ): Money {
    let currency = Money.DEFAULT_CURRENCY;
    let allowNegative = false;

    if (currencyOrOptions !== undefined) {
      if (typeof currencyOrOptions === 'string') {
        currency = currencyOrOptions;
        allowNegative = maybeOptions?.allowNegative ?? false;
      } else if (typeof currencyOrOptions === 'object' && currencyOrOptions !== null) {
        currency = currencyOrOptions.currency ?? Money.DEFAULT_CURRENCY;
        allowNegative = currencyOrOptions.allowNegative ?? false;
      } else {
        throw new InvalidMoneyException('Currency must be a string.');
      }
    }

    if (cents === null || cents === undefined || typeof cents !== 'number') {
      throw new InvalidMoneyException('Cents must be a valid number.');
    }
    if (isNaN(cents) || !isFinite(cents)) {
      throw new InvalidMoneyException('Cents must be a finite number.');
    }
    if (!Number.isInteger(cents)) {
      throw new InvalidMoneyException(
        `Unsupported precision: cents must be an exact integer, got: ${cents}.`,
      );
    }
    if (cents < 0 && !allowNegative) {
      throw new InvalidMoneyException(`Monetary amount cannot be negative, got cents: ${cents}.`);
    }

    return new Money(cents, currency, allowNegative);
  }

  /**
   * Returns a zero-value Money instance for the specified currency.
   */
  public static zero(currency = Money.DEFAULT_CURRENCY): Money {
    return new Money(0, currency, false);
  }

  /**
   * Major unit monetary value (e.g. 19.99 for 1999 cents).
   */
  public get amount(): number {
    return this._cents / 100;
  }

  /**
   * Integer minor unit value (e.g. 1999 for $19.99).
   */
  public get cents(): number {
    return this._cents;
  }

  /**
   * 3-letter ISO-4217 uppercase currency code.
   */
  public get currency(): string {
    return this._currency;
  }

  /**
   * Checks if this instance represents zero amount.
   */
  public isZero(): boolean {
    return this._cents === 0;
  }

  /**
   * Checks if this instance represents a strictly positive amount (> 0).
   */
  public isPositive(): boolean {
    return this._cents > 0;
  }

  /**
   * Checks if this instance represents a strictly negative amount (< 0).
   */
  public isNegative(): boolean {
    return this._cents < 0;
  }

  /**
   * Adds another Money instance.
   * Arithmetic executes entirely in integer cents.
   */
  public add(other: Money): Money {
    this.assertCompatibleCurrency(other, 'add');
    const resultCents = this._cents + other.cents;
    const allowsNegative = this._cents < 0 || other.cents < 0 || resultCents < 0;
    return new Money(resultCents, this._currency, allowsNegative);
  }

  /**
   * Subtracts another Money instance.
   * Arithmetic executes entirely in integer cents.
   */
  public subtract(other: Money, options?: MoneyCreateOptions): Money {
    this.assertCompatibleCurrency(other, 'subtract');
    const allowNegative = options?.allowNegative ?? false;
    const resultCents = this._cents - other.cents;

    if (resultCents < 0 && !allowNegative) {
      throw new InvalidMoneyException(
        `Resulting monetary amount cannot be negative (${this.toString()} - ${other.toString()}).`,
      );
    }

    return new Money(resultCents, this._currency, allowNegative || resultCents < 0);
  }

  /**
   * Multiplies monetary amount by a scalar quantity or factor.
   * Uses Commercial Half-Up rounding at the cent boundary with epsilon guard.
   */
  public multiply(factor: number | { readonly value: number }): Money {
    const factorNum = typeof factor === 'number' ? factor : factor?.value;
    if (typeof factorNum !== 'number' || isNaN(factorNum) || !isFinite(factorNum)) {
      throw new InvalidMoneyException(
        `Multiplication factor must be a finite number, got: ${String(factorNum)}.`,
      );
    }
    if (factorNum < 0) {
      throw new InvalidMoneyException(`Cannot multiply money by negative factor: ${factorNum}.`);
    }

    const sign = this._cents < 0 ? -1 : 1;
    // Guard against IEEE-754 binary floating-point representation artifacts on midpoints (e.g. 100 * 1.005 = 100.49999999999999)
    const rawProduct = Math.abs(this._cents * factorNum);
    const productCents = sign * Math.round(rawProduct + 1e-8);
    const allowsNegative = this._cents < 0;

    return new Money(productCents, this._currency, allowsNegative);
  }

  /**
   * Compares this Money instance with another.
   * Returns:
   *   -1 if this < other
   *    0 if this == other
   *    1 if this > other
   */
  public compare(other: Money): number {
    if (!other || !(other instanceof Money)) {
      throw new InvalidMoneyException('Cannot compare Money with non-Money instance.');
    }
    this.assertCompatibleCurrency(other, 'compare');

    if (this._cents < other.cents) {
      return -1;
    }
    if (this._cents > other.cents) {
      return 1;
    }
    return 0;
  }

  public greaterThan(other: Money): boolean {
    return this.compare(other) > 0;
  }

  public greaterThanOrEqual(other: Money): boolean {
    return this.compare(other) >= 0;
  }

  public lessThan(other: Money): boolean {
    return this.compare(other) < 0;
  }

  public lessThanOrEqual(other: Money): boolean {
    return this.compare(other) <= 0;
  }

  /**
   * Explicit value equality comparison (comparing monetary value and currency, not reference).
   */
  public equals(other: unknown): boolean {
    if (!other || !(other instanceof Money)) {
      return false;
    }
    return this._cents === other.cents && this._currency === other.currency;
  }

  /**
   * ValueObject protocol contract.
   */
  public getValue(): MoneyProps {
    return {
      amount: this.amount,
      currency: this._currency,
    };
  }

  public toJSON(): MoneyProps {
    return this.getValue();
  }

  /**
   * Formats the monetary amount deterministically without toFixed artifacts.
   */
  public toString(): string {
    const sign = this._cents < 0 ? '-' : '';
    const absCents = Math.abs(this._cents);
    const whole = Math.floor(absCents / 100);
    const frac = String(absCents % 100).padStart(2, '0');
    return `${sign}${whole}.${frac} ${this._currency}`;
  }

  private assertCompatibleCurrency(other: Money, operation: string): void {
    if (!other || !(other instanceof Money)) {
      throw new InvalidMoneyException(`Cannot ${operation} Money with non-Money instance.`);
    }
    if (this._currency !== other.currency) {
      throw new InvalidMoneyException(
        `Cannot ${operation} money with different currencies: ${this._currency} and ${other.currency}.`,
      );
    }
  }
}
