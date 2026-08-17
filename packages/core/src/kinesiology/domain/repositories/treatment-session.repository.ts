import { TreatmentSession } from '../treatment-session/treatment-session.aggregate';
import { SessionId } from '../treatment-session/session-id.vo';

/**
 * Port interface for TreatmentSession persistence and repository operations.
 */
export interface ITreatmentSessionRepository {
  /**
   * Finds a TreatmentSession aggregate by its primary SessionId.
   */
  findById(id: SessionId): Promise<TreatmentSession | null>;

  /**
   * Finds a TreatmentSession aggregate by its originating Scheduling appointment identifier.
   */
  findByAppointmentId(appointmentId: string): Promise<TreatmentSession | null>;

  /**
   * Saves (inserts or updates) a TreatmentSession aggregate within transactional consistency.
   */
  save(session: TreatmentSession): Promise<void>;
}
