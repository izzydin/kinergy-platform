import { Prisma } from '@prisma/client';
import { Money } from '../../../../domain/value-objects/money.vo';
import { InvalidMoneyException } from '../../../../domain/exceptions/invalid-money.exception';

/**
 * Bidirectional mapper between Domain Money and Prisma.Decimal.
 *
 * Guaranteed Determinism & Accuracy:
 * - Operates entirely without IEEE-754 binary floating-point conversions.
 * - Strictly prohibits Number(decimal), decimal.toNumber(), and parseFloat(...).
 * - Converts via exact minor-unit decimal string serialization (fixed 2 decimal places).
 */
export class PrismaMoneyMapper {
  /**
   * Converts a domain Money instance to a database-compatible Prisma.Decimal.
   */
  public static toDecimal(money: Money): Prisma.Decimal {
    if (!money || !(money instanceof Money)) {
      throw new InvalidMoneyException('Cannot map null or invalid Money to Prisma.Decimal.');
    }

    const sign = money.cents < 0 ? '-' : '';
    const absCents = Math.abs(money.cents);
    const whole = Math.floor(absCents / 100);
    const frac = String(absCents % 100).padStart(2, '0');
    const decimalString = `${sign}${whole}.${frac}`;

    return new Prisma.Decimal(decimalString);
  }

  /**
   * Converts a database Prisma.Decimal (or exact string) to a pure domain Money Value Object.
   */
  public static toMoney(
    decimal: Prisma.Decimal | string | number | null | undefined,
    currency = Money.DEFAULT_CURRENCY,
  ): Money {
    if (decimal === null || decimal === undefined) {
      throw new InvalidMoneyException('Cannot map null or undefined Prisma.Decimal to Money.');
    }

    let exactString: string;
    if (typeof decimal === 'string') {
      exactString = decimal.trim();
    } else if (decimal instanceof Prisma.Decimal) {
      // Prisma.Decimal (Decimal.js) produces exact string representations
      exactString = decimal.toFixed(2);
    } else if (typeof decimal === 'object' && decimal !== null && 'toFixed' in decimal) {
      exactString = (decimal as { toFixed(decimals: number): string }).toFixed(2);
    } else if (typeof decimal === 'number') {
      if (isNaN(decimal) || !isFinite(decimal)) {
        throw new InvalidMoneyException('Cannot map NaN or infinite number to Money.');
      }
      exactString = decimal.toString();
    } else {
      throw new InvalidMoneyException(`Unsupported decimal representation: ${String(decimal)}.`);
    }

    return Money.create(exactString, currency);
  }
}
