import { DocumentValidationException } from '../exceptions/knowledge-document.exceptions';

/**
 * Value Object representing an immutable Knowledge Document aggregate identifier.
 */
export class DocumentId {
  private readonly _value: string;

  private constructor(value: string) {
    if (!value || typeof value !== 'string' || value.trim().length === 0) {
      throw new DocumentValidationException('Document ID cannot be empty.');
    }
    this._value = value.trim();
    Object.freeze(this);
  }

  public static create(id?: string): DocumentId {
    if (id !== undefined) {
      return new DocumentId(id);
    }
    // Isomorphic RFC 4122 v4 UUID generator (Node & browser safe)
    if (typeof globalThis !== 'undefined' && globalThis.crypto?.randomUUID) {
      return new DocumentId(globalThis.crypto.randomUUID());
    }
    const rand = Math.random().toString(36).substring(2, 10);
    const time = Date.now().toString(36);
    return new DocumentId(`doc_${time}_${rand}`);
  }

  public get value(): string {
    return this._value;
  }

  public equals(other?: DocumentId | null): boolean {
    if (!other || !(other instanceof DocumentId)) {
      return false;
    }
    return this._value === other.value;
  }

  public toString(): string {
    return this._value;
  }
}
