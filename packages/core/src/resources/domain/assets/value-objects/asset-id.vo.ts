import { ValueObject } from '../../shared/value-object';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const IDENTIFIER_REGEX = /^[a-z0-9_-]{3,64}$/i;

export class AssetId implements ValueObject<string> {
  private readonly _value: string;

  private constructor(value: string) {
    if (!value || typeof value !== 'string' || value.trim().length === 0) {
      throw new Error(
        `Invalid AssetId format. Expected a valid UUID or identifier, got: '${value}'`,
      );
    }
    const trimmed = value.trim();
    if (!UUID_REGEX.test(trimmed) && !IDENTIFIER_REGEX.test(trimmed)) {
      throw new Error(
        `Invalid AssetId format. Expected a valid UUID v4 or slug identifier, got: '${value}'`,
      );
    }
    this._value = trimmed.toLowerCase();
    Object.freeze(this);
  }

  public static create(value?: string): AssetId {
    return new AssetId(value ?? crypto.randomUUID());
  }

  public get value(): string {
    return this._value;
  }

  public getValue(): string {
    return this._value;
  }

  public toJSON(): string {
    return this._value;
  }

  public equals(other: ValueObject<string>): boolean {
    if (!other || !(other instanceof AssetId)) {
      return false;
    }
    return this._value === other.value;
  }

  public toString(): string {
    return this._value;
  }
}
