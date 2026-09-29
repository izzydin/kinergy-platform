import { ValueObject } from '../shared/value-object';
import { SaleSourceType, isValidSaleSourceType } from '../enums/sale-source-type.enum';
import { InvalidSaleSourceException } from '../exceptions/invalid-sale-source.exception';

export interface SaleSourceProps {
  type: SaleSourceType;
  referenceId: string;
}

/**
 * Value Object representing the generic commercial origin/reference of a Sale or SaleItem.
 * Adheres strictly to ADR-0121 ("References Over Ownership").
 *
 * Enforces:
 * - Supported source type (KINESIOLOGY_SESSION, GYM_MEMBERSHIP, FOOD, DRINK, ROOM_RENTAL)
 * - Non-empty, sanitized generic reference identifier (without interpreting format)
 * - Complete immutability (Object.freeze)
 * - Deterministic value equality
 */
export class SaleSource implements ValueObject<SaleSourceProps> {
  public static readonly MAX_REFERENCE_ID_LENGTH = 255;

  private readonly _type: SaleSourceType;
  private readonly _referenceId: string;

  constructor(type: SaleSourceType, referenceId: string);
  constructor(props: SaleSourceProps);
  constructor(typeOrProps: SaleSourceType | SaleSourceProps, maybeReferenceId?: string) {
    let rawType: unknown;
    let rawRefId: unknown;

    if (typeof typeOrProps === 'object' && typeOrProps !== null) {
      rawType = typeOrProps.type;
      rawRefId = typeOrProps.referenceId;
    } else {
      rawType = typeOrProps;
      rawRefId = maybeReferenceId;
    }

    if (!rawType || !isValidSaleSourceType(rawType)) {
      throw new InvalidSaleSourceException(
        `Invalid or unsupported source type: '${String(rawType)}'. Supported types are: ${Object.values(SaleSourceType).join(', ')}.`,
        'INVALID_SALE_SOURCE_TYPE',
      );
    }

    if (typeof rawRefId !== 'string') {
      throw new InvalidSaleSourceException(
        'Reference ID must be a non-empty string.',
        'INVALID_SALE_SOURCE_REFERENCE_ID',
      );
    }

    const trimmedRefId = rawRefId.trim();
    if (trimmedRefId.length === 0) {
      throw new InvalidSaleSourceException(
        'Reference ID cannot be empty or whitespace.',
        'INVALID_SALE_SOURCE_REFERENCE_ID',
      );
    }

    if (trimmedRefId.length > SaleSource.MAX_REFERENCE_ID_LENGTH) {
      throw new InvalidSaleSourceException(
        `Reference ID cannot exceed ${SaleSource.MAX_REFERENCE_ID_LENGTH} characters, received: ${trimmedRefId.length}.`,
        'INVALID_SALE_SOURCE_REFERENCE_ID',
      );
    }

    // Generic identifier integrity: Prohibit control characters (0-31 and 127)
    for (let i = 0; i < trimmedRefId.length; i++) {
      const code = trimmedRefId.charCodeAt(i);
      if ((code >= 0 && code <= 31) || code === 127) {
        throw new InvalidSaleSourceException(
          'Reference ID contains invalid control characters.',
          'INVALID_SALE_SOURCE_REFERENCE_ID',
        );
      }
    }

    this._type = rawType;
    this._referenceId = trimmedRefId;
    Object.freeze(this);
  }

  public static create(type: SaleSourceType, referenceId: string): SaleSource;
  public static create(props: SaleSourceProps): SaleSource;
  public static create(
    typeOrProps: SaleSourceType | SaleSourceProps,
    maybeReferenceId?: string,
  ): SaleSource {
    if (typeof typeOrProps === 'object' && typeOrProps !== null) {
      return new SaleSource(typeOrProps);
    }
    return new SaleSource(typeOrProps, maybeReferenceId as string);
  }

  public get type(): SaleSourceType {
    return this._type;
  }

  public get referenceId(): string {
    return this._referenceId;
  }

  public getValue(): SaleSourceProps {
    return {
      type: this._type,
      referenceId: this._referenceId,
    };
  }

  public equals(other: ValueObject<SaleSourceProps> | undefined | null): boolean {
    if (!other || !(other instanceof SaleSource)) {
      return false;
    }
    return this._type === other.type && this._referenceId === other.referenceId;
  }

  public toString(): string {
    return `${this._type}:${this._referenceId}`;
  }

  public toJSON(): SaleSourceProps {
    return this.getValue();
  }

  public static fromJSON(json: unknown): SaleSource {
    if (!json || typeof json !== 'object') {
      throw new InvalidSaleSourceException(
        'Cannot deserialize SaleSource from non-object JSON.',
        'INVALID_SALE_SOURCE_SERIALIZATION',
      );
    }
    const candidate = json as Partial<SaleSourceProps>;
    return SaleSource.create({
      type: candidate.type as SaleSourceType,
      referenceId: candidate.referenceId as string,
    });
  }
}
