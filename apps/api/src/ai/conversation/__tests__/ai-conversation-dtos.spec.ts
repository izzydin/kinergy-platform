import { ValidationPipe, BadRequestException } from '@nestjs/common';
import {
  CreateConversationRequestDto,
  ReserveTurnRequestDto,
  UpdateConversationTitleRequestDto,
  ListConversationsQueryDto,
  GetMessageHistoryQueryDto,
  CreateConversationResponseDto,
  ReserveTurnResponseDto,
  ConversationDetailResponseDto,
  ListConversationsResponseDto,
  MessageHistoryResponseDto,
  UpdateTitleResponseDto,
  ArchiveConversationResponseDto,
} from '../dtos/ai-conversation.dtos';
import { AiConversationResponseMapper } from '../mappers/ai-conversation-response.mapper';
import {
  ConversationListCursor,
  MessageHistoryCursor,
  TurnStatus,
  ConversationRole,
  GenerationStatus,
} from '@kinergy-platform/core';
import { GlobalSanitizationValidationPipe } from '../../../common/pipes/global-sanitization-validation.pipe';

describe('AI-09.3-BE.05.02 — Request DTOs, Response Contracts & Validation Pipeline', () => {
  // Global pipeline matching main.ts configuration
  let validationPipe: ValidationPipe;
  let sanitizationPipe: GlobalSanitizationValidationPipe;

  beforeAll(() => {
    validationPipe = new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    });

    sanitizationPipe = new GlobalSanitizationValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    });
  });

  // ==========================================
  // 1. CreateConversationRequestDto Tests
  // ==========================================
  describe('CreateConversationRequestDto Validation', () => {
    it('1. accepts a completely valid creation request', async () => {
      const payload = {
        clientTurnId: 'turn_client_98a76b5c',
        userPrompt: 'What are the physiological markers of VO2 max improvement?',
        title: 'VO2 Max Physiological Analysis',
        metadata: { source: 'clinical_portal', protocolVersion: '2.1' },
      };

      const result = (await validationPipe.transform(payload, {
        type: 'body',
        metatype: CreateConversationRequestDto,
      })) as CreateConversationRequestDto;

      expect(result).toBeInstanceOf(CreateConversationRequestDto);
      expect(result.clientTurnId).toBe(payload.clientTurnId);
      expect(result.userPrompt).toBe(payload.userPrompt);
      expect(result.title).toBe(payload.title);
      expect(result.metadata).toEqual(payload.metadata);
    });

    it('2. accepts a valid creation request without optional title and metadata', async () => {
      const payload = {
        clientTurnId: 'urn:uuid:e1388ec4-54c7-431f-9da7-2cf3b2a0c641',
        userPrompt: 'Simple prompt inquiry',
      };

      const result = (await validationPipe.transform(payload, {
        type: 'body',
        metatype: CreateConversationRequestDto,
      })) as CreateConversationRequestDto;

      expect(result.clientTurnId).toBe(payload.clientTurnId);
      expect(result.userPrompt).toBe(payload.userPrompt);
      expect(result.title).toBeUndefined();
      expect(result.metadata).toBeUndefined();
    });

    it('3. rejects request when clientTurnId is missing', async () => {
      const payload = {
        userPrompt: 'Prompt with missing turn ID',
      };

      await expect(
        validationPipe.transform(payload, {
          type: 'body',
          metatype: CreateConversationRequestDto,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('4. rejects request when clientTurnId is whitespace only', async () => {
      const payload = {
        clientTurnId: '   ',
        userPrompt: 'Valid prompt',
      };

      await expect(
        validationPipe.transform(payload, {
          type: 'body',
          metatype: CreateConversationRequestDto,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('5. rejects request when clientTurnId exceeds maximum length of 64 characters', async () => {
      const payload = {
        clientTurnId: 'a'.repeat(65),
        userPrompt: 'Valid prompt',
      };

      await expect(
        validationPipe.transform(payload, {
          type: 'body',
          metatype: CreateConversationRequestDto,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('6. rejects request when userPrompt is missing', async () => {
      const payload = {
        clientTurnId: 'turn_client_1',
      };

      await expect(
        validationPipe.transform(payload, {
          type: 'body',
          metatype: CreateConversationRequestDto,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('7. rejects request when userPrompt is empty or contains only whitespace', async () => {
      const payload = {
        clientTurnId: 'turn_client_1',
        userPrompt: '   \n \t  ',
      };

      await expect(
        validationPipe.transform(payload, {
          type: 'body',
          metatype: CreateConversationRequestDto,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('8. rejects request when userPrompt exceeds maximum allowable length of 4000 characters', async () => {
      const payload = {
        clientTurnId: 'turn_client_1',
        userPrompt: 'x'.repeat(4001),
      };

      await expect(
        validationPipe.transform(payload, {
          type: 'body',
          metatype: CreateConversationRequestDto,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('9. rejects request when userPrompt is a non-string type (number or boolean)', async () => {
      const payload = {
        clientTurnId: 'turn_client_1',
        userPrompt: 12345,
      };

      await expect(
        validationPipe.transform(payload, {
          type: 'body',
          metatype: CreateConversationRequestDto,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('10. rejects request when metadata is an array or primitive instead of a JSON object', async () => {
      const payload = {
        clientTurnId: 'turn_client_1',
        userPrompt: 'Valid prompt',
        metadata: ['invalid', 'array', 'format'],
      };

      await expect(
        validationPipe.transform(payload, {
          type: 'body',
          metatype: CreateConversationRequestDto,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('11. rejects request when title is provided as an empty or whitespace string', async () => {
      const payload = {
        clientTurnId: 'turn_client_1',
        userPrompt: 'Valid prompt',
        title: '   ',
      };

      await expect(
        validationPipe.transform(payload, {
          type: 'body',
          metatype: CreateConversationRequestDto,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('12. rejects request when title exceeds maximum domain length of 255 characters', async () => {
      const payload = {
        clientTurnId: 'turn_client_1',
        userPrompt: 'Valid prompt',
        title: 't'.repeat(256),
      };

      await expect(
        validationPipe.transform(payload, {
          type: 'body',
          metatype: CreateConversationRequestDto,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('13. rejects request containing unexpected / unwhitelisted properties', async () => {
      const payload = {
        clientTurnId: 'turn_client_1',
        userPrompt: 'Valid prompt',
        tenantId: 'attacker_tenant', // Forbidden client attempt to spoof tenant
        role: 'ADMIN',
      };

      await expect(
        validationPipe.transform(payload, {
          type: 'body',
          metatype: CreateConversationRequestDto,
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // ==========================================
  // 2. ReserveTurnRequestDto Tests
  // ==========================================
  describe('ReserveTurnRequestDto Validation', () => {
    it('1. accepts a valid turn reservation request', async () => {
      const payload = {
        clientTurnId: 'turn_client_subsequent_02',
        userPrompt: 'Follow-up query on cardiovascular recovery times',
        metadata: { contextSession: 'cardio_2026' },
      };

      const result = (await validationPipe.transform(payload, {
        type: 'body',
        metatype: ReserveTurnRequestDto,
      })) as ReserveTurnRequestDto;

      expect(result).toBeInstanceOf(ReserveTurnRequestDto);
      expect(result.clientTurnId).toBe(payload.clientTurnId);
      expect(result.userPrompt).toBe(payload.userPrompt);
      expect(result.metadata).toEqual(payload.metadata);
    });

    it('2. rejects reservation request when userPrompt is whitespace only', async () => {
      const payload = {
        clientTurnId: 'turn_client_02',
        userPrompt: '     ',
      };

      await expect(
        validationPipe.transform(payload, {
          type: 'body',
          metatype: ReserveTurnRequestDto,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('3. rejects reservation request with arbitrary lifecycle or generation statuses', async () => {
      const payload = {
        clientTurnId: 'turn_client_02',
        userPrompt: 'Valid prompt',
        status: 'COMPLETED', // Client trying to force completed state
        isCanonical: true,
      };

      await expect(
        validationPipe.transform(payload, {
          type: 'body',
          metatype: ReserveTurnRequestDto,
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // ==========================================
  // 3. UpdateConversationTitleRequestDto Tests
  // ==========================================
  describe('UpdateConversationTitleRequestDto Validation', () => {
    it('1. accepts a valid title update request', async () => {
      const payload = {
        title: 'ACL Protocol - Week 4 Assessment',
      };

      const result = (await validationPipe.transform(payload, {
        type: 'body',
        metatype: UpdateConversationTitleRequestDto,
      })) as UpdateConversationTitleRequestDto;

      expect(result.title).toBe(payload.title);
    });

    it('2. rejects blank or whitespace-only title update', async () => {
      const payload = {
        title: '   ',
      };

      await expect(
        validationPipe.transform(payload, {
          type: 'body',
          metatype: UpdateConversationTitleRequestDto,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('3. rejects oversized title update exceeding 255 characters', async () => {
      const payload = {
        title: 'T'.repeat(256),
      };

      await expect(
        validationPipe.transform(payload, {
          type: 'body',
          metatype: UpdateConversationTitleRequestDto,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('4. rejects unexpected fields in title update', async () => {
      const payload = {
        title: 'Valid Title',
        isArchived: true, // Forbidden extra property
      };

      await expect(
        validationPipe.transform(payload, {
          type: 'body',
          metatype: UpdateConversationTitleRequestDto,
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // ==========================================
  // 4. ListConversationsQueryDto Tests
  // ==========================================
  describe('ListConversationsQueryDto Pagination & Cursor Validation', () => {
    it('1. accepts empty query and applies default transformation', async () => {
      const query = {};

      const result = (await validationPipe.transform(query, {
        type: 'query',
        metatype: ListConversationsQueryDto,
      })) as ListConversationsQueryDto;

      expect(result.limit).toBeUndefined();
      expect(result.cursor).toBeUndefined();
      expect(result.includeArchived).toBeUndefined();
    });

    it('2. accepts valid pagination parameters and transforms types', async () => {
      const validCursor = ConversationListCursor.create(
        new Date('2026-11-23T12:00:00.000Z'),
        'conv_123',
      ).encode();

      const query = {
        cursor: validCursor,
        limit: '25',
        includeArchived: 'true',
      };

      const result = (await validationPipe.transform(query, {
        type: 'query',
        metatype: ListConversationsQueryDto,
      })) as ListConversationsQueryDto;

      expect(result.cursor).toBe(validCursor);
      expect(result.limit).toBe(25);
      expect(result.includeArchived).toBe(true);
    });

    it('3. rejects limit less than 1', async () => {
      const query = { limit: '0' };

      await expect(
        validationPipe.transform(query, {
          type: 'query',
          metatype: ListConversationsQueryDto,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('4. rejects limit greater than maximum allowed (100)', async () => {
      const query = { limit: '101' };

      await expect(
        validationPipe.transform(query, {
          type: 'query',
          metatype: ListConversationsQueryDto,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('5. rejects non-integer limit', async () => {
      const query = { limit: '12.5' };

      await expect(
        validationPipe.transform(query, {
          type: 'query',
          metatype: ListConversationsQueryDto,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('6. rejects malformed conversation list cursor', async () => {
      const query = { cursor: 'malformed_non_base64_json_string!@#' };

      await expect(
        validationPipe.transform(query, {
          type: 'query',
          metatype: ListConversationsQueryDto,
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // ==========================================
  // 5. GetMessageHistoryQueryDto Tests
  // ==========================================
  describe('GetMessageHistoryQueryDto Sequence-Based Cursor Validation', () => {
    it('1. accepts valid sequence-based cursor and limit', async () => {
      const validSequenceCursor = MessageHistoryCursor.create(10, 'msg_456').encode();

      const query = {
        cursor: validSequenceCursor,
        limit: '50',
      };

      const result = (await validationPipe.transform(query, {
        type: 'query',
        metatype: GetMessageHistoryQueryDto,
      })) as GetMessageHistoryQueryDto;

      expect(result.cursor).toBe(validSequenceCursor);
      expect(result.limit).toBe(50);
    });

    it('2. rejects mutable activity-timestamp cursor for message history', async () => {
      // Activity cursor encodes (lastActivityAt, id), NOT (sequenceNumber, id)
      const activityCursor = ConversationListCursor.create(
        new Date('2026-11-23T12:00:00.000Z'),
        'conv_123',
      ).encode();

      const query = {
        cursor: activityCursor,
      };

      await expect(
        validationPipe.transform(query, {
          type: 'query',
          metatype: GetMessageHistoryQueryDto,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('3. rejects malformed message history cursor string', async () => {
      const query = {
        cursor: 'not_a_valid_sequence_cursor',
      };

      await expect(
        validationPipe.transform(query, {
          type: 'query',
          metatype: GetMessageHistoryQueryDto,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('4. rejects message history limit greater than 100', async () => {
      const query = {
        limit: '500',
      };

      await expect(
        validationPipe.transform(query, {
          type: 'query',
          metatype: GetMessageHistoryQueryDto,
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // ==========================================
  // 6. Global Sanitization Pipe Integration
  // ==========================================
  describe('GlobalSanitizationValidationPipe Sanitization & Pipeline Behavior', () => {
    it('1. strips dangerous control characters from inputs', async () => {
      const payload = {
        clientTurnId: 'turn_client_01',
        userPrompt: 'Valid prompt with null byte\u0000 stripped',
      };

      const result = (await sanitizationPipe.transform(payload, {
        type: 'body',
        metatype: CreateConversationRequestDto,
      })) as CreateConversationRequestDto;

      expect(result.userPrompt).toBe('Valid prompt with null byte stripped');
    });

    it('2. preserves valid content without altering payload semantics', async () => {
      const payload = {
        clientTurnId: 'turn_client_clean',
        userPrompt: 'Line 1\nLine 2\tIndented text',
      };

      const result = (await sanitizationPipe.transform(payload, {
        type: 'body',
        metatype: CreateConversationRequestDto,
      })) as CreateConversationRequestDto;

      expect(result.userPrompt).toBe('Line 1\nLine 2\tIndented text');
    });
  });

  // ==========================================
  // 7. Response DTOs & Mappers Exposure Policy
  // ==========================================
  describe('AiConversationResponseMapper & Exposure Guarantees', () => {
    it('1. maps CreateConversationWithInitialTurnResult without leaking internal payloadHash or lease tokens', () => {
      const useCaseResult = {
        conversationId: 'conv_123',
        turnId: 'turn_123',
        clientTurnId: 'client_turn_abc',
        turnIndex: 1,
        userMessageId: 'msg_u_1',
        assistantAttemptId: 'msg_a_1',
        title: 'Cardiac Rehabilitation',
        turnStatus: TurnStatus.PENDING,
        isIdempotentReplay: false,
        idempotencyOutcome: 'CREATED' as const,
        createdAt: '2026-11-23T14:00:00.000Z',
      };

      const response = AiConversationResponseMapper.toCreateConversationResponse(useCaseResult);

      expect(response).toBeInstanceOf(CreateConversationResponseDto);
      expect(response.conversationId).toBe('conv_123');
      expect(response.turnId).toBe('turn_123');
      expect(response.clientTurnId).toBe('client_turn_abc');
      expect(response.turnIndex).toBe(1);
      expect(response.userMessageId).toBe('msg_u_1');
      expect(response.assistantAttemptId).toBe('msg_a_1');
      expect(response.title).toBe('Cardiac Rehabilitation');
      expect(response.turnStatus).toBe(TurnStatus.PENDING);
      expect(response.isIdempotentReplay).toBe(false);
      expect(response.idempotencyOutcome).toBe('CREATED');
      expect(response.createdAt).toBe('2026-11-23T14:00:00.000Z');

      // Verify strict exclusion of internal fields
      const raw = response as unknown as Record<string, unknown>;
      expect(raw['payloadHash']).toBeUndefined();
      expect(raw['idempotencyPayloadHash']).toBeUndefined();
      expect(raw['leaseToken']).toBeUndefined();
      expect(raw['txId']).toBeUndefined();
    });

    it('2. maps ReserveConversationTurnResult without internal lease or transaction IDs', () => {
      const useCaseResult = {
        conversationId: 'conv_123',
        turnId: 'turn_456',
        clientTurnId: 'client_turn_def',
        turnIndex: 2,
        userMessageId: 'msg_u_2',
        assistantAttemptId: 'msg_a_2',
        turnStatus: TurnStatus.PENDING,
        isIdempotentReplay: true,
        idempotencyOutcome: 'EXISTING_RECOVERED' as const,
        createdAt: '2026-11-23T14:05:00.000Z',
      };

      const response = AiConversationResponseMapper.toReserveTurnResponse(useCaseResult);

      expect(response).toBeInstanceOf(ReserveTurnResponseDto);
      expect(response.conversationId).toBe('conv_123');
      expect(response.turnId).toBe('turn_456');
      expect(response.isIdempotentReplay).toBe(true);
      expect(response.idempotencyOutcome).toBe('EXISTING_RECOVERED');

      const raw = response as unknown as Record<string, unknown>;
      expect(raw['payloadHash']).toBeUndefined();
      expect(raw['leaseToken']).toBeUndefined();
    });

    it('3. maps ConversationDetailDto strictly omitting internal tenant and database fields', () => {
      const detailDto = {
        id: 'conv_detail_1',
        tenantId: 'internal_secret_tenant_id',
        userId: 'internal_user_id',
        title: 'Biometrics Evaluation',
        turnCounter: 3,
        messageCounter: 6,
        lastActivityAt: '2026-11-23T14:10:00.000Z',
        createdAt: '2026-11-23T12:00:00.000Z',
        updatedAt: '2026-11-23T14:10:00.000Z',
        isArchived: false,
        activeTurnId: null,
        turns: [
          {
            id: 'turn_1',
            turnIndex: 1,
            status: TurnStatus.COMPLETED,
            clientTurnId: 'turn_client_1',
            activeAttemptId: 'msg_att_1',
            activeAttemptNumber: 1,
            createdAt: '2026-11-23T12:00:00.000Z',
            completedAt: '2026-11-23T12:01:00.000Z',
          },
        ],
      };

      const response = AiConversationResponseMapper.toConversationDetailResponse(detailDto);

      expect(response).toBeInstanceOf(ConversationDetailResponseDto);
      expect(response.id).toBe('conv_detail_1');
      expect(response.title).toBe('Biometrics Evaluation');
      expect(response.turnCounter).toBe(3);
      expect(response.messageCounter).toBe(6);
      expect(response.isArchived).toBe(false);
      expect(response.turns).toHaveLength(1);
      expect(response.turns?.[0]?.id).toBe('turn_1');

      // Verify that tenantId and userId are excluded from public detail response
      const raw = response as unknown as Record<string, unknown>;
      expect(raw['tenantId']).toBeUndefined();
      expect(raw['userId']).toBeUndefined();
    });

    it('4. maps ListConversationsResult with keyset pagination metadata', () => {
      const listResult = {
        items: [
          {
            id: 'conv_list_1',
            title: 'Kinesiology Case Study',
            turnCounter: 2,
            lastActivityAt: '2026-11-23T14:00:00.000Z',
            createdAt: '2026-11-23T13:00:00.000Z',
            isArchived: false,
          },
        ],
        nextCursor: 'next_page_cursor_token',
        hasMore: true,
      };

      const response = AiConversationResponseMapper.toListConversationsResponse(listResult);

      expect(response).toBeInstanceOf(ListConversationsResponseDto);
      expect(response.items).toHaveLength(1);
      expect(response.items[0]?.id).toBe('conv_list_1');
      expect(response.nextCursor).toBe('next_page_cursor_token');
      expect(response.hasMore).toBe(true);
    });

    it('5. maps MessageHistoryResultDto and excludes internal message metadata', () => {
      const historyResult = {
        messages: [
          {
            id: 'msg_1',
            turnId: 'turn_1',
            role: ConversationRole.USER,
            sequenceNumber: 1,
            attemptNumber: 1,
            isCanonical: true,
            status: GenerationStatus.SUCCESS,
            content: 'How should eccentric training be prescribed?',
            sources: null,
            metadata: { internalRoutingNode: 'rag-worker-01', promptHash: 'abc1234' },
            createdAt: '2026-11-23T14:00:00.000Z',
            completedAt: '2026-11-23T14:00:00.000Z',
          },
        ],
        nextCursor: null,
        hasMore: false,
      };

      const response = AiConversationResponseMapper.toMessageHistoryResponse(historyResult);

      expect(response).toBeInstanceOf(MessageHistoryResponseDto);
      expect(response.messages).toHaveLength(1);
      const msg = response.messages[0];
      expect(msg?.id).toBe('msg_1');
      expect(msg?.content).toBe('How should eccentric training be prescribed?');
      expect(msg?.sequenceNumber).toBe(1);

      // Verify internal metadata is not exposed on MessageResponseDto
      const raw = msg as unknown as Record<string, unknown>;
      expect(raw['metadata']).toBeUndefined();
      expect(raw['internalRoutingNode']).toBeUndefined();
    });

    it('6. maps UpdateConversationTitleResult and ArchiveConversationResult', () => {
      const titleResult = {
        conversationId: 'conv_123',
        title: 'New Title',
        updatedAt: '2026-11-23T14:30:00.000Z',
      };

      const titleResponse = AiConversationResponseMapper.toUpdateTitleResponse(titleResult);
      expect(titleResponse).toBeInstanceOf(UpdateTitleResponseDto);
      expect(titleResponse.conversationId).toBe('conv_123');
      expect(titleResponse.title).toBe('New Title');

      const archiveResult = {
        conversationId: 'conv_123',
        isArchived: true,
        archivedAt: '2026-11-23T14:35:00.000Z',
      };

      const archiveResponse =
        AiConversationResponseMapper.toArchiveConversationResponse(archiveResult);
      expect(archiveResponse).toBeInstanceOf(ArchiveConversationResponseDto);
      expect(archiveResponse.isArchived).toBe(true);
      expect(archiveResponse.conversationId).toBe('conv_123');
    });
  });
});
