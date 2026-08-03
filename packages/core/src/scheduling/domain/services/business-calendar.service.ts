import { TimeRange } from '../value-objects/time-range.vo';

export interface HolidayEntry {
  readonly range: TimeRange;
  readonly name: string;
}

export interface ClosureEntry {
  readonly range: TimeRange;
  readonly reason: string;
}

export class BusinessCalendarService {
  private holidays: HolidayEntry[] = [];
  private closures: ClosureEntry[] = [];

  public addHoliday(dateOrRange: Date | TimeRange, name: string): void {
    if (!name || name.trim().length === 0) {
      throw new Error('Holiday name is required.');
    }
    const range = this.toTimeRange(dateOrRange);
    this.holidays.push({ range, name: name.trim() });
  }

  public addClosure(dateOrRange: Date | TimeRange, reason: string): void {
    if (!reason || reason.trim().length === 0) {
      throw new Error('Closure reason is required.');
    }
    const range = this.toTimeRange(dateOrRange);
    this.closures.push({ range, reason: reason.trim() });
  }

  public isHoliday(dateOrRange: Date | TimeRange): boolean {
    if (dateOrRange instanceof TimeRange) {
      return this.holidays.some((h) => h.range.overlaps(dateOrRange));
    }
    return this.holidays.some((h) => h.range.contains(dateOrRange));
  }

  public isClinicOpen(dateOrRange: Date | TimeRange): boolean {
    if (this.isHoliday(dateOrRange)) {
      return false;
    }

    if (dateOrRange instanceof TimeRange) {
      return !this.closures.some((c) => c.range.overlaps(dateOrRange));
    }
    return !this.closures.some((c) => c.range.contains(dateOrRange));
  }

  public getHolidays(): ReadonlyArray<HolidayEntry> {
    return Object.freeze([...this.holidays]);
  }

  public getClosures(): ReadonlyArray<ClosureEntry> {
    return Object.freeze([...this.closures]);
  }

  private toTimeRange(dateOrRange: Date | TimeRange): TimeRange {
    if (dateOrRange instanceof TimeRange) {
      return dateOrRange;
    }
    const start = new Date(
      Date.UTC(
        dateOrRange.getUTCFullYear(),
        dateOrRange.getUTCMonth(),
        dateOrRange.getUTCDate(),
        0,
        0,
        0,
        0,
      ),
    );
    const end = new Date(start.getTime() + 24 * 60 * 60 * 1000 - 1);
    return TimeRange.create(start, end);
  }
}
