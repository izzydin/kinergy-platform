import { Money } from '../../domain/value-objects/money.vo';
import { MoneyDTO } from '../dtos/money.dto';

/**
 * Deterministic mapper between domain Money VO and application MoneyDTO.
 *
 * CRITICAL ARCHITECTURAL CONSTRAINTS:
 * - Never invoke `Number(money)` or `parseFloat(money)`.
 * - Does not use `JSON.stringify(prismaDecimal)`.
 * - Operates purely on explicit integer minor units (cents) and normalized currency.
 * - Formats exact 2-decimal string representation deterministically.
 */
export class MoneyMapper {
  /**
   * Maps a domain Money Value Object to an immutable, precision-preserving MoneyDTO.
   */
  public static toDTO(money: Money): MoneyDTO {
    const cents = money.cents;
    const isNegative = cents < 0;
    const absCents = Math.abs(cents);
    const whole = Math.floor(absCents / 100);
    const frac = String(absCents % 100).padStart(2, '0');
    const formatted = `${isNegative ? '-' : ''}${whole}.${frac}`;

    return {
      amount: money.amount,
      currency: money.currency,
      formatted,
      cents: money.cents,
    };
  }

  /**
   * Reconstitutes a domain Money VO from an incoming DTO or structured money payload.
   */
  public static toDomain(dto: {
    amount?: number | string;
    formatted?: string;
    cents?: number;
    currency?: string;
  }): Money {
    const currency = dto.currency ?? Money.DEFAULT_CURRENCY;

    // Prefer exact integer cents if supplied by client to eliminate floating-point precision loss
    if (dto.cents !== undefined && typeof dto.cents === 'number' && Number.isInteger(dto.cents)) {
      return Money.fromCents(dto.cents, currency);
    }

    if (dto.formatted !== undefined && typeof dto.formatted === 'string') {
      return Money.create(dto.formatted, currency);
    }

    if (dto.amount !== undefined) {
      return Money.create(dto.amount, currency);
    }

    return Money.zero(currency);
  }
}
