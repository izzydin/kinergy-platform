import { Appointment } from '../appointment/appointment.aggregate';
import { AppointmentId } from '../appointment/appointment-id.vo';
import { TimeRange } from '../value-objects/time-range.vo';

/** Options for filtering appointment range queries */
export interface FindAppointmentsOptions {
  readonly therapistId?: string;
  readonly roomId?: string;
  readonly clientId?: string;
  readonly status?: string;
  readonly seriesId?: string;
}

/**
 * Domain Repository interface for managing Appointment aggregates.
 */
export interface AppointmentRepository {
  findById(id: AppointmentId | string): Promise<Appointment | null>;
  findBySeriesId?(seriesId: string): Promise<Appointment[]>;
  findConflictingAppointments(
    therapistId: string,
    roomId: string,
    clientId: string,
    range: TimeRange,
    excludeAppointmentId?: string,
  ): Promise<Appointment[]>;
  findAppointmentsForTherapist(therapistId: string, range: TimeRange): Promise<Appointment[]>;
  findAppointmentsForRoom(roomId: string, range: TimeRange): Promise<Appointment[]>;
  findAppointmentsForClient(clientId: string, range: TimeRange): Promise<Appointment[]>;
  findAppointmentsByRange(
    range: TimeRange,
    options?: FindAppointmentsOptions,
  ): Promise<Appointment[]>;
  save(appointment: Appointment): Promise<void>;
}
