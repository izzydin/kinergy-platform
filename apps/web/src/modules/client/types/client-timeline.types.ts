export interface ClientTimelineEntryModel {
  id: string;
  clientId: string;
  sourceModule: string; // 'kinesiology' | 'client' | 'scheduling' | string
  eventType: string; // 'TreatmentSessionCompleted' | 'CLIENT_CREATED' | string
  summary: string;
  metadata: {
    sessionId?: string;
    therapistId?: string;
    appointmentId?: string;
    [key: string]: unknown;
  };
  occurredAt: string;
}

export interface PaginatedClientTimeline {
  items: ClientTimelineEntryModel[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
}

export interface ClientTimelineParams {
  page?: number;
  limit?: number;
}
