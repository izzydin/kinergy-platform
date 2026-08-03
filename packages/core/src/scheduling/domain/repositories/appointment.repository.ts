import { Appointment } from '../appointment/appointment.aggregate';
import { TimeRange } from '../value-objects/time-range.vo';

export interface AppointmentRepository {
  findById(id: string): Promise<Appointment | null>;
  findByTherapistId(therapistId: string, range?: TimeRange): Promise<Appointment[]>;
  findByRoomId(roomId: string, range?: TimeRange): Promise<Appointment[]>;
  findByClientId(clientId: string, range?: TimeRange): Promise<Appointment[]>;
  save(appointment: Appointment): Promise<void>;
}
