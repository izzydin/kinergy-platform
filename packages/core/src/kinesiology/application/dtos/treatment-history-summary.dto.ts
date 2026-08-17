import { SessionStatus } from '../../domain/treatment-session/session-status.enum';

/**
 * Lightweight read-model DTO for client treatment history listing.
 * Avoids hydrating full aggregates and massive SOAP documents in list views.
 */
export interface TreatmentHistorySummaryDTO {
  readonly sessionId: string;
  readonly clientId: string;
  readonly appointmentId: string;
  readonly therapistId: string;
  readonly status: SessionStatus;
  readonly notesSummary?: string;
  readonly hasFullNotes: boolean;
  readonly version: number;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface PaginatedTreatmentHistoryDTO {
  readonly items: TreatmentHistorySummaryDTO[];
  readonly total: number;
  readonly page: number;
  readonly limit: number;
  readonly totalPages: number;
  readonly hasNextPage: boolean;
  readonly hasPreviousPage: boolean;
}
