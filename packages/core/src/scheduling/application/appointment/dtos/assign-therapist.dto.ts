/**
 * Application DTO for reassigning a therapist to an appointment.
 */
export interface AssignTherapistDTO {
  readonly appointmentId: string;
  readonly newTherapistId: string;
}
