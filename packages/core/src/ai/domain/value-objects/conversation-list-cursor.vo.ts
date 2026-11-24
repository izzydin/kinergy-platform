import { InvalidCursorException } from '../exceptions/conversation.exceptions';

interface ConversationCursorPayload {
  a: string; // ISO date string for lastActivityAt
  id: string; // Conversation ID as stable tie-breaker
}

interface NodeBufferLike {
  from(str: string, encoding?: string): { toString(encoding: string): string };
}

function getNodeBuffer(): NodeBufferLike | undefined {
  const g = globalThis as unknown as { Buffer?: NodeBufferLike };
  return g.Buffer;
}

function toBase64Url(str: string): string {
  const buf = getNodeBuffer();
  if (buf) {
    return buf.from(str, 'utf-8').toString('base64url');
  }
  return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(str: string): string {
  const buf = getNodeBuffer();
  if (buf) {
    return buf.from(str, 'base64url').toString('utf-8');
  }
  let base64 = str.replace(/-/g, '+').replace(/_/g, '/');
  while (base64.length % 4) {
    base64 += '=';
  }
  return atob(base64);
}

/**
 * Value Object representing a deterministic cursor for paginating conversations.
 *
 * Encodes `(lastActivityAt, id)` to a URL-safe Base64 string.
 *
 * **Consistency & Ordering Notice:**
 * Ordering is deterministic: `(lastActivityAt DESC, id DESC)`.
 * Because `lastActivityAt` is mutable on active conversations, activity-based pagination
 * does NOT guarantee snapshot consistency. If a conversation receives a new turn/message
 * while a client traverses pages, its position will change and it may appear again on a later page.
 */
export class ConversationListCursor {
  private readonly _lastActivityAt: Date;
  private readonly _conversationId: string;

  private constructor(lastActivityAt: Date, conversationId: string) {
    if (!(lastActivityAt instanceof Date) || isNaN(lastActivityAt.getTime())) {
      throw new InvalidCursorException(
        `Invalid lastActivityAt timestamp provided for conversation cursor.`,
      );
    }
    if (
      !conversationId ||
      typeof conversationId !== 'string' ||
      conversationId.trim().length === 0
    ) {
      throw new InvalidCursorException('Conversation ID must be a non-empty string in cursor.');
    }

    this._lastActivityAt = new Date(lastActivityAt.getTime());
    this._conversationId = conversationId.trim();
    Object.freeze(this);
  }

  public static create(lastActivityAt: Date, conversationId: string): ConversationListCursor {
    return new ConversationListCursor(lastActivityAt, conversationId);
  }

  public get lastActivityAt(): Date {
    return new Date(this._lastActivityAt.getTime());
  }

  public get conversationId(): string {
    return this._conversationId;
  }

  /**
   * Encodes the cursor to a URL-safe Base64 string.
   */
  public encode(): string {
    const payload: ConversationCursorPayload = {
      a: this._lastActivityAt.toISOString(),
      id: this._conversationId,
    };
    return toBase64Url(JSON.stringify(payload));
  }

  /**
   * Decodes and validates a URL-safe Base64 cursor string.
   * Throws InvalidCursorException if the cursor is malformed or invalid.
   */
  public static decode(cursorString: string): ConversationListCursor {
    if (!cursorString || typeof cursorString !== 'string' || cursorString.trim().length === 0) {
      throw new InvalidCursorException('Cursor string cannot be empty.');
    }

    try {
      const decodedJson = fromBase64Url(cursorString.trim());
      const parsed = JSON.parse(decodedJson) as unknown;

      if (!parsed || typeof parsed !== 'object') {
        throw new InvalidCursorException('Malformed cursor payload: expected JSON object.');
      }

      const { a, id } = parsed as Record<string, unknown>;

      if (typeof a !== 'string' || a.trim().length === 0) {
        throw new InvalidCursorException(
          `Cursor payload 'a' (lastActivityAt) must be an ISO date string.`,
        );
      }

      const date = new Date(a);
      if (isNaN(date.getTime())) {
        throw new InvalidCursorException(`Cursor payload 'a' is not a valid ISO date timestamp.`);
      }

      if (typeof id !== 'string' || id.trim().length === 0) {
        throw new InvalidCursorException(`Cursor payload 'id' must be a non-empty string.`);
      }

      return new ConversationListCursor(date, id);
    } catch (err) {
      if (err instanceof InvalidCursorException) {
        throw err;
      }
      throw new InvalidCursorException(
        `Failed to decode conversation cursor: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  public equals(other: ConversationListCursor | null | undefined): boolean {
    if (!other || !(other instanceof ConversationListCursor)) {
      return false;
    }
    return (
      this._lastActivityAt.getTime() === other.lastActivityAt.getTime() &&
      this._conversationId === other.conversationId
    );
  }
}
