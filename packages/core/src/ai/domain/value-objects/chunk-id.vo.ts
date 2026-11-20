import { DocumentValidationException } from '../exceptions/knowledge-document.exceptions';

function deterministicHash128(str: string): string {
  let h1 = 0xdeadbeef,
    h2 = 0x41c64e6d,
    h3 = 0x9e3779b9,
    h4 = 0x85ebca6b;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
    h3 = Math.imul(h3 ^ ch, 3812015801);
    h4 = Math.imul(h4 ^ ch, 2246822507);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h3 ^ (h3 >>> 13), 3266489909);
  h3 = Math.imul(h3 ^ (h3 >>> 16), 2246822507) ^ Math.imul(h4 ^ (h4 >>> 13), 3266489909);
  h4 = Math.imul(h4 ^ (h4 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  const toHex = (n: number) => (n >>> 0).toString(16).padStart(8, '0');
  return `${toHex(h1)}${toHex(h2)}${toHex(h3)}${toHex(h4)}`;
}

/**
 * Value Object representing an immutable identifier for a document chunk.
 */
export class ChunkId {
  private readonly _value: string;

  private constructor(value: string) {
    if (!value || typeof value !== 'string' || value.trim().length === 0) {
      throw new DocumentValidationException('Chunk ID cannot be empty.');
    }
    this._value = value.trim();
    Object.freeze(this);
  }

  public static create(id?: string): ChunkId {
    if (id !== undefined) {
      return new ChunkId(id);
    }
    if (typeof globalThis !== 'undefined' && globalThis.crypto?.randomUUID) {
      return new ChunkId(globalThis.crypto.randomUUID());
    }
    const rand = Math.random().toString(36).substring(2, 10);
    const time = Date.now().toString(36);
    return new ChunkId(`chk_${time}_${rand}`);
  }

  public static fromString(id: string): ChunkId {
    return ChunkId.create(id);
  }

  /**
   * Generates a deterministic, repeatable Chunk ID derived from source document lineage,
   * sequence, versioned chunking configuration, and chunk text payload.
   * Formatted as a standard RFC 4122 UUID to ensure database compatibility.
   */
  public static createDeterministic(
    documentId: string,
    documentVersionId: string,
    sequence: number,
    content: string,
    configVersion = '1.0.0',
  ): ChunkId {
    if (!documentId || documentId.trim().length === 0) {
      throw new DocumentValidationException('Deterministic Chunk ID requires a valid documentId.');
    }
    if (!documentVersionId || documentVersionId.trim().length === 0) {
      throw new DocumentValidationException(
        'Deterministic Chunk ID requires a valid documentVersionId.',
      );
    }
    if (!Number.isInteger(sequence) || sequence < 0) {
      throw new DocumentValidationException(
        `Deterministic Chunk ID sequence must be a non-negative integer, received: ${sequence}`,
      );
    }
    if (!content || content.trim().length === 0) {
      throw new DocumentValidationException('Deterministic Chunk ID requires non-empty content.');
    }

    const payload = `${documentId.trim()}:${documentVersionId.trim()}:${sequence}:${configVersion.trim()}:${content.trim()}`;
    const hash = deterministicHash128(payload);

    // Deterministic RFC 4122 UUID formatting (variant 1, version 5)
    const p1 = hash.substring(0, 8);
    const p2 = hash.substring(8, 12);
    const p3 = `5${hash.substring(13, 16)}`;
    const p4 =
      ((parseInt(hash.substring(16, 18), 16) & 0x3f) | 0x80).toString(16) + hash.substring(18, 20);
    const p5 = hash.substring(20, 32);

    return new ChunkId(`${p1}-${p2}-${p3}-${p4}-${p5}`);
  }

  public get value(): string {
    return this._value;
  }

  public equals(other?: ChunkId | null): boolean {
    if (!other || !(other instanceof ChunkId)) {
      return false;
    }
    return this._value === other.value;
  }

  public toString(): string {
    return this._value;
  }
}
