import {
  createConversationRequestSchema,
  reserveTurnRequestSchema,
  updateConversationTitleRequestSchema,
  cancelTurnRequestSchema,
  createConversationResponseSchema,
  reserveTurnResponseSchema,
  cancelTurnResponseSchema,
  conversationDetailResponseSchema,
  listConversationsResponseSchema,
  messageHistoryResponseSchema,
  conversationSourceCitationSchema,
  parseCreateConversationResponse,
  parseReserveTurnResponse,
  parseCancelTurnResponse,
  parseMessageHistoryResponse,
  parseConversationDetailResponse,
  parseListConversationsResponse,
  validateCreateConversationRequest,
  validateReserveTurnRequest,
} from '../schemas/conversation-contract.schemas';
import {
  mapBackendTurnStatusToFsm,
  mapBackendMessageStatusToFsm,
  mapBackendMessageStatusToLegacy,
  mapBackendRoleToLegacy,
  toDomainChatMessage,
  reconcileConversationViewState,
} from '../adapters/conversation-status.adapter';
import type { MessageResponse } from '../types/conversation-contract.types';
import { isValidGenerationTransition } from '../types/generation.types';

describe('AI-09.3 Frontend Typed Contracts & Runtime Schemas (FE.01.02)', () => {
  describe('1. Request Schemas & Validation', () => {
    it('validates a valid createConversationRequest', () => {
      const payload = {
        clientTurnId: 'turn_client_uuid_123',
        userPrompt: 'Explain cardiac autonomic modulation during recovery',
        title: 'Cardiac Modulation',
        metadata: { clientVersion: '2.4.0' },
      };
      const validated = validateCreateConversationRequest(payload);
      expect(validated.clientTurnId).toBe('turn_client_uuid_123');
      expect(validated.userPrompt).toBe('Explain cardiac autonomic modulation during recovery');
      expect(validated.title).toBe('Cardiac Modulation');
      expect(createConversationRequestSchema.parse(payload)).toEqual(validated);
    });

    it('trims whitespace and rejects empty userPrompt in createConversationRequest', () => {
      expect(() =>
        validateCreateConversationRequest({
          clientTurnId: 'turn_123',
          userPrompt: '   ',
        }),
      ).toThrow();
    });

    it('rejects clientTurnId exceeding 64 characters', () => {
      expect(() =>
        validateCreateConversationRequest({
          clientTurnId: 'a'.repeat(65),
          userPrompt: 'Valid prompt',
        }),
      ).toThrow();
    });

    it('validates a valid reserveTurnRequest without optional metadata', () => {
      const payload = {
        clientTurnId: 'turn_client_subsequent_001',
        userPrompt: 'What about anaerobic threshold velocity?',
      };
      const validated = validateReserveTurnRequest(payload);
      expect(validated.clientTurnId).toBe('turn_client_subsequent_001');
      expect(validated.userPrompt).toBe('What about anaerobic threshold velocity?');
      expect(validated.metadata).toBeUndefined();
      expect(reserveTurnRequestSchema.parse(payload)).toEqual(validated);
    });

    it('validates updateConversationTitleRequest and rejects empty title', () => {
      expect(updateConversationTitleRequestSchema.parse({ title: 'New Valid Title' })).toEqual({
        title: 'New Valid Title',
      });

      expect(() => updateConversationTitleRequestSchema.parse({ title: '   ' })).toThrow();
      expect(() =>
        updateConversationTitleRequestSchema.parse({ title: 'x'.repeat(256) }),
      ).toThrow();
    });

    it('validates cancelTurnRequest with optional reason', () => {
      expect(cancelTurnRequestSchema.parse({})).toEqual({});
      expect(cancelTurnRequestSchema.parse({ reason: 'User requested cancellation' })).toEqual({
        reason: 'User requested cancellation',
      });
      expect(() => cancelTurnRequestSchema.parse({ reason: 'x'.repeat(501) })).toThrow();
    });
  });

  describe('2. Response Schemas & Deserialization', () => {
    it('parses valid CreateConversationResponse', () => {
      const rawResponse = {
        conversationId: 'conv_01934f8a-1234-7abc-8901-abcdef012345',
        turnId: 'turn_01934f8a-5678-7def-8901-abcdef012345',
        clientTurnId: 'client_turn_abc_1',
        turnIndex: 1,
        userMessageId: 'msg_user_001',
        assistantAttemptId: 'msg_asst_001',
        title: 'Cardiac Modulation',
        turnStatus: 'PENDING',
        isIdempotentReplay: false,
        idempotencyOutcome: 'CREATED',
        createdAt: '2026-11-24T14:00:00.000Z',
      };
      const parsed = parseCreateConversationResponse(rawResponse);
      expect(parsed.conversationId).toBe(rawResponse.conversationId);
      expect(parsed.turnStatus).toBe('PENDING');
      expect(parsed.isIdempotentReplay).toBe(false);
      expect(parsed.idempotencyOutcome).toBe('CREATED');
      expect(createConversationResponseSchema.parse(rawResponse)).toEqual(parsed);
    });

    it('parses valid ReserveTurnResponse with idempotent recovery outcome', () => {
      const rawResponse = {
        conversationId: 'conv_123',
        turnId: 'turn_456',
        clientTurnId: 'client_turn_abc_2',
        turnIndex: 2,
        userMessageId: 'msg_user_002',
        assistantAttemptId: 'msg_asst_002',
        turnStatus: 'COMPLETED',
        isIdempotentReplay: true,
        idempotencyOutcome: 'EXISTING_RECOVERED',
        createdAt: '2026-11-24T14:05:00.000Z',
      };
      const parsed = parseReserveTurnResponse(rawResponse);
      expect(parsed.isIdempotentReplay).toBe(true);
      expect(parsed.idempotencyOutcome).toBe('EXISTING_RECOVERED');
      expect(reserveTurnResponseSchema.parse(rawResponse)).toEqual(parsed);
    });

    it('rejects invalid or invented turn statuses such as RECOVERING', () => {
      const invalid = {
        conversationId: 'conv_123',
        turnId: 'turn_456',
        clientTurnId: 'client_turn_1',
        turnIndex: 1,
        userMessageId: 'msg_1',
        assistantAttemptId: 'msg_2',
        turnStatus: 'RECOVERING', // Forbidden status!
        isIdempotentReplay: false,
        idempotencyOutcome: 'CREATED',
        createdAt: '2026-11-24T14:00:00.000Z',
      };
      expect(() => parseCreateConversationResponse(invalid)).toThrow();
    });

    it('parses CancelTurnResponse', () => {
      const raw = {
        conversationId: 'conv_123',
        turnId: 'turn_456',
        turnStatus: 'CANCELLED',
        assistantMessageId: 'msg_asst_456',
        isAlreadyCancelled: false,
        cancelledAt: '2026-11-24T14:10:00.000Z',
      };
      const parsed = parseCancelTurnResponse(raw);
      expect(parsed.turnStatus).toBe('CANCELLED');
      expect(parsed.isAlreadyCancelled).toBe(false);
      expect(cancelTurnResponseSchema.parse(raw)).toEqual(parsed);
    });

    it('parses ConversationDetailResponse with active turn and turns list', () => {
      const raw = {
        id: 'conv_detail_001',
        title: 'Exercise Physiology',
        turnCounter: 2,
        messageCounter: 4,
        lastActivityAt: '2026-11-24T14:20:00.000Z',
        createdAt: '2026-11-24T14:00:00.000Z',
        updatedAt: '2026-11-24T14:20:00.000Z',
        isArchived: false,
        activeTurnId: null,
        turns: [
          {
            id: 'turn_01',
            turnIndex: 1,
            status: 'COMPLETED',
            clientTurnId: 'client_01',
            activeAttemptId: 'msg_asst_01',
            activeAttemptNumber: 1,
            createdAt: '2026-11-24T14:00:00.000Z',
            completedAt: '2026-11-24T14:01:00.000Z',
          },
        ],
      };
      const parsed = parseConversationDetailResponse(raw);
      expect(parsed.turnCounter).toBe(2);
      expect(parsed.turns).toHaveLength(1);
      expect(parsed.turns?.[0]?.status).toBe('COMPLETED');
      expect(conversationDetailResponseSchema.parse(raw)).toEqual(parsed);
    });

    it('parses ListConversationsResponse with Base64URL cursor and hasMore', () => {
      const raw = {
        items: [
          {
            id: 'conv_1',
            title: 'Protocol Alpha',
            turnCounter: 3,
            lastActivityAt: '2026-11-24T14:30:00.000Z',
            createdAt: '2026-11-24T14:00:00.000Z',
            isArchived: false,
          },
        ],
        nextCursor: 'eyJ2IjoxLCJzIjoyLCJpZCI6ImNvbnZfMSJ9',
        hasMore: true,
      };
      const parsed = parseListConversationsResponse(raw);
      expect(parsed.items).toHaveLength(1);
      expect(parsed.hasMore).toBe(true);
      expect(parsed.nextCursor).toBe('eyJ2IjoxLCJzIjoyLCJpZCI6ImNvbnZfMSJ9');
      expect(listConversationsResponseSchema.parse(raw)).toEqual(parsed);
    });
  });

  describe('3. Message History & Source Attribution Validation', () => {
    it('parses canonical MessageHistoryResponse with grounded citations', () => {
      const rawHistory = {
        messages: [
          {
            id: 'msg_01',
            turnId: 'turn_01',
            role: 'USER',
            sequenceNumber: 1,
            attemptNumber: 1,
            isCanonical: true,
            status: 'SUCCESS',
            content: 'How does interval training increase VO2 max?',
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
            content: 'Interval training elevates maximal stroke volume and mitochondrial density.',
            sources: [
              {
                documentId: 'doc_vo2_max',
                documentTitle: 'Cardiovascular Exercise Physiology',
                chunkId: 'chunk_cardiac_01',
                pageNumber: 42,
                headingPath: ['Chapter 4', 'Mitochondrial Adaptation'],
                relevanceScore: 0.945,
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

      const parsed = parseMessageHistoryResponse(rawHistory);
      expect(parsed.messages).toHaveLength(2);
      expect(parsed.messages[0]?.role).toBe('USER');
      expect(parsed.messages[1]?.role).toBe('ASSISTANT');
      expect(parsed.messages[1]?.sources).toHaveLength(1);
      expect(parsed.messages[1]?.sources?.[0]?.relevanceScore).toBe(0.945);
      expect(parsed.hasMore).toBe(false);
    });

    it('rejects citations with invalid relevanceScore (< 0 or > 1)', () => {
      expect(() =>
        conversationSourceCitationSchema.parse({
          documentId: 'doc_1',
          documentTitle: 'Title',
          chunkId: 'chunk_1',
          relevanceScore: 1.2,
        }),
      ).toThrow();

      expect(() =>
        conversationSourceCitationSchema.parse({
          documentId: 'doc_1',
          documentTitle: 'Title',
          chunkId: 'chunk_1',
          relevanceScore: -0.1,
        }),
      ).toThrow();
    });

    it('rejects invalid conversation roles', () => {
      const invalidMsg = {
        id: 'msg_invalid',
        turnId: 'turn_01',
        role: 'MODERATOR', // Invalid role
        sequenceNumber: 1,
        attemptNumber: 1,
        isCanonical: true,
        status: 'SUCCESS',
        content: 'Testing',
        createdAt: '2026-11-24T14:00:00.000Z',
        completedAt: null,
      };
      expect(() =>
        messageHistoryResponseSchema.parse({
          messages: [invalidMsg],
          nextCursor: null,
          hasMore: false,
        }),
      ).toThrow();
    });
  });

  describe('4. Status Mapping & Adapter Behavior', () => {
    it('maps all 6 backend TurnStatus values to frontend FSM GenerationStatus', () => {
      expect(mapBackendTurnStatusToFsm('PENDING')).toBe('PENDING');
      expect(mapBackendTurnStatusToFsm('STREAMING')).toBe('STREAMING');
      expect(mapBackendTurnStatusToFsm('COMPLETED')).toBe('COMPLETED');
      expect(mapBackendTurnStatusToFsm('FAILED')).toBe('FAILED');
      expect(mapBackendTurnStatusToFsm('CANCELLED')).toBe('CANCELLED');
      expect(mapBackendTurnStatusToFsm('INTERRUPTED')).toBe('INTERRUPTED');
    });

    it('maps backend message status SUCCESS to frontend FSM COMPLETED', () => {
      expect(mapBackendMessageStatusToFsm('SUCCESS')).toBe('COMPLETED');
      expect(mapBackendMessageStatusToFsm('PENDING')).toBe('PENDING');
      expect(mapBackendMessageStatusToFsm('STREAMING')).toBe('STREAMING');
      expect(mapBackendMessageStatusToFsm('FAILED')).toBe('FAILED');
      expect(mapBackendMessageStatusToFsm('CANCELLED')).toBe('CANCELLED');
      expect(mapBackendMessageStatusToFsm('INTERRUPTED')).toBe('INTERRUPTED');
    });

    it('maps backend GenerationStatus to legacy AI-09.2 message delivery status', () => {
      expect(mapBackendMessageStatusToLegacy('PENDING')).toBe('pending');
      expect(mapBackendMessageStatusToLegacy('STREAMING')).toBe('pending');
      expect(mapBackendMessageStatusToLegacy('SUCCESS')).toBe('success');
      expect(mapBackendMessageStatusToLegacy('FAILED')).toBe('error');
      expect(mapBackendMessageStatusToLegacy('CANCELLED')).toBe('cancelled');
      expect(mapBackendMessageStatusToLegacy('INTERRUPTED')).toBe('interrupted');
    });

    it('maps backend uppercase roles to legacy lowercase MessageRole', () => {
      expect(mapBackendRoleToLegacy('USER')).toBe('user');
      expect(mapBackendRoleToLegacy('ASSISTANT')).toBe('assistant');
      expect(mapBackendRoleToLegacy('SYSTEM')).toBe('system');
    });

    it('converts canonical MessageResponse to legacy ChatMessage for UI compatibility', () => {
      const msgResponse: MessageResponse = {
        id: 'msg_canonical_01',
        turnId: 'turn_01',
        role: 'ASSISTANT',
        sequenceNumber: 2,
        attemptNumber: 1,
        isCanonical: true,
        status: 'SUCCESS',
        content: 'Mitochondrial adaptations enhance aerobic capacity.',
        sources: [
          {
            documentId: 'doc_1',
            documentTitle: 'Physiology Manual',
            chunkId: 'chunk_1',
            pageNumber: 15,
            headingPath: ['Chapter 1'],
            relevanceScore: 0.92,
            sourceStrategy: 'HYBRID',
          },
        ],
        createdAt: '2026-11-24T14:00:00.000Z',
        completedAt: '2026-11-24T14:00:04.000Z',
      };

      const domainMsg = toDomainChatMessage(msgResponse);
      expect(domainMsg.id).toBe('msg_canonical_01');
      expect(domainMsg.role).toBe('assistant');
      expect(domainMsg.status).toBe('success');
      expect(domainMsg.content).toBe(msgResponse.content);
      expect(domainMsg.grounded).toBe(true);
      expect(domainMsg.sources).toHaveLength(1);
      expect(domainMsg.sources?.[0]?.documentTitle).toBe('Physiology Manual');
    });

    it('reconciles conversation view state on reconnect or page refresh', () => {
      // 1. Quiescent conversation (no active turn) -> IDLE
      expect(reconcileConversationViewState({})).toBe('IDLE');
      expect(reconcileConversationViewState({ activeTurnId: null })).toBe('IDLE');

      // 2. Active turn in PENDING -> PENDING
      expect(
        reconcileConversationViewState({
          activeTurnId: 'turn_1',
          activeTurnStatus: 'PENDING',
        }),
      ).toBe('PENDING');

      // 3. Active turn in STREAMING -> STREAMING
      expect(
        reconcileConversationViewState({
          activeTurnId: 'turn_1',
          activeTurnStatus: 'STREAMING',
        }),
      ).toBe('STREAMING');

      // 4. Completed or failed turn -> IDLE
      expect(
        reconcileConversationViewState({
          activeTurnId: 'turn_1',
          activeTurnStatus: 'COMPLETED',
        }),
      ).toBe('IDLE');
      expect(
        reconcileConversationViewState({
          activeTurnId: 'turn_1',
          activeTurnStatus: 'FAILED',
        }),
      ).toBe('IDLE');

      // 5. Local submission in progress overrides idle -> PENDING
      expect(
        reconcileConversationViewState({
          isSubmitting: true,
        }),
      ).toBe('PENDING');
    });

    it('preserves valid generation FSM transitions when fed by mapped statuses', () => {
      // From IDLE to PENDING (turn reserved)
      const reservedFsm = mapBackendTurnStatusToFsm('PENDING');
      expect(isValidGenerationTransition('IDLE', reservedFsm)).toBe(true);

      // From PENDING to STREAMING
      const streamingFsm = mapBackendTurnStatusToFsm('STREAMING');
      expect(isValidGenerationTransition(reservedFsm, streamingFsm)).toBe(true);

      // From STREAMING to COMPLETED (assistant message SUCCESS)
      const completedFsm = mapBackendMessageStatusToFsm('SUCCESS');
      expect(isValidGenerationTransition(streamingFsm, completedFsm)).toBe(true);

      // From COMPLETED back to IDLE
      expect(isValidGenerationTransition(completedFsm, 'IDLE')).toBe(true);
    });
  });
});
