import { AggregateRoot } from '../shared/aggregate-root';
import { DomainEvent } from '../shared/domain-event';
import { Clock } from '../shared/clock';
import { RecurrenceSeriesId } from './value-objects/recurrence-series-id.vo';
import { RecurrencePattern } from './value-objects/recurrence-pattern.vo';
import { RecurrenceException } from './value-objects/recurrence-exception.vo';
import { SeriesStatus } from './value-objects/series-status.enum';
import { RecurringAppointmentCreatedEvent } from '../events/recurring-appointment-created.event';
import { RecurringSeriesCancelledEvent } from '../events/recurring-series-cancelled.event';
import { OccurrenceSkippedEvent } from '../events/occurrence-skipped.event';

export interface RecurrenceSeriesProps {
  readonly id: RecurrenceSeriesId;
  readonly pattern: RecurrencePattern;
  readonly clientId: string;
  readonly therapistId: string;
  readonly roomId: string;
  readonly serviceType: string;
  readonly exceptions?: RecurrenceException[];
  readonly status: SeriesStatus;
  readonly cancellationReason?: string;
  readonly version: number;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface CreateRecurrenceSeriesParams {
  readonly id?: RecurrenceSeriesId;
  readonly pattern: RecurrencePattern;
  readonly clientId: string;
  readonly therapistId: string;
  readonly roomId: string;
  readonly serviceType: string;
}

export interface TargetOccurrenceInfo {
  readonly occurrenceIndex: number;
  readonly date: Date;
  readonly isException: boolean;
  readonly exceptionReason?: string;
}

export class RecurrenceSeries implements AggregateRoot<RecurrenceSeriesId> {
  private readonly _id: RecurrenceSeriesId;
  private _version: number;
  private _pattern: RecurrencePattern;
  private _clientId: string;
  private _therapistId: string;
  private _roomId: string;
  private _serviceType: string;
  private _exceptions: RecurrenceException[];
  private _status: SeriesStatus;
  private _cancellationReason?: string;
  private readonly _createdAt: Date;
  private _updatedAt: Date;
  private uncommittedEvents: DomainEvent[] = [];

  private constructor(props: RecurrenceSeriesProps) {
    if (!props.clientId || props.clientId.trim().length === 0) {
      throw new Error('clientId is required for RecurrenceSeries.');
    }
    if (!props.therapistId || props.therapistId.trim().length === 0) {
      throw new Error('therapistId is required for RecurrenceSeries.');
    }
    if (!props.roomId || props.roomId.trim().length === 0) {
      throw new Error('roomId is required for RecurrenceSeries.');
    }
    if (!props.serviceType || props.serviceType.trim().length === 0) {
      throw new Error('serviceType is required for RecurrenceSeries.');
    }

    this._id = props.id;
    this._version = props.version;
    this._pattern = props.pattern;
    this._clientId = props.clientId.trim();
    this._therapistId = props.therapistId.trim();
    this._roomId = props.roomId.trim();
    this._serviceType = props.serviceType.trim();
    this._exceptions = props.exceptions ? [...props.exceptions] : [];
    this._status = props.status;
    this._cancellationReason = props.cancellationReason;
    this._createdAt = props.createdAt;
    this._updatedAt = props.updatedAt;
  }

  public static create(params: CreateRecurrenceSeriesParams, clock?: Clock): RecurrenceSeries {
    const id = params.id ?? RecurrenceSeriesId.create();
    const now = clock ? clock.now() : new Date();

    const series = new RecurrenceSeries({
      id,
      pattern: params.pattern,
      clientId: params.clientId,
      therapistId: params.therapistId,
      roomId: params.roomId,
      serviceType: params.serviceType,
      exceptions: [],
      status: SeriesStatus.ACTIVE,
      version: 1,
      createdAt: now,
      updatedAt: now,
    });

    series.recordEvent(
      new RecurringAppointmentCreatedEvent(
        id.toString(),
        params.clientId,
        params.therapistId,
        params.roomId,
        params.serviceType,
        params.pattern.frequency,
        params.pattern.startDate,
        params.pattern.endDate,
        params.pattern.maxOccurrences,
        1,
        now,
      ),
    );

    return series;
  }

  public static reconstitute(props: RecurrenceSeriesProps): RecurrenceSeries {
    return new RecurrenceSeries(props);
  }

  // Getters
  public get id(): RecurrenceSeriesId {
    return this._id;
  }

  public get seriesId(): RecurrenceSeriesId {
    return this._id;
  }

  public get version(): number {
    return this._version;
  }

  public get pattern(): RecurrencePattern {
    return this._pattern;
  }

  public get clientId(): string {
    return this._clientId;
  }

  public get therapistId(): string {
    return this._therapistId;
  }

  public get roomId(): string {
    return this._roomId;
  }

  public get serviceType(): string {
    return this._serviceType;
  }

  public get exceptions(): ReadonlyArray<RecurrenceException> {
    return Object.freeze([...this._exceptions]);
  }

  public get status(): SeriesStatus {
    return this._status;
  }

  public get cancellationReason(): string | undefined {
    return this._cancellationReason;
  }

  public get createdAt(): Date {
    return new Date(this._createdAt.getTime());
  }

  public get updatedAt(): Date {
    return new Date(this._updatedAt.getTime());
  }

  public getUncommittedEvents(): ReadonlyArray<DomainEvent> {
    return Object.freeze([...this.uncommittedEvents]);
  }

  public clearEvents(): void {
    this.uncommittedEvents = [];
  }

  private recordEvent(event: DomainEvent): void {
    this.uncommittedEvents.push(event);
  }

  private touch(clock?: Clock): void {
    this._version += 1;
    this._updatedAt = clock ? clock.now() : new Date();
  }

  /**
   * Skips a specific occurrence index within the series idempotently.
   * Returns true if newly skipped, false if already skipped.
   */
  public skipOccurrence(
    occurrenceIndex: number,
    date: Date,
    reason?: string,
    clock?: Clock,
  ): boolean {
    if (this._status !== SeriesStatus.ACTIVE) {
      throw new Error(
        `Cannot skip occurrence on non-active recurrence series (Status: '${this._status}').`,
      );
    }

    if (occurrenceIndex < 0 || !Number.isInteger(occurrenceIndex)) {
      throw new Error('Occurrence index must be a non-negative integer.');
    }

    const existingIndex = this._exceptions.findIndex((e) => e.occurrenceIndex === occurrenceIndex);
    if (existingIndex !== -1) {
      if (this._exceptions[existingIndex]!.type === 'SKIPPED') {
        return false; // Idempotent skip
      }
      // Replace existing non-skip exception
      this._exceptions.splice(existingIndex, 1);
    }

    const exception = RecurrenceException.createSkipped(occurrenceIndex, date, reason);
    this._exceptions.push(exception);

    const now = clock ? clock.now() : new Date();
    this.touch(clock);

    this.recordEvent(
      new OccurrenceSkippedEvent(
        this._id.toString(),
        occurrenceIndex,
        date,
        reason,
        this._version,
        now,
      ),
    );

    return true;
  }

  /**
   * Records a modified occurrence exception so future recurrence generation does not overwrite manual edits.
   */
  public recordModifiedException(
    occurrenceIndex: number,
    date: Date,
    reason?: string,
    clock?: Clock,
  ): void {
    if (this._status !== SeriesStatus.ACTIVE) {
      return;
    }

    const existingIndex = this._exceptions.findIndex((e) => e.occurrenceIndex === occurrenceIndex);
    if (existingIndex !== -1) {
      this._exceptions.splice(existingIndex, 1);
    }

    this._exceptions.push(RecurrenceException.createModified(occurrenceIndex, date, reason));
    this.touch(clock);
  }

  /**
   * Terminates this series at the specified cutoff date (used by Cutoff-and-Fork for future edits).
   */
  public terminateAt(cutoffDate: Date, clock?: Clock): void {
    if (this._status === SeriesStatus.CANCELLED) {
      throw new Error('Cannot terminate an already cancelled series.');
    }

    const newEndDate = new Date(cutoffDate.getTime() - 1);
    if (newEndDate.getTime() <= this._pattern.startDate.getTime()) {
      // If cutoff is at or before start, cancel series
      this.cancel('Terminated at series start', clock);
      return;
    }

    const currentVal = this._pattern.getValue();
    this._pattern = RecurrencePattern.create({
      frequency: currentVal.frequency,
      startDate: currentVal.startDate,
      endDate: newEndDate,
      maxOccurrences: currentVal.maxOccurrences,
      localStartTime: currentVal.localStartTime,
      durationMinutes: currentVal.durationMinutes,
      timezone: currentVal.timezone,
    });

    this.touch(clock);
  }

  /**
   * Cancels the recurring series.
   */
  public cancel(reason: string, clock?: Clock): void {
    if (this._status === SeriesStatus.CANCELLED) {
      throw new Error('Recurrence series is already cancelled.');
    }

    if (!reason || reason.trim().length === 0) {
      throw new Error('Cancellation reason is required for RecurrenceSeries.');
    }

    this._status = SeriesStatus.CANCELLED;
    this._cancellationReason = reason.trim();

    const now = clock ? clock.now() : new Date();
    this.touch(clock);

    this.recordEvent(
      new RecurringSeriesCancelledEvent(
        this._id.toString(),
        this._cancellationReason,
        this._version,
        now,
      ),
    );
  }

  /**
   * Computes target occurrence dates and identifies exception status for each occurrence index.
   */
  public computeTargetOccurrenceDates(limitDate?: Date, maxCount?: number): TargetOccurrenceInfo[] {
    const rawDates = this._pattern.generateOccurrenceDates(limitDate, maxCount);

    return rawDates.map((date, index) => {
      const exc = this._exceptions.find((e) => e.occurrenceIndex === index);
      return {
        occurrenceIndex: index,
        date,
        isException: exc !== undefined,
        exceptionReason: exc?.reason,
      };
    });
  }
}
