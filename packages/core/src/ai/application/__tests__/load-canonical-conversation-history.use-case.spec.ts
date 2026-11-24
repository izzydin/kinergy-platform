import { LoadCanonicalConversationHistoryUseCase } from '../use-cases/load-canonical-conversation-history.use-case';
import { IAiConversationRepositoryPort } from '../../ports/outbound/ai-conversation-repository.port';
import { IAiConversationTurnRepositoryPort } from '../../ports/outbound/ai-conversation-turn-repository.port';
import { IAiConversationMessageRepositoryPort } from '../../ports/outbound/ai-conversation-message-repository.port';
import { AiConversation } from '../../domain/models/ai-conversation.entity';
import { AiConversationTurn } from '../../domain/models/ai-conversation-turn.entity';
import { AiConversationMessage } from '../../domain/models/ai-conversation-message.entity';
import { ConversationRole } from '../../domain/enums/conversation-role.enum';
import { TurnStatus } from '../../domain/enums/turn-status.enum';
import { GenerationStatus } from '../../domain/enums/generation-status.enum';
import {
  ConversationNotFoundError,
  TurnNotFoundError,
  InvalidTurnInputError,
  InvalidConversationLifecycleError,
} from '../errors/ai-conversation-application.error';

describe('BE.06.02 — LoadCanonicalConversationHistoryUseCase Unit Tests', () => {
  let useCase: LoadCanonicalConversationHistoryUseCase;
  let mockConvRepo: jest.Mocked<IAiConversationRepositoryPort>;
  let mockTurnRepo: jest.Mocked<IAiConversationTurnRepositoryPort>;
  let mockMessageRepo: jest.Mocked<IAiConversationMessageRepositoryPort>;

  const TENANT_ID = 'tenant_kinergy_1';
  const CONVERSATION_ID = 'conv_123';
  const USER_ID = 'user_123';

  const createMockConversation = (isArchived = false): AiConversation => {
    return AiConversation.create({
      id: CONVERSATION_ID,
      tenantId: TENANT_ID,
      userId: USER_ID,
      title: 'Sesión Clínica',
      turnCounter: 1,
      messageCounter: 2,
      deletedAt: isArchived ? new Date() : null,
    });
  };

  const createMockTurn = (props: {
    turnId: string;
    turnIndex: number;
    status?: TurnStatus;
    activeAttemptId?: string | null;
    activeAttemptNumber?: number;
    conversationId?: string;
  }): AiConversationTurn => {
    return AiConversationTurn.reconstitute({
      id: props.turnId,
      conversationId: props.conversationId ?? CONVERSATION_ID,
      tenantId: TENANT_ID,
      turnIndex: props.turnIndex,
      status: props.status ?? TurnStatus.PENDING,
      clientTurnId: `client_${props.turnId}`,
      idempotencyKey: `idem_${props.turnId}`,
      idempotencyPayloadHash: 'hash_test',
      activeAttemptId: props.activeAttemptId ?? `msg_attempt_${props.turnId}`,
      activeAttemptNumber: props.activeAttemptNumber ?? 1,
      createdAt: new Date(),
      completedAt: props.status === TurnStatus.COMPLETED ? new Date() : null,
      updatedAt: new Date(),
    });
  };

  const createMockMessage = (props: {
    id: string;
    turnId: string;
    role: ConversationRole;
    sequenceNumber: number;
    content: string;
    isCanonical?: boolean;
    status?: GenerationStatus;
  }): AiConversationMessage => {
    return AiConversationMessage.reconstitute({
      id: props.id,
      turnId: props.turnId,
      conversationId: CONVERSATION_ID,
      tenantId: TENANT_ID,
      role: props.role,
      sequenceNumber: props.sequenceNumber,
      attemptNumber: 1,
      isCanonical: props.isCanonical ?? props.role === ConversationRole.ASSISTANT,
      status: props.status ?? GenerationStatus.SUCCESS,
      content: props.content,
      sources: null,
      metadata: null,
      errorCode: null,
      errorMessage: null,
      clientMessageId: null,
      leaseToken: null,
      leaseOwnerInstanceId: null,
      leaseExpiresAt: null,
      createdAt: new Date(),
      completedAt: new Date(),
      updatedAt: new Date(),
    });
  };

  beforeEach(() => {
    mockConvRepo = {
      findById: jest.fn(),
      save: jest.fn(),
      listByUser: jest.fn(),
      updateMetadata: jest.fn(),
      touchActivity: jest.fn(),
    } as unknown as jest.Mocked<IAiConversationRepositoryPort>;

    mockTurnRepo = {
      findById: jest.fn(),
      save: jest.fn(),
      findByClientTurnId: jest.fn(),
      findByIdempotencyKey: jest.fn(),
      findByTurnIndex: jest.fn(),
      findActiveTurn: jest.fn(),
      listByConversation: jest.fn(),
      updateStatus: jest.fn(),
    };

    mockMessageRepo = {
      findById: jest.fn(),
      findBySequenceNumber: jest.fn(),
      findCanonicalAssistantMessage: jest.fn(),
      listByTurn: jest.fn(),
      listCanonicalHistory: jest.fn(),
      save: jest.fn(),
      updateStatus: jest.fn(),
      acquireLease: jest.fn(),
    };

    useCase = new LoadCanonicalConversationHistoryUseCase(
      mockConvRepo,
      mockTurnRepo,
      mockMessageRepo,
    );
  });

  describe('Validation and Access Boundaries', () => {
    it('1. throws InvalidTurnInputError when tenantId, conversationId, or turnId is empty', async () => {
      await expect(
        useCase.execute({ tenantId: '', conversationId: CONVERSATION_ID, turnId: 'turn_1' }),
      ).rejects.toThrow(InvalidTurnInputError);

      await expect(
        useCase.execute({ tenantId: TENANT_ID, conversationId: '', turnId: 'turn_1' }),
      ).rejects.toThrow(InvalidTurnInputError);

      await expect(
        useCase.execute({ tenantId: TENANT_ID, conversationId: CONVERSATION_ID, turnId: '' }),
      ).rejects.toThrow(InvalidTurnInputError);
    });

    it('2. throws ConversationNotFoundError when conversation does not exist or tenant mismatch', async () => {
      mockConvRepo.findById.mockResolvedValue(null);

      await expect(
        useCase.execute({
          tenantId: 'foreign_tenant',
          conversationId: CONVERSATION_ID,
          turnId: 'turn_1',
        }),
      ).rejects.toThrow(ConversationNotFoundError);

      expect(mockConvRepo.findById).toHaveBeenCalledWith('foreign_tenant', CONVERSATION_ID);
    });

    it('3. throws InvalidConversationLifecycleError when conversation is archived', async () => {
      mockConvRepo.findById.mockResolvedValue(createMockConversation(true));

      await expect(
        useCase.execute({
          tenantId: TENANT_ID,
          conversationId: CONVERSATION_ID,
          turnId: 'turn_1',
        }),
      ).rejects.toThrow(InvalidConversationLifecycleError);
    });

    it('4. throws TurnNotFoundError when turn does not exist', async () => {
      mockConvRepo.findById.mockResolvedValue(createMockConversation());
      mockTurnRepo.findById.mockResolvedValue(null);

      await expect(
        useCase.execute({
          tenantId: TENANT_ID,
          conversationId: CONVERSATION_ID,
          turnId: 'turn_unknown',
        }),
      ).rejects.toThrow(TurnNotFoundError);
    });

    it('5. throws TurnNotFoundError when turn belongs to another conversation', async () => {
      mockConvRepo.findById.mockResolvedValue(createMockConversation());
      mockTurnRepo.findById.mockResolvedValue(
        createMockTurn({ turnId: 'turn_other', turnIndex: 1, conversationId: 'conv_different' }),
      );

      await expect(
        useCase.execute({
          tenantId: TENANT_ID,
          conversationId: CONVERSATION_ID,
          turnId: 'turn_other',
        }),
      ).rejects.toThrow(TurnNotFoundError);
    });

    it('6. throws InvalidConversationLifecycleError when turn is already terminal', async () => {
      mockConvRepo.findById.mockResolvedValue(createMockConversation());
      mockTurnRepo.findById.mockResolvedValue(
        createMockTurn({ turnId: 'turn_1', turnIndex: 1, status: TurnStatus.COMPLETED }),
      );

      await expect(
        useCase.execute({
          tenantId: TENANT_ID,
          conversationId: CONVERSATION_ID,
          turnId: 'turn_1',
        }),
      ).rejects.toThrow(InvalidConversationLifecycleError);
    });

    it('7. throws InvalidConversationLifecycleError when current user message is missing', async () => {
      mockConvRepo.findById.mockResolvedValue(createMockConversation());
      const currentTurn = createMockTurn({
        turnId: 'turn_1',
        turnIndex: 1,
        status: TurnStatus.PENDING,
      });
      mockTurnRepo.findById.mockResolvedValue(currentTurn);

      // Only assistant attempt exists, user message is missing
      mockMessageRepo.listByTurn.mockResolvedValue([
        createMockMessage({
          id: currentTurn.activeAttemptId!.value,
          turnId: 'turn_1',
          role: ConversationRole.ASSISTANT,
          sequenceNumber: 2,
          content: '',
          isCanonical: false,
          status: GenerationStatus.PENDING,
        }),
      ]);

      await expect(
        useCase.execute({
          tenantId: TENANT_ID,
          conversationId: CONVERSATION_ID,
          turnId: 'turn_1',
        }),
      ).rejects.toThrow(InvalidConversationLifecycleError);
    });
  });

  describe('Canonical History Window & Assembly', () => {
    it('8. handles first turn with empty prior conversation history', async () => {
      mockConvRepo.findById.mockResolvedValue(createMockConversation());
      const currentTurn = createMockTurn({ turnId: 'turn_1', turnIndex: 1 });
      mockTurnRepo.findById.mockResolvedValue(currentTurn);

      const userMsg = createMockMessage({
        id: 'msg_user_1',
        turnId: 'turn_1',
        role: ConversationRole.USER,
        sequenceNumber: 1,
        content: '¿Cuáles son las contraindicaciones de la punción seca?',
      });
      const assistantAttempt = createMockMessage({
        id: currentTurn.activeAttemptId!.value,
        turnId: 'turn_1',
        role: ConversationRole.ASSISTANT,
        sequenceNumber: 2,
        content: '',
        isCanonical: false,
        status: GenerationStatus.PENDING,
      });

      mockMessageRepo.listByTurn.mockResolvedValue([userMsg, assistantAttempt]);
      mockTurnRepo.listByConversation.mockResolvedValue([]); // No preceding completed turns

      const result = await useCase.execute({
        tenantId: TENANT_ID,
        conversationId: CONVERSATION_ID,
        turnId: 'turn_1',
      });

      expect(result.conversationId).toBe(CONVERSATION_ID);
      expect(result.currentTurnId).toBe('turn_1');
      expect(result.currentTurnIndex).toBe(1);
      expect(result.currentUserMessage.content).toBe(userMsg.content);
      expect(result.currentAssistantAttempt.id.value).toBe(assistantAttempt.id.value);
      expect(result.priorCanonicalMessages).toEqual([]);
      expect(result.completedTurnsCount).toBe(0);
      expect(result.isContextTruncated).toBe(false);
    });

    it('9. loads multiple completed turns in strict chronological sequence order', async () => {
      mockConvRepo.findById.mockResolvedValue(createMockConversation());
      const currentTurn = createMockTurn({ turnId: 'turn_3', turnIndex: 3 });
      mockTurnRepo.findById.mockResolvedValue(currentTurn);

      const user3 = createMockMessage({
        id: 'msg_user_3',
        turnId: 'turn_3',
        role: ConversationRole.USER,
        sequenceNumber: 5,
        content: 'Tercera pregunta',
      });
      const assistant3 = createMockMessage({
        id: currentTurn.activeAttemptId!.value,
        turnId: 'turn_3',
        role: ConversationRole.ASSISTANT,
        sequenceNumber: 6,
        content: '',
        isCanonical: false,
        status: GenerationStatus.PENDING,
      });

      // Preceding completed turns
      const turn1 = createMockTurn({
        turnId: 'turn_1',
        turnIndex: 1,
        status: TurnStatus.COMPLETED,
      });
      const turn2 = createMockTurn({
        turnId: 'turn_2',
        turnIndex: 2,
        status: TurnStatus.COMPLETED,
      });

      mockTurnRepo.listByConversation.mockResolvedValue([turn1, turn2]);

      // Message loading mock
      mockMessageRepo.listByTurn.mockImplementation(async (_t, _c, requestedTurnId) => {
        const idStr = typeof requestedTurnId === 'string' ? requestedTurnId : requestedTurnId.value;
        if (idStr === 'turn_3') return [user3, assistant3];
        if (idStr === 'turn_1') {
          return [
            createMockMessage({
              id: 'msg_u1',
              turnId: 'turn_1',
              role: ConversationRole.USER,
              sequenceNumber: 1,
              content: 'Pregunta 1',
            }),
            createMockMessage({
              id: 'msg_a1',
              turnId: 'turn_1',
              role: ConversationRole.ASSISTANT,
              sequenceNumber: 2,
              content: 'Respuesta 1',
              isCanonical: true,
            }),
          ];
        }
        if (idStr === 'turn_2') {
          return [
            createMockMessage({
              id: 'msg_u2',
              turnId: 'turn_2',
              role: ConversationRole.USER,
              sequenceNumber: 3,
              content: 'Pregunta 2',
            }),
            createMockMessage({
              id: 'msg_a2',
              turnId: 'turn_2',
              role: ConversationRole.ASSISTANT,
              sequenceNumber: 4,
              content: 'Respuesta 2',
              isCanonical: true,
            }),
          ];
        }
        return [];
      });

      const result = await useCase.execute({
        tenantId: TENANT_ID,
        conversationId: CONVERSATION_ID,
        turnId: 'turn_3',
      });

      expect(result.priorCanonicalMessages).toHaveLength(4);
      expect(result.priorCanonicalMessages[0]).toEqual({ role: 'user', content: 'Pregunta 1' });
      expect(result.priorCanonicalMessages[1]).toEqual({
        role: 'assistant',
        content: 'Respuesta 1',
      });
      expect(result.priorCanonicalMessages[2]).toEqual({ role: 'user', content: 'Pregunta 2' });
      expect(result.priorCanonicalMessages[3]).toEqual({
        role: 'assistant',
        content: 'Respuesta 2',
      });
      expect(result.completedTurnsCount).toBe(2);
      expect(result.isContextTruncated).toBe(false);
      // Ensure current user message is isolated and not in prior history
      expect(result.currentUserMessage.content).toBe('Tercera pregunta');
      expect(result.priorCanonicalMessages.map((m) => m.content)).not.toContain('Tercera pregunta');
    });

    it('10. bounds history to approved context-window policy of up to 10 completed canonical turns', async () => {
      mockConvRepo.findById.mockResolvedValue(createMockConversation());
      const currentTurn = createMockTurn({ turnId: 'turn_16', turnIndex: 16 });
      mockTurnRepo.findById.mockResolvedValue(currentTurn);

      const user16 = createMockMessage({
        id: 'msg_u16',
        turnId: 'turn_16',
        role: ConversationRole.USER,
        sequenceNumber: 31,
        content: 'Pregunta 16',
      });
      const assistant16 = createMockMessage({
        id: currentTurn.activeAttemptId!.value,
        turnId: 'turn_16',
        role: ConversationRole.ASSISTANT,
        sequenceNumber: 32,
        content: '',
        isCanonical: false,
        status: GenerationStatus.PENDING,
      });

      // 15 preceding completed turns (turn 1 to turn 15)
      const turns: AiConversationTurn[] = [];
      for (let i = 1; i <= 15; i++) {
        turns.push(
          createMockTurn({ turnId: `turn_${i}`, turnIndex: i, status: TurnStatus.COMPLETED }),
        );
      }
      mockTurnRepo.listByConversation.mockResolvedValue(turns);

      mockMessageRepo.listByTurn.mockImplementation(async (_t, _c, requestedTurnId) => {
        const idStr = typeof requestedTurnId === 'string' ? requestedTurnId : requestedTurnId.value;
        if (idStr === 'turn_16') return [user16, assistant16];
        const match = idStr.match(/^turn_(\d+)$/);
        if (match && match[1]) {
          const idx = parseInt(match[1], 10);
          return [
            createMockMessage({
              id: `msg_u${idx}`,
              turnId: idStr,
              role: ConversationRole.USER,
              sequenceNumber: idx * 2 - 1,
              content: `Pregunta ${idx}`,
            }),
            createMockMessage({
              id: `msg_a${idx}`,
              turnId: idStr,
              role: ConversationRole.ASSISTANT,
              sequenceNumber: idx * 2,
              content: `Respuesta ${idx}`,
              isCanonical: true,
            }),
          ];
        }
        return [];
      });

      const result = await useCase.execute({
        tenantId: TENANT_ID,
        conversationId: CONVERSATION_ID,
        turnId: 'turn_16',
      });

      // Exactly 10 completed turns windowed (turns 6 through 15) -> 20 messages
      expect(result.completedTurnsCount).toBe(10);
      expect(result.totalCompletedTurnsInHistory).toBe(15);
      expect(result.isContextTruncated).toBe(true);
      expect(result.priorCanonicalMessages).toHaveLength(20);

      // Verify that oldest turns (1..5) were dropped and turns 6..15 were retained
      expect(result.priorCanonicalMessages[0]).toEqual({ role: 'user', content: 'Pregunta 6' });
      expect(result.priorCanonicalMessages[1]).toEqual({
        role: 'assistant',
        content: 'Respuesta 6',
      });
      expect(result.priorCanonicalMessages[18]).toEqual({ role: 'user', content: 'Pregunta 15' });
      expect(result.priorCanonicalMessages[19]).toEqual({
        role: 'assistant',
        content: 'Respuesta 15',
      });
    });

    it('11. excludes failed, cancelled, and non-terminal turns from prior history context', async () => {
      mockConvRepo.findById.mockResolvedValue(createMockConversation());
      const currentTurn = createMockTurn({ turnId: 'turn_5', turnIndex: 5 });
      mockTurnRepo.findById.mockResolvedValue(currentTurn);

      const user5 = createMockMessage({
        id: 'msg_u5',
        turnId: 'turn_5',
        role: ConversationRole.USER,
        sequenceNumber: 9,
        content: 'Pregunta 5',
      });
      const assistant5 = createMockMessage({
        id: currentTurn.activeAttemptId!.value,
        turnId: 'turn_5',
        role: ConversationRole.ASSISTANT,
        sequenceNumber: 10,
        content: '',
        isCanonical: false,
        status: GenerationStatus.PENDING,
      });

      // Suppose turns 1 and 4 are COMPLETED, while turns 2 and 3 were FAILED and CANCELLED
      const turn1 = createMockTurn({
        turnId: 'turn_1',
        turnIndex: 1,
        status: TurnStatus.COMPLETED,
      });
      const turn4 = createMockTurn({
        turnId: 'turn_4',
        turnIndex: 4,
        status: TurnStatus.COMPLETED,
      });

      // listByConversation with status: COMPLETED returns only completed turns
      mockTurnRepo.listByConversation.mockResolvedValue([turn1, turn4]);

      mockMessageRepo.listByTurn.mockImplementation(async (_t, _c, requestedTurnId) => {
        const idStr = typeof requestedTurnId === 'string' ? requestedTurnId : requestedTurnId.value;
        if (idStr === 'turn_5') return [user5, assistant5];
        if (idStr === 'turn_1') {
          return [
            createMockMessage({
              id: 'msg_u1',
              turnId: 'turn_1',
              role: ConversationRole.USER,
              sequenceNumber: 1,
              content: 'P1',
            }),
            createMockMessage({
              id: 'msg_a1',
              turnId: 'turn_1',
              role: ConversationRole.ASSISTANT,
              sequenceNumber: 2,
              content: 'R1',
              isCanonical: true,
            }),
          ];
        }
        if (idStr === 'turn_4') {
          return [
            createMockMessage({
              id: 'msg_u4',
              turnId: 'turn_4',
              role: ConversationRole.USER,
              sequenceNumber: 7,
              content: 'P4',
            }),
            createMockMessage({
              id: 'msg_a4',
              turnId: 'turn_4',
              role: ConversationRole.ASSISTANT,
              sequenceNumber: 8,
              content: 'R4',
              isCanonical: true,
            }),
          ];
        }
        return [];
      });

      const result = await useCase.execute({
        tenantId: TENANT_ID,
        conversationId: CONVERSATION_ID,
        turnId: 'turn_5',
      });

      expect(result.priorCanonicalMessages).toHaveLength(4);
      expect(result.priorCanonicalMessages[0]).toEqual({ role: 'user', content: 'P1' });
      expect(result.priorCanonicalMessages[1]).toEqual({ role: 'assistant', content: 'R1' });
      expect(result.priorCanonicalMessages[2]).toEqual({ role: 'user', content: 'P4' });
      expect(result.priorCanonicalMessages[3]).toEqual({ role: 'assistant', content: 'R4' });
      expect(result.completedTurnsCount).toBe(2);
      expect(result.priorCanonicalMessages.map((m) => m.content)).not.toContain('P2');
      expect(result.priorCanonicalMessages.map((m) => m.content)).not.toContain('P3');
    });

    it('12. ensures deterministic context construction with identical inputs', async () => {
      mockConvRepo.findById.mockResolvedValue(createMockConversation());
      const currentTurn = createMockTurn({ turnId: 'turn_2', turnIndex: 2 });
      mockTurnRepo.findById.mockResolvedValue(currentTurn);

      const user2 = createMockMessage({
        id: 'msg_u2',
        turnId: 'turn_2',
        role: ConversationRole.USER,
        sequenceNumber: 3,
        content: 'Pregunta 2',
      });
      const assistant2 = createMockMessage({
        id: currentTurn.activeAttemptId!.value,
        turnId: 'turn_2',
        role: ConversationRole.ASSISTANT,
        sequenceNumber: 4,
        content: '',
        isCanonical: false,
        status: GenerationStatus.PENDING,
      });

      const turn1 = createMockTurn({
        turnId: 'turn_1',
        turnIndex: 1,
        status: TurnStatus.COMPLETED,
      });
      mockTurnRepo.listByConversation.mockResolvedValue([turn1]);

      mockMessageRepo.listByTurn.mockImplementation(async (_t, _c, requestedTurnId) => {
        const idStr = typeof requestedTurnId === 'string' ? requestedTurnId : requestedTurnId.value;
        if (idStr === 'turn_2') return [user2, assistant2];
        if (idStr === 'turn_1') {
          return [
            createMockMessage({
              id: 'msg_u1',
              turnId: 'turn_1',
              role: ConversationRole.USER,
              sequenceNumber: 1,
              content: 'P1',
            }),
            createMockMessage({
              id: 'msg_a1',
              turnId: 'turn_1',
              role: ConversationRole.ASSISTANT,
              sequenceNumber: 2,
              content: 'R1',
              isCanonical: true,
            }),
          ];
        }
        return [];
      });

      const res1 = await useCase.execute({
        tenantId: TENANT_ID,
        conversationId: CONVERSATION_ID,
        turnId: 'turn_2',
      });
      const res2 = await useCase.execute({
        tenantId: TENANT_ID,
        conversationId: CONVERSATION_ID,
        turnId: 'turn_2',
      });

      expect(res1.priorCanonicalMessages).toEqual(res2.priorCanonicalMessages);
      expect(res1.currentUserMessage.content).toBe(res2.currentUserMessage.content);
      expect(res1.completedTurnsCount).toBe(res2.completedTurnsCount);
    });
  });
});
