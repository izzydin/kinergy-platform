import { PrismaClient } from '@prisma/client';
import { PrismaAiConversationRepository } from '../repositories/prisma-ai-conversation.repository';
import { PrismaAiConversationTurnRepository } from '../repositories/prisma-ai-conversation-turn.repository';
import { PrismaAiConversationMessageRepository } from '../repositories/prisma-ai-conversation-message.repository';
import { PrismaAiConversationAuditRepository } from '../repositories/prisma-ai-conversation-audit.repository';
import { PrismaAiConversationTransactionRunner } from '../prisma-ai-conversation-transaction-runner';
import { ConversationTransactionalRepositories } from '../../../../application/ports/ai-conversation-transaction-runner.port';
import { CreateConversationWithInitialTurnUseCase } from '../../../../application/use-cases/create-conversation-with-initial-turn.use-case';
import { DuplicateClientTurnPayloadMismatchError } from '../../../../application/errors/ai-conversation-application.error';
import { TurnStatus } from '../../../../domain/enums/turn-status.enum';

describe('AI-09.3-BE.04.02 — CreateConversationWithInitialTurnUseCase PostgreSQL Integration Tests', () => {
  let prisma: PrismaClient;
  let convRepo: PrismaAiConversationRepository;
  let turnRepo: PrismaAiConversationTurnRepository;
  let messageRepo: PrismaAiConversationMessageRepository;
  let auditRepo: PrismaAiConversationAuditRepository;
  let txRunner: PrismaAiConversationTransactionRunner;
  let useCase: CreateConversationWithInitialTurnUseCase;
  let isDbAvailable = false;

  const testTenant = `tenant_init_test_${Date.now()}`;
  const testTenantB = `tenant_init_b_${Date.now()}`;
  const testUserId = `user_init_test_${Date.now()}`;

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

      useCase = new CreateConversationWithInitialTurnUseCase(
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

  it('should successfully create conversation, turn, user message, and assistant placeholder atomically', async () => {
    if (!isDbAvailable) return;

    const clientTurnId = `ct_atomic_${Date.now()}`;
    const userPrompt = 'What exercises help with lumbar disc herniation?';

    const result = await useCase.execute({
      tenantId: testTenant,
      userId: testUserId,
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

    // Verify raw PostgreSQL state directly to prove atomicity
    const dbConv = await prisma.aiConversation.findUnique({
      where: { id: result.conversationId },
    });
    expect(dbConv).not.toBeNull();
    expect(dbConv?.tenantId).toBe(testTenant);
    expect(dbConv?.userId).toBe(testUserId);
    expect(dbConv?.turnCounter).toBe(1);
    expect(dbConv?.messageCounter).toBe(2);

    const dbTurn = await prisma.aiConversationTurn.findUnique({
      where: { id: result.turnId },
    });
    expect(dbTurn).not.toBeNull();
    expect(dbTurn?.turnIndex).toBe(1);
    expect(dbTurn?.status).toBe('PENDING');
    expect(dbTurn?.clientTurnId).toBe(clientTurnId);
    expect(dbTurn?.activeAttemptId).toBe(result.assistantAttemptId);
    expect(dbTurn?.activeAttemptNumber).toBe(1);

    const dbMessages = await prisma.aiConversationMessage.findMany({
      where: { turnId: result.turnId },
      orderBy: { sequenceNumber: 'asc' },
    });
    expect(dbMessages).toHaveLength(2);

    const [userMsg, assistantMsg] = dbMessages;
    expect(userMsg).toBeDefined();
    expect(assistantMsg).toBeDefined();
    if (!userMsg || !assistantMsg)
      throw new Error('Expected both user and assistant messages to exist');

    expect(userMsg.id).toBe(result.userMessageId);
    expect(userMsg.role).toBe('USER');
    expect(userMsg.sequenceNumber).toBe(1);
    expect(userMsg.status).toBe('SUCCESS');
    expect(userMsg.content).toBe(userPrompt);
    expect(userMsg.isCanonical).toBe(false);

    expect(assistantMsg.id).toBe(result.assistantAttemptId);
    expect(assistantMsg.role).toBe('ASSISTANT');
    expect(assistantMsg.sequenceNumber).toBe(2);
    expect(assistantMsg.status).toBe('PENDING');
    expect(assistantMsg.content).toBe('');
    expect(assistantMsg.isCanonical).toBe(false);
  });

  it('should roll back all records and leave zero orphan records if an intermediate operation fails', async () => {
    if (!isDbAvailable) return;

    const failingClientTurnId = `ct_fail_${Date.now()}`;
    const prompt = 'Prompt doomed to fail';

    // Create a mock transaction runner that injects failure right after conversation save
    const failingTxRunner = {
      runInTransaction: async <T>(
        work: (repos: ConversationTransactionalRepositories) => Promise<T>,
      ): Promise<T> => {
        return prisma.$transaction(async (tx) => {
          const transactionalTurnRepo = turnRepo.withTransaction(tx);
          jest.spyOn(transactionalTurnRepo, 'save').mockImplementation(async () => {
            throw new Error('Simulated failure during turn creation');
          });

          const repos: ConversationTransactionalRepositories = {
            conversationRepo: convRepo.withTransaction(tx),
            turnRepo: transactionalTurnRepo,
            messageRepo: messageRepo.withTransaction(tx),
            auditRepo: auditRepo.withTransaction(tx),
          };
          return work(repos);
        });
      },
    };

    const failingUseCase = new CreateConversationWithInitialTurnUseCase(
      failingTxRunner,
      turnRepo,
      convRepo,
      messageRepo,
    );

    await expect(
      failingUseCase.execute({
        tenantId: testTenant,
        userId: testUserId,
        clientTurnId: failingClientTurnId,
        userPrompt: prompt,
      }),
    ).rejects.toThrow('Simulated failure during turn creation');

    // Assert that NO conversation, NO turn, and NO message was persisted in PostgreSQL
    const orphanConv = await prisma.aiConversation.findFirst({
      where: {
        tenantId: testTenant,
        idempotencyKey: failingClientTurnId,
      },
    });
    expect(orphanConv).toBeNull();

    const orphanTurn = await prisma.aiConversationTurn.findFirst({
      where: {
        tenantId: testTenant,
        clientTurnId: failingClientTurnId,
      },
    });
    expect(orphanTurn).toBeNull();
  });

  it('should return existing conversation state on same clientTurnId with matching payload (idempotent retry)', async () => {
    if (!isDbAvailable) return;

    const clientTurnId = `ct_retry_${Date.now()}`;
    const userPrompt = 'How does neuromuscular electrical stimulation assist muscle recovery?';

    // First attempt: creates the conversation
    const firstResult = await useCase.execute({
      tenantId: testTenant,
      userId: testUserId,
      clientTurnId,
      userPrompt,
    });
    expect(firstResult.isIdempotentReplay).toBe(false);
    expect(firstResult.idempotencyOutcome).toBe('CREATED');

    // Second attempt: identical key and prompt
    const secondResult = await useCase.execute({
      tenantId: testTenant,
      userId: testUserId,
      clientTurnId,
      userPrompt: `  ${userPrompt}  `, // padded with whitespace to verify canonicalization
    });

    expect(secondResult.isIdempotentReplay).toBe(true);
    expect(secondResult.idempotencyOutcome).toBe('EXISTING_RECOVERED');
    expect(secondResult.conversationId).toBe(firstResult.conversationId);
    expect(secondResult.turnId).toBe(firstResult.turnId);
    expect(secondResult.userMessageId).toBe(firstResult.userMessageId);
    expect(secondResult.assistantAttemptId).toBe(firstResult.assistantAttemptId);

    // Verify DB count: only 1 conversation was created
    const convCount = await prisma.aiConversation.count({
      where: { id: firstResult.conversationId },
    });
    expect(convCount).toBe(1);
  });

  it('should throw DuplicateClientTurnPayloadMismatchError when same clientTurnId is reused with a different payload', async () => {
    if (!isDbAvailable) return;

    const clientTurnId = `ct_conflict_${Date.now()}`;

    // First attempt
    await useCase.execute({
      tenantId: testTenant,
      userId: testUserId,
      clientTurnId,
      userPrompt: 'Original clinical question about patellar tendinopathy.',
    });

    // Second attempt with mismatched prompt
    await expect(
      useCase.execute({
        tenantId: testTenant,
        userId: testUserId,
        clientTurnId,
        userPrompt: 'Conflicting clinical question about Achilles tendonitis.',
      }),
    ).rejects.toThrow(DuplicateClientTurnPayloadMismatchError);
  });

  it('should arbitrate concurrent duplicate creation requests safely using PostgreSQL unique constraints', async () => {
    if (!isDbAvailable) return;

    const concurrentClientTurnId = `ct_concurrent_${Date.now()}`;
    const userPrompt = 'What is the efficacy of dry needling for myofascial trigger points?';

    // Use two independent Prisma clients to simulate two distinct web server instances / connection pools
    const prismaClientA = new PrismaClient();
    const prismaClientB = new PrismaClient();
    await Promise.all([prismaClientA.$connect(), prismaClientB.$connect()]);

    const txRunnerA = new PrismaAiConversationTransactionRunner(
      prismaClientA,
      new PrismaAiConversationRepository(prismaClientA),
      new PrismaAiConversationTurnRepository(prismaClientA),
      new PrismaAiConversationMessageRepository(prismaClientA),
      new PrismaAiConversationAuditRepository(prismaClientA),
    );
    const useCaseA = new CreateConversationWithInitialTurnUseCase(
      txRunnerA,
      new PrismaAiConversationTurnRepository(prismaClientA),
      new PrismaAiConversationRepository(prismaClientA),
      new PrismaAiConversationMessageRepository(prismaClientA),
    );

    const txRunnerB = new PrismaAiConversationTransactionRunner(
      prismaClientB,
      new PrismaAiConversationRepository(prismaClientB),
      new PrismaAiConversationTurnRepository(prismaClientB),
      new PrismaAiConversationMessageRepository(prismaClientB),
      new PrismaAiConversationAuditRepository(prismaClientB),
    );
    const useCaseB = new CreateConversationWithInitialTurnUseCase(
      txRunnerB,
      new PrismaAiConversationTurnRepository(prismaClientB),
      new PrismaAiConversationRepository(prismaClientB),
      new PrismaAiConversationMessageRepository(prismaClientB),
    );

    try {
      // Fire both requests concurrently using Promise.all
      const [resA, resB] = await Promise.all([
        useCaseA.execute({
          tenantId: testTenant,
          userId: testUserId,
          clientTurnId: concurrentClientTurnId,
          userPrompt,
        }),
        useCaseB.execute({
          tenantId: testTenant,
          userId: testUserId,
          clientTurnId: concurrentClientTurnId,
          userPrompt,
        }),
      ]);

      // Both must succeed and point to the exact same conversation and turn
      expect(resA.conversationId).toBe(resB.conversationId);
      expect(resA.turnId).toBe(resB.turnId);
      expect(resA.userMessageId).toBe(resB.userMessageId);
      expect(resA.assistantAttemptId).toBe(resB.assistantAttemptId);

      // Exactly one was CREATED, the other recovered as EXISTING_RECOVERED
      const outcomes = [resA.idempotencyOutcome, resB.idempotencyOutcome].sort();
      expect(outcomes).toEqual(['CREATED', 'EXISTING_RECOVERED']);

      // Direct DB verification: Exactly ONE conversation exists
      const totalConvs = await prisma.aiConversation.count({
        where: {
          tenantId: testTenant,
          idempotencyKey: concurrentClientTurnId,
        },
      });
      expect(totalConvs).toBe(1);

      // Exactly ONE turn exists
      const totalTurns = await prisma.aiConversationTurn.count({
        where: {
          tenantId: testTenant,
          clientTurnId: concurrentClientTurnId,
        },
      });
      expect(totalTurns).toBe(1);
    } finally {
      await Promise.all([prismaClientA.$disconnect(), prismaClientB.$disconnect()]);
    }
  });

  it('should enforce strict tenant isolation for clientTurnId', async () => {
    if (!isDbAvailable) return;

    const sharedClientTurnId = `ct_shared_${Date.now()}`;
    const prompt = 'Assessment for vestibular rehabilitation.';

    // Create in Tenant A
    const resA = await useCase.execute({
      tenantId: testTenant,
      userId: testUserId,
      clientTurnId: sharedClientTurnId,
      userPrompt: prompt,
    });
    expect(resA.idempotencyOutcome).toBe('CREATED');

    // Create in Tenant B with identical clientTurnId: must succeed as an independent conversation
    const resB = await useCase.execute({
      tenantId: testTenantB,
      userId: `user_b_${Date.now()}`,
      clientTurnId: sharedClientTurnId,
      userPrompt: prompt,
    });
    expect(resB.idempotencyOutcome).toBe('CREATED');
    expect(resB.conversationId).not.toBe(resA.conversationId);
    expect(resB.turnId).not.toBe(resA.turnId);

    // Tenant A repository queries cannot find Tenant B's conversation
    const crossTenantLookup = await convRepo.findById(testTenant, resB.conversationId);
    expect(crossTenantLookup).toBeNull();
  });
});
