import { ValueObject } from '../shared/value-object';
import { SourceType, isValidSourceType } from '../enums/source-type.enum';
import { SaleDomainException } from '../exceptions/sale-domain.exception';

export interface SourceReferenceProps {
  sourceType: SourceType;
  sourceId: string;
  sourceCode?: string | null;
}

/**
 * Value Object capturing an unconstrained loose pointer to an external domain catalog entity
 * (TreatmentSession, Gym Membership Plan, Consumable Inventory Item, or Custom Service).
 * Maintains strict bounded context decoupling under the "References Over Ownership" law.
 */
export class SourceReference implements ValueObject<SourceReferenceProps> {
  private readonly _sourceType: SourceType;
  private readonly _sourceId: string;
  private readonly _sourceCode: string | null;

  private constructor(props: SourceReferenceProps) {
    if (!props.sourceType || !isValidSourceType(props.sourceType)) {
      throw new SaleDomainException(`Invalid or unsupported SourceType: '${props.sourceType}'.`);
    }
    if (
      !props.sourceId ||
      typeof props.sourceId !== 'string' ||
      props.sourceId.trim().length === 0
    ) {
      throw new SaleDomainException('Source ID cannot be empty.');
    }

    this._sourceType = props.sourceType;
    this._sourceId = props.sourceId.trim();
    this._sourceCode = props.sourceCode ? props.sourceCode.trim() : null;
    Object.freeze(this);
  }

  public static create(props: SourceReferenceProps): SourceReference {
    return new SourceReference(props);
  }

  public get sourceType(): SourceType {
    return this._sourceType;
  }

  public get sourceId(): string {
    return this._sourceId;
  }

  public get sourceCode(): string | null {
    return this._sourceCode;
  }

  public getValue(): SourceReferenceProps {
    return {
      sourceType: this._sourceType,
      sourceId: this._sourceId,
      sourceCode: this._sourceCode,
    };
  }

  public equals(other: ValueObject<SourceReferenceProps> | undefined | null): boolean {
    if (!other || !(other instanceof SourceReference)) {
      return false;
    }
    return (
      this._sourceType === other.sourceType &&
      this._sourceId === other.sourceId &&
      this._sourceCode === other.sourceCode
    );
  }

  public toString(): string {
    return this._sourceCode
      ? `${this._sourceType}:${this._sourceId} (${this._sourceCode})`
      : `${this._sourceType}:${this._sourceId}`;
  }
}
