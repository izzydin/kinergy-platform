import { AggregateRoot } from '../shared/aggregate-root';
import { AppointmentStatus } from '../value-objects/appointment-status.enum';

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
