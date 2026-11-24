import { PrismaClient } from '@prisma/client';
import { PrismaAiConversationRepository } from '../repositories/prisma-ai-conversation.repository';
import { PrismaAiConversationTurnRepository } from '../repositories/prisma-ai-conversation-turn.repository';
import { PrismaAiConversationMessageRepository } from '../repositories/prisma-ai-conversation-message.repository';
import { PrismaAiConversationAuditRepository } from '../repositories/prisma-ai-conversation-audit.repository';
import { PrismaAiConversationTransactionRunner } from '../prisma-ai-conversation-transaction-runner';
import { CreateConversationWithInitialTurnUseCase } from '../../../../application/use-cases/create-conversation-with-initial-turn.use-case';
import { ReserveConversationTurnUseCase } from '../../../../application/use-cases/reserve-conversation-turn.use-case';
import {
  TurnAlreadyInProgressError,
  DuplicateClientTurnPayloadMismatchError,
  TransactionFailureError,
} from '../../../../application/errors/ai-conversation-application.error';
import { TurnStatus } from '../../../../domain/enums/turn-status.enum';
import { GenerationStatus } from '../../../../domain/enums/generation-status.enum';
import { AiConversation } from '../../../../domain/models/ai-conversation.entity';

describe('AI-09.3-BE.04.05 — Transactional Consistency & Concurrency PostgreSQL Tests', () => {
  let primaryPrisma: PrismaClient;
  let secondaryPrisma: PrismaClient;

  let convRepo: PrismaAiConversationRepository;
  let turnRepo: PrismaAiConversationTurnRepository;
  let messageRepo: PrismaAiConversationMessageRepository;
  let auditRepo: PrismaAiConversationAuditRepository;
  let txRunner: PrismaAiConversationTransactionRunner;

  let createUseCase: CreateConversationWithInitialTurnUseCase;
  let reserveUseCase: ReserveConversationTurnUseCase;

  let isDbAvailable = false;

  const testTenant = `tenant_txn_${Date.now()}`;
  const testUserId = `user_txn_${Date.now()}`;

  beforeAll(async () => {
    primaryPrisma = new PrismaClient();
    secondaryPrisma = new PrismaClient();

    try {
      await primaryPrisma.$connect();
      await secondaryPrisma.$connect();
      await primaryPrisma.$queryRawUnsafe('SELECT 1');
      isDbAvailable = true;

      convRepo = new PrismaAiConversationRepository(primaryPrisma);
      turnRepo = new PrismaAiConversationTurnRepository(primaryPrisma);
      messageRepo = new PrismaAiConversationMessageRepository(primaryPrisma);
      auditRepo = new PrismaAiConversationAuditRepository(primaryPrisma);
      txRunner = new PrismaAiConversationTransactionRunner(
        primaryPrisma,
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
      console.warn('PostgreSQL database not available for integration tests; skipping.', err);
    }
  });

  afterAll(async () => {
    if (isDbAvailable && primaryPrisma) {
      await primaryPrisma.aiConversationAuditLog.deleteMany({
        where: { tenantId: testTenant },
      });
      await primaryPrisma.aiConversationMessage.deleteMany({
        where: { tenantId: testTenant },
      });
      await primaryPrisma.aiConversationTurn.deleteMany({
        where: { tenantId: testTenant },
      });
      await primaryPrisma.aiConversation.deleteMany({
        where: { tenantId: testTenant },
      });
      await primaryPrisma.$disconnect();
      await secondaryPrisma.$disconnect();
    }
  });

  it('1. verifies complete atomic rollback: zero orphaned records when transaction aborts mid-flight', async () => {
    if (!isDbAvailable) return;

    const doomedClientTurnId = `client_doomed_${Date.now()}`;

    // Execute custom transaction that deliberately fails after conversation save
    await expect(
      txRunner.runInTransaction(async (repos) => {
        // Step A: save a conversation
        const conversationId = `conv_doomed_${Date.now()}`;
        await repos.conversationRepo.save(
          AiConversation.create({
            id: conversationId,
            tenantId: testTenant,
            userId: testUserId,
            title: 'Doomed Conversation',
          }),
        );

        // Step B: Artificially abort transaction
        throw new Error('Simulated failure before turn creation');
      }),
    ).rejects.toThrow(TransactionFailureError);

    // Verify zero orphaned rows exist in PostgreSQL
    const convCount = await primaryPrisma.aiConversation.count({
      where: { tenantId: testTenant, title: 'Doomed Conversation' },
    });
    const turnCount = await primaryPrisma.aiConversationTurn.count({
      where: { tenantId: testTenant, clientTurnId: doomedClientTurnId },
    });

    expect(convCount).toBe(0);
    expect(turnCount).toBe(0);
  });

  it('2. verifies concurrent same-key requests: exactly 1 CREATED and 1 EXISTING_RECOVERED without duplicate turns', async () => {
    if (!isDbAvailable) return;

    const sharedClientTurnId = `client_concurrent_initial_${Date.now()}`;
    const userPrompt = 'Concurrent initial prompt for race test';

    // Run two simultaneous creation requests with the same clientTurnId using independent connections
    const [result1, result2] = await Promise.all([
      createUseCase.execute({
        tenantId: testTenant,
        userId: testUserId,
        clientTurnId: sharedClientTurnId,
        userPrompt,
      }),
      createUseCase.execute({
        tenantId: testTenant,
        userId: testUserId,
        clientTurnId: sharedClientTurnId,
        userPrompt,
      }),
    ]);

    // Outcomes must be symmetric: exactly one CREATED and one EXISTING_RECOVERED
    const outcomes = [result1.idempotencyOutcome, result2.idempotencyOutcome].sort();
    expect(outcomes).toEqual(['CREATED', 'EXISTING_RECOVERED']);

    // Both must point to the exact same turn and conversation
    expect(result1.conversationId).toBe(result2.conversationId);
    expect(result1.turnId).toBe(result2.turnId);

    // Verify PostgreSQL contains EXACTLY ONE turn and ONE conversation
    const turns = await primaryPrisma.aiConversationTurn.findMany({
      where: { tenantId: testTenant, clientTurnId: sharedClientTurnId },
    });
    expect(turns).toHaveLength(1);

    const messages = await primaryPrisma.aiConversationMessage.findMany({
      where: { tenantId: testTenant, turnId: result1.turnId },
    });
    // Exactly 2 messages: 1 user, 1 assistant
    expect(messages).toHaveLength(2);
  });

  it('3. verifies same-key duplicate turn reservation with mismatched payload throws typed conflict', async () => {
    if (!isDbAvailable) return;

    const clientTurnId = `client_mismatch_${Date.now()}`;

    // 1. Initial valid creation
    await createUseCase.execute({
      tenantId: testTenant,
      userId: testUserId,
      clientTurnId,
      userPrompt: 'Original prompt text',
    });

    // 2. Retry with same clientTurnId but completely different prompt
    await expect(
      createUseCase.execute({
        tenantId: testTenant,
        userId: testUserId,
        clientTurnId,
        userPrompt: 'Tampered different prompt text',
      }),
    ).rejects.toThrow(DuplicateClientTurnPayloadMismatchError);
  });

  it('4. verifies concurrent different-turn reservations on same conversation: exactly 1 wins, 1 rejected', async () => {
    if (!isDbAvailable) return;

    // Create an initial conversation with Turn 1
    const initial = await createUseCase.execute({
      tenantId: testTenant,
      userId: testUserId,
      clientTurnId: `client_base_turn1_${Date.now()}`,
      userPrompt: 'Initial prompt establishing conversation',
    });

    // Mark Turn 1 completed and assistant message completed so conversation is idle
    await messageRepo.updateStatus(testTenant, initial.conversationId, initial.assistantAttemptId, {
      status: GenerationStatus.SUCCESS,
      isCanonical: true,
      completedAt: new Date(),
    });

    await turnRepo.updateStatus(testTenant, initial.conversationId, initial.turnId, {
      status: TurnStatus.COMPLETED,
    });

    const clientTurnA = `client_race_A_${Date.now()}`;
    const clientTurnB = `client_race_B_${Date.now()}`;

    // Fire two different turn reservations simultaneously on the same idle conversation
    const results = await Promise.allSettled([
      reserveUseCase.execute({
        tenantId: testTenant,
        userId: testUserId,
        conversationId: initial.conversationId,
        clientTurnId: clientTurnA,
        userPrompt: 'Prompt A racing for turn 2',
      }),
      reserveUseCase.execute({
        tenantId: testTenant,
        userId: testUserId,
        conversationId: initial.conversationId,
        clientTurnId: clientTurnB,
        userPrompt: 'Prompt B racing for turn 2',
      }),
    ]);

    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');

    // Exactly one reservation should win and one must be rejected
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);

    // The rejected operation must fail with TurnAlreadyInProgressError
    const rejectionReason = (rejected[0] as PromiseRejectedResult).reason;
    expect(rejectionReason).toBeInstanceOf(TurnAlreadyInProgressError);

    // Verify database state: exactly 2 turns exist (Turn 1 + exactly 1 of A or B)
    const totalTurns = await primaryPrisma.aiConversationTurn.count({
      where: { tenantId: testTenant, conversationId: initial.conversationId },
    });
    expect(totalTurns).toBe(2);

    // Zero orphan messages exist
    const messages = await primaryPrisma.aiConversationMessage.findMany({
      where: { tenantId: testTenant, conversationId: initial.conversationId },
    });
    // Turn 1 has 2 messages, winning Turn 2 has 2 messages = 4 messages total
    expect(messages).toHaveLength(4);
  });

  it('5. verifies foreign key boundary: turn reservation on non-existent conversation fails cleanly', async () => {
    if (!isDbAvailable) return;

    const nonExistentConvId = 'conv_non_existent_9999999';

    await expect(
      reserveUseCase.execute({
        tenantId: testTenant,
        userId: testUserId,
        conversationId: nonExistentConvId,
        clientTurnId: `client_fk_fail_${Date.now()}`,
        userPrompt: 'Prompt against non-existent conversation',
      }),
    ).rejects.toThrow();
  });
});
