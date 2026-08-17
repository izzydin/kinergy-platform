import { TreatmentSession } from '../treatment-session/treatment-session.aggregate';
import { SessionId } from '../treatment-session/session-id.vo';
import { SessionStatus } from '../treatment-session/session-status.enum';
import { PaginatedTreatmentHistoryDTO } from '../../application/dtos/treatment-history-summary.dto';

export interface TreatmentHistoryFilter {
  readonly status?: SessionStatus;
  readonly therapistId?: string;
  readonly dateFrom?: Date;
  readonly dateTo?: Date;
  readonly pagination: {
    readonly page: number;
    readonly limit: number;
  };
}

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

  /**
   * Queries lightweight paginated treatment history summaries for a client without hydrating full aggregates.
   */
  findHistoryByClientId(
    clientId: string,
    filter: TreatmentHistoryFilter,
  ): Promise<PaginatedTreatmentHistoryDTO>;
}
