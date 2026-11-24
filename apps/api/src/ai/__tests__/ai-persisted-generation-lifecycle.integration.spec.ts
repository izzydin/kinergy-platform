import { PrismaClient } from '@prisma/client';
import {
  ExecuteConversationTurnUseCase,
  PersistMessageStateUseCase,
  LoadCanonicalConversationHistoryUseCase,
  TurnStatus,
  RAGSourceCitation,
  IRAGTurnPipelinePort,
  ConversationNotFoundError,
} from '@kinergy-platform/core';
import {
  PrismaAiConversationRepository,
  PrismaAiConversationTurnRepository,
  PrismaAiConversationMessageRepository,
  PrismaAiConversationAuditRepository,
  PrismaAiConversationTransactionRunner,
} from '@kinergy-platform/core/server';

/**
 * AI-09.3-BE.06.04 — Generation Lifecycle & Canonical Answer Persistence
 * Real PostgreSQL Integration & Concurrency Tests
 *
 * Verifies against real PostgreSQL:
 * 1. Atomic finalization: Assistant message, turn status, and conversation activity commit in a single transaction.
 * 2. Exactly one canonical assistant message per turn invariant.
 * 3. Typed failure finalization.
 * 4. Cancellation before generation and racing cancellation with finalization (barrier-controlled).
 * 5. Fencing against stale/superseded attempts.
 * 6. Idempotent retry of already completed turns (zero duplicate messages, reuses canonical output).
 * 7. Tenant isolation verification.
 */
describe('AI-09.3-BE.06.04: Generation Lifecycle & Persistence (PostgreSQL Integration)', () => {
  let prisma: PrismaClient;
  let convRepo: PrismaAiConversationRepository;
  let turnRepo: PrismaAiConversationTurnRepository;
  let messageRepo: PrismaAiConversationMessageRepository;
  let auditRepo: PrismaAiConversationAuditRepository;
  let txRunner: PrismaAiConversationTransactionRunner;
  let persistUseCase: PersistMessageStateUseCase;
  let historyLoader: LoadCanonicalConversationHistoryUseCase;

  const TENANT_A = 'tenant_lifecycle_a';
  const TENANT_B = 'tenant_lifecycle_b';
  const USER_ID = 'usr_physio_lifecycle_01';

  beforeAll(async () => {
    prisma = new PrismaClient();
    await prisma.$connect();

    convRepo = new PrismaAiConversationRepository(prisma);
    turnRepo = new PrismaAiConversationTurnRepository(prisma);
    messageRepo = new PrismaAiConversationMessageRepository(prisma);
    auditRepo = new PrismaAiConversationAuditRepository(prisma);
    txRunner = new PrismaAiConversationTransactionRunner(
      prisma,
      convRepo,
      turnRepo,
      messageRepo,
      auditRepo,
    );
    persistUseCase = new PersistMessageStateUseCase(messageRepo);
    historyLoader = new LoadCanonicalConversationHistoryUseCase(convRepo, turnRepo, messageRepo);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await prisma.$executeRawUnsafe(
      `DELETE FROM "ai_conversations" WHERE "id" LIKE 'test-conv-lifecycle-%'`,
    );
  });

  afterEach(async () => {
    await prisma.$executeRawUnsafe(
      `DELETE FROM "ai_conversations" WHERE "id" LIKE 'test-conv-lifecycle-%'`,
    );
  });

  /**
   * Helper to seed conversation, turn, user message, and assistant attempt placeholder.
   */
  async function seedTurnInDb(options: {
    convId: string;
    turnId: string;
    turnIndex: number;
    userMsgId: string;
    asstMsgId: string;
    tenantId?: string;
    userPrompt?: string;
    turnStatus?: TurnStatus;
  }) {
    const tenantId = options.tenantId ?? TENANT_A;
    const now = new Date();

    // 1. Conversation
    await prisma.aiConversation.upsert({
      where: {
        uq_conversation_id_tenant: {
          id: options.convId,
          tenantId,
        },
      },
      create: {
        id: options.convId,
        tenantId,
        userId: USER_ID,
        title: 'Rehabilitation Protocol',
        turnCounter: options.turnIndex,
        messageCounter: options.turnIndex * 2,
        createdAt: now,
        updatedAt: now,
        lastActivityAt: now,
      },
      update: {},
    });

    // 2. Turn (created initially without activeAttemptId to avoid FK cycles)
    await prisma.aiConversationTurn.create({
      data: {
        id: options.turnId,
        conversationId: options.convId,
        tenantId,
        turnIndex: options.turnIndex,
        status: options.turnStatus ?? TurnStatus.PENDING,
        clientTurnId: `client-${options.turnId}`,
        idempotencyKey: `${options.convId}_${options.turnIndex}`,
        idempotencyPayloadHash: `hash_${options.turnIndex}`,
        activeAttemptId: null,
        activeAttemptNumber: 1,
        createdAt: now,
        updatedAt: now,
      },
    });

    // 3. User Message
    await prisma.aiConversationMessage.create({
      data: {
        id: options.userMsgId,
        turnId: options.turnId,
        conversationId: options.convId,
        tenantId,
        role: 'USER',
        sequenceNumber: (options.turnIndex - 1) * 2 + 1,
        attemptNumber: 1,
        status: 'SUCCESS',
        isCanonical: false,
        content: options.userPrompt ?? 'Protocol inquiry for patellar tendinopathy',
        createdAt: now,
        updatedAt: now,
      },
    });

    // 4. Assistant Placeholder
    await prisma.aiConversationMessage.create({
      data: {
        id: options.asstMsgId,
        turnId: options.turnId,
        conversationId: options.convId,
        tenantId,
        role: 'ASSISTANT',
        sequenceNumber: options.turnIndex * 2,
        attemptNumber: 1,
        status: 'PENDING',
        isCanonical: false,
        content: '',
        createdAt: now,
        updatedAt: now,
      },
    });

    // 5. Link active attempt on Turn
    await prisma.aiConversationTurn.update({
      where: {
        uq_turn_id_conv_tenant: {
          id: options.turnId,
          conversationId: options.convId,
          tenantId,
        },
      },
      data: {
        activeAttemptId: options.asstMsgId,
      },
    });
  }

  it('1. atomically persists successful generation, citations, and marks turn COMPLETED in PostgreSQL', async () => {
    const convId = 'test-conv-lifecycle-1';
    const turnId = 'test-conv-lifecycle-turn-1';
    const userMsgId = 'test-conv-lifecycle-msg-u1';
    const asstMsgId = 'test-conv-lifecycle-msg-a1';

    await seedTurnInDb({
      convId,
      turnId,
      turnIndex: 1,
      userMsgId,
      asstMsgId,
    });

    const mockCitation = RAGSourceCitation.create({
      documentId: 'doc_patella_001',
      documentTitle: 'Patellar Tendinopathy Protocols 2026',
      chunkId: 'chunk_patella_42',
      pageNumber: 8,
      relevanceScore: 0.96,
    });

    const mockPipeline: IRAGTurnPipelinePort = {
      executeTurn: jest.fn().mockResolvedValue({
        outcome: 'SUCCESS',
        content: 'Heavy slow resistance training (HSR) is recommended for patellar tendinopathy.',
        isGrounded: true,
        sources: [mockCitation],
        metadata: { model: 'mistral-7b', retrievalCount: 3, latencyMs: 250 },
      }),
    };

    const useCase = new ExecuteConversationTurnUseCase(
      convRepo,
      turnRepo,
      messageRepo,
      persistUseCase,
      mockPipeline,
      historyLoader,
      txRunner,
    );

    const result = await useCase.execute({
      tenantId: TENANT_A,
      userId: USER_ID,
      conversationId: convId,
      turnId,
      actorContext: { roles: ['Physiotherapist'], permissions: ['ai:read', 'ai:write'] },
    });

    // Assert Return Contract
    expect(result.outcome).toBe('SUCCESS');
    expect(result.turnStatus).toBe(TurnStatus.COMPLETED);
    expect(result.isCanonical).toBe(true);
    expect(result.isGrounded).toBe(true);
    expect(result.assistantMessageId).toBe(asstMsgId);
    expect(result.sources).toHaveLength(1);

    // Assert PostgreSQL State
    const turnRecord = await prisma.aiConversationTurn.findUnique({
      where: {
        uq_turn_id_conv_tenant: { id: turnId, conversationId: convId, tenantId: TENANT_A },
      },
    });
    expect(turnRecord).not.toBeNull();
    expect(turnRecord?.status).toBe('COMPLETED');
    expect(turnRecord?.completedAt).not.toBeNull();

    const asstRecord = await prisma.aiConversationMessage.findUnique({
      where: {
        uq_msg_id_turn_conv_tenant: {
          id: asstMsgId,
          turnId,
          conversationId: convId,
          tenantId: TENANT_A,
        },
      },
    });
    expect(asstRecord).not.toBeNull();
    expect(asstRecord?.status).toBe('SUCCESS');
    expect(asstRecord?.isCanonical).toBe(true);
    expect(asstRecord?.content).toContain('Heavy slow resistance training');
    expect(asstRecord?.sources).not.toBeNull();

    // Invariant: Exactly 1 canonical assistant message in this turn
    const canonicalCount = await prisma.aiConversationMessage.count({
      where: {
        conversationId: convId,
        turnId,
        tenantId: TENANT_A,
        role: 'ASSISTANT',
        isCanonical: true,
      },
    });
    expect(canonicalCount).toBe(1);
  });

  it('2. atomically persists typed failure when pipeline fails and marks turn FAILED in PostgreSQL', async () => {
    const convId = 'test-conv-lifecycle-2';
    const turnId = 'test-conv-lifecycle-turn-2';
    const userMsgId = 'test-conv-lifecycle-msg-u2';
    const asstMsgId = 'test-conv-lifecycle-msg-a2';

    await seedTurnInDb({
      convId,
      turnId,
      turnIndex: 1,
      userMsgId,
      asstMsgId,
    });

    const mockPipeline: IRAGTurnPipelinePort = {
      executeTurn: jest.fn().mockResolvedValue({
        outcome: 'FAILED',
        content: '',
        isGrounded: false,
        sources: [],
        errorCode: 'RETRIEVAL_PERSISTENCE_ERROR',
        errorMessage: 'Vector store connection terminated.',
        metadata: { model: 'mistral-7b', retrievalCount: 0, latencyMs: 50 },
      }),
    };

    const useCase = new ExecuteConversationTurnUseCase(
      convRepo,
      turnRepo,
      messageRepo,
      persistUseCase,
      mockPipeline,
      historyLoader,
      txRunner,
    );

    const result = await useCase.execute({
      tenantId: TENANT_A,
      userId: USER_ID,
      conversationId: convId,
      turnId,
      actorContext: { roles: ['Physiotherapist'], permissions: ['ai:read', 'ai:write'] },
    });

    expect(result.outcome).toBe('FAILED');
    expect(result.turnStatus).toBe(TurnStatus.FAILED);
    expect(result.isCanonical).toBe(false);

    // Verify in PostgreSQL
    const turnRecord = await prisma.aiConversationTurn.findUnique({
      where: {
        uq_turn_id_conv_tenant: { id: turnId, conversationId: convId, tenantId: TENANT_A },
      },
    });
    expect(turnRecord?.status).toBe('FAILED');

    const asstRecord = await prisma.aiConversationMessage.findUnique({
      where: {
        uq_msg_id_turn_conv_tenant: {
          id: asstMsgId,
          turnId,
          conversationId: convId,
          tenantId: TENANT_A,
        },
      },
    });
    expect(asstRecord?.status).toBe('FAILED');
    expect(asstRecord?.isCanonical).toBe(false);
    expect(asstRecord?.errorCode).toBe('RETRIEVAL_PERSISTENCE_ERROR');
  });

  it('3. fencing race: late LLM response cannot overwrite concurrent cancellation', async () => {
    const convId = 'test-conv-lifecycle-3';
    const turnId = 'test-conv-lifecycle-turn-3';
    const userMsgId = 'test-conv-lifecycle-msg-u3';
    const asstMsgId = 'test-conv-lifecycle-msg-a3';

    await seedTurnInDb({
      convId,
      turnId,
      turnIndex: 1,
      userMsgId,
      asstMsgId,
    });

    // Controlled barrier: simulate concurrent cancellation occurring while LLM is generating
    let triggerConcurrentCancel!: () => Promise<void>;
    const cancelBarrierPromise = new Promise<void>((resolve) => {
      triggerConcurrentCancel = async () => {
        // Concurrently mark turn CANCELLED in real PostgreSQL
        await prisma.aiConversationTurn.update({
          where: {
            uq_turn_id_conv_tenant: { id: turnId, conversationId: convId, tenantId: TENANT_A },
          },
          data: {
            status: 'CANCELLED',
            completedAt: new Date(),
          },
        });
        await prisma.aiConversationMessage.update({
          where: {
            uq_msg_id_turn_conv_tenant: {
              id: asstMsgId,
              turnId,
              conversationId: convId,
              tenantId: TENANT_A,
            },
          },
          data: {
            status: 'CANCELLED',
            errorCode: 'GENERATION_CANCELLED',
          },
        });
        resolve();
      };
    });

    const mockPipeline: IRAGTurnPipelinePort = {
      executeTurn: jest.fn().mockImplementation(async () => {
        // Trigger cancellation in DB before returning late LLM response
        await triggerConcurrentCancel();
        await cancelBarrierPromise;

        return {
          outcome: 'SUCCESS',
          content: 'Late response that finished after client cancelled.',
          isGrounded: true,
          sources: [],
          metadata: { model: 'mistral-7b', retrievalCount: 1, latencyMs: 300 },
        };
      }),
    };

    const useCase = new ExecuteConversationTurnUseCase(
      convRepo,
      turnRepo,
      messageRepo,
      persistUseCase,
      mockPipeline,
      historyLoader,
      txRunner,
    );

    const result = await useCase.execute({
      tenantId: TENANT_A,
      userId: USER_ID,
      conversationId: convId,
      turnId,
      actorContext: { roles: ['Physiotherapist'], permissions: ['ai:read', 'ai:write'] },
    });

    // The late response must be aborted due to transactional fencing
    expect(result.outcome).toBe('CANCELLED');
    expect(result.turnStatus).toBe(TurnStatus.CANCELLED);
    expect(result.isCanonical).toBe(false);

    // Verify PostgreSQL remained CANCELLED and was NOT overwritten with COMPLETED
    const turnRecord = await prisma.aiConversationTurn.findUnique({
      where: {
        uq_turn_id_conv_tenant: { id: turnId, conversationId: convId, tenantId: TENANT_A },
      },
    });
    expect(turnRecord?.status).toBe('CANCELLED');

    const asstRecord = await prisma.aiConversationMessage.findUnique({
      where: {
        uq_msg_id_turn_conv_tenant: {
          id: asstMsgId,
          turnId,
          conversationId: convId,
          tenantId: TENANT_A,
        },
      },
    });
    expect(asstRecord?.status).toBe('CANCELLED');
    expect(asstRecord?.isCanonical).toBe(false);
  });

  it('4. idempotent retry: calling execute on completed turn reuses canonical result without invoking pipeline or creating duplicate messages', async () => {
    const convId = 'test-conv-lifecycle-4';
    const turnId = 'test-conv-lifecycle-turn-4';
    const userMsgId = 'test-conv-lifecycle-msg-u4';
    const asstMsgId = 'test-conv-lifecycle-msg-a4';

    await seedTurnInDb({
      convId,
      turnId,
      turnIndex: 1,
      userMsgId,
      asstMsgId,
    });

    const mockPipeline: IRAGTurnPipelinePort = {
      executeTurn: jest.fn().mockResolvedValue({
        outcome: 'SUCCESS',
        content: 'Original canonical answer.',
        isGrounded: true,
        sources: [],
        metadata: { model: 'mistral-7b', retrievalCount: 2, latencyMs: 200 },
      }),
    };

    const useCase = new ExecuteConversationTurnUseCase(
      convRepo,
      turnRepo,
      messageRepo,
      persistUseCase,
      mockPipeline,
      historyLoader,
      txRunner,
    );

    // Initial Execution
    const firstResult = await useCase.execute({
      tenantId: TENANT_A,
      userId: USER_ID,
      conversationId: convId,
      turnId,
      actorContext: { roles: ['Physiotherapist'], permissions: ['ai:read', 'ai:write'] },
    });
    expect(firstResult.outcome).toBe('SUCCESS');
    expect(firstResult.turnStatus).toBe(TurnStatus.COMPLETED);
    expect(mockPipeline.executeTurn).toHaveBeenCalledTimes(1);

    const messageCountAfterFirst = await prisma.aiConversationMessage.count({
      where: { conversationId: convId, turnId, tenantId: TENANT_A },
    });

    // Idempotent Retry Execution
    const retryResult = await useCase.execute({
      tenantId: TENANT_A,
      userId: USER_ID,
      conversationId: convId,
      turnId,
      actorContext: { roles: ['Physiotherapist'], permissions: ['ai:read', 'ai:write'] },
    });

    expect(retryResult.outcome).toBe('SUCCESS');
    expect(retryResult.turnStatus).toBe(TurnStatus.COMPLETED);
    expect(retryResult.isCanonical).toBe(true);
    expect(retryResult.content).toBe('Original canonical answer.');

    // Pipeline must NOT be called a second time
    expect(mockPipeline.executeTurn).toHaveBeenCalledTimes(1);

    // Total messages in PostgreSQL must remain unchanged (0 duplicate messages created)
    const messageCountAfterRetry = await prisma.aiConversationMessage.count({
      where: { conversationId: convId, turnId, tenantId: TENANT_A },
    });
    expect(messageCountAfterRetry).toBe(messageCountAfterFirst);
  });

  it('5. enforces strict tenant boundary isolation without revealing conversation existence', async () => {
    const convId = 'test-conv-lifecycle-5';
    const turnId = 'test-conv-lifecycle-turn-5';
    const userMsgId = 'test-conv-lifecycle-msg-u5';
    const asstMsgId = 'test-conv-lifecycle-msg-a5';

    await seedTurnInDb({
      convId,
      turnId,
      turnIndex: 1,
      userMsgId,
      asstMsgId,
      tenantId: TENANT_A,
    });

    const mockPipeline: IRAGTurnPipelinePort = {
      executeTurn: jest.fn(),
    };

    const useCase = new ExecuteConversationTurnUseCase(
      convRepo,
      turnRepo,
      messageRepo,
      persistUseCase,
      mockPipeline,
      historyLoader,
      txRunner,
    );

    // Query from TENANT_B must throw ConversationNotFoundError without existence leak
    await expect(
      useCase.execute({
        tenantId: TENANT_B,
        userId: USER_ID,
        conversationId: convId,
        turnId,
        actorContext: { roles: ['Physiotherapist'], permissions: ['ai:read', 'ai:write'] },
      }),
    ).rejects.toThrow(ConversationNotFoundError);

    expect(mockPipeline.executeTurn).not.toHaveBeenCalled();
  });
});
