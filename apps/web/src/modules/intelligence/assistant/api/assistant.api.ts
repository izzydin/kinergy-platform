import { httpClient } from '../../../../shared/api/http-client';
import { normalizeApiError } from '../../../../shared/api/api-error';
import type {
  ChatMessage,
  ChatMessageDto,
  QueryKnowledgeRequestDto,
  RAGAnswerResponseDto,
} from '../types/assistant.types';
import {
  parseRAGAnswerResponse,
  validateQueryKnowledgeRequest,
} from '../schemas/assistant.schemas';
import type { IntelligenceHealthState } from '../../types';

/**
 * Standardized API Adapter for the AI Assistant Subsystem.
 *
 * Encapsulates network operations with:
 * - Backend RAG answer generation: POST /api/v1/ai/knowledge/query
 * - AI Subsystem Health: GET /api/v1/ai/health
 * - History turns context builder for stateless requests (ADR-AI-09-01)
 * - Request cancellation via AbortSignal
 * - Strict schema validation and error normalization
 */
export const assistantApi = {
  /**
   * Submits a knowledge inquiry to the backend RAG engine.
   *
   * @param request Typed request parameters including user query and multi-turn context
   * @param signal Optional AbortSignal to support explicit user cancellation
   */
  async queryKnowledge(
    request: QueryKnowledgeRequestDto,
    signal?: AbortSignal,
  ): Promise<RAGAnswerResponseDto> {
    const validatedRequest = validateQueryKnowledgeRequest(request);

    try {
      const rawResponse = await httpClient.post<unknown>(
        '/api/v1/ai/knowledge/query',
        validatedRequest,
        { signal },
      );

      return parseRAGAnswerResponse(rawResponse);
    } catch (error) {
      throw normalizeApiError(error);
    }
  },

  /**
   * Retrieves live AI engine health metrics (Ollama, Pinecone, Embeddings).
   */
  async getAIHealth(signal?: AbortSignal): Promise<IntelligenceHealthState> {
    try {
      return await httpClient.get<IntelligenceHealthState>('/api/v1/ai/health', {
        signal,
      });
    } catch (error) {
      throw normalizeApiError(error);
    }
  },

  /**
   * Converts a domain ChatMessage array into bounded ChatMessageDto turns suitable for backend context.
   * Only includes successfully completed user and assistant messages, capped at maxTurns (default: 10).
   */
  buildConversationHistoryContext(
    messages: readonly ChatMessage[],
    maxTurns = 10,
  ): ChatMessageDto[] {
    const validMessages = messages.filter(
      (m) => (m.status === 'success' || m.role === 'user') && m.content.trim().length > 0,
    );

    const bounded =
      validMessages.length > maxTurns
        ? validMessages.slice(validMessages.length - maxTurns)
        : validMessages;

    return bounded.map((m) => ({
      role: m.role,
      content: m.content.trim(),
    }));
  },
};
