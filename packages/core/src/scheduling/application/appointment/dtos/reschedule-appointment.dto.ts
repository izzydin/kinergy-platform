/**
 * Application DTO for rescheduling an existing appointment.
 */
export interface RescheduleAppointmentDTO {
  readonly appointmentId: string;
  readonly newStartTime: string;
  readonly newEndTime: string;
}
