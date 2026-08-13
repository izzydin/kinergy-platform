import { ValueObject } from '../../shared/value-object';

export type ExceptionType = 'SKIPPED' | 'MODIFIED';

export interface RecurrenceExceptionProps {
  readonly occurrenceIndex: number;
  readonly date: Date;
  readonly type: ExceptionType;
  readonly reason?: string;
}

export class RecurrenceException implements ValueObject<RecurrenceExceptionProps> {
  private readonly props: RecurrenceExceptionProps;

  private constructor(props: RecurrenceExceptionProps) {
    if (props.occurrenceIndex < 0 || !Number.isInteger(props.occurrenceIndex)) {
      throw new Error('Occurrence index for exception must be a non-negative integer.');
    }
    if (!props.date || isNaN(props.date.getTime())) {
      throw new Error('Valid date is required for recurrence exception.');
    }
    if (!props.type || (props.type !== 'SKIPPED' && props.type !== 'MODIFIED')) {
      throw new Error("Exception type must be 'SKIPPED' or 'MODIFIED'.");
    }
    this.props = { ...props, date: new Date(props.date.getTime()) };
    Object.freeze(this);
  }

  public static createSkipped(
    occurrenceIndex: number,
    date: Date,
    reason?: string,
  ): RecurrenceException {
    return new RecurrenceException({
      occurrenceIndex,
      date,
      type: 'SKIPPED',
      reason,
    });
  }

  public static createModified(
    occurrenceIndex: number,
    date: Date,
    reason?: string,
  ): RecurrenceException {
    return new RecurrenceException({
      occurrenceIndex,
      date,
      type: 'MODIFIED',
      reason,
    });
  }

  public get occurrenceIndex(): number {
    return this.props.occurrenceIndex;
  }

  public get date(): Date {
    return new Date(this.props.date.getTime());
  }

  public get type(): ExceptionType {
    return this.props.type;
  }

  public get reason(): string | undefined {
    return this.props.reason;
  }

  public getValue(): RecurrenceExceptionProps {
    return { ...this.props, date: new Date(this.props.date.getTime()) };
  }

  public equals(other: ValueObject<RecurrenceExceptionProps>): boolean {
    if (!other || !(other instanceof RecurrenceException)) {
      return false;
    }
    const val = other.getValue();
    return (
      this.props.occurrenceIndex === val.occurrenceIndex &&
      this.props.type === val.type &&
      this.props.date.getTime() === val.date.getTime()
    );
  }
}
