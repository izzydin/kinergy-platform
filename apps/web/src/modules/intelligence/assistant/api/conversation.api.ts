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
  CitationPreviewResponse,
  SubmitFeedbackRequest,
  MessageFeedbackResponse,
  RevokeFeedbackResponse,
  RegenerateTurnRequest,
  RegenerateTurnResponse,
} from '../types/conversation-contract.types';
import {
  validateCreateConversationRequest,
  validateReserveTurnRequest,
  validateUpdateConversationTitleRequest,
  validateCancelTurnRequest,
  validateSubmitFeedbackRequest,
  validateRegenerateTurnRequest,
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
  parseCitationPreviewResponse,
  parseMessageFeedbackResponse,
  parseRevokeFeedbackResponse,
  parseRegenerateTurnResponse,
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
   * Cancels generation for a specific assistant message.
   *
   * @param conversationId Unique identifier of the conversation.
   * @param messageId Unique identifier of the assistant message.
   * @param request Optional cancellation payload.
   * @param options Optional RequestOptions.
   */
  async cancelMessage(
    conversationId: string,
    messageId: string,
    request?: CancelTurnRequest,
    options?: RequestOptions,
  ): Promise<CancelTurnResponse> {
    if (!conversationId || conversationId.trim().length === 0) {
      throw normalizeConversationApiError(
        new Error('conversationId is required and must not be empty.'),
        'cancelMessage',
      );
    }
    if (!messageId || messageId.trim().length === 0) {
      throw normalizeConversationApiError(
        new Error('messageId is required and must not be empty.'),
        'cancelMessage',
      );
    }

    const validatedRequest = request ? validateCancelTurnRequest(request) : undefined;
    const path = `${BASE_PATH}/${encodeURIComponent(conversationId.trim())}/messages/${encodeURIComponent(messageId.trim())}/cancel`;

    try {
      const rawResponse = await httpClient.post<unknown>(path, validatedRequest, options);
      return parseCancelTurnResponse(rawResponse);
    } catch (error) {
      throw normalizeConversationApiError(error, 'cancelMessage');
    }
  },

  /**
   * Cancels any currently active in-flight generation in the conversation.
   *
   * @param conversationId Unique identifier of the conversation.
   * @param request Optional cancellation payload.
   * @param options Optional RequestOptions.
   */
  async cancelActiveGeneration(
    conversationId: string,
    request?: CancelTurnRequest,
    options?: RequestOptions,
  ): Promise<CancelTurnResponse> {
    if (!conversationId || conversationId.trim().length === 0) {
      throw normalizeConversationApiError(
        new Error('conversationId is required and must not be empty.'),
        'cancelActiveGeneration',
      );
    }

    const validatedRequest = request ? validateCancelTurnRequest(request) : undefined;
    const path = `${BASE_PATH}/${encodeURIComponent(conversationId.trim())}/cancel`;

    try {
      const rawResponse = await httpClient.post<unknown>(path, validatedRequest, options);
      return parseCancelTurnResponse(rawResponse);
    } catch (error) {
      throw normalizeConversationApiError(error, 'cancelActiveGeneration');
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

  /**
   * Retrieves preview metadata and an authorized short-lived preview token for a citation document.
   *
   * @param conversationId Unique identifier of the conversation.
   * @param messageId Unique identifier of the assistant message.
   * @param citationId Unique identifier of the citation.
   * @param options Optional RequestOptions.
   */
  async getCitationPreview(
    conversationId: string,
    messageId: string,
    citationId: string,
    options?: RequestOptions,
  ): Promise<CitationPreviewResponse> {
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
        'getCitationPreview',
      );
    }

    const path = `${BASE_PATH}/${encodeURIComponent(conversationId.trim())}/messages/${encodeURIComponent(messageId.trim())}/citations/${encodeURIComponent(citationId.trim())}/preview`;

    try {
      const rawResponse = await httpClient.get<unknown>(path, options);
      return parseCitationPreviewResponse(rawResponse);
    } catch (error) {
      throw normalizeConversationApiError(error, 'getCitationPreview');
    }
  },

  /**
   * Builds the authorized content streaming URL for iframe embed or download.
   *
   * @param conversationId Unique identifier of the conversation.
   * @param messageId Unique identifier of the assistant message.
   * @param citationId Unique identifier of the citation.
   * @param previewToken Short-lived preview token returned by getCitationPreview.
   */
  getCitationDocumentContentUrl(
    conversationId: string,
    messageId: string,
    citationId: string,
    previewToken?: string | null,
  ): string {
    const basePath = `${BASE_PATH}/${encodeURIComponent(conversationId.trim())}/messages/${encodeURIComponent(messageId.trim())}/citations/${encodeURIComponent(citationId.trim())}/content`;
    if (previewToken) {
      return `${basePath}?token=${encodeURIComponent(previewToken)}`;
    }
    return basePath;
  },

  /**
   * Fetches document content as plain text (used for text/markdown/csv/json preview rendering).
   */
  async getCitationDocumentContentText(
    conversationId: string,
    messageId: string,
    citationId: string,
    previewToken?: string | null,
    options?: RequestOptions,
  ): Promise<string> {
    const url = this.getCitationDocumentContentUrl(
      conversationId,
      messageId,
      citationId,
      previewToken,
    );
    try {
      const response = await fetch(url, {
        method: 'GET',
        signal: options?.signal,
      });
      if (!response.ok) {
        throw new Error(
          `Failed to load document content: ${response.status} ${response.statusText}`,
        );
      }
      return await response.text();
    } catch (error) {
      throw normalizeConversationApiError(error, 'getCitationDocumentContentText');
    }
  },

  /**
   * Submits or updates feedback for a canonical assistant response (AI-09.5 - FB.02 / FB.03).
   *
   * @param conversationId Unique identifier of the conversation.
   * @param messageId Unique identifier of the assistant message.
   * @param request Typed feedback payload containing rating ('POSITIVE' | 'NEGATIVE') and optional explanation.
   * @param options Optional RequestOptions.
   */
  async submitFeedback(
    conversationId: string,
    messageId: string,
    request: SubmitFeedbackRequest,
    options?: RequestOptions,
  ): Promise<MessageFeedbackResponse> {
    if (!conversationId || conversationId.trim().length === 0) {
      throw normalizeConversationApiError(
        new Error('conversationId is required and must not be empty.'),
        'submitFeedback',
      );
    }
    if (!messageId || messageId.trim().length === 0) {
      throw normalizeConversationApiError(
        new Error('messageId is required and must not be empty.'),
        'submitFeedback',
      );
    }

    const validatedPayload = validateSubmitFeedbackRequest(request);
    const path = `${BASE_PATH}/${encodeURIComponent(conversationId.trim())}/messages/${encodeURIComponent(messageId.trim())}/feedback`;

    try {
      const raw = await httpClient.post<unknown>(path, validatedPayload, options);
      return parseMessageFeedbackResponse(raw);
    } catch (error) {
      throw normalizeConversationApiError(error, 'submitFeedback');
    }
  },

  /**
   * Retrieves the current user's feedback for a specific assistant message.
   * Returns null if no feedback has been submitted.
   *
   * @param conversationId Unique identifier of the conversation.
   * @param messageId Unique identifier of the assistant message.
   * @param options Optional RequestOptions.
   */
  async getFeedback(
    conversationId: string,
    messageId: string,
    options?: RequestOptions,
  ): Promise<MessageFeedbackResponse | null> {
    if (!conversationId || conversationId.trim().length === 0) {
      throw normalizeConversationApiError(
        new Error('conversationId is required and must not be empty.'),
        'getFeedback',
      );
    }
    if (!messageId || messageId.trim().length === 0) {
      throw normalizeConversationApiError(
        new Error('messageId is required and must not be empty.'),
        'getFeedback',
      );
    }

    const path = `${BASE_PATH}/${encodeURIComponent(conversationId.trim())}/messages/${encodeURIComponent(messageId.trim())}/feedback`;

    try {
      const raw = await httpClient.get<unknown>(path, options);
      if (raw === null || raw === undefined) {
        return null;
      }
      return parseMessageFeedbackResponse(raw);
    } catch (error) {
      throw normalizeConversationApiError(error, 'getFeedback');
    }
  },

  /**
   * Revokes (deletes) existing user feedback for a specific assistant message.
   *
   * @param conversationId Unique identifier of the conversation.
   * @param messageId Unique identifier of the assistant message.
   * @param options Optional RequestOptions.
   */
  async revokeFeedback(
    conversationId: string,
    messageId: string,
    options?: RequestOptions,
  ): Promise<RevokeFeedbackResponse> {
    if (!conversationId || conversationId.trim().length === 0) {
      throw normalizeConversationApiError(
        new Error('conversationId is required and must not be empty.'),
        'revokeFeedback',
      );
    }
    if (!messageId || messageId.trim().length === 0) {
      throw normalizeConversationApiError(
        new Error('messageId is required and must not be empty.'),
        'revokeFeedback',
      );
    }

    const path = `${BASE_PATH}/${encodeURIComponent(conversationId.trim())}/messages/${encodeURIComponent(messageId.trim())}/feedback`;

    try {
      const raw = await httpClient.delete<unknown>(path, options);
      return parseRevokeFeedbackResponse(raw);
    } catch (error) {
      throw normalizeConversationApiError(error, 'revokeFeedback');
    }
  },

  /**
   * Regenerates an eligible assistant response for a given turn.
   *
   * @param conversationId Unique identifier of the conversation.
   * @param turnId Unique identifier of the turn.
   * @param request Optional request payload with clientTurnId or messageId.
   * @param options Optional RequestOptions.
   */
  async regenerateTurn(
    conversationId: string,
    turnId: string,
    request?: RegenerateTurnRequest,
    options?: RequestOptions,
  ): Promise<RegenerateTurnResponse> {
    if (!conversationId || conversationId.trim().length === 0) {
      throw normalizeConversationApiError(
        new Error('conversationId is required and must not be empty.'),
        'regenerateTurn',
      );
    }
    if (!turnId || turnId.trim().length === 0) {
      throw normalizeConversationApiError(
        new Error('turnId is required and must not be empty.'),
        'regenerateTurn',
      );
    }

    const validatedRequest = request ? validateRegenerateTurnRequest(request) : {};
    const path = `${BASE_PATH}/${encodeURIComponent(conversationId.trim())}/turns/${encodeURIComponent(turnId.trim())}/regenerate`;

    try {
      const raw = await httpClient.post<unknown>(path, validatedRequest, options);
      return parseRegenerateTurnResponse(raw);
    } catch (error) {
      throw normalizeConversationApiError(error, 'regenerateTurn');
    }
  },

  /**
   * Regenerates an eligible assistant response for a given message.
   *
   * @param conversationId Unique identifier of the conversation.
   * @param messageId Unique identifier of the assistant message.
   * @param request Optional request payload with clientTurnId.
   * @param options Optional RequestOptions.
   */
  async regenerateMessage(
    conversationId: string,
    messageId: string,
    request?: RegenerateTurnRequest,
    options?: RequestOptions,
  ): Promise<RegenerateTurnResponse> {
    if (!conversationId || conversationId.trim().length === 0) {
      throw normalizeConversationApiError(
        new Error('conversationId is required and must not be empty.'),
        'regenerateMessage',
      );
    }
    if (!messageId || messageId.trim().length === 0) {
      throw normalizeConversationApiError(
        new Error('messageId is required and must not be empty.'),
        'regenerateMessage',
      );
    }

    const validatedRequest = request ? validateRegenerateTurnRequest(request) : {};
    const path = `${BASE_PATH}/${encodeURIComponent(conversationId.trim())}/messages/${encodeURIComponent(messageId.trim())}/regenerate`;

    try {
      const raw = await httpClient.post<unknown>(path, validatedRequest, options);
      return parseRegenerateTurnResponse(raw);
    } catch (error) {
      throw normalizeConversationApiError(error, 'regenerateMessage');
    }
  },
};
