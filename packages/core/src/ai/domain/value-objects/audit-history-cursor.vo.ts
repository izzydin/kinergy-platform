import { InvalidCursorException } from '../exceptions/conversation.exceptions';

interface AuditCursorPayload {
  t: string; // ISO date string for createdAt
  id: string; // Audit log ID as stable tie-breaker
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
 * Value Object representing a deterministic keyset cursor for paginating audit logs.
 *
 * Encodes `(createdAt, id)` to a URL-safe Base64 string.
 *
 * **Audit Lifecycle Notice:**
 * Audit records are immutable. Ordering is deterministic: `(createdAt DESC, id DESC)`.
 * Audit log access operates independently of conversation lifecycle (i.e. even if a conversation
 * is purged, its audit logs remain intact and fully paginatable).
 */
export class AuditHistoryCursor {
  private readonly _createdAt: Date;
  private readonly _auditId: string;

  private constructor(createdAt: Date, auditId: string) {
    if (!(createdAt instanceof Date) || isNaN(createdAt.getTime())) {
      throw new InvalidCursorException('Invalid createdAt timestamp provided for audit cursor.');
    }
    if (!auditId || typeof auditId !== 'string' || auditId.trim().length === 0) {
      throw new InvalidCursorException('Audit log ID must be a non-empty string in cursor.');
    }

    this._createdAt = new Date(createdAt.getTime());
    this._auditId = auditId.trim();
    Object.freeze(this);
  }

  public static create(createdAt: Date, auditId: string): AuditHistoryCursor {
    return new AuditHistoryCursor(createdAt, auditId);
  }

  public get createdAt(): Date {
    return new Date(this._createdAt.getTime());
  }

  public get auditId(): string {
    return this._auditId;
  }

  /**
   * Encodes the cursor to a URL-safe Base64 string.
   */
  public encode(): string {
    const payload: AuditCursorPayload = {
      t: this._createdAt.toISOString(),
      id: this._auditId,
    };
    return toBase64Url(JSON.stringify(payload));
  }

  /**
   * Decodes and validates a URL-safe Base64 cursor string.
   * Throws InvalidCursorException if the cursor is malformed or invalid.
   */
  public static decode(cursorString: string): AuditHistoryCursor {
    if (!cursorString || typeof cursorString !== 'string' || cursorString.trim().length === 0) {
      throw new InvalidCursorException('Cursor string cannot be empty.');
    }

    try {
      const decodedJson = fromBase64Url(cursorString.trim());
      const parsed = JSON.parse(decodedJson) as unknown;

      if (!parsed || typeof parsed !== 'object') {
        throw new InvalidCursorException('Malformed cursor payload: expected JSON object.');
      }

      const { t, id } = parsed as Record<string, unknown>;

      if (typeof t !== 'string' || t.trim().length === 0) {
        throw new InvalidCursorException(
          `Cursor payload 't' (createdAt) must be an ISO date string.`,
        );
      }

      const date = new Date(t);
      if (isNaN(date.getTime())) {
        throw new InvalidCursorException(`Cursor payload 't' is not a valid ISO date timestamp.`);
      }

      if (typeof id !== 'string' || id.trim().length === 0) {
        throw new InvalidCursorException(`Cursor payload 'id' must be a non-empty string.`);
      }

      return new AuditHistoryCursor(date, id);
    } catch (err) {
      if (err instanceof InvalidCursorException) {
        throw err;
      }
      throw new InvalidCursorException(
        `Failed to decode audit cursor: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  public equals(other: AuditHistoryCursor | null | undefined): boolean {
    if (!other || !(other instanceof AuditHistoryCursor)) {
      return false;
    }
    return (
      this._createdAt.getTime() === other.createdAt.getTime() && this._auditId === other.auditId
    );
  }
}
