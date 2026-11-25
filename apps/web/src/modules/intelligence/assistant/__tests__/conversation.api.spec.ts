import { conversationApi } from '../api/conversation.api';
import {
  ContractValidationError,
  isConflictError,
  isTurnInProgressConflict,
  isPayloadMismatchConflict,
  getRetryAfterSeconds,
} from '../api/conversation-api.errors';
import { httpClient } from '../../../../shared/api/http-client';
import {
  AuthenticationError,
  AuthorizationError,
  NotFoundError,
  ConflictError,
  RateLimitError,
  ServerError,
  NetworkError,
  ValidationError,
} from '../../../../shared/api/api-error';
import type {
  CreateConversationResponse,
  ReserveTurnResponse,
  CancelTurnResponse,
  ConversationDetailResponse,
  ListConversationsResponse,
  MessageHistoryResponse,
  UpdateTitleResponse,
  ArchiveConversationResponse,
} from '../types/conversation-contract.types';

jest.mock('../../../../shared/api/http-client', () => ({
  httpClient: {
    get: jest.fn(),
    post: jest.fn(),
    patch: jest.fn(),
    delete: jest.fn(),
  },
}));

describe('AI-09.3 Conversation API Client (FE.01.03)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('1. createConversation', () => {
    const validResponse: CreateConversationResponse = {
      conversationId: 'conv_123',
      turnId: 'turn_456',
      clientTurnId: 'client_turn_init_001',
      turnIndex: 1,
      userMessageId: 'msg_user_01',
      assistantAttemptId: 'msg_asst_01',
      title: 'Initial Title',
      turnStatus: 'PENDING',
      isIdempotentReplay: false,
      idempotencyOutcome: 'CREATED',
      createdAt: '2026-11-24T14:00:00.000Z',
    };

    it('submits valid request to POST /api/v1/ai/conversations and preserves clientTurnId', async () => {
      (httpClient.post as jest.Mock).mockResolvedValueOnce(validResponse);
      const controller = new AbortController();

      const result = await conversationApi.createConversation(
        {
          clientTurnId: 'client_turn_init_001',
          userPrompt: 'Formulate an ACL rehabilitation plan for stage 3',
          title: 'Initial Title',
          metadata: { client: 'web' },
        },
        { signal: controller.signal },
      );

      expect(httpClient.post).toHaveBeenCalledTimes(1);
      expect(httpClient.post).toHaveBeenCalledWith(
        '/api/v1/ai/conversations',
        {
          clientTurnId: 'client_turn_init_001',
          userPrompt: 'Formulate an ACL rehabilitation plan for stage 3',
          title: 'Initial Title',
          metadata: { client: 'web' },
        },
        { signal: controller.signal },
      );
      expect(result).toEqual(validResponse);
      expect(result.clientTurnId).toBe('client_turn_init_001');
    });

    it('rejects locally without network dispatch if request payload is invalid', async () => {
      await expect(
        conversationApi.createConversation({
          clientTurnId: '',
          userPrompt: 'Valid prompt',
        }),
      ).rejects.toThrow();

      expect(httpClient.post).not.toHaveBeenCalled();
    });

    it('throws ContractValidationError if backend response violates schema', async () => {
      (httpClient.post as jest.Mock).mockResolvedValueOnce({
        conversationId: 'conv_123',
        // Missing required turnId, clientTurnId, turnIndex, etc.
      });

      await expect(
        conversationApi.createConversation({
          clientTurnId: 'client_turn_1',
          userPrompt: 'Valid prompt',
        }),
      ).rejects.toBeInstanceOf(ContractValidationError);
    });
  });

  describe('2. reserveTurn', () => {
    const validResponse: ReserveTurnResponse = {
      conversationId: 'conv_123',
      turnId: 'turn_789',
      clientTurnId: 'client_turn_sub_002',
      turnIndex: 2,
      userMessageId: 'msg_user_02',
      assistantAttemptId: 'msg_asst_02',
      turnStatus: 'PENDING',
      isIdempotentReplay: false,
      idempotencyOutcome: 'CREATED',
      createdAt: '2026-11-24T14:05:00.000Z',
    };

    it('submits valid request to POST /api/v1/ai/conversations/:id/turns with stable clientTurnId', async () => {
      (httpClient.post as jest.Mock).mockResolvedValueOnce(validResponse);

      const result = await conversationApi.reserveTurn('conv_123', {
        clientTurnId: 'client_turn_sub_002',
        userPrompt: 'What exercises are contraindicated?',
      });

      expect(httpClient.post).toHaveBeenCalledWith(
        '/api/v1/ai/conversations/conv_123/turns',
        {
          clientTurnId: 'client_turn_sub_002',
          userPrompt: 'What exercises are contraindicated?',
        },
        undefined,
      );
      expect(result.clientTurnId).toBe('client_turn_sub_002');
    });

    it('rejects empty conversationId before dispatch', async () => {
      await expect(
        conversationApi.reserveTurn('   ', {
          clientTurnId: 'client_turn_sub_002',
          userPrompt: 'Valid prompt',
        }),
      ).rejects.toThrow();

      expect(httpClient.post).not.toHaveBeenCalled();
    });
  });

  describe('3. cancelTurn', () => {
    const validResponse: CancelTurnResponse = {
      conversationId: 'conv_123',
      turnId: 'turn_456',
      turnStatus: 'CANCELLED',
      assistantMessageId: 'msg_asst_456',
      isAlreadyCancelled: false,
      cancelledAt: '2026-11-24T14:10:00.000Z',
    };

    it('submits POST /api/v1/ai/conversations/:id/turns/:turnId/cancel', async () => {
      (httpClient.post as jest.Mock).mockResolvedValueOnce(validResponse);

      const result = await conversationApi.cancelTurn('conv_123', 'turn_456', {
        reason: 'User cancelled',
      });

      expect(httpClient.post).toHaveBeenCalledWith(
        '/api/v1/ai/conversations/conv_123/turns/turn_456/cancel',
        { reason: 'User cancelled' },
        undefined,
      );
      expect(result.turnStatus).toBe('CANCELLED');
    });
  });

  describe('4. getConversation', () => {
    const validResponse: ConversationDetailResponse = {
      id: 'conv_123',
      title: 'ACL Protocol',
      turnCounter: 1,
      messageCounter: 2,
      lastActivityAt: '2026-11-24T14:00:00.000Z',
      createdAt: '2026-11-24T14:00:00.000Z',
      updatedAt: '2026-11-24T14:00:00.000Z',
      isArchived: false,
      activeTurnId: null,
      turns: [],
    };

    it('submits GET /api/v1/ai/conversations/:id', async () => {
      (httpClient.get as jest.Mock).mockResolvedValueOnce(validResponse);

      const result = await conversationApi.getConversation('conv_123');

      expect(httpClient.get).toHaveBeenCalledWith('/api/v1/ai/conversations/conv_123', undefined);
      expect(result.id).toBe('conv_123');
    });
  });

  describe('5. listConversations', () => {
    const validResponse: ListConversationsResponse = {
      items: [
        {
          id: 'conv_1',
          title: 'Plan 1',
          turnCounter: 2,
          lastActivityAt: '2026-11-24T14:00:00.000Z',
          createdAt: '2026-11-24T14:00:00.000Z',
          isArchived: false,
        },
      ],
      nextCursor: 'cursor_base64url_123',
      hasMore: true,
    };

    it('submits GET /api/v1/ai/conversations with query params', async () => {
      (httpClient.get as jest.Mock).mockResolvedValueOnce(validResponse);

      const result = await conversationApi.listConversations({
        cursor: 'cursor_prev',
        limit: 15,
        includeArchived: true,
      });

      expect(httpClient.get).toHaveBeenCalledWith(
        '/api/v1/ai/conversations',
        expect.objectContaining({
          params: {
            cursor: 'cursor_prev',
            limit: 15,
            includeArchived: true,
          },
        }),
      );
      expect(result.items).toHaveLength(1);
      expect(result.nextCursor).toBe('cursor_base64url_123');
    });
  });

  describe('6. getMessageHistory', () => {
    const validResponse: MessageHistoryResponse = {
      messages: [
        {
          id: 'msg_1',
          turnId: 'turn_1',
          role: 'USER',
          sequenceNumber: 1,
          attemptNumber: 1,
          isCanonical: true,
          status: 'SUCCESS',
          content: 'Hello',
          sources: null,
          createdAt: '2026-11-24T14:00:00.000Z',
          completedAt: '2026-11-24T14:00:00.000Z',
        },
      ],
      nextCursor: null,
      hasMore: false,
    };

    it('submits GET /api/v1/ai/conversations/:id/messages with sequence params', async () => {
      (httpClient.get as jest.Mock).mockResolvedValueOnce(validResponse);

      const result = await conversationApi.getMessageHistory('conv_123', {
        cursor: 'seq_cursor_1',
        limit: 10,
      });

      expect(httpClient.get).toHaveBeenCalledWith(
        '/api/v1/ai/conversations/conv_123/messages',
        expect.objectContaining({
          params: {
            cursor: 'seq_cursor_1',
            limit: 10,
          },
        }),
      );
      expect(result.messages).toHaveLength(1);
    });
  });

  describe('7. updateTitle & archiveConversation', () => {
    it('updateTitle submits PATCH /api/v1/ai/conversations/:id/title', async () => {
      const validResponse: UpdateTitleResponse = {
        conversationId: 'conv_123',
        title: 'Updated Title',
        updatedAt: '2026-11-24T14:15:00.000Z',
      };
      (httpClient.patch as jest.Mock).mockResolvedValueOnce(validResponse);

      const result = await conversationApi.updateTitle('conv_123', {
        title: 'Updated Title',
      });

      expect(httpClient.patch).toHaveBeenCalledWith(
        '/api/v1/ai/conversations/conv_123/title',
        { title: 'Updated Title' },
        undefined,
      );
      expect(result.title).toBe('Updated Title');
    });

    it('archiveConversation submits DELETE /api/v1/ai/conversations/:id', async () => {
      const validResponse: ArchiveConversationResponse = {
        conversationId: 'conv_123',
        isArchived: true,
        archivedAt: '2026-11-24T14:20:00.000Z',
      };
      (httpClient.delete as jest.Mock).mockResolvedValueOnce(validResponse);

      const result = await conversationApi.archiveConversation('conv_123');

      expect(httpClient.delete).toHaveBeenCalledWith(
        '/api/v1/ai/conversations/conv_123',
        undefined,
      );
      expect(result.isArchived).toBe(true);
    });
  });

  describe('8. Error Normalization & Conflict Diagnostics', () => {
    it('propagates 401 as AuthenticationError', async () => {
      (httpClient.post as jest.Mock).mockRejectedValueOnce(
        new AuthenticationError('Session expired'),
      );

      await expect(
        conversationApi.createConversation({
          clientTurnId: 'turn_1',
          userPrompt: 'Valid prompt',
        }),
      ).rejects.toBeInstanceOf(AuthenticationError);
    });

    it('propagates 403 as AuthorizationError', async () => {
      (httpClient.get as jest.Mock).mockRejectedValueOnce(
        new AuthorizationError('Forbidden: missing tenant context'),
      );

      await expect(conversationApi.getConversation('conv_123')).rejects.toBeInstanceOf(
        AuthorizationError,
      );
    });

    it('propagates 404 as NotFoundError (masking cross-tenant conversations)', async () => {
      (httpClient.get as jest.Mock).mockRejectedValueOnce(
        new NotFoundError('Conversation not found in authenticated tenant'),
      );

      await expect(conversationApi.getConversation('conv_cross_tenant')).rejects.toBeInstanceOf(
        NotFoundError,
      );
    });

    it('normalizes 400 Bad Request into ValidationError', async () => {
      (httpClient.post as jest.Mock).mockRejectedValueOnce(
        new ValidationError('userPrompt must not be empty'),
      );

      await expect(
        conversationApi.createConversation({
          clientTurnId: 'turn_1',
          userPrompt: 'Valid prompt',
        }),
      ).rejects.toBeInstanceOf(ValidationError);
    });

    it('identifies in-flight turn conflict with Retry-After header', async () => {
      const conflictError = new ConflictError(
        'Turn already in progress on this conversation',
        undefined,
        {
          code: 'TURN_ALREADY_IN_PROGRESS',
          retryAfterSeconds: 2,
        },
      );
      (httpClient.post as jest.Mock).mockRejectedValueOnce(conflictError);

      try {
        await conversationApi.reserveTurn('conv_123', {
          clientTurnId: 'turn_2',
          userPrompt: 'Concurrent prompt',
        });
        fail('Should have thrown ConflictError');
      } catch (err) {
        expect(isConflictError(err)).toBe(true);
        expect(isTurnInProgressConflict(err)).toBe(true);
        expect(isPayloadMismatchConflict(err)).toBe(false);
        expect(getRetryAfterSeconds(err)).toBe(2);
      }
    });

    it('identifies clientTurnId payload hash mismatch conflict', async () => {
      const conflictError = new ConflictError(
        'clientTurnId turn_1 already exists with a different payload hash',
        undefined,
        {
          code: 'DUPLICATE_CLIENT_TURN_PAYLOAD_MISMATCH',
        },
      );
      (httpClient.post as jest.Mock).mockRejectedValueOnce(conflictError);

      try {
        await conversationApi.createConversation({
          clientTurnId: 'turn_1',
          userPrompt: 'Altered prompt',
        });
        fail('Should have thrown ConflictError');
      } catch (err) {
        expect(isConflictError(err)).toBe(true);
        expect(isPayloadMismatchConflict(err)).toBe(true);
        expect(isTurnInProgressConflict(err)).toBe(false);
      }
    });

    it('propagates 429 as RateLimitError with retryAfterSeconds', async () => {
      (httpClient.post as jest.Mock).mockRejectedValueOnce(
        new RateLimitError('Too many requests', 5),
      );

      await expect(
        conversationApi.createConversation({
          clientTurnId: 'turn_1',
          userPrompt: 'Valid prompt',
        }),
      ).rejects.toBeInstanceOf(RateLimitError);
    });

    it('propagates 500 server error as ServerError', async () => {
      (httpClient.get as jest.Mock).mockRejectedValueOnce(
        new ServerError('Internal database failure', 500),
      );

      await expect(conversationApi.getConversation('conv_123')).rejects.toBeInstanceOf(ServerError);
    });

    it('propagates network failure as NetworkError', async () => {
      (httpClient.get as jest.Mock).mockRejectedValueOnce(new NetworkError('Failed to fetch'));

      await expect(conversationApi.getConversation('conv_123')).rejects.toBeInstanceOf(
        NetworkError,
      );
    });

    it('raises ContractValidationError with diagnostic issues when response violates schema', async () => {
      (httpClient.get as jest.Mock).mockResolvedValueOnce({
        // Missing id, title, etc.
        invalidField: true,
      });

      try {
        await conversationApi.getConversation('conv_123');
        fail('Should have thrown ContractValidationError');
      } catch (err) {
        expect(err).toBeInstanceOf(ContractValidationError);
        const contractErr = err as ContractValidationError;
        expect(contractErr.statusCode).toBe(502);
        expect(contractErr.code).toBe('CONTRACT_VALIDATION_ERROR');
        expect(contractErr.validationIssues.length).toBeGreaterThan(0);
      }
    });
  });

  describe('9. Unsupported Operations Safeguard', () => {
    it('does not expose unsupported endpoints such as hard delete or bulk delete', () => {
      expect(
        (conversationApi as unknown as Record<string, unknown>)['hardDeleteConversation'],
      ).toBeUndefined();
      expect(
        (conversationApi as unknown as Record<string, unknown>)['bulkDeleteConversations'],
      ).toBeUndefined();
      expect(
        (conversationApi as unknown as Record<string, unknown>)['getTurnStatus'],
      ).toBeUndefined();
    });
  });
});
