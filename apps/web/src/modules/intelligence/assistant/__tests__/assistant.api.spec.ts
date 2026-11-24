import { assistantApi } from '../api/assistant.api';
import { httpClient } from '../../../../shared/api/http-client';
import type { ChatMessage, RAGAnswerResponseDto } from '../types/assistant.types';
import { ApiError, AuthenticationError, ValidationError } from '../../../../shared/api/api-error';

jest.mock('../../../../shared/api/http-client', () => ({
  httpClient: {
    get: jest.fn(),
    post: jest.fn(),
  },
}));

describe('assistantApi Adapter', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('queryKnowledge', () => {
    const validResponse: RAGAnswerResponseDto = {
      answer: 'Indicación de estiramiento pasivo.',
      grounded: true,
      sources: [
        {
          documentId: 'doc-1',
          documentTitle: 'Guía Clínica',
          chunkId: 'chk-1',
          relevanceScore: 0.92,
        },
      ],
      metadata: {
        model: 'mistral:latest',
        retrievalCount: 3,
        latencyMs: 250,
      },
    };

    it('submits valid request to /api/v1/ai/knowledge/query with AbortSignal', async () => {
      (httpClient.post as jest.Mock).mockResolvedValueOnce(validResponse);
      const controller = new AbortController();

      const result = await assistantApi.queryKnowledge(
        {
          query: '¿Cómo realizar estiramientos pasivos?',
          searchMode: 'HYBRID',
          topK: 5,
        },
        controller.signal,
      );

      expect(httpClient.post).toHaveBeenCalledTimes(1);
      expect(httpClient.post).toHaveBeenCalledWith(
        '/api/v1/ai/knowledge/query',
        expect.objectContaining({
          query: '¿Cómo realizar estiramientos pasivos?',
          searchMode: 'HYBRID',
          topK: 5,
        }),
        { signal: controller.signal },
      );
      expect(result).toEqual(validResponse);
    });

    it('rejects locally if query fails schema validation before dispatching HTTP', async () => {
      await expect(
        assistantApi.queryKnowledge({ query: 'ab' }), // Less than 3 chars
      ).rejects.toThrow();

      expect(httpClient.post).not.toHaveBeenCalled();
    });

    it('normalizes server 401 error into AuthenticationError', async () => {
      (httpClient.post as jest.Mock).mockRejectedValueOnce({
        statusCode: 401,
        message: 'Token expired',
      });

      await expect(
        assistantApi.queryKnowledge({ query: 'Valid query text' }),
      ).rejects.toBeInstanceOf(AuthenticationError);
    });

    it('normalizes server 400 error into ValidationError', async () => {
      (httpClient.post as jest.Mock).mockRejectedValueOnce({
        statusCode: 400,
        message: 'Invalid payload structure',
      });

      await expect(
        assistantApi.queryKnowledge({ query: 'Valid query text' }),
      ).rejects.toBeInstanceOf(ValidationError);
    });
  });

  describe('getAIHealth', () => {
    it('calls GET /api/v1/ai/health', async () => {
      const mockHealth = {
        status: 'healthy',
        timestamp: new Date().toISOString(),
        subsystems: {
          llm: { status: 'healthy', model: 'mistral' },
          embedding: { status: 'healthy' },
          vectorDatabase: { status: 'healthy' },
        },
      };

      (httpClient.get as jest.Mock).mockResolvedValueOnce(mockHealth);

      const health = await assistantApi.getAIHealth();
      expect(httpClient.get).toHaveBeenCalledWith('/api/v1/ai/health', { signal: undefined });
      expect(health.status).toBe('healthy');
    });

    it('normalizes error on failure', async () => {
      (httpClient.get as jest.Mock).mockRejectedValueOnce(new Error('Network offline'));

      await expect(assistantApi.getAIHealth()).rejects.toBeInstanceOf(ApiError);
    });
  });

  describe('buildConversationHistoryContext', () => {
    it('extracts role and content from successful turns only', () => {
      const messages: ChatMessage[] = [
        {
          id: '1',
          role: 'user',
          content: 'Hello',
          createdAt: '2026-01-01',
          status: 'success',
        },
        {
          id: '2',
          role: 'assistant',
          content: 'Hi there',
          createdAt: '2026-01-01',
          status: 'success',
        },
        {
          id: '3',
          role: 'assistant',
          content: '',
          createdAt: '2026-01-01',
          status: 'pending', // Pending should be skipped
        },
        {
          id: '4',
          role: 'assistant',
          content: '',
          createdAt: '2026-01-01',
          status: 'error', // Error should be skipped
        },
      ];

      const history = assistantApi.buildConversationHistoryContext(messages);
      expect(history).toEqual([
        { role: 'user', content: 'Hello' },
        { role: 'assistant', content: 'Hi there' },
      ]);
    });

    it('bounds history turns to specified maxTurns', () => {
      const messages: ChatMessage[] = Array.from({ length: 20 }, (_, i) => ({
        id: `msg-${i}`,
        role: i % 2 === 0 ? 'user' : 'assistant',
        content: `Turn ${i}`,
        createdAt: '2026-01-01',
        status: 'success',
      }));

      const history = assistantApi.buildConversationHistoryContext(messages, 6);
      expect(history.length).toBe(6);
      expect(history[0]?.content).toBe('Turn 14');
      expect(history[5]?.content).toBe('Turn 19');
    });
  });
});
