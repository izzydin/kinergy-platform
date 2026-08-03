import { AppointmentDTO } from './appointment.dto';

/**
 * Reception Desk Read-Model DTO categorizing daily appointments by therapist, room, and status.
 */
export interface ReceptionDailyScheduleDTO {
  readonly date: string;
  readonly totalAppointments: number;
  readonly appointmentsByTherapist: Record<string, AppointmentDTO[]>;
  readonly appointmentsByRoom: Record<string, AppointmentDTO[]>;
  readonly summaryByStatus: Record<string, number>;
}
