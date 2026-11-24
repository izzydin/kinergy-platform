import { InvalidCursorException } from '../exceptions/conversation.exceptions';

interface CursorPayload {
  s: number;
  id: string;
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
 * Value Object representing an immutable keyset cursor for paginating
 * AI conversation message histories.
 *
 * Encodes sequenceNumber (s) and messageId (id) to a URL-safe Base64 string.
 */
export class MessageHistoryCursor {
  private readonly _sequenceNumber: number;
  private readonly _messageId: string;

  private constructor(sequenceNumber: number, messageId: string) {
    if (
      typeof sequenceNumber !== 'number' ||
      !Number.isInteger(sequenceNumber) ||
      sequenceNumber < 1
    ) {
      throw new InvalidCursorException(
        `Sequence number must be a positive integer, received: ${sequenceNumber}`,
      );
    }
    if (!messageId || typeof messageId !== 'string' || messageId.trim().length === 0) {
      throw new InvalidCursorException('Message ID must be a non-empty string.');
    }

    this._sequenceNumber = sequenceNumber;
    this._messageId = messageId.trim();
    Object.freeze(this);
  }

  public static create(sequenceNumber: number, messageId: string): MessageHistoryCursor {
    return new MessageHistoryCursor(sequenceNumber, messageId);
  }

  /**
   * Encodes the cursor to a Base64URL string.
   */
  public encode(): string {
    const payload: CursorPayload = {
      s: this._sequenceNumber,
      id: this._messageId,
    };
    return toBase64Url(JSON.stringify(payload));
  }

  /**
   * Decodes and validates a Base64URL cursor string.
   * Throws InvalidCursorException if the cursor is malformed or invalid.
   */
  public static decode(cursorString: string): MessageHistoryCursor {
    if (!cursorString || typeof cursorString !== 'string' || cursorString.trim().length === 0) {
      throw new InvalidCursorException('Cursor string cannot be empty.');
    }

    try {
      const decodedJson = fromBase64Url(cursorString.trim());
      const parsed = JSON.parse(decodedJson) as unknown;

      if (!parsed || typeof parsed !== 'object') {
        throw new InvalidCursorException('Malformed cursor payload.');
      }

      const { s, id } = parsed as Record<string, unknown>;

      if (typeof s !== 'number' || !Number.isInteger(s) || s < 1) {
        throw new InvalidCursorException(
          `Cursor payload sequence number 's' must be an integer >= 1.`,
        );
      }

      if (typeof id !== 'string' || id.trim().length === 0) {
        throw new InvalidCursorException(
          `Cursor payload message ID 'id' must be a non-empty string.`,
        );
      }

      return new MessageHistoryCursor(s, id);
    } catch (err) {
      if (err instanceof InvalidCursorException) {
        throw err;
      }
      throw new InvalidCursorException(
        `Failed to decode cursor: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  public get sequenceNumber(): number {
    return this._sequenceNumber;
  }

  public get messageId(): string {
    return this._messageId;
  }

  public equals(other?: MessageHistoryCursor | null): boolean {
    if (!other || !(other instanceof MessageHistoryCursor)) {
      return false;
    }
    return this._sequenceNumber === other.sequenceNumber && this._messageId === other.messageId;
  }

  public toString(): string {
    return this.encode();
  }
}
