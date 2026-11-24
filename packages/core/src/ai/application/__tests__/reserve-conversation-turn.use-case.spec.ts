import { ReserveConversationTurnUseCase } from '../use-cases/reserve-conversation-turn.use-case';
import {
  IAiConversationTransactionRunner,
  ConversationTransactionalRepositories,
} from '../ports/ai-conversation-transaction-runner.port';
import { IAiConversationRepositoryPort } from '../../ports/outbound/ai-conversation-repository.port';
import { IAiConversationTurnRepositoryPort } from '../../ports/outbound/ai-conversation-turn-repository.port';
import { IAiConversationMessageRepositoryPort } from '../../ports/outbound/ai-conversation-message-repository.port';
import {
  InvalidTurnInputError,
  ConversationNotFoundError,
  TenantOwnershipViolationError,
  InvalidConversationLifecycleError,
  TurnAlreadyInProgressError,
  DuplicateClientTurnPayloadMismatchError,
} from '../errors/ai-conversation-application.error';
import { AiPayloadHasher } from '../services/ai-payload-hasher';
import { AiConversation } from '../../domain/models/ai-conversation.entity';
import { AiConversationTurn } from '../../domain/models/ai-conversation-turn.entity';
import { AiConversationMessage } from '../../domain/models/ai-conversation-message.entity';
import { TurnStatus } from '../../domain/enums/turn-status.enum';
import { ConversationRole } from '../../domain/enums/conversation-role.enum';
import { GenerationStatus } from '../../domain/enums/generation-status.enum';

describe('AI-09.3-BE.04.03 — ReserveConversationTurnUseCase Unit Tests', () => {
  const tenantId = 'tenant-test-001';
  const userId = 'user-test-001';
  const conversationId = 'conv-test-001';
  const clientTurnId = 'client-turn-sub-002';
  const userPrompt = 'How should I modify my deadlift to avoid aggravating lumbar facet joints?';

  let mockConvSave: jest.Mock;
  let mockConvFindById: jest.Mock;
  let mockConvRepo: IAiConversationRepositoryPort;

  let mockTurnSave: jest.Mock;
  let mockTurnFindByClientTurnId: jest.Mock;
  let mockTurnFindActiveTurn: jest.Mock;
  let mockTurnRepo: IAiConversationTurnRepositoryPort;

  let mockMessageSave: jest.Mock;
  let mockMessageListByTurn: jest.Mock;
  let mockMessageRepo: IAiConversationMessageRepositoryPort;

  let mockTxRunner: IAiConversationTransactionRunner;

  beforeEach(() => {
    mockConvSave = jest.fn(async (c: AiConversation) => c);
    mockConvFindById = jest.fn(async () => null);
    mockConvRepo = {
      save: mockConvSave,
      findById: mockConvFindById,
      findByIdempotencyKey: jest.fn(async () => null),
      listByUser: jest.fn(async () => []),
      listForAudit: jest.fn(async () => []),
      softDelete: jest.fn(async () => undefined),
    };

    mockTurnSave = jest.fn(async (t: AiConversationTurn) => t);
    mockTurnFindByClientTurnId = jest.fn(async () => null);
    mockTurnFindActiveTurn = jest.fn(async () => null);
    mockTurnRepo = {
      save: mockTurnSave,
      findById: jest.fn(async () => null),
      findByClientTurnId: mockTurnFindByClientTurnId,
      findByIdempotencyKey: jest.fn(async () => null),
      findByTurnIndex: jest.fn(async () => null),
      findActiveTurn: mockTurnFindActiveTurn,
      listByConversation: jest.fn(async () => []),
    };

    mockMessageSave = jest.fn(async (m: AiConversationMessage) => m);
    mockMessageListByTurn = jest.fn(async () => []);
    mockMessageRepo = {
      save: mockMessageSave,
      findById: jest.fn(async () => null),
      findBySequenceNumber: jest.fn(async () => null),
      listByTurn: mockMessageListByTurn,
      listCanonicalHistory: jest.fn(async () => ({ messages: [], nextCursor: null })),
    };

    mockTxRunner = {
      runInTransaction: jest.fn(async (work) => {
        const repos: ConversationTransactionalRepositories = {
          conversationRepo: mockConvRepo,
          turnRepo: mockTurnRepo,
          messageRepo: mockMessageRepo,
          auditRepo: {
            save: jest.fn(),
            listByConversation: jest.fn(),
            listByInspector: jest.fn(),
          },
        };
        return work(repos);
      }),
    };
  });

  describe('Input Validation & Constraints', () => {
    it('should reject missing or empty tenantId', async () => {
      const useCase = new ReserveConversationTurnUseCase(
        mockTxRunner,
        mockTurnRepo,
        mockConvRepo,
        mockMessageRepo,
      );

      await expect(
        useCase.execute({
          tenantId: '   ',
          userId,
          conversationId,
          clientTurnId,
          userPrompt,
        }),
      ).rejects.toThrow(InvalidTurnInputError);
    });

    it('should reject missing or empty conversationId', async () => {
      const useCase = new ReserveConversationTurnUseCase(
        mockTxRunner,
        mockTurnRepo,
        mockConvRepo,
        mockMessageRepo,
      );

      await expect(
        useCase.execute({
          tenantId,
          userId,
          conversationId: '',
          clientTurnId,
          userPrompt,
        }),
      ).rejects.toThrow(InvalidTurnInputError);
    });

    it('should reject empty userPrompt', async () => {
      const useCase = new ReserveConversationTurnUseCase(
        mockTxRunner,
        mockTurnRepo,
        mockConvRepo,
        mockMessageRepo,
      );

      await expect(
        useCase.execute({
          tenantId,
          userId,
          conversationId,
          clientTurnId,
          userPrompt: '     ',
        }),
      ).rejects.toThrow(InvalidTurnInputError);
    });
  });

  describe('Conversation Ownership & Lifecycle Rules', () => {
    it('should throw ConversationNotFoundError when conversation does not exist', async () => {
      mockConvFindById.mockResolvedValueOnce(null);

      const useCase = new ReserveConversationTurnUseCase(
        mockTxRunner,
        mockTurnRepo,
        mockConvRepo,
        mockMessageRepo,
      );

      await expect(
        useCase.execute({
          tenantId,
          userId,
          conversationId: 'non-existent-conv',
          clientTurnId,
          userPrompt,
        }),
      ).rejects.toThrow(ConversationNotFoundError);
    });

    it('should throw TenantOwnershipViolationError when conversation belongs to another tenant or user', async () => {
      const foreignConv = AiConversation.create({
        id: conversationId,
        tenantId: 'foreign-tenant',
        userId: 'foreign-user',
        title: 'Foreign Conversation',
      });
      mockConvFindById.mockResolvedValueOnce(foreignConv);

      const useCase = new ReserveConversationTurnUseCase(
        mockTxRunner,
        mockTurnRepo,
        mockConvRepo,
        mockMessageRepo,
      );

      await expect(
        useCase.execute({
          tenantId,
          userId,
          conversationId,
          clientTurnId,
          userPrompt,
        }),
      ).rejects.toThrow(TenantOwnershipViolationError);
    });

    it('should throw InvalidConversationLifecycleError when conversation is archived', async () => {
      const archivedConv = AiConversation.create({
        id: conversationId,
        tenantId,
        userId,
        title: 'Archived Conversation',
      });
      archivedConv.archive();
      mockConvFindById.mockResolvedValueOnce(archivedConv);

      const useCase = new ReserveConversationTurnUseCase(
        mockTxRunner,
        mockTurnRepo,
        mockConvRepo,
        mockMessageRepo,
      );

      await expect(
        useCase.execute({
          tenantId,
          userId,
          conversationId,
          clientTurnId,
          userPrompt,
        }),
      ).rejects.toThrow(InvalidConversationLifecycleError);
    });

    it('should throw TurnAlreadyInProgressError when conversation already has an active turn', async () => {
      const activeTurn = AiConversationTurn.create({
        conversationId,
        tenantId,
        turnIndex: 1,
        clientTurnId: 'prev-turn-id',
        idempotencyKey: 'prev-turn-id',
        idempotencyPayloadHash: 'hash-prev',
        status: TurnStatus.STREAMING,
      });

      const conv = AiConversation.create({
        id: conversationId,
        tenantId,
        userId,
        title: 'Active Conversation',
        turnCounter: 1,
        messageCounter: 2,
      });

      mockConvFindById.mockResolvedValueOnce(conv);
      mockTurnFindActiveTurn.mockResolvedValueOnce(activeTurn);

      const useCase = new ReserveConversationTurnUseCase(
        mockTxRunner,
        mockTurnRepo,
        mockConvRepo,
        mockMessageRepo,
      );

      await expect(
        useCase.execute({
          tenantId,
          userId,
          conversationId,
          clientTurnId,
          userPrompt,
        }),
      ).rejects.toThrow(TurnAlreadyInProgressError);
    });
  });

  describe('Successful Subsequent Turn Reservation & Sequence Allocation', () => {
    it('should atomically allocate subsequent turnIndex and message sequence numbers', async () => {
      const existingConv = AiConversation.create({
        id: conversationId,
        tenantId,
        userId,
        title: 'Ongoing Consultation',
        turnCounter: 1,
        messageCounter: 2,
      });

      mockConvFindById.mockResolvedValueOnce(existingConv);
      mockTurnFindActiveTurn.mockResolvedValueOnce(null);

      const useCase = new ReserveConversationTurnUseCase(
        mockTxRunner,
        mockTurnRepo,
        mockConvRepo,
        mockMessageRepo,
      );

      const result = await useCase.execute({
        tenantId,
        userId,
        conversationId,
        clientTurnId,
        userPrompt,
      });

      expect(result.conversationId).toBe(conversationId);
      expect(result.clientTurnId).toBe(clientTurnId);
      expect(result.turnIndex).toBe(2);
      expect(result.turnStatus).toBe(TurnStatus.PENDING);
      expect(result.isIdempotentReplay).toBe(false);
      expect(result.idempotencyOutcome).toBe('CREATED');

      // Assert conversation counters incremented
      expect(mockConvSave).toHaveBeenCalledTimes(1);
      const savedConv = mockConvSave.mock.calls[0][0] as AiConversation;
      expect(savedConv.turnCounter).toBe(2);
      expect(savedConv.messageCounter).toBe(4);

      // Assert messages created with correct sequences
      expect(mockMessageSave).toHaveBeenCalledTimes(2);
      const userMsg = mockMessageSave.mock.calls[0][0] as AiConversationMessage;
      const assistantMsg = mockMessageSave.mock.calls[1][0] as AiConversationMessage;

      expect(userMsg.role).toBe(ConversationRole.USER);
      expect(userMsg.sequenceNumber).toBe(3);
      expect(userMsg.status).toBe(GenerationStatus.SUCCESS);
      expect(userMsg.content).toBe(userPrompt);

      expect(assistantMsg.role).toBe(ConversationRole.ASSISTANT);
      expect(assistantMsg.sequenceNumber).toBe(4);
      expect(assistantMsg.status).toBe(GenerationStatus.PENDING);
    });
  });

  describe('Idempotency & Replay Scenarios', () => {
    it('should return existing in-progress turn on replay with matching payload', async () => {
      const hash = AiPayloadHasher.hash({ prompt: userPrompt });
      const inProgressTurn = AiConversationTurn.create({
        conversationId,
        tenantId,
        turnIndex: 2,
        clientTurnId,
        idempotencyKey: clientTurnId,
        idempotencyPayloadHash: hash,
        status: TurnStatus.STREAMING,
      });

      const userMsg = AiConversationMessage.create({
        turnId: inProgressTurn.id,
        conversationId,
        tenantId,
        role: ConversationRole.USER,
        sequenceNumber: 3,
        content: userPrompt,
        status: GenerationStatus.SUCCESS,
      });

      const assistantMsg = AiConversationMessage.create({
        turnId: inProgressTurn.id,
        conversationId,
        tenantId,
        role: ConversationRole.ASSISTANT,
        sequenceNumber: 4,
        status: GenerationStatus.STREAMING,
      });

      const existingConv = AiConversation.create({
        id: conversationId,
        tenantId,
        userId,
        title: 'Consultation',
      });
      mockConvFindById.mockResolvedValueOnce(existingConv);
      mockTurnFindByClientTurnId.mockResolvedValueOnce(inProgressTurn);
      mockMessageListByTurn.mockResolvedValueOnce([userMsg, assistantMsg]);

      const useCase = new ReserveConversationTurnUseCase(
        mockTxRunner,
        mockTurnRepo,
        mockConvRepo,
        mockMessageRepo,
      );

      const result = await useCase.execute({
        tenantId,
        userId,
        conversationId,
        clientTurnId,
        userPrompt,
      });

      expect(result.isIdempotentReplay).toBe(true);
      expect(result.idempotencyOutcome).toBe('EXISTING_RECOVERED');
      expect(result.turnStatus).toBe(TurnStatus.STREAMING);
      expect(result.turnIndex).toBe(2);
      expect(mockConvSave).not.toHaveBeenCalled();
      expect(mockTxRunner.runInTransaction).not.toHaveBeenCalled();
    });

    it('should return existing completed terminal turn on replay with matching payload', async () => {
      const hash = AiPayloadHasher.hash({ prompt: userPrompt });
      const completedTurn = AiConversationTurn.create({
        conversationId,
        tenantId,
        turnIndex: 2,
        clientTurnId,
        idempotencyKey: clientTurnId,
        idempotencyPayloadHash: hash,
        status: TurnStatus.COMPLETED,
      });

      const userMsg = AiConversationMessage.create({
        turnId: completedTurn.id,
        conversationId,
        tenantId,
        role: ConversationRole.USER,
        sequenceNumber: 3,
        content: userPrompt,
        status: GenerationStatus.SUCCESS,
      });

      const assistantMsg = AiConversationMessage.create({
        turnId: completedTurn.id,
        conversationId,
        tenantId,
        role: ConversationRole.ASSISTANT,
        sequenceNumber: 4,
        status: GenerationStatus.SUCCESS,
        isCanonical: true,
      });

      const existingConv = AiConversation.create({
        id: conversationId,
        tenantId,
        userId,
        title: 'Consultation',
      });
      mockConvFindById.mockResolvedValueOnce(existingConv);
      mockTurnFindByClientTurnId.mockResolvedValueOnce(completedTurn);
      mockMessageListByTurn.mockResolvedValueOnce([userMsg, assistantMsg]);

      const useCase = new ReserveConversationTurnUseCase(
        mockTxRunner,
        mockTurnRepo,
        mockConvRepo,
        mockMessageRepo,
      );

      const result = await useCase.execute({
        tenantId,
        userId,
        conversationId,
        clientTurnId,
        userPrompt,
      });

      expect(result.isIdempotentReplay).toBe(true);
      expect(result.idempotencyOutcome).toBe('EXISTING_RECOVERED');
      expect(result.turnStatus).toBe(TurnStatus.COMPLETED);
    });

    it('should throw DuplicateClientTurnPayloadMismatchError when clientTurnId is reused with different payload', async () => {
      const originalHash = AiPayloadHasher.hash({ prompt: 'First prompt version' });
      const existingTurn = AiConversationTurn.create({
        conversationId,
        tenantId,
        turnIndex: 2,
        clientTurnId,
        idempotencyKey: clientTurnId,
        idempotencyPayloadHash: originalHash,
        status: TurnStatus.PENDING,
      });

      mockTurnFindByClientTurnId.mockResolvedValueOnce(existingTurn);

      const useCase = new ReserveConversationTurnUseCase(
        mockTxRunner,
        mockTurnRepo,
        mockConvRepo,
        mockMessageRepo,
      );

      await expect(
        useCase.execute({
          tenantId,
          userId,
          conversationId,
          clientTurnId,
          userPrompt: 'Mismatched prompt version',
        }),
      ).rejects.toThrow(DuplicateClientTurnPayloadMismatchError);
    });
  });
});
