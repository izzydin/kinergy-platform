import { AggregateRoot } from '../shared/aggregate-root';
import { DomainEvent } from '../shared/domain-event';
import { TimeRange } from '../value-objects/time-range.vo';
import { Duration } from '../value-objects/duration.vo';
import {
  ScheduleId,
  WorkingHours,
  BreakPeriod,
  VacationPeriod,
  AvailabilityOverride,
} from './value-objects';

export interface CreateTherapistScheduleProps {
  id?: ScheduleId;
  therapistId: string;
  workingHours?: WorkingHours[];
  breaks?: BreakPeriod[];
  vacations?: VacationPeriod[];
  overrides?: AvailabilityOverride[];
  timezone?: string;
}

export interface ReconstituteTherapistScheduleProps {
  id: ScheduleId;
  version: number;
  therapistId: string;
  workingHours: WorkingHours[];
  breaks: BreakPeriod[];
  vacations: VacationPeriod[];
  overrides: AvailabilityOverride[];
  timezone: string;
}

export class TherapistSchedule implements AggregateRoot<ScheduleId> {
  private readonly _id: ScheduleId;
  private _version: number;
  private readonly _therapistId: string;
  private _workingHours: WorkingHours[];
  private _breaks: BreakPeriod[];
  private _vacations: VacationPeriod[];
  private _overrides: AvailabilityOverride[];
  private readonly _timezone: string;
  private uncommittedEvents: DomainEvent[] = [];

  private constructor(props: ReconstituteTherapistScheduleProps) {
    if (!props.therapistId || props.therapistId.trim().length === 0) {
      throw new Error('Therapist ID is required.');
    }
    this._id = props.id;
    this._version = props.version;
    this._therapistId = props.therapistId.trim();
    this._workingHours = [...props.workingHours];
    this._breaks = [...props.breaks];
    this._vacations = [...props.vacations];
    this._overrides = [...props.overrides];
    this._timezone = props.timezone || 'UTC';
  }

  public static create(props: CreateTherapistScheduleProps): TherapistSchedule {
    return new TherapistSchedule({
      id: props.id ?? ScheduleId.create(),
      version: 1,
      therapistId: props.therapistId,
      workingHours: props.workingHours ?? [],
      breaks: props.breaks ?? [],
      vacations: props.vacations ?? [],
      overrides: props.overrides ?? [],
      timezone: props.timezone ?? 'UTC',
    });
  }

  public static reconstitute(props: ReconstituteTherapistScheduleProps): TherapistSchedule {
    return new TherapistSchedule(props);
  }

  // Getters
  public get id(): ScheduleId {
    return this._id;
  }

  public get version(): number {
    return this._version;
  }

  public get therapistId(): string {
    return this._therapistId;
  }

  public get workingHours(): ReadonlyArray<WorkingHours> {
    return Object.freeze([...this._workingHours]);
  }

  public get breaks(): ReadonlyArray<BreakPeriod> {
    return Object.freeze([...this._breaks]);
  }

  public get vacations(): ReadonlyArray<VacationPeriod> {
    return Object.freeze([...this._vacations]);
  }

  public get overrides(): ReadonlyArray<AvailabilityOverride> {
    return Object.freeze([...this._overrides]);
  }

  public get timezone(): string {
    return this._timezone;
  }

  // Management Operations
  public addWorkingHours(wh: WorkingHours): void {
    this._workingHours.push(wh);
    this._version += 1;
  }

  public addBreak(b: BreakPeriod): void {
    this._breaks.push(b);
    this._version += 1;
  }

  public addVacation(v: VacationPeriod): void {
    this._vacations.push(v);
    this._version += 1;
  }

  public addOverride(o: AvailabilityOverride): void {
    this._overrides.push(o);
    this._version += 1;
  }

  // Availability Inquiries
  public isVacation(range: TimeRange): boolean {
    return this._vacations.some((v) => v.overlaps(range));
  }

  public isBreak(range: TimeRange): boolean {
    return this._breaks.some((b) => b.overlaps(range, this._timezone));
  }

  public isWorking(range: TimeRange): boolean {
    return this._workingHours.some((w) => w.isWorking(range, this._timezone));
  }

  /**
   * Priority availability calculation:
   * (1) Vacations -> (2) Availability Overrides -> (3) Breaks -> (4) Base Working Hours.
   */
  public isAvailable(range: TimeRange): boolean {
    // 1. Vacation priority check
    if (this.isVacation(range)) {
      return false;
    }

    // 2. Override priority check
    const unavailableOverride = this._overrides.find(
      (o) => o.type === 'UNAVAILABLE' && o.overlaps(range),
    );
    if (unavailableOverride) {
      return false;
    }

    const availableOverride = this._overrides.find(
      (o) => o.type === 'AVAILABLE' && o.covers(range),
    );
    if (availableOverride) {
      return true;
    }

    // 3. Break priority check
    if (this.isBreak(range)) {
      return false;
    }

    // 4. Base Working Hours check
    return this.isWorking(range);
  }

  /**
   * Searches forward from `after` for the next available time slot of specified `duration`.
   */
  public nextAvailableSlot(
    after: Date,
    duration: Duration,
    searchLimitDays = 30,
  ): TimeRange | null {
    const slotMs = duration.toMilliseconds();
    if (slotMs <= 0) {
      return null;
    }

    // Step in 15-minute increments (900,000 ms)
    const stepMs = 15 * 60 * 1000;
    const startMs = after.getTime();
    const endLimitMs = startMs + searchLimitDays * 24 * 60 * 60 * 1000;

    let currentStartMs = startMs;

    while (currentStartMs + slotMs <= endLimitMs) {
      const candidateStart = new Date(currentStartMs);
      const candidateEnd = new Date(currentStartMs + slotMs);

      try {
        const candidateRange = TimeRange.create(candidateStart, candidateEnd);
        if (this.isAvailable(candidateRange)) {
          return candidateRange;
        }
      } catch {
        // Skip invalid date boundaries if any
      }

      currentStartMs += stepMs;
    }

    return null;
  }

  // Event Store Operations
  public getUncommittedEvents(): ReadonlyArray<DomainEvent> {
    return Object.freeze([...this.uncommittedEvents]);
  }

  public clearEvents(): void {
    this.uncommittedEvents = [];
  }

  public pullEvents(): ReadonlyArray<DomainEvent> {
    const events = [...this.uncommittedEvents];
    this.uncommittedEvents = [];
    return Object.freeze(events);
  }
}
