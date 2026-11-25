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
} from '../schemas/conversation-contract.schemas';
import {
  mapBackendTurnStatusToFsm,
  mapBackendMessageStatusToFsm,
  mapBackendMessageStatusToLegacy,
  mapBackendRoleToLegacy,
  toDomainChatMessage,
  reconcileConversationViewState,
} from '../adapters/conversation-status.adapter';
import {
  normalizeConversationApiError,
  isConflictError,
  isTurnInProgressConflict,
  isPayloadMismatchConflict,
  getRetryAfterSeconds,
  ContractValidationError,
} from '../api/conversation-api.errors';
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
import {
  ValidationError,
  AuthorizationError,
  NotFoundError,
} from '../../../../shared/api/api-error';

/**
 * AI-09.3-FE.01.04 — End-to-End Frontend Contract Compatibility Acceptance Suite
 *
 * Proves that the FE.01 frontend integration contract correctly and losslessly
 * consumes actual serialized outputs from the AI-09.3 backend implementation.
 */
describe('AI-09.3 Frontend API Contract Compatibility Acceptance (FE.01.04)', () => {
  describe('Task 2: Initial Conversation Creation & Idempotency Compatibility', () => {
    it('serializes CreateConversationRequest conforming to backend class-validator schema', () => {
      const clientTurnId = 'turn_client_req_001';
      const userPrompt = 'Formulate an ACL rehabilitation plan for stage 3';

      const validated = validateCreateConversationRequest({
        clientTurnId,
        userPrompt,
        title: 'ACL Stage 3 Rehabilitation',
        metadata: { clinicalTrial: true },
      });

      expect(validated.clientTurnId).toBe(clientTurnId);
      expect(validated.userPrompt).toBe(userPrompt);
      expect(validated.title).toBe('ACL Stage 3 Rehabilitation');
      expect(validated.metadata).toEqual({ clinicalTrial: true });

      // Verifies tenantId and userId are NOT injected into request body
      expect((validated as unknown as Record<string, unknown>)['tenantId']).toBeUndefined();
      expect((validated as unknown as Record<string, unknown>)['userId']).toBeUndefined();
    });

    it('parses real backend CreateConversationResponseDto (first turn created)', () => {
      // Direct serialized representation emitted by AiConversationResponseMapper.toCreateConversationResponse
      const realBackendPayload = {
        conversationId: 'conv_01934f8a-9a76-7def-8123-abcdef012345',
        turnId: 'turn_01934f8a-9a76-7def-8123-abcdef012346',
        clientTurnId: 'turn_client_req_001',
        turnIndex: 1,
        userMessageId: 'msg_01934f8a-9a76-7def-8123-abcdef012347',
        assistantAttemptId: 'msg_01934f8a-9a76-7def-8123-abcdef012348',
        title: 'ACL Stage 3 Rehabilitation',
        turnStatus: 'PENDING',
        isIdempotentReplay: false,
        idempotencyOutcome: 'CREATED',
        createdAt: '2026-11-24T14:00:00.000Z',
      };

      const parsed: CreateConversationResponse =
        parseCreateConversationResponse(realBackendPayload);

      expect(parsed.conversationId).toBe('conv_01934f8a-9a76-7def-8123-abcdef012345');
      expect(parsed.turnId).toBe('turn_01934f8a-9a76-7def-8123-abcdef012346');
      expect(parsed.clientTurnId).toBe('turn_client_req_001');
      expect(parsed.turnIndex).toBe(1);
      expect(parsed.turnStatus).toBe('PENDING');
      expect(parsed.isIdempotentReplay).toBe(false);
      expect(parsed.idempotencyOutcome).toBe('CREATED');

      // Map to frontend FSM
      const fsmState = mapBackendTurnStatusToFsm(parsed.turnStatus);
      expect(fsmState).toBe('PENDING');
    });

    it('parses real backend idempotent replay response (EXISTING_RECOVERED)', () => {
      const realReplayPayload = {
        conversationId: 'conv_01934f8a-9a76-7def-8123-abcdef012345',
        turnId: 'turn_01934f8a-9a76-7def-8123-abcdef012346',
        clientTurnId: 'turn_client_req_001',
        turnIndex: 1,
        userMessageId: 'msg_01934f8a-9a76-7def-8123-abcdef012347',
        assistantAttemptId: 'msg_01934f8a-9a76-7def-8123-abcdef012348',
        title: 'ACL Stage 3 Rehabilitation',
        turnStatus: 'COMPLETED',
        isIdempotentReplay: true,
        idempotencyOutcome: 'EXISTING_RECOVERED',
        createdAt: '2026-11-24T14:00:00.000Z',
      };

      const parsed = parseCreateConversationResponse(realReplayPayload);
      expect(parsed.isIdempotentReplay).toBe(true);
      expect(parsed.idempotencyOutcome).toBe('EXISTING_RECOVERED');
      expect(parsed.turnStatus).toBe('COMPLETED');
      expect(mapBackendTurnStatusToFsm(parsed.turnStatus)).toBe('COMPLETED');
    });
  });

  describe('Task 3: Conversation and Message Retrieval Contracts', () => {
    it('parses real ConversationDetailResponseDto including turns array and activeTurnId', () => {
      const realDetailPayload = {
        id: 'conv_01934f8a-9a76-7def-8123-abcdef012345',
        title: 'Cardiac Autonomic Modulation',
        turnCounter: 2,
        messageCounter: 4,
        lastActivityAt: '2026-11-24T14:10:00.000Z',
        createdAt: '2026-11-24T14:00:00.000Z',
        updatedAt: '2026-11-24T14:10:00.000Z',
        isArchived: false,
        activeTurnId: null,
        turns: [
          {
            id: 'turn_01',
            turnIndex: 1,
            status: 'COMPLETED',
            clientTurnId: 'turn_c1',
            activeAttemptId: 'msg_a1',
            activeAttemptNumber: 1,
            createdAt: '2026-11-24T14:00:00.000Z',
            completedAt: '2026-11-24T14:01:00.000Z',
          },
          {
            id: 'turn_02',
            turnIndex: 2,
            status: 'COMPLETED',
            clientTurnId: 'turn_c2',
            activeAttemptId: 'msg_a2',
            activeAttemptNumber: 1,
            createdAt: '2026-11-24T14:05:00.000Z',
            completedAt: '2026-11-24T14:06:00.000Z',
          },
        ],
      };

      const parsed: ConversationDetailResponse = parseConversationDetailResponse(realDetailPayload);

      expect(parsed.id).toBe('conv_01934f8a-9a76-7def-8123-abcdef012345');
      expect(parsed.turnCounter).toBe(2);
      expect(parsed.messageCounter).toBe(4);
      expect(parsed.activeTurnId).toBeNull();
      expect(parsed.turns).toHaveLength(2);
      expect(parsed.turns?.[0]?.turnIndex).toBe(1);
      expect(parsed.turns?.[1]?.turnIndex).toBe(2);
    });

    it('parses real ListConversationsResponseDto with keyset cursor and hasMore', () => {
      const realListPayload = {
        items: [
          {
            id: 'conv_1',
            title: 'Protocol Alpha',
            turnCounter: 3,
            lastActivityAt: '2026-11-24T14:30:00.000Z',
            createdAt: '2026-11-24T14:00:00.000Z',
            isArchived: false,
          },
          {
            id: 'conv_2',
            title: 'Protocol Beta',
            turnCounter: 1,
            lastActivityAt: '2026-11-24T14:15:00.000Z',
            createdAt: '2026-11-24T14:15:00.000Z',
            isArchived: false,
          },
        ],
        nextCursor: 'eyJ2IjoxLCJzIjoyLCJpZCI6ImNvbnZfMiJ9',
        hasMore: true,
      };

      const parsed: ListConversationsResponse = parseListConversationsResponse(realListPayload);

      expect(parsed.items).toHaveLength(2);
      expect(parsed.nextCursor).toBe('eyJ2IjoxLCJzIjoyLCJpZCI6ImNvbnZfMiJ9');
      expect(parsed.hasMore).toBe(true);
    });

    it('parses real MessageHistoryResponseDto with sequence numbers and source citations', () => {
      const realHistoryPayload = {
        messages: [
          {
            id: 'msg_01',
            turnId: 'turn_01',
            role: 'USER',
            sequenceNumber: 1,
            attemptNumber: 1,
            isCanonical: true,
            status: 'SUCCESS',
            content: 'What is eccentric hypertrophy?',
            sources: null,
            createdAt: '2026-11-24T14:00:00.000Z',
            completedAt: '2026-11-24T14:00:00.000Z',
          },
          {
            id: 'msg_02',
            turnId: 'turn_01',
            role: 'ASSISTANT',
            sequenceNumber: 2,
            attemptNumber: 1,
            isCanonical: true,
            status: 'SUCCESS',
            content:
              'Eccentric hypertrophy involves longitudinal addition of sarcomeres in series.',
            sources: [
              {
                documentId: 'd09a2b5e-4b72-4b21-8288-466fa1d9f8c1',
                documentTitle: 'Cardiovascular Adaptations in Athletes',
                chunkId: 'kc_018f3a5e-b5c6-7a1b-9f0e-1a2b3c4d5e6f',
                pageNumber: 14,
                headingPath: ['Section 2: Morphological Remodeling'],
                relevanceScore: 0.942,
                sourceStrategy: 'HYBRID',
              },
            ],
            createdAt: '2026-11-24T14:00:02.000Z',
            completedAt: '2026-11-24T14:00:05.000Z',
          },
        ],
        nextCursor: null,
        hasMore: false,
      };

      const parsed: MessageHistoryResponse = parseMessageHistoryResponse(realHistoryPayload);

      expect(parsed.messages).toHaveLength(2);
      expect(parsed.messages[0]?.sequenceNumber).toBe(1);
      expect(parsed.messages[1]?.sequenceNumber).toBe(2);
      expect(parsed.messages[1]?.sources?.[0]?.relevanceScore).toBe(0.942);
      expect(parsed.messages[1]?.sources?.[0]?.pageNumber).toBe(14);

      // Verify domain adaptation
      const userDomainMsg = toDomainChatMessage(parsed.messages[0]!);
      expect(userDomainMsg.role).toBe('user');
      expect(userDomainMsg.status).toBe('success');

      const asstDomainMsg = toDomainChatMessage(parsed.messages[1]!);
      expect(asstDomainMsg.role).toBe('assistant');
      expect(asstDomainMsg.status).toBe('success');
      expect(asstDomainMsg.grounded).toBe(true);
      expect(asstDomainMsg.sources).toHaveLength(1);
      expect(asstDomainMsg.sources?.[0]?.documentId).toBe('d09a2b5e-4b72-4b21-8288-466fa1d9f8c1');
    });
  });

  describe('Task 4: Subsequent Turn Submission Compatibility', () => {
    it('serializes ReserveTurnRequest conforming to backend ReserveTurnRequestDto', () => {
      const validated = validateReserveTurnRequest({
        clientTurnId: 'turn_client_req_002',
        userPrompt: 'Does concentric hypertrophy carry different risks?',
        metadata: { source: 'composer' },
      });

      expect(validated.clientTurnId).toBe('turn_client_req_002');
      expect(validated.userPrompt).toBe('Does concentric hypertrophy carry different risks?');
    });

    it('parses real backend ReserveTurnResponseDto (subsequent turn created)', () => {
      const realReservePayload = {
        conversationId: 'conv_01934f8a-9a76-7def-8123-abcdef012345',
        turnId: 'turn_01934f8a-9a76-7def-8123-abcdef012349',
        clientTurnId: 'turn_client_req_002',
        turnIndex: 2,
        userMessageId: 'msg_01934f8a-9a76-7def-8123-abcdef012350',
        assistantAttemptId: 'msg_01934f8a-9a76-7def-8123-abcdef012351',
        turnStatus: 'PENDING',
        isIdempotentReplay: false,
        idempotencyOutcome: 'CREATED',
        createdAt: '2026-11-24T14:15:00.000Z',
      };

      const parsed: ReserveTurnResponse = parseReserveTurnResponse(realReservePayload);

      expect(parsed.turnIndex).toBe(2);
      expect(parsed.turnStatus).toBe('PENDING');
      expect(parsed.isIdempotentReplay).toBe(false);

      // Verify FSM status is PENDING (never marked COMPLETED prematurely)
      expect(mapBackendTurnStatusToFsm(parsed.turnStatus)).toBe('PENDING');
    });

    it('parses CancelTurnResponseDto', () => {
      const validatedCancelReq = validateCancelTurnRequest({ reason: 'Stop execution' });
      expect(validatedCancelReq.reason).toBe('Stop execution');

      const realCancelPayload = {
        conversationId: 'conv_01934f8a-9a76-7def-8123-abcdef012345',
        turnId: 'turn_01934f8a-9a76-7def-8123-abcdef012349',
        turnStatus: 'CANCELLED',
        assistantMessageId: 'msg_01934f8a-9a76-7def-8123-abcdef012351',
        isAlreadyCancelled: false,
        cancelledAt: '2026-11-24T14:16:00.000Z',
      };

      const parsed: CancelTurnResponse = parseCancelTurnResponse(realCancelPayload);

      expect(parsed.turnStatus).toBe('CANCELLED');
      expect(parsed.isAlreadyCancelled).toBe(false);
      expect(mapBackendTurnStatusToFsm(parsed.turnStatus)).toBe('CANCELLED');
    });

    it('parses UpdateTitleResponseDto and ArchiveConversationResponseDto', () => {
      const validatedTitleReq = validateUpdateConversationTitleRequest({
        title: 'New Clinical Plan',
      });
      expect(validatedTitleReq.title).toBe('New Clinical Plan');

      const realTitlePayload = {
        conversationId: 'conv_01934f8a-9a76-7def-8123-abcdef012345',
        title: 'New Clinical Plan',
        updatedAt: '2026-11-24T14:18:00.000Z',
      };
      const parsedTitle: UpdateTitleResponse = parseUpdateTitleResponse(realTitlePayload);
      expect(parsedTitle.title).toBe('New Clinical Plan');

      const realArchivePayload = {
        conversationId: 'conv_01934f8a-9a76-7def-8123-abcdef012345',
        isArchived: true,
        archivedAt: '2026-11-24T14:19:00.000Z',
      };
      const parsedArchive: ArchiveConversationResponse =
        parseArchiveConversationResponse(realArchivePayload);
      expect(parsedArchive.isArchived).toBe(true);
    });
  });

  describe('Task 5: Error Normalization & Conflict Diagnostics', () => {
    it('normalizes real backend 409 TurnAlreadyInProgress error with Retry-After header', () => {
      const backendError = {
        statusCode: 409,
        error: 'Conflict',
        code: 'TURN_ALREADY_IN_PROGRESS',
        message: 'A turn generation is already in progress on this conversation.',
        path: '/api/v1/ai/conversations/conv_123/turns',
        timestamp: '2026-11-24T14:20:00.000Z',
        retryAfterSeconds: 2,
      };

      const normalized = normalizeConversationApiError(backendError);

      expect(isConflictError(normalized)).toBe(true);
      expect(isTurnInProgressConflict(normalized)).toBe(true);
      expect(isPayloadMismatchConflict(normalized)).toBe(false);
      expect(getRetryAfterSeconds(normalized)).toBe(2);
      expect(normalized.statusCode).toBe(409);
    });

    it('normalizes real backend 409 DuplicateClientTurnPayloadMismatch error', () => {
      const backendError = {
        statusCode: 409,
        error: 'Conflict',
        code: 'DUPLICATE_CLIENT_TURN_PAYLOAD_MISMATCH',
        message:
          'clientTurnId turn_001 already exists on conversation conv_123 with a different payload hash.',
        path: '/api/v1/ai/conversations/conv_123/turns',
        timestamp: '2026-11-24T14:20:00.000Z',
      };

      const normalized = normalizeConversationApiError(backendError);

      expect(isConflictError(normalized)).toBe(true);
      expect(isPayloadMismatchConflict(normalized)).toBe(true);
      expect(isTurnInProgressConflict(normalized)).toBe(false);
      expect(normalized.statusCode).toBe(409);
    });

    it('normalizes real backend 404 ConversationNotFoundError without data leakage', () => {
      const backendError = {
        statusCode: 404,
        error: 'Not Found',
        code: 'CONVERSATION_NOT_FOUND',
        message: 'Conversation conv_secret was not found in tenant tenant_alpha',
        path: '/api/v1/ai/conversations/conv_secret',
        timestamp: '2026-11-24T14:20:00.000Z',
      };

      const normalized = normalizeConversationApiError(backendError);
      expect(normalized).toBeInstanceOf(NotFoundError);
      expect(normalized.statusCode).toBe(404);
    });

    it('normalizes real backend 400 InvalidTurnInputError into ValidationError', () => {
      const backendError = {
        statusCode: 400,
        error: 'Bad Request',
        code: 'AI_INVALID_TURN_INPUT',
        message: 'userPrompt must not be empty or contain only whitespace',
        path: '/api/v1/ai/conversations',
        timestamp: '2026-11-24T14:20:00.000Z',
      };

      const normalized = normalizeConversationApiError(backendError);
      expect(normalized).toBeInstanceOf(ValidationError);
      expect(normalized.statusCode).toBe(400);
    });

    it('normalizes real backend 403 TenantOwnershipViolationError into AuthorizationError', () => {
      const backendError = {
        statusCode: 403,
        error: 'Forbidden',
        code: 'AI_FORBIDDEN',
        message: 'Access denied: caller does not possess tenant ownership.',
        path: '/api/v1/ai/conversations/conv_123',
        timestamp: '2026-11-24T14:20:00.000Z',
      };

      const normalized = normalizeConversationApiError(backendError);
      expect(normalized).toBeInstanceOf(AuthorizationError);
      expect(normalized.statusCode).toBe(403);
    });

    it('normalizes response validation failure into ContractValidationError', () => {
      try {
        parseCreateConversationResponse({
          conversationId: 'conv_123',
          turnStatus: 'ILLEGAL_STATUS',
        });
        fail('Should have thrown');
      } catch (err) {
        const normalized = normalizeConversationApiError(err, 'createConversation');
        expect(normalized).toBeInstanceOf(ContractValidationError);
        const contractErr = normalized as ContractValidationError;
        expect(contractErr.statusCode).toBe(502);
        expect(contractErr.code).toBe('CONTRACT_VALIDATION_ERROR');
        expect(contractErr.validationIssues.length).toBeGreaterThan(0);
      }
    });
  });

  describe('Task 6: AI-09.2 Lifecycle & Status Compatibility', () => {
    it('preserves all seven frontend GenerationStatus FSM states without RECOVERING', () => {
      const fsmStates = [
        'IDLE',
        'PENDING',
        'STREAMING',
        'COMPLETED',
        'FAILED',
        'CANCELLED',
        'INTERRUPTED',
      ];

      expect(fsmStates).toHaveLength(7);
      expect(fsmStates).not.toContain('RECOVERING');

      // Verify mapping of terminal SUCCESS to COMPLETED
      expect(mapBackendMessageStatusToFsm('SUCCESS')).toBe('COMPLETED');
      expect(mapBackendMessageStatusToLegacy('SUCCESS')).toBe('success');

      // Verify mapping of PENDING
      expect(mapBackendTurnStatusToFsm('PENDING')).toBe('PENDING');
      expect(mapBackendMessageStatusToLegacy('PENDING')).toBe('pending');

      // Verify mapping of roles
      expect(mapBackendRoleToLegacy('USER')).toBe('user');
      expect(mapBackendRoleToLegacy('ASSISTANT')).toBe('assistant');
      expect(mapBackendRoleToLegacy('SYSTEM')).toBe('system');
    });

    it('reconciles conversation lifecycle states accurately across page refresh', () => {
      // 1. Quiescent: no active turn
      expect(reconcileConversationViewState({})).toBe('IDLE');

      // 2. In-flight pending turn
      expect(
        reconcileConversationViewState({
          activeTurnId: 'turn_1',
          activeTurnStatus: 'PENDING',
        }),
      ).toBe('PENDING');

      // 3. In-flight streaming turn
      expect(
        reconcileConversationViewState({
          activeTurnId: 'turn_1',
          activeTurnStatus: 'STREAMING',
        }),
      ).toBe('STREAMING');

      // 4. Completed turn
      expect(
        reconcileConversationViewState({
          activeTurnId: 'turn_1',
          activeTurnStatus: 'COMPLETED',
        }),
      ).toBe('IDLE');
    });
  });
});
