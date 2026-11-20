import { EmbeddingValidationException } from '../exceptions/vector-indexing.exceptions';

/**
 * Value Object representing an immutable identifier for a Document Embedding record.
 */
export class EmbeddingId {
  private readonly _value: string;

  private constructor(value: string) {
    if (!value || typeof value !== 'string' || value.trim().length === 0) {
      throw new EmbeddingValidationException('Embedding ID cannot be empty.');
    }
    this._value = value.trim();
    Object.freeze(this);
  }

  public static create(id?: string): EmbeddingId {
    if (id !== undefined) {
      return new EmbeddingId(id);
    }
    if (typeof globalThis !== 'undefined' && globalThis.crypto?.randomUUID) {
      return new EmbeddingId(globalThis.crypto.randomUUID());
    }
    const rand = Math.random().toString(36).substring(2, 10);
    const time = Date.now().toString(36);
    return new EmbeddingId(`emb_${time}_${rand}`);
  }

  public static fromString(id: string): EmbeddingId {
    return EmbeddingId.create(id);
  }

  public get value(): string {
    return this._value;
  }

  public equals(other?: EmbeddingId | null): boolean {
    if (!other || !(other instanceof EmbeddingId)) {
      return false;
    }
    return this._value === other.value;
  }

  public toString(): string {
    return this._value;
  }
}
