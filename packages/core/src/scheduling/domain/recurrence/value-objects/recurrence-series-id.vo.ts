import { ValueObject } from '../../shared/value-object';

export interface RecurrenceSeriesIdProps {
  readonly value: string;
}

export class RecurrenceSeriesId implements ValueObject<RecurrenceSeriesIdProps> {
  private readonly props: RecurrenceSeriesIdProps;

  private constructor(value: string) {
    if (!value || value.trim().length === 0) {
      throw new Error('RecurrenceSeriesId cannot be empty.');
    }
    this.props = { value: value.trim() };
    Object.freeze(this);
  }

  public static create(id?: string): RecurrenceSeriesId {
    const value = id ?? `rec_series_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    return new RecurrenceSeriesId(value);
  }

  public getValue(): RecurrenceSeriesIdProps {
    return { ...this.props };
  }

  public toString(): string {
    return this.props.value;
  }

  public equals(other: ValueObject<RecurrenceSeriesIdProps>): boolean {
    if (!other || !(other instanceof RecurrenceSeriesId)) {
      return false;
    }
    return this.props.value === other.getValue().value;
  }
}
