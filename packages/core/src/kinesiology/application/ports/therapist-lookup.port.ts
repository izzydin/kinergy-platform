import { TherapistReferenceDTO } from '../dtos/therapist-reference.dto';

/**
 * In-Process Anti-Corruption Layer Port for querying therapist existence and clinical eligibility.
 * Defined by Kinesiology Application layer; implemented by Infrastructure adapter.
 */
export interface ITherapistLookupPort {
  /**
   * Looks up a practitioner by ID and determines whether they are eligible for clinical assignment.
   *
   * @param therapistId The unique identifier of the practitioner
   * @returns TherapistReferenceDTO if found, or null if identity does not exist
   */
  findTherapist(therapistId: string): Promise<TherapistReferenceDTO | null>;
}

export const THERAPIST_LOOKUP_PORT = Symbol('ITherapistLookupPort');
