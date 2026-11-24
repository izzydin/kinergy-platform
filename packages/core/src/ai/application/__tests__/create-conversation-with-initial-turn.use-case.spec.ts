import { CreateConversationWithInitialTurnUseCase } from '../use-cases/create-conversation-with-initial-turn.use-case';
import {
  IAiConversationTransactionRunner,
  ConversationTransactionalRepositories,
} from '../ports/ai-conversation-transaction-runner.port';
import { IAiConversationRepositoryPort } from '../../ports/outbound/ai-conversation-repository.port';
import { IAiConversationTurnRepositoryPort } from '../../ports/outbound/ai-conversation-turn-repository.port';
import { IAiConversationMessageRepositoryPort } from '../../ports/outbound/ai-conversation-message-repository.port';
import {
  InvalidTurnInputError,
  DuplicateClientTurnPayloadMismatchError,
} from '../errors/ai-conversation-application.error';
import { AiPayloadHasher } from '../services/ai-payload-hasher';
import { AiConversation } from '../../domain/models/ai-conversation.entity';
import { AiConversationTurn } from '../../domain/models/ai-conversation-turn.entity';
import { AiConversationMessage } from '../../domain/models/ai-conversation-message.entity';
import { ConversationTitle } from '../../domain/value-objects/conversation-title.vo';
import { TurnStatus } from '../../domain/enums/turn-status.enum';
import { ConversationRole } from '../../domain/enums/conversation-role.enum';
import { GenerationStatus } from '../../domain/enums/generation-status.enum';
import { DuplicateEntityException } from '../../domain/exceptions/conversation.exceptions';

describe('AI-09.3-BE.04.02 — CreateConversationWithInitialTurnUseCase Unit Tests', () => {
  const tenantId = 'tenant-test-001';
  const userId = 'user-test-001';
  const clientTurnId = 'client-turn-uuid-001';
  const userPrompt = 'Can kinesiology improve my rotator cuff flexibility?';

  let mockConvSave: jest.Mock;
  let mockConvFindById: jest.Mock;
  let mockConvRepo: IAiConversationRepositoryPort;

  let mockTurnSave: jest.Mock;
  let mockTurnFindByClientTurnId: jest.Mock;
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
    mockTurnRepo = {
      save: mockTurnSave,
      findById: jest.fn(async () => null),
      findByClientTurnId: mockTurnFindByClientTurnId,
      findByIdempotencyKey: jest.fn(async () => null),
      findByTurnIndex: jest.fn(async () => null),
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
      const useCase = new CreateConversationWithInitialTurnUseCase(
        mockTxRunner,
        mockTurnRepo,
        mockConvRepo,
        mockMessageRepo,
      );

      await expect(
        useCase.execute({
          tenantId: '   ',
          userId,
          clientTurnId,
          userPrompt,
        }),
      ).rejects.toThrow(InvalidTurnInputError);
    });

    it('should reject missing or empty userId', async () => {
      const useCase = new CreateConversationWithInitialTurnUseCase(
        mockTxRunner,
        mockTurnRepo,
        mockConvRepo,
        mockMessageRepo,
      );

      await expect(
        useCase.execute({
          tenantId,
          userId: '',
          clientTurnId,
          userPrompt,
        }),
      ).rejects.toThrow(InvalidTurnInputError);
    });

    it('should reject missing or empty clientTurnId', async () => {
      const useCase = new CreateConversationWithInitialTurnUseCase(
        mockTxRunner,
        mockTurnRepo,
        mockConvRepo,
        mockMessageRepo,
      );

      await expect(
        useCase.execute({
          tenantId,
          userId,
          clientTurnId: '   ',
          userPrompt,
        }),
      ).rejects.toThrow(InvalidTurnInputError);
    });

    it('should reject empty or whitespace-only userPrompt', async () => {
      const useCase = new CreateConversationWithInitialTurnUseCase(
        mockTxRunner,
        mockTurnRepo,
        mockConvRepo,
        mockMessageRepo,
      );

      await expect(
        useCase.execute({
          tenantId,
          userId,
          clientTurnId,
          userPrompt: '     ',
        }),
      ).rejects.toThrow(InvalidTurnInputError);
    });
  });

  describe('Payload Hashing Determinism', () => {
    it('should compute identical hash for identical payloads', () => {
      const hash1 = AiPayloadHasher.hash({ prompt: userPrompt });
      const hash2 = AiPayloadHasher.hash({ prompt: userPrompt });
      expect(hash1).toBe(hash2);
      expect(hash1).toHaveLength(64);
    });

    it('should normalize leading/trailing whitespace and CRLF line endings', () => {
      const hashRaw = AiPayloadHasher.hash({ prompt: 'Hello World' });
      const hashPadded = AiPayloadHasher.hash({ prompt: '   Hello World   ' });
      expect(hashPadded).toBe(hashRaw);

      const hashLf = AiPayloadHasher.hash({ prompt: 'Line 1\nLine 2' });
      const hashCrlf = AiPayloadHasher.hash({ prompt: 'Line 1\r\nLine 2' });
      expect(hashCrlf).toBe(hashLf);
    });

    it('should produce different hash for semantically different prompts', () => {
      const hashA = AiPayloadHasher.hash({ prompt: 'Lower back stiffness rehabilitation' });
      const hashB = AiPayloadHasher.hash({ prompt: 'Cervical spine mobilization assessment' });
      expect(hashA).not.toBe(hashB);
    });

    it('should produce identical hash regardless of metadata property order', () => {
      const hash1 = AiPayloadHasher.hash({
        prompt: 'Pain score',
        metadata: { score: 7, acute: true, notes: 'Left shoulder' },
      });
      const hash2 = AiPayloadHasher.hash({
        prompt: 'Pain score',
        metadata: { notes: 'Left shoulder', acute: true, score: 7 },
      });
      expect(hash1).toBe(hash2);
    });
  });

  describe('Atomic Conversation & Initial Turn Creation', () => {
    it('should atomically create conversation, turn, user message, and assistant placeholder', async () => {
      const useCase = new CreateConversationWithInitialTurnUseCase(
        mockTxRunner,
        mockTurnRepo,
        mockConvRepo,
        mockMessageRepo,
      );

      const result = await useCase.execute({
        tenantId,
        userId,
        clientTurnId,
        userPrompt,
      });

      expect(result.conversationId).toBeDefined();
      expect(result.turnId).toBeDefined();
      expect(result.clientTurnId).toBe(clientTurnId);
      expect(result.turnIndex).toBe(1);
      expect(result.userMessageId).toBeDefined();
      expect(result.assistantAttemptId).toBeDefined();
      expect(result.turnStatus).toBe(TurnStatus.PENDING);
      expect(result.isIdempotentReplay).toBe(false);
      expect(result.idempotencyOutcome).toBe('CREATED');
      expect(result.title).toBe(ConversationTitle.deriveFromPrompt(userPrompt).value);

      // Assert persistence calls within transaction
      expect(mockConvSave).toHaveBeenCalledTimes(1);
      const savedConv = mockConvSave.mock.calls[0][0] as AiConversation;
      expect(savedConv.turnCounter).toBe(1);
      expect(savedConv.messageCounter).toBe(2);

      // Turn saved initially (without attempt) and then updated with active attempt
      expect(mockTurnSave).toHaveBeenCalledTimes(2);

      // User message and Assistant placeholder saved
      expect(mockMessageSave).toHaveBeenCalledTimes(2);
      const userMsg = mockMessageSave.mock.calls[0][0] as AiConversationMessage;
      const assistantMsg = mockMessageSave.mock.calls[1][0] as AiConversationMessage;

      expect(userMsg.role).toBe(ConversationRole.USER);
      expect(userMsg.sequenceNumber).toBe(1);
      expect(userMsg.status).toBe(GenerationStatus.SUCCESS);
      expect(userMsg.content).toBe(userPrompt);

      expect(assistantMsg.role).toBe(ConversationRole.ASSISTANT);
      expect(assistantMsg.sequenceNumber).toBe(2);
      expect(assistantMsg.status).toBe(GenerationStatus.PENDING);
      expect(assistantMsg.isCanonical).toBe(false);
      expect(assistantMsg.content).toBe('');
    });

    it('should use explicit custom title when provided', async () => {
      const useCase = new CreateConversationWithInitialTurnUseCase(
        mockTxRunner,
        mockTurnRepo,
        mockConvRepo,
        mockMessageRepo,
      );

      const customTitle = 'Custom Rotator Cuff Assessment';
      const result = await useCase.execute({
        tenantId,
        userId,
        clientTurnId,
        userPrompt,
        title: customTitle,
      });

      expect(result.title).toBe(customTitle);
    });
  });

  describe('Idempotency & Retry Arbitration', () => {
    it('should return existing conversation state on same clientTurnId with matching payload', async () => {
      const existingHash = AiPayloadHasher.hash({ prompt: userPrompt });
      const existingTurn = AiConversationTurn.create({
        conversationId: 'existing-conv-id',
        tenantId,
        turnIndex: 1,
        clientTurnId,
        idempotencyKey: clientTurnId,
        idempotencyPayloadHash: existingHash,
        status: TurnStatus.PENDING,
      });

      const existingConv = AiConversation.create({
        id: 'existing-conv-id',
        tenantId,
        userId,
        title: 'Existing Consultation',
      });

      const existingUserMsg = AiConversationMessage.create({
        turnId: existingTurn.id,
        conversationId: 'existing-conv-id',
        tenantId,
        role: ConversationRole.USER,
        sequenceNumber: 1,
        content: userPrompt,
        status: GenerationStatus.SUCCESS,
      });

      const existingAssistantMsg = AiConversationMessage.create({
        turnId: existingTurn.id,
        conversationId: 'existing-conv-id',
        tenantId,
        role: ConversationRole.ASSISTANT,
        sequenceNumber: 2,
        status: GenerationStatus.PENDING,
      });

      mockTurnFindByClientTurnId.mockResolvedValueOnce(existingTurn);
      mockConvFindById.mockResolvedValueOnce(existingConv);
      mockMessageListByTurn.mockResolvedValueOnce([existingUserMsg, existingAssistantMsg]);

      const useCase = new CreateConversationWithInitialTurnUseCase(
        mockTxRunner,
        mockTurnRepo,
        mockConvRepo,
        mockMessageRepo,
      );

      const result = await useCase.execute({
        tenantId,
        userId,
        clientTurnId,
        userPrompt,
      });

      expect(result.isIdempotentReplay).toBe(true);
      expect(result.idempotencyOutcome).toBe('EXISTING_RECOVERED');
      expect(result.conversationId).toBe('existing-conv-id');
      expect(result.turnId).toBe(existingTurn.id.value);
      // No new records persisted
      expect(mockConvSave).not.toHaveBeenCalled();
      expect(mockTxRunner.runInTransaction).not.toHaveBeenCalled();
    });

    it('should throw DuplicateClientTurnPayloadMismatchError when clientTurnId is reused with different payload', async () => {
      const originalPromptHash = AiPayloadHasher.hash({ prompt: 'Original patient request' });
      const existingTurn = AiConversationTurn.create({
        conversationId: 'existing-conv-id',
        tenantId,
        turnIndex: 1,
        clientTurnId,
        idempotencyKey: clientTurnId,
        idempotencyPayloadHash: originalPromptHash,
      });

      mockTurnFindByClientTurnId.mockResolvedValueOnce(existingTurn);

      const useCase = new CreateConversationWithInitialTurnUseCase(
        mockTxRunner,
        mockTurnRepo,
        mockConvRepo,
        mockMessageRepo,
      );

      await expect(
        useCase.execute({
          tenantId,
          userId,
          clientTurnId,
          userPrompt: 'Different prompt violating idempotency contract',
        }),
      ).rejects.toThrow(DuplicateClientTurnPayloadMismatchError);
    });

    it('should arbitrate concurrent unique-constraint races by recovering the committed turn', async () => {
      const computedHash = AiPayloadHasher.hash({ prompt: userPrompt });
      const committedTurn = AiConversationTurn.create({
        conversationId: 'winner-conv-id',
        tenantId,
        turnIndex: 1,
        clientTurnId,
        idempotencyKey: clientTurnId,
        idempotencyPayloadHash: computedHash,
      });

      const committedConv = AiConversation.create({
        id: 'winner-conv-id',
        tenantId,
        userId,
        title: 'Winner Conv',
      });

      const userMsg = AiConversationMessage.create({
        turnId: committedTurn.id,
        conversationId: 'winner-conv-id',
        tenantId,
        role: ConversationRole.USER,
        sequenceNumber: 1,
        content: userPrompt,
        status: GenerationStatus.SUCCESS,
      });

      // Preliminary check returns null (simulating concurrent execution before either committed)
      mockTurnFindByClientTurnId.mockResolvedValueOnce(null);

      // Transaction runner simulates unique constraint collision from winning transaction
      mockTxRunner.runInTransaction = jest.fn(async () => {
        throw new DuplicateEntityException(
          'AiConversationTurn',
          'uq_turn_tenant_client_turn_id',
          tenantId,
        );
      });

      // Post-failure recovery query returns the committed turn from the winner
      mockTurnFindByClientTurnId.mockResolvedValueOnce(committedTurn);
      mockConvFindById.mockResolvedValueOnce(committedConv);
      mockMessageListByTurn.mockResolvedValueOnce([userMsg]);

      const useCase = new CreateConversationWithInitialTurnUseCase(
        mockTxRunner,
        mockTurnRepo,
        mockConvRepo,
        mockMessageRepo,
      );

      const result = await useCase.execute({
        tenantId,
        userId,
        clientTurnId,
        userPrompt,
      });

      expect(result.isIdempotentReplay).toBe(true);
      expect(result.idempotencyOutcome).toBe('EXISTING_RECOVERED');
      expect(result.conversationId).toBe('winner-conv-id');
    });

    it('should rethrow unrelated persistence failures without swallowing', async () => {
      mockTurnFindByClientTurnId.mockResolvedValueOnce(null);
      mockTxRunner.runInTransaction = jest.fn(async () => {
        throw new Error('Database server terminated abnormally');
      });

      const useCase = new CreateConversationWithInitialTurnUseCase(
        mockTxRunner,
        mockTurnRepo,
        mockConvRepo,
        mockMessageRepo,
      );

      await expect(
        useCase.execute({
          tenantId,
          userId,
          clientTurnId,
          userPrompt,
        }),
      ).rejects.toThrow('Database server terminated abnormally');
    });
  });
});
