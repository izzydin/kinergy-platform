import { InvalidConversationTurnException } from '../exceptions/conversation.exceptions';

/**
 * Value Object representing an immutable Conversation Turn identifier.
 */
export class TurnId {
  private readonly _value: string;

  private constructor(value: string) {
    if (!value || typeof value !== 'string' || value.trim().length === 0) {
      throw new InvalidConversationTurnException('Turn ID cannot be empty.');
    }
    this._value = value.trim();
    Object.freeze(this);
  }

  public static create(id?: string): TurnId {
    if (id !== undefined) {
      return new TurnId(id);
    }
    if (typeof globalThis !== 'undefined' && globalThis.crypto?.randomUUID) {
      return new TurnId(globalThis.crypto.randomUUID());
    }
    const rand = Math.random().toString(36).substring(2, 10);
    const time = Date.now().toString(36);
    return new TurnId(`turn_${time}_${rand}`);
  }

  public get value(): string {
    return this._value;
  }

  public equals(other?: TurnId | null): boolean {
    if (!other || !(other instanceof TurnId)) {
      return false;
    }
    return this._value === other.value;
  }

  public toString(): string {
    return this._value;
  }
}
