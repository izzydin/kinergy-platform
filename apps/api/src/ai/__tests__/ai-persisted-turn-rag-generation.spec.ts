import {
  ExecuteConversationTurnUseCase,
  PersistMessageStateUseCase,
  LoadCanonicalConversationHistoryUseCase,
  IAiConversationRepositoryPort,
  IAiConversationTurnRepositoryPort,
  IAiConversationMessageRepositoryPort,
  AiConversation,
  AiConversationTurn,
  AiConversationMessage,
  ConversationRole,
  TurnStatus,
  GenerationStatus,
  RAGSourceCitation,
  RAGAnswer,
  IGenerateGroundedAnswerUseCase,
  ProviderTimeoutException,
  ModelNotFoundException,
  RetrievalDatabaseException,
} from '@kinergy-platform/core';
import { RAGTurnPipelineAdapter } from '../adapters/rag/rag-turn-pipeline.adapter';

describe('BE.06.03 — Persisted Turn RAG Retrieval & Grounded Answer Generation Tests', () => {
  let executeUseCase: ExecuteConversationTurnUseCase;
  let adapter: RAGTurnPipelineAdapter;
  let mockRagOrchestrator: jest.Mocked<IGenerateGroundedAnswerUseCase>;
  let mockConvRepo: jest.Mocked<IAiConversationRepositoryPort>;
  let mockTurnRepo: jest.Mocked<IAiConversationTurnRepositoryPort>;
  let mockMsgRepo: jest.Mocked<IAiConversationMessageRepositoryPort>;
  let persistMessageStateUseCase: PersistMessageStateUseCase;

  const TENANT_ID = 'tenant_rehab_clinic';
  const USER_ID = 'physio_dr_ramirez';
  const CONVERSATION_ID = 'conv_knee_rehab_101';
  const TURN_ID = 'turn_knee_202';
  const USER_MSG_ID = 'msg_user_prompt_303';
  const ASST_MSG_ID = 'msg_asst_attempt_404';

  const defaultActor = {
    userId: USER_ID,
    roles: ['Physiotherapist'],
    permissions: ['ai:read', 'ai:write'],
  };

  const createMockConversation = () =>
    AiConversation.create({
      id: CONVERSATION_ID,
      tenantId: TENANT_ID,
      userId: USER_ID,
      title: 'Meniscus Tear Rehabilitation',
      turnCounter: 1,
      messageCounter: 2,
    });

  const createMockTurn = (status: TurnStatus = TurnStatus.PENDING) =>
    AiConversationTurn.create({
      id: TURN_ID,
      conversationId: CONVERSATION_ID,
      tenantId: TENANT_ID,
      turnIndex: 2,
      status,
      clientTurnId: 'client-turn-knee-2',
      idempotencyKey: `${CONVERSATION_ID}_2`,
      idempotencyPayloadHash: 'hash_knee_2',
      activeAttemptId: ASST_MSG_ID,
      activeAttemptNumber: 1,
    });

  const createMockUserMessage = (
    content = '¿Cuál es el protocolo de carga tras meniscectomía parcial?',
  ) =>
    AiConversationMessage.create({
      id: USER_MSG_ID,
      turnId: TURN_ID,
      conversationId: CONVERSATION_ID,
      tenantId: TENANT_ID,
      role: ConversationRole.USER,
      sequenceNumber: 3,
      attemptNumber: 1,
      status: GenerationStatus.SUCCESS,
      content,
    });

  const createMockAssistantPlaceholder = () =>
    AiConversationMessage.create({
      id: ASST_MSG_ID,
      turnId: TURN_ID,
      conversationId: CONVERSATION_ID,
      tenantId: TENANT_ID,
      role: ConversationRole.ASSISTANT,
      sequenceNumber: 4,
      attemptNumber: 1,
      status: GenerationStatus.PENDING,
      content: '',
    });

  beforeEach(() => {
    mockRagOrchestrator = {
      execute: jest.fn(),
    };

    mockConvRepo = {
      findById: jest.fn(),
      save: jest.fn(),
      listByUser: jest.fn(),
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
      findBySequenceNumber: jest.fn(),
      listByTurn: jest.fn(),
      listCanonicalHistory: jest.fn(),
      save: jest.fn(),
      updateStatus: jest.fn(),
    } as unknown as jest.Mocked<IAiConversationMessageRepositoryPort>;

    persistMessageStateUseCase = new PersistMessageStateUseCase(mockMsgRepo);
    adapter = new RAGTurnPipelineAdapter(mockRagOrchestrator);

    const historyLoader = new LoadCanonicalConversationHistoryUseCase(
      mockConvRepo,
      mockTurnRepo,
      mockMsgRepo,
    );

    executeUseCase = new ExecuteConversationTurnUseCase(
      mockConvRepo,
      mockTurnRepo,
      mockMsgRepo,
      persistMessageStateUseCase,
      adapter,
      historyLoader,
    );
  });

  describe('1. Successful Retrieval and Grounded Answer Generation', () => {
    it('executes turn through RAG, receives verified citations, and persists canonical grounded answer', async () => {
      const conv = createMockConversation();
      const turn = createMockTurn();
      const userMsg = createMockUserMessage();
      const asstPlaceholder = createMockAssistantPlaceholder();

      mockConvRepo.findById.mockResolvedValue(conv);
      mockTurnRepo.findById.mockResolvedValue(turn);
      mockMsgRepo.findById.mockResolvedValue(asstPlaceholder);
      mockMsgRepo.listByTurn.mockResolvedValue([userMsg, asstPlaceholder]);

      const citation = RAGSourceCitation.create({
        documentId: 'doc_meniscus_protocol_2026',
        documentTitle: 'Meniscus Rehabilitation Clinical Guideline',
        chunkId: 'chunk_meniscus_12',
        pageNumber: 5,
        relevanceScore: 0.96,
      });

      const ragAnswer = RAGAnswer.create({
        answer:
          'Se permite apoyo progresivo según tolerancia con muletas durante las primeras 2 semanas.',
        grounded: true,
        sources: [citation],
        metadata: {
          model: 'qwen3:4b',
          retrievalCount: 2,
          latencyMs: 1100,
          finishReason: 'stop',
        },
      });

      mockRagOrchestrator.execute.mockResolvedValue(ragAnswer);

      (mockMsgRepo.updateStatus as jest.Mock).mockResolvedValue(
        AiConversationMessage.create({
          id: ASST_MSG_ID,
          turnId: TURN_ID,
          conversationId: CONVERSATION_ID,
          tenantId: TENANT_ID,
          role: ConversationRole.ASSISTANT,
          sequenceNumber: 4,
          attemptNumber: 1,
          isCanonical: true,
          status: GenerationStatus.SUCCESS,
          content: ragAnswer.answer,
        }),
      );

      const result = await executeUseCase.execute({
        tenantId: TENANT_ID,
        userId: USER_ID,
        conversationId: CONVERSATION_ID,
        turnId: TURN_ID,
        actorContext: defaultActor,
      });

      // Assertions
      expect(result.outcome).toBe('SUCCESS');
      expect(result.isGrounded).toBe(true);
      expect(result.isCanonical).toBe(true);
      expect(result.turnStatus).toBe(TurnStatus.COMPLETED);
      expect(result.content).toBe(ragAnswer.answer);
      expect(result.sources).toHaveLength(1);
      expect(result.sources[0]?.documentId).toBe('doc_meniscus_protocol_2026');

      // Verify AI-08 invocation parameters
      expect(mockRagOrchestrator.execute).toHaveBeenCalledWith(
        expect.objectContaining({
          query: userMsg.content,
          authContext: expect.objectContaining({
            tenantId: TENANT_ID,
            userId: USER_ID,
          }),
        }),
      );

      // Verify AI-09.3 persistence updates
      expect(mockMsgRepo.updateStatus).toHaveBeenCalledWith(
        TENANT_ID,
        CONVERSATION_ID,
        ASST_MSG_ID,
        expect.objectContaining({
          status: GenerationStatus.SUCCESS,
          isCanonical: true,
          content: ragAnswer.answer,
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

  describe('2. Abstention and Insufficient Evidence Scenarios', () => {
    it('handles zero relevant retrieved chunks (insufficient context) by persisting abstention with canonical SUCCESS', async () => {
      const conv = createMockConversation();
      const turn = createMockTurn();
      const userMsg = createMockUserMessage();
      const asstPlaceholder = createMockAssistantPlaceholder();

      mockConvRepo.findById.mockResolvedValue(conv);
      mockTurnRepo.findById.mockResolvedValue(turn);
      mockMsgRepo.findById.mockResolvedValue(asstPlaceholder);
      mockMsgRepo.listByTurn.mockResolvedValue([userMsg, asstPlaceholder]);

      const abstentionAnswer = RAGAnswer.abstain(
        'No se encontró documentación o política verificada para responder a esta consulta.',
        'none',
        45,
      );

      mockRagOrchestrator.execute.mockResolvedValue(abstentionAnswer);

      (mockMsgRepo.updateStatus as jest.Mock).mockResolvedValue(
        AiConversationMessage.create({
          id: ASST_MSG_ID,
          turnId: TURN_ID,
          conversationId: CONVERSATION_ID,
          tenantId: TENANT_ID,
          role: ConversationRole.ASSISTANT,
          sequenceNumber: 4,
          attemptNumber: 1,
          isCanonical: true,
          status: GenerationStatus.SUCCESS,
          content: abstentionAnswer.answer,
        }),
      );

      const result = await executeUseCase.execute({
        tenantId: TENANT_ID,
        userId: USER_ID,
        conversationId: CONVERSATION_ID,
        turnId: TURN_ID,
        actorContext: defaultActor,
      });

      expect(result.outcome).toBe('ABSTAINED');
      expect(result.isGrounded).toBe(false);
      expect(result.isCanonical).toBe(true);
      expect(result.content).toBe(
        'No se encontró documentación o política verificada para responder a esta consulta.',
      );
      expect(result.sources).toEqual([]);
      expect(result.turnStatus).toBe(TurnStatus.COMPLETED);
    });

    it('handles low similarity score below threshold (0.6) with outcome ABSTAINED', async () => {
      const conv = createMockConversation();
      const turn = createMockTurn();
      const userMsg = createMockUserMessage();
      const asstPlaceholder = createMockAssistantPlaceholder();

      mockConvRepo.findById.mockResolvedValue(conv);
      mockTurnRepo.findById.mockResolvedValue(turn);
      mockMsgRepo.findById.mockResolvedValue(asstPlaceholder);
      mockMsgRepo.listByTurn.mockResolvedValue([userMsg, asstPlaceholder]);

      mockRagOrchestrator.execute.mockResolvedValue(
        RAGAnswer.create({
          answer:
            'La información disponible no cuenta con suficiente relevancia para responder con certeza.',
          grounded: false,
          sources: [],
          metadata: {
            model: 'none',
            retrievalCount: 1,
            latencyMs: 30,
            finishReason: 'LOW_SIMILARITY',
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
          sequenceNumber: 4,
          attemptNumber: 1,
          isCanonical: true,
          status: GenerationStatus.SUCCESS,
          content: 'La información disponible no cuenta con suficiente relevancia.',
        }),
      );

      const result = await executeUseCase.execute({
        tenantId: TENANT_ID,
        userId: USER_ID,
        conversationId: CONVERSATION_ID,
        turnId: TURN_ID,
        actorContext: defaultActor,
      });

      expect(result.outcome).toBe('ABSTAINED');
      expect(result.isGrounded).toBe(false);
      expect(result.turnStatus).toBe(TurnStatus.COMPLETED);
    });
  });

  describe('3. Timeouts and Pipeline Failure Propagation', () => {
    it('catches retrieval timeout (ProviderTimeoutException) and marks message and turn FAILED', async () => {
      const conv = createMockConversation();
      const turn = createMockTurn();
      const userMsg = createMockUserMessage();
      const asstPlaceholder = createMockAssistantPlaceholder();

      mockConvRepo.findById.mockResolvedValue(conv);
      mockTurnRepo.findById.mockResolvedValue(turn);
      mockMsgRepo.findById.mockResolvedValue(asstPlaceholder);
      mockMsgRepo.listByTurn.mockResolvedValue([userMsg, asstPlaceholder]);

      mockRagOrchestrator.execute.mockRejectedValue(
        new ProviderTimeoutException('Retrieval execution timed out after 5000ms.'),
      );

      (mockMsgRepo.updateStatus as jest.Mock).mockResolvedValue(
        AiConversationMessage.create({
          id: ASST_MSG_ID,
          turnId: TURN_ID,
          conversationId: CONVERSATION_ID,
          tenantId: TENANT_ID,
          role: ConversationRole.ASSISTANT,
          sequenceNumber: 4,
          attemptNumber: 1,
          isCanonical: false,
          status: GenerationStatus.FAILED,
          content: '',
        }),
      );

      const result = await executeUseCase.execute({
        tenantId: TENANT_ID,
        userId: USER_ID,
        conversationId: CONVERSATION_ID,
        turnId: TURN_ID,
        actorContext: defaultActor,
      });

      expect(result.outcome).toBe('FAILED');
      expect(result.turnStatus).toBe(TurnStatus.FAILED);
      expect(result.isCanonical).toBe(false);
      expect(result.errorCode).toBe('PROVIDER_TIMEOUT');
      expect(result.errorMessage).toContain('timed out after 5000ms');

      // Verify turn marked FAILED in persistence
      expect(mockTurnRepo.updateStatus).toHaveBeenCalledWith(
        TENANT_ID,
        CONVERSATION_ID,
        TURN_ID,
        expect.objectContaining({
          status: TurnStatus.FAILED,
        }),
      );
    });

    it('catches LLM generation timeout (20s) and propagates typed FAILED outcome', async () => {
      const conv = createMockConversation();
      const turn = createMockTurn();
      const userMsg = createMockUserMessage();
      const asstPlaceholder = createMockAssistantPlaceholder();

      mockConvRepo.findById.mockResolvedValue(conv);
      mockTurnRepo.findById.mockResolvedValue(turn);
      mockMsgRepo.findById.mockResolvedValue(asstPlaceholder);
      mockMsgRepo.listByTurn.mockResolvedValue([userMsg, asstPlaceholder]);

      mockRagOrchestrator.execute.mockRejectedValue(
        new ProviderTimeoutException('LLM generation timed out after 20000ms.'),
      );

      (mockMsgRepo.updateStatus as jest.Mock).mockResolvedValue(
        AiConversationMessage.create({
          id: ASST_MSG_ID,
          turnId: TURN_ID,
          conversationId: CONVERSATION_ID,
          tenantId: TENANT_ID,
          role: ConversationRole.ASSISTANT,
          sequenceNumber: 4,
          attemptNumber: 1,
          isCanonical: false,
          status: GenerationStatus.FAILED,
          content: '',
        }),
      );

      const result = await executeUseCase.execute({
        tenantId: TENANT_ID,
        userId: USER_ID,
        conversationId: CONVERSATION_ID,
        turnId: TURN_ID,
        actorContext: defaultActor,
      });

      expect(result.outcome).toBe('FAILED');
      expect(result.errorCode).toBe('PROVIDER_TIMEOUT');
      expect(result.errorMessage).toContain('timed out after 20000ms');
    });

    it('catches LLM provider failure (ModelNotFoundException) and propagates typed FAILED outcome', async () => {
      const conv = createMockConversation();
      const turn = createMockTurn();
      const userMsg = createMockUserMessage();
      const asstPlaceholder = createMockAssistantPlaceholder();

      mockConvRepo.findById.mockResolvedValue(conv);
      mockTurnRepo.findById.mockResolvedValue(turn);
      mockMsgRepo.findById.mockResolvedValue(asstPlaceholder);
      mockMsgRepo.listByTurn.mockResolvedValue([userMsg, asstPlaceholder]);

      mockRagOrchestrator.execute.mockRejectedValue(new ModelNotFoundException('qwen3:4b'));

      (mockMsgRepo.updateStatus as jest.Mock).mockResolvedValue(
        AiConversationMessage.create({
          id: ASST_MSG_ID,
          turnId: TURN_ID,
          conversationId: CONVERSATION_ID,
          tenantId: TENANT_ID,
          role: ConversationRole.ASSISTANT,
          sequenceNumber: 4,
          attemptNumber: 1,
          isCanonical: false,
          status: GenerationStatus.FAILED,
          content: '',
        }),
      );

      const result = await executeUseCase.execute({
        tenantId: TENANT_ID,
        userId: USER_ID,
        conversationId: CONVERSATION_ID,
        turnId: TURN_ID,
        actorContext: defaultActor,
      });

      expect(result.outcome).toBe('FAILED');
      expect(result.errorCode).toBe('MODEL_NOT_FOUND');
    });

    it('catches retrieval database failure (RetrievalDatabaseException) and propagates typed FAILED outcome', async () => {
      const conv = createMockConversation();
      const turn = createMockTurn();
      const userMsg = createMockUserMessage();
      const asstPlaceholder = createMockAssistantPlaceholder();

      mockConvRepo.findById.mockResolvedValue(conv);
      mockTurnRepo.findById.mockResolvedValue(turn);
      mockMsgRepo.findById.mockResolvedValue(asstPlaceholder);
      mockMsgRepo.listByTurn.mockResolvedValue([userMsg, asstPlaceholder]);

      mockRagOrchestrator.execute.mockRejectedValue(
        new RetrievalDatabaseException('PostgreSQL vector index connection terminated'),
      );

      (mockMsgRepo.updateStatus as jest.Mock).mockResolvedValue(
        AiConversationMessage.create({
          id: ASST_MSG_ID,
          turnId: TURN_ID,
          conversationId: CONVERSATION_ID,
          tenantId: TENANT_ID,
          role: ConversationRole.ASSISTANT,
          sequenceNumber: 4,
          attemptNumber: 1,
          isCanonical: false,
          status: GenerationStatus.FAILED,
          content: '',
        }),
      );

      const result = await executeUseCase.execute({
        tenantId: TENANT_ID,
        userId: USER_ID,
        conversationId: CONVERSATION_ID,
        turnId: TURN_ID,
        actorContext: defaultActor,
      });

      expect(result.outcome).toBe('FAILED');
      expect(result.errorCode).toBe('RETRIEVAL_PERSISTENCE_ERROR');
    });
  });

  describe('4. Canonical History Context & Truthful Source Attribution', () => {
    it('correctly includes preceding completed turns in canonical context passed to AI-08', async () => {
      const conv = createMockConversation();
      const currentTurn = createMockTurn();
      const userMsg = createMockUserMessage('¿Y cuándo puedo empezar a correr?');
      const asstPlaceholder = createMockAssistantPlaceholder();

      // Preceding completed turn
      const prevTurn = AiConversationTurn.create({
        id: 'turn_knee_prev_1',
        conversationId: CONVERSATION_ID,
        tenantId: TENANT_ID,
        turnIndex: 1,
        status: TurnStatus.COMPLETED,
        clientTurnId: 'client-turn-knee-1',
        idempotencyKey: `${CONVERSATION_ID}_1`,
        idempotencyPayloadHash: 'hash_knee_1',
        activeAttemptId: 'msg_asst_1',
        activeAttemptNumber: 1,
      });

      mockConvRepo.findById.mockResolvedValue(conv);
      mockTurnRepo.findById.mockResolvedValue(currentTurn);
      mockTurnRepo.listByConversation.mockResolvedValue([prevTurn]);
      mockMsgRepo.findById.mockResolvedValue(asstPlaceholder);

      mockMsgRepo.listByTurn.mockImplementation(async (_t, _c, tid) => {
        const idStr = typeof tid === 'string' ? tid : tid.value;
        if (idStr === TURN_ID) return [userMsg, asstPlaceholder];
        if (idStr === 'turn_knee_prev_1') {
          return [
            AiConversationMessage.create({
              id: 'msg_u1',
              turnId: 'turn_knee_prev_1',
              conversationId: CONVERSATION_ID,
              tenantId: TENANT_ID,
              role: ConversationRole.USER,
              sequenceNumber: 1,
              attemptNumber: 1,
              content: '¿Cuánto tiempo dura la rehabilitación de menisco?',
            }),
            AiConversationMessage.create({
              id: 'msg_a1',
              turnId: 'turn_knee_prev_1',
              conversationId: CONVERSATION_ID,
              tenantId: TENANT_ID,
              role: ConversationRole.ASSISTANT,
              sequenceNumber: 2,
              attemptNumber: 1,
              isCanonical: true,
              status: GenerationStatus.SUCCESS,
              content: 'Generalmente entre 6 y 12 semanas dependiendo del tipo de rotura.',
            }),
          ];
        }
        return [];
      });

      mockRagOrchestrator.execute.mockResolvedValue(
        RAGAnswer.create({
          answer:
            'La carrera suave puede iniciarse a partir de la semana 8 si no hay derrame ni dolor.',
          grounded: true,
          sources: [
            RAGSourceCitation.create({
              documentId: 'doc_running_guideline',
              documentTitle: 'Running Progression Post-Meniscectomy',
              chunkId: 'chunk_run_01',
              relevanceScore: 0.93,
            }),
          ],
          metadata: {
            model: 'qwen3:4b',
            retrievalCount: 1,
            latencyMs: 950,
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
          sequenceNumber: 4,
          attemptNumber: 1,
          isCanonical: true,
          status: GenerationStatus.SUCCESS,
          content: 'La carrera suave puede iniciarse...',
        }),
      );

      const result = await executeUseCase.execute({
        tenantId: TENANT_ID,
        userId: USER_ID,
        conversationId: CONVERSATION_ID,
        turnId: TURN_ID,
        actorContext: defaultActor,
      });

      expect(result.outcome).toBe('SUCCESS');
      expect(result.completedTurnsCount).toBe(1);

      // Verify canonical history was provided to AI-08 without client tampering
      expect(mockRagOrchestrator.execute).toHaveBeenCalledWith(
        expect.objectContaining({
          query: '¿Y cuándo puedo empezar a correr?',
          conversationHistory: [
            expect.objectContaining({
              role: 'user',
              content: '¿Cuánto tiempo dura la rehabilitación de menisco?',
            }),
            expect.objectContaining({
              role: 'assistant',
              content: 'Generalmente entre 6 y 12 semanas dependiendo del tipo de rotura.',
            }),
          ],
        }),
      );
    });

    it('enforces truthful source attribution: returns ungrounded result when citations are unverified', async () => {
      const conv = createMockConversation();
      const turn = createMockTurn();
      const userMsg = createMockUserMessage();
      const asstPlaceholder = createMockAssistantPlaceholder();

      mockConvRepo.findById.mockResolvedValue(conv);
      mockTurnRepo.findById.mockResolvedValue(turn);
      mockMsgRepo.findById.mockResolvedValue(asstPlaceholder);
      mockMsgRepo.listByTurn.mockResolvedValue([userMsg, asstPlaceholder]);

      // When the LLM produced ungrounded facts or hallucinated citations,
      // the RAG answer has grounded: false and empty verified sources
      mockRagOrchestrator.execute.mockResolvedValue(
        RAGAnswer.create({
          answer: 'Respuesta sin evidencia médica comprobada en los documentos indexados.',
          grounded: false,
          sources: [],
          metadata: {
            model: 'qwen3:4b',
            retrievalCount: 1,
            latencyMs: 800,
            finishReason: 'insufficient_context',
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
          sequenceNumber: 4,
          attemptNumber: 1,
          isCanonical: true,
          status: GenerationStatus.SUCCESS,
          content: 'Respuesta sin evidencia médica comprobada.',
        }),
      );

      const result = await executeUseCase.execute({
        tenantId: TENANT_ID,
        userId: USER_ID,
        conversationId: CONVERSATION_ID,
        turnId: TURN_ID,
        actorContext: defaultActor,
      });

      expect(result.outcome).toBe('ABSTAINED');
      expect(result.isGrounded).toBe(false);
      expect(result.sources).toEqual([]);
    });
  });
});
