import { InvalidConversationTurnException } from '../exceptions/conversation.exceptions';

/**
 * Value Object representing an immutable Conversation Aggregate identifier.
 */
export class ConversationId {
  private readonly _value: string;

  private constructor(value: string) {
    if (!value || typeof value !== 'string' || value.trim().length === 0) {
      throw new InvalidConversationTurnException('Conversation ID cannot be empty.');
    }
    this._value = value.trim();
    Object.freeze(this);
  }

  public static create(id?: string): ConversationId {
    if (id !== undefined) {
      return new ConversationId(id);
    }
    if (typeof globalThis !== 'undefined' && globalThis.crypto?.randomUUID) {
      return new ConversationId(globalThis.crypto.randomUUID());
    }
    const rand = Math.random().toString(36).substring(2, 10);
    const time = Date.now().toString(36);
    return new ConversationId(`conv_${time}_${rand}`);
  }

  public get value(): string {
    return this._value;
  }

  public equals(other?: ConversationId | null): boolean {
    if (!other || !(other instanceof ConversationId)) {
      return false;
    }
    return this._value === other.value;
  }

  public toString(): string {
    return this._value;
  }
}
