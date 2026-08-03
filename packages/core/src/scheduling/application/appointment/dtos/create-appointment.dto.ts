/**
 * Application DTO for booking a new appointment.
 */
export interface CreateAppointmentDTO {
  readonly id?: string;
  readonly clientId: string;
  readonly therapistId: string;
  readonly roomId: string;
  readonly type: string;
  readonly startTime: string;
  readonly endTime: string;
}
