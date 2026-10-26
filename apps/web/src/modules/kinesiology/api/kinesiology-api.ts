import { httpClient, RequestOptions } from '../../../shared/api/http-client';
import { ValidationError } from '../../../shared/api/api-error';
import { normalizeKinesiologyError } from './kinesiology-error';
import type {
  TreatmentSessionModel,
  CreateSessionPayload,
  AssignTherapistPayload,
  UpdateNotesPayload,
  CancelSessionPayload,
  PaginatedTreatmentHistory,
  TreatmentHistoryFilterParams,
} from '../types';

/**
 * Authoritative API Client for Kinesiology Clinical Treatment Session Workflows.
 * Communicates strictly with registered NestJS TreatmentSessionsController endpoints.
 */
export const kinesiologyApi = {
  /**
   * Creates a new TreatmentSession aggregate from a scheduled, eligible appointment.
   * Path: POST /api/v1/kinesiology/sessions
   * Permission: kinesiology.sessions.treat
   */
  async createSession(
    payload: CreateSessionPayload,
    options?: RequestOptions,
  ): Promise<TreatmentSessionModel> {
    if (!payload?.appointmentId || payload.appointmentId.trim().length === 0) {
      throw new ValidationError('appointmentId is required to create a treatment session.');
    }

    try {
      const body = {
        appointmentId: payload.appointmentId.trim(),
        initialNotes: payload.initialNotes?.trim() || undefined,
        autoStart: payload.autoStart,
      };
      return await (options
        ? httpClient.post<TreatmentSessionModel>('/api/v1/kinesiology/sessions', body, options)
        : httpClient.post<TreatmentSessionModel>('/api/v1/kinesiology/sessions', body));
    } catch (error) {
      throw normalizeKinesiologyError(error);
    }
  },

  /**
   * Retrieves an existing TreatmentSession aggregate by its unique identifier.
   * Path: GET /api/v1/kinesiology/sessions/:id
   * Permission: kinesiology.sessions.read
   */
  async getSessionById(
    sessionId: string,
    options?: RequestOptions,
  ): Promise<TreatmentSessionModel> {
    if (!sessionId || sessionId.trim().length === 0) {
      throw new ValidationError('Session ID cannot be empty.');
    }

    const url = `/api/v1/kinesiology/sessions/${encodeURIComponent(sessionId.trim())}`;
    try {
      return await (options
        ? httpClient.get<TreatmentSessionModel>(url, options)
        : httpClient.get<TreatmentSessionModel>(url));
    } catch (error) {
      throw normalizeKinesiologyError(error);
    }
  },

  /**
   * Transitions a session from SCHEDULED to IN_PROGRESS.
   * Path: POST /api/v1/kinesiology/sessions/:id/start
   * Permission: kinesiology.sessions.treat
   */
  async startSession(sessionId: string, options?: RequestOptions): Promise<TreatmentSessionModel> {
    if (!sessionId || sessionId.trim().length === 0) {
      throw new ValidationError('Session ID cannot be empty.');
    }

    const url = `/api/v1/kinesiology/sessions/${encodeURIComponent(sessionId.trim())}/start`;
    try {
      return await (options
        ? httpClient.post<TreatmentSessionModel>(url, undefined, options)
        : httpClient.post<TreatmentSessionModel>(url));
    } catch (error) {
      throw normalizeKinesiologyError(error);
    }
  },

  /**
   * Reassigns the clinical practitioner responsible for this encounter.
   * Path: POST /api/v1/kinesiology/sessions/:id/assign-therapist
   * Permission: kinesiology.sessions.assign
   */
  async assignTherapist(
    sessionId: string,
    payload: AssignTherapistPayload,
    options?: RequestOptions,
  ): Promise<TreatmentSessionModel> {
    if (!sessionId || sessionId.trim().length === 0) {
      throw new ValidationError('Session ID cannot be empty.');
    }
    if (!payload?.newTherapistId || payload.newTherapistId.trim().length === 0) {
      throw new ValidationError('newTherapistId is required for therapist assignment.');
    }

    const url = `/api/v1/kinesiology/sessions/${encodeURIComponent(sessionId.trim())}/assign-therapist`;
    const body = { newTherapistId: payload.newTherapistId.trim() };
    try {
      return await (options
        ? httpClient.post<TreatmentSessionModel>(url, body, options)
        : httpClient.post<TreatmentSessionModel>(url, body));
    } catch (error) {
      throw normalizeKinesiologyError(error);
    }
  },

  /**
   * Updates clinical SOAP progress notes on an active treatment session.
   * Path: PUT /api/v1/kinesiology/sessions/:id/notes
   * Permission: kinesiology.sessions.treat
   */
  async updateNotes(
    sessionId: string,
    payload: UpdateNotesPayload,
    options?: RequestOptions,
  ): Promise<TreatmentSessionModel> {
    if (!sessionId || sessionId.trim().length === 0) {
      throw new ValidationError('Session ID cannot be empty.');
    }

    const url = `/api/v1/kinesiology/sessions/${encodeURIComponent(sessionId.trim())}/notes`;
    try {
      return await (options
        ? httpClient.put<TreatmentSessionModel>(url, payload, options)
        : httpClient.put<TreatmentSessionModel>(url, payload));
    } catch (error) {
      throw normalizeKinesiologyError(error);
    }
  },

  /**
   * Finalizes, signs, and completes a treatment session encounter.
   * Locks SOAP notes and emits cross-context timeline projection events.
   * Path: POST /api/v1/kinesiology/sessions/:id/complete
   * Permission: kinesiology.sessions.treat
   */
  async completeSession(
    sessionId: string,
    options?: RequestOptions,
  ): Promise<TreatmentSessionModel> {
    if (!sessionId || sessionId.trim().length === 0) {
      throw new ValidationError('Session ID cannot be empty.');
    }

    const url = `/api/v1/kinesiology/sessions/${encodeURIComponent(sessionId.trim())}/complete`;
    try {
      return await (options
        ? httpClient.post<TreatmentSessionModel>(url, undefined, options)
        : httpClient.post<TreatmentSessionModel>(url));
    } catch (error) {
      throw normalizeKinesiologyError(error);
    }
  },

  /**
   * Cancels a scheduled treatment session with mandatory reason.
   * Path: POST /api/v1/kinesiology/sessions/:id/cancel
   * Permission: kinesiology.sessions.treat
   */
  async cancelSession(
    sessionId: string,
    payload: CancelSessionPayload,
    options?: RequestOptions,
  ): Promise<TreatmentSessionModel> {
    if (!sessionId || sessionId.trim().length === 0) {
      throw new ValidationError('Session ID cannot be empty.');
    }
    if (!payload?.reason || payload.reason.trim().length === 0) {
      throw new ValidationError('Cancellation reason is required.');
    }

    const url = `/api/v1/kinesiology/sessions/${encodeURIComponent(sessionId.trim())}/cancel`;
    const body = { reason: payload.reason.trim() };
    try {
      return await (options
        ? httpClient.post<TreatmentSessionModel>(url, body, options)
        : httpClient.post<TreatmentSessionModel>(url, body));
    } catch (error) {
      throw normalizeKinesiologyError(error);
    }
  },

  /**
   * Queries chronological paginated treatment encounters for a client.
   * Path: GET /api/v1/kinesiology/clients/:clientId/treatment-history
   * Permission: kinesiology.sessions.read
   */
  async getClientTreatmentHistory(
    clientId: string,
    params?: TreatmentHistoryFilterParams,
    options?: RequestOptions,
  ): Promise<PaginatedTreatmentHistory> {
    if (!clientId || clientId.trim().length === 0) {
      throw new ValidationError('Client ID cannot be empty.');
    }

    // Sanitize search params so undefined/empty values are not appended to the query string
    const queryParams: Record<string, string | number | boolean> = {};
    if (params?.page !== undefined) queryParams.page = params.page;
    if (params?.limit !== undefined) queryParams.limit = params.limit;
    if (params?.status) queryParams.status = params.status;
    if (params?.therapistId) queryParams.therapistId = params.therapistId;
    if (params?.dateFrom) queryParams.dateFrom = params.dateFrom;
    if (params?.dateTo) queryParams.dateTo = params.dateTo;

    const hasParams = Object.keys(queryParams).length > 0;
    const requestOptions = options
      ? { ...options, ...(hasParams ? { params: queryParams } : {}) }
      : hasParams
        ? { params: queryParams }
        : undefined;

    const url = `/api/v1/kinesiology/clients/${encodeURIComponent(clientId.trim())}/treatment-history`;
    try {
      return await (requestOptions
        ? httpClient.get<PaginatedTreatmentHistory>(url, requestOptions)
        : httpClient.get<PaginatedTreatmentHistory>(url));
    } catch (error) {
      throw normalizeKinesiologyError(error);
    }
  },
};
