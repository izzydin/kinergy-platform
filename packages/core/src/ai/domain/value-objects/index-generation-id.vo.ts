import { EmbeddingValidationException } from '../exceptions/vector-indexing.exceptions';

/**
 * Value Object representing an immutable identifier for an Index Generation aggregate.
 */
export class IndexGenerationId {
  private readonly _value: string;

  private constructor(value: string) {
    if (!value || typeof value !== 'string' || value.trim().length === 0) {
      throw new EmbeddingValidationException('Index Generation ID cannot be empty.');
    }
    this._value = value.trim();
    Object.freeze(this);
  }

  public static create(id?: string): IndexGenerationId {
    if (id !== undefined) {
      return new IndexGenerationId(id);
    }
    if (typeof globalThis !== 'undefined' && globalThis.crypto?.randomUUID) {
      return new IndexGenerationId(globalThis.crypto.randomUUID());
    }
    const rand = Math.random().toString(36).substring(2, 10);
    const time = Date.now().toString(36);
    return new IndexGenerationId(`idxgen_${time}_${rand}`);
  }

  public static fromString(id: string): IndexGenerationId {
    return IndexGenerationId.create(id);
  }

  public get value(): string {
    return this._value;
  }

  public equals(other?: IndexGenerationId | null): boolean {
    if (!other || !(other instanceof IndexGenerationId)) {
      return false;
    }
    return this._value === other.value;
  }

  public toString(): string {
    return this._value;
  }
}
