import { Query } from '../../shared/query.interface';

export interface GetRoomCalendarQueryInput {
  readonly roomId: string;
  readonly startTime: string | Date;
  readonly endTime: string | Date;
  readonly timezone?: string;
}

/**
 * CQRS Read Query retrieving room operational calendar, capacity, maintenance blocks, and occupancy.
 */
export class GetRoomCalendarQuery implements Query {
  public readonly queryId: string;
  public readonly timestamp: Date;
  public readonly input: GetRoomCalendarQueryInput;

  constructor(input: GetRoomCalendarQueryInput, queryId?: string, timestamp: Date = new Date()) {
    if (!input || !input.roomId) {
      throw new Error('roomId is required for GetRoomCalendarQuery.');
    }
    if (!input.startTime || !input.endTime) {
      throw new Error('startTime and endTime are required for GetRoomCalendarQuery.');
    }

    this.queryId =
      queryId ?? `qry_room_cal_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    this.timestamp = timestamp;
    this.input = input;
    Object.freeze(this);
  }
}
