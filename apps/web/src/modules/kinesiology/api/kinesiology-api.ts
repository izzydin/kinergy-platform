import { httpClient } from '../../../shared/api/http-client';
import {
  TreatmentSessionModel,
  CreateSessionPayload,
  AssignTherapistPayload,
  UpdateNotesPayload,
  CancelSessionPayload,
  PaginatedTreatmentHistory,
  TreatmentHistoryFilterParams,
} from '../types';

export const kinesiologyApi = {
  createSession(payload: CreateSessionPayload): Promise<TreatmentSessionModel> {
    return httpClient.post<TreatmentSessionModel>('/api/v1/kinesiology/sessions', payload);
  },

  getSessionById(sessionId: string): Promise<TreatmentSessionModel> {
    return httpClient.get<TreatmentSessionModel>(`/api/v1/kinesiology/sessions/${sessionId}`);
  },

  startSession(sessionId: string): Promise<TreatmentSessionModel> {
    return httpClient.post<TreatmentSessionModel>(
      `/api/v1/kinesiology/sessions/${sessionId}/start`,
    );
  },

  assignTherapist(
    sessionId: string,
    payload: AssignTherapistPayload,
  ): Promise<TreatmentSessionModel> {
    return httpClient.post<TreatmentSessionModel>(
      `/api/v1/kinesiology/sessions/${sessionId}/assign-therapist`,
      payload,
    );
  },

  updateNotes(sessionId: string, payload: UpdateNotesPayload): Promise<TreatmentSessionModel> {
    return httpClient.put<TreatmentSessionModel>(
      `/api/v1/kinesiology/sessions/${sessionId}/notes`,
      payload,
    );
  },

  completeSession(sessionId: string): Promise<TreatmentSessionModel> {
    return httpClient.post<TreatmentSessionModel>(
      `/api/v1/kinesiology/sessions/${sessionId}/complete`,
    );
  },

  cancelSession(sessionId: string, payload: CancelSessionPayload): Promise<TreatmentSessionModel> {
    return httpClient.post<TreatmentSessionModel>(
      `/api/v1/kinesiology/sessions/${sessionId}/cancel`,
      payload,
    );
  },

  getClientTreatmentHistory(
    clientId: string,
    params?: TreatmentHistoryFilterParams,
  ): Promise<PaginatedTreatmentHistory> {
    return httpClient.get<PaginatedTreatmentHistory>(
      `/api/v1/kinesiology/clients/${clientId}/treatment-history`,
      {
        params: params as Record<string, string | number | boolean | null | undefined>,
      },
    );
  },
};
