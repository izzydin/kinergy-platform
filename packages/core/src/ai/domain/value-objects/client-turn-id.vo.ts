import { InvalidConversationTurnException } from '../exceptions/conversation.exceptions';

/**
 * Value Object representing a client-supplied turn identifier for idempotency and correlation.
 *
 * Invariants:
 * - Non-empty string.
 * - Maximum character length: 64 characters (matching database schema constraint).
 */
export class ClientTurnId {
  public static readonly MAX_LENGTH = 64;

  private readonly _value: string;

  private constructor(value: string) {
    if (!value || typeof value !== 'string') {
      throw new InvalidConversationTurnException('Client turn ID must be a non-empty string.');
    }
    const trimmed = value.trim();
    if (trimmed.length === 0) {
      throw new InvalidConversationTurnException(
        'Client turn ID cannot be empty or purely whitespace.',
      );
    }
    if (trimmed.length > ClientTurnId.MAX_LENGTH) {
      throw new InvalidConversationTurnException(
        `Client turn ID length (${trimmed.length}) exceeds maximum allowable limit of ${ClientTurnId.MAX_LENGTH} characters.`,
      );
    }
    this._value = trimmed;
    Object.freeze(this);
  }

  public static create(value: string): ClientTurnId {
    return new ClientTurnId(value);
  }

  public get value(): string {
    return this._value;
  }

  public equals(other?: ClientTurnId | null): boolean {
    if (!other || !(other instanceof ClientTurnId)) {
      return false;
    }
    return this._value === other.value;
  }

  public toString(): string {
    return this._value;
  }
}
