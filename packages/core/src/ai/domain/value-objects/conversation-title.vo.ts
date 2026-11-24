import { InvalidConversationTurnException } from '../exceptions/conversation.exceptions';

/**
 * Value Object representing the human-readable title of an AI Conversation.
 *
 * Invariants:
 * - Length between 1 and 255 characters.
 * - Default: "New Conversation".
 */
export class ConversationTitle {
  public static readonly DEFAULT_TITLE = 'New Conversation';
  public static readonly MAX_LENGTH = 255;

  private readonly _value: string;

  private constructor(value: string) {
    if (value === undefined || value === null || typeof value !== 'string') {
      throw new InvalidConversationTurnException('Conversation title must be a string.');
    }
    const trimmed = value.trim();
    if (trimmed.length === 0) {
      throw new InvalidConversationTurnException('Conversation title cannot be empty.');
    }
    if (trimmed.length > ConversationTitle.MAX_LENGTH) {
      throw new InvalidConversationTurnException(
        `Conversation title exceeds maximum length of ${ConversationTitle.MAX_LENGTH} characters.`,
      );
    }
    this._value = trimmed;
    Object.freeze(this);
  }

  public static create(value?: string): ConversationTitle {
    if (value === undefined || value === null || value.trim().length === 0) {
      return new ConversationTitle(ConversationTitle.DEFAULT_TITLE);
    }
    return new ConversationTitle(value);
  }

  /**
   * Derives a conversation title from a prompt message (e.g. user question).
   * Strips extra whitespace, takes up to `maxLength` (default 40) characters, and truncates cleanly.
   */
  public static deriveFromPrompt(prompt: string, maxLength = 40): ConversationTitle {
    if (!prompt || typeof prompt !== 'string') {
      return ConversationTitle.create();
    }

    // Clean whitespace and collapse newlines
    const cleaned = prompt.replace(/\r?\n/g, ' ').replace(/\s+/g, ' ').trim();
    if (cleaned.length === 0) {
      return ConversationTitle.create();
    }

    const effectiveMax = Math.min(maxLength, ConversationTitle.MAX_LENGTH);
    if (cleaned.length <= effectiveMax) {
      return new ConversationTitle(cleaned);
    }

    const truncated = cleaned.slice(0, effectiveMax - 3).trimEnd() + '...';
    return new ConversationTitle(truncated);
  }

  public get value(): string {
    return this._value;
  }

  public equals(other?: ConversationTitle | null): boolean {
    if (!other || !(other instanceof ConversationTitle)) {
      return false;
    }
    return this._value === other.value;
  }

  public toString(): string {
    return this._value;
  }
}
