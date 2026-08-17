import { AppointmentReferenceDTO } from '../dtos/appointment-reference.dto';

/**
 * Anti-Corruption Layer port interface for querying appointment eligibility and metadata from Scheduling.
 */
export interface ISchedulingAppointmentLookupPort {
  /**
   * Retrieves an appointment reference by its scalar identifier.
   * Returns null if the appointment does not exist.
   *
   * @param appointmentId The unique scalar identifier of the appointment.
   */
  getAppointmentReference(appointmentId: string): Promise<AppointmentReferenceDTO | null>;
}
