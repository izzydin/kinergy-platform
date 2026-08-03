/**
 * Application DTO for reassigning a room to an appointment.
 */
export interface AssignRoomDTO {
  readonly appointmentId: string;
  readonly newRoomId: string;
}
