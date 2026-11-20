import { DocumentValidationException } from '../exceptions/knowledge-document.exceptions';

/**
 * Value Object representing a cryptographic SHA-256 digest of document content.
 * Guarantees content immutability and duplicate detection.
 */
export class DocumentChecksum {
  private static readonly SHA256_HEX_REGEX = /^[a-f0-9]{64}$/;

  private readonly _value: string;

  private constructor(value: string) {
    if (!value || typeof value !== 'string') {
      throw new DocumentValidationException('Document checksum must be a valid string.');
    }
    const normalized = value.trim().toLowerCase();
    if (!DocumentChecksum.SHA256_HEX_REGEX.test(normalized)) {
      throw new DocumentValidationException(
        `Invalid SHA-256 checksum: '${value}'. Must be a 64-character lowercase hexadecimal string.`,
      );
    }
    this._value = normalized;
    Object.freeze(this);
  }

  public static create(checksum: string): DocumentChecksum {
    return new DocumentChecksum(checksum);
  }

  public get value(): string {
    return this._value;
  }

  public equals(other?: DocumentChecksum | null): boolean {
    if (!other || !(other instanceof DocumentChecksum)) {
      return false;
    }
    return this._value === other.value;
  }

  public toString(): string {
    return this._value;
  }
}
