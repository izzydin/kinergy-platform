/**
 * DTO structure for appointment notes or clinical comments.
 */
export interface AppointmentNoteDTO {
  readonly id: string;
  readonly noteText: string;
  readonly authorId: string;
  readonly createdAt: string;
}
