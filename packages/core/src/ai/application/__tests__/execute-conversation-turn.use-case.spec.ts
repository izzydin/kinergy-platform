import {
  ExecuteConversationTurnUseCase,
  ExecuteConversationTurnInput,
} from '../use-cases/execute-conversation-turn.use-case';
import { PersistMessageStateUseCase } from '../use-cases/persist-message-state.use-case';
import { IAiConversationRepositoryPort } from '../../ports/outbound/ai-conversation-repository.port';
import { IAiConversationTurnRepositoryPort } from '../../ports/outbound/ai-conversation-turn-repository.port';
import { IAiConversationMessageRepositoryPort } from '../../ports/outbound/ai-conversation-message-repository.port';
import { IAiConversationAuditRepositoryPort } from '../../ports/outbound/ai-conversation-audit-repository.port';
import {
  IRAGTurnPipelinePort,
  RAGTurnExecutionCommand,
  RAGTurnExecutionResult,
} from '../../ports/inbound/rag-turn-pipeline.port';
import { IAiConversationTransactionRunner } from '../ports/ai-conversation-transaction-runner.port';
import { AiConversation } from '../../domain/models/ai-conversation.entity';
import { AiConversationTurn } from '../../domain/models/ai-conversation-turn.entity';
import { AiConversationMessage } from '../../domain/models/ai-conversation-message.entity';
import { ConversationRole } from '../../domain/enums/conversation-role.enum';
import { TurnStatus } from '../../domain/enums/turn-status.enum';
import { GenerationStatus } from '../../domain/enums/generation-status.enum';
import { RAGSourceCitation } from '../../domain/value-objects/rag-source-citation.vo';
import {
  ConversationNotFoundError,
  TurnNotFoundError,
  InvalidConversationLifecycleError,
} from '../errors/ai-conversation-application.error';

describe('BE.06.01 — ExecuteConversationTurnUseCase Unit Tests', () => {
  let useCase: ExecuteConversationTurnUseCase;
  let mockConvRepo: jest.Mocked<IAiConversationRepositoryPort>;
  let mockTurnRepo: jest.Mocked<IAiConversationTurnRepositoryPort>;
  let mockMsgRepo: jest.Mocked<IAiConversationMessageRepositoryPort>;
  let persistMessageStateUseCase: PersistMessageStateUseCase;
  let mockRagPipeline: jest.Mocked<IRAGTurnPipelinePort>;

  const TENANT_ID = 'tenant_clinica_01';
  const USER_ID = 'usr_doc_01';
  const CONVERSATION_ID = 'conv_test_100';
  const TURN_ID = 'turn_test_200';
  const USER_MSG_ID = 'msg_user_001';
  const ASSISTANT_MSG_ID = 'msg_asst_002';

  const defaultInput: ExecuteConversationTurnInput = {
    tenantId: TENANT_ID,
    userId: USER_ID,
    conversationId: CONVERSATION_ID,
    turnId: TURN_ID,
    actorContext: {
      roles: ['Physiotherapist'],
      permissions: ['ai:read', 'ai:write'],
    },
    requestId: 'req-123',
    correlationId: 'corr-123',
  };

  const createMockConversation = (isArchived = false) =>
    AiConversation.create({
      id: CONVERSATION_ID,
      tenantId: TENANT_ID,
      userId: USER_ID,
      title: 'Shoulder Rehabilitation Protocol',
      turnCounter: 1,
      messageCounter: 2,
      deletedAt: isArchived ? new Date() : null,
    });

  const createMockTurn = (status: TurnStatus = TurnStatus.PENDING) =>
    AiConversationTurn.create({
      id: TURN_ID,
      conversationId: CONVERSATION_ID,
      tenantId: TENANT_ID,
      turnIndex: 1,
      status,
      clientTurnId: 'client-turn-100',
      idempotencyKey: `${CONVERSATION_ID}_1`,
      idempotencyPayloadHash: 'hash123',
      activeAttemptId: ASSISTANT_MSG_ID,
      activeAttemptNumber: 1,
    });

  const createMockUserMessage = () =>
    AiConversationMessage.create({
      id: USER_MSG_ID,
      turnId: TURN_ID,
      conversationId: CONVERSATION_ID,
      tenantId: TENANT_ID,
      role: ConversationRole.USER,
      sequenceNumber: 1,
      attemptNumber: 1,
      isCanonical: false,
      status: GenerationStatus.SUCCESS,
      content: 'What are the contraindications for rotator cuff eccentric exercises?',
    });

  const createMockAssistantPlaceholder = () =>
    AiConversationMessage.create({
      id: ASSISTANT_MSG_ID,
      turnId: TURN_ID,
      conversationId: CONVERSATION_ID,
      tenantId: TENANT_ID,
      role: ConversationRole.ASSISTANT,
      sequenceNumber: 2,
      attemptNumber: 1,
      isCanonical: false,
      status: GenerationStatus.PENDING,
      content: '',
    });

  beforeEach(() => {
    mockConvRepo = {
      findById: jest.fn(),
      save: jest.fn(),
      delete: jest.fn(),
      updateMetadata: jest.fn(),
    } as unknown as jest.Mocked<IAiConversationRepositoryPort>;

    mockTurnRepo = {
      findById: jest.fn(),
      save: jest.fn(),
      findActiveTurn: jest.fn(),
      listByConversation: jest.fn().mockResolvedValue([]),
      updateStatus: jest.fn(),
    } as unknown as jest.Mocked<IAiConversationTurnRepositoryPort>;

    mockMsgRepo = {
      findById: jest.fn(),
      findBySequenceNumber: jest.fn(),
      save: jest.fn(),
      listByTurn: jest.fn(),
      listCanonicalHistory: jest.fn(),
      updateStatus: jest.fn(),
    } as unknown as jest.Mocked<IAiConversationMessageRepositoryPort>;

    persistMessageStateUseCase = new PersistMessageStateUseCase(mockMsgRepo);

    mockRagPipeline = {
      executeTurn: jest.fn(),
    };

    useCase = new ExecuteConversationTurnUseCase(
      mockConvRepo,
      mockTurnRepo,
      mockMsgRepo,
      persistMessageStateUseCase,
      mockRagPipeline,
    );
  });

  it('1. successfully executes turn through RAG pipeline and persists grounded answer and sources', async () => {
    const conversation = createMockConversation();
    const turn = createMockTurn();
    const userMsg = createMockUserMessage();
    const asstMsg = createMockAssistantPlaceholder();

    mockConvRepo.findById.mockResolvedValue(conversation);
    mockTurnRepo.findById.mockResolvedValue(turn);
    mockMsgRepo.listByTurn.mockResolvedValue([userMsg, asstMsg]);
    mockMsgRepo.findById.mockResolvedValue(asstMsg);
    mockMsgRepo.listCanonicalHistory.mockResolvedValue({
      messages: [userMsg],
      nextCursor: null,
      hasMore: false,
    });

    const mockCitation = RAGSourceCitation.create({
      documentId: 'doc_rotator_cuff_01',
      documentTitle: 'Rotator Cuff Protocol 2026',
      chunkId: 'chunk_99',
      pageNumber: 14,
      relevanceScore: 0.94,
    });

    const mockRagResult: RAGTurnExecutionResult = {
      outcome: 'SUCCESS',
      content: 'Eccentric exercises are contraindicated during acute inflammatory flare-ups.',
      isGrounded: true,
      sources: [mockCitation],
      metadata: {
        model: 'mistral-7b',
        retrievalCount: 3,
        latencyMs: 1450,
      },
    };

    mockRagPipeline.executeTurn.mockResolvedValue(mockRagResult);

    (mockMsgRepo.updateStatus as jest.Mock).mockResolvedValue(
      AiConversationMessage.create({
        id: ASSISTANT_MSG_ID,
        turnId: TURN_ID,
        conversationId: CONVERSATION_ID,
        tenantId: TENANT_ID,
        role: ConversationRole.ASSISTANT,
        sequenceNumber: 2,
        attemptNumber: 1,
        isCanonical: true,
        status: GenerationStatus.SUCCESS,
        content: mockRagResult.content,
      }),
    );

    const result = await useCase.execute(defaultInput);

    // Verify RAG invocation arguments
    expect(mockRagPipeline.executeTurn).toHaveBeenCalledWith(
      expect.objectContaining<Partial<RAGTurnExecutionCommand>>({
        tenantId: TENANT_ID,
        conversationId: CONVERSATION_ID,
        turnId: TURN_ID,
        userMessageId: USER_MSG_ID,
        userPrompt: userMsg.content,
        attemptId: ASSISTANT_MSG_ID,
        attemptNumber: 1,
      }),
    );

    // Verify message persistence updated with SUCCESS, isCanonical: true, sources, and metadata
    expect(mockMsgRepo.updateStatus).toHaveBeenCalledWith(
      TENANT_ID,
      CONVERSATION_ID,
      ASSISTANT_MSG_ID,
      expect.objectContaining({
        status: GenerationStatus.SUCCESS,
        content: mockRagResult.content,
        isCanonical: true,
        sources: [
          expect.objectContaining({
            documentId: 'doc_rotator_cuff_01',
            chunkId: 'chunk_99',
            relevanceScore: 0.94,
          }),
        ],
      }),
    );

    // Verify turn marked COMPLETED
    expect(mockTurnRepo.updateStatus).toHaveBeenCalledWith(
      TENANT_ID,
      CONVERSATION_ID,
      TURN_ID,
      expect.objectContaining({
        status: TurnStatus.COMPLETED,
      }),
    );

    // Verify conversation lastActivityAt updated
    expect(mockConvRepo.updateMetadata).toHaveBeenCalledWith(
      TENANT_ID,
      CONVERSATION_ID,
      expect.objectContaining({
        lastActivityAt: expect.any(Date),
      }),
    );

    expect(result.outcome).toBe('SUCCESS');
    expect(result.isGrounded).toBe(true);
    expect(result.turnStatus).toBe(TurnStatus.COMPLETED);
    expect(result.content).toBe(mockRagResult.content);
  });

  it('2. handles RAG abstention gracefully by persisting abstention message with canonical SUCCESS', async () => {
    const conversation = createMockConversation();
    const turn = createMockTurn();
    const userMsg = createMockUserMessage();
    const asstMsg = createMockAssistantPlaceholder();

    mockConvRepo.findById.mockResolvedValue(conversation);
    mockTurnRepo.findById.mockResolvedValue(turn);
    mockMsgRepo.listByTurn.mockResolvedValue([userMsg, asstMsg]);
    mockMsgRepo.findById.mockResolvedValue(asstMsg);
    mockMsgRepo.listCanonicalHistory.mockResolvedValue({
      messages: [],
      nextCursor: null,
      hasMore: false,
    });

    const mockAbstentionResult: RAGTurnExecutionResult = {
      outcome: 'ABSTAINED',
      content: 'No verified clinical documentation was found regarding this inquiry.',
      isGrounded: false,
      sources: [],
      metadata: {
        model: 'none',
        retrievalCount: 0,
        latencyMs: 120,
        finishReason: 'insufficient_context',
      },
    };

    mockRagPipeline.executeTurn.mockResolvedValue(mockAbstentionResult);

    (mockMsgRepo.updateStatus as jest.Mock).mockResolvedValue(
      AiConversationMessage.create({
        id: ASSISTANT_MSG_ID,
        turnId: TURN_ID,
        conversationId: CONVERSATION_ID,
        tenantId: TENANT_ID,
        role: ConversationRole.ASSISTANT,
        sequenceNumber: 2,
        attemptNumber: 1,
        isCanonical: true,
        status: GenerationStatus.SUCCESS,
        content: mockAbstentionResult.content,
      }),
    );

    const result = await useCase.execute(defaultInput);

    expect(result.outcome).toBe('ABSTAINED');
    expect(result.isGrounded).toBe(false);
    expect(result.turnStatus).toBe(TurnStatus.COMPLETED);
    expect(result.content).toContain('No verified clinical documentation');

    // Canonical status must be SUCCESS so client can read the abstention
    expect(mockMsgRepo.updateStatus).toHaveBeenCalledWith(
      TENANT_ID,
      CONVERSATION_ID,
      ASSISTANT_MSG_ID,
      expect.objectContaining({
        status: GenerationStatus.SUCCESS,
        content: mockAbstentionResult.content,
        isCanonical: true,
      }),
    );
  });

  it('3. handles pipeline cancellation and marks assistant message and turn CANCELLED', async () => {
    const conversation = createMockConversation();
    const turn = createMockTurn();
    const userMsg = createMockUserMessage();
    const asstMsg = createMockAssistantPlaceholder();

    mockConvRepo.findById.mockResolvedValue(conversation);
    mockTurnRepo.findById.mockResolvedValue(turn);
    mockMsgRepo.listByTurn.mockResolvedValue([userMsg, asstMsg]);
    mockMsgRepo.findById.mockResolvedValue(asstMsg);
    mockMsgRepo.listCanonicalHistory.mockResolvedValue({
      messages: [],
      nextCursor: null,
      hasMore: false,
    });

    const mockCancelledResult: RAGTurnExecutionResult = {
      outcome: 'CANCELLED',
      content: '',
      isGrounded: false,
      sources: [],
      metadata: {
        model: 'none',
        retrievalCount: 0,
        latencyMs: 300,
        finishReason: 'cancelled',
      },
      errorMessage: 'Generation was cancelled.',
    };

    mockRagPipeline.executeTurn.mockResolvedValue(mockCancelledResult);

    (mockMsgRepo.updateStatus as jest.Mock).mockResolvedValue(
      AiConversationMessage.create({
        id: ASSISTANT_MSG_ID,
        turnId: TURN_ID,
        conversationId: CONVERSATION_ID,
        tenantId: TENANT_ID,
        role: ConversationRole.ASSISTANT,
        sequenceNumber: 2,
        attemptNumber: 1,
        isCanonical: false,
        status: GenerationStatus.CANCELLED,
        content: '',
      }),
    );

    const result = await useCase.execute(defaultInput);

    expect(result.outcome).toBe('CANCELLED');
    expect(result.turnStatus).toBe(TurnStatus.CANCELLED);
    expect(result.isCanonical).toBe(false);

    expect(mockMsgRepo.updateStatus).toHaveBeenCalledWith(
      TENANT_ID,
      CONVERSATION_ID,
      ASSISTANT_MSG_ID,
      expect.objectContaining({
        status: GenerationStatus.CANCELLED,
        isCanonical: false,
      }),
    );

    expect(mockTurnRepo.updateStatus).toHaveBeenCalledWith(
      TENANT_ID,
      CONVERSATION_ID,
      TURN_ID,
      expect.objectContaining({
        status: TurnStatus.CANCELLED,
      }),
    );
  });

  it('4. handles pipeline failure and marks assistant message and turn FAILED', async () => {
    const conversation = createMockConversation();
    const turn = createMockTurn();
    const userMsg = createMockUserMessage();
    const asstMsg = createMockAssistantPlaceholder();

    mockConvRepo.findById.mockResolvedValue(conversation);
    mockTurnRepo.findById.mockResolvedValue(turn);
    mockMsgRepo.listByTurn.mockResolvedValue([userMsg, asstMsg]);
    mockMsgRepo.findById.mockResolvedValue(asstMsg);
    mockMsgRepo.listCanonicalHistory.mockResolvedValue({
      messages: [],
      nextCursor: null,
      hasMore: false,
    });

    const mockFailedResult: RAGTurnExecutionResult = {
      outcome: 'FAILED',
      content: '',
      isGrounded: false,
      sources: [],
      metadata: {
        model: 'none',
        retrievalCount: 0,
        latencyMs: 1500,
        finishReason: 'error',
      },
      errorCode: 'LLM_TIMEOUT',
      errorMessage: 'Connection to local inference model timed out.',
    };

    mockRagPipeline.executeTurn.mockResolvedValue(mockFailedResult);

    (mockMsgRepo.updateStatus as jest.Mock).mockResolvedValue(
      AiConversationMessage.create({
        id: ASSISTANT_MSG_ID,
        turnId: TURN_ID,
        conversationId: CONVERSATION_ID,
        tenantId: TENANT_ID,
        role: ConversationRole.ASSISTANT,
        sequenceNumber: 2,
        attemptNumber: 1,
        isCanonical: false,
        status: GenerationStatus.FAILED,
        content: '',
      }),
    );

    const result = await useCase.execute(defaultInput);

    expect(result.outcome).toBe('FAILED');
    expect(result.turnStatus).toBe(TurnStatus.FAILED);
    expect(result.errorCode).toBe('LLM_TIMEOUT');

    expect(mockMsgRepo.updateStatus).toHaveBeenCalledWith(
      TENANT_ID,
      CONVERSATION_ID,
      ASSISTANT_MSG_ID,
      expect.objectContaining({
        status: GenerationStatus.FAILED,
        errorCode: 'LLM_TIMEOUT',
      }),
    );

    expect(mockTurnRepo.updateStatus).toHaveBeenCalledWith(
      TENANT_ID,
      CONVERSATION_ID,
      TURN_ID,
      expect.objectContaining({
        status: TurnStatus.FAILED,
      }),
    );
  });

  it('5. throws ConversationNotFoundError when conversation does not exist', async () => {
    mockConvRepo.findById.mockResolvedValue(null);

    await expect(useCase.execute(defaultInput)).rejects.toThrow(ConversationNotFoundError);
  });

  it('6. throws InvalidConversationLifecycleError when conversation is archived', async () => {
    const archivedConv = createMockConversation(true);
    mockConvRepo.findById.mockResolvedValue(archivedConv);

    await expect(useCase.execute(defaultInput)).rejects.toThrow(InvalidConversationLifecycleError);
  });

  it('7. throws TurnNotFoundError when turn does not exist', async () => {
    const conversation = createMockConversation();
    mockConvRepo.findById.mockResolvedValue(conversation);
    mockTurnRepo.findById.mockResolvedValue(null);

    await expect(useCase.execute(defaultInput)).rejects.toThrow(TurnNotFoundError);
  });

  it('8. rejects already terminal turn with InvalidConversationLifecycleError', async () => {
    const conversation = createMockConversation();
    const completedTurn = createMockTurn(TurnStatus.COMPLETED);
    mockConvRepo.findById.mockResolvedValue(conversation);
    mockTurnRepo.findById.mockResolvedValue(completedTurn);

    await expect(useCase.execute(defaultInput)).rejects.toThrow(InvalidConversationLifecycleError);
  });

  it('9. integrates with canonical history loader and supplies prior completed turns to RAG pipeline', async () => {
    const conversation = createMockConversation();
    const turn = AiConversationTurn.create({
      id: TURN_ID,
      conversationId: CONVERSATION_ID,
      tenantId: TENANT_ID,
      turnIndex: 2,
      status: TurnStatus.PENDING,
      clientTurnId: 'client-turn-2',
      idempotencyKey: `${CONVERSATION_ID}_2`,
      idempotencyPayloadHash: 'hash2',
      activeAttemptId: ASSISTANT_MSG_ID,
      activeAttemptNumber: 1,
    });
    const userMsg = createMockUserMessage();
    const asstMsg = createMockAssistantPlaceholder();

    mockConvRepo.findById.mockResolvedValue(conversation);
    mockTurnRepo.findById.mockResolvedValue(turn);
    mockMsgRepo.findById.mockResolvedValue(asstMsg);
    (mockMsgRepo.updateStatus as jest.Mock).mockResolvedValue(
      AiConversationMessage.create({
        id: ASSISTANT_MSG_ID,
        turnId: TURN_ID,
        conversationId: CONVERSATION_ID,
        tenantId: TENANT_ID,
        role: ConversationRole.ASSISTANT,
        sequenceNumber: 2,
        attemptNumber: 1,
        isCanonical: true,
        status: GenerationStatus.SUCCESS,
        content: 'New grounded answer',
      }),
    );

    const prevTurn = AiConversationTurn.create({
      id: 'turn_prev_1',
      conversationId: CONVERSATION_ID,
      tenantId: TENANT_ID,
      turnIndex: 1,
      status: TurnStatus.COMPLETED,
      clientTurnId: 'client-turn-prev',
      idempotencyKey: `${CONVERSATION_ID}_1`,
      idempotencyPayloadHash: 'hash1',
      activeAttemptId: 'asst_prev_1',
      activeAttemptNumber: 1,
    });

    mockTurnRepo.listByConversation.mockResolvedValue([prevTurn]);

    mockMsgRepo.listByTurn.mockImplementation(async (_t, _c, tid) => {
      const idStr = typeof tid === 'string' ? tid : tid.value;
      if (idStr === TURN_ID) return [userMsg, asstMsg];
      if (idStr === 'turn_prev_1') {
        return [
          AiConversationMessage.create({
            id: 'u_prev_1',
            turnId: 'turn_prev_1',
            conversationId: CONVERSATION_ID,
            tenantId: TENANT_ID,
            role: ConversationRole.USER,
            sequenceNumber: 1,
            attemptNumber: 1,
            content: 'Previous query',
          }),
          AiConversationMessage.create({
            id: 'asst_prev_1',
            turnId: 'turn_prev_1',
            conversationId: CONVERSATION_ID,
            tenantId: TENANT_ID,
            role: ConversationRole.ASSISTANT,
            sequenceNumber: 2,
            attemptNumber: 1,
            isCanonical: true,
            status: GenerationStatus.SUCCESS,
            content: 'Previous answer',
          }),
        ];
      }
      return [];
    });

    mockRagPipeline.executeTurn.mockResolvedValue({
      outcome: 'SUCCESS',
      content: 'New grounded answer',
      isGrounded: true,
      sources: [],
      metadata: {
        model: 'mistral-clinical',
        retrievalCount: 2,
        latencyMs: 120,
        finishReason: 'stop',
      },
    });

    const result = await useCase.execute(defaultInput);

    expect(result.outcome).toBe('SUCCESS');
    expect(result.completedTurnsCount).toBe(1);
    expect(result.isContextTruncated).toBe(false);

    expect(mockRagPipeline.executeTurn).toHaveBeenCalledWith(
      expect.objectContaining({
        canonicalHistory: [
          expect.objectContaining({ role: 'user', content: 'Previous query' }),
          expect.objectContaining({ role: 'assistant', content: 'Previous answer' }),
        ],
        userPrompt: userMsg.content,
      }),
    );
  });

  describe('BE.06.04 — Generation Lifecycle, Fencing & Canonical Persistence Tests', () => {
    it('10. idempotent retry: retrying an already COMPLETED turn returns existing canonical result without re-executing RAG', async () => {
      const conversation = createMockConversation();
      const completedTurn = AiConversationTurn.create({
        id: TURN_ID,
        conversationId: CONVERSATION_ID,
        tenantId: TENANT_ID,
        turnIndex: 1,
        status: TurnStatus.COMPLETED,
        clientTurnId: 'client-turn-100',
        idempotencyKey: `${CONVERSATION_ID}_1`,
        idempotencyPayloadHash: 'hash123',
        activeAttemptId: ASSISTANT_MSG_ID,
        activeAttemptNumber: 1,
        completedAt: new Date('2026-11-23T10:00:00Z'),
      });

      const canonicalAsstMsg = AiConversationMessage.create({
        id: ASSISTANT_MSG_ID,
        turnId: TURN_ID,
        conversationId: CONVERSATION_ID,
        tenantId: TENANT_ID,
        role: ConversationRole.ASSISTANT,
        sequenceNumber: 2,
        attemptNumber: 1,
        isCanonical: true,
        status: GenerationStatus.SUCCESS,
        content: 'Existing persisted canonical rehabilitation guidance.',
        metadata: {
          isGrounded: true,
          historyTurnCount: 0,
        },
      });

      mockConvRepo.findById.mockResolvedValue(conversation);
      mockTurnRepo.findById.mockResolvedValue(completedTurn);
      mockMsgRepo.findCanonicalAssistantMessage = jest.fn().mockResolvedValue(canonicalAsstMsg);

      const result = await useCase.execute(defaultInput);

      expect(result.turnStatus).toBe(TurnStatus.COMPLETED);
      expect(result.isCanonical).toBe(true);
      expect(result.content).toBe('Existing persisted canonical rehabilitation guidance.');
      expect(result.assistantMessageId).toBe(ASSISTANT_MSG_ID);
      // RAG pipeline must NOT be executed for already completed turn
      expect(mockRagPipeline.executeTurn).not.toHaveBeenCalled();
    });

    it('11. executes atomic success finalization using IAiConversationTransactionRunner', async () => {
      const conversation = createMockConversation();
      const turn = createMockTurn();
      const userMsg = createMockUserMessage();
      const asstMsg = createMockAssistantPlaceholder();

      mockConvRepo.findById.mockResolvedValue(conversation);
      mockTurnRepo.findById.mockResolvedValue(turn);
      mockMsgRepo.listByTurn.mockResolvedValue([userMsg, asstMsg]);
      mockMsgRepo.findById.mockResolvedValue(asstMsg);
      (mockMsgRepo.updateStatus as jest.Mock).mockResolvedValue(asstMsg);

      const mockCitation = RAGSourceCitation.create({
        documentId: 'doc_1',
        documentTitle: 'Title 1',
        chunkId: 'chunk_1',
        relevanceScore: 0.95,
      });

      mockRagPipeline.executeTurn.mockResolvedValue({
        outcome: 'SUCCESS',
        content: 'Atomic transactional response.',
        isGrounded: true,
        sources: [mockCitation],
        metadata: { model: 'mistral-7b', retrievalCount: 1, latencyMs: 150 },
      });

      // Create transactional repos
      const txConvRepo = {
        ...mockConvRepo,
        updateMetadata: jest.fn().mockResolvedValue(conversation),
      } as unknown as jest.Mocked<IAiConversationRepositoryPort>;

      const txTurnRepo = {
        ...mockTurnRepo,
        findById: jest.fn().mockResolvedValue(turn),
        updateStatus: jest.fn().mockResolvedValue(turn),
      } as unknown as jest.Mocked<IAiConversationTurnRepositoryPort>;

      const txMsgRepo = {
        ...mockMsgRepo,
        findById: jest.fn().mockResolvedValue(asstMsg),
        updateStatus: jest.fn().mockResolvedValue(asstMsg),
      } as unknown as jest.Mocked<IAiConversationMessageRepositoryPort>;

      const mockTxRunner: IAiConversationTransactionRunner = {
        runInTransaction: jest.fn().mockImplementation(async (work) => {
          return work({
            conversationRepo: txConvRepo,
            turnRepo: txTurnRepo,
            messageRepo: txMsgRepo,
            auditRepo: {} as unknown as IAiConversationAuditRepositoryPort,
          });
        }),
      };

      const transactionalUseCase = new ExecuteConversationTurnUseCase(
        mockConvRepo,
        mockTurnRepo,
        mockMsgRepo,
        persistMessageStateUseCase,
        mockRagPipeline,
        undefined,
        mockTxRunner,
      );

      const result = await transactionalUseCase.execute(defaultInput);

      expect(result.outcome).toBe('SUCCESS');
      expect(result.turnStatus).toBe(TurnStatus.COMPLETED);
      expect(mockTxRunner.runInTransaction).toHaveBeenCalledTimes(1);
      expect(txMsgRepo.updateStatus).toHaveBeenCalledWith(
        TENANT_ID,
        CONVERSATION_ID,
        ASSISTANT_MSG_ID,
        expect.objectContaining({
          status: GenerationStatus.SUCCESS,
          isCanonical: true,
          content: 'Atomic transactional response.',
        }),
      );
      expect(txTurnRepo.updateStatus).toHaveBeenCalledWith(
        TENANT_ID,
        CONVERSATION_ID,
        TURN_ID,
        expect.objectContaining({
          status: TurnStatus.COMPLETED,
        }),
      );
      expect(txConvRepo.updateMetadata).toHaveBeenCalledWith(
        TENANT_ID,
        CONVERSATION_ID,
        expect.objectContaining({
          lastActivityAt: expect.any(Date),
        }),
      );
    });

    it('12. executes atomic failure finalization inside transaction when RAG returns typed FAILED', async () => {
      const conversation = createMockConversation();
      const turn = createMockTurn();
      const userMsg = createMockUserMessage();
      const asstMsg = createMockAssistantPlaceholder();

      mockConvRepo.findById.mockResolvedValue(conversation);
      mockTurnRepo.findById.mockResolvedValue(turn);
      mockMsgRepo.listByTurn.mockResolvedValue([userMsg, asstMsg]);
      mockMsgRepo.findById.mockResolvedValue(asstMsg);
      (mockMsgRepo.updateStatus as jest.Mock).mockResolvedValue(asstMsg);

      mockRagPipeline.executeTurn.mockResolvedValue({
        outcome: 'FAILED',
        content: '',
        isGrounded: false,
        sources: [],
        errorCode: 'RETRIEVAL_PERSISTENCE_ERROR',
        errorMessage: 'Vector database connection reset.',
        metadata: { model: 'mistral-7b', retrievalCount: 0, latencyMs: 50 },
      });

      const txConvRepo = {
        ...mockConvRepo,
        updateMetadata: jest.fn().mockResolvedValue(conversation),
      } as unknown as jest.Mocked<IAiConversationRepositoryPort>;

      const txTurnRepo = {
        ...mockTurnRepo,
        findById: jest.fn().mockResolvedValue(turn),
        updateStatus: jest.fn().mockResolvedValue(turn),
      } as unknown as jest.Mocked<IAiConversationTurnRepositoryPort>;

      const txMsgRepo = {
        ...mockMsgRepo,
        findById: jest.fn().mockResolvedValue(asstMsg),
        updateStatus: jest.fn().mockResolvedValue(asstMsg),
      } as unknown as jest.Mocked<IAiConversationMessageRepositoryPort>;

      const mockTxRunner: IAiConversationTransactionRunner = {
        runInTransaction: jest.fn().mockImplementation(async (work) => {
          return work({
            conversationRepo: txConvRepo,
            turnRepo: txTurnRepo,
            messageRepo: txMsgRepo,
            auditRepo: {} as unknown as IAiConversationAuditRepositoryPort,
          });
        }),
      };

      const transactionalUseCase = new ExecuteConversationTurnUseCase(
        mockConvRepo,
        mockTurnRepo,
        mockMsgRepo,
        persistMessageStateUseCase,
        mockRagPipeline,
        undefined,
        mockTxRunner,
      );

      const result = await transactionalUseCase.execute(defaultInput);

      expect(result.outcome).toBe('FAILED');
      expect(result.turnStatus).toBe(TurnStatus.FAILED);
      expect(result.isCanonical).toBe(false);
      expect(txMsgRepo.updateStatus).toHaveBeenCalledWith(
        TENANT_ID,
        CONVERSATION_ID,
        ASSISTANT_MSG_ID,
        expect.objectContaining({
          status: GenerationStatus.FAILED,
          isCanonical: false,
          errorCode: 'RETRIEVAL_PERSISTENCE_ERROR',
        }),
      );
      expect(txTurnRepo.updateStatus).toHaveBeenCalledWith(
        TENANT_ID,
        CONVERSATION_ID,
        TURN_ID,
        expect.objectContaining({
          status: TurnStatus.FAILED,
        }),
      );
    });

    it('13. fencing: late LLM response aborts finalization when turn was concurrently CANCELLED', async () => {
      const conversation = createMockConversation();
      const initialTurn = createMockTurn();
      const userMsg = createMockUserMessage();
      const asstMsg = createMockAssistantPlaceholder();

      mockConvRepo.findById.mockResolvedValue(conversation);
      mockTurnRepo.findById.mockResolvedValue(initialTurn);
      mockMsgRepo.listByTurn.mockResolvedValue([userMsg, asstMsg]);
      mockMsgRepo.findById.mockResolvedValue(asstMsg);
      (mockMsgRepo.updateStatus as jest.Mock).mockResolvedValue(asstMsg);

      // LLM produces a response
      mockRagPipeline.executeTurn.mockResolvedValue({
        outcome: 'SUCCESS',
        content: 'Late response that arrived after client cancelled.',
        isGrounded: true,
        sources: [],
        metadata: { model: 'mistral-7b', retrievalCount: 0, latencyMs: 50 },
      });

      // Inside transaction, the turn is found to have been CANCELLED concurrently!
      const cancelledTurn = AiConversationTurn.create({
        id: TURN_ID,
        conversationId: CONVERSATION_ID,
        tenantId: TENANT_ID,
        turnIndex: 1,
        status: TurnStatus.CANCELLED,
        clientTurnId: 'client-turn-100',
        idempotencyKey: `${CONVERSATION_ID}_1`,
        idempotencyPayloadHash: 'hash123',
        activeAttemptId: ASSISTANT_MSG_ID,
        activeAttemptNumber: 1,
        completedAt: new Date(),
      });

      const txTurnRepo = {
        ...mockTurnRepo,
        findById: jest.fn().mockResolvedValue(cancelledTurn),
        updateStatus: jest.fn(),
      } as unknown as jest.Mocked<IAiConversationTurnRepositoryPort>;

      const txMsgRepo = {
        ...mockMsgRepo,
        updateStatus: jest.fn(),
      } as unknown as jest.Mocked<IAiConversationMessageRepositoryPort>;

      const mockTxRunner: IAiConversationTransactionRunner = {
        runInTransaction: jest.fn().mockImplementation(async (work) => {
          return work({
            conversationRepo: mockConvRepo,
            turnRepo: txTurnRepo,
            messageRepo: txMsgRepo,
            auditRepo: {} as unknown as IAiConversationAuditRepositoryPort,
          });
        }),
      };

      const transactionalUseCase = new ExecuteConversationTurnUseCase(
        mockConvRepo,
        mockTurnRepo,
        mockMsgRepo,
        persistMessageStateUseCase,
        mockRagPipeline,
        undefined,
        mockTxRunner,
      );

      const result = await transactionalUseCase.execute(defaultInput);

      // Must abort and preserve CANCELLED status; must NOT overwrite with SUCCESS
      expect(result.outcome).toBe('CANCELLED');
      expect(result.turnStatus).toBe(TurnStatus.CANCELLED);
      expect(result.isCanonical).toBe(false);
      expect(txMsgRepo.updateStatus).not.toHaveBeenCalled();
      expect(txTurnRepo.updateStatus).not.toHaveBeenCalled();
    });

    it('14. fencing: rejects finalization when attempt identity is superseded by a newer attempt', async () => {
      const conversation = createMockConversation();
      const initialTurn = createMockTurn();
      const userMsg = createMockUserMessage();
      const asstMsg = createMockAssistantPlaceholder();

      mockConvRepo.findById.mockResolvedValue(conversation);
      mockTurnRepo.findById.mockResolvedValue(initialTurn);
      mockMsgRepo.listByTurn.mockResolvedValue([userMsg, asstMsg]);
      mockMsgRepo.findById.mockResolvedValue(asstMsg);
      (mockMsgRepo.updateStatus as jest.Mock).mockResolvedValue(asstMsg);

      mockRagPipeline.executeTurn.mockResolvedValue({
        outcome: 'SUCCESS',
        content: 'Answer for attempt 1.',
        isGrounded: true,
        sources: [],
        metadata: { model: 'mistral-7b', retrievalCount: 0, latencyMs: 50 },
      });

      // Inside transaction, turn now has activeAttemptNumber = 2 and a new activeAttemptId
      const supersededTurn = AiConversationTurn.create({
        id: TURN_ID,
        conversationId: CONVERSATION_ID,
        tenantId: TENANT_ID,
        turnIndex: 1,
        status: TurnStatus.STREAMING,
        clientTurnId: 'client-turn-100',
        idempotencyKey: `${CONVERSATION_ID}_1`,
        idempotencyPayloadHash: 'hash123',
        activeAttemptId: 'msg_new_attempt_003',
        activeAttemptNumber: 2,
      });

      const txTurnRepo = {
        ...mockTurnRepo,
        findById: jest.fn().mockResolvedValue(supersededTurn),
        updateStatus: jest.fn(),
      } as unknown as jest.Mocked<IAiConversationTurnRepositoryPort>;

      const txMsgRepo = {
        ...mockMsgRepo,
        updateStatus: jest.fn(),
      } as unknown as jest.Mocked<IAiConversationMessageRepositoryPort>;

      const mockTxRunner: IAiConversationTransactionRunner = {
        runInTransaction: jest.fn().mockImplementation(async (work) => {
          return work({
            conversationRepo: mockConvRepo,
            turnRepo: txTurnRepo,
            messageRepo: txMsgRepo,
            auditRepo: {} as unknown as IAiConversationAuditRepositoryPort,
          });
        }),
      };

      const transactionalUseCase = new ExecuteConversationTurnUseCase(
        mockConvRepo,
        mockTurnRepo,
        mockMsgRepo,
        persistMessageStateUseCase,
        mockRagPipeline,
        undefined,
        mockTxRunner,
      );

      const result = await transactionalUseCase.execute(defaultInput);

      expect(result.outcome).toBe('FAILED');
      expect(result.errorCode).toBe('ATTEMPT_SUPERSEDED');
      expect(txMsgRepo.updateStatus).not.toHaveBeenCalled();
      expect(txTurnRepo.updateStatus).not.toHaveBeenCalled();
    });

    it('15. verifies exactly one canonical assistant message per turn invariant', async () => {
      const conversation = createMockConversation();
      const turn = createMockTurn();
      const userMsg = createMockUserMessage();
      const asstMsg = createMockAssistantPlaceholder();

      mockConvRepo.findById.mockResolvedValue(conversation);
      mockTurnRepo.findById.mockResolvedValue(turn);
      mockMsgRepo.listByTurn.mockResolvedValue([userMsg, asstMsg]);
      mockMsgRepo.findById.mockResolvedValue(asstMsg);
      (mockMsgRepo.updateStatus as jest.Mock).mockResolvedValue(asstMsg);

      mockRagPipeline.executeTurn.mockResolvedValue({
        outcome: 'SUCCESS',
        content: 'Unique canonical answer.',
        isGrounded: true,
        sources: [],
        metadata: { model: 'mistral-7b', retrievalCount: 0, latencyMs: 50 },
      });

      const result = await useCase.execute(defaultInput);

      expect(result.isCanonical).toBe(true);
      expect(result.assistantMessageId).toBe(ASSISTANT_MSG_ID);
      expect(mockMsgRepo.updateStatus).toHaveBeenCalledWith(
        TENANT_ID,
        CONVERSATION_ID,
        ASSISTANT_MSG_ID,
        expect.objectContaining({
          isCanonical: true,
          status: GenerationStatus.SUCCESS,
        }),
      );
    });
  });
});
