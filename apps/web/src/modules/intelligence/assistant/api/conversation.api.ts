import { httpClient, type RequestOptions } from '../../../../shared/api/http-client';
import type {
  CreateConversationRequest,
  CreateConversationResponse,
  ReserveTurnRequest,
  ReserveTurnResponse,
  CancelTurnRequest,
  CancelTurnResponse,
  ConversationDetailResponse,
  ListConversationsQueryParams,
  ListConversationsResponse,
  GetMessageHistoryQueryParams,
  MessageHistoryResponse,
  UpdateConversationTitleRequest,
  UpdateTitleResponse,
  ArchiveConversationResponse,
  AuditInspectConversationRequest,
  AuditInspectResponse,
  CitationDetailResponse,
  ListMessageCitationsResponse,
} from '../types/conversation-contract.types';
import {
  validateCreateConversationRequest,
  validateReserveTurnRequest,
  validateUpdateConversationTitleRequest,
  validateCancelTurnRequest,
  parseCreateConversationResponse,
  parseReserveTurnResponse,
  parseCancelTurnResponse,
  parseConversationDetailResponse,
  parseListConversationsResponse,
  parseMessageHistoryResponse,
  parseUpdateTitleResponse,
  parseArchiveConversationResponse,
  parseCitationDetailResponse,
  parseListMessageCitationsResponse,
} from '../schemas/conversation-contract.schemas';
import { normalizeConversationApiError } from './conversation-api.errors';

const BASE_PATH = '/api/v1/ai/conversations';

/**
 * Standardized API client for the AI-09.3 conversation persistence and turn execution subsystem.
 *
 * Guarantees:
 * - Uses the shared authenticated HTTP client (httpClient) and interceptor pipeline.
 * - Enforces client-side validation of requests prior to dispatch.
 * - Validates backend responses against Zod runtime schemas to guard against contract drift.
 * - Preserves caller-supplied clientTurnId across retries without re-generating it.
 * - Normalizes all HTTP 4xx/5xx and contract validation failures into typed ApiError instances.
 * - Pure TypeScript client decoupled from React component state and TanStack Query.
 */
export const conversationApi = {
  /**
   * Creates a new conversation aggregate with its initial turn, user prompt, and assistant placeholder.
   *
   * @param request Typed request payload containing caller-managed clientTurnId and initial user prompt.
   * @param options Optional RequestOptions (e.g. AbortSignal).
   */
  async createConversation(
    request: CreateConversationRequest,
    options?: RequestOptions,
  ): Promise<CreateConversationResponse> {
    const validatedRequest = validateCreateConversationRequest(request);

    try {
      const rawResponse = await httpClient.post<unknown>(BASE_PATH, validatedRequest, options);
      return parseCreateConversationResponse(rawResponse);
    } catch (error) {
      throw normalizeConversationApiError(error, 'createConversation');
    }
  },

  /**
   * Reserves a subsequent sequential turn in an active conversation.
   * Enforces client-stable idempotency via clientTurnId and single active turn generation.
   *
   * @param conversationId Unique identifier of the conversation.
   * @param request Typed request payload with clientTurnId and user prompt.
   * @param options Optional RequestOptions.
   */
  async reserveTurn(
    conversationId: string,
    request: ReserveTurnRequest,
    options?: RequestOptions,
  ): Promise<ReserveTurnResponse> {
    if (!conversationId || conversationId.trim().length === 0) {
      throw normalizeConversationApiError(
        new Error('conversationId is required and must not be empty.'),
        'reserveTurn',
      );
    }

    const validatedRequest = validateReserveTurnRequest(request);
    const path = `${BASE_PATH}/${encodeURIComponent(conversationId.trim())}/turns`;

    try {
      const rawResponse = await httpClient.post<unknown>(path, validatedRequest, options);
      return parseReserveTurnResponse(rawResponse);
    } catch (error) {
      throw normalizeConversationApiError(error, 'reserveTurn');
    }
  },

  /**
   * Cancels an active or pending turn generation.
   *
   * @param conversationId Unique identifier of the conversation.
   * @param turnId Unique identifier of the turn to cancel.
   * @param request Optional cancellation payload (e.g. cancellation reason).
   * @param options Optional RequestOptions.
   */
  async cancelTurn(
    conversationId: string,
    turnId: string,
    request?: CancelTurnRequest,
    options?: RequestOptions,
  ): Promise<CancelTurnResponse> {
    if (!conversationId || conversationId.trim().length === 0) {
      throw normalizeConversationApiError(
        new Error('conversationId is required and must not be empty.'),
        'cancelTurn',
      );
    }
    if (!turnId || turnId.trim().length === 0) {
      throw normalizeConversationApiError(
        new Error('turnId is required and must not be empty.'),
        'cancelTurn',
      );
    }

    const validatedRequest = request ? validateCancelTurnRequest(request) : undefined;
    const path = `${BASE_PATH}/${encodeURIComponent(conversationId.trim())}/turns/${encodeURIComponent(turnId.trim())}/cancel`;

    try {
      const rawResponse = await httpClient.post<unknown>(path, validatedRequest, options);
      return parseCancelTurnResponse(rawResponse);
    } catch (error) {
      throw normalizeConversationApiError(error, 'cancelTurn');
    }
  },

  /**
   * Retrieves full conversation aggregate details including child turn summaries.
   *
   * @param conversationId Unique identifier of the conversation.
   * @param options Optional RequestOptions.
   */
  async getConversation(
    conversationId: string,
    options?: RequestOptions,
  ): Promise<ConversationDetailResponse> {
    if (!conversationId || conversationId.trim().length === 0) {
      throw normalizeConversationApiError(
        new Error('conversationId is required and must not be empty.'),
        'getConversation',
      );
    }

    const path = `${BASE_PATH}/${encodeURIComponent(conversationId.trim())}`;

    try {
      const rawResponse = await httpClient.get<unknown>(path, options);
      return parseConversationDetailResponse(rawResponse);
    } catch (error) {
      throw normalizeConversationApiError(error, 'getConversation');
    }
  },

  /**
   * Lists keyset-paginated conversation summaries for the authenticated user within the tenant.
   *
   * @param params Optional query parameters (cursor, limit, includeArchived).
   * @param options Optional RequestOptions.
   */
  async listConversations(
    params?: ListConversationsQueryParams,
    options?: RequestOptions,
  ): Promise<ListConversationsResponse> {
    try {
      const queryParams: Record<string, string | number | boolean | null | undefined> = {};
      if (params?.cursor) queryParams['cursor'] = params.cursor;
      if (params?.limit !== undefined) queryParams['limit'] = params.limit;
      if (params?.includeArchived !== undefined)
        queryParams['includeArchived'] = params.includeArchived;

      const mergedOptions: RequestOptions = {
        ...options,
        params: { ...queryParams, ...(options?.params ?? {}) },
      };

      const rawResponse = await httpClient.get<unknown>(BASE_PATH, mergedOptions);
      return parseListConversationsResponse(rawResponse);
    } catch (error) {
      throw normalizeConversationApiError(error, 'listConversations');
    }
  },

  /**
   * Retrieves canonical message history for a conversation using sequence-based keyset pagination.
   *
   * @param conversationId Unique identifier of the conversation.
   * @param params Optional query parameters (cursor, limit).
   * @param options Optional RequestOptions.
   */
  async getMessageHistory(
    conversationId: string,
    params?: GetMessageHistoryQueryParams,
    options?: RequestOptions,
  ): Promise<MessageHistoryResponse> {
    if (!conversationId || conversationId.trim().length === 0) {
      throw normalizeConversationApiError(
        new Error('conversationId is required and must not be empty.'),
        'getMessageHistory',
      );
    }

    const path = `${BASE_PATH}/${encodeURIComponent(conversationId.trim())}/messages`;

    try {
      const queryParams: Record<string, string | number | boolean | null | undefined> = {};
      if (params?.cursor) queryParams['cursor'] = params.cursor;
      if (params?.limit !== undefined) queryParams['limit'] = params.limit;

      const mergedOptions: RequestOptions = {
        ...options,
        params: { ...queryParams, ...(options?.params ?? {}) },
      };

      const rawResponse = await httpClient.get<unknown>(path, mergedOptions);
      return parseMessageHistoryResponse(rawResponse);
    } catch (error) {
      throw normalizeConversationApiError(error, 'getMessageHistory');
    }
  },

  /**
   * Updates the title of an active conversation.
   *
   * @param conversationId Unique identifier of the conversation.
   * @param request Typed payload containing the new title (1-255 characters).
   * @param options Optional RequestOptions.
   */
  async updateTitle(
    conversationId: string,
    request: UpdateConversationTitleRequest,
    options?: RequestOptions,
  ): Promise<UpdateTitleResponse> {
    if (!conversationId || conversationId.trim().length === 0) {
      throw normalizeConversationApiError(
        new Error('conversationId is required and must not be empty.'),
        'updateTitle',
      );
    }

    const validatedRequest = validateUpdateConversationTitleRequest(request);
    const path = `${BASE_PATH}/${encodeURIComponent(conversationId.trim())}/title`;

    try {
      const rawResponse = await httpClient.patch<unknown>(path, validatedRequest, options);
      return parseUpdateTitleResponse(rawResponse);
    } catch (error) {
      throw normalizeConversationApiError(error, 'updateTitle');
    }
  },

  /**
   * Renames a conversation. Alias for updateTitle, matching lifecycle conventions.
   *
   * @param conversationId Unique identifier of the conversation.
   * @param request Typed payload containing the new title.
   * @param options Optional RequestOptions.
   */
  async renameConversation(
    conversationId: string,
    request: UpdateConversationTitleRequest,
    options?: RequestOptions,
  ): Promise<UpdateTitleResponse> {
    return this.updateTitle(conversationId, request, options);
  },

  /**
   * Soft-deletes (archives) a conversation.
   * Prohibited while an active generation turn is in progress.
   *
   * @param conversationId Unique identifier of the conversation.
   * @param options Optional RequestOptions.
   */
  async archiveConversation(
    conversationId: string,
    options?: RequestOptions,
  ): Promise<ArchiveConversationResponse> {
    if (!conversationId || conversationId.trim().length === 0) {
      throw normalizeConversationApiError(
        new Error('conversationId is required and must not be empty.'),
        'archiveConversation',
      );
    }

    const path = `${BASE_PATH}/${encodeURIComponent(conversationId.trim())}`;

    try {
      const rawResponse = await httpClient.delete<unknown>(path, options);
      return parseArchiveConversationResponse(rawResponse);
    } catch (error) {
      throw normalizeConversationApiError(error, 'archiveConversation');
    }
  },

  /**
   * Deletes (archives) a conversation. Alias for archiveConversation, matching lifecycle conventions.
   *
   * @param conversationId Unique identifier of the conversation.
   * @param options Optional RequestOptions.
   */
  async deleteConversation(
    conversationId: string,
    options?: RequestOptions,
  ): Promise<ArchiveConversationResponse> {
    return this.archiveConversation(conversationId, options);
  },

  /**
   * Privileged audit inspection endpoint (Owner role only).
   *
   * @param conversationId Unique identifier of the conversation.
   * @param request Mandatory clinical justification reason (10 to 500 characters).
   * @param options Optional RequestOptions.
   */
  async auditInspect(
    conversationId: string,
    request: AuditInspectConversationRequest,
    options?: RequestOptions,
  ): Promise<AuditInspectResponse> {
    if (!conversationId || conversationId.trim().length === 0) {
      throw normalizeConversationApiError(
        new Error('conversationId is required and must not be empty.'),
        'auditInspect',
      );
    }

    const path = `${BASE_PATH}/${encodeURIComponent(conversationId.trim())}/audit-inspect`;

    try {
      return await httpClient.post<AuditInspectResponse>(path, request, options);
    } catch (error) {
      throw normalizeConversationApiError(error, 'auditInspect');
    }
  },

  /**
   * Retrieves all verified source citations for a specific assistant message.
   *
   * @param conversationId Unique identifier of the conversation.
   * @param messageId Unique identifier of the assistant message.
   * @param options Optional RequestOptions.
   */
  async getMessageCitations(
    conversationId: string,
    messageId: string,
    options?: RequestOptions,
  ): Promise<ListMessageCitationsResponse> {
    if (
      !conversationId ||
      conversationId.trim().length === 0 ||
      !messageId ||
      messageId.trim().length === 0
    ) {
      throw normalizeConversationApiError(
        new Error('conversationId and messageId are required and must not be empty.'),
        'getMessageCitations',
      );
    }

    const path = `${BASE_PATH}/${encodeURIComponent(conversationId.trim())}/messages/${encodeURIComponent(messageId.trim())}/citations`;

    try {
      const rawResponse = await httpClient.get<unknown>(path, options);
      return parseListMessageCitationsResponse(rawResponse);
    } catch (error) {
      throw normalizeConversationApiError(error, 'getMessageCitations');
    }
  },

  /**
   * Retrieves individual citation detail including full excerpt and document preview status.
   *
   * @param conversationId Unique identifier of the conversation.
   * @param messageId Unique identifier of the assistant message.
   * @param citationId Unique identifier of the citation.
   * @param options Optional RequestOptions.
   */
  async getCitationDetail(
    conversationId: string,
    messageId: string,
    citationId: string,
    options?: RequestOptions,
  ): Promise<CitationDetailResponse> {
    if (
      !conversationId ||
      conversationId.trim().length === 0 ||
      !messageId ||
      messageId.trim().length === 0 ||
      !citationId ||
      citationId.trim().length === 0
    ) {
      throw normalizeConversationApiError(
        new Error('conversationId, messageId, and citationId are required and must not be empty.'),
        'getCitationDetail',
      );
    }

    const path = `${BASE_PATH}/${encodeURIComponent(conversationId.trim())}/messages/${encodeURIComponent(messageId.trim())}/citations/${encodeURIComponent(citationId.trim())}`;

    try {
      const rawResponse = await httpClient.get<unknown>(path, options);
      return parseCitationDetailResponse(rawResponse);
    } catch (error) {
      throw normalizeConversationApiError(error, 'getCitationDetail');
    }
  },
};
