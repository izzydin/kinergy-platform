import { Test, TestingModule } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import { AiModule } from '../ai.module';
import {
  RAG_TURN_PIPELINE_PORT,
  IRAGTurnPipelinePort,
  GENERATE_GROUNDED_ANSWER_USE_CASE_PORT,
  IGenerateGroundedAnswerUseCase,
  ExecuteConversationTurnUseCase,
  RAGAnswer,
  RAGSourceCitation,
  AI_CONVERSATION_REPOSITORY_PORT,
  AI_CONVERSATION_TURN_REPOSITORY_PORT,
  AI_CONVERSATION_MESSAGE_REPOSITORY_PORT,
  IAiConversationRepositoryPort,
  IAiConversationTurnRepositoryPort,
  IAiConversationMessageRepositoryPort,
  AiConversation,
  AiConversationTurn,
  AiConversationMessage,
  ConversationRole,
  TurnStatus,
  GenerationStatus,
} from '@kinergy-platform/core';
import { RAGTurnPipelineAdapter } from '../adapters/rag/rag-turn-pipeline.adapter';
import { PrismaService } from '../../platform/persistence/prisma/prisma.service';
import { AuthenticationGuard } from '../../platform/identity/guards/authentication.guard';
import { AuthorizationGuard } from '../../platform/identity/authorization/authorization.guard';
import {
  PrismaAiConversationRepository,
  PrismaAiConversationTurnRepository,
  PrismaAiConversationMessageRepository,
} from '@kinergy-platform/core/server';

describe('BE.06.01 — AI-08 / AI-09.3 Composition Root & Integration Wiring', () => {
  let moduleRef: TestingModule;
  let ragPipeline: IRAGTurnPipelinePort;
  let executeTurnUseCase: ExecuteConversationTurnUseCase;
  let mockRagOrchestrator: jest.Mocked<IGenerateGroundedAnswerUseCase>;
  let mockConvRepo: jest.Mocked<IAiConversationRepositoryPort>;
  let mockTurnRepo: jest.Mocked<IAiConversationTurnRepositoryPort>;
  let mockMsgRepo: jest.Mocked<IAiConversationMessageRepositoryPort>;

  const TENANT_ID = 'tenant_composition_01';
  const USER_ID = 'usr_comp_01';
  const CONVERSATION_ID = 'conv_comp_100';
  const TURN_ID = 'turn_comp_200';
  const USER_MSG_ID = 'msg_user_comp_001';
  const ASST_MSG_ID = 'msg_asst_comp_002';

  beforeAll(async () => {
    mockRagOrchestrator = {
      execute: jest.fn(),
    };

    mockConvRepo = {
      findById: jest.fn(),
      save: jest.fn(),
      delete: jest.fn(),
      updateMetadata: jest.fn(),
    } as unknown as jest.Mocked<IAiConversationRepositoryPort>;

    mockTurnRepo = {
      findById: jest.fn(),
      save: jest.fn(),
      listByConversation: jest.fn().mockResolvedValue([]),
      updateStatus: jest.fn(),
    } as unknown as jest.Mocked<IAiConversationTurnRepositoryPort>;

    mockMsgRepo = {
      findById: jest.fn(),
      save: jest.fn(),
      listByTurn: jest.fn(),
      listCanonicalHistory: jest.fn(),
      updateStatus: jest.fn(),
    } as unknown as jest.Mocked<IAiConversationMessageRepositoryPort>;

    moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          load: [
            () => ({
              AI_ENABLED: true,
              AI_LLM_PROVIDER: 'mock',
              AI_EMBEDDING_PROVIDER: 'mock',
            }),
          ],
        }),
        AiModule.forRoot({ useMocks: true }),
      ],
    })
      .overrideProvider(PrismaService)
      .useValue({
        $connect: jest.fn(),
        $disconnect: jest.fn(),
      })
      .overrideProvider(GENERATE_GROUNDED_ANSWER_USE_CASE_PORT)
      .useValue(mockRagOrchestrator)
      .overrideProvider(AI_CONVERSATION_REPOSITORY_PORT)
      .useValue(mockConvRepo)
      .overrideProvider(PrismaAiConversationRepository)
      .useValue(mockConvRepo)
      .overrideProvider(AI_CONVERSATION_TURN_REPOSITORY_PORT)
      .useValue(mockTurnRepo)
      .overrideProvider(PrismaAiConversationTurnRepository)
      .useValue(mockTurnRepo)
      .overrideProvider(AI_CONVERSATION_MESSAGE_REPOSITORY_PORT)
      .useValue(mockMsgRepo)
      .overrideProvider(PrismaAiConversationMessageRepository)
      .useValue(mockMsgRepo)
      .overrideGuard(AuthenticationGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(AuthorizationGuard)
      .useValue({ canActivate: () => true })
      .compile();

    ragPipeline = moduleRef.get<IRAGTurnPipelinePort>(RAG_TURN_PIPELINE_PORT);
    executeTurnUseCase = moduleRef.get<ExecuteConversationTurnUseCase>(
      ExecuteConversationTurnUseCase,
    );
  });

  afterAll(async () => {
    await moduleRef.close();
  });

  it('1. successfully resolves RAGTurnPipelineAdapter bound to RAG_TURN_PIPELINE_PORT', () => {
    expect(ragPipeline).toBeDefined();
    expect(ragPipeline).toBeInstanceOf(RAGTurnPipelineAdapter);
  });

  it('2. successfully resolves ExecuteConversationTurnUseCase from the composition root', () => {
    expect(executeTurnUseCase).toBeDefined();
    expect(executeTurnUseCase).toBeInstanceOf(ExecuteConversationTurnUseCase);
  });

  it('3. executes turn through resolved composition root and demonstrates AI-09.3 persistence is not bypassed', async () => {
    const conversation = AiConversation.create({
      id: CONVERSATION_ID,
      tenantId: TENANT_ID,
      userId: USER_ID,
      title: 'Composition Wiring Protocol',
      turnCounter: 1,
      messageCounter: 2,
    });

    const turn = AiConversationTurn.create({
      id: TURN_ID,
      conversationId: CONVERSATION_ID,
      tenantId: TENANT_ID,
      turnIndex: 1,
      status: TurnStatus.PENDING,
      clientTurnId: 'turn-comp-client-01',
      idempotencyKey: `${CONVERSATION_ID}_1`,
      idempotencyPayloadHash: 'hash-comp',
      activeAttemptId: ASST_MSG_ID,
      activeAttemptNumber: 1,
    });

    const userMessage = AiConversationMessage.create({
      id: USER_MSG_ID,
      turnId: TURN_ID,
      conversationId: CONVERSATION_ID,
      tenantId: TENANT_ID,
      role: ConversationRole.USER,
      sequenceNumber: 1,
      attemptNumber: 1,
      status: GenerationStatus.SUCCESS,
      content: 'Explain integration composition wiring.',
    });

    const assistantPlaceholder = AiConversationMessage.create({
      id: ASST_MSG_ID,
      turnId: TURN_ID,
      conversationId: CONVERSATION_ID,
      tenantId: TENANT_ID,
      role: ConversationRole.ASSISTANT,
      sequenceNumber: 2,
      attemptNumber: 1,
      status: GenerationStatus.PENDING,
      content: '',
    });

    mockConvRepo.findById.mockResolvedValue(conversation);
    mockTurnRepo.findById.mockResolvedValue(turn);
    mockMsgRepo.listByTurn.mockResolvedValue([userMessage, assistantPlaceholder]);
    mockMsgRepo.findById.mockResolvedValue(assistantPlaceholder);
    mockMsgRepo.listCanonicalHistory.mockResolvedValue({
      messages: [],
      nextCursor: null,
      hasMore: false,
    });

    const citation = RAGSourceCitation.create({
      documentId: 'doc_arch_01',
      documentTitle: 'Architecture Guidelines',
      chunkId: 'chunk_01',
      pageNumber: 1,
      relevanceScore: 0.95,
    });

    mockRagOrchestrator.execute.mockResolvedValue(
      RAGAnswer.create({
        answer: 'Composition wiring connects domain use cases to infrastructure adapters.',
        grounded: true,
        sources: [citation],
        metadata: {
          model: 'mock-llm',
          retrievalCount: 1,
          latencyMs: 50,
        },
      }),
    );

    (mockMsgRepo.updateStatus as jest.Mock).mockResolvedValue(
      AiConversationMessage.create({
        id: ASST_MSG_ID,
        turnId: TURN_ID,
        conversationId: CONVERSATION_ID,
        tenantId: TENANT_ID,
        role: ConversationRole.ASSISTANT,
        sequenceNumber: 2,
        attemptNumber: 1,
        isCanonical: true,
        status: GenerationStatus.SUCCESS,
        content: 'Composition wiring connects domain use cases to infrastructure adapters.',
      }),
    );

    const result = await executeTurnUseCase.execute({
      tenantId: TENANT_ID,
      userId: USER_ID,
      conversationId: CONVERSATION_ID,
      turnId: TURN_ID,
      actorContext: {
        roles: ['Admin'],
        permissions: ['ai:all'],
      },
    });

    expect(result.outcome).toBe('SUCCESS');
    expect(result.isGrounded).toBe(true);
    expect(result.content).toBe(
      'Composition wiring connects domain use cases to infrastructure adapters.',
    );
    expect(result.sources).toHaveLength(1);

    // AI-08 was invoked without conversationId to prevent duplicate persistence
    expect(mockRagOrchestrator.execute).toHaveBeenCalledWith(
      expect.objectContaining({
        query: 'Explain integration composition wiring.',
      }),
    );
    const callArgs = mockRagOrchestrator.execute.mock.calls[0]?.[0];
    expect(callArgs?.conversationId).toBeUndefined();

    // AI-09.3 persistence was updated
    expect(mockMsgRepo.updateStatus).toHaveBeenCalledWith(
      TENANT_ID,
      CONVERSATION_ID,
      ASST_MSG_ID,
      expect.objectContaining({
        status: GenerationStatus.SUCCESS,
        isCanonical: true,
      }),
    );

    expect(mockTurnRepo.updateStatus).toHaveBeenCalledWith(
      TENANT_ID,
      CONVERSATION_ID,
      TURN_ID,
      expect.objectContaining({
        status: TurnStatus.COMPLETED,
      }),
    );
  });
});
