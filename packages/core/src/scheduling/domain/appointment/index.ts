import { AggregateRoot } from '../shared/aggregate-root';

export type AppointmentStatus = 'SCHEDULED' | 'CONFIRMED' | 'CANCELLED' | 'COMPLETED' | 'NO_SHOW';

/**
 * Placeholder Aggregate Root contract for Appointment.
 */
export interface AppointmentAggregate extends AggregateRoot<string> {
  readonly clientId: string;
  readonly therapistId: string;
  readonly roomId: string;
  readonly startTime: Date;
  readonly endTime: Date;
  readonly status: AppointmentStatus;
}
