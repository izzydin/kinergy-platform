import { PrismaClient } from '@prisma/client';
import { PrismaAiConversationRepository } from '../repositories/prisma-ai-conversation.repository';
import { PrismaAiConversationTurnRepository } from '../repositories/prisma-ai-conversation-turn.repository';
import { PrismaAiConversationMessageRepository } from '../repositories/prisma-ai-conversation-message.repository';
import { PrismaAiConversationAuditRepository } from '../repositories/prisma-ai-conversation-audit.repository';
import { PrismaAiConversationTransactionRunner } from '../prisma-ai-conversation-transaction-runner';
import { ConversationTransactionalRepositories } from '../../../../application/ports/ai-conversation-transaction-runner.port';
import { CreateConversationWithInitialTurnUseCase } from '../../../../application/use-cases/create-conversation-with-initial-turn.use-case';
import { ReserveConversationTurnUseCase } from '../../../../application/use-cases/reserve-conversation-turn.use-case';
import {
  DuplicateClientTurnPayloadMismatchError,
  TurnAlreadyInProgressError,
  ConversationNotFoundError,
} from '../../../../application/errors/ai-conversation-application.error';
import { TurnStatus } from '../../../../domain/enums/turn-status.enum';

describe('AI-09.3-BE.04.03 — ReserveConversationTurnUseCase PostgreSQL Integration Tests', () => {
  let prisma: PrismaClient;
  let convRepo: PrismaAiConversationRepository;
  let turnRepo: PrismaAiConversationTurnRepository;
  let messageRepo: PrismaAiConversationMessageRepository;
  let auditRepo: PrismaAiConversationAuditRepository;
  let txRunner: PrismaAiConversationTransactionRunner;
  let createUseCase: CreateConversationWithInitialTurnUseCase;
  let reserveUseCase: ReserveConversationTurnUseCase;
  let isDbAvailable = false;

  const testTenant = `tenant_reserve_test_${Date.now()}`;
  const testTenantB = `tenant_reserve_b_${Date.now()}`;
  const testUserId = `user_reserve_test_${Date.now()}`;

  beforeAll(async () => {
    prisma = new PrismaClient();
    try {
      await prisma.$connect();
      await prisma.$queryRawUnsafe('SELECT 1');
      isDbAvailable = true;

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

      createUseCase = new CreateConversationWithInitialTurnUseCase(
        txRunner,
        turnRepo,
        convRepo,
        messageRepo,
      );
      reserveUseCase = new ReserveConversationTurnUseCase(
        txRunner,
        turnRepo,
        convRepo,
        messageRepo,
      );
    } catch (err) {
      isDbAvailable = false;
      console.warn('Database not available for integration tests; skipping.', err);
    }
  });

  afterAll(async () => {
    if (isDbAvailable && prisma) {
      await prisma.aiConversationAuditLog.deleteMany({
        where: { tenantId: { in: [testTenant, testTenantB] } },
      });
      await prisma.aiConversationMessage.deleteMany({
        where: { tenantId: { in: [testTenant, testTenantB] } },
      });
      await prisma.aiConversationTurn.deleteMany({
        where: { tenantId: { in: [testTenant, testTenantB] } },
      });
      await prisma.aiConversation.deleteMany({
        where: { tenantId: { in: [testTenant, testTenantB] } },
      });
      await prisma.$disconnect();
    }
  });

  /**
   * Helper to set up a clean conversation with Turn 1 in terminal COMPLETED status.
   */
  async function createCompletedConversation(prompt = 'Initial consultation prompt'): Promise<{
    conversationId: string;
    turn1Id: string;
  }> {
    const initRes = await createUseCase.execute({
      tenantId: testTenant,
      userId: testUserId,
      clientTurnId: `ct_init_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      userPrompt: prompt,
    });

    // Finalize Turn 1 assistant placeholder to SUCCESS and isCanonical = true
    await prisma.aiConversationMessage.update({
      where: { id: initRes.assistantAttemptId },
      data: {
        status: 'SUCCESS',
        isCanonical: true,
        content: 'Completed answer for initial question.',
        completedAt: new Date(),
      },
    });

    // Mark Turn 1 as COMPLETED
    await prisma.aiConversationTurn.update({
      where: { id: initRes.turnId },
      data: {
        status: 'COMPLETED',
        completedAt: new Date(),
      },
    });

    return { conversationId: initRes.conversationId, turn1Id: initRes.turnId };
  }

  it('should successfully reserve Turn 2 with atomic turn and message sequence allocation', async () => {
    if (!isDbAvailable) return;

    const { conversationId } = await createCompletedConversation();
    const clientTurnId = `ct_turn2_${Date.now()}`;
    const userPrompt = 'How should I progress my shoulder external rotation exercises?';

    const result = await reserveUseCase.execute({
      tenantId: testTenant,
      userId: testUserId,
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

    // Verify raw PostgreSQL state
    const dbConv = await prisma.aiConversation.findUnique({
      where: { id: conversationId },
    });
    expect(dbConv?.turnCounter).toBe(2);
    expect(dbConv?.messageCounter).toBe(4);

    const dbTurn = await prisma.aiConversationTurn.findUnique({
      where: { id: result.turnId },
    });
    expect(dbTurn?.turnIndex).toBe(2);
    expect(dbTurn?.status).toBe('PENDING');
    expect(dbTurn?.activeAttemptId).toBe(result.assistantAttemptId);

    const dbMessages = await prisma.aiConversationMessage.findMany({
      where: { turnId: result.turnId },
      orderBy: { sequenceNumber: 'asc' },
    });
    expect(dbMessages).toHaveLength(2);

    const [userMsg, assistantMsg] = dbMessages;
    expect(userMsg).toBeDefined();
    expect(assistantMsg).toBeDefined();

    expect(userMsg?.sequenceNumber).toBe(3);
    expect(userMsg?.role).toBe('USER');
    expect(userMsg?.status).toBe('SUCCESS');
    expect(userMsg?.content).toBe(userPrompt);

    expect(assistantMsg?.sequenceNumber).toBe(4);
    expect(assistantMsg?.role).toBe('ASSISTANT');
    expect(assistantMsg?.status).toBe('PENDING');
    expect(assistantMsg?.isCanonical).toBe(false);
  });

  it('should roll back all records and leave zero orphan records if an intermediate operation fails', async () => {
    if (!isDbAvailable) return;

    const { conversationId } = await createCompletedConversation();
    const failingClientTurnId = `ct_fail_sub_${Date.now()}`;

    // Failing transaction runner that injects error on message save
    const failingTxRunner = {
      runInTransaction: async <T>(
        work: (repos: ConversationTransactionalRepositories) => Promise<T>,
      ): Promise<T> => {
        return prisma.$transaction(async (tx) => {
          const transactionalMessageRepo = messageRepo.withTransaction(tx);
          jest.spyOn(transactionalMessageRepo, 'save').mockImplementation(async () => {
            throw new Error('Simulated failure during message creation');
          });

          const repos: ConversationTransactionalRepositories = {
            conversationRepo: convRepo.withTransaction(tx),
            turnRepo: turnRepo.withTransaction(tx),
            messageRepo: transactionalMessageRepo,
            auditRepo: auditRepo.withTransaction(tx),
          };
          return work(repos);
        });
      },
    };

    const failingUseCase = new ReserveConversationTurnUseCase(
      failingTxRunner,
      turnRepo,
      convRepo,
      messageRepo,
    );

    await expect(
      failingUseCase.execute({
        tenantId: testTenant,
        userId: testUserId,
        conversationId,
        clientTurnId: failingClientTurnId,
        userPrompt: 'This reservation must roll back',
      }),
    ).rejects.toThrow('Simulated failure during message creation');

    // Verify zero orphaned turns or messages created in PostgreSQL
    const orphanTurn = await prisma.aiConversationTurn.findFirst({
      where: {
        tenantId: testTenant,
        clientTurnId: failingClientTurnId,
      },
    });
    expect(orphanTurn).toBeNull();

    // Verify conversation counters were NOT incremented
    const dbConv = await prisma.aiConversation.findUnique({
      where: { id: conversationId },
    });
    expect(dbConv?.turnCounter).toBe(1);
    expect(dbConv?.messageCounter).toBe(2);
  });

  it('should return existing turn on replay with identical clientTurnId and matching payload', async () => {
    if (!isDbAvailable) return;

    const { conversationId } = await createCompletedConversation();
    const clientTurnId = `ct_replay_${Date.now()}`;
    const userPrompt = 'Is isometric training suitable for patellar tendinopathy?';

    // First attempt
    const firstRes = await reserveUseCase.execute({
      tenantId: testTenant,
      userId: testUserId,
      conversationId,
      clientTurnId,
      userPrompt,
    });
    expect(firstRes.isIdempotentReplay).toBe(false);
    expect(firstRes.idempotencyOutcome).toBe('CREATED');

    // Second attempt with whitespace variance (must resolve to same hash)
    const secondRes = await reserveUseCase.execute({
      tenantId: testTenant,
      userId: testUserId,
      conversationId,
      clientTurnId,
      userPrompt: `  ${userPrompt}  \r\n`,
    });

    expect(secondRes.isIdempotentReplay).toBe(true);
    expect(secondRes.idempotencyOutcome).toBe('EXISTING_RECOVERED');
    expect(secondRes.turnId).toBe(firstRes.turnId);
    expect(secondRes.userMessageId).toBe(firstRes.userMessageId);
    expect(secondRes.assistantAttemptId).toBe(firstRes.assistantAttemptId);

    // Verify database has exactly 2 turns total (Turn 1 and Turn 2)
    const turnCount = await prisma.aiConversationTurn.count({
      where: { conversationId },
    });
    expect(turnCount).toBe(2);
  });

  it('should throw DuplicateClientTurnPayloadMismatchError when clientTurnId is reused with a different payload', async () => {
    if (!isDbAvailable) return;

    const { conversationId } = await createCompletedConversation();
    const clientTurnId = `ct_diff_payload_${Date.now()}`;

    // First attempt
    await reserveUseCase.execute({
      tenantId: testTenant,
      userId: testUserId,
      conversationId,
      clientTurnId,
      userPrompt: 'Original question about thoracic extension drills.',
    });

    // Second attempt with different prompt
    await expect(
      reserveUseCase.execute({
        tenantId: testTenant,
        userId: testUserId,
        conversationId,
        clientTurnId,
        userPrompt: 'Altered question violating turn idempotency contract.',
      }),
    ).rejects.toThrow(DuplicateClientTurnPayloadMismatchError);
  });

  it('should safely arbitrate two concurrent requests with the SAME clientTurnId using PostgreSQL unique constraints', async () => {
    if (!isDbAvailable) return;

    const { conversationId } = await createCompletedConversation();
    const concurrentSameKey = `ct_same_key_${Date.now()}`;
    const prompt = 'How do hip abductor deficits influence knee valgus in jump landings?';

    const clientA = new PrismaClient();
    const clientB = new PrismaClient();
    await Promise.all([clientA.$connect(), clientB.$connect()]);

    const txRunnerA = new PrismaAiConversationTransactionRunner(
      clientA,
      new PrismaAiConversationRepository(clientA),
      new PrismaAiConversationTurnRepository(clientA),
      new PrismaAiConversationMessageRepository(clientA),
      new PrismaAiConversationAuditRepository(clientA),
    );
    const useCaseA = new ReserveConversationTurnUseCase(
      txRunnerA,
      new PrismaAiConversationTurnRepository(clientA),
      new PrismaAiConversationRepository(clientA),
      new PrismaAiConversationMessageRepository(clientA),
    );

    const txRunnerB = new PrismaAiConversationTransactionRunner(
      clientB,
      new PrismaAiConversationRepository(clientB),
      new PrismaAiConversationTurnRepository(clientB),
      new PrismaAiConversationMessageRepository(clientB),
      new PrismaAiConversationAuditRepository(clientB),
    );
    const useCaseB = new ReserveConversationTurnUseCase(
      txRunnerB,
      new PrismaAiConversationTurnRepository(clientB),
      new PrismaAiConversationRepository(clientB),
      new PrismaAiConversationMessageRepository(clientB),
    );

    try {
      const [resA, resB] = await Promise.all([
        useCaseA.execute({
          tenantId: testTenant,
          userId: testUserId,
          conversationId,
          clientTurnId: concurrentSameKey,
          userPrompt: prompt,
        }),
        useCaseB.execute({
          tenantId: testTenant,
          userId: testUserId,
          conversationId,
          clientTurnId: concurrentSameKey,
          userPrompt: prompt,
        }),
      ]);

      expect(resA.conversationId).toBe(resB.conversationId);
      expect(resA.turnId).toBe(resB.turnId);

      const outcomes = [resA.idempotencyOutcome, resB.idempotencyOutcome].sort();
      expect(outcomes).toEqual(['CREATED', 'EXISTING_RECOVERED']);

      // Raw DB validation: exactly one turn exists with this clientTurnId
      const count = await prisma.aiConversationTurn.count({
        where: {
          tenantId: testTenant,
          clientTurnId: concurrentSameKey,
        },
      });
      expect(count).toBe(1);
    } finally {
      await Promise.all([clientA.$disconnect(), clientB.$disconnect()]);
    }
  });

  it('should enforce one active generation per conversation and reject competing reservations with no orphaned records', async () => {
    if (!isDbAvailable) return;

    const { conversationId } = await createCompletedConversation();
    const keyA = `ct_compete_a_${Date.now()}`;
    const keyB = `ct_compete_b_${Date.now()}`;
    const promptA = 'Competing reservation request A';
    const promptB = 'Competing reservation request B';

    const clientA = new PrismaClient();
    const clientB = new PrismaClient();
    await Promise.all([clientA.$connect(), clientB.$connect()]);

    const txRunnerA = new PrismaAiConversationTransactionRunner(
      clientA,
      new PrismaAiConversationRepository(clientA),
      new PrismaAiConversationTurnRepository(clientA),
      new PrismaAiConversationMessageRepository(clientA),
      new PrismaAiConversationAuditRepository(clientA),
    );
    const useCaseA = new ReserveConversationTurnUseCase(
      txRunnerA,
      new PrismaAiConversationTurnRepository(clientA),
      new PrismaAiConversationRepository(clientA),
      new PrismaAiConversationMessageRepository(clientA),
    );

    const txRunnerB = new PrismaAiConversationTransactionRunner(
      clientB,
      new PrismaAiConversationRepository(clientB),
      new PrismaAiConversationTurnRepository(clientB),
      new PrismaAiConversationMessageRepository(clientB),
      new PrismaAiConversationAuditRepository(clientB),
    );
    const useCaseB = new ReserveConversationTurnUseCase(
      txRunnerB,
      new PrismaAiConversationTurnRepository(clientB),
      new PrismaAiConversationRepository(clientB),
      new PrismaAiConversationMessageRepository(clientB),
    );

    try {
      // Fire two competing requests with DIFFERENT client turn IDs concurrently on the same conversation
      const [outcomeA, outcomeB] = await Promise.allSettled([
        useCaseA.execute({
          tenantId: testTenant,
          userId: testUserId,
          conversationId,
          clientTurnId: keyA,
          userPrompt: promptA,
        }),
        useCaseB.execute({
          tenantId: testTenant,
          userId: testUserId,
          conversationId,
          clientTurnId: keyB,
          userPrompt: promptB,
        }),
      ]);

      // Exactly ONE must succeed and ONE must reject with TurnAlreadyInProgressError
      const fulfilled = [outcomeA, outcomeB].filter((o) => o.status === 'fulfilled');
      const rejected = [outcomeA, outcomeB].filter((o) => o.status === 'rejected');

      expect(fulfilled).toHaveLength(1);
      expect(rejected).toHaveLength(1);

      const rejectedReason = (rejected[0] as PromiseRejectedResult).reason;
      expect(rejectedReason).toBeInstanceOf(TurnAlreadyInProgressError);

      // Verify PostgreSQL state: exactly ONE active turn exists in the conversation
      const activeTurns = await prisma.aiConversationTurn.findMany({
        where: {
          conversationId,
          status: { in: ['PENDING', 'STREAMING'] },
        },
      });
      expect(activeTurns).toHaveLength(1);

      // Verify that NO orphaned turn or message from the loser was committed
      const winningTurn = activeTurns[0];
      expect(winningTurn).toBeDefined();
      if (!winningTurn) throw new Error('Expected winning turn to be defined');
      const losingKey = winningTurn.clientTurnId === keyA ? keyB : keyA;

      const orphanTurn = await prisma.aiConversationTurn.findFirst({
        where: {
          tenantId: testTenant,
          clientTurnId: losingKey,
        },
      });
      expect(orphanTurn).toBeNull();
    } finally {
      await Promise.all([clientA.$disconnect(), clientB.$disconnect()]);
    }
  });

  it('should reject turn reservation across tenant boundaries (tenant isolation)', async () => {
    if (!isDbAvailable) return;

    const { conversationId } = await createCompletedConversation();
    const clientTurnId = `ct_cross_tenant_${Date.now()}`;

    await expect(
      reserveUseCase.execute({
        tenantId: testTenantB, // Attempting to access Tenant A's conversation from Tenant B
        userId: `user_b_${Date.now()}`,
        conversationId,
        clientTurnId,
        userPrompt: 'Cross tenant attack prompt',
      }),
    ).rejects.toThrow(ConversationNotFoundError);
  });
});
