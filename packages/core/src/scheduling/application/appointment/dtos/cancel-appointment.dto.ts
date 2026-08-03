/**
 * Application DTO for cancelling an appointment.
 */
export interface CancelAppointmentDTO {
  readonly appointmentId: string;
  readonly reason: string;
}
