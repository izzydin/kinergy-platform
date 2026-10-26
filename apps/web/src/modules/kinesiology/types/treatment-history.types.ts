import type {
  TreatmentHistorySummaryDTO,
  PaginatedTreatmentHistoryDTO,
  SessionStatus,
} from '@kinergy-platform/core';
import type { SessionStatusType } from './treatment-session.types';

/**
 * Lightweight historical encounter summary item re-exported from canonical core.
 */
export type TreatmentHistoryItem = TreatmentHistorySummaryDTO;

/**
 * Paginated historical encounter projection re-exported from canonical core.
 */
export type PaginatedTreatmentHistory = PaginatedTreatmentHistoryDTO;

/**
 * Filter and pagination parameters for querying client treatment history.
 */
export interface TreatmentHistoryFilterParams {
  readonly page?: number;
  readonly limit?: number;
  readonly status?: SessionStatus | SessionStatusType;
  readonly therapistId?: string;
  readonly dateFrom?: string;
  readonly dateTo?: string;
}
