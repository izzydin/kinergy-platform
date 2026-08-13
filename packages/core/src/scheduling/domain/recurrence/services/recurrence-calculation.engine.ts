import { TimeRange } from '../../value-objects/time-range.vo';
import { TimezoneUtil } from '../../shared/timezone.util';
import { RecurrencePattern } from '../value-objects/recurrence-pattern.vo';
import { RecurrenceFrequency } from '../value-objects/recurrence-frequency.enum';
import { RecurrenceException } from '../value-objects/recurrence-exception.vo';

export interface CalculatedOccurrenceSlot {
  readonly occurrenceKey: string;
  readonly seriesId: string;
  readonly occurrenceIndex: number;
  readonly timeRange: TimeRange;
  readonly localDate: {
    readonly year: number;
    readonly month: number;
    readonly day: number;
    readonly hour: number;
    readonly minute: number;
  };
  readonly isSkipped: boolean;
  readonly skipReason?: string;
}

export interface CalculateOccurrencesParams {
  readonly seriesId: string;
  readonly pattern: RecurrencePattern;
  readonly window?: TimeRange;
  readonly exceptions?: ReadonlyArray<RecurrenceException>;
}

export interface RecurrenceCalculationResult {
  readonly seriesId: string;
  readonly slots: CalculatedOccurrenceSlot[];
  readonly activeSlots: CalculatedOccurrenceSlot[];
  readonly totalOccurrencesEvaluated: number;
  readonly isSeriesCompleted: boolean;
}

/**
 * Pure Domain Recurrence Calculation Engine.
 *
 * Responsibilities:
 * - Deterministically calculates expected recurrence occurrence slots within a temporal window.
 * - Computes stable, reproducible idempotency keys (`${seriesId}:${occurrenceIndex}`).
 * - Strictly respects local wall-clock appointment times, IANA timezones, and Daylight Saving Time (DST) shifts (ADR-005).
 * - Applies product-approved Monthly Clamping Policy for month-end dates.
 * - Integrates exceptions (e.g. skipped occurrences) without breaking sequence continuity.
 *
 * Constraints:
 * - Zero database access.
 * - Zero Appointment aggregate creation.
 * - Zero conflict detection.
 * - Zero state mutation.
 */
export class RecurrenceCalculationEngine {
  private static readonly MAX_UNBOUNDED_ITERATIONS = 500;

  public static calculate(params: CalculateOccurrencesParams): RecurrenceCalculationResult {
    const { seriesId, pattern, window, exceptions = [] } = params;

    const slots: CalculatedOccurrenceSlot[] = [];
    const activeSlots: CalculatedOccurrenceSlot[] = [];

    // If window starts after series endDate, the result is empty and completed
    if (pattern.endDate && window && window.start.getTime() > pattern.endDate.getTime()) {
      return {
        seriesId,
        slots: [],
        activeSlots: [],
        totalOccurrencesEvaluated: 0,
        isSeriesCompleted: true,
      };
    }

    const startLocal = TimezoneUtil.extractLocalDate(pattern.startDate, pattern.timezone);
    const { year: Y_0, monthZeroBased: M_0, day: D_0 } = startLocal;
    const { hour: H, minute: Min } = pattern.localStartTime;
    const durationMinutes = pattern.durationMinutes;

    const maxOccurrences = pattern.maxOccurrences ?? Number.MAX_SAFE_INTEGER;
    const endDate = pattern.endDate;

    let occurrenceIndex = 0;
    let isSeriesCompleted = false;

    while (occurrenceIndex < maxOccurrences && occurrenceIndex < this.MAX_UNBOUNDED_ITERATIONS) {
      let targetYear: number;
      let targetMonth: number;
      let targetDay: number;

      if (pattern.frequency === RecurrenceFrequency.WEEKLY) {
        const intermediate = new Date(Date.UTC(Y_0, M_0, D_0 + occurrenceIndex * 7));
        targetYear = intermediate.getUTCFullYear();
        targetMonth = intermediate.getUTCMonth();
        targetDay = intermediate.getUTCDate();
      } else if (pattern.frequency === RecurrenceFrequency.BIWEEKLY) {
        const intermediate = new Date(Date.UTC(Y_0, M_0, D_0 + occurrenceIndex * 14));
        targetYear = intermediate.getUTCFullYear();
        targetMonth = intermediate.getUTCMonth();
        targetDay = intermediate.getUTCDate();
      } else {
        // MONTHLY with Clamping Policy
        const totalMonths = M_0 + occurrenceIndex;
        targetYear = Y_0 + Math.floor(totalMonths / 12);
        targetMonth = ((totalMonths % 12) + 12) % 12;

        const maxDaysInTargetMonth = TimezoneUtil.getLastDayOfMonth(targetYear, targetMonth);
        targetDay = Math.min(D_0, maxDaysInTargetMonth);
      }

      // Convert target local date/time in pattern.timezone to UTC Date
      const startUtc = TimezoneUtil.localToUtc(
        targetYear,
        targetMonth,
        targetDay,
        H,
        Min,
        pattern.timezone,
      );
      const endUtc = new Date(startUtc.getTime() + durationMinutes * 60 * 1000);
      const timeRange = TimeRange.create(startUtc, endUtc);

      // Check series end date boundary
      if (endDate && startUtc.getTime() > endDate.getTime()) {
        isSeriesCompleted = true;
        break;
      }

      // Check calculation window upper boundary
      if (window && startUtc.getTime() > window.end.getTime()) {
        break;
      }

      // Check if slot falls within calculation window
      const isWithinWindow =
        !window ||
        (startUtc.getTime() >= window.start.getTime() &&
          startUtc.getTime() <= window.end.getTime());

      if (isWithinWindow) {
        const exception = exceptions.find((e) => e.occurrenceIndex === occurrenceIndex);
        const isSkipped = exception?.type === 'SKIPPED';

        const slot: CalculatedOccurrenceSlot = {
          occurrenceKey: `${seriesId}:${occurrenceIndex}`,
          seriesId,
          occurrenceIndex,
          timeRange,
          localDate: {
            year: targetYear,
            month: targetMonth + 1,
            day: targetDay,
            hour: H,
            minute: Min,
          },
          isSkipped,
          skipReason: exception?.reason,
        };

        slots.push(slot);
        if (!isSkipped) {
          activeSlots.push(slot);
        }
      }

      occurrenceIndex++;

      if (occurrenceIndex >= maxOccurrences) {
        isSeriesCompleted = true;
      }
    }

    return {
      seriesId,
      slots,
      activeSlots,
      totalOccurrencesEvaluated: occurrenceIndex,
      isSeriesCompleted,
    };
  }
}
