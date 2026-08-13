import { Query } from '../../shared/query.interface';

export interface GetTherapistCalendarQueryInput {
  readonly therapistId: string;
  readonly startTime: string | Date;
  readonly endTime: string | Date;
  readonly timezone?: string;
}

/**
 * CQRS Read Query retrieving individual therapist operational calendar, working shifts, breaks, and bookings.
 */
export class GetTherapistCalendarQuery implements Query {
  public readonly queryId: string;
  public readonly timestamp: Date;
  public readonly input: GetTherapistCalendarQueryInput;

  constructor(
    input: GetTherapistCalendarQueryInput,
    queryId?: string,
    timestamp: Date = new Date(),
  ) {
    if (!input || !input.therapistId) {
      throw new Error('therapistId is required for GetTherapistCalendarQuery.');
    }
    if (!input.startTime || !input.endTime) {
      throw new Error('startTime and endTime are required for GetTherapistCalendarQuery.');
    }

    this.queryId =
      queryId ?? `qry_therapist_cal_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    this.timestamp = timestamp;
    this.input = input;
    Object.freeze(this);
  }
}
