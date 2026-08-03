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

/**
 * Properties required to instantiate a new TherapistSchedule aggregate root.
 */
export interface CreateTherapistScheduleProps {
  id?: ScheduleId;
  therapistId: string;
  workingHours?: WorkingHours[];
  breaks?: BreakPeriod[];
  vacations?: VacationPeriod[];
  overrides?: AvailabilityOverride[];
  timezone?: string;
}

/**
 * Properties required to reconstitute a TherapistSchedule aggregate root from persistence storage.
 */
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

/**
 * TherapistSchedule Aggregate Root representing working hours, breaks, vacations, and availability rules.
 *
 * Employs a 4-level priority availability resolution engine:
 * 1. Vacations (Highest Priority -> Override Everything)
 * 2. Availability Overrides (Date-Specific AVAILABLE / UNAVAILABLE)
 * 3. Daily / Recurring Breaks
 * 4. Base Working Hours Shift Rules
 */
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

  /**
   * Factory method creating a new TherapistSchedule aggregate root.
   */
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

  /**
   * Reconstitutes an existing TherapistSchedule from persistence storage.
   */
  public static reconstitute(props: ReconstituteTherapistScheduleProps): TherapistSchedule {
    return new TherapistSchedule(props);
  }

  /** Gets the unique ScheduleId */
  public get id(): ScheduleId {
    return this._id;
  }

  /** Gets the optimistic locking version counter */
  public get version(): number {
    return this._version;
  }

  /** Gets the scalar string ID of the therapist */
  public get therapistId(): string {
    return this._therapistId;
  }

  /** Gets the IANA timezone string */
  public get timezone(): string {
    return this._timezone;
  }

  /** Gets read-only copy of working hours rules */
  public get workingHours(): ReadonlyArray<WorkingHours> {
    return Object.freeze([...this._workingHours]);
  }

  /** Gets read-only copy of break periods */
  public get breaks(): ReadonlyArray<BreakPeriod> {
    return Object.freeze([...this._breaks]);
  }

  /** Gets read-only copy of vacation periods */
  public get vacations(): ReadonlyArray<VacationPeriod> {
    return Object.freeze([...this._vacations]);
  }

  /** Gets read-only copy of availability overrides */
  public get overrides(): ReadonlyArray<AvailabilityOverride> {
    return Object.freeze([...this._overrides]);
  }

  /**
   * Evaluates if the therapist has working hours defined for the candidate range.
   */
  public isWorking(range: TimeRange): boolean {
    return this._workingHours.some((wh) => wh.isWorking(range, this._timezone));
  }

  /**
   * Evaluates if the candidate range overlaps any break period.
   */
  public isBreak(range: TimeRange): boolean {
    return this._breaks.some((bp) => bp.overlaps(range, this._timezone));
  }

  /**
   * Evaluates if the candidate range overlaps any vacation period.
   */
  public isVacation(range: TimeRange): boolean {
    return this._vacations.some((v) => v.overlaps(range));
  }

  /**
   * Resolves availability using the 4-level priority pipeline.
   *
   * @param range Target candidate TimeRange
   * @returns True if available, false if blocked by vacation, break, override, or non-working hours
   */
  public isAvailable(range: TimeRange): boolean {
    // 1. Vacations (Highest Priority)
    if (this.isVacation(range)) {
      return false;
    }

    // 2. Availability Overrides
    const matchingOverride = this._overrides.find((ov) => ov.overlaps(range));
    if (matchingOverride) {
      return matchingOverride.type === 'AVAILABLE';
    }

    // 3. Breaks
    if (this.isBreak(range)) {
      return false;
    }

    // 4. Base Working Hours
    return this.isWorking(range);
  }

  /**
   * Searches for the next available non-conflicting slot after a given date.
   *
   * @param after Starting search Date
   * @param duration Desired slot Duration
   * @param searchLimitDays Maximum days to search (default 30)
   */
  public nextAvailableSlot(
    after: Date,
    duration: Duration,
    searchLimitDays: number = 30,
  ): TimeRange | null {
    const slotMs = duration.toMilliseconds();
    if (slotMs <= 0) {
      return null;
    }

    const stepMs = 15 * 60 * 1000; // 15-minute step increments
    const limitMs = after.getTime() + searchLimitDays * 24 * 60 * 60 * 1000;
    let currentStartMs = after.getTime();

    while (currentStartMs + slotMs <= limitMs) {
      const candidateStart = new Date(currentStartMs);
      const candidateEnd = new Date(currentStartMs + slotMs);

      try {
        const candidateSlot = TimeRange.create(candidateStart, candidateEnd);
        if (this.isAvailable(candidateSlot)) {
          return candidateSlot;
        }
      } catch {
        // Skip invalid boundaries
      }

      currentStartMs += stepMs;
    }

    return null;
  }

  /** Adds a working hours shift and increments version */
  public addWorkingHours(wh: WorkingHours): void {
    this._workingHours.push(wh);
    this._version += 1;
  }

  /** Adds a break period and increments version */
  public addBreak(bp: BreakPeriod): void {
    this._breaks.push(bp);
    this._version += 1;
  }

  /** Adds a vacation period and increments version */
  public addVacation(vp: VacationPeriod): void {
    this._vacations.push(vp);
    this._version += 1;
  }

  /** Adds an availability override and increments version */
  public addOverride(ov: AvailabilityOverride): void {
    this._overrides.push(ov);
    this._version += 1;
  }

  /** Retrieves uncommitted domain events */
  public getUncommittedEvents(): ReadonlyArray<DomainEvent> {
    return Object.freeze([...this.uncommittedEvents]);
  }

  /** Clears recorded uncommitted domain events */
  public clearEvents(): void {
    this.uncommittedEvents = [];
  }

  /** Atomically pulls and clears uncommitted domain events */
  public pullEvents(): ReadonlyArray<DomainEvent> {
    const events = [...this.uncommittedEvents];
    this.uncommittedEvents = [];
    return Object.freeze(events);
  }
}
