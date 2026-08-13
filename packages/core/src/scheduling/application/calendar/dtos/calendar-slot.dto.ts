/**
 * Pure Read-Model DTO representing a discrete time-block cell or slot on a calendar grid.
 */
export interface CalendarSlotDTO {
  readonly id: string;
  readonly startTime: string;
  readonly endTime: string;
  readonly status:
    | 'SCHEDULED'
    | 'CONFIRMED'
    | 'CHECKED_IN'
    | 'IN_PROGRESS'
    | 'COMPLETED'
    | 'CANCELLED'
    | 'NO_SHOW'
    | 'BLOCKED'
    | 'VACATION'
    | 'MAINTENANCE';
  readonly appointmentId?: string;
  readonly therapistId?: string;
  readonly roomId?: string;
  readonly clientId?: string;
  readonly clientName?: string;
  readonly serviceType?: string;
  readonly isBuffered?: boolean;
  readonly hasConflict?: boolean;
  readonly overlapCount?: number;
  readonly operationalStatus?: 'PAST' | 'CURRENT_NOW' | 'UPCOMING';
}
