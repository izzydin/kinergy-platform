import { CalendarSlotDTO } from './calendar-slot.dto';

/**
 * Pure Read-Model DTO representing a specific time block (shift, break, vacation, or override).
 */
export interface TherapistTimeBlockDTO {
  readonly startTime: string;
  readonly endTime: string;
  readonly type: 'WORKING_HOURS' | 'BREAK' | 'VACATION' | 'OVERRIDE';
  readonly label?: string;
}

/**
 * Pure Read-Model DTO representing a schedule view filtered for a single therapist.
 */
export interface TherapistCalendarDTO {
  readonly therapistId: string;
  readonly therapistName?: string;
  readonly startDate: string;
  readonly endDate: string;
  readonly workingHours: TherapistTimeBlockDTO[];
  readonly breaks: TherapistTimeBlockDTO[];
  readonly vacations: TherapistTimeBlockDTO[];
  readonly overrides: TherapistTimeBlockDTO[];
  readonly appointments: CalendarSlotDTO[];
}
