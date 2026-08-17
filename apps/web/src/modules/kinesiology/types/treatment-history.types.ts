import { SessionStatusType } from './treatment-session.types';

export interface TreatmentHistoryItem {
  sessionId: string;
  clientId: string;
  appointmentId: string;
  therapistId: string;
  status: SessionStatusType;
  notesSummary?: string;
  hasFullNotes: boolean;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface PaginatedTreatmentHistory {
  items: TreatmentHistoryItem[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
}

export interface TreatmentHistoryFilterParams {
  page?: number;
  limit?: number;
  status?: SessionStatusType;
  therapistId?: string;
  dateFrom?: string;
  dateTo?: string;
}
